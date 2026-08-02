//! Application wiring: plugins, commands, and startup.
//!
//! All behaviour lives in [`commands`]; this file only assembles it.

pub mod commands;
pub mod error;

/// Build and run the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Native open/save panels. Choosing a path through a dialog grants no
        // ability to read or write it - that still goes through our commands.
        .plugin(tauri_plugin_dialog::init())
        // Opens external links in the default browser. Revealing a file in
        // Finder goes through our own command, so the frontend is never given
        // the reveal-item permission directly.
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::files::read_markdown_file,
            commands::files::write_markdown_file,
            commands::files::reveal_in_file_manager,
            commands::settings::load_settings,
            commands::settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
