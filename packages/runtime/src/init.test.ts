import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "@tin/format/src/schema.ts";
import { loadInitData, bytesToDataUrl } from "./init.ts";
import type { SqliteDriver } from "./store.ts";

function nodeSqliteDriver(db: DatabaseSync): SqliteDriver {
  return {
    all: (sql, params) => db.prepare(sql).all(...(params as any[])) as Record<string, unknown>[],
    run: (sql, params) => {
      const result = db.prepare(sql).run(...(params as any[]));
      return { changes: Number(result.changes) };
    },
  };
}

test("loadInitData snapshots kv as a plain object and assets as data URLs", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?)").run("theme", "dark");
  db.prepare("INSERT INTO assets (id, belongs_to, name, mime, bytes) VALUES (?, ?, ?, ?, ?)").run(
    "a1",
    "recipe-1",
    "photo.jpg",
    "image/jpeg",
    new Uint8Array([1, 2, 3]),
  );

  const data = loadInitData(nodeSqliteDriver(db));

  assert.deepEqual(data.kv, { theme: "dark" });
  assert.equal(data.assets.length, 1);
  assert.deepEqual(data.assets[0], {
    id: "a1",
    belongsTo: "recipe-1",
    name: "photo.jpg",
    mime: "image/jpeg",
    size: 3,
    url: bytesToDataUrl("image/jpeg", new Uint8Array([1, 2, 3])),
  });
});

test("bytesToDataUrl falls back to application/octet-stream without a mime", () => {
  assert.equal(bytesToDataUrl(null, new Uint8Array([65])).startsWith("data:application/octet-stream;base64,"), true);
});
