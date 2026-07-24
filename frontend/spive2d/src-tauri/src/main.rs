// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[tauri::command]
async fn handle_dropped_paths(_paths: Vec<String>, _merge_sequential: bool, _skip_unity: bool) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({}))
}

fn main() {
    let context = tauri::generate_context!();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![handle_dropped_paths])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("主窗口未找到");
            let _ = window.set_always_on_top(true);
            Ok(())
        })
        .run(context)
        .expect("启动应用时出错");
}