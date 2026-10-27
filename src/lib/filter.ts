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
}

export const NO_FILTER: ImageFilter = { text: "", tags: [], since: "all" };

export function isFiltering(filter: ImageFilter) {
  return filter.text.trim() !== "" || filter.tags.length > 0 || filter.since !== "all";
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
  return images.filter((img) => {
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
}
