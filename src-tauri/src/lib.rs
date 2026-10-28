mod auth;
mod fonts;
mod publish;
mod scan;
mod thumbs;
mod upscale;
mod web;

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

/// Writes a series as a web page into `dir`: index.html and web-sized copies of the pictures.
/// Returns the files written, relative to `dir`.
#[tauri::command]
async fn write_web_page(
    app: tauri::AppHandle,
    dir: String,
    html: String,
    pictures: Vec<web::WebPicture>,
) -> Result<Vec<String>, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("thumbs");
    tauri::async_runtime::spawn_blocking(move || web::write_page(&PathBuf::from(dir), &html, &pictures, &cache_dir))
        .await
        .map_err(|e| e.to_string())?
}

/// Makes the series' web page and uploads it to the host, into a folder named `name`.
/// Returns the page's address and, for SFTP, the server's key to remember.
#[tauri::command]
async fn publish_web_page(
    app: tauri::AppHandle,
    host: publish::Host,
    name: String,
    html: String,
    pictures: Vec<web::WebPicture>,
) -> Result<publish::Published, String> {
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let thumbs = cache.join("thumbs");
    let dir = cache.join("web").join(&name);
    tauri::async_runtime::spawn_blocking(move || {
        let _ = std::fs::remove_dir_all(&dir);
        let files = web::write_page(&dir, &html, &pictures, &thumbs)?;
        let result = publish::upload(&host, &dir, &files, &name);
        let _ = std::fs::remove_dir_all(&dir);
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Keeps the host's password in the Mac's keychain.
#[tauri::command]
async fn save_host_password(host: publish::Host, password: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || publish::save_password(&host, &password))
        .await
        .map_err(|e| e.to_string())?
}

/// Whether the keychain has a password for the host, without handing it out.
#[tauri::command]
async fn has_host_password(host: publish::Host) -> bool {
    tauri::async_runtime::spawn_blocking(move || publish::has_password(&host)).await.unwrap_or(false)
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
            upscale_image,
            write_web_page,
            publish_web_page,
            save_host_password,
            has_host_password
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
