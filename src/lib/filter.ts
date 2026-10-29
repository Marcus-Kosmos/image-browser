import type { ImageEntry } from "./api";
import type { Library } from "./library";

/** A tag on an image: the favorites or a series it is in. */
export interface Tag {
  /** "favorites" or "series:<id>". */
  key: string;
  name: string;
}

export type DateRange = "all" | "today" | "week" | "month" | "year";

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: "Alla datum",
  today: "I dag",
  week: "Senaste veckan",
  month: "Senaste månaden",
  year: "Senaste året",
};

export interface ImageFilter {
  /** Matched against file names and tag names. */
  text: string;
  /** Images must carry every one of these tags. */
  tags: string[];
  since: DateRange;
  /** Newest changed file first, rather than the folder's or series' own order. */
  newestFirst: boolean;
  /** Only pictures there is more than one copy of, the copies side by side. */
  duplicates: boolean;
}

export const NO_FILTER: ImageFilter = { text: "", tags: [], since: "all", newestFirst: false, duplicates: false };

export function isFiltering(filter: ImageFilter) {
  return (
    filter.text.trim() !== "" ||
    filter.tags.length > 0 ||
    filter.since !== "all" ||
    filter.newestFirst ||
    filter.duplicates
  );
}

/** Pictures that might be copies of each other, before their contents are compared: same size in bytes and pixels. */
export function possibleDuplicates(images: ImageEntry[]) {
  const bySize = new Map<string, ImageEntry[]>();
  for (const img of images) {
    const key = `${img.size}:${img.width}x${img.height}`;
    bySize.set(key, [...(bySize.get(key) ?? []), img]);
  }
  return [...bySize.values()].filter((group) => group.length > 1).flat();
}

/**
 * The pictures with the same contents as another one, grouped so copies sit side by side, in the order
 * each group's first picture had. `hashes` holds a fingerprint of the contents by path.
 */
export function keepDuplicates(images: ImageEntry[], hashes: Map<string, string>) {
  const groups = new Map<string, ImageEntry[]>();
  for (const img of images) {
    const hash = hashes.get(img.path);
    if (hash) groups.set(hash, [...(groups.get(hash) ?? []), img]);
  }
  return [...groups.values()].filter((group) => group.length > 1).flat();
}

/**
 * Every copy but one of each picture that is there more than once: the one kept is the first that
 * `keep` likes (one in Favoriter or a series, say), else the first.
 */
export function extraCopies(images: ImageEntry[], hashes: Map<string, string>, keep: (img: ImageEntry) => boolean) {
  const groups = new Map<string, ImageEntry[]>();
  for (const img of images) {
    const hash = hashes.get(img.path);
    if (hash) groups.set(hash, [...(groups.get(hash) ?? []), img]);
  }
  return [...groups.values()].flatMap((group) => {
    const kept = group.find(keep) ?? group[0];
    return group.length > 1 ? group.filter((img) => img !== kept) : [];
  });
}

/** Tags and earliest added time of every image in the library, by path. */
export function libraryIndex(library: Library, includeHidden: boolean) {
  const tags = new Map<string, Tag[]>();
  const added = new Map<string, number>();
  const visit = (images: ImageEntry[], tag: Tag) => {
    for (const img of images) {
      tags.set(img.path, [...(tags.get(img.path) ?? []), tag]);
      if (img.added !== undefined) added.set(img.path, Math.min(added.get(img.path) ?? Infinity, img.added));
    }
  };
  if (includeHidden || !library.favoritesPrivacy?.hidden) visit(library.favorites, { key: "favorites", name: "Favoriter" });
  for (const s of library.series) {
    if (includeHidden || !s.hidden) visit(s.images, { key: `series:${s.id}`, name: s.name });
  }
  return { tags, added };
}

const DAY = 24 * 60 * 60 * 1000;

function startOf(range: DateRange, now: number) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  switch (range) {
    case "today":
      return today.getTime();
    case "week":
      return now - 7 * DAY;
    case "month":
      return now - 30 * DAY;
    case "year":
      return now - 365 * DAY;
    default:
      return -Infinity;
  }
}

/**
 * The images that match. An image's date is when it was first put in the favorites
 * or a series, or the file's date for images that are in neither.
 */
export function filterImages(
  images: ImageEntry[],
  filter: ImageFilter,
  index: ReturnType<typeof libraryIndex>,
  now = Date.now(),
) {
  if (!isFiltering(filter)) return images;
  const text = filter.text.trim().toLocaleLowerCase("sv");
  const since = startOf(filter.since, now);
  const matching = images.filter((img) => {
    const tags = index.tags.get(img.path) ?? [];
    if (!filter.tags.every((key) => tags.some((t) => t.key === key))) return false;
    const date = index.added.get(img.path) ?? img.modified * 1000;
    if (date < since) return false;
    if (!text) return true;
    return (
      img.name.toLocaleLowerCase("sv").includes(text) ||
      tags.some((t) => t.name.toLocaleLowerCase("sv").includes(text))
    );
  });
  return filter.newestFirst ? matching.sort((a, b) => b.modified - a.modified) : matching;
}
