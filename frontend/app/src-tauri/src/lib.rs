//! 桌面宠物 Tauri 后端：只负责窗口行为，业务逻辑全部在 Python 后端与前端。
use tauri::{Emitter, Manager};

/// 联调 / 调试辅助：`<可执行文件> emit '<json>'` 会把 JSON 作为 `backend-message` 事件推给窗口，
/// 结构与 WebSocket 的 `{type, payload}` 一致，可用于在无后端环境下预览界面。
fn handle_emit_arg(app: &tauri::AppHandle, json: String) {
    let payload: serde_json::Value = match serde_json::from_str(&json) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("emit 参数不是合法 JSON: {e}");
            return;
        }
    };
    if let Err(e) = app.emit("backend-message", payload) {
        eprintln!("emit 失败: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Ok(json) = std::env::var("LILITH_EMIT") {
                let handle = app.handle().clone();
                std::thread::sleep(std::time::Duration::from_secs(3));
                handle_emit_arg(&handle, json);
            }
            if let Some(window) = app.get_webview_window("main") {
                // 置顶与透明由前端设置面板与 tauri.conf.json 管理。
                // 调试时需要看控制台，启动前设置 LILITH_DEVTOOLS=1
                #[cfg(debug_assertions)]
                if std::env::var("LILITH_DEVTOOLS").is_ok() {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("启动桌面宠物失败");
}
