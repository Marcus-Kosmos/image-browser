import type { ItemSize } from "./layout";
import { useCallback, useEffect, useState } from "react";

export type ViewMode = "flow" | "pages";
export type Reveal = "none" | "fade" | "slide-left" | "slide-right" | "slide-alternate";
export type ImageSize = ItemSize;
export type Frame = "none" | "line" | "mat" | "black";
export type Shadow = "none" | "drop" | "inset";

export interface ImageSettings {
  size?: ImageSize;
  /** Unset means the image follows the folder's effect. */
  reveal?: Reveal;
}

export interface FolderSettings {
  viewMode: ViewMode;
  reveal: Reveal;
  showPageNumbers: boolean;
  /** Page background as #rrggbb; unset follows the system's light or dark look. */
  background?: string;
  frame: Frame;
  shadow: Shadow;
  /** Keyed by file name for a single folder (so settings survive moving it), by path for several folders. */
  images: Record<string, ImageSettings>;
}

export const SIZE_LABELS: Record<ImageSize, string> = { small: "Liten", medium: "Mellan", large: "Stor" };

export const REVEAL_LABELS: Record<Reveal, string> = {
  none: "Ingen effekt",
  fade: "Tona fram",
  "slide-left": "Glid in från vänster",
  "slide-right": "Glid in från höger",
  "slide-alternate": "Glid in växelvis",
};

export const FRAME_LABELS: Record<Frame, string> = {
  none: "Ingen ram",
  line: "Tunn linje",
  mat: "Vitt passepartout",
  black: "Svart ram",
};

export const SHADOW_LABELS: Record<Shadow, string> = {
  none: "Ingen skugga",
  drop: "Skugga under",
  inset: "Skugga inåt",
};

export const DEFAULT_SETTINGS: FolderSettings = {
  viewMode: "flow",
  reveal: "fade",
  showPageNumbers: true,
  frame: "none",
  shadow: "none",
  images: {},
};

const key = (folder: string) => `image-browser:folder:${folder}`;

export function loadSettings(folder: string): FolderSettings {
  try {
    const raw = localStorage.getItem(key(folder));
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // Fall back to defaults if storage is unavailable or the value is corrupt.
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(folder: string, settings: FolderSettings) {
  try {
    localStorage.setItem(key(folder), JSON.stringify(settings));
  } catch {
    // Settings are a convenience; ignore storage failures.
  }
}

/** View settings for a folder, or a set of folders opened together, remembered between sessions. */
export function useFolderSettings(folder: string | null) {
  const [settings, setSettings] = useState<FolderSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(folder ? loadSettings(folder) : DEFAULT_SETTINGS);
  }, [folder]);

  const update = useCallback(
    (change: Partial<FolderSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...change };
        if (folder) saveSettings(folder, next);
        return next;
      });
    },
    [folder],
  );

  const updateImage = useCallback(
    (key: string, change: ImageSettings) => {
      setSettings((prev) => {
        const merged = { ...prev.images[key], ...change };
        const images = { ...prev.images, [key]: merged };
        const next = { ...prev, images };
        if (folder) saveSettings(folder, next);
        return next;
      });
    },
    [folder],
  );

  return { settings, update, updateImage };
}
