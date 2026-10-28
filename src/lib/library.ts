import { useCallback, useState } from "react";
import type { ImageEntry } from "./api";
import type { ViewerSettings } from "./viewer";

/** Kept out of sight: hidden ones show only on request, locked ones open with Touch ID. */
export interface Privacy {
  hidden?: boolean;
  locked?: boolean;
}

/** A named, ordered selection of images, shown with its own layout settings. */
export interface Series extends Privacy {
  id: string;
  name: string;
  images: ImageEntry[];
  /** The full screen look it was pinned together in, for "Visa som pussel". */
  look?: ViewerSettings;
}

/** A set of folders opened together, saved under a name of its own. */
export interface Place {
  id: string;
  name: string;
  folders: string[];
  recursive: boolean;
}

/** Favorite images, saved series and named folder sets, across all folders. */
export interface Library {
  favorites: ImageEntry[];
  series: Series[];
  favoritesPrivacy?: Privacy;
  places?: Place[];
  /** Folders opened before, so they stay in the sidebar until forgotten. */
  recent?: string[][];
}

export const EMPTY_LIBRARY: Library = { favorites: [], series: [] };

const STORAGE_KEY = "image-browser:library";

export function loadLibrary(): Library {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        series: Array.isArray(parsed.series) ? parsed.series : [],
        favoritesPrivacy: parsed.favoritesPrivacy ?? undefined,
        places: Array.isArray(parsed.places) ? parsed.places : [],
        recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      };
    }
  } catch {
    // Start with an empty library if storage is unavailable or the value is corrupt.
  }
  return EMPTY_LIBRARY;
}

function saveLibrary(library: Library) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch {
    // Ignore storage failures; the library still works for this session.
  }
}

/** The image as stored in a list, with the time it was put there. */
function stamp(image: ImageEntry, added = Date.now()): ImageEntry {
  return { ...image, added };
}

/** Appends images that aren't in the list yet, keeping the list's order. */
function appendNew(list: ImageEntry[], images: ImageEntry[]) {
  const paths = new Set(list.map((img) => img.path));
  const added = Date.now();
  return [...list, ...images.filter((img) => !paths.has(img.path) && paths.add(img.path)).map((img) => stamp(img, added))];
}

export function toggleFavorite(library: Library, image: ImageEntry): Library {
  const has = library.favorites.some((img) => img.path === image.path);
  return {
    ...library,
    favorites: has ? library.favorites.filter((img) => img.path !== image.path) : [...library.favorites, stamp(image)],
  };
}

/** Adds images that aren't favorites yet; unlike toggling, never removes one. */
export function addToFavorites(library: Library, images: ImageEntry[]): Library {
  return { ...library, favorites: appendNew(library.favorites, images) };
}

/** Takes the images out of Favoriter; the files themselves are untouched. */
export function removeFromFavorites(library: Library, images: ImageEntry[]): Library {
  const paths = new Set(images.map((img) => img.path));
  return { ...library, favorites: library.favorites.filter((img) => !paths.has(img.path)) };
}

export function addToSeries(library: Library, id: string, images: ImageEntry[]): Library {
  return updateSeries(library, id, (s) => ({ ...s, images: appendNew(s.images, images) }));
}

export function createSeries(
  library: Library,
  id: string,
  name: string,
  images: ImageEntry[],
  look?: ViewerSettings,
): Library {
  const created: Series = { id, name, images: appendNew([], images), ...(look && { look }) };
  return { ...library, series: [...library.series, created] };
}

function updateSeries(library: Library, id: string, change: (s: Series) => Series): Library {
  return { ...library, series: library.series.map((s) => (s.id === id ? change(s) : s)) };
}

export function renameSeries(library: Library, id: string, name: string): Library {
  return updateSeries(library, id, (s) => ({ ...s, name }));
}

export function deleteSeries(library: Library, id: string): Library {
  return { ...library, series: library.series.filter((s) => s.id !== id) };
}

/** Takes the images out of the series; the files themselves are untouched. */
export function removeFromSeries(library: Library, id: string, images: ImageEntry[]): Library {
  const paths = new Set(images.map((img) => img.path));
  return updateSeries(library, id, (s) => ({ ...s, images: s.images.filter((img) => !paths.has(img.path)) }));
}

