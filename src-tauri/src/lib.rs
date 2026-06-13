mod pdf_io;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![pdf_io::open_pdf])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
