import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { Sqlite3Static, Database } from "@sqlite.org/sqlite-wasm";
import {
  buildSandboxHtml,
  createBridge,
  createDocStore,
  createHttpHandlers,
  createPermissionGate,
  loadInitData,
  type DoFetch,
} from "@tin/runtime";
import sdkSource from "@tin/sdk/src/index.ts?raw";
import designCss from "@tin/design/src/design-system.css?raw";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { sqliteWasmDriver } from "./driver.ts";

declare global {
  interface Window {
    // Set via WebviewWindowBuilder::initialization_script by the Rust side
    // when this window was opened for a specific document (file
    // association, or a second window opened while the app is running).
    __TIN_FILE_PATH__?: string;
  }
}

const openButton = document.querySelector<HTMLButtonElement>("#open")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
const saveAsButton = document.querySelector<HTMLButtonElement>("#save-as")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;
const frame = document.querySelector<HTMLIFrameElement>("#app-frame")!;

const FILTERS = [{ name: "Tin", extensions: ["tin"] }];

let sqlite3: Sqlite3Static | undefined;
let db: Database | undefined;
let disposeBridge: (() => void) | undefined;
let currentPath: string | undefined;

function openDb(bytes: Uint8Array): Database {
  const d = new sqlite3!.oo1.DB(":memory:");
  const ptr = sqlite3!.wasm.allocFromTypedArray(bytes);
  const rc = sqlite3!.capi.sqlite3_deserialize(
    d.pointer!,
    "main",
    ptr,
    bytes.length,
    bytes.length,
    sqlite3!.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3!.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  d.checkRc(rc);
  return d;
}

// Runs the fetch in Rust (not subject to the webview's CORS checks - see
// capabilities/default.json's broad http:default scope, and lib.rs's
// module comment on why that's safe: the real gate is checkPermission
// below, asking per host and remembering the answer in this file's own
// `permissions` table).
const doFetch: DoFetch = async (url, init) => {
  const res = await tauriFetch(url, init);
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: res.status, headers, body: await res.text() };
};

// Native confirm() for v1 - good enough to satisfy "only after the user's
// consent" (PLAN.md). Swap for a proper modal if a real app needs more
// than a yes/no prompt.
function askPermission(_name: string, reason: string): boolean {
  return window.confirm(`${currentPath ?? "This app"} wants to:\n${reason}\n\nAllow?`);
}

async function loadPath(path: string) {
  sqlite3 ??= await sqlite3InitModule();

  disposeBridge?.();
  db?.close();

  const bytes = await readFile(path);
  db = openDb(bytes);

  const [uiRow] = db.selectObjects("SELECT html FROM ui ORDER BY version DESC LIMIT 1");
  if (!uiRow) throw new Error("Tin file has no ui rows");

  const driver = sqliteWasmDriver(db);
  const sandboxHtml = buildSandboxHtml(uiRow.html as string, sdkSource, loadInitData(driver, true), designCss);
  frame.srcdoc = sandboxHtml;
  frame.style.display = "block";

  const store = createDocStore(driver);
  const http = createHttpHandlers(createPermissionGate(driver, askPermission), doFetch);
  disposeBridge = createBridge(frame, { ...store, ...http });

  currentPath = path;
  saveButton.disabled = false;
  saveAsButton.disabled = false;
  status.textContent = path;
}

openButton.addEventListener("click", async () => {
  const path = await openDialog({ multiple: false, filters: FILTERS });
  if (!path || Array.isArray(path)) return;
  status.textContent = "Loading...";
  loadPath(path).catch((err) => {
    status.textContent = `Failed to load: ${err instanceof Error ? err.message : err}`;
    frame.style.display = "none";
  });
});

saveButton.addEventListener("click", async () => {
  if (!db || !sqlite3 || !currentPath) return;
  const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer!);
  await writeFile(currentPath, bytes);
});

saveAsButton.addEventListener("click", async () => {
  if (!db || !sqlite3) return;
  const path = await saveDialog({ filters: FILTERS, defaultPath: currentPath });
  if (!path) return;
  const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer!);
  await writeFile(path, bytes);
  currentPath = path;
  status.textContent = path;
});

if (window.__TIN_FILE_PATH__) {
  status.textContent = "Loading...";
  loadPath(window.__TIN_FILE_PATH__).catch((err) => {
    status.textContent = `Failed to load: ${err instanceof Error ? err.message : err}`;
  });
}
