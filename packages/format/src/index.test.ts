import { test } from "node:test";
import assert from "node:assert/strict";
import { createTin, openTin, latestHtml, SCHEMA_VERSION } from "./index.ts";

test("create -> open -> latestHtml round trip", () => {
  const path = `/tmp/tin-test-${Date.now()}.tin`;
  const db = createTin(path, "<h1>hi</h1>", { title: "t" });
  db.close();

  const reopened = openTin(path);
  assert.equal(latestHtml(reopened), "<h1>hi</h1>");
  reopened.close();
});

test("openTin rejects a schema version it doesn't understand", () => {
  const path = `/tmp/tin-test-future-${Date.now()}.tin`;
  const db = createTin(path, "<p></p>");
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1};`);
  db.close();

  assert.throws(() => openTin(path), /schema v\d+/);
});
