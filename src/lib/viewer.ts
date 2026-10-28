import { useCallback, useState } from "react";

/** How the next image comes in when stepping in full screen. */
export type ViewerTransition =
  | "none"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "rise"
  | "cascade"
  | "parallax"
  | "auto";
export type ViewerEffect = Exclude<ViewerTransition, "auto">;

export const VIEWER_TRANSITIONS: ViewerTransition[] = [
  "none",
  "fade",
  "slide-left",
  "slide-right",
  "rise",
  "cascade",
  "parallax",
  "auto",
];

export const VIEWER_TRANSITION_LABELS: Record<ViewerTransition, string> = {
  none: "Ingen övergång",
  fade: "Tona fram",
  "slide-left": "Glid in från vänster",
  "slide-right": "Glid in från höger",
  rise: "Glid upp",
  cascade: "Kaskad",
  parallax: "Parallax",
  auto: "Växla automatiskt",
};

/** How images pinned while stepping are shown beside the current one. */
export type PinSize = "small" | "medium" | "full" | "puzzle";

export const PIN_SIZES: PinSize[] = ["small", "medium", "full", "puzzle"];

export const PIN_SIZE_LABELS: Record<PinSize, string> = {
  small: "Små i hörnet",
  medium: "Mellan, bilden fyller resten",
  full: "Hela, i en rad",
  puzzle: "Pussel som fyller skärmen",
};

export interface ViewerSettings {
  transition: ViewerTransition;
  /** Each image keeps its zoom, so stepping back to it shows the same detail. */
  keepZoom: boolean;
  pinSize: PinSize;
  /** Draw the folder's frame and shadow around the picture. */
  frame: boolean;
  /** Use the folder's background color instead of black. */
  background: boolean;
}

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = {
  transition: "fade",
  keepZoom: false,
  pinSize: "small",
  frame: false,
  background: false,
};

const STORAGE = "image-browser:viewer";

/** A calm fade every so often, so not every step slides. */
const AUTO_CYCLE: ViewerEffect[] = ["fade", "slide-right", "rise", "fade", "slide-left", "parallax", "fade", "cascade"];

/** The effect for the `step`th image shown since the viewer opened. */
export function resolveTransition(transition: ViewerTransition, step: number): ViewerEffect {
  return transition === "auto" ? AUTO_CYCLE[step % AUTO_CYCLE.length] : transition;
}

interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export interface PinLayout extends Size {
  /** Where each pinned picture goes, in the order pinned. */
  pins: Rect[];
  /** Where the current picture goes. */
  current: Rect;
}

/** A pinned picture is never wider than this share of the room in the medium size. */
const MEDIUM_MAX_SHARE = 0.3;
/** In a puzzle a column takes a second picture only if it stays at least this wide, in room heights. */
const PUZZLE_MIN_COLUMN = 0.4;

const aspect = (s: Size) => s.width / Math.max(1, s.height);

/** The picture's shape, as large as fits in the room. */
function fitIn(room: Size, s: Size): Size {
  const scale = Math.max(0, Math.min(room.width / s.width, room.height / s.height));
  return { width: Math.floor(s.width * scale), height: Math.floor(s.height * scale) };
}

/** Pictures stacked in columns that each fill `height`, left to right with `gap` between. */
function placeColumns(columns: Size[][], height: number, gap: number) {
  const rects: Rect[] = [];
  let x = 0;
  for (const column of columns) {
    const inner = height - gap * (column.length - 1);
    const width = inner / column.reduce((sum, s) => sum + 1 / aspect(s), 0);
    let y = 0;
    for (const s of column) {
      const h = width / aspect(s);
      rects.push({ x: Math.round(x), y: Math.round(y), width: Math.floor(width), height: Math.floor(h) });
      y += h + gap;
    }
    x += width + gap;
  }
  return { rects, width: Math.max(0, Math.round(x - gap)) };
}

