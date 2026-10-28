//! Enlarging a picture with Stability AI's generative upscalers, which recognise what the picture shows
//! and draw in detail to match. The picture is sent to Stability AI; the key is kept in the Mac's keychain.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Deserialize;

use crate::{thumbs, upscale};

const API: &str = "https://api.stability.ai/v2beta";

/// The service's address; tests point it at a stand-in.
fn api() -> String {
    std::env::var("IMAGIME_STABILITY_API").unwrap_or_else(|_| API.to_string())
}
/// Used when the user describes nothing: the models need a description to work from.
const DEFAULT_PROMPT: &str = "A sharp, detailed, high quality photograph";

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// Stays close to the original, adding only what it is sure of.
    Conservative,
    /// Reimagines detail more freely; for small or very soft pictures.
    Creative,
}

impl Mode {
    /// The most pixels the service takes in for this mode.
    fn max_pixels(self) -> u64 {
        match self {
            Mode::Conservative => 9_437_184,
            Mode::Creative => 1_048_576,
        }
    }

    fn path(self) -> &'static str {
        match self {
            Mode::Conservative => "conservative",
            Mode::Creative => "creative",
        }
    }
}

/// The longest side to send so the picture stays within the service's pixel limit; never larger than it is.
pub fn send_size(width: u32, height: u32, max_pixels: u64) -> u32 {
    let longest = width.max(height).max(1);
    let pixels = width as u64 * height as u64;
    if pixels <= max_pixels {
        return longest;
    }
    let scale = (max_pixels as f64 / pixels as f64).sqrt();
    ((longest as f64 * scale).floor() as u32).max(64)
}

/// Creativity is 0 to 1 in the app; each mode takes its own range.
fn creativity(mode: Mode, amount: f32) -> f32 {
    let amount = amount.clamp(0.0, 1.0);
    let (low, high) = match mode {
        Mode::Conservative => (0.2, 0.5),
        Mode::Creative => (0.1, 0.5),
    };
    ((low + (high - low) * amount) * 100.0).round() / 100.0
}

/// What went wrong, in words, from the service's answer.
fn explain(status: u16, body: &str) -> String {
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("errors")?.as_array()?.first()?.as_str().map(str::to_string))
        .unwrap_or_default();
    match status {
        401 | 403 => "API-nyckeln godtogs inte. Kontrollera den under Förstora bilden.".into(),
        402 => "Kontot hos Stability AI har inga krediter kvar. Fyll på på platform.stability.ai.".into(),
        413 => "Bilden är för stor för tjänsten.".into(),
        429 => "För många förfrågningar just nu. Vänta en minut och försök igen.".into(),
        _ if !detail.is_empty() => format!("Stability AI: {detail}"),
        _ => format!("Stability AI svarade med fel {status}."),
    }
}

