import { useEffect } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface ImageEntry {
  path: string;
  name: string;
  width: number;
  height: number;
  size: number;
  modified: number;
  /** When it was put in the favorites or a series (ms), for those lists. */
  added?: number;
}

export interface FolderListing {
  path: string;
  images: ImageEntry[];
  subfolders: string[];
}

/** Outside Tauri (plain `npm run dev` in a browser) the app runs against generated demo images. */
const demo = !isTauri();

/** Lets the user pick one or more folders (⌘-click in the dialog). */
export async function pickFolders(): Promise<string[]> {
  if (demo) return ["/Demo/Bilder", "/Demo/Bilder/Studio"];
  const result = await open({ directory: true, multiple: true, title: "Välj en eller flera bildmappar" });
  if (result === null) return [];
  return Array.isArray(result) ? result : [result];
}

/** Lists a folder's images; with `recursive`, those in all its subfolders too. */
export async function scanFolder(path: string, recursive: boolean): Promise<FolderListing> {
  if (demo) {
    const listing = demoListing(path);
    if (recursive) listing.images.push(...listing.subfolders.flatMap((s) => demoListing(s).images));
    return listing;
  }
  return invoke<FolderListing>("scan_folder", { path, recursive });
}

/** Returns a URL the webview can load for a thumbnail with the given longest side. */
export async function thumbnailUrl(image: ImageEntry, size: number): Promise<string> {
  if (demo) return demoImage(image);
  const file = await invoke<string>("thumbnail", { path: image.path, size });
  return convertFileSrc(file);
}

/** URL of the file itself, for zooming in beyond the largest thumbnail. */
export function originalUrl(image: ImageEntry): string {
  return demo ? demoImage(image) : convertFileSrc(image.path);
}

export interface Dropped {
  folders: string[];
  images: string[];
}

/** Splits paths dropped from Finder into folders and image files; anything else is left out. */
export async function sortDropped(paths: string[]): Promise<Dropped> {
  if (demo) {
    const isImage = (p: string) => /\.(jpe?g|png|heic|webp|gif|tiff?)$/i.test(p);
    return { folders: paths.filter((p) => !p.includes(".")), images: paths.filter(isImage) };
  }
  return invoke<Dropped>("sort_dropped", { paths });
}

export type DropState = "over" | "left" | { dropped: string[] };

/**
 * Follows files and folders dragged onto the window from Finder.
 * In the browser demo, `window.demoDragOver()` and `window.demoDrop(paths)` stand in for Finder.
 */
export function onFileDrop(handler: (state: DropState) => void): () => void {
  if (demo) {
    const hooks = window as unknown as { demoDrop: (paths: string[]) => void; demoDragOver: () => void };
    hooks.demoDrop = (paths) => handler({ dropped: paths });
    hooks.demoDragOver = () => handler("over");
    return () => {};
  }
  let unlisten: (() => void) | null = null;
  let stopped = false;
  void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "drop") handler({ dropped: payload.paths });
        else if (payload.type === "leave") handler("left");
        else handler("over");
      })
      .then((fn) => {
        if (stopped) fn();
        else unlisten = fn;
      }),
  );
  return () => {
    stopped = true;
    unlisten?.();
  };
}

/**
 * Enlarges a picture 4× with AI on this Mac and saves it as a new file beside the original.
 * Returns the new file's path. Not available in the browser demo.
 */
export async function upscaleImage(image: ImageEntry): Promise<string> {
  if (demo) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    throw "AI-förstoring finns bara i Mac-appen.";
  }
  return invoke<string>("upscale_image", { path: image.path, width: image.width, height: image.height });
}

export async function trashFile(path: string): Promise<void> {
  if (demo) {
    demoTrashed.add(path);
    return;
  }
  await invoke("trash_file", { path });
}

/**
 * Asks for Touch ID, or the Mac's password, before something locked is shown.
 * Resolves false when the person cancels; rejects when the Mac can't ask.
 */
export async function confirmOwner(reason: string): Promise<boolean> {
  if (demo) return new Promise((resolve) => setTimeout(() => resolve(true), 300));
  return invoke<boolean>("confirm_owner", { reason });
}

let fonts: Promise<string[]> | null = null;

/** Font families installed on the computer, for headings. Read once per session. */
export function listFonts(): Promise<string[]> {
  fonts ??= demo
    ? Promise.resolve(["Avenir Next", "Baskerville", "Didot", "Futura", "Georgia", "Gill Sans", "Helvetica Neue", "Courier New"])
    : invoke<string[]>("list_fonts").catch(() => []);
  return fonts;
}

const demoTrashed = new Set<string>();
const demoRatios = [1.5, 0.667, 1, 1.778, 0.75, 1.333, 2.4, 0.8, 1.5, 1.5, 0.667, 1.25];

function demoListing(path: string): FolderListing {
  const count = path === "/Demo/Bilder" ? 64 : 12;
  const images: ImageEntry[] = Array.from({ length: count }, (_, i) => {
    const ratio = demoRatios[i % demoRatios.length];
    return {
      path: `${path}/IMG_${String(i + 1).padStart(4, "0")}.jpg`,
      name: `IMG_${String(i + 1).padStart(4, "0")}.jpg`,
      width: Math.round(ratio * 1000),
      height: 1000,
      size: 2_000_000 + i * 37_000,
      modified: 1_760_000_000 + i * 3600,
    };
  }).filter((img) => !demoTrashed.has(img.path));
  const subfolders = path === "/Demo/Bilder" ? ["/Demo/Bilder/Resa 2025", "/Demo/Bilder/Studio"] : [];
  return { path, images, subfolders };
}

function demoImage(image: ImageEntry): string {
  const hue = (parseInt(image.name.replace(/\D/g, ""), 10) * 47 + image.path.length * 13) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 45% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 40% 38%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${image.width * 0.7}" cy="${image.height * 0.32}" r="${Math.min(image.width, image.height) * 0.12}" fill="hsl(${hue} 60% 85%)" opacity="0.8"/>
    <path d="M0 ${image.height} L${image.width * 0.35} ${image.height * 0.55} L${image.width * 0.6} ${image.height * 0.8} L${image.width * 0.8} ${image.height * 0.6} L${image.width} ${image.height} Z" fill="hsl(${hue} 30% 22%)" opacity="0.7"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Puts the app's window in full screen while `on`, and back as it was after.
 * A window that was already in full screen is left there.
 */
export function useWindowFullscreen(on: boolean) {
  useEffect(() => {
    if (demo || !on) return;
    let undo = false;
    let gone = false;
    const ready = import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      if (gone || (await win.isFullscreen())) return win;
      await win.setFullscreen(true);
      undo = true;
      return win;
    });
    return () => {
      gone = true;
      ready
        .then((win) => {
          if (undo) return win.setFullscreen(false);
        })
        .catch(() => {});
    };
  }, [on]);
}
