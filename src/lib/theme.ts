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

/**
 * Interface colors derived from a page background. Text and buttons are deeper
 * (or paler) shades of the background's own hue, so a light blue gets dark blue
 * buttons, and every shade keeps readable contrast (WCAG AA or better).
 */
export function themeFor(background: string): Record<string, string> | null {
  const bg = parseHex(background);
  if (!bg) return null;
  const darker = prefersDarkText(background);
  const fg = toHex(shade(bg, darker, 9));
  const muted = toHex(shade(bg, darker, 4.8));
  const mix = (percent: number) => `color-mix(in oklab, ${background}, ${fg} ${percent}%)`;
  return {
    "--canvas": background,
    "--background": mix(6),
    "--card": mix(6),
    "--popover": mix(5),
    "--foreground": fg,
    "--primary": fg,
    "--primary-foreground": background,
    "--secondary": mix(12),
    "--secondary-foreground": fg,
    "--muted": mix(12),
    "--muted-foreground": muted,
    "--accent": mix(16),
    "--accent-foreground": fg,
    "--border": mix(22),
    "--ring": mix(50),
  };
}

/** Applies the colors for `background` to the whole document (menus are portalled to <body>). */
export function useBackgroundTheme(background: string | undefined) {
  useEffect(() => {
    const vars = background ? themeFor(background) : null;
    if (!vars) return;
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) root.setProperty(name, value);
    return () => {
      for (const name of Object.keys(vars)) root.removeProperty(name);
    };
  }, [background]);
}