export function toggleInSeries(library: Library, id: string, image: ImageEntry): Library {
  return updateSeries(library, id, (s) => ({
    ...s,
    images: s.images.some((img) => img.path === image.path)
      ? s.images.filter((img) => img.path !== image.path)
      : [...s.images, stamp(image)],
  }));
}

/**
 * Moves the image at `from` so that it lands before the image now at `to`;
 * `to` equal to the length moves it last.
 */
export function moveInSeries(library: Library, id: string, from: number, to: number): Library {
  return updateSeries(library, id, (s) => {
    if (from < 0 || from >= s.images.length) return s;
    const target = Math.max(0, Math.min(to, s.images.length)) - (to > from ? 1 : 0);
    if (target === from) return s;
    const images = [...s.images];
    const [moved] = images.splice(from, 1);
    images.splice(target, 0, moved);
    return { ...s, images };
  });
}

/** Forgets an image everywhere, e.g. after it was moved to the trash. */
export function removeImage(library: Library, path: string): Library {
  return {
    ...library,
    favorites: library.favorites.filter((img) => img.path !== path),
    series: library.series.map((s) => ({ ...s, images: s.images.filter((img) => img.path !== path) })),
  };
}

/** Name for a new series that doesn't clash with an existing one: "Resa", "Resa 2", ... */
export function uniqueSeriesName(library: Library, base: string) {
  const names = new Set(library.series.map((s) => s.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function savePlace(library: Library, place: Place): Library {
  return { ...library, places: [...(library.places ?? []), place] };
}

export function renamePlace(library: Library, id: string, name: string): Library {
  return { ...library, places: (library.places ?? []).map((p) => (p.id === id ? { ...p, name } : p)) };
}

export function deletePlace(library: Library, id: string): Library {
  return { ...library, places: (library.places ?? []).filter((p) => p.id !== id) };
}

const folderKey = (folders: string[]) => [...folders].sort().join("\n");

/** The saved place for exactly these folders, if any. */
export function findPlace(library: Library, folders: string[]) {
  const key = folderKey(folders);
  return (library.places ?? []).find((p) => folderKey(p.folders) === key);
}

export const MAX_RECENT = 12;

/** Adds opened folders to the end of the list; ones already listed keep their place. */
export function rememberFolders(library: Library, folders: string[]): Library {
  const recent = library.recent ?? [];
  const key = folderKey(folders);
  if (folders.length === 0 || recent.some((r) => folderKey(r) === key)) return library;
  return { ...library, recent: [...recent, folders].slice(-MAX_RECENT) };
}

export function forgetFolders(library: Library, folders: string[]): Library {
  const key = folderKey(folders);
  return { ...library, recent: (library.recent ?? []).filter((r) => folderKey(r) !== key) };
}

/** The library, saved between sessions. */
export function useLibrary() {
  const [library, setLibrary] = useState<Library>(loadLibrary);
  const change = useCallback((fn: (lib: Library) => Library) => {
    setLibrary((prev) => {
      const next = fn(prev);
      saveLibrary(next);
      return next;
    });
  }, []);
  return { library, change };
}

/** What the gallery shows: the open folders, the favorites or one saved series. */
export type LibraryView = { kind: "folders" } | { kind: "favorites" } | { kind: "series"; id: string };

/** The favorites or one series: the parts of the library that can be hidden or locked. */
export type LibraryItem = Exclude<LibraryView, { kind: "folders" }>;

export function privacyOf(library: Library, item: LibraryView): Privacy {
  if (item.kind === "favorites") return library.favoritesPrivacy ?? {};
  if (item.kind === "series") return library.series.find((s) => s.id === item.id) ?? {};
  return {};
}

export function setPrivacy(library: Library, item: LibraryItem, change: Privacy): Library {
  if (item.kind === "favorites") return { ...library, favoritesPrivacy: { ...library.favoritesPrivacy, ...change } };
  return updateSeries(library, item.id, (s) => ({ ...s, ...change }));
}

/** Identifies a library item, e.g. to remember which one is unlocked. */
export function itemKey(item: LibraryView) {
  return item.kind === "series" ? `series:${item.id}` : item.kind;
}
