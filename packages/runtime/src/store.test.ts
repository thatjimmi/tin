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

test("kv set/delete/clear persist to the kv table", () => {
  const { db, store } = seededStore();
  store["kv.set"]("a", "1");
  store["kv.set"]("b", "2");
  assert.deepEqual(db.prepare("SELECT key, value FROM kv ORDER BY key").all().map((r) => ({ ...r })), [
    { key: "a", value: "1" },
    { key: "b", value: "2" },
  ]);

  store["kv.delete"]("a");
  assert.deepEqual(db.prepare("SELECT key FROM kv").all().map((r) => ({ ...r })), [{ key: "b" }]);

  store["kv.clear"]();
  assert.deepEqual(db.prepare("SELECT key FROM kv").all(), []);
});

test("assets add/delete/deleteAll round trip through the assets table", () => {
  const { db, store } = seededStore();
  const bytes = new Uint8Array([1, 2, 3]);
  const meta = store["assets.add"]("recipe-1", bytes, "photo.jpg", "image/jpeg") as any;

  assert.ok(meta.id);
  assert.equal(meta.belongsTo, "recipe-1");
  assert.equal(meta.name, "photo.jpg");
  assert.equal(meta.mime, "image/jpeg");
  assert.equal(meta.size, 3);
  assert.equal(meta.url, "data:image/jpeg;base64,AQID");

  const row = db.prepare("SELECT belongs_to, name, mime, bytes FROM assets WHERE id = ?").get(meta.id) as any;
  assert.equal(row.belongs_to, "recipe-1");
  assert.deepEqual(new Uint8Array(row.bytes), bytes);

  const second = store["assets.add"]("recipe-1", new Uint8Array([9]), "x.png", "image/png") as any;
  store["assets.delete"](second.id);
  assert.equal(db.prepare("SELECT COUNT(*) as n FROM assets").get()!.n, 1);

  store["assets.add"]("recipe-2", new Uint8Array([9]), "x.png", "image/png");
  store["assets.deleteAll"]("recipe-1");
  assert.equal(db.prepare("SELECT COUNT(*) as n FROM assets").get()!.n, 1);

  const remaining = db.prepare("SELECT belongs_to FROM assets").get() as any;
  assert.equal(remaining.belongs_to, "recipe-2");

  store["assets.deleteAll"]("recipe-2");
  assert.equal(db.prepare("SELECT COUNT(*) as n FROM assets").get()!.n, 0);
});
