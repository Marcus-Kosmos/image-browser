mod fonts;
mod scan;
mod thumbs;

use std::path::PathBuf;

use tauri::Manager;

#[tauri::command]
async fn scan_folder(path: String, recursive: bool) -> Result<scan::FolderListing, String> {
    tauri::async_runtime::spawn_blocking(move || scan::scan_folder(&PathBuf::from(path), recursive))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn thumbnail(app: tauri::AppHandle, path: String, size: u32) -> Result<String, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbs");
    tauri::async_runtime::spawn_blocking(move || {
        thumbs::thumbnail(&PathBuf::from(path), size, &cache_dir)
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Moves the file to the system trash so the deletion can be undone in Finder.
#[tauri::command]
async fn trash_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || trash::delete(&path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Font families installed on this computer, for headings.
#[tauri::command]
async fn list_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(fonts::installed_families)
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_folder, thumbnail, trash_file, list_fonts])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
