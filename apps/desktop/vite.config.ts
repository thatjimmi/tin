import { defineConfig } from "vite";

// Same sqlite-wasm requirements as apps/web (COOP/COEP headers, excluded
// from pre-bundling) plus the handful of tweaks Tauri's docs recommend so
// its dev server doesn't fight with ours.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
});
