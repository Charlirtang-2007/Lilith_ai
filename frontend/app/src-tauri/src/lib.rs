//! 桌面宠物 Tauri 后端：只负责窗口行为，业务逻辑全部在 Python 后端与前端。
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
                #[cfg(debug_assertions)]
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("启动桌面宠物失败");
}
