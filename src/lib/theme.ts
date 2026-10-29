import { useEffect } from "react";

/** Parses #rgb or #rrggbb into 0–255 channels, or null. */
export function parseHex(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: [number, number, number]) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Whether text on this background reads best dark (true) or light (false). */
export function prefersDarkText(background: string) {
  const rgb = parseHex(background);
  if (!rgb) return true;
  // Contrast against black vs. white: (L + 0.05) / 0.05 vs. 1.05 / (L + 0.05).
  const l = luminance(rgb);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05);
}

type Rgb = [number, number, number];

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = (rgb: Rgb) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rr ? ((gg - bb) / d + 6) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]: [number, number, number]): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * The background's own hue at a lightness far enough from it to reach `minContrast`:
 * darker on a light background, paler on a dark one. Falls back to black or white.
 */
function shade(bg: Rgb, darker: boolean, minContrast: number): Rgb {
  const [h, s, l] = toHsl(bg);
  for (let i = 1; i <= 50; i++) {
    const lightness = darker ? l * (1 - i / 50) : l + (1 - l) * (i / 50);
    const c = fromHsl([h, s, lightness]);
    if (contrast(c, bg) >= minContrast) return c;
  }
  return darker ? [0, 0, 0] : [255, 255, 255];
}

/** Page, text and button colors that go together, as #rrggbb. */
export interface ColorTheme {
  background: string;
  text: string;
  accent: string;
}

/**
 * The hues a set of pictures has most of, up to `count`, each with how saturated it tends to be,
 * and whether the pictures are mostly light. Grays, near-black and near-white say nothing about hue.
 */
export function dominantHues(colors: Rgb[], count = 3) {
  const BINS = 24;
  const weight = new Array<number>(BINS).fill(0);
  const sums = Array.from({ length: BINS }, () => [0, 0, 0]);
  let lightness = 0;
  for (const rgb of colors) {
    const [h, s, l] = toHsl(rgb);
    lightness += l;
    if (s < 0.15 || l < 0.08 || l > 0.94) continue;
    const w = s * (1 - Math.abs(2 * l - 1));
    const bin = Math.floor(h / (360 / BINS)) % BINS;
    weight[bin] += w;
    sums[bin][0] += Math.cos((h * Math.PI) / 180) * w;
    sums[bin][1] += Math.sin((h * Math.PI) / 180) * w;
    sums[bin][2] += s * w;
  }
  const hues: Array<{ hue: number; saturation: number }> = [];
  const taken = new Set<number>();
  while (hues.length < count) {
    // Neighbouring bins count together, so a hue on a bin's edge is not split in two; hues already
    // found and their neighbours are passed over, so each one found is a hue of its own.
    let best = -1;
    let bestWeight = colors.length * 0.02;
    for (let i = 0; i < BINS; i++) {
      if (taken.has(i)) continue;
      const around = weight[(i + BINS - 1) % BINS] + weight[i] + weight[(i + 1) % BINS];
      if (around > bestWeight) {
        best = i;
        bestWeight = around;
      }
    }
    if (best < 0) break;
    // The heaviest bin of the three is the hue's own.
    for (const n of [(best + BINS - 1) % BINS, (best + 1) % BINS]) if (!taken.has(n) && weight[n] > weight[best]) best = n;
    for (let d = -1; d <= 1; d++) taken.add((best + d + BINS) % BINS);
    const [x, y, sat] = sums[best];
    hues.push({ hue: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, saturation: sat / weight[best] });
  }
  return { hues, light: colors.length > 0 && lightness / colors.length > 0.6 };
}

/** Lightness of this hue and saturation, moved away from `bg` until it reaches `minContrast`. */
function against(bg: Rgb, hue: number, saturation: number, minContrast: number): Rgb {
  const darker = prefersDarkText(toHex(bg));
  for (let i = 0; i <= 50; i++) {
    const lightness = darker ? 0.5 * (1 - i / 50) : 0.5 + 0.5 * (i / 50);
    const c = fromHsl([hue, saturation, lightness]);
    if (contrast(c, bg) >= minContrast) return c;
  }
  return darker ? [0, 0, 0] : [255, 255, 255];
}

/** Kinds of page a theme can have, so the six offered differ in more than which hue goes where. */
const PAGES = [
  // Quiet and dark, or quiet and pale: the pictures stand out most.
  { lightness: 0.15, light: 0.91, saturation: [0.18, 0.45] },
  // The other way round from the pictures: pale under dark pictures, dark under light ones.
  { lightness: 0.91, light: 0.15, saturation: [0.18, 0.45] },
  // Deep and colorful.
  { lightness: 0.24, light: 0.8, saturation: [0.45, 0.7] },
  // Nearly gray, with only a hint of the hue.
  { lightness: 0.12, light: 0.94, saturation: [0.05, 0.08] },
  // Soft and mid-light.
  { lightness: 0.78, light: 0.3, saturation: [0.3, 0.5] },
  // Dark and colorful.
  { lightness: 0.19, light: 0.86, saturation: [0.35, 0.6] },
] as const;

