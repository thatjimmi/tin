import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "@tin/format/src/schema.ts";
import { createDocStore, type SqliteDriver } from "./store.ts";

// Test-only adapter: node:sqlite stands in for sqlite-wasm here. Real app
// code adapts whichever binding it's actually running against (web vs.
// desktop); createDocStore itself doesn't care which.
function nodeSqliteDriver(db: DatabaseSync): SqliteDriver {
  return {
    all: (sql, params) => db.prepare(sql).all(...(params as any[])) as Record<string, unknown>[],
    run: (sql, params) => {
      const result = db.prepare(sql).run(...(params as any[]));
      return { changes: Number(result.changes) };
    },
  };
}

function seededStore() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  return { db, store: createDocStore(nodeSqliteDriver(db)) };
}

test("insert then find round trip", () => {
  const { store } = seededStore();
  const inserted = store["collection.insert"]("todos", { title: "a", done: false }) as any;
  assert.ok(inserted._id);
  assert.equal(inserted.title, "a");

  const found = store["collection.find"]("todos", { done: false }) as any[];
  assert.equal(found.length, 1);
  assert.equal(found[0]._id, inserted._id);
});

test("findOne returns null when nothing matches", () => {
  const { store } = seededStore();
  assert.equal(store["collection.findOne"]("todos", { title: "nope" }), null);
});

test("update merges top-level keys via compileUpdate", () => {
  const { store } = seededStore();
  const inserted = store["collection.insert"]("todos", { title: "a", done: false }) as any;
  const changed = store["collection.update"]("todos", { _id: inserted._id }, { done: true });
  assert.equal(changed, 1);

  const found = store["collection.findOne"]("todos", { _id: inserted._id }) as any;
  assert.equal(found.done, true);
  assert.equal(found.title, "a");
});

test("delete is a soft delete - excluded from find/count afterwards", () => {
  const { store } = seededStore();
  const inserted = store["collection.insert"]("todos", { title: "a" }) as any;
  store["collection.delete"]("todos", { _id: inserted._id });
  assert.equal(store["collection.count"]("todos", {}), 0);
});

test("meta get/set round trip, including overwrite", () => {
  const { store } = seededStore();
  assert.equal(store["meta.get"]("title"), null);
  store["meta.set"]("title", "My App");
  assert.equal(store["meta.get"]("title"), "My App");
  store["meta.set"]("title", "Renamed");
  assert.equal(store["meta.get"]("title"), "Renamed");
});
