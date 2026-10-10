// Snapshot of `kv` and `assets` sent into the sandbox *before* the app's
// scripts run. Needed because both localStorage (sync API) and
// assets.getUrl()/getMeta() (meant to feel sync) have to work without
// waiting on the async postMessage bridge - see PLAN.md's "Åbne spørgsmål"
// note on assets.getUrl() and the localStorage-trick. Data URLs sidestep
// the "iframe has no origin" problem that blob URLs would hit, since a
// data: URL isn't tied to any particular origin.
import type { SqliteDriver } from "./store.ts";

export interface AssetMeta {
  id: string;
  belongsTo: string;
  name: string | null;
  mime: string | null;
  size: number;
  url: string;
}

export interface InitData {
  kv: Record<string, string>;
  assets: AssetMeta[];
  // Only true on desktop (see PLAN.md: the proxy is Rust-backed and can't
  // exist in the web player). The SDK uses this to decide whether
  // window.tin.http exists at all, rather than defining it everywhere and
  // failing at call time on web.
  hasNetworkProxy: boolean;
}

export function bytesToDataUrl(mime: string | null, bytes: Uint8Array): string {
  // ponytail: byte-by-byte loop instead of String.fromCharCode(...bytes) to
  // avoid a call-stack blowup on large arrays. Fine for example-app-sized
  // assets; swap to chunked conversion if real apps hit multi-MB assets.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime || "application/octet-stream"};base64,${btoa(binary)}`;
}

export function loadInitData(driver: SqliteDriver, hasNetworkProxy = false): InitData {
  const kv: Record<string, string> = {};
  for (const row of driver.all("SELECT key, value FROM kv", [])) {
    kv[row.key as string] = row.value as string;
  }

  const assets = driver.all("SELECT id, belongs_to, name, mime, bytes FROM assets", []).map(
    (row): AssetMeta => {
      const bytes = row.bytes as Uint8Array;
      const mime = (row.mime as string | null) ?? null;
      return {
        id: row.id as string,
        belongsTo: row.belongs_to as string,
        name: (row.name as string | null) ?? null,
        mime,
        size: bytes.length,
        url: bytesToDataUrl(mime, bytes),
      };
    },
  );

  return { kv, assets, hasNetworkProxy };
}
