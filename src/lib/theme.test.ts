import { describe, expect, it } from "vitest";
import { contrast, parseHex, prefersDarkText, themeFor } from "./theme";

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
