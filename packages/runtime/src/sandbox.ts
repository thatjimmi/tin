// Wraps an app's HTML for a `<iframe sandbox="allow-scripts">` (no
// allow-same-origin, so the frame gets an opaque origin and can't touch the
// player's data). Injects a CSP meta tag and the inline SDK script.

const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'";

export function buildSandboxHtml(appHtml: string, sdkScript: string): string {
  const inject = `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<script>${sdkScript}</script>`;

  if (/<head[^>]*>/i.test(appHtml)) {
    return appHtml.replace(/<head[^>]*>/i, (m) => `${m}\n${inject}`);
  }
  if (/<html[^>]*>/i.test(appHtml)) {
    return appHtml.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${inject}</head>`);
  }
  // Bare fragment (no <html>/<head>): prepend a head of our own.
  return `<head>${inject}</head>${appHtml}`;
}
