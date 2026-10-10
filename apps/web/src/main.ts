import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { Sqlite3Static, Database } from "@sqlite.org/sqlite-wasm";
import { buildSandboxHtml, createBridge, createDocStore, loadInitData } from "@tin/runtime";
import sdkSource from "@tin/sdk/src/index.ts?raw";
import { sqliteWasmDriver } from "./driver.ts";

const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#download")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;
const frame = document.querySelector<HTMLIFrameElement>("#app-frame")!;

let sqlite3: Sqlite3Static | undefined;
let db: Database | undefined;
let disposeBridge: (() => void) | undefined;

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

async function loadFile(file: File) {
  sqlite3 ??= await sqlite3InitModule();

  disposeBridge?.();
  db?.close();

  const bytes = new Uint8Array(await file.arrayBuffer());
  db = openDb(bytes);

  const [uiRow] = db.selectObjects("SELECT html FROM ui ORDER BY version DESC LIMIT 1");
  if (!uiRow) throw new Error("Tin file has no ui rows");

  const driver = sqliteWasmDriver(db);
  const sandboxHtml = buildSandboxHtml(uiRow.html as string, sdkSource, loadInitData(driver));
  frame.srcdoc = sandboxHtml;
  frame.style.display = "block";

  const store = createDocStore(driver);
  disposeBridge = createBridge(frame, store);

  downloadButton.disabled = false;
  status.textContent = `Running ${file.name}`;
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  status.textContent = "Loading...";
  loadFile(file).catch((err) => {
    status.textContent = `Failed to load: ${err instanceof Error ? err.message : err}`;
    frame.style.display = "none";
  });
});

downloadButton.addEventListener("click", () => {
  if (!db || !sqlite3) return;
  const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer!);
  const blob = new Blob([bytes], { type: "application/x-sqlite3" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileInput.files?.[0]?.name ?? "app.tin";
  a.click();
  URL.revokeObjectURL(url);
});
