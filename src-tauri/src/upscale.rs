//! Enlarging a picture with Real-ESRGAN, an AI model that runs on this Mac and fills in plausible detail.
//! The enlarged picture is saved as a new file next to the original, which is left as it is.

use std::path::{Path, PathBuf};
use std::process::Command;

/// How many times wider and taller the enlarged picture is.
pub const SCALE: u32 = 4;
/// Pictures larger than this on their longest side would take long and come out enormous.
pub const MAX_SIDE: u32 = 4000;
const MODEL: &str = "realesrgan-x4plus";

/// Where the enlarged copy goes: "<name> förstorad 4x.<ext>", numbered if that name is taken.
pub fn output_path(input: &Path) -> PathBuf {
    let dir = input.parent().unwrap_or(Path::new("."));
    let stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("bild");
    let ext = output_extension(input);
    let mut candidate = dir.join(format!("{stem} förstorad {SCALE}x.{ext}"));
    let mut n = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{stem} förstorad {SCALE}x {n}.{ext}"));
        n += 1;
    }
    candidate
}

/// The model reads and writes JPEG, PNG and WebP; anything else comes out as PNG.
fn output_extension(input: &Path) -> &'static str {
    match input.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("jpg") | Some("jpeg") => "jpg",
        Some("webp") => "webp",
        _ => "png",
    }
}

fn readable_by_model(input: &Path) -> bool {
    matches!(
        input.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("jpg") | Some("jpeg") | Some("png") | Some("webp")
    )
}

/// Enlarges `input` with the program and model shipped in the app, returning the new file's path.
pub fn enlarge(input: &Path, program: &Path, models: &Path, width: u32, height: u32) -> Result<PathBuf, String> {
    if !program.exists() || !models.exists() {
        return Err("AI-förstoring finns inte i den här versionen av appen.".into());
    }
    if width.max(height) > MAX_SIDE {
        return Err(format!(
            "Bilden är redan stor ({width} × {height}). AI-förstoring är till för bilder upp till {MAX_SIDE} pixlar."
        ));
    }
    let output = output_path(input);
    // HEIC, TIFF and the like go through a PNG copy the model can read.
    let temp = std::env::temp_dir().join(format!("imagime-upscale-{}.png", std::process::id()));
    let source = if readable_by_model(input) {
        input.to_path_buf()
    } else {
        let status = Command::new("sips")
            .args(["-s", "format", "png"])
            .arg(input)
            .arg("--out")
            .arg(&temp)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Kunde inte läsa bilden.".into());
        }
        temp.clone()
    };
    let result = Command::new(program)
        .arg("-i")
        .arg(&source)
        .arg("-o")
        .arg(&output)
        .args(["-n", MODEL, "-s", &SCALE.to_string(), "-f", output_extension(input)])
        .arg("-m")
        .arg(models)
        .output();
    let _ = std::fs::remove_file(&temp);
    let result = result.map_err(|e| format!("Kunde inte starta AI-förstoringen: {e}"))?;
    if !result.status.success() || !output.exists() {
        let _ = std::fs::remove_file(&output);
        let detail = String::from_utf8_lossy(&result.stderr);
        let last = detail.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("okänt fel");
        return Err(format!("AI-förstoringen misslyckades: {last}"));
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn names_the_copy_beside_the_original_without_overwriting() {
        let dir = std::env::temp_dir().join(format!("ib-upscale-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let photo = dir.join("Strand.JPG");
        assert_eq!(output_path(&photo), dir.join("Strand förstorad 4x.jpg"));
        fs::write(dir.join("Strand förstorad 4x.jpg"), b"").unwrap();
        assert_eq!(output_path(&photo), dir.join("Strand förstorad 4x 2.jpg"));
        assert_eq!(output_path(&dir.join("Hus.heic")), dir.join("Hus förstorad 4x.png"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn says_so_when_the_model_is_missing() {
        let err = enlarge(Path::new("/x/a.jpg"), Path::new("/nope"), Path::new("/nope"), 100, 100).unwrap_err();
        assert!(err.contains("finns inte"));
    }
}
