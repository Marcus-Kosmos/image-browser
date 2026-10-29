import { describe, expect, it } from "vitest";
import { contrast, luminance, parseHex, prefersDarkText, themeFor, themesFromColors } from "./theme";

describe("theme", () => {
  it("parses short and long hex colors", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("#1a2B3c")).toEqual([26, 43, 60]);
    expect(parseHex("red")).toBeNull();
  });

  it("uses dark text on light backgrounds and light text on dark ones", () => {
    expect(prefersDarkText("#ffffff")).toBe(true);
    expect(prefersDarkText("#f2e8d5")).toBe(true);
    expect(prefersDarkText("#000000")).toBe(false);
    expect(prefersDarkText("#1e3a5f")).toBe(false);
  });

  it("derives button and text colors from the background", () => {
    const dark = themeFor("#202830")!;
    expect(dark["--canvas"]).toBe("#202830");
    expect(prefersDarkText(dark["--foreground"])).toBe(true);
    expect(dark["--primary-foreground"]).toBe("#202830");
    expect(dark["--accent"]).toContain("#202830");
    expect(prefersDarkText(themeFor("#fffaf0")!["--foreground"])).toBe(false);
    expect(themeFor("nope")).toBeNull();
  });

  it("tints text and buttons with the background's hue and keeps them readable", () => {
    for (const bg of ["#bfdbfe", "#fde68a", "#1e3a5f", "#808080", "#7c3aed", "#ffffff", "#000000"]) {
      const t = themeFor(bg)!;
      const rgb = parseHex(bg)!;
      // Mid tones such as gray or violet can't reach 7 against anything; they get the best there is.
      expect(contrast(parseHex(t["--foreground"])!, rgb)).toBeGreaterThanOrEqual(["#808080", "#7c3aed"].includes(bg) ? 5 : 7);
      expect(contrast(parseHex(t["--muted-foreground"])!, rgb)).toBeGreaterThanOrEqual(4.5);
    }
    // Light blue gets dark blue text and buttons, not plain black.
    const [r, g, b] = parseHex(themeFor("#bfdbfe")!["--foreground"])!;
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(20);
    expect(g).toBeGreaterThan(r);
  });
});

describe("themesFromColors", () => {
  const many = (rgb: [number, number, number], n: number) => Array.from({ length: n }, () => rgb);

  it("makes themes from the three main hues, each used once, readable", () => {
    const colors = [...many([200, 40, 40], 60), ...many([40, 60, 200], 30), ...many([40, 170, 60], 20)];
    const themes = themesFromColors(colors);
    expect(themes).toHaveLength(6);
    for (const t of themes) {
      const bg = parseHex(t.background)!;
      expect(contrast(parseHex(t.text)!, bg)).toBeGreaterThanOrEqual(9);
      expect(contrast(parseHex(t.accent)!, bg)).toBeGreaterThanOrEqual(3.5);
      expect(luminance(bg)).toBeLessThan(0.05);
    }
    // The first theme's page is in the hue there is most of.
    const [r, g, b] = parseHex(themes[0].background)!;
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it("is light for mostly light pictures", () => {
    const themes = themesFromColors(many([240, 220, 160], 50));
    expect(themes.length).toBeGreaterThan(0);
    expect(prefersDarkText(themes[0].background)).toBe(true);
  });

  it("is one gray theme for pictures without color, and none without pixels", () => {
    const grays = Array.from({ length: 50 }, (_, i) => [i * 4, i * 4, i * 4] as [number, number, number]);
    const themes = themesFromColors(grays);
    expect(themes).toHaveLength(1);
    const [r, g, b] = parseHex(themes[0].background)!;
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(themesFromColors([])).toEqual([]);
  });
});
