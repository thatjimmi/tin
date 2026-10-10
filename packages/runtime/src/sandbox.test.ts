import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSandboxHtml } from "./sandbox.ts";

const emptyInit = { kv: {}, assets: [] };

test("injects into an existing <head>", () => {
  const html = buildSandboxHtml(
    "<html><head><title>x</title></head><body>hi</body></html>",
    "SDK;",
    emptyInit,
  );
  assert.match(html, /<head>\s*<meta http-equiv="Content-Security-Policy"/);
  assert.match(html, /<script>SDK;<\/script>\s*<title>x<\/title>/);
});

test("adds a <head> when only <html> is present", () => {
  const html = buildSandboxHtml("<html><body>hi</body></html>", "SDK;", emptyInit);
  assert.match(html, /<html>\s*<head>.*<\/head>/s);
});

test("prepends a <head> for a bare fragment", () => {
  const html = buildSandboxHtml("<h1>hi</h1>", "SDK;", emptyInit);
  assert.match(html, /^<head>.*<\/head><h1>hi<\/h1>$/s);
});

test("embeds the init snapshot before the SDK script", () => {
  const html = buildSandboxHtml("<h1>hi</h1>", "SDK;", { kv: { theme: "dark" }, assets: [] });
  assert.match(html, /window\.__TIN_INIT__ = \{"kv":\{"theme":"dark"\},"assets":\[\]\};<\/script>\s*<script>SDK;/);
});

test("escapes '<' in embedded data so a value can't break out of its <script>", () => {
  const html = buildSandboxHtml("<h1>hi</h1>", "SDK;", {
    kv: { evil: "</script><script>alert(1)</script>" },
    assets: [],
  });
  assert.ok(!html.includes("</script><script>alert"));
  assert.match(html, /\\u003c\/script>\\u003cscript>alert\(1\)\\u003c\/script>/);
});

test("inlines design CSS as a <style> before the init snapshot", () => {
  const html = buildSandboxHtml("<h1>hi</h1>", "SDK;", emptyInit, ".btn { color: red; }");
  assert.match(html, /<style>\.btn \{ color: red; \}<\/style>\s*<script>window\.__TIN_INIT__/);
});

test("design CSS defaults to empty when omitted", () => {
  const html = buildSandboxHtml("<h1>hi</h1>", "SDK;", emptyInit);
  assert.match(html, /<style><\/style>/);
});
