import type { ItemSize } from "./layout";
import type { CaptionAlign, CaptionPlace } from "./viewer";
import { useCallback, useEffect, useState } from "react";

export type ViewMode = "flow" | "pages";
export type Reveal =
  | "none"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-alternate"
  | "rise"
  | "cascade"
  | "parallax"
  | "auto";
/** An effect a single tile plays; "slide-alternate" and "auto" pick one of these per row. */
export type TileReveal = Exclude<Reveal, "slide-alternate" | "auto">;
export type ImageSize = ItemSize;
export type Frame = "none" | "line" | "mat" | "black";
export type Shadow = "none" | "drop" | "inset";

export type HeadingLevel = 1 | 2 | 3;

export interface Heading {
  text: string;
  level: HeadingLevel;
  /**
   * Line height in full screen at the normal caption size, set with the slider there: small for body
   * text, large for a heading. Unset follows the level.
   */
  size?: number;
  /** #rrggbb; unset uses the text color that suits the background. */
  color?: string;
  /** Installed font family; unset uses the system font. */
  font?: string;
  /** Where the text goes by its picture in full screen; a heading never moved follows the viewer's setting. */
  place?: CaptionPlace;
  align?: CaptionAlign;
}

export interface ImageSettings {
  size?: ImageSize;
  /** Unset means the image follows the folder's effect. */
  reveal?: Reveal;
  /** Heading on a row right above the image. */
  heading?: Heading;
  /** Page heading before the image, which then starts a new page. */
  pageHeading?: Heading;
  /** Further texts by the picture in full screen, each on a side or a corner of its own. */
  texts?: Heading[];
}

/** Height of the heading row above an image, per level. */
export const IMAGE_HEADING_HEIGHT: Record<HeadingLevel, number> = { 1: 40, 2: 32, 3: 26 };
/** Height of a page heading's row, per level. */
export const PAGE_HEADING_HEIGHT: Record<HeadingLevel, number> = { 1: 76, 2: 60, 3: 46 };

export interface FolderSettings {
  viewMode: ViewMode;
  reveal: Reveal;
  showPageNumbers: boolean;
  /** Page background as #rrggbb; unset follows the system's light or dark look. */
  background?: string;
  /** Text and button colors picked with the background from the pictures' own; unset derives them from it. */
  text?: string;
  accent?: string;
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
  rise: "Glid upp",
  cascade: "Kaskad",
  parallax: "Parallax",
  auto: "Växla automatiskt",
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
