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

/**
 * Interface colors derived from a page background, so toolbars, buttons and menus
 * take on its hue and keep readable contrast on light and dark backgrounds alike.
 */
export function themeFor(background: string): Record<string, string> | null {
  if (!parseHex(background)) return null;
  const fg = prefersDarkText(background) ? "#18181b" : "#fafafa";
  const mix = (percent: number) => `color-mix(in oklab, ${background}, ${fg} ${percent}%)`;
  return {
    "--canvas": background,
    "--background": mix(5),
    "--card": mix(5),
    "--popover": mix(4),
    "--foreground": fg,
    "--primary": fg,
    "--primary-foreground": background,
    "--secondary": mix(10),
    "--secondary-foreground": fg,
    "--muted": mix(10),
    "--muted-foreground": mix(62),
    "--accent": mix(12),
    "--accent-foreground": fg,
    "--border": mix(16),
    "--ring": mix(45),
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