/**
 * Color themes from the colors a set of pictures has most of: their main hues in turn as the page,
 * the text and the buttons, on pages of different kinds (dark, pale, deep, nearly gray). Text and
 * buttons keep readable contrast. `round` turns the hues and kinds of page, so asking again gives
 * other themes. Pictures with hardly any color give gray themes; no pixels give none.
 */
export function themesFromColors(colors: Rgb[], round = 0): ColorTheme[] {
  if (colors.length === 0) return [];
  const { hues: found, light } = dominantHues(colors, 6);
  // Without color there is one gray theme, dark or pale as the pictures are.
  const hues = found.length > 0 ? found : [{ hue: 0, saturation: 0 }];
  const kinds = found.length > 0 ? PAGES.length : 1;
  const n = hues.length;
  const themes: ColorTheme[] = [];
  const seen = new Set<string>();
  for (let i = 0; themes.length < 6 && i < 36; i++) {
    const kind = PAGES[(i + round) % kinds];
    // Hues turn at another pace than kinds of page, so a new round pairs them anew.
    const at = i + 2 * round;
    const b = hues[at % n];
    // Text and buttons take the next hues, so with several hues the three differ.
    const t = hues[(at + Math.floor(i / n) + 1) % n];
    const a = hues[(at + Math.floor(i / n) + 2) % n];
    const [low, high] = kind.saturation;
    const bg = fromHsl([b.hue, b.saturation && Math.min(high, Math.max(low, b.saturation)), light ? kind.light : kind.lightness]);
    const theme = {
      background: toHex(bg),
      text: toHex(against(bg, t.hue, Math.min(0.5, t.saturation), 7.2)),
      accent: toHex(against(bg, a.hue, a.saturation && Math.max(0.55, a.saturation), 3.5)),
    };
    const key = `${theme.background}${theme.text}${theme.accent}`;
    if (!seen.has(key)) seen.add(key), themes.push(theme);
  }
  return themes;
}

/**
 * Interface colors derived from a page background. Text and buttons are deeper
 * (or paler) shades of the background's own hue, so a light blue gets dark blue
 * buttons, and every shade keeps readable contrast (WCAG AA or better).
 */
export function themeFor(background: string, text?: string, accent?: string): Record<string, string> | null {
  const bg = parseHex(background);
  if (!bg) return null;
  const darker = prefersDarkText(background);
  const fg = text && parseHex(text) ? text : toHex(shade(bg, darker, 9));
  const muted = text && parseHex(text) ? `color-mix(in oklab, ${text} 72%, ${background})` : toHex(shade(bg, darker, 4.8));
  const mix = (percent: number) => `color-mix(in oklab, ${background}, ${fg} ${percent}%)`;
  // Buttons in a color of their own, with text on them that reads.
  const button = accent ? parseHex(accent) : null;
  const onButton = button
    ? contrast(button, bg) >= 4.5
      ? background
      : toHex(contrast(button, [0, 0, 0]) >= contrast(button, [255, 255, 255]) ? [0, 0, 0] : [255, 255, 255])
    : background;
  return {
    "--canvas": background,
    "--background": mix(6),
    "--card": mix(6),
    "--popover": mix(5),
    "--foreground": fg,
    "--primary": accent ?? fg,
    "--primary-foreground": onButton,
    "--secondary": mix(12),
    "--secondary-foreground": fg,
    "--muted": mix(12),
    "--muted-foreground": muted,
    "--accent": accent ? `color-mix(in oklab, ${background}, ${accent} 24%)` : mix(16),
    "--accent-foreground": fg,
    "--border": mix(22),
    "--ring": accent ?? mix(50),
  };
}

/** Where the page background is kept for the next start; index.html reads it before anything loads. */
const PAINT = "imagime:paint";

/** Applies the colors for `background` to the whole document (menus are portalled to <body>). */
export function useBackgroundTheme(background: string | undefined, text?: string, accent?: string) {
  useEffect(() => {
    // Remembered for the next start, which paints it before the app has loaded.
    try {
      if (background) localStorage.setItem(PAINT, background);
      else localStorage.removeItem(PAINT);
    } catch {
      // Without storage the next start shows the system's light or dark look first.
    }
    const vars = background ? themeFor(background, text, accent) : null;
    if (!vars) return;
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) root.setProperty(name, value);
    return () => {
      for (const name of Object.keys(vars)) root.removeProperty(name);
    };
  }, [background, text, accent]);
}
