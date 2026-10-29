mod aimark;
mod auth;
mod cloud;
mod fonts;
mod popup;
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

/// Enlarges a picture with Stability AI, which draws in detail to match what the picture shows.
/// `amount` (0 to 1) is how freely it may invent detail. Returns the new file's path.
#[tauri::command]
async fn cloud_upscale_image(
    app: tauri::AppHandle,
    path: String,
    width: u32,
    height: u32,
    mode: cloud::Mode,
    prompt: String,
    amount: f32,
) -> Result<String, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("thumbs");
    tauri::async_runtime::spawn_blocking(move || {
        let key = cloud::key()?;
        cloud::enlarge(&PathBuf::from(path), width, height, mode, &prompt, amount, &key, &cache_dir)
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Keeps the Stability AI key in the Mac's keychain; an empty key forgets it.
#[tauri::command]
async fn save_cloud_key(key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if key.trim().is_empty() {
            cloud::forget_key()
        } else {
            cloud::save_key(&key)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Whether a Stability AI key is saved, without handing it out.
#[tauri::command]
async fn has_cloud_key() -> bool {
    tauri::async_runtime::spawn_blocking(|| cloud::key().is_ok()).await.unwrap_or(false)
}

/// The picture's bytes to hand to bigger.pics: the file itself when it is JPEG, PNG or WebP,
/// otherwise a full-size JPEG made from it (HEIC, TIFF, RAW and the like).
#[tauri::command]
async fn image_bytes(app: tauri::AppHandle, path: String, width: u32, height: u32) -> Result<tauri::ipc::Response, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("thumbs");
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let plain = matches!(
            path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
            Some("jpg") | Some("jpeg") | Some("png") | Some("webp")
        );
        let file = if plain { path } else { thumbs::thumbnail(&path, width.max(height), &cache_dir)? };
        std::fs::read(file).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Saves a picture enlarged elsewhere (bigger.pics) beside its original. The bytes are the request's body;
/// the headers name the original (percent-encoded) and the file type. Returns the new file's path.
#[tauri::command]
async fn save_enlarged(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let header = |name: &str| {
        request.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_string).ok_or(format!("{name} saknas"))
    };
    let original = PathBuf::from(popup::percent_decode(&header("x-original")?).ok_or("Ogiltig sökväg")?);
    let ext = match header("x-format")?.as_str() {
        "jpeg" => "jpg",
        "webp" => "webp",
        _ => "png",
    };
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Ingen bild kom tillbaka.".into());
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let output = upscale::copy_path(&original, "förstorad bigger.pics", ext);
        std::fs::write(&output, bytes).map_err(|e| format!("Kunde inte spara den förstorade bilden: {e}"))?;
        // An unmarked copy is still worth keeping.
        let _ = aimark::mark(&output, "bigger.pics");
        Ok(output.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Names the picture being enlarged in bigger.pics, so its Download button saves beside it; none stops it.
#[tauri::command]
fn expect_bigger_pics(original: Option<String>) {
    popup::set_target(original.map(PathBuf::from));
}

/// Fingerprints of the files' contents, to find copies of the same picture.
#[tauri::command]
async fn content_hashes(paths: Vec<String>) -> Result<Vec<Option<String>>, String> {
    tauri::async_runtime::spawn_blocking(move || scan::content_hashes(&paths)).await.map_err(|e| e.to_string())
}

/// Shows the pictures in Finder, selected in their folders.
#[tauri::command]
fn reveal_in_finder(paths: Vec<String>) -> Result<(), String> {
    // Finder opens a window per folder; a handful is plenty.
    let paths: Vec<&String> = paths.iter().filter(|p| std::path::Path::new(p).exists()).take(20).collect();
    if paths.is_empty() {
        return Err("Filen finns inte längre.".into());
    }
    std::process::Command::new("open").arg("-R").args(paths).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Closes the bigger.pics windows once the enlarged picture is back.
#[tauri::command]
fn close_bigger_pics(app: tauri::AppHandle) {
    popup::close_all(&app);
}

/// Brings the bigger.pics window forward from behind the app, to send the picture back.
#[tauri::command]
fn show_bigger_pics(app: tauri::AppHandle) {
    popup::show_all(&app);
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
            cloud_upscale_image,
            save_cloud_key,
            has_cloud_key,
            write_web_page,
            publish_web_page,
            save_host_password,
            has_host_password,
            image_bytes,
            save_enlarged,
            expect_bigger_pics,
            close_bigger_pics,
            show_bigger_pics,
            reveal_in_finder,
            content_hashes
        ])
        // The main window is made here rather than from the config alone, so that it can open bigger.pics
        // in a window still linked to it.
        .setup(|app| {
            let config = app.config().app.windows.first().cloned().ok_or("Fönsterinställningar saknas")?;
            let handle = app.handle().clone();
            tauri::WebviewWindowBuilder::from_config(app, &config)?
                .on_new_window(move |url, features| popup::open(&handle, url, features))
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
