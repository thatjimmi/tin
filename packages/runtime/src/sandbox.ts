// Wraps an app's HTML for a `<iframe sandbox="allow-scripts">` (no
// allow-same-origin, so the frame gets an opaque origin and can't touch the
// player's data). Injects a CSP meta tag, a snapshot of kv/assets (so the
// SDK's localStorage shim and assets.getUrl() can work synchronously), and
// the inline SDK script.
import type { InitData } from "./init.ts";

const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'";

export function buildSandboxHtml(
  appHtml: string,
  sdkScript: string,
  initData: InitData,
  designCss = "",
): string {
  // Escaping every `<` (not just `</script>`) is the standard safe way to
  // embed arbitrary JSON inside an inline <script>: it can't be broken out
  // of by a `</script>`, `<!--`, or other tag hiding in asset names/kv values.
  const initJson = JSON.stringify(initData).replace(/</g, "\\u003c");
  // Design-system CSS (PLAN.md component #6) is inlined the same way as the
  // SDK script, rather than linked via <link href>: the sandbox has no
  // origin to serve it from, and style-src is 'unsafe-inline' only anyway.
  const inject = `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<style>${designCss}</style>\n<script>window.__TIN_INIT__ = ${initJson};</script>\n<script>${sdkScript}</script>`;

  if (/<head[^>]*>/i.test(appHtml)) {
    return appHtml.replace(/<head[^>]*>/i, (m) => `${m}\n${inject}`);
  }
  if (/<html[^>]*>/i.test(appHtml)) {
    return appHtml.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${inject}</head>`);
  }
  // Bare fragment (no <html>/<head>): prepend a head of our own.
  return `<head>${inject}</head>${appHtml}`;
}
