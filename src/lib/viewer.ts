import { useCallback, useState } from "react";
import type { ItemSize } from "./layout";
import type { Heading, HeadingLevel } from "./settings";

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
export type PinSize = "small" | "medium" | "full" | "puzzle" | "grid";

export const PIN_SIZES: PinSize[] = ["small", "medium", "full", "puzzle", "grid"];

export const PIN_SIZE_LABELS: Record<PinSize, string> = {
  small: "Små i hörnet",
  medium: "Mellan, bilden fyller resten",
  full: "Hela, i en rad",
  puzzle: "Pussel i rader som fyller skärmen",
  grid: "Rutnät, som en webbsida",
};

/** Where an image's heading goes in full screen. */
export type CaptionPlace =
  | "off"
  | "above"
  | "below"
  | "left"
  | "right"
  | "top-left"
  | "top"
  | "top-right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export const CAPTION_PLACES: CaptionPlace[] = [
  "off",
  "above",
  "below",
  "left",
  "right",
  "top-left",
  "top",
  "top-right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

/** How a heading beside the picture lines up: with its left edge, in the middle or with its right edge. */
export type CaptionAlign = "left" | "center" | "right";

export const CAPTION_ALIGN_LABELS: Record<CaptionAlign, string> = {
  left: "Vänsterställd",
  center: "Centrerad",
  right: "Högerställd",
};

/** How the heading's text lines up there: on the picture by its place, beside it as chosen. */
export function captionAlignAt(place: CaptionPlace, align: CaptionAlign | undefined): CaptionAlign {
  if (place === "top" || place === "bottom") return "center";
  if (place === "top-left" || place === "bottom-left") return "left";
  if (place === "top-right" || place === "bottom-right") return "right";
  return align ?? "left";
}

export const CAPTION_PLACE_LABELS: Record<CaptionPlace, string> = {
  off: "Visa inte",
  above: "Ovanför bilden",
  below: "Under bilden",
  left: "Till vänster om bilden",
  right: "Till höger om bilden",
  "top-left": "På bilden, uppe till vänster",
  top: "På bilden, uppe i mitten",
  "top-right": "På bilden, uppe till höger",
  "bottom-left": "På bilden, nere till vänster",
  bottom: "På bilden, nere i mitten",
  "bottom-right": "På bilden, nere till höger",
};

/** Height of a heading's line in full screen, per level. */
export const CAPTION_HEIGHT: Record<1 | 2 | 3, number> = { 1: 52, 2: 40, 3: 30 };

export const CAPTION_SIZES = ["normal", "large", "x-large", "huge"] as const;
export type CaptionSize = (typeof CAPTION_SIZES)[number];

export const CAPTION_SIZE_LABELS: Record<CaptionSize, string> = {
  normal: "Normal",
  large: "Stor",
  "x-large": "Mycket stor",
  huge: "Jättestor",
};

/** How much larger than normal each size draws the headings. */
export const CAPTION_SCALE: Record<CaptionSize, number> = { normal: 1, large: 1.6, "x-large": 2.5, huge: 4 };

/**
 * The range of the text size slider, in line height on screen, from body text (16 gives letters of
 * about 10 points) to a very large heading.
 */
export const TEXT_SIZE_MIN = 16;
export const TEXT_SIZE_MAX = 240;

/** Steps of the text size slider. It goes by ratio, so the small sizes get as much room as the large. */
export const TEXT_SLIDER_STEPS = 100;

export function sliderForSize(size: number): number {
  const at = Math.log(size / TEXT_SIZE_MIN) / Math.log(TEXT_SIZE_MAX / TEXT_SIZE_MIN);
  return Math.round(Math.min(1, Math.max(0, at)) * TEXT_SLIDER_STEPS);
}

export function sizeForSlider(step: number): number {
  return Math.round(TEXT_SIZE_MIN * (TEXT_SIZE_MAX / TEXT_SIZE_MIN) ** (step / TEXT_SLIDER_STEPS));
}

/** A heading's line height in full screen at the normal caption size. */
export function textSize(heading: Pick<Heading, "level" | "size">): number {
  return heading.size ?? CAPTION_HEIGHT[heading.level];
}

