// Permissions gate: SPEC.md's `permissions` table records user grants for
// capabilities the sandbox can't decide on its own (network access, etc).
// This is the "not enforced yet in v1" bit from SPEC.md, now enforced - a
// decision is looked up once, asked for (outside the sandbox, via `ask`) if
// undecided, and then remembered in the file so the app isn't re-prompted
// on every call or every reopen.
import type { SqliteDriver } from "./store.ts";

export type PermissionAsk = (name: string, reason: string) => boolean | Promise<boolean>;

export function createPermissionGate(driver: SqliteDriver, ask: PermissionAsk) {
  return async function checkPermission(name: string, reason: string): Promise<boolean> {
    const [row] = driver.all("SELECT granted FROM permissions WHERE name = ?", [name]);
    if (row && row.granted !== null) return row.granted === 1;

    const granted = await ask(name, reason);
    driver.run(
      "INSERT INTO permissions (name, granted, reason) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET granted = excluded.granted, reason = excluded.reason",
      [name, granted ? 1 : 0, reason],
    );
    return granted;
  };
}
