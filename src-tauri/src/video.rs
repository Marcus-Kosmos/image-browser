//! Videos the Mac plays itself (QuickTime .mov, MPEG-4 .mp4 and .m4v): their size and length,
//! read from the file's header boxes without decoding anything.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

pub const VIDEO_EXTENSIONS: &[&str] = &["mov", "mp4", "m4v"];

pub fn is_video(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| VIDEO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VideoInfo {
    /// As shown, i.e. turned when the video is recorded on its side (a phone held upright).
    pub width: u32,
    pub height: u32,
    /// Seconds.
    pub duration: f64,
}

/// The moov box holds the description of the tracks; it is small, but a damaged file shouldn't make us read gigabytes.
const MOOV_LIMIT: u64 = 64 * 1024 * 1024;

/// Size and length of the video, or None when the file has no video track we can read.
pub fn info(path: &Path) -> Option<VideoInfo> {
    let mut file = File::open(path).ok()?;
    let end = file.metadata().ok()?.len();
    let moov = find_moov(&mut file, end)?;
    parse_moov(&moov)
}

/// Reads the top level boxes one by one (the moov box may come after gigabytes of picture data) and returns moov's contents.
fn find_moov(file: &mut File, end: u64) -> Option<Vec<u8>> {
    let mut at = 0u64;
    while at + 8 <= end {
        file.seek(SeekFrom::Start(at)).ok()?;
        let mut head = [0u8; 16];
        file.read_exact(&mut head[..8]).ok()?;
        let mut size = u32::from_be_bytes(head[0..4].try_into().ok()?) as u64;
        let kind: [u8; 4] = head[4..8].try_into().ok()?;
        let mut header = 8u64;
        if size == 1 {
            file.read_exact(&mut head[8..16]).ok()?;
            size = u64::from_be_bytes(head[8..16].try_into().ok()?);
            header = 16;
        } else if size == 0 {
            size = end - at;
        }
        if size < header {
            return None;
        }
        if &kind == b"moov" {
            let len = size - header;
            if len > MOOV_LIMIT {
                return None;
            }
            let mut body = vec![0u8; len as usize];
            file.read_exact(&mut body).ok()?;
            return Some(body);
        }
        at += size;
    }
    None
}

/// The boxes directly inside `data`, as (type, contents).
fn boxes(data: &[u8]) -> Vec<(&[u8], &[u8])> {
    let mut found = Vec::new();
    let mut at = 0usize;
    while at + 8 <= data.len() {
        let mut size = u32::from_be_bytes(data[at..at + 4].try_into().unwrap()) as usize;
        let kind = &data[at + 4..at + 8];
        let mut header = 8;
        if size == 1 {
            if at + 16 > data.len() {
                break;
            }
            size = u64::from_be_bytes(data[at + 8..at + 16].try_into().unwrap()) as usize;
            header = 16;
        } else if size == 0 {
            size = data.len() - at;
        }
        if size < header || at + size > data.len() {
            break;
        }
        found.push((kind, &data[at + header..at + size]));
        at += size;
    }
    found
}

fn child<'a>(data: &'a [u8], kind: &[u8]) -> Option<&'a [u8]> {
    boxes(data).into_iter().find(|(k, _)| *k == kind).map(|(_, body)| body)
}

fn u32_at(data: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(data.get(at..at + 4)?.try_into().ok()?))
}

fn u64_at(data: &[u8], at: usize) -> Option<u64> {
    Some(u64::from_be_bytes(data.get(at..at + 8)?.try_into().ok()?))
}

fn parse_moov(moov: &[u8]) -> Option<VideoInfo> {
    let duration = child(moov, b"mvhd").and_then(movie_duration).unwrap_or(0.0);
    for (kind, trak) in boxes(moov) {
        if kind != b"trak" {
            continue;
        }
        let is_video = child(trak, b"mdia")
            .and_then(|mdia| child(mdia, b"hdlr"))
            .and_then(|hdlr| hdlr.get(8..12))
            .is_some_and(|handler| handler == b"vide");
        if !is_video {
            continue;
        }
        if let Some((width, height)) = child(trak, b"tkhd").and_then(track_size) {
            return Some(VideoInfo { width, height, duration });
        }
    }
    None
}

