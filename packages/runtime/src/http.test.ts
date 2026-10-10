import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttpHandlers } from "./http.ts";

test("forwards to doFetch when permission is granted", async () => {
  const handlers = createHttpHandlers(
    async () => true,
    async (url) => ({ status: 200, headers: {}, body: `got ${url}` }),
  );

  const res = await handlers["http.fetch"]("https://api.example.com/data");
  assert.deepEqual(res, { status: 200, headers: {}, body: "got https://api.example.com/data" });
});

test("checks permission keyed by host, not full URL", async () => {
  let checkedName: string | undefined;
  const handlers = createHttpHandlers(
    async (name) => {
      checkedName = name;
      return true;
    },
    async () => ({ status: 200, headers: {}, body: "" }),
  );

  await handlers["http.fetch"]("https://api.example.com/v1/widgets?x=1");
  assert.equal(checkedName, "network:api.example.com");
});

test("rejects without calling doFetch when permission is denied", async () => {
  let fetchCalled = false;
  const handlers = createHttpHandlers(
    async () => false,
    async () => {
      fetchCalled = true;
      return { status: 200, headers: {}, body: "" };
    },
  );

  await assert.rejects(() => handlers["http.fetch"]("https://evil.example.com"), /denied/);
  assert.equal(fetchCalled, false);
});
