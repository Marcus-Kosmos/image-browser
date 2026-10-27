import { thumbnailUrl, type ImageEntry } from "./api";

/** Longest side of grid thumbnails; large enough for the biggest row height on a Retina screen. */
export const GRID_THUMB_SIZE = 800;
export const VIEWER_THUMB_SIZE = 2560;

const MAX_CONCURRENT = 6;
const cache = new Map<string, string>();
const queue: Array<{ key: string; run: () => void }> = [];
let active = 0;

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!;
    active++;
    job.run();
  }
}

/**
 * Loads a thumbnail through a small queue so scrolling a big folder doesn't start
 * hundreds of conversions at once. The returned `cancel` drops it if it hasn't started.
 */
export function requestThumbnail(
  image: ImageEntry,
  size: number,
  onReady: (url: string) => void,
): () => void {
  const key = `${image.path}|${image.modified}|${size}`;
  const cached = cache.get(key);
  if (cached) {
    onReady(cached);
    return () => {};
  }

  let cancelled = false;
  const job = {
    key,
    run: () => {
      thumbnailUrl(image, size)
        .then((url) => {
          cache.set(key, url);
          if (!cancelled) onReady(url);
        })
        .catch(() => {})
        .finally(() => {
          active--;
          pump();
        });
    },
  };
  queue.push(job);
  pump();

  return () => {
    cancelled = true;
    const idx = queue.indexOf(job);
    if (idx >= 0) queue.splice(idx, 1);
  };
}
