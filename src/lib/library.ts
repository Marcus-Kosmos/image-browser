import { useCallback, useState } from "react";
import type { ImageEntry } from "./api";

/** A named, ordered selection of images, shown with its own layout settings. */
export interface Series {
  id: string;
  name: string;
  images: ImageEntry[];
}

/** Favorite images and saved series, across all folders. */
export interface Library {
  favorites: ImageEntry[];
  series: Series[];
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

/** Appends images that aren't in the list yet, keeping the list's order. */
function appendNew(list: ImageEntry[], images: ImageEntry[]) {
  const paths = new Set(list.map((img) => img.path));
  return [...list, ...images.filter((img) => !paths.has(img.path) && paths.add(img.path))];
}

export function toggleFavorite(library: Library, image: ImageEntry): Library {
  const has = library.favorites.some((img) => img.path === image.path);
  return {
    ...library,
    favorites: has ? library.favorites.filter((img) => img.path !== image.path) : [...library.favorites, image],
  };
}

export function createSeries(library: Library, id: string, name: string, images: ImageEntry[]): Library {
  return { ...library, series: [...library.series, { id, name, images: appendNew([], images) }] };
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

export function toggleInSeries(library: Library, id: string, image: ImageEntry): Library {
  return updateSeries(library, id, (s) => ({
    ...s,
    images: s.images.some((img) => img.path === image.path)
      ? s.images.filter((img) => img.path !== image.path)
      : [...s.images, image],
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
