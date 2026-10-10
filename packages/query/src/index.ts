// Mongo-style filters -> SQL against the `docs` table (see @tin/format SCHEMA_SQL).
// Pure functions: no DB access, no string-built SQL from user input. Every
// value, including JSON paths, goes through a bound parameter.

export type Filter = Record<string, unknown>;
export type Sort = Record<string, 1 | -1>;
export interface FindOptions {
  filter?: Filter;
  sort?: Sort;
  limit?: number;
  skip?: number;
}
export interface Compiled {
  sql: string;
  params: unknown[];
}

const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

// These live as real columns on `docs`, not inside the JSON `data` blob.
const RESERVED_COLUMNS: Record<string, string> = {
  _id: "_id",
  _created_at: "_created_at",
  _updated_at: "_updated_at",
  _deleted: "_deleted",
};

function fieldExpr(field: string): { expr: string; params: unknown[] } {
  if (!FIELD_RE.test(field)) {
    throw new Error(`Invalid field name: ${JSON.stringify(field)}`);
  }
  const column = RESERVED_COLUMNS[field];
  if (column) return { expr: column, params: [] };
  return { expr: "json_extract(data, ?)", params: [`$.${field}`] };
}

// node:sqlite can only bind numbers/bigints/strings/buffers/null, but
// json_extract surfaces JSON booleans as SQL integers 0/1 — match that.
function toSqlParam(value: unknown): unknown {
  return typeof value === "boolean" ? (value ? 1 : 0) : value;
}

function eqClause(expr: string, value: unknown): Compiled {
  if (value === null) return { sql: `${expr} IS NULL`, params: [] };
  return { sql: `${expr} = ?`, params: [toSqlParam(value)] };
}

function neClause(expr: string, value: unknown): Compiled {
  if (value === null) return { sql: `${expr} IS NOT NULL`, params: [] };
  return { sql: `${expr} != ?`, params: [toSqlParam(value)] };
}

const COMPARATORS: Record<string, string> = {
  $gt: ">",
  $gte: ">=",
  $lt: "<",
  $lte: "<=",
};

function compileCondition(field: string, condition: unknown): Compiled {
  const { expr, params: fieldParams } = fieldExpr(field);

  const isOperatorObject =
    condition !== null &&
    typeof condition === "object" &&
    !Array.isArray(condition);

  if (!isOperatorObject) {
    const { sql, params } = eqClause(expr, condition);
    return { sql, params: [...fieldParams, ...params] };
  }

  const clauses: string[] = [];
  const params: unknown[] = [...fieldParams];

  for (const [op, value] of Object.entries(condition as Record<string, unknown>)) {
    if (op === "$eq") {
      const c = eqClause(expr, value);
      clauses.push(c.sql);
      params.push(...c.params);
    } else if (op === "$ne") {
      const c = neClause(expr, value);
      clauses.push(c.sql);
      params.push(...c.params);
    } else if (op in COMPARATORS) {
      clauses.push(`${expr} ${COMPARATORS[op]} ?`);
      params.push(toSqlParam(value));
    } else if (op === "$in") {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error("$in requires a non-empty array");
      }
      clauses.push(`${expr} IN (${value.map(() => "?").join(", ")})`);
      params.push(...value.map(toSqlParam));
    } else if (op === "$contains") {
      clauses.push(`EXISTS (SELECT 1 FROM json_each(${expr}) WHERE value = ?)`);
      params.push(toSqlParam(value));
    } else {
      throw new Error(`Unknown operator: ${op}`);
    }
  }

  return { sql: clauses.join(" AND "), params };
}

export function compileFilter(filter: Filter = {}): Compiled {
  const entries = Object.entries(filter);
  if (entries.length === 0) return { sql: "1 = 1", params: [] };

  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of entries) {
    if (key === "$and" || key === "$or") {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${key} requires a non-empty array`);
      }
      const compiled = value.map((f) => compileFilter(f as Filter));
      const joiner = key === "$and" ? " AND " : " OR ";
      clauses.push(`(${compiled.map((c) => c.sql).join(joiner)})`);
      for (const c of compiled) params.push(...c.params);
      continue;
    }
    const { sql, params: condParams } = compileCondition(key, value);
    clauses.push(sql);
    params.push(...condParams);
  }

  return { sql: clauses.join(" AND "), params };
}

export function compileSort(sort?: Sort): Compiled {
  const entries = Object.entries(sort ?? {});
  if (entries.length === 0) return { sql: "", params: [] };

  const params: unknown[] = [];
  const parts = entries.map(([field, dir]) => {
    if (dir !== 1 && dir !== -1) {
      throw new Error(`Invalid sort direction for ${field}: ${dir}`);
    }
    const { expr, params: fieldParams } = fieldExpr(field);
    params.push(...fieldParams);
    return `${expr} ${dir === 1 ? "ASC" : "DESC"}`;
  });
  return { sql: `ORDER BY ${parts.join(", ")}`, params };
}

/** Full SELECT against `docs` for one collection, scoped to non-deleted rows. */
export function compileFind(collection: string, options: FindOptions = {}): Compiled {
  const { sql: whereSql, params: whereParams } = compileFilter(options.filter);
  const { sql: sortSql, params: sortParams } = compileSort(options.sort);

  let sql = `SELECT * FROM docs WHERE collection = ? AND _deleted = 0 AND (${whereSql})`;
  const params: unknown[] = [collection, ...whereParams, ...sortParams];

  if (sortSql) sql += ` ${sortSql}`;
  if (options.limit !== undefined || options.skip !== undefined) {
    // SQLite requires LIMIT before OFFSET; -1 means "no limit".
    sql += ` LIMIT ?`;
    params.push(options.limit ?? -1);
  }
  if (options.skip !== undefined) {
    sql += ` OFFSET ?`;
    params.push(options.skip);
  }

  return { sql, params };
}

/**
 * Top-level merge patch for `docs.data`, Mongo-`$unset`-flavored: ordinary
 * keys are merged in (RFC 7396 JSON Merge Patch via SQLite's json_patch),
 * `$unset: { field: true }` removes a key by patching it to null.
 */
export function compileUpdate(update: Record<string, unknown>): Compiled {
  const { $unset, ...set } = update;
  const patch: Record<string, unknown> = { ...set };

  if ($unset !== undefined) {
    if (typeof $unset !== "object" || $unset === null) {
      throw new Error("$unset must be an object of field names");
    }
    for (const key of Object.keys($unset)) {
      if (key in patch) throw new Error(`Cannot both set and $unset "${key}"`);
      patch[key] = null;
    }
  }

  for (const key of Object.keys(patch)) {
    if (!FIELD_RE.test(key) || key.includes(".")) {
      throw new Error(`Invalid top-level field name: ${JSON.stringify(key)}`);
    }
  }

  return { sql: "json_patch(data, ?)", params: [JSON.stringify(patch)] };
}
