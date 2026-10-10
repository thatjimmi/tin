// Desktop shell: the actual engine (query compiler, sandbox, RPC bridge,
// SDK) is the same TypeScript that runs in apps/web, loaded into this
// window's webview unchanged - see PLAN.md's "one runtime, two shells".
// Rust's only job here is what a browser can't do: read/write the .tin
// file on disk, register it as a file association, and open one window
// per document. Native SQLite (rusqlite) is a later milestone (M4.5); for
// now this window runs the same sqlite-wasm-in-memory engine as the web
// player.
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(0);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Launched directly with a file path: double-click on
            // Windows/Linux, or `tin-desktop path/to/app.tin` from a shell.
            // macOS instead delivers file-association launches as a
            // RunEvent::Opened, handled below.
            if let Some(path) = std::env::args().skip(1).find(|a| a.ends_with(".tin")) {
                open_document_window(app.handle(), &path);
                close_empty_main(app.handle());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS file-association open, at launch or while already
            // running, arrives here instead of via argv.
            if let RunEvent::Opened { urls } = event {
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

// The default "main" window (declared in tauri.conf.json) is only useful
// as an empty "Open a .tin file" screen for a bare launch. If this launch
// came with a document to open instead, that blank window is just clutter.
fn close_empty_main(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.close();
    }
}
