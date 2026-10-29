use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Returns the path to a cached JPEG thumbnail whose longest side is `size` pixels,
/// creating it if the source changed or no thumbnail exists yet.
pub fn thumbnail(src: &Path, size: u32, cache_dir: &Path) -> Result<PathBuf, String> {
    let meta = fs::metadata(src).map_err(|e| e.to_string())?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let quality = quality_for(size);
    let mut hasher = DefaultHasher::new();
    (src, mtime, meta.len(), size, quality).hash(&mut hasher);
    let out = cache_dir.join(format!("{:016x}.jpg", hasher.finish()));
    if out.exists() {
        return Ok(out);
    }

    fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    // Write to a temporary name first so a half-written file is never served.
    let tmp = out.with_extension("tmp.jpg");
    render(src, size, quality, &tmp)?;
    fs::rename(&tmp, &out).map_err(|e| e.to_string())?;
    Ok(out)
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
    render_with_sips(src, size, quality, out)
        .or_else(|_| render_with_image(src, size, quality, out))
}

#[cfg(not(target_os = "macos"))]
fn render(src: &Path, size: u32, quality: u8, out: &Path) -> Result<(), String> {
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
