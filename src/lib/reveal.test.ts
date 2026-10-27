import { describe, expect, it } from "vitest";
import { AUTO_CYCLE, resolveReveal } from "./reveal";

describe("resolveReveal", () => {
  it("keeps a single effect on every row", () => {
    expect(resolveReveal("rise", 0)).toBe("rise");
    expect(resolveReveal("parallax", 5)).toBe("parallax");
  });

  it("alternates slide directions by row", () => {
    expect(resolveReveal("slide-alternate", 0)).toBe("slide-left");
    expect(resolveReveal("slide-alternate", 1)).toBe("slide-right");
  });

  // An image that moves; about one in four stays still (see below).
  const moving = Array.from({ length: 200 }, (_, i) => i).find((i) => resolveReveal("auto", 0, i) !== "none")!;

  it("moves on to the next effect each row in auto, then starts over", () => {
    const rows = Array.from({ length: AUTO_CYCLE.length + 1 }, (_, row) => resolveReveal("auto", row, moving));
    expect(rows.slice(0, AUTO_CYCLE.length)).toEqual(AUTO_CYCLE);
    expect(rows[AUTO_CYCLE.length]).toBe(AUTO_CYCLE[0]);
  });

  it("leaves every third row still in auto", () => {
    const still = Array.from({ length: 9 }, (_, row) => resolveReveal("auto", row, moving) === "none");
    expect(still).toEqual([false, false, true, false, false, true, false, false, true]);
  });

  it("leaves about one image in four still in auto, spread out and the same each time", () => {
    const still = Array.from({ length: 400 }, (_, i) => resolveReveal("auto", 0, i) === "none");
    const count = still.filter(Boolean).length;
    expect(count).toBeGreaterThan(70);
    expect(count).toBeLessThan(130);
    // Never a long run of still images in a row.
    expect(still.join("")).not.toContain(Array(5).fill("true").join(""));
    expect(resolveReveal("auto", 0, 17)).toBe(resolveReveal("auto", 0, 17));
  });
});
