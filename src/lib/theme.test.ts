import { describe, expect, it } from "vitest";
import { parseHex, prefersDarkText, themeFor } from "./theme";

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
    expect(dark["--foreground"]).toBe("#fafafa");
    expect(dark["--primary-foreground"]).toBe("#202830");
    expect(dark["--accent"]).toContain("#202830");
    expect(themeFor("#fffaf0")!["--foreground"]).toBe("#18181b");
    expect(themeFor("nope")).toBeNull();
  });
});
