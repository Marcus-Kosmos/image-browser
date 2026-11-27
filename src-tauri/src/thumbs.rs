use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// The cache may grow to this size; then the thumbnails used longest ago are removed
/// until it is down to four fifths of it.
pub const CACHE_LIMIT: u64 = 1024 * 1024 * 1024;
/// How many new thumbnails between checks of the cache's size.
const TIDY_EVERY: usize = 64;
static MADE: AtomicUsize = AtomicUsize::new(0);

/// Formats the web view shows as they are, so a picture no larger than what is asked for needs no copy.
const SHOWN_AS_IS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp"];

/// FNV-1a: unlike Rust's own hasher it is the same in every version of the app,
/// so an update finds the thumbnails the last version made.
fn fnv(parts: &[&[u8]]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for part in parts {
        for byte in part.iter() {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash ^= 0xff;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// The picture's longest side as shown (after EXIF rotation), when its header can be read.
fn longest_side(src: &Path) -> Option<u32> {
    crate::scan::display_dimensions(src).map(|(w, h)| w.max(h))
}

/// A file the web view can show for the picture at `size` pixels on its longest side: the original
/// itself when it is a format the web view reads and no larger than that, otherwise a cached thumbnail.
pub fn for_display(src: &Path, size: u32, cache_dir: &Path) -> Result<PathBuf, String> {
    let shown_as_is = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| SHOWN_AS_IS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false);
    if shown_as_is && longest_side(src).is_some_and(|longest| longest <= size) {
        return Ok(src.to_path_buf());
    }
    thumbnail(src, size, cache_dir)
}

/// Returns the path to a cached JPEG thumbnail whose longest side is `size` pixels (never more than
/// the picture's own), creating it if the source changed or no thumbnail exists yet.
///
/// Each picture has at most one file per size: its name starts with the picture's path and the size,
/// and ends with a mark of the file's state, so a changed picture replaces its old thumbnail.
pub fn thumbnail(src: &Path, size: u32, cache_dir: &Path) -> Result<PathBuf, String> {
    let meta = fs::metadata(src).map_err(|e| e.to_string())?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Never enlarge: a thumbnail as large as the picture is the largest that makes sense.
    let size = match longest_side(src) {
        Some(longest) if longest > 0 => size.min(longest),
        _ => size,
    };

    let quality = quality_for(size);
    let path_bytes = src.to_string_lossy();
    let id = fnv(&[path_bytes.as_bytes()]);
    let state = fnv(&[&mtime.to_le_bytes(), &meta.len().to_le_bytes(), &[quality]]) as u32;
    let prefix = format!("{id:016x}-{size}-");
    // Spread over 256 folders by the first two hex digits, so no folder gets long to look through.
    let shelf = cache_dir.join(&prefix[..2]);
    let out = shelf.join(format!("{prefix}{state:08x}.jpg"));
    if out.exists() {
        // Mark it as used, so clearing room removes the thumbnails not looked at for longest.
        if let Ok(file) = fs::File::options().write(true).open(&out) {
            let _ = file.set_modified(SystemTime::now());
        }
        return Ok(out);
    }

    fs::create_dir_all(&shelf).map_err(|e| e.to_string())?;
    // Write to a temporary name first so a half-written file is never served.
    let tmp = shelf.join(format!("{prefix}{state:08x}.tmp.jpg"));
    let made = render(src, size, quality, &tmp).and_then(|_| fs::rename(&tmp, &out).map_err(|e| e.to_string()));
    if made.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    made?;
    remove_older(&shelf, &prefix, &out);
    if MADE.fetch_add(1, Ordering::Relaxed) % TIDY_EVERY == TIDY_EVERY - 1 {
        let dir = cache_dir.to_path_buf();
        std::thread::spawn(move || tidy(&dir, CACHE_LIMIT));
    }
    Ok(out)
}

/// Removes thumbnails of an earlier version of the same picture at the same size.
fn remove_older(shelf: &Path, prefix: &str, keep: &Path) {
    let Ok(entries) = fs::read_dir(shelf) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_older = path != keep && entry.file_name().to_str().is_some_and(|n| n.starts_with(prefix));
        if is_older {
            let _ = fs::remove_file(path);
        }
    }
}

/// Keeps the cache tidy: removes files from earlier versions of the app (named by a hash alone) and
/// half-written ones, then, if the rest takes more than `limit`, the thumbnails used longest ago.
/// Returns how many bytes the cache takes afterwards.
pub fn tidy(cache_dir: &Path, limit: u64) -> u64 {
    let Ok(entries) = fs::read_dir(cache_dir) else { return 0 };
    let mut kept: Vec<(SystemTime, u64, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            if let Ok(shelf) = fs::read_dir(&path) {
                for entry in shelf.flatten() {
                    let file = entry.path();
                    let Ok(meta) = entry.metadata() else { continue };
                    let current = entry.file_name().to_str().is_some_and(is_current_name);
                    if meta.is_file() && current {
                        kept.push((meta.modified().unwrap_or(UNIX_EPOCH), meta.len(), file));
                    } else if meta.is_file() && !being_written(&meta) {
                        let _ = fs::remove_file(&file);
                    }
                }
            }
        } else {
            // Loose files are from earlier versions of the app, which kept every thumbnail here.
            let _ = fs::remove_file(&path);
        }
    }
    let mut total: u64 = kept.iter().map(|(_, len, _)| len).sum();
    if total <= limit {
        return total;
    }
    let keep = limit / 10 * 8;
    kept.sort_by_key(|(used, _, _)| *used);
    for (_, len, path) in kept {
        if total <= keep {
            break;
        }
        if fs::remove_file(&path).is_ok() {
            total -= len;
        }
    }
    total
}

