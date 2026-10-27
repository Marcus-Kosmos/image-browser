use std::fs;
use std::io::BufReader;
use std::path::{Path, PathBuf};
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

/// Lists the images in `dir`. With `recursive`, images in subfolders follow those
/// of their parent, folder by folder in natural order.
pub fn scan_folder(dir: &Path, recursive: bool) -> Result<FolderListing, String> {
    let mut images = Vec::new();
    let subfolders = scan_dir(dir, recursive, &mut images)
        .map_err(|e| format!("Kunde inte läsa mappen: {e}"))?;
    Ok(FolderListing {
        path: dir.to_string_lossy().into_owned(),
        images,
        subfolders: subfolders.iter().map(|p| p.to_string_lossy().into_owned()).collect(),
    })
}

/// Appends the images of `dir` (and its subfolders when `recursive`) to `images`
/// and returns its direct subfolders.
fn scan_dir(dir: &Path, recursive: bool, images: &mut Vec<ImageEntry>) -> std::io::Result<Vec<PathBuf>> {
    let mut own = Vec::new();
    let mut subfolders = Vec::new();

    for entry in fs::read_dir(dir)? {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        // Doesn't follow symlinks, so a link back up the tree can't loop forever.
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            // Skip macOS packages such as Photos libraries and apps, which look like folders.
            if path.extension().is_none() {
                subfolders.push(path);
            }
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
        own.push(ImageEntry {
            path: path.to_string_lossy().into_owned(),
            name,
            width,
            height,
            size: meta.len(),
            modified,
        });
    }

    own.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    images.extend(own);
    subfolders.sort_by(|a, b| natural_cmp(&a.to_string_lossy(), &b.to_string_lossy()));

    if recursive {
        for sub in &subfolders {
            // An unreadable subfolder shouldn't hide the rest.
            let _ = scan_dir(sub, true, images);
        }
    }
    Ok(subfolders)
}

fn display_dimensions(path: &Path) -> Option<(u32, u32)> {
    // imagesize only reads the header; fall back to a full decoder for unusual files.
    let (w, h) = match imagesize::size(path) {
        Ok(size) => (size.width as u32, size.height as u32),
        Err(_) => image::image_dimensions(path).ok()?,
    };
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

#[cfg(test)]
mod format_tests {
    use super::*;

    #[test]
    fn scans_png_and_webp() {
        let dir = std::env::temp_dir().join(format!("ib-scan-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let img = image::RgbaImage::from_pixel(300, 200, image::Rgba([10, 200, 10, 128]));
        img.save(dir.join("a.png")).unwrap();
        image::DynamicImage::ImageRgba8(img.clone()).save(dir.join("b.webp")).unwrap();
        img.save(dir.join("C.PNG")).unwrap();
        let listing = scan_folder(&dir, false).unwrap();
        let names: Vec<_> = listing.images.iter().map(|i| (i.name.as_str(), i.width, i.height)).collect();
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(names, vec![("a.png", 300, 200), ("b.webp", 300, 200), ("C.PNG", 300, 200)]);
    }
}

#[cfg(test)]
mod recursive_tests {
    use super::*;

    #[test]
    fn includes_subfolders_in_order_when_recursive() {
        let dir = std::env::temp_dir().join(format!("ib-rec-test-{}", std::process::id()));
        let img = image::RgbImage::from_pixel(20, 10, image::Rgb([1, 2, 3]));
        for rel in ["b.png", "a.png", "Sub 10/x.png", "Sub 2/y.png", "Sub 2/Deep/z.png", "Pics.photoslibrary/p.png", ".hidden/h.png"] {
            let p = dir.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            img.save(&p).unwrap();
        }
        let rel = |l: &FolderListing| -> Vec<String> {
            l.images.iter().map(|i| i.path.strip_prefix(&format!("{}/", dir.display())).unwrap().to_string()).collect()
        };

        let flat = scan_folder(&dir, false).unwrap();
        let deep = scan_folder(&dir, true).unwrap();
        fs::remove_dir_all(&dir).unwrap();

        assert_eq!(rel(&flat), vec!["a.png", "b.png"]);
        assert_eq!(rel(&deep), vec!["a.png", "b.png", "Sub 2/y.png", "Sub 2/Deep/z.png", "Sub 10/x.png"]);
        assert_eq!(deep.subfolders.len(), 2);
    }
}
