//! Imagime updates itself from the releases on GitHub. A version the app downloads on its own is not
//! marked as "from the internet" by macOS, so it opens without the Gatekeeper questions a dmg gets.
//!
//! Every build on main is published as a release (`v0.1.N`) and is offered automatically. Every pull
//! request build is published as a pre-release (`test-pr-N`) that can be picked by hand, to try a change
//! before it is merged. Both carry a `latest.json` that the updater plugin reads.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri::Url;

const REPO: &str = "Marcus-Kosmos/image-browser";

/// The key that checks each update was made by this repository's builds. It is given to the build on
/// GitHub; a build made without it (on a developer's computer) cannot update itself.
pub const PUBKEY: &str = match option_env!("IMAGIME_UPDATER_PUBKEY") {
    Some(key) => key,
    None => "",
};

/// The update found by the last check, kept until it is installed.
#[derive(Default)]
pub struct Pending(Mutex<Option<Update>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    version: String,
    notes: Option<String>,
}

/// A pull request build that can be tried.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestVersion {
    tag: String,
    title: String,
    date: String,
}

pub fn enabled() -> bool {
    !PUBKEY.trim().is_empty()
}

fn endpoint(tag: Option<&str>) -> Result<Url, String> {
    let url = match tag {
        None => format!("https://github.com/{REPO}/releases/latest/download/latest.json"),
        Some(tag) => {
            if !tag.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') {
                return Err("Okänd version.".into());
            }
            format!("https://github.com/{REPO}/releases/download/{tag}/latest.json")
        }
    };
    Url::parse(&url).map_err(|e| e.to_string())
}

/// Looks for a version to install. `tag` picks a test version, otherwise the newest main version.
/// With `any_version` a version is offered even when it is older than this one (to go back from a
/// test version); otherwise only a newer one.
pub async fn check<R: Runtime>(
    app: &AppHandle<R>,
    tag: Option<String>,
    any_version: bool,
) -> Result<Option<Found>, String> {
    if !enabled() {
        return Err("Den här versionen av Imagime kan inte uppdatera sig själv. Installera en version från GitHub först.".into());
    }
    let mut builder = app.updater_builder().endpoints(vec![endpoint(tag.as_deref())?]).map_err(|e| e.to_string())?;
    if any_version {
        builder = builder.version_comparator(|current, remote| remote.version != current);
    }
    let update = builder
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| format!("Kunde inte söka efter uppdateringar: {e}"))?;
    let found = update.as_ref().map(|u| Found { version: u.version.clone(), notes: u.body.clone() });
    *app.state::<Pending>().0.lock().unwrap() = update;
    Ok(found)
}

#[derive(Clone, Serialize)]
struct Progress {
    done: u64,
    total: Option<u64>,
}

/// Downloads and installs the update found by the last check, then starts the new version.
pub async fn install<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let update = app
        .state::<Pending>()
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or("Sök efter uppdateringar först.")?;
    let mut done = 0u64;
    let progress = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                done += chunk as u64;
                let _ = progress.emit("update-progress", Progress { done, total });
            },
            || {},
        )
        .await
        .map_err(|e| format!("Kunde inte installera uppdateringen: {e}"))?;
    app.restart();
}

#[derive(serde::Deserialize)]
struct Release {
    tag_name: String,
    name: Option<String>,
    prerelease: bool,
    published_at: Option<String>,
}

/// The pull request builds there are to try, newest first.
pub fn test_versions() -> Result<Vec<TestVersion>, String> {
    let releases: Vec<Release> = reqwest::blocking::Client::new()
        .get(format!("https://api.github.com/repos/{REPO}/releases?per_page=50"))
        .header("User-Agent", "Imagime")
        .header("Accept", "application/vnd.github+json")
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.json())
        .map_err(|e| format!("Kunde inte hämta testversionerna: {e}"))?;
    Ok(releases
        .into_iter()
        .filter(|r| r.prerelease && r.tag_name.starts_with("test-pr-"))
        .map(|r| TestVersion {
            title: r.name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| r.tag_name.clone()),
            tag: r.tag_name,
            date: r.published_at.unwrap_or_default(),
        })
        .collect())
}

/// Adds "Sök efter uppdateringar…" to the app menu (under About), which opens the update dialog.
#[cfg(target_os = "macos")]
pub fn add_menu_item<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    let menu = Menu::default(app.handle())?;
    if let Some(first) = menu.items()?.first().and_then(|item| item.as_submenu().cloned()) {
        let item = MenuItem::with_id(app, "check-updates", "Sök efter uppdateringar…", true, None::<&str>)?;
        first.insert(&item, 1)?;
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id() == "check-updates" {
            let _ = app.emit("open-updates", ());
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::endpoint;

    #[test]
    fn endpoints_point_at_the_releases() {
        assert_eq!(
            endpoint(None).unwrap().as_str(),
            "https://github.com/Marcus-Kosmos/image-browser/releases/latest/download/latest.json"
        );
        assert_eq!(
            endpoint(Some("test-pr-12")).unwrap().as_str(),
            "https://github.com/Marcus-Kosmos/image-browser/releases/download/test-pr-12/latest.json"
        );
        assert!(endpoint(Some("../evil")).is_err());
    }
}
