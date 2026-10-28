//! Windows that pages open with `window.open`. bigger.pics opens in a window of the app's own, kept linked
//! to the page that opened it so the two can pass the picture back and forth; any other address opens in
//! the default browser.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use tauri::webview::{DownloadEvent, NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Emitter, Runtime, Url, WebviewUrl, WebviewWindowBuilder};

use crate::upscale;

static COUNT: AtomicUsize = AtomicUsize::new(0);

/// The picture being enlarged in bigger.pics right now; a download from there is saved beside it.
static TARGET: Mutex<Option<PathBuf>> = Mutex::new(None);
/// Where each download in progress goes, by address, and whether it is the enlarged picture.
static DOWNLOADS: Mutex<Option<HashMap<String, (PathBuf, bool)>>> = Mutex::new(None);

/// Names the picture sent to bigger.pics, or none when the app no longer waits for it.
pub fn set_target(original: Option<PathBuf>) {
    *TARGET.lock().unwrap() = original;
}

/// The file type of a download, from its suggested name: JPEG, WebP or PNG.
fn download_extension(suggested: &Path) -> &'static str {
    match suggested.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("jpg") | Some("jpeg") => "jpg",
        Some("webp") => "webp",
        _ => "png",
    }
}

/// Saves bigger.pics' downloads: the enlarged picture beside its original, anything else in Downloads.
/// When the picture is saved the app is told, and the bigger.pics window closes.
fn on_download<R: Runtime>(webview: tauri::Webview<R>, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { url, destination } => {
            let target = TARGET.lock().unwrap().clone();
            let enlarged = target.is_some();
            if let Some(original) = target {
                *destination = upscale::copy_path(&original, "förstorad bigger.pics", download_extension(destination));
            }
            let mut downloads = DOWNLOADS.lock().unwrap();
            downloads.get_or_insert_with(HashMap::new).insert(url.to_string(), (destination.clone(), enlarged));
            true
        }
        DownloadEvent::Finished { url, success, .. } => {
            let saved = DOWNLOADS.lock().unwrap().get_or_insert_with(HashMap::new).remove(url.as_str());
            match saved {
                Some((path, true)) if success => {
                    set_target(None);
                    let _ = webview.emit_to("main", "bigger-pics-saved", path.to_string_lossy());
                    let _ = webview.window().close();
                }
                Some((path, false)) if success => {
                    let _ = std::process::Command::new("open").arg("-R").arg(path).spawn();
                }
                _ => {}
            }
            true
        }
        _ => true,
    }
}

/// Whether the address belongs to bigger.pics, the only site opened inside the app.
pub fn is_bigger_pics(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host_str().is_some_and(|host| host == "bigger.pics" || host.ends_with(".bigger.pics"))
}

/// Opens web addresses in the default browser; anything else is ignored.
fn open_in_browser(url: &Url) {
    if matches!(url.scheme(), "http" | "https") {
        let _ = std::process::Command::new("open").arg(url.as_str()).spawn();
    }
}

pub fn open<R: Runtime>(app: &AppHandle<R>, url: Url, features: NewWindowFeatures) -> NewWindowResponse<R> {
    if !is_bigger_pics(&url) {
        open_in_browser(&url);
        return NewWindowResponse::Deny;
    }
    let label = format!("bigger-pics-{}", COUNT.fetch_add(1, Ordering::Relaxed));
    // WebKit loads the address itself into the window handed back, keeping the link to the opener.
    let built = WebviewWindowBuilder::new(app, label, WebviewUrl::External("about:blank".parse().unwrap()))
        .title("bigger.pics")
        .inner_size(1180.0, 820.0)
        .window_features(features)
        .on_download(on_download)
        // Links and ads inside bigger.pics open in the browser, not in more app windows.
        .on_new_window(|url, _| {
            open_in_browser(&url);
            NewWindowResponse::Deny
        })
        .build();
    match built {
        Ok(window) => NewWindowResponse::Create { window },
        Err(_) => NewWindowResponse::Deny,
    }
}

/// Undoes `encodeURIComponent`, which carries a file path in a request header.
pub fn percent_decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_type_follows_the_suggested_name() {
        assert_eq!(download_extension(Path::new("/x/stanlem.JPEG")), "jpg");
        assert_eq!(download_extension(Path::new("/x/stanlem-4x.webp")), "webp");
        assert_eq!(download_extension(Path::new("/x/stanlem")), "png");
    }

    #[test]
    fn opens_only_bigger_pics_inside_the_app() {
        assert!(is_bigger_pics(&"https://bigger.pics/".parse().unwrap()));
        assert!(is_bigger_pics(&"https://app.bigger.pics/x".parse().unwrap()));
        assert!(!is_bigger_pics(&"http://bigger.pics/".parse().unwrap()));
        assert!(!is_bigger_pics(&"https://bigger.pics.evil.com/".parse().unwrap()));
        assert!(!is_bigger_pics(&"https://notbigger.pics/".parse().unwrap()));
    }

    #[test]
    fn reads_paths_back_from_headers() {
        assert_eq!(percent_decode("%2FBilder%2FS%C3%B6der%20sj%C3%B6n.jpg").unwrap(), "/Bilder/Söder sjön.jpg");
        assert!(percent_decode("%2").is_none());
    }
}
