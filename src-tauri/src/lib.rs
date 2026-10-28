mod auth;
mod fonts;
mod scan;
mod thumbs;
mod upscale;

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

/// Splits paths dropped from Finder into folders and image files.
#[tauri::command]
async fn sort_dropped(paths: Vec<String>) -> Result<scan::Dropped, String> {
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    tauri::async_runtime::spawn_blocking(move || scan::sort_dropped(&paths))
        .await
        .map_err(|e| e.to_string())
}

/// Moves the file to the system trash so the deletion can be undone in Finder.
#[tauri::command]
async fn trash_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || trash::delete(&path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Enlarges a picture 4× with the AI model shipped in the app, saving it beside the original.
/// Returns the new file's path.
#[tauri::command]
async fn upscale_image(app: tauri::AppHandle, path: String, width: u32, height: u32) -> Result<String, String> {
    // The program sits beside the app's own executable; its model is among the app's resources.
    let program = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .with_file_name("realesrgan-ncnn-vulkan");
    let models = app.path().resource_dir().map_err(|e| e.to_string())?.join("upscale-models");
    tauri::async_runtime::spawn_blocking(move || {
        upscale::enlarge(&PathBuf::from(path), &program, &models, width, height)
            .map(|p| p.to_string_lossy().into_owned())
    })
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

/// Shows the Touch ID (or password) prompt; true when the owner confirmed.
#[tauri::command]
async fn confirm_owner(reason: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || auth::confirm_owner(&reason))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            thumbnail,
            sort_dropped,
            trash_file,
            list_fonts,
            confirm_owner,
            upscale_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
