//! A series as a web page: the page and web-sized copies of its pictures, written to a folder.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::thumbs;

/// A picture to put on the page: the original, where its copy goes in the page's folder, and how large.
#[derive(Debug, Deserialize)]
pub struct WebPicture {
    pub path: String,
    pub file: String,
    pub size: u32,
}

/// Writes `index.html` and the pictures into `dir`, returning every file written, relative to `dir`.
pub fn write_page(dir: &Path, html: &str, pictures: &[WebPicture], cache_dir: &Path) -> Result<Vec<String>, String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("index.html"), html).map_err(|e| e.to_string())?;
    let mut written = vec!["index.html".to_string()];
    for picture in pictures {
        let target = safe_join(dir, &picture.file)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let copy = thumbs::thumbnail(Path::new(&picture.path), picture.size, cache_dir)?;
        fs::copy(&copy, &target).map_err(|e| e.to_string())?;
        written.push(picture.file.clone());
    }
    Ok(written)
}

/// `dir` joined with a relative path from the page, refusing anything that would leave `dir`.
fn safe_join(dir: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if rel.is_absolute() || rel.components().any(|c| !matches!(c, std::path::Component::Normal(_))) {
        return Err(format!("Ogiltigt filnamn: {relative}"));
    }
    Ok(dir.join(rel))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_page_files_inside_their_folder() {
        let dir = Path::new("/tmp/page");
        assert_eq!(safe_join(dir, "bilder/001-a.jpg").unwrap(), dir.join("bilder/001-a.jpg"));
        assert!(safe_join(dir, "../x.jpg").is_err());
        assert!(safe_join(dir, "/etc/x").is_err());
    }
}
