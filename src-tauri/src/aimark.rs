//! Marks pictures enlarged with AI, and finds the mark again. The mark is the IPTC "digital source type"
//! in the picture's XMP metadata, the standard way to say a picture was made or changed by AI, which
//! Photoshop, Lightroom and many web sites read. The picture itself is left as it is.

use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// IPTC's term for a picture that combines a real one with what a trained model added.
const SOURCE_TYPE: &str = "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia";
/// In every IPTC term for AI-made or AI-changed pictures, whoever wrote it, and in C2PA content credentials.
const SIGN: &[u8] = b"rainedAlgorithmicMedia";
/// Only in the marks Imagime writes itself (see `xmp`).
const OWN: &[u8] = b"Imagime, AI-";
const XMP_ID: &[u8] = b"http://ns.adobe.com/xap/1.0/\0";
/// Where the mark is looked for: the start of the file, and for WebP, whose metadata comes last, the end.
const HEAD: u64 = 128 * 1024;
const TAIL: u64 = 32 * 1024;

fn xmp(tool: &str) -> String {
    let tool = tool.replace('&', "&amp;").replace('<', "&lt;").replace('"', "&quot;");
    format!(
        "<?xpacket begin=\"\u{feff}\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\
<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\
<rdf:Description rdf:about=\"\" xmlns:Iptc4xmpExt=\"http://iptc.org/std/Iptc4xmpExt/2008-02-29/\" \
xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\" Iptc4xmpExt:DigitalSourceType=\"{SOURCE_TYPE}\" \
xmp:CreatorTool=\"Imagime, AI-förstoring med {tool}\"/></rdf:RDF></x:xmpmeta><?xpacket end=\"w\"?>"
    )
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}

/// Who made a picture with AI, according to its metadata.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AiKind {
    /// Enlarged with AI in Imagime.
    Imagime,
    /// Made or changed with AI elsewhere, and marked so by that program.
    Other,
}

fn kind_in(bytes: &[u8]) -> Option<AiKind> {
    if !contains(bytes, SIGN) {
        return None;
    }
    Some(if contains(bytes, OWN) { AiKind::Imagime } else { AiKind::Other })
}

/// Whether the file says it was made or changed by AI, and by whom.
pub fn ai_kind(path: &Path) -> Option<AiKind> {
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut head = Vec::new();
    file.by_ref().take(HEAD).read_to_end(&mut head).ok()?;
    if let Some(kind) = kind_in(&head) {
        return Some(kind);
    }
    if len > HEAD && head.starts_with(b"RIFF") {
        let mut tail = Vec::new();
        let start = len.saturating_sub(TAIL).max(HEAD);
        file.seek(SeekFrom::Start(start)).ok()?;
        file.take(TAIL).read_to_end(&mut tail).ok()?;
        return kind_in(&tail);
    }
    None
}

/// Writes the AI mark into the picture's metadata, naming the tool that enlarged it.
pub fn mark(path: &Path, tool: &str) -> Result<(), String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    if contains(&bytes[..bytes.len().min(HEAD as usize)], SIGN) {
        return Ok(());
    }
    let packet = xmp(tool);
    let marked = if bytes.starts_with(&[0xFF, 0xD8]) {
        mark_jpeg(&bytes, &packet)
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        mark_png(&bytes, &packet)
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        mark_webp(&bytes, &packet)
    } else {
        None
    }
    .ok_or("Kunde inte märka bilden som AI-förstorad.")?;
    std::fs::write(path, marked).map_err(|e| e.to_string())
}

/// An APP1 segment with the XMP, after the JFIF or Exif segments that must come first.
fn mark_jpeg(bytes: &[u8], packet: &str) -> Option<Vec<u8>> {
    let mut at = 2;
    while bytes.get(at) == Some(&0xFF) && matches!(bytes.get(at + 1), Some(0xE0) | Some(0xE1)) {
        let len = u16::from_be_bytes([*bytes.get(at + 2)?, *bytes.get(at + 3)?]) as usize;
        at += 2 + len;
    }
    let body = [XMP_ID, packet.as_bytes()].concat();
    let len = u16::try_from(body.len() + 2).ok()?;
    let mut out = Vec::with_capacity(bytes.len() + body.len() + 4);
    out.extend_from_slice(bytes.get(..at)?);
    out.extend_from_slice(&[0xFF, 0xE1]);
    out.extend_from_slice(&len.to_be_bytes());
    out.extend_from_slice(&body);
    out.extend_from_slice(&bytes[at..]);
    Some(out)
}

