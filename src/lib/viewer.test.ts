import { describe, expect, it } from "vitest";
import { hasRoomToPin, pinLayout, resolveTransition } from "./viewer";

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

  it("stacks a wide picture under a wide one in a puzzle", () => {
    const wide = { width: 1500, height: 600 };
    const layout = pinLayout("puzzle", [wide], wide, { width: 1600, height: 600 }, 10);
    const [top] = layout.pins;
    expect(layout.current.x).toBe(top.x);
    expect(layout.current.y).toBeGreaterThan(top.y);
    expect(layout.current.y + layout.current.height).toBeLessThanOrEqual(layout.height);
  });

  it("gives tall pictures a column each in a puzzle", () => {
    const layout = pinLayout("puzzle", [portrait], portrait, { width: 1600, height: 600 }, 10);
    expect(layout.current.x).toBeGreaterThan(layout.pins[0].x);
    expect(layout.height - layout.pins[0].height).toBeLessThanOrEqual(1);
  });

  it("puts a tall picture under a wide one with the height left", () => {
    const layout = pinLayout("puzzle", [landscape], portrait, { width: 1600, height: 600 }, 10);
    expect(layout.current.x).toBe(layout.pins[0].x);
    expect(layout.current.height).toBeGreaterThan(layout.pins[0].height);
  });

  it("stops pinning when the current picture would get too small", () => {
    expect(hasRoomToPin("full", [portrait], portrait, room, 10)).toBe(true);
    expect(hasRoomToPin("full", Array(6).fill(landscape), landscape, room, 10)).toBe(false);
    expect(hasRoomToPin("medium", Array(8).fill(portrait), landscape, room, 10)).toBe(false);
    expect(hasRoomToPin("puzzle", Array(13).fill(landscape), landscape, room, 10)).toBe(false);
  });

  it("gives the whole room to the current picture when nothing is pinned", () => {
    const layout = pinLayout("full", [], portrait, room, 10);
    expect(layout.pins).toEqual([]);
    expect(layout.current).toEqual({ x: 0, y: 0, width: 400, height: 600 });
  });
});
