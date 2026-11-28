//! Finds pictures again after their folder was moved, renamed, or zipped and unzipped elsewhere.
//! A picture is recognised by its file name and its size in bytes, which both survive a move,
//! a copy and a round trip through a zip file. When copies turn up in several folders, the
//! folder that holds most of the missing pictures wins, so a series comes back from one place.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

/// A picture the library remembers but that is no longer where it was.
#[derive(Debug, Deserialize)]
pub struct Wanted {
    pub path: String,
    pub name: String,
    pub size: u64,
}

/// Where each wanted picture is now, looked up with Spotlight across the whole Mac.
pub fn locate(wanted: &[Wanted]) -> Vec<Option<String>> {
    let candidates = spotlight(wanted);
    choose(wanted, &candidates)
}

/// Where each wanted picture is now, looking only in `root` and the folders inside it.
pub fn locate_in(root: &Path, wanted: &[Wanted]) -> Vec<Option<String>> {
    let names: std::collections::HashSet<&str> = wanted.iter().map(|w| w.name.as_str()).collect();
    let mut found = Vec::new();
    walk(root, &names, &mut found, 0);
    choose(wanted, &found)
}

fn walk(dir: &Path, names: &std::collections::HashSet<&str>, found: &mut Vec<PathBuf>, depth: usize) {
    // Deep enough for any photo archive, and it can't run away on a strange disk.
    if depth > 12 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            if !crate::scan::is_package(&path) {
                walk(&path, names, found, depth + 1);
            }
        } else if names.contains(name.as_str()) {
            found.push(path);
        }
    }
}

/// Files with the wanted names that Spotlight knows of. Empty where Spotlight isn't there.
fn spotlight(wanted: &[Wanted]) -> Vec<PathBuf> {
    let mut names: Vec<&str> = wanted.iter().map(|w| w.name.as_str()).collect();
    names.sort_unstable();
    names.dedup();
    let mut found = Vec::new();
    // A few dozen names per question keeps each query short.
    for group in names.chunks(40) {
        let query = group
            .iter()
            .map(|n| format!("kMDItemFSName == \"{}\"", n.replace('\\', "\\\\").replace('"', "\\\"")))
            .collect::<Vec<_>>()
            .join(" || ");
        let Ok(out) = std::process::Command::new("mdfind").arg("-0").arg(&query).output() else {
            return found;
        };
        found.extend(
            out.stdout
                .split(|b| *b == 0)
                .filter(|p| !p.is_empty())
                .map(|p| PathBuf::from(String::from_utf8_lossy(p).into_owned())),
        );
    }
    found
}

/// Somewhere a lost picture should never be brought back from.
fn unwanted(path: &Path) -> bool {
    let text = path.to_string_lossy();
    text.contains("/.Trash/")
        || text.contains("/.Trashes/")
        || text.contains("/Library/Caches/")
        || path.ancestors().skip(1).any(crate::scan::is_package)
}

/// Picks, for each wanted picture, the found file with its name and size, preferring the folder
/// where most of the wanted pictures turned up, then one with the same folder name as before.
pub fn choose(wanted: &[Wanted], found: &[PathBuf]) -> Vec<Option<String>> {
    let mut by_name: HashMap<&str, Vec<(&Path, u64)>> = HashMap::new();
    for path in found {
        if unwanted(path) {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        let Ok(meta) = fs::metadata(path) else { continue };
        if meta.is_file() {
            by_name.entry(name).or_default().push((path.as_path(), meta.len()));
        }
    }
    let matches: Vec<Vec<&Path>> = wanted
        .iter()
        .map(|w| {
            let mut paths: Vec<&Path> = by_name
                .get(w.name.as_str())
                .map(|list| list.iter().filter(|(p, size)| *size == w.size && p.to_string_lossy() != w.path).map(|(p, _)| *p).collect())
                .unwrap_or_default();
            paths.sort();
            paths.dedup();
            paths
        })
        .collect();
    let mut votes: HashMap<&Path, usize> = HashMap::new();
    for paths in &matches {
        for parent in paths.iter().filter_map(|p| p.parent()) {
            *votes.entry(parent).or_default() += 1;
        }
    }
    wanted
        .iter()
        .zip(&matches)
        .map(|(w, paths)| {
            let old_folder = Path::new(&w.path).parent().and_then(|p| p.file_name());
            paths
                .iter()
                .max_by_key(|p| {
                    let parent = p.parent();
                    let votes = parent.and_then(|d| votes.get(d)).copied().unwrap_or(0);
                    let same_name = parent.and_then(|d| d.file_name()) == old_folder;
                    // Ties go to the first in sorted order, so the choice is the same every time.
                    (votes, same_name, std::cmp::Reverse(p.to_string_lossy().into_owned()))
                })
                .map(|p| p.to_string_lossy().into_owned())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wanted(path: &str, size: u64) -> Wanted {
        Wanted { path: path.into(), name: Path::new(path).file_name().unwrap().to_string_lossy().into(), size }
    }

    fn write(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![7u8; bytes]).unwrap();
    }

    #[test]
    fn finds_a_moved_folder_by_name_and_size() {
        let root = std::env::temp_dir().join(format!("imagime-relink-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        // The series was made from /old/Resa; the folder was zipped and unzipped as "Resa 2".
        write(&root.join("Resa 2/a.jpg"), 10);
        write(&root.join("Resa 2/b.jpg"), 20);
        // Another picture with the same name but other contents elsewhere.
        write(&root.join("Annat/a.jpg"), 99);
        // A copy of a.jpg alone in some folder: the folder with both pictures should win.
        write(&root.join("Kopia/a.jpg"), 10);
        // Never from the trash.
        write(&root.join(".Trash/c.jpg"), 30);
        let want = [wanted("/old/Resa/a.jpg", 10), wanted("/old/Resa/b.jpg", 20), wanted("/old/Resa/c.jpg", 30)];
        let found = locate_in(&root, &want);
        let resa = root.join("Resa 2");
        assert_eq!(found[0].as_deref(), Some(resa.join("a.jpg").to_string_lossy().as_ref()));
        assert_eq!(found[1].as_deref(), Some(resa.join("b.jpg").to_string_lossy().as_ref()));
        assert_eq!(found[2], None);
        fs::remove_dir_all(&root).unwrap();
    }
}