/// mvhd: version and flags, two dates, the time scale, then the length in its units.
fn movie_duration(mvhd: &[u8]) -> Option<f64> {
    let (scale, length) = if mvhd.first()? == &1 {
        (u32_at(mvhd, 20)?, u64_at(mvhd, 24)?)
    } else {
        (u32_at(mvhd, 12)?, u32_at(mvhd, 16)? as u64)
    };
    (scale > 0).then(|| length as f64 / scale as f64)
}

/// tkhd: after the dates, ids and volume comes a 3×3 matrix that turns the picture, then the size in 16.16 fixed point.
fn track_size(tkhd: &[u8]) -> Option<(u32, u32)> {
    let dates = if tkhd.first()? == &1 { 36 } else { 24 };
    let matrix = dates + 16;
    let size = matrix + 36;
    let width = u32_at(tkhd, size)? >> 16;
    let height = u32_at(tkhd, size + 4)? >> 16;
    if width == 0 || height == 0 {
        return None;
    }
    // A quarter turn has a = d = 0 in the matrix [a b u; c d v; x y w].
    let a = u32_at(tkhd, matrix)? as i32;
    let d = u32_at(tkhd, matrix + 16)? as i32;
    Some(if a == 0 && d == 0 { (height, width) } else { (width, height) })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn boxed(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut out = ((body.len() + 8) as u32).to_be_bytes().to_vec();
        out.extend_from_slice(kind);
        out.extend_from_slice(body);
        out
    }

    fn tkhd(width: u32, height: u32, turned: bool) -> Vec<u8> {
        let mut body = vec![0u8; 24 + 16];
        let one = 0x0001_0000i32;
        let matrix: [i32; 9] = if turned {
            [0, one, 0, -one, 0, 0, 0, 0, 0x4000_0000]
        } else {
            [one, 0, 0, 0, one, 0, 0, 0, 0x4000_0000]
        };
        for m in matrix {
            body.extend_from_slice(&m.to_be_bytes());
        }
        body.extend_from_slice(&(width << 16).to_be_bytes());
        body.extend_from_slice(&(height << 16).to_be_bytes());
        boxed(b"tkhd", &body)
    }

    fn trak(handler: &[u8; 4], tkhd: Vec<u8>) -> Vec<u8> {
        let mut hdlr = vec![0u8; 8];
        hdlr.extend_from_slice(handler);
        hdlr.extend_from_slice(&[0u8; 12]);
        let mdia = boxed(b"mdia", &boxed(b"hdlr", &hdlr));
        boxed(b"trak", &[tkhd, mdia].concat())
    }

    fn movie(turned: bool) -> Vec<u8> {
        let mut mvhd = vec![0u8; 12];
        mvhd.extend_from_slice(&600u32.to_be_bytes());
        mvhd.extend_from_slice(&(600u32 * 12 + 300).to_be_bytes());
        mvhd.extend_from_slice(&[0u8; 80]);
        let moov = boxed(
            b"moov",
            &[
                boxed(b"mvhd", &mvhd),
                trak(b"soun", tkhd(0, 0, false)),
                trak(b"vide", tkhd(1920, 1080, turned)),
            ]
            .concat(),
        );
        // The moov box after the picture data, as cameras write it.
        [boxed(b"ftyp", b"qt  \0\0\0\0qt  "), boxed(b"mdat", &[7u8; 5000]), moov].concat()
    }

    #[test]
    fn reads_size_turn_and_length() {
        let dir = std::env::temp_dir().join(format!("ib-video-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let wide = dir.join("a.mov");
        let upright = dir.join("b.MP4");
        let broken = dir.join("c.mp4");
        std::fs::write(&wide, movie(false)).unwrap();
        std::fs::write(&upright, movie(true)).unwrap();
        std::fs::write(&broken, b"not a movie").unwrap();

        assert_eq!(info(&wide), Some(VideoInfo { width: 1920, height: 1080, duration: 12.5 }));
        assert_eq!(info(&upright).map(|i| (i.width, i.height)), Some((1080, 1920)));
        assert_eq!(info(&broken), None);
        assert!(is_video(&upright));
        assert!(!is_video(&dir.join("x.mkv")));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
