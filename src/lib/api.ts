import { useEffect } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

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

/** Picture files the open dialogs show, the same ones a folder is read for. */
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif", "tif", "tiff", "bmp"];

/** Lets the user pick pictures in a dialog that shows them as thumbnails, with Quick Look on space. */
export async function pickImages(): Promise<string[]> {
  if (demo) return ["/Demo/Bilder/IMG_0004.jpg"];
  const result = await open({
    multiple: true,
    title: "Välj en bild att visa. Mappen den ligger i öppnas.",
    filters: [{ name: "Bilder", extensions: IMAGE_EXTENSIONS }],
  });
  if (result === null) return [];
  return Array.isArray(result) ? result : [result];
}

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

/** A fingerprint of each picture's contents, to find copies; null for files that can't be read. */
export async function contentHashes(paths: string[]): Promise<(string | null)[]> {
  // In the demo, pictures of the same name and size in different folders count as copies.
  if (demo) return paths.map((p) => p.split("/").pop() ?? p);
  return invoke<(string | null)[]>("content_hashes", { paths });
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

/** How the picture is enlarged: on this Mac, or by Stability AI, carefully or more freely. */
export type UpscaleMode = "local" | "conservative" | "creative" | "bigger";

export interface CloudUpscale {
  mode: "conservative" | "creative";
  /** What the picture shows, so the model knows what detail to draw. */
  prompt: string;
  /** 0 to 1: how freely the model may invent detail. */
  amount: number;
}

let demoCloudKey = false;

/** Enlarges the picture with Stability AI and saves the copy beside the original; returns its path. */
export async function cloudUpscaleImage(image: ImageEntry, options: CloudUpscale): Promise<string> {
  if (demo) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    throw "AI-förstoring finns bara i Mac-appen.";
  }
  return invoke<string>("cloud_upscale_image", {
    path: image.path,
    width: image.width,
    height: image.height,
    ...options,
  });
}

/** Keeps the Stability AI key in the Mac's keychain; an empty key forgets it. */
export async function saveCloudKey(key: string): Promise<void> {
  if (demo) {
    demoCloudKey = key.trim() !== "";
    return;
  }
  return invoke("save_cloud_key", { key });
}

export async function hasCloudKey(): Promise<boolean> {
  if (demo) return demoCloudKey;
  return invoke<boolean>("has_cloud_key");
}

/** A picture for a web page: the original, its copy's name in the page's folder, and its longest side. */
export interface WebPictureFile {
  path: string;
  file: string;
  size: number;
}

export type WebProtocol = "sftp" | "ftps" | "ftp";

/** The user's web host. The password is not here: it lives in the Mac's keychain. */
export interface WebHost {
  protocol: WebProtocol;
  host: string;
  port: number;
  user: string;
  /** Folder on the server that `url` shows. */
  folder: string;
  url: string;
  /** The SFTP server's key as first seen. */
  fingerprint?: string;
}

const demoPasswords = new Set<string>();
const hostAccount = (host: WebHost) => `${host.user}@${host.host}`;

/** Keeps the host's password in the Mac's keychain. */
export async function saveHostPassword(host: WebHost, password: string): Promise<void> {
  if (demo) {
    demoPasswords.add(hostAccount(host));
    return;
  }
  return invoke("save_host_password", { host, password });
}

export async function hasHostPassword(host: WebHost): Promise<boolean> {
  if (demo) return demoPasswords.has(hostAccount(host));
  return invoke<boolean>("has_host_password", { host });
}

/** Uploads the page and its pictures to the folder `name` on the host; returns its address. */
export async function publishWebPage(
  host: WebHost,
  name: string,
  html: string,
  pictures: WebPictureFile[],
): Promise<{ url: string; fingerprint: string | null }> {
  if (demo) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return { url: `${host.url.replace(/\/+$/, "")}/${name}/`, fingerprint: null };
  }
  return invoke("publish_web_page", { host, name, html, pictures });
}

/** Lets the user pick a folder to save a web page in; null when cancelled. */
export async function pickSaveFolder(): Promise<string | null> {
  if (demo) return "/Demo/Webbsidor";
  const result = await open({ directory: true, multiple: false, title: "Välj var webbsidan ska sparas" });
  return typeof result === "string" ? result : null;
}

/** Writes the page and its pictures into `dir` on this Mac. */
export async function writeWebPage(dir: string, html: string, pictures: WebPictureFile[]): Promise<void> {
  if (demo) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return;
  }
  await invoke("write_web_page", { dir, html, pictures });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** The picture as a data: URL, full size, to hand to bigger.pics. */
export async function imageDataUrl(image: ImageEntry): Promise<string> {
  if (demo) {
    const img = new Image();
    img.src = demoImage(image);
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  }
  const bytes = await invoke<ArrayBuffer>("image_bytes", {
    path: image.path,
    width: image.width,
    height: image.height,
  });
  const ext = image.name.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return blobToDataUrl(new Blob([bytes], { type }));
}

/**
 * Lets the Download button in bigger.pics save beside `image`, and calls `onSaved` with the new file's path.
 * Returns a function that stops it and closes the bigger.pics window.
 */
export async function expectBiggerPicsDownload(
  image: ImageEntry,
  onSaved: (path: string) => void,
): Promise<() => void> {
  if (demo) return () => {};
  const stop = await listen<string>("bigger-pics-saved", (event) => onSaved(event.payload));
  await invoke("expect_bigger_pics", { original: image.path });
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    stop();
    void invoke("expect_bigger_pics", { original: null }).then(() => invoke("close_bigger_pics"));
  };
}

/** Brings the bigger.pics window forward from behind the app. */
export function showBiggerPics() {
  if (!demo) void invoke("show_bigger_pics");
}

/** Saves a picture enlarged by bigger.pics beside its original; returns the new file's path. */
export async function saveEnlarged(image: ImageEntry, picture: Blob, format: "png" | "jpeg"): Promise<string> {
  // The picture's own type wins over the one asked for.
  const type = picture.type.replace("image/", "");
  const saveAs = type === "jpeg" || type === "png" || type === "webp" ? type : format;
  if (demo) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    throw "Att spara förstorade bilder finns bara i Mac-appen.";
  }
  return invoke<string>("save_enlarged", new Uint8Array(await picture.arrayBuffer()), {
    headers: { "x-original": encodeURIComponent(image.path), "x-format": saveAs },
  });
}

/** Shows the files in Finder, selected in their folders. */
export async function revealInFinder(paths: string[]): Promise<void> {
  if (demo) throw "Visa i Finder finns bara i Mac-appen.";
  await invoke("reveal_in_finder", { paths });
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
    ? Promise.resolve([
        "Avenir Next",
        "Baskerville",
        "Didot",
        "Futura",
        "Georgia",
        "Gill Sans",
        "Helvetica Neue",
        "Courier New",
      ])
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
