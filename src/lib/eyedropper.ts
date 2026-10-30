import { colorAt, fileOfUrl } from "./api";

/**
 * Waits for a click on a picture anywhere in the window and gives the color there, as #rrggbb.
 * Gives null when Escape is pressed or the click lands beside every picture. While it waits, the
 * pointer is a crosshair and the click does nothing else.
 */
export function pickColorFromPicture(): Promise<string | null> {
  return new Promise((resolve) => {
    const cursor = document.createElement("style");
    cursor.textContent = "* { cursor: crosshair !important; }";
    document.head.append(cursor);

    const done = (color: string | null) => {
      cursor.remove();
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      // The click that picked still follows its pointerdown; it must not reach what lies beneath.
      window.setTimeout(() => window.removeEventListener("click", swallow, true), 400);
      resolve(color);
    };
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDown = (e: PointerEvent) => {
      swallow(e);
      const spot = pictureAt(e.clientX, e.clientY);
      if (!spot) return done(null);
      colorOf(spot.img, spot.x, spot.y)
        .then(done)
        .catch(() => done(null));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      swallow(e);
      done(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("click", swallow, true);
  });
}

/** The picture shown at a point of the window, and where on it the point is, from 0 to 1 across. */
function pictureAt(clientX: number, clientY: number): { img: HTMLImageElement; x: number; y: number } | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!(el instanceof HTMLImageElement) || !el.naturalWidth || !shown(el)) continue;
    const box = contentBox(el);
    const x = (clientX - box.left) / box.width;
    const y = (clientY - box.top) / box.height;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) return { img: el, x, y };
  }
  return null;
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

/** Reads the color from the picture as it is shown, or from its file when the webview won't let it. */
async function colorOf(img: HTMLImageElement, x: number, y: number): Promise<string | null> {
  try {
    return hex(averageAround(img, x, y));
  } catch {
    const file = fileOfUrl(img.currentSrc || img.src);
    return file ? hex(await colorAt(file, x, y)) : null;
  }
}

/** The average of the pixels around the spot; throws if the picture may not be read. */
function averageAround(img: HTMLImageElement, x: number, y: number): [number, number, number] {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 3;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no canvas");
  const sx = Math.min(img.naturalWidth - 3, Math.max(0, x * img.naturalWidth - 1.5));
  const sy = Math.min(img.naturalHeight - 3, Math.max(0, y * img.naturalHeight - 1.5));
  context.drawImage(img, sx, sy, 3, 3, 0, 0, 3, 3);
  const data = context.getImageData(0, 0, 3, 3).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  return [sum[0] / 9, sum[1] / 9, sum[2] / 9];
}

function hex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}
