import { describe, expect, it } from "vitest";
import { captionLineHeight, hasRoomToPin, levelForSize, pinLayout, pinPages, resolveTransition, sizeForSlider, sliderForSize, TEXT_SIZE_MAX, TEXT_SIZE_MIN, textWeight } from "./viewer";

describe("resolveTransition", () => {
  it("keeps a chosen transition", () => {
    expect(resolveTransition("parallax", 0)).toBe("parallax");
    expect(resolveTransition("parallax", 5)).toBe("parallax");
  });

  it("cycles effects in auto mode, with a calm fade now and then", () => {
    const steps = Array.from({ length: 8 }, (_, i) => resolveTransition("auto", i));
    expect(new Set(steps).size).toBeGreaterThan(4);
    expect(steps.filter((s) => s === "fade").length).toBeGreaterThanOrEqual(2);
    expect(steps).not.toContain("auto");
  });
});

describe("pinLayout", () => {
  const room = { width: 1000, height: 600 };
  const portrait = { width: 400, height: 600 };
  const landscape = { width: 900, height: 600 };

  it("puts pinned pictures and the current one in a row at one height", () => {
    const layout = pinLayout("full", [portrait, portrait], portrait, room, 10);
    // Three portraits (2/3 each) need 1200 px at full height, so the row shrinks to fit 1000.
    expect(layout.pins.map((r) => r.height)).toEqual([490, 490]);
    expect(layout.current.height).toBe(490);
    expect(layout.width).toBeLessThanOrEqual(1000);
    expect(layout.width).toBeGreaterThan(990);
  });

  it("shrinks the pinned ones too when a wide picture comes in", () => {
    const narrow = pinLayout("full", [portrait, portrait], portrait, room, 10).pins[0].height;
    const wide = pinLayout("full", [portrait, portrait], landscape, room, 10).pins[0].height;
    expect(wide).toBeLessThan(narrow);
  });

  it("stacks medium pins two high and leaves the rest", () => {
    const layout = pinLayout("medium", [portrait, portrait, portrait], landscape, room, 10);
    expect(layout.pins.map((r) => r.height)).toEqual([295, 295, 295]);
    expect(layout.pins[2].x).toBeGreaterThan(layout.pins[0].x);
    expect(layout.current.x + layout.current.width).toBeLessThanOrEqual(1000);
  });

  it("keeps a short puzzle in one row", () => {
    const layout = pinLayout("puzzle", [portrait], portrait, { width: 1600, height: 600 }, 10);
    expect(layout.current.y).toBe(layout.pins[0].y);
    expect(layout.current.x).toBeGreaterThan(layout.pins[0].x);
  });

  it("moves a long puzzle into rows that fill the room, the current picture last", () => {
    const room = { width: 1600, height: 900 };
    const layout = pinLayout("puzzle", Array(9).fill(landscape), landscape, room, 10);
    const rows = new Set([...layout.pins, layout.current].map((r) => r.y));
    expect(rows.size).toBeGreaterThan(1);
    expect(layout.height).toBeLessThanOrEqual(900);
    expect(layout.width).toBeLessThanOrEqual(1600);
    expect(layout.current.y).toBe(Math.max(...rows));
    expect(layout.current.x).toBe(
      Math.max(...[...layout.pins, layout.current].filter((r) => r.y === layout.current.y).map((r) => r.x)),
    );
    // Covers most of the room, unlike one long, low row.
    const area = [...layout.pins, layout.current].reduce((sum, r) => sum + r.width * r.height, 0);
    expect(area).toBeGreaterThan(room.width * room.height * 0.7);
  });

  it("stops pinning when the current picture would get too small", () => {
    expect(hasRoomToPin("full", [portrait], portrait, room, 10)).toBe(true);
    expect(hasRoomToPin("full", Array(6).fill(landscape), landscape, room, 10)).toBe(false);
    expect(hasRoomToPin("medium", Array(8).fill(portrait), landscape, room, 10)).toBe(false);
    expect(hasRoomToPin("puzzle", Array(13).fill(landscape), landscape, room, 10)).toBe(true);
    expect(hasRoomToPin("puzzle", Array(80).fill(landscape), landscape, room, 10)).toBe(false);
  });

  it("puts the current picture where it stands among the pinned ones", () => {
    const last = pinLayout("full", [portrait, landscape], portrait, room, 10);
    const first = pinLayout("full", [portrait, landscape], portrait, room, 10, 0);
    expect(first.current.x).toBe(0);
    expect(first.pins[0].x).toBeGreaterThan(0);
    expect(last.current.x).toBeGreaterThan(last.pins[1].x);
  });

  it("splits a long series into pages that each fit", () => {
    const pages = pinPages("full", Array(14).fill(landscape), room, 10);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat()).toEqual([...Array(14).keys()]);
    for (const page of pages) {
      const sizes = page.map(() => landscape);
      expect(hasRoomToPin("full", sizes.slice(0, -1), landscape, room, 10)).toBe(true);
    }
    expect(pinPages("full", [], room, 10)).toEqual([]);
  });

  it("gives the whole room to the current picture when nothing is pinned", () => {
    const layout = pinLayout("full", [], portrait, room, 10);
    expect(layout.pins).toEqual([]);
    expect(layout.current).toEqual({ x: 0, y: 0, width: 400, height: 600 });
  });
});

describe("captionLineHeight", () => {
  it("draws larger sizes larger, but never more than a third of the room", () => {
    expect(captionLineHeight({ level: 1 }, "normal", 900)).toBe(52);
    expect(captionLineHeight({ level: 1 }, "huge", 900)).toBe(208);
    expect(captionLineHeight({ level: 1 }, "huge", 300)).toBe(100);
    expect(captionLineHeight({ level: 3 }, "large", 900)).toBe(48);
  });

  it("goes by the size from the slider when there is one", () => {
    expect(captionLineHeight({ level: 1, size: 20 }, "normal", 900)).toBe(20);
    expect(captionLineHeight({ level: 3, size: 100 }, "large", 900)).toBe(100);
    expect(captionLineHeight({ level: 3, size: 16 }, "huge", 900)).toBe(16);
  });
});

describe("text size slider", () => {
  it("runs from body text of about 10 points to the largest size, and back", () => {
    expect(sizeForSlider(0)).toBe(TEXT_SIZE_MIN);
    expect(TEXT_SIZE_MIN * 0.62).toBeCloseTo(10, 0);
    expect(sizeForSlider(100)).toBe(TEXT_SIZE_MAX);
    for (const size of [16, 20, 30, 52, 120]) expect(Math.abs(sizeForSlider(sliderForSize(size)) - size) / size).toBeLessThan(0.03);
    expect(sliderForSize(4)).toBe(0);
    expect(sliderForSize(1000)).toBe(100);
  });
});

describe("text sizes", () => {
  it("sets body text lighter than headings", () => {
    expect(textWeight({ level: 3, size: 20 })).toBe(400);
    expect(textWeight({ level: 3 })).toBe(500);
    expect(textWeight({ level: 1 })).toBe(600);
  });

  it("finds the level that matches a size", () => {
    expect(levelForSize(20)).toBe(3);
    expect(levelForSize(40)).toBe(2);
    expect(levelForSize(80)).toBe(1);
  });
});
