import { describe, expect, it } from "vitest";
import { justifiedLayout, paginate, rowHeightForPage } from "./layout";

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

describe("justifiedLayout with sizes", () => {
  const W = 1200;
  const fillsWidth = (boxes: { x: number; width: number }[]) =>
    Math.max(...boxes.map((b) => b.x + b.width));

  it("stacks two small images in one column of the row height", () => {
    const items = [
      { aspectRatio: 1.5 },
      { aspectRatio: 1.5, size: "small" as const },
      { aspectRatio: 1, size: "small" as const },
      { aspectRatio: 1.5 },
      { aspectRatio: 1.5 },
      { aspectRatio: 1.5 },
    ];
    const { rows } = justifiedLayout(items, W, 200, 8);
    const row = rows[0];
    const [a, b] = [row.boxes.find((x) => x.index === 1)!, row.boxes.find((x) => x.index === 2)!];
    expect(a.x).toBeCloseTo(b.x);
    expect(a.width).toBeCloseTo(b.width);
    expect(b.y + b.height - a.y).toBeCloseTo(row.height);
    expect(a.width / a.height).toBeCloseTo(1.5);
    expect(b.width / b.height).toBeCloseTo(1);
    expect(fillsWidth(row.boxes)).toBeCloseTo(W);
  });

  it("lets a large image span two full rows with images beside it", () => {
    const items = [{ aspectRatio: 1.5, size: "large" as const }, ...Array(12).fill({ aspectRatio: 1.5 })];
    const { rows } = justifiedLayout(items, W, 180, 8);
    const band = rows[0];
    const large = band.boxes.find((b) => b.index === 0)!;
    expect(large.height).toBeCloseTo(band.height);
    expect(large.width / large.height).toBeCloseTo(1.5);
    const beside = band.boxes.filter((b) => b.index !== 0);
    expect(new Set(beside.map((b) => Math.round(b.y))).size).toBe(2);
    expect(fillsWidth(band.boxes)).toBeCloseTo(W);
    for (const b of beside) expect(b.x).toBeGreaterThan(large.x + large.width);
  });

  it("keeps aspect ratios and order with mixed sizes", () => {
    const sizes = ["medium", "large", "small", "small", "medium", "large", "medium", "small"] as const;
    const items = Array.from({ length: 40 }, (_, i) => ({
      aspectRatio: 0.6 + (i % 5) * 0.35,
      size: sizes[i % sizes.length],
    }));
    const { rows } = justifiedLayout(items, W, 180, 6);
    const boxes = rows.flatMap((r) => r.boxes);
    expect(boxes.map((b) => b.index).sort((p, q) => p - q)).toEqual(items.map((_, i) => i));
    for (const b of boxes) {
      expect(b.width / b.height).toBeCloseTo(items[b.index].aspectRatio, 3);
      expect(b.x + b.width).toBeLessThanOrEqual(W + 0.01);
    }
    for (const r of rows) for (const b of r.boxes) expect(b.y + b.height).toBeLessThanOrEqual(r.y + r.height + 0.01);
  });

  it("gives a panorama its own row", () => {
    const items = [{ aspectRatio: 1 }, { aspectRatio: 5, size: "large" as const }, { aspectRatio: 1 }];
    const { rows } = justifiedLayout(items, W, 200, 8);
    expect(rows.map((r) => r.boxes.map((b) => b.index))).toEqual([[0], [1], [2]]);
  });
});

describe("rowHeightForPage", () => {
  it("fills the page with a whole number of rows", () => {
    const h = rowHeightForPage(700, 220, 6);
    const rows = Math.round(700 / h);
    expect(rows * h + (rows - 1) * 6).toBeCloseTo(700);
  });
});