/** Columns that keep the tallest height their pictures fit the room at. */
function fillRoom(columns: Size[][], room: Size, gap: number) {
  let height = room.height;
  let placed = placeColumns(columns, height, gap);
  // Widths grow with the height, apart from the gaps; a few rounds settle it.
  for (let i = 0; i < 4 && placed.width > room.width; i++) {
    const gaps = gap * (columns.length - 1);
    height = Math.max(0, height * ((room.width - gaps) / Math.max(1, placed.width - gaps)));
    placed = placeColumns(columns, height, gap);
  }
  return { ...placed, height: Math.round(height) };
}

/**
 * Places pinned pictures and the current one. "full" puts them all in one row at the same height;
 * "medium" stacks the pinned ones two high and leaves the rest to the current one; "puzzle" fills the
 * room with columns, stacking a picture under the one before when the column stays wide enough.
 */
export function pinLayout(size: Exclude<PinSize, "small">, pins: Size[], current: Size, room: Size, gap: number): PinLayout {
  if (size === "medium") {
    const tall = Math.max(0, (room.height - gap) / 2);
    const columns: Size[][] = [];
    pins
      .map((p) => fitIn({ width: Math.min(tall * aspect(p), room.width * MEDIUM_MAX_SHARE), height: tall }, p))
      .forEach((box, i) => (i % 2 ? columns[columns.length - 1].push(box) : columns.push([box])));
    const rects: Rect[] = [];
    let x = 0;
    for (const column of columns) {
      let y = 0;
      for (const box of column) {
        rects.push({ x, y, ...box });
        y += box.height + gap;
      }
      x += Math.max(...column.map((b) => b.width)) + gap;
    }
    const rest = fitIn({ width: Math.max(0, room.width - x), height: room.height }, current);
    // Center each picture in its height, like the row they stand in.
    const height = room.height;
    const centered = rects.map((r, i) => {
      const column = columns[Math.floor(i / 2)];
      const used = column.reduce((sum, b) => sum + b.height, 0) + gap * (column.length - 1);
      return { ...r, y: r.y + Math.round((height - used) / 2) };
    });
    return {
      pins: centered,
      current: { x, y: Math.round((height - rest.height) / 2), ...rest },
      width: x + rest.width,
      height,
    };
  }
  const items = [...pins, current];
  const columns: Size[][] =
    size === "full"
      ? items.map((s) => [s])
      : items.reduce<Size[][]>((cols, s) => {
          const last = cols[cols.length - 1];
          const joined = last && last.length < 2 ? [...last, s] : null;
          const width = joined ? (room.height - gap) / joined.reduce((sum, t) => sum + 1 / aspect(t), 0) : 0;
          if (joined && width >= room.height * PUZZLE_MIN_COLUMN) cols[cols.length - 1] = joined;
          else cols.push([s]);
          return cols;
        }, []);
  const placed = fillRoom(columns, room, gap);
  return {
    pins: placed.rects.slice(0, -1),
    current: placed.rects[placed.rects.length - 1],
    width: placed.width,
    height: placed.height,
  };
}

/** Whether one more pinned picture still leaves the current one a useful size. */
export function hasRoomToPin(size: Exclude<PinSize, "small">, pins: Size[], current: Size, room: Size, gap: number) {
  const { current: rect } = pinLayout(size, pins, current, room, gap);
  return rect.height >= room.height * 0.25 && rect.width >= room.width * 0.15;
}

function load(): ViewerSettings {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return { ...DEFAULT_VIEWER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // Fall back to defaults if storage is unavailable or the value is corrupt.
  }
  return DEFAULT_VIEWER_SETTINGS;
}

/** Full screen look, the same for every folder. */
export function useViewerSettings() {
  const [settings, setSettings] = useState(load);
  const update = useCallback((change: Partial<ViewerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...change };
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next));
      } catch {
        // A convenience; ignore storage failures.
      }
      return next;
    });
  }, []);
  return { settings, update };
}
