// Desktop shell: the actual engine (query compiler, sandbox, RPC bridge,
// SDK) is the same TypeScript that runs in apps/web, loaded into this
// window's webview unchanged - see PLAN.md's "one runtime, two shells".
// Rust's only job here is what a browser can't do: read/write the .tin
// file on disk, register it as a file association, open one window per
// document, and (M5) run outgoing HTTP requests so apps can reach real
// APIs without hitting the browser's CORS wall - gated by the file's own
// `permissions` table, asked about in apps/desktop/src/main.ts. Native
// SQLite (rusqlite) is a later milestone (M4.5); for now this window runs
// the same sqlite-wasm-in-memory engine as the web player.
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::Duration;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(0);
// Set as soon as any document is opened (via argv or a macOS Opened event),
// so the deferred blank-window fallback below knows one is already handled.
static OPENED_FILE: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // Launched directly with a file path: double-click on
            // Windows/Linux, or `tin-desktop path/to/app.tin` from a shell.
            // macOS instead delivers file-association launches as a
            // RunEvent::Opened, handled below - and it can arrive a beat
            // after setup() runs, not before. That used to race against a
            // "main" window declared statically in tauri.conf.json (always
            // created at startup): the doc window would open, but the
            // blank main window was already on screen and didn't always
            // close in time, leaving two windows up. Fixed by not creating
            // main from static config at all - it's only ever built here,
            // in code, after we've had a chance to find out a document is
            // on the way.
            if let Some(path) = std::env::args().skip(1).find(|a| a.ends_with(".tin")) {
                OPENED_FILE.store(true, Ordering::SeqCst);
                open_document_window(app.handle(), &path);
                return Ok(());
            }

            // ponytail: a fixed 200ms grace period, not a real
            // synchronization with the Opened event - if macOS is ever
            // slower than that to deliver it, main briefly flashes before
            // close_empty_main cleans it up (same as before, just rarer).
            // Swap for a proper signal if that's ever observed in practice.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(200));
                if !OPENED_FILE.load(Ordering::SeqCst) {
                    open_main_window(&handle);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS file-association open, at launch or while already
            // running, arrives here instead of via argv.
            if let RunEvent::Opened { urls } = event {
                OPENED_FILE.store(true, Ordering::SeqCst);
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        open_document_window(app_handle, &path.display().to_string());
                    }
                }
                close_empty_main(app_handle);
            }
        });
}

// Each opened document gets its own window (PLAN.md: "Ét vindue per
// dokument"). ponytail: no reuse-if-already-open check or
// tauri-plugin-single-instance yet, so opening the same file twice opens
// two windows on it - add a path -> window-label lookup if that turns out
// to matter in practice.
fn open_document_window(app: &tauri::AppHandle, path: &str) {
    let label = format!("doc-{}", WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst));
    let init = format!(
        "window.__TIN_FILE_PATH__ = {};",
        serde_json::to_string(path).expect("path is valid UTF-8")
    );
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("tin")
        .inner_size(960.0, 720.0)
        .initialization_script(&init)
        .build()
        .expect("failed to open document window");
}

// The empty "Open a .tin file" screen for a bare launch - built here
// instead of from tauri.conf.json's static windows config, so it only
// exists when nothing else has claimed the launch (see setup() above).
fn open_main_window(app: &tauri::AppHandle) {
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("tin")
        .inner_size(960.0, 720.0)
        .build()
        .expect("failed to open main window");
}

// Covers the case where main already exists (the grace period elapsed, or
// the app was already running bare) and a document now needs the screen.
fn close_empty_main(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.close();
    }
}
