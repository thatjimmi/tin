import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "@tin/format/src/schema.ts";
import { compileFilter, compileFind, compileSort, compileUpdate } from "./index.ts";

function seed() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  const insert = db.prepare(
    "INSERT INTO docs (_id, collection, data, _created_at, _updated_at) VALUES (?, 'todos', ?, '2024-01-01', '2024-01-01')",
  );
  insert.run("1", JSON.stringify({ title: "a", done: false, age: 10, tags: ["x"] }));
  insert.run("2", JSON.stringify({ title: "b", done: true, age: 20, tags: ["y", "z"] }));
  insert.run("3", JSON.stringify({ title: "c", done: false, age: 30, nested: { n: 5 } }));
  return db;
}

function findIds(db: DatabaseSync, filter: Record<string, unknown>): string[] {
  const { sql, params } = compileFind("todos", { filter });
  return (db.prepare(sql).all(...(params as any[])) as any[]).map((r) => r._id).sort();
}

test("implicit equality and $ne", () => {
  const db = seed();
  assert.deepEqual(findIds(db, { done: false }), ["1", "3"]);
  assert.deepEqual(findIds(db, { done: { $ne: false } }), ["2"]);
  db.close();
});

test("comparators and $in", () => {
  const db = seed();
  assert.deepEqual(findIds(db, { age: { $gt: 10 } }), ["2", "3"]);
  assert.deepEqual(findIds(db, { age: { $in: [10, 30] } }), ["1", "3"]);
  db.close();
});

test("$contains checks array membership", () => {
  const db = seed();
  assert.deepEqual(findIds(db, { tags: { $contains: "y" } }), ["2"]);
  db.close();
});

test("$and / $or combine filters", () => {
  const db = seed();
  assert.deepEqual(findIds(db, { $and: [{ done: false }, { age: { $gte: 20 } }] }), ["3"]);
  assert.deepEqual(findIds(db, { $or: [{ age: 10 }, { age: 30 }] }), ["1", "3"]);
  db.close();
});

test("nested field dot notation", () => {
  const db = seed();
  assert.deepEqual(findIds(db, { "nested.n": 5 }), ["3"]);
  db.close();
});

test("sort, limit, skip", () => {
  const db = seed();
  const { sql, params } = compileFind("todos", {
    sort: { age: -1 },
    limit: 1,
    skip: 1,
  });
  const rows = db.prepare(sql).all(...(params as any[])) as any[];
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(rows[0].data).age, 20);
  db.close();
});

test("rejects unknown operators and invalid field names", () => {
  assert.throws(() => compileFilter({ age: { $bogus: 1 } }), /Unknown operator/);
  assert.throws(() => compileFilter({ "a; DROP TABLE docs": 1 }), /Invalid field name/);
});

test("compileSort with no sort returns empty string", () => {
  assert.deepEqual(compileSort(undefined), { sql: "", params: [] });
});

test("compileUpdate merges top-level keys and applies $unset", () => {
  const db = seed();
  const { sql, params } = compileUpdate({ done: true, $unset: { tags: true } });
  db.prepare(`UPDATE docs SET data = ${sql} WHERE _id = '1'`).run(...(params as any[]));
  const row = db.prepare("SELECT data FROM docs WHERE _id = '1'").get() as { data: string };
  const data = JSON.parse(row.data);
  assert.equal(data.done, true);
  assert.equal(data.title, "a");
  assert.equal("tags" in data, false);
  db.close();
});

test("compileUpdate rejects setting and unsetting the same field", () => {
  assert.throws(() => compileUpdate({ tags: [], $unset: { tags: true } }), /Cannot both set/);
});