/// A half-written thumbnail from the last minute may still be in the making.
fn being_written(meta: &fs::Metadata) -> bool {
    meta.modified().ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age.as_secs() < 60)
}

/// `<16 hex>-<size>-<8 hex>.jpg`, the names `thumbnail` gives; anything else is left over.
fn is_current_name(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".jpg") else { return false };
    let parts: Vec<&str> = stem.split('-').collect();
    let hex = |s: &str, len: usize| s.len() == len && s.chars().all(|c| c.is_ascii_hexdigit());
    parts.len() == 3 && hex(parts[0], 16) && !parts[1].is_empty() && parts[1].chars().all(|c| c.is_ascii_digit()) && hex(parts[2], 8)
}

/// Grid thumbnails stay small on disk; the large ones shown in full screen keep their detail.
fn quality_for(size: u32) -> u8 {
    if size >= 2000 {
        92
    } else {
        80
    }
}

/// macOS ships `sips`, which reads every format Preview can open (HEIC, RAW, ...)
/// and keeps the EXIF orientation that WebKit then honours. Files it can't convert
/// fall back to the built-in decoder.
#[cfg(target_os = "macos")]
fn render(src: &Path, size: u32, quality: u8, out: &Path) -> Result<(), String> {
    if crate::video::is_video(src) {
        return render_video(src, size, quality, out);
    }
    render_with_sips(src, size, quality, out)
        .or_else(|_| render_with_image(src, size, quality, out))
}

/// A still from the video, made by Quick Look (`qlmanage`, the same one Finder uses for its previews), then
/// turned into a JPEG by `sips`.
#[cfg(target_os = "macos")]
fn render_video(src: &Path, size: u32, quality: u8, out: &Path) -> Result<(), String> {
    let failed = || format!("Kunde inte göra en stillbild av {}", src.display());
    let work = out.with_extension("ql");
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let made = (|| {
        let status = std::process::Command::new("/usr/bin/qlmanage")
            .args(["-t", "-s", &size.to_string(), "-o"])
            .arg(&work)
            .arg(src)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| e.to_string())?;
        // It names the still after the file, with .png added.
        let still = fs::read_dir(&work)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|e| e.path())
            .find(|p| p.extension().is_some_and(|e| e == "png"));
        match still {
            Some(still) if status.success() => render_with_sips(&still, size, quality, out),
            _ => Err(failed()),
        }
    })();
    let _ = fs::remove_dir_all(&work);
    made
}

#[cfg(not(target_os = "macos"))]
fn render(src: &Path, size: u32, quality: u8, out: &Path) -> Result<(), String> {
    if crate::video::is_video(src) {
        return Err(format!("Ingen stillbild av videon {}", src.display()));
    }
    render_with_image(src, size, quality, out)
}

#[cfg(target_os = "macos")]
fn render_with_sips(src: &Path, size: u32, quality: u8, out: &Path) -> Result<(), String> {
    let status = std::process::Command::new("/usr/bin/sips")
        .args([
            "-Z",
            &size.to_string(),
            "-s",
            "format",
            "jpeg",
            "-s",
            "formatOptions",
            &quality.to_string(),
        ])
        .arg(src)
        .arg("--out")
        .arg(out)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() && out.exists() {
        Ok(())
    } else {
        Err(format!("Kunde inte skapa miniatyr för {}", src.display()))
    }
}

