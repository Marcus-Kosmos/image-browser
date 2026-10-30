import { fileOfUrl, readablePictureUrl } from "./api";

interface EyedropperHandlers {
  /** A color clicked on a picture: the picker takes it, and the pipette stays on for another try. */
  onPick: (color: string) => void;
  /** The pipette is off: Enter keeps the picked color, Escape (`keep` false) asks to undo it. */
  onEnd: (keep: boolean) => void;
}

/**
 * Turns the pointer into a pipette over the pictures in the window. A swatch beside the pointer shows
 * the color under it; a click picks it, as often as wanted, until Enter or Escape. The color picker's
 * own panel (`[data-color-picker]`) keeps working meanwhile, so a picked color can be tweaked there.
 * Returns a function that turns the pipette off without a word to `onEnd`.
 */
export function startEyedropper({ onPick, onEnd }: EyedropperHandlers): () => void {
  const style = document.createElement("style");
  // Pictures that let clicks through are still to be found under the pointer.
  style.textContent = `
    *:not([data-color-picker], [data-color-picker] *) { cursor: crosshair !important; }
    img { pointer-events: auto !important; }
  `;
  document.head.append(style);
  const swatch = document.createElement("div");
  swatch.setAttribute("aria-hidden", "true");
  Object.assign(swatch.style, {
    position: "fixed",
    zIndex: "2147483647",
    width: "28px",
    height: "28px",
    borderRadius: "9999px",
    border: "2px solid white",
    boxShadow: "0 0 0 1px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.4)",
    pointerEvents: "none",
    display: "none",
  });
  document.body.append(swatch);

  const inPicker = (e: Event) => e.target instanceof Element && !!e.target.closest("[data-color-picker]");
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  // Only the latest position counts; reading a picture's pixels the first time takes a moment.
  let turn = 0;
  const colorUnder = async (x: number, y: number) => {
    const mine = ++turn;
    const spot = pictureAt(x, y);
    const color = spot ? await colorOf(spot.img, spot.x, spot.y).catch(() => null) : null;
    return mine === turn ? color : undefined;
  };

  const onMove = (e: PointerEvent) => {
    if (inPicker(e)) {
      swatch.style.display = "none";
      return;
    }
    swatch.style.left = `${e.clientX + 14}px`;
    swatch.style.top = `${e.clientY + 14}px`;
    void colorUnder(e.clientX, e.clientY).then((color) => {
      if (color === undefined) return;
      swatch.style.display = color ? "block" : "none";
      if (color) swatch.style.background = color;
    });
  };
  const onDown = (e: PointerEvent) => {
    if (inPicker(e)) return;
    swallow(e);
    void colorUnder(e.clientX, e.clientY).then((color) => color && onPick(color));
  };
  const onClick = (e: MouseEvent) => {
    if (!inPicker(e)) swallow(e);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== "Escape") return;
    swallow(e);
    stop();
    onEnd(e.key === "Enter");
  };
  const listeners: Array<[string, EventListener]> = [
    ["pointermove", onMove as EventListener],
    ["pointerdown", onDown as EventListener],
    ["mousedown", onClick as EventListener],
    ["click", onClick as EventListener],
    ["dblclick", onClick as EventListener],
    ["keydown", onKey as EventListener],
  ];
  for (const [type, listener] of listeners) window.addEventListener(type, listener, true);
  const stop = () => {
    turn++;
    style.remove();
    swatch.remove();
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
  };
  return stop;
}

/** The picture shown on top at a point of the window, and where on it the point is, from 0 to 1 across. */
function pictureAt(clientX: number, clientY: number): { img: HTMLImageElement; x: number; y: number } | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (el instanceof HTMLImageElement && el.naturalWidth && shown(el)) {
      const box = contentBox(el);
      const x = (clientX - box.left) / box.width;
      const y = (clientY - box.top) / box.height;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) return { img: el, x, y };
    }
    // Pictures under something solid, such as the gallery under the viewer, are out of sight.
    if (!(el instanceof HTMLImageElement) && solid(el)) return null;
  }
  return null;
}

function solid(el: Element) {
  const match = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
  if (!match) return false;
  const alpha = match.length > 3 ? Number(match[3]) : 1;
  return alpha >= 0.9;
}

/** Whether nothing makes the picture invisible, such as a picture fading out behind the next. */
function shown(el: Element) {
  for (let at: Element | null = el; at; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.opacity === "0" || style.visibility === "hidden") return false;
  }
  return true;
}

/** Where the picture itself is drawn within its element, by how it is fitted (object-fit). */
function contentBox(img: HTMLImageElement) {
  const rect = img.getBoundingClientRect();
  const fit = getComputedStyle(img).objectFit;
  if (fit === "fill") return rect;
  const fits = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
  const scale =
    fit === "cover"
      ? Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
      : fit === "none"
        ? 1
        : fit === "scale-down"
          ? Math.min(1, fits)
          : fits;
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;
  return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
}

/** Pixels of the pictures read so far, by address; a few are kept, as they take a moment to read. */
const pixels = new Map<string, Promise<CanvasRenderingContext2D>>();
const KEEP = 4;

async function colorOf(img: HTMLImageElement, x: number, y: number): Promise<string> {
  const src = img.currentSrc || img.src;
  let read = pixels.get(src);
  if (!read) {
    read = readPixels(img, src);
    pixels.set(src, read);
    read.catch(() => pixels.delete(src));
    if (pixels.size > KEEP) pixels.delete(pixels.keys().next().value!);
  }
  const context = await read;
  const { width, height } = context.canvas;
  const px = Math.min(width - 1, Math.max(0, Math.floor(x * width)));
  const py = Math.min(height - 1, Math.max(0, Math.floor(y * height)));
  // A few pixels around the spot, so one stray pixel doesn't decide.
  const left = Math.max(0, px - 1);
  const top = Math.max(0, py - 1);
  const data = context.getImageData(left, top, Math.min(3, width - left), Math.min(3, height - top)).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  const n = data.length / 4;
  return `#${sum.map((c) => Math.round(c / n).toString(16).padStart(2, "0")).join("")}`;
}

/** The picture drawn on a canvas that may be read. The webview won't let pixels of files it showed be
 * read, so those are fetched again as bytes. */
async function readPixels(img: HTMLImageElement, src: string): Promise<CanvasRenderingContext2D> {
  try {
    return draw(img);
  } catch {
    const file = fileOfUrl(src);
    if (!file) throw new Error("Bilden går inte att läsa.");
    const url = await readablePictureUrl(file);
    try {
      const copy = new Image();
      copy.src = url;
      await copy.decode();
      return draw(copy);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Draws the picture at most 2048 pixels across, which is plenty to pick a color from. */
function draw(img: HTMLImageElement): CanvasRenderingContext2D {
  const scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Ingen canvas.");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  // Throws here when the picture may not be read.
  context.getImageData(0, 0, 1, 1);
  return context;
}
