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

  it("moves on to the next effect each row in auto, then starts over", () => {
    const rows = Array.from({ length: AUTO_CYCLE.length + 1 }, (_, row) => resolveReveal("auto", row));
    expect(rows.slice(0, AUTO_CYCLE.length)).toEqual(AUTO_CYCLE);
    expect(rows[AUTO_CYCLE.length]).toBe(AUTO_CYCLE[0]);
    expect(new Set(rows.slice(0, 3)).size).toBe(3);
  });

  it("leaves every third row still in auto", () => {
    const still = Array.from({ length: 9 }, (_, row) => resolveReveal("auto", row) === "none");
    expect(still).toEqual([false, false, true, false, false, true, false, false, true]);
  });
});
