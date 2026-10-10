// Executes window.tin RPC calls against an open .tin database. Driver is a
// minimal interface so this works against any SQLite binding (node:sqlite
// for tests/CLI, sqlite-wasm for the web player, rusqlite later for desktop)
// without committing to one Storage abstraction before a second real need
// shows up.

import { compileFilter, compileFind, compileUpdate, type Filter, type FindOptions } from "@tin/query";
import type { RpcHandlers } from "./bridge.ts";
import { bytesToDataUrl, type AssetMeta } from "./init.ts";

export interface SqliteDriver {
  all(sql: string, params: unknown[]): Record<string, unknown>[];
  run(sql: string, params: unknown[]): { changes: number };
}

function rowToDoc(row: Record<string, unknown>): Record<string, unknown> {
  return { _id: row._id, ...JSON.parse(row.data as string) };
}

function assetMeta(
  id: string,
  belongsTo: string,
  name: string | null,
  mime: string | null,
  bytes: Uint8Array,
): AssetMeta {
  return { id, belongsTo, name, mime, size: bytes.length, url: bytesToDataUrl(mime, bytes) };
}

export function createDocStore(driver: SqliteDriver): RpcHandlers {
  function find(name: string, filter?: Filter, options: Omit<FindOptions, "filter"> = {}) {
    const { sql, params } = compileFind(name, { ...options, filter });
    return driver.all(sql, params).map(rowToDoc);
  }

  return {
    "collection.insert"(name: string, doc: Record<string, unknown>) {
      // ponytail: randomUUID, not UUIDv7. Good enough for v1; swap if
      // time-sortable ids are needed before SPEC.md promises them elsewhere.
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      driver.run(
        "INSERT INTO docs (_id, collection, data, _created_at, _updated_at) VALUES (?, ?, ?, ?, ?)",
        [id, name, JSON.stringify(doc), now, now],
      );
      return { _id: id, ...doc };
    },

    "collection.find": find,

    "collection.findOne"(name: string, filter?: Filter) {
      return find(name, filter, { limit: 1 })[0] ?? null;
    },

    "collection.update"(name: string, filter: Filter | undefined, patch: Record<string, unknown>) {
      const { sql: whereSql, params: whereParams } = compileFilter(filter);
      const { sql: patchSql, params: patchParams } = compileUpdate(patch);
      const now = new Date().toISOString();
      const result = driver.run(
        `UPDATE docs SET data = ${patchSql}, _updated_at = ? WHERE collection = ? AND _deleted = 0 AND (${whereSql})`,
        [...patchParams, now, name, ...whereParams],
      );
      return result.changes;
    },

    "collection.delete"(name: string, filter?: Filter) {
      const { sql, params } = compileFilter(filter);
      const now = new Date().toISOString();
      const result = driver.run(
        `UPDATE docs SET _deleted = 1, _updated_at = ? WHERE collection = ? AND _deleted = 0 AND (${sql})`,
        [now, name, ...params],
      );
      return result.changes;
    },

    "collection.count"(name: string, filter?: Filter) {
      const { sql, params } = compileFilter(filter);
      const rows = driver.all(
        `SELECT COUNT(*) as n FROM docs WHERE collection = ? AND _deleted = 0 AND (${sql})`,
        [name, ...params],
      );
      return rows[0]?.n ?? 0;
    },

    "meta.get"(key: string) {
      const rows = driver.all("SELECT value FROM meta WHERE key = ?", [key]);
      return (rows[0]?.value as string | undefined) ?? null;
    },

    "meta.set"(key: string, value: string) {
      driver.run(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
      );
      return null;
    },

    // localStorage shim writes: the SDK reads synchronously from the init
    // snapshot (see init.ts) and only sends these to persist in the
    // background. See PLAN.md's "localStorage-trick" note.
    "kv.set"(key: string, value: string) {
      driver.run(
        "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
      );
      return null;
    },

    "kv.delete"(key: string) {
      driver.run("DELETE FROM kv WHERE key = ?", [key]);
      return null;
    },

    "kv.clear"() {
      driver.run("DELETE FROM kv", []);
      return null;
    },

    "assets.add"(belongsTo: string, bytes: Uint8Array, name: string | null, mime: string | null) {
      const id = crypto.randomUUID();
      driver.run("INSERT INTO assets (id, belongs_to, name, mime, bytes) VALUES (?, ?, ?, ?, ?)", [
        id,
        belongsTo,
        name,
        mime,
        bytes,
      ]);
      return assetMeta(id, belongsTo, name, mime, bytes);
    },

    "assets.delete"(id: string) {
      driver.run("DELETE FROM assets WHERE id = ?", [id]);
      return null;
    },

    "assets.deleteAll"(belongsTo: string) {
      driver.run("DELETE FROM assets WHERE belongs_to = ?", [belongsTo]);
      return null;
    },
  };
}
