import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSandboxHtml } from "./sandbox.ts";

test("injects into an existing <head>", () => {
  const html = buildSandboxHtml("<html><head><title>x</title></head><body>hi</body></html>", "SDK;");
  assert.match(html, /<head>\s*<meta http-equiv="Content-Security-Policy"/);
  assert.match(html, /<script>SDK;<\/script>\s*<title>x<\/title>/);
});

test("adds a <head> when only <html> is present", () => {
  const html = buildSandboxHtml("<html><body>hi</body></html>", "SDK;");
  assert.match(html, /<html>\s*<head>.*<\/head>/s);
});

test("prepends a <head> for a bare fragment", () => {
  const html = buildSandboxHtml("<h1>hi</h1>", "SDK;");
  assert.match(html, /^<head>.*<\/head><h1>hi<\/h1>$/s);
});
