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
