use std::fs;
use std::io::BufReader;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

pub const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif", "tif", "tiff", "bmp",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageEntry {
    pub path: String,
    pub name: String,
    /// Display width, i.e. after applying EXIF rotation.
    pub width: u32,
    pub height: u32,
    pub size: u64,
    pub modified: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderListing {
    pub path: String,
    pub images: Vec<ImageEntry>,
    pub subfolders: Vec<String>,
}

pub fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn scan_folder(dir: &Path) -> Result<FolderListing, String> {
    let mut images = Vec::new();
    let mut subfolders = Vec::new();

    for entry in fs::read_dir(dir).map_err(|e| format!("Kunde inte läsa mappen: {e}"))? {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            subfolders.push(path.to_string_lossy().into_owned());
            continue;
        }
        if !is_image(&path) {
            continue;
        }
        // Files we cannot read the dimensions of are skipped rather than failing the whole folder.
        let Some((width, height)) = display_dimensions(&path) else { continue };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        images.push(ImageEntry {
            path: path.to_string_lossy().into_owned(),
            name,
            width,
            height,
            size: meta.len(),
            modified,
        });
    }

    images.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    subfolders.sort_by(|a, b| natural_cmp(a, b));

    Ok(FolderListing {
        path: dir.to_string_lossy().into_owned(),
        images,
        subfolders,
    })
}

fn display_dimensions(path: &Path) -> Option<(u32, u32)> {
    let size = imagesize::size(path).ok()?;
    let (w, h) = (size.width as u32, size.height as u32);
    if w == 0 || h == 0 {
        return None;
    }
    // EXIF orientations 5-8 rotate the image a quarter turn, so width and height swap.
    match exif_orientation(path) {
        Some(5..=8) => Some((h, w)),
        _ => Some((w, h)),
    }
}

fn exif_orientation(path: &Path) -> Option<u32> {
    let file = fs::File::open(path).ok()?;
    let exif = exif::Reader::new()
        .read_from_container(&mut BufReader::new(file))
        .ok()?;
    exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)?
        .value
        .get_uint(0)
}

/// Compares names so that "img2" sorts before "img10".
pub fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let (mut a, mut b) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (a.peek(), b.peek()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, _) => return std::cmp::Ordering::Less,
            (_, None) => return std::cmp::Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let na: String = std::iter::from_fn(|| a.next_if(|c| c.is_ascii_digit())).collect();
                let nb: String = std::iter::from_fn(|| b.next_if(|c| c.is_ascii_digit())).collect();
                let ord = na
                    .trim_start_matches('0')
                    .len()
                    .cmp(&nb.trim_start_matches('0').len())
                    .then_with(|| na.trim_start_matches('0').cmp(nb.trim_start_matches('0')));
                if ord != std::cmp::Ordering::Equal {
                    return ord;
                }
            }
            (Some(_), Some(_)) => {
                let (x, y) = (a.next().unwrap(), b.next().unwrap());
                let ord = x.to_lowercase().cmp(y.to_lowercase());
                if ord != std::cmp::Ordering::Equal {
                    return ord;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn natural_sort_orders_numbers_by_value() {
        let mut names = vec!["img10.jpg", "img2.jpg", "Img1.jpg", "img02b.jpg"];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(names, vec!["Img1.jpg", "img2.jpg", "img02b.jpg", "img10.jpg"]);
    }

    #[test]
    fn recognises_image_extensions_case_insensitively() {
        assert!(is_image(Path::new("a/B.HEIC")));
        assert!(is_image(Path::new("photo.jpeg")));
        assert!(!is_image(Path::new("notes.txt")));
    }
}
