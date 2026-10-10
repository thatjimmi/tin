import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "@tin/format/src/schema.ts";
import { createPermissionGate } from "./permissions.ts";
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

function seededDriver() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  return { db, driver: nodeSqliteDriver(db) };
}

test("asks once, then remembers the grant without asking again", async () => {
  const { driver } = seededDriver();
  let askCount = 0;
  const checkPermission = createPermissionGate(driver, () => {
    askCount++;
    return true;
  });

  assert.equal(await checkPermission("network:api.example.com", "Connect to api.example.com"), true);
  assert.equal(await checkPermission("network:api.example.com", "Connect to api.example.com"), true);
  assert.equal(askCount, 1);
});

test("remembers a denial too, without re-asking", async () => {
  const { driver } = seededDriver();
  let askCount = 0;
  const checkPermission = createPermissionGate(driver, () => {
    askCount++;
    return false;
  });

  assert.equal(await checkPermission("network:evil.example.com", "Connect to evil.example.com"), false);
  assert.equal(await checkPermission("network:evil.example.com", "Connect to evil.example.com"), false);
  assert.equal(askCount, 1);
});

test("persists the decision and reason in the permissions table", async () => {
  const { db, driver } = seededDriver();
  const checkPermission = createPermissionGate(driver, () => true);
  await checkPermission("network:api.example.com", "Connect to api.example.com");

  const row = db.prepare("SELECT name, granted, reason FROM permissions WHERE name = ?").get("network:api.example.com") as any;
  assert.equal(row.granted, 1);
  assert.equal(row.reason, "Connect to api.example.com");
});

test("different permission names are tracked independently", async () => {
  const { driver } = seededDriver();
  const checkPermission = createPermissionGate(driver, (name) => name === "network:good.example.com");

  assert.equal(await checkPermission("network:good.example.com", "r"), true);
  assert.equal(await checkPermission("network:bad.example.com", "r"), false);
});
