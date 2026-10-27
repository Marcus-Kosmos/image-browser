import { describe, expect, it } from "vitest";
import { justifiedLayout } from "./layout";

describe("justifiedLayout", () => {
  it("fills full rows edge to edge", () => {
    const { rows } = justifiedLayout([1.5, 1, 0.75, 1.5, 1.5, 1], 1000, 200, 8);
    const full = rows.slice(0, -1);
    expect(full.length).toBeGreaterThan(0);
    for (const row of full) {
      const last = row.boxes[row.boxes.length - 1];
      expect(last.x + last.width).toBeCloseTo(1000, 5);
    }
  });

  it("keeps every image's aspect ratio", () => {
    const ratios = [1.5, 0.66, 1, 2.2, 0.8];
    const { rows } = justifiedLayout(ratios, 900, 180, 4);
    for (const box of rows.flatMap((r) => r.boxes)) {
      expect(box.width / box.height).toBeCloseTo(ratios[box.index], 5);
    }
  });

  it("does not stretch a short last row", () => {
    const { rows } = justifiedLayout([1, 1], 2000, 200, 8);
    expect(rows).toHaveLength(1);
    expect(rows[0].height).toBe(200);
  });

  it("places every image exactly once, in order", () => {
    const ratios = Array.from({ length: 50 }, (_, i) => 0.5 + (i % 5) * 0.4);
    const { rows } = justifiedLayout(ratios, 1200, 220, 6);
    expect(rows.flatMap((r) => r.boxes.map((b) => b.index))).toEqual(ratios.map((_, i) => i));
  });

  it("stacks rows with the gap between them", () => {
    const { rows, height } = justifiedLayout([1, 1, 1, 1, 1, 1], 300, 100, 10);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].y).toBeCloseTo(rows[i - 1].y + rows[i - 1].height + 10, 5);
    }
    const last = rows[rows.length - 1];
    expect(height).toBeCloseTo(last.y + last.height, 5);
  });
});
