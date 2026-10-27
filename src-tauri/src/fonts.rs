/// Family names of the fonts installed on the system, sorted, without duplicates
/// and without hidden system families (those starting with a dot).
pub fn installed_families() -> Vec<String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut families: Vec<String> = db
        .faces()
        .filter_map(|face| face.families.first().map(|(name, _)| name.clone()))
        .filter(|name| !name.is_empty() && !name.starts_with('.'))
        .collect();
    families.sort_by_key(|name| name.to_lowercase());
    families.dedup();
    families
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_sorted_unique_families() {
        let families = installed_families();
        let mut sorted = families.clone();
        sorted.sort_by_key(|name| name.to_lowercase());
        sorted.dedup();
        assert_eq!(families, sorted);
        assert!(families.iter().all(|f| !f.starts_with('.')));
    }
}