/// An iTXt chunk with the XMP, right after the header chunk.
fn mark_png(bytes: &[u8], packet: &str) -> Option<Vec<u8>> {
    let ihdr_end = 8 + 4 + 4 + 13 + 4;
    if bytes.get(12..16) != Some(b"IHDR") || bytes.len() < ihdr_end {
        return None;
    }
    // Keyword, then no compression and empty language and translated keyword.
    let data = [b"XML:com.adobe.xmp\0\0\0\0\0".as_slice(), packet.as_bytes()].concat();
    let kind_and_data = [b"iTXt".as_slice(), &data].concat();
    let mut out = Vec::with_capacity(bytes.len() + data.len() + 12);
    out.extend_from_slice(&bytes[..ihdr_end]);
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(&kind_and_data);
    out.extend_from_slice(&crc32(&kind_and_data).to_be_bytes());
    out.extend_from_slice(&bytes[ihdr_end..]);
    Some(out)
}

/// An "XMP " chunk at the end, turning a simple WebP into the extended kind that may carry metadata.
fn mark_webp(bytes: &[u8], packet: &str) -> Option<Vec<u8>> {
    let mut body = bytes.get(12..)?.to_vec();
    if body.get(..4) == Some(b"VP8X") {
        body[8] |= 0x04;
    } else {
        let (width, height) = webp_size(&body)?;
        let mut vp8x = b"VP8X".to_vec();
        vp8x.extend_from_slice(&10u32.to_le_bytes());
        vp8x.extend_from_slice(&[0x04, 0, 0, 0]);
        vp8x.extend_from_slice(&(width - 1).to_le_bytes()[..3]);
        vp8x.extend_from_slice(&(height - 1).to_le_bytes()[..3]);
        body.splice(0..0, vp8x);
    }
    body.extend_from_slice(b"XMP ");
    body.extend_from_slice(&(packet.len() as u32).to_le_bytes());
    body.extend_from_slice(packet.as_bytes());
    if packet.len() % 2 == 1 {
        body.push(0);
    }
    let mut out = b"RIFF".to_vec();
    out.extend_from_slice(&((body.len() + 4) as u32).to_le_bytes());
    out.extend_from_slice(b"WEBP");
    out.extend_from_slice(&body);
    Some(out)
}

/// Width and height from a simple WebP's single VP8 or VP8L chunk.
fn webp_size(body: &[u8]) -> Option<(u32, u32)> {
    let data = body.get(8..)?;
    match body.get(..4)? {
        b"VP8 " => {
            let w = u16::from_le_bytes([*data.get(6)?, *data.get(7)?]) & 0x3FFF;
            let h = u16::from_le_bytes([*data.get(8)?, *data.get(9)?]) & 0x3FFF;
            Some((w as u32, h as u32))
        }
        b"VP8L" => {
            let bits = u32::from_le_bytes([*data.get(1)?, *data.get(2)?, *data.get(3)?, *data.get(4)?]);
            Some(((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1))
        }
        _ => None,
    }
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 == 1 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(name: &str, format: image::ImageFormat) {
        let dir = std::env::temp_dir().join(format!("ib-aimark-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        image::RgbImage::from_pixel(40, 30, image::Rgb([200, 80, 20])).save_with_format(&path, format).unwrap();
        assert_eq!(ai_kind(&path), None);
        mark(&path, "bigger.pics").unwrap();
        assert_eq!(ai_kind(&path), Some(AiKind::Imagime));
        // Still a picture of the same size, and marking again changes nothing.
        let picture = image::open(&path).unwrap();
        assert_eq!((picture.width(), picture.height()), (40, 30));
        let once = std::fs::read(&path).unwrap();
        mark(&path, "bigger.pics").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), once);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn marks_jpeg() {
        roundtrip("a.jpg", image::ImageFormat::Jpeg);
    }

    #[test]
    fn marks_png() {
        roundtrip("a.png", image::ImageFormat::Png);
    }

    #[test]
    fn marks_webp() {
        roundtrip("a.webp", image::ImageFormat::WebP);
    }

    #[test]
    fn tells_other_programs_marks_apart() {
        let other = b"<x:xmpmeta>Iptc4xmpExt:DigitalSourceType=\"http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia\" xmp:CreatorTool=\"Adobe Firefly\"</x:xmpmeta>";
        assert_eq!(kind_in(other), Some(AiKind::Other));
        assert_eq!(kind_in(xmp("Stability AI").as_bytes()), Some(AiKind::Imagime));
        assert_eq!(kind_in(b"just a picture"), None);
    }

    #[test]
    fn png_checksum_is_right() {
        assert_eq!(crc32(b"IEND"), 0xAE42_6082);
    }
}