/** Bolder the larger the text, so body text reads as body text. */
export function textWeight(heading: Pick<Heading, "level" | "size">): number {
  const size = textSize(heading);
  return size >= 36 ? 600 : size >= 26 ? 500 : 400;
}

/** The level that matches a size, for the gallery and web pages, which go by level. */
export function levelForSize(size: number): HeadingLevel {
  return size >= 46 ? 1 : size >= 35 ? 2 : 3;
}

/**
 * A heading's line height in full screen before it is fitted to the room. A size set with the slider
 * is the size on screen; only texts without one grow with the caption size setting.
 */
export function shownTextSize(heading: Pick<Heading, "level" | "size">, size: CaptionSize): number {
  return heading.size ?? CAPTION_HEIGHT[heading.level] * CAPTION_SCALE[size];
}

/** A heading's line height in full screen, kept to at most a third of the room it sits in. */
export function captionLineHeight(heading: Pick<Heading, "level" | "size">, size: CaptionSize, roomHeight: number): number {
  return Math.round(Math.min(shownTextSize(heading, size), roomHeight / 3));
}

/** How large one image at a time is shown in full screen. */
export type ScreenFit = "margins" | "fit" | "fill";

export const SCREEN_FITS: ScreenFit[] = ["margins", "fit", "fill"];

export const SCREEN_FIT_LABELS: Record<ScreenFit, string> = {
  margins: "Med marginaler",
  fit: "Hela skärmen, hela bilden syns",
  fill: "Fyll skärmen, kanterna beskärs",
};

/** The next of the sizes, for the shortcut that steps through them. */
export function nextScreenFit(fit: ScreenFit): ScreenFit {
  return SCREEN_FITS[(SCREEN_FITS.indexOf(fit) + 1) % SCREEN_FITS.length];
}

