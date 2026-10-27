import { describe, expect, it } from "vitest";
import { resolveTransition } from "./viewer";

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