describe("paginate", () => {
  const ratios = Array.from({ length: 40 }, (_, i) => 0.6 + (i % 4) * 0.4);

  it("keeps every page within the page size", () => {
    const pageW = 1200;
    const pageH = 700;
    const layout = justifiedLayout(ratios, pageW, rowHeightForPage(pageH, 200, 6), 6);
    const pages = paginate(layout, pageW, pageH);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      for (const b of page.boxes) {
        expect(b.x).toBeGreaterThanOrEqual(-0.01);
        expect(b.y).toBeGreaterThanOrEqual(-0.01);
        expect(b.x + b.width).toBeLessThanOrEqual(pageW + 0.01);
        expect(b.y + b.height).toBeLessThanOrEqual(pageH + 0.01);
      }
    }
  });

  it("puts every image on exactly one page, in order", () => {
    const layout = justifiedLayout(ratios, 1000, 180, 6);
    const pages = paginate(layout, 1000, 600);
    expect(pages.flatMap((p) => p.boxes.map((b) => b.index))).toEqual(ratios.map((_, i) => i));
    for (let i = 1; i < pages.length; i++) expect(pages[i].start).toBe(pages[i - 1].end);
  });

  it("scales a row taller than the page down to fit", () => {
    const layout = justifiedLayout([{ aspectRatio: 0.5 }], 1000, 900, 6);
    const [page] = paginate(layout, 1000, 600);
    expect(page.boxes[0].height).toBeCloseTo(600);
    expect(page.boxes[0].width).toBeCloseTo(300);
    expect(page.boxes[0].x).toBeCloseTo(350);
  });
});

describe("headings", () => {
  const ratios = [1.5, 1, 0.75, 1.5, 1.5, 1, 1.333, 0.8, 1.5, 1, 2, 0.667, 1.5, 1.5];

  it("keeps the picture's proportions below an image heading", () => {
    const items = ratios.map((r, i) => ({ aspectRatio: r, header: i === 2 ? 30 : undefined }));
    const { rows } = justifiedLayout(items, 1000, 200, 6);
    const box = rows.flatMap((r) => r.boxes).find((b) => b.index === 2)!;
    expect(box.header).toBe(30);
    expect(box.width / (box.height - 30)).toBeCloseTo(0.75, 5);
    // The row is still filled edge to edge.
    const row = rows.find((r) => r.boxes.includes(box))!;
    const last = row.boxes[row.boxes.length - 1];
    expect(last.x + last.width).toBeCloseTo(1000, 5);
  });

  it("keeps a large image's proportions below its heading", () => {
    const items = ratios.map((r, i) => ({
      aspectRatio: r,
      size: i === 0 ? ("large" as const) : undefined,
      header: i === 0 ? 40 : undefined,
    }));
    const { rows } = justifiedLayout(items, 1200, 180, 6);
    const box = rows[0].boxes.find((b) => b.index === 0)!;
    expect(box.width / (box.height - 40)).toBeCloseTo(1.5, 5);
    const rights = rows[0].boxes.map((b) => b.x + b.width);
    expect(Math.max(...rights)).toBeCloseTo(1200, 5);
  });

  it("starts a new row under a page heading", () => {
    const items = ratios.map((r, i) => ({ aspectRatio: r, section: i === 5 ? 50 : undefined }));
    const { rows } = justifiedLayout(items, 1000, 200, 6);
    const start = rows.findIndex((r) => r.section);
    expect(rows[start].boxes[0].index).toBe(5);
    expect(rows[start].section).toMatchObject({ index: 5, height: 50 });
    expect(rows[start].y).toBeCloseTo(rows[start].section!.y + 50);
    const before = rows[start - 1];
    expect(before.boxes[before.boxes.length - 1].index).toBe(4);
  });

  it("starts a new page at a page heading and shows the heading on top", () => {
    const items = ratios.map((r, i) => ({ aspectRatio: r, section: i === 3 ? 50 : undefined }));
    const layout = justifiedLayout(items, 1000, 150, 6);
    const pages = paginate(layout, 1000, 700);
    const page = pages.find((p) => p.section)!;
    expect(page.start).toBe(3);
    expect(page.section!.index).toBe(3);
    expect(page.boxes[0].y).toBeGreaterThanOrEqual(page.section!.y + page.section!.height - 0.01);
    expect(pages.flatMap((p) => p.boxes.map((b) => b.index))).toEqual(ratios.map((_, i) => i));
  });
});