export interface ViewerSettings {
  transition: ViewerTransition;
  /** Each image keeps its zoom, so stepping back to it shows the same detail. */
  keepZoom: boolean;
  pinSize: PinSize;
  /** Draw the folder's frame and shadow around the picture. */
  frame: boolean;
  /** Use the folder's background color instead of black. */
  background: boolean;
  /** Round the corners of the pictures and their frames. */
  rounded: boolean;
  /** Where headings written for the images are shown. */
  captionPlace: CaptionPlace;
  /** How a heading above, under or beside the picture lines up. */
  captionAlign: CaptionAlign;
  /** A heading to the left or right takes all the room beside the picture, not just a narrow column. */
  captionWide: boolean;
  /** How a heading comes in with its image. */
  captionEffect: ViewerTransition;
  captionSize: CaptionSize;
  /** Margins around the picture, or the whole screen for it. */
  screen: ScreenFit;
  /** Favoriter and the series beside the picture, to drop it in. */
  collections: boolean;
  /** The bar of buttons under the picture stays shown, instead of hiding until the mouse comes near. */
  dockPinned: boolean;
}

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = {
  transition: "fade",
  keepZoom: false,
  pinSize: "small",
  frame: false,
  background: false,
  rounded: false,
  captionPlace: "above",
  captionAlign: "left",
  captionWide: false,
  captionEffect: "fade",
  captionSize: "normal",
  screen: "margins",
  collections: false,
  dockPinned: false,
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

/** Splits pictures, in order, into `count` rows of about the same total width at one height. */
function splitRows(items: Size[], count: number): Size[][] {
  const total = items.reduce((sum, s) => sum + aspect(s), 0);
  const rows: Size[][] = [[]];
  let before = 0;
  items.forEach((s, i) => {
    const row = rows[rows.length - 1];
    const rowsLeft = count - rows.length;
    const itemsLeft = items.length - i;
    // Break where the picture's middle passes the row's share, or when every later row needs one.
    const passes = before + aspect(s) / 2 > (total / count) * rows.length;
    if (row.length > 0 && rowsLeft > 0 && (passes || itemsLeft === rowsLeft)) rows.push([s]);
    else row.push(s);
    before += aspect(s);
  });
  return rows;
}

/** Rows filling the room's width, shrunk together when they are too tall for it. */
function placeRows(rows: Size[][], room: Size, gap: number) {
  const heights = rows.map((row) => (room.width - gap * (row.length - 1)) / row.reduce((sum, s) => sum + aspect(s), 0));
  const tall = heights.reduce((sum, h) => sum + h, 0);
  const scale = Math.min(1, Math.max(0, room.height - gap * (rows.length - 1)) / tall);
  const rects: Rect[] = [];
  let y = 0;
  rows.forEach((row, r) => {
    const height = heights[r] * scale;
    let x = 0;
    for (const s of row) {
      const width = height * aspect(s);
      rects.push({ x: Math.round(x), y: Math.round(y), width: Math.floor(width), height: Math.floor(height) });
      x += width + gap;
    }
    y += height + gap;
  });
  const width = Math.round(scale * (room.width - gap * (rows[0].length - 1)) + gap * (rows[0].length - 1));
  return { rects, width: Math.min(room.width, width), height: Math.round(y - gap) };
}

/** The number of rows that covers the most of the room, and fewer rows when it is a tie. */
function fillWithRows(items: Size[], room: Size, gap: number) {
  let best = placeRows([items], room, gap);
  let bestArea = 0;
  for (let count = 1; count <= items.length; count++) {
    const placed = placeRows(splitRows(items, count), room, gap);
    const area = placed.rects.reduce((sum, r) => sum + r.width * r.height, 0);
    if (area > bestArea * 1.02) {
      best = placed;
      bestArea = area;
    }
  }
  return best;
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

/** A picture to place, with the size it is set to show at (small, medium or large) if any. */
export type SizedPicture = Size & { pictureSize?: ItemSize };

const GRID_COLUMNS = 12;

/** Columns a picture takes in the grid: landscape ones wider than upright ones, and by its size. */
function gridSpan(s: SizedPicture) {
  const a = aspect(s);
  const base = a >= 1.25 ? 6 : 4;
  const scaled = s.pictureSize === "small" ? Math.round((base * 2) / 3) : s.pictureSize === "large" ? Math.round(base * 1.5) : base;
  return Math.max(3, Math.min(GRID_COLUMNS, scaled));
}

/** The pictures in rows of the grid, each row taking all its columns. */
function gridRows(items: SizedPicture[]) {
  const rows: { item: number; span: number }[][] = [];
  let row: { item: number; span: number }[] = [];
  let used = 0;
  items.forEach((s, i) => {
    const span = gridSpan(s);
    if (row.length > 0 && used + span > GRID_COLUMNS) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push({ item: i, span });
    used += span;
  });
  if (row.length > 0) rows.push(row);
  // Within a row the columns are shared out by the pictures' shapes, so they stand about as tall as
  // each other; a picture alone in its row takes no more than half as much again as its size asks.
  for (const r of rows) {
    const total = r.length === 1 ? Math.min(GRID_COLUMNS, Math.floor(r[0].span * 1.5)) : GRID_COLUMNS;
    const widths = r.map((c) => aspect(items[c.item]));
    const sum = widths.reduce((x, y) => x + y, 0);
    const exact = widths.map((w) => (w / sum) * total);
    r.forEach((c, i) => (c.span = Math.max(2, Math.floor(exact[i]))));
    // The columns lost to rounding go to the pictures that lost the most.
    let left = total - r.reduce((x, c) => x + c.span, 0);
    const order = r.map((_, i) => i).sort((i, j) => exact[j] - r[j].span - (exact[i] - r[i].span));
    for (let k = 0; left > 0; k = (k + 1) % order.length, left--) r[order[k]].span++;
    while (r.reduce((x, c) => x + c.span, 0) > total) {
      const widest = r.reduce((x, c) => (c.span > x.span ? c : x));
      widest.span--;
    }
  }
  return rows;
}

/**
 * Places the pictures whole in a grid of twelve columns like a web page: every picture starts on a column,
 * with the same gap between all of them, and the rows top-aligned. The grid shrinks as a whole to fit.
 */
function placeGrid(items: SizedPicture[], room: Size, gap: number) {
  const rows = gridRows(items);
  const cellWidth = (span: number, column: number) => span * column + (span - 1) * gap;
  const heightAt = (column: number) =>
    rows.reduce((sum, r) => sum + Math.max(...r.map((c) => cellWidth(c.span, column) / aspect(items[c.item]))), 0) +
    gap * (rows.length - 1);
  let column = Math.max(0, (room.width - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
  if (heightAt(column) > room.height) {
    let low = 0;
    let high = column;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (heightAt(mid) > room.height) high = mid;
      else low = mid;
    }
    column = low;
  }
  const rects: Rect[] = new Array(items.length);
  let y = 0;
  for (const r of rows) {
    let at = (GRID_COLUMNS - r.reduce((sum, c) => sum + c.span, 0)) / 2;
    let tallest = 0;
    for (const c of r) {
      const width = cellWidth(c.span, column);
      const height = width / aspect(items[c.item]);
      rects[c.item] = { x: Math.round(at * (column + gap)), y: Math.round(y), width: Math.floor(width), height: Math.floor(height) };
      tallest = Math.max(tallest, height);
      at += c.span;
    }
    y += tallest + gap;
  }
  return { rects, width: Math.round(cellWidth(GRID_COLUMNS, column)), height: Math.max(0, Math.round(y - gap)) };
}

/** The gap of the grid: grows with the room, so the page breathes the same at every size. */
export const gridGap = (room: Size, gap: number) => Math.max(gap, Math.round(room.width * 0.015));

/**
 * Places pinned pictures and the current one. "full" puts them all in one row at the same height;
 * "medium" stacks the pinned ones two high and leaves the rest to the current one; "puzzle" breaks
 * them into as many full-width rows as cover the room best, like the map, the current one last;
 * "grid" lines them up whole on twelve columns, each as wide as its shape and size ask.
 */
export function pinLayout(
  size: Exclude<PinSize, "small">,
  pins: SizedPicture[],
  current: SizedPicture,
  room: Size,
  gap: number,
  /** Where among the pinned pictures the current one stands; last unless said. Not for "medium". */
  at: number = pins.length,
): PinLayout {
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
  const spot = Math.max(0, Math.min(at, pins.length));
  const items = [...pins.slice(0, spot), current, ...pins.slice(spot)];
  const placed =
    size === "grid"
      ? placeGrid(items, room, gridGap(room, gap))
      : size === "full"
      ? fillRoom(
          items.map((s) => [s]),
          room,
          gap,
        )
      : fillWithRows(items, room, gap);
  return {
    pins: placed.rects.filter((_, i) => i !== spot),
    current: placed.rects[spot],
    width: placed.width,
    height: placed.height,
  };
}

/** Whether one more pinned picture still leaves the current one a useful size. */
export function hasRoomToPin(size: Exclude<PinSize, "small">, pins: SizedPicture[], current: SizedPicture, room: Size, gap: number) {
  const { current: rect } = pinLayout(size, pins, current, room, gap);
  // A puzzle can grow many rows, until its pictures get really small.
  if (size === "puzzle") return rect.height >= room.height * 0.12;
  // In the grid no picture may get so small it reads as a thumbnail.
  if (size === "grid") {
    const placed = pinLayout(size, pins, current, room, gap);
    return Math.min(...[placed.current, ...placed.pins].map((r) => r.height)) >= room.height * 0.2;
  }
  return rect.height >= room.height * 0.25 && rect.width >= room.width * 0.15;
}

/**
 * Splits pinned pictures into pages, in order: each page takes as many as fit with all of them still a
 * useful size. Returns each page's positions in `pins`.
 */
export function pinPages(size: Exclude<PinSize, "small">, pins: SizedPicture[], room: Size, gap: number): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  pins.forEach((pin, i) => {
    if (
      page.length > 0 &&
      !hasRoomToPin(
        size,
        page.map((j) => pins[j]),
        pin,
        room,
        gap,
      )
    ) {
      pages.push(page);
      page = [];
    }
    page.push(i);
  });
  if (page.length > 0) pages.push(page);
  return pages;
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