fn render_with_image(src: &Path, size: u32, quality: u8, out: &Path) -> Result<(), String> {
    let img = image::open(src).map_err(|e| e.to_string())?;
    let file = fs::File::create(out).map_err(|e| e.to_string())?;
    let mut encoder =
        image::codecs::jpeg::JpegEncoder::new_with_quality(std::io::BufWriter::new(file), quality);
    encoder
        .encode_image(&img.thumbnail(size, size).to_rgb8())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caches_thumbnail_and_reuses_it() {
        let dir = std::env::temp_dir().join(format!("ib-thumb-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let src = dir.join("src.png");
        image::RgbImage::from_pixel(400, 200, image::Rgb([200, 10, 10]))
            .save(&src)
            .unwrap();

        let cache = dir.join("cache");
        let first = thumbnail(&src, 100, &cache).unwrap();
        let second = thumbnail(&src, 100, &cache).unwrap();
        assert_eq!(first, second);

        let thumb = image::open(&first).unwrap();
        assert_eq!((thumb.width(), thumb.height()), (100, 50));
        fs::remove_dir_all(&dir).unwrap();
    }

    fn test_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ib-thumb-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn files_in(dir: &Path) -> usize {
        fs::read_dir(dir).map(|e| e.count()).unwrap_or(0)
    }

    #[test]
    fn a_changed_picture_replaces_its_thumbnail() {
        let dir = test_dir("changed");
        let src = dir.join("src.png");
        let cache = dir.join("cache");
        image::RgbImage::from_pixel(400, 200, image::Rgb([200, 10, 10])).save(&src).unwrap();
        let first = thumbnail(&src, 100, &cache).unwrap();
        image::RgbImage::from_pixel(400, 300, image::Rgb([10, 200, 10])).save(&src).unwrap();
        let second = thumbnail(&src, 100, &cache).unwrap();
        assert_ne!(first, second);
        assert!(!first.exists());
        assert_eq!(files_in(first.parent().unwrap()), 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn never_enlarges_and_shows_small_originals_as_they_are() {
        let dir = test_dir("small");
        let src = dir.join("src.png");
        let cache = dir.join("cache");
        image::RgbImage::from_pixel(300, 150, image::Rgb([1, 2, 3])).save(&src).unwrap();
        let thumb = thumbnail(&src, 2560, &cache).unwrap();
        let made = image::open(&thumb).unwrap();
        assert_eq!((made.width(), made.height()), (300, 150));
        assert_eq!(for_display(&src, 2560, &cache).unwrap(), src);
        assert_ne!(for_display(&src, 100, &cache).unwrap(), src);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn tidy_removes_old_files_then_the_least_recently_used() {
        let dir = test_dir("tidy");
        fs::write(dir.join("0123456789abcdef.jpg"), vec![0u8; 10]).unwrap();
        let shelf = dir.join("00");
        fs::create_dir_all(&shelf).unwrap();
        let half = shelf.join("0023456789abcdef-100-01234567.tmp.jpg");
        fs::write(&half, vec![0u8; 10]).unwrap();
        let old = shelf.join("0000000000000001-800-00000001.jpg");
        let new = shelf.join("0000000000000002-800-00000002.jpg");
        fs::write(&old, vec![0u8; 600]).unwrap();
        fs::write(&new, vec![0u8; 600]).unwrap();
        let past = SystemTime::now() - std::time::Duration::from_secs(3600);
        fs::File::options().write(true).open(&old).unwrap().set_modified(past).unwrap();
        fs::File::options().write(true).open(&half).unwrap().set_modified(past).unwrap();

        assert_eq!(tidy(&dir, 1000), 600);
        assert!(!old.exists());
        assert!(new.exists());
        assert_eq!(files_in(&dir), 1);
        assert_eq!(files_in(&shelf), 1);
        tidy(&dir, 0);
        assert_eq!(files_in(&shelf), 0);
        fs::remove_dir_all(&dir).unwrap();
    }
}

/// A few pixels from each picture, read from its grid thumbnail, for working out the colors a set of
/// pictures has in common. Pictures that cannot be read are left out.
pub fn sample_colors(paths: &[PathBuf], cache_dir: &Path) -> Vec<[u8; 3]> {
    let mut colors = Vec::new();
    for path in paths {
        let Ok(thumb) = thumbnail(path, 800, cache_dir) else { continue };
        let Ok(picture) = image::open(&thumb) else { continue };
        let small = picture.thumbnail_exact(24, 24).to_rgb8();
        colors.extend(small.pixels().map(|p| p.0));
    }
    colors
}