/// Sends the picture to Stability AI and saves the enlarged copy beside the original. Returns its path.
pub fn enlarge(
    input: &Path,
    width: u32,
    height: u32,
    mode: Mode,
    prompt: &str,
    amount: f32,
    key: &str,
    cache_dir: &Path,
) -> Result<PathBuf, String> {
    // A JPEG within the pixel limit, made the same way as the app's own large previews (HEIC and RAW included).
    let size = send_size(width, height, mode.max_pixels());
    let sent = thumbs::thumbnail(input, size, cache_dir)?;
    let bytes = std::fs::read(&sent).map_err(|e| e.to_string())?;
    let prompt = if prompt.trim().is_empty() { DEFAULT_PROMPT } else { prompt.trim() };
    let jpeg = matches!(
        input.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("jpg") | Some("jpeg") | Some("heic") | Some("heif")
    );
    let format = if jpeg { "jpeg" } else { "png" };

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    let form = reqwest::blocking::multipart::Form::new()
        .part(
            "image",
            reqwest::blocking::multipart::Part::bytes(bytes).file_name("bild.jpg").mime_str("image/jpeg").unwrap(),
        )
        .text("prompt", prompt.to_string())
        .text("creativity", creativity(mode, amount).to_string())
        .text("output_format", format);
    let accept = if mode == Mode::Conservative { "image/*" } else { "application/json" };
    let response = client
        .post(format!("{}/stable-image/upscale/{}", api(), mode.path()))
        .bearer_auth(key.trim())
        .header("Accept", accept)
        .multipart(form)
        .send()
        .map_err(|e| format!("Kunde inte nå Stability AI: {e}"))?;
    let status = response.status().as_u16();
    if !response.status().is_success() {
        return Err(explain(status, &response.text().unwrap_or_default()));
    }

    let image = match mode {
        Mode::Conservative => response.bytes().map_err(|e| e.to_string())?.to_vec(),
        // The creative upscaler answers with an id to ask for the result until it is done.
        Mode::Creative => {
            #[derive(Deserialize)]
            struct Started {
                id: String,
            }
            let id = response.json::<Started>().map_err(|e| e.to_string())?.id;
            let started = Instant::now();
            loop {
                std::thread::sleep(Duration::from_secs(5));
                let result = client
                    .get(format!("{}/results/{id}", api()))
                    .bearer_auth(key.trim())
                    .header("Accept", "image/*")
                    .send()
                    .map_err(|e| format!("Kunde inte nå Stability AI: {e}"))?;
                match result.status().as_u16() {
                    202 if started.elapsed() < Duration::from_secs(300) => continue,
                    202 => return Err("Stability AI blev inte klar inom fem minuter.".into()),
                    200 => break result.bytes().map_err(|e| e.to_string())?.to_vec(),
                    status => return Err(explain(status, &result.text().unwrap_or_default())),
                }
            }
        }
    };

    let label = match mode {
        Mode::Conservative => "förstorad AI",
        Mode::Creative => "förstorad AI kreativ",
    };
    let output = upscale::copy_path(input, label, if jpeg { "jpg" } else { "png" });
    std::fs::write(&output, image).map_err(|e| format!("Kunde inte spara den förstorade bilden: {e}"))?;
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_picture_within_the_pixel_limit() {
        assert_eq!(send_size(800, 600, 1_048_576), 800);
        let side = send_size(4000, 3000, 1_048_576);
        let other = side * 3 / 4;
        assert!(side as u64 * other as u64 <= 1_048_576 && side > 1100, "{side}");
        assert_eq!(send_size(2400, 3200, 9_437_184), 3200);
        assert_eq!(send_size(3000, 4000, 9_437_184), 3547);
    }

    #[test]
    fn maps_creativity_to_each_mode() {
        assert_eq!(creativity(Mode::Conservative, 0.0), 0.2);
        assert_eq!(creativity(Mode::Conservative, 0.5), 0.35);
        assert_eq!(creativity(Mode::Creative, 1.0), 0.5);
        assert_eq!(creativity(Mode::Creative, 2.0), 0.5);
    }

    /// Against a stand-in for the service at IMAGIME_STABILITY_API.
    #[test]
    #[ignore]
    fn sends_the_picture_and_saves_the_answer() {
        let dir = std::env::temp_dir().join(format!("ib-cloud-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("Hus.png");
        image::RgbImage::from_pixel(1600, 1200, image::Rgb([20, 120, 200])).save(&src).unwrap();
        for mode in [Mode::Conservative, Mode::Creative] {
            let made = enlarge(&src, 1600, 1200, mode, "", 0.5, "sk-test", &dir.join("cache")).unwrap();
            assert!(made.to_string_lossy().contains("Hus förstorad AI"), "{made:?}");
            assert_eq!(std::fs::read(&made).unwrap(), b"ENLARGED");
        }
        let err = enlarge(&src, 1600, 1200, Mode::Conservative, "", 0.5, "fel", &dir.join("cache")).unwrap_err();
        assert!(err.contains("API-nyckeln"), "{err}");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn explains_the_services_errors() {
        assert!(explain(402, "").contains("krediter"));
        assert_eq!(explain(400, r#"{"errors":["prompt: too long"]}"#), "Stability AI: prompt: too long");
    }
}

#[cfg(target_os = "macos")]
fn keychain() -> Result<keyring::Entry, String> {
    keyring::Entry::new("Imagime Stability AI", "api-nyckel").map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
pub fn save_key(key: &str) -> Result<(), String> {
    keychain()?.set_password(key.trim()).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
pub fn forget_key() -> Result<(), String> {
    match keychain()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(target_os = "macos")]
pub fn key() -> Result<String, String> {
    keychain()?
        .get_password()
        .map_err(|_| "Ingen API-nyckel för Stability AI finns sparad.".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn save_key(_key: &str) -> Result<(), String> {
    Err("API-nyckeln kan bara sparas på Mac.".into())
}

#[cfg(not(target_os = "macos"))]
pub fn forget_key() -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn key() -> Result<String, String> {
    Err("Ingen API-nyckel för Stability AI finns sparad.".into())
}
