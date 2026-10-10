// Adapts sqlite-wasm's oo1.Database to @tin/runtime's minimal SqliteDriver
// interface. Identical to apps/web/src/driver.ts: M4 runs the same
// in-browser sqlite-wasm engine inside the Tauri webview (per PLAN.md,
// native SQLite via rusqlite is M4.5, not this milestone), so the two apps
// share the same tiny adapter rather than a shared package for 15 lines.
import type { Database } from "@sqlite.org/sqlite-wasm";
import type { SqliteDriver } from "@tin/runtime";

export function sqliteWasmDriver(db: Database): SqliteDriver {
  return {
    all: (sql, params) => db.selectObjects(sql, params as any),
    run: (sql, params) => {
      db.exec(sql, { bind: params as any });
      return { changes: Number(db.changes()) };
    },
  };
}
