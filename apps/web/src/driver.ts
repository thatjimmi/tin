// Adapts sqlite-wasm's oo1.Database to @tin/runtime's minimal SqliteDriver
// interface. This is the one place that knows about sqlite-wasm specifically;
// everything else in @tin/runtime is driver-agnostic.
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
