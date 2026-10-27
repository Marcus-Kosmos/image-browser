export interface LayoutBox {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Height of the heading band at the top of the box; the picture fills the rest. */
  header?: number;
}

/** A page heading on its own row above the image it belongs to. */
export interface LayoutSection {
  index: number;
  y: number;
  height: number;
}

export interface LayoutRow {
  y: number;
  height: number;
  /** Width the row's images and gaps actually occupy; less than the container for unfilled rows. */
  width: number;
  boxes: LayoutBox[];
  /** Page heading right above this row; the row starts a new section. */
  section?: LayoutSection;
}

export interface JustifiedLayout {
  rows: LayoutRow[];
  height: number;
}

export type ItemSize = "small" | "medium" | "large";

export interface LayoutItem {
  aspectRatio: number;
  size?: ItemSize;
  /** Height of a heading above the image. */
  header?: number;
  /** Height of a page heading before the image; the image then starts a new row (and page). */
  section?: number;
}

/**
 * A slot in a row. Its width at row height h is `a * h + b`:
 * a single image has b = 0; two small images stacked in one column share
 * the row height minus the gap between them, which gives b < 0.
 */
interface Unit {
  indices: number[];
  a: number;
  b: number;
  large: boolean;
  header: number;
}

function buildUnits(ratios: number[], sizes: ItemSize[], headers: number[], gap: number, from: number, to: number): Unit[] {
  const units: Unit[] = [];
  for (let i = from; i < to; i++) {
    if (sizes[i] === "small" && sizes[i + 1] === "small" && i + 1 < to && !headers[i] && !headers[i + 1]) {
      // Same width w for both: w / r1 + gap + w / r2 = h  =>  w = c * (h - gap)
      const c = 1 / (1 / ratios[i] + 1 / ratios[i + 1]);
      units.push({ indices: [i, i + 1], a: c, b: -c * gap, large: false, header: 0 });
      i++;
    } else {
      // A heading above the picture takes height but no width: w = r * (h - header).
      const header = headers[i];
      units.push({ indices: [i], a: ratios[i], b: -ratios[i] * header, large: sizes[i] === "large", header });
    }
  }
  return units;
}

/**
 * Packs images into rows that exactly fill `containerWidth`, like a puzzle.
 * Medium images share a row at a height close to `targetRowHeight`. Two small
 * images in a row are stacked in one column. A large image spans two rows, with
 * the following images filling the space beside it. The last row is not stretched.
 * A page heading ends the row before its image and starts a new section.
 */
export function justifiedLayout(
  items: Array<number | LayoutItem>,
  containerWidth: number,
  targetRowHeight: number,
  gap: number,
): JustifiedLayout {
  const rows: LayoutRow[] = [];
  const W = containerWidth;
  const h = targetRowHeight;
  if (W <= 0 || items.length === 0) return { rows, height: 0 };

  const ratios = items.map((it) => (typeof it === "number" ? it : it.aspectRatio));
  const sizes = items.map((it) => (typeof it === "number" ? "medium" : (it.size ?? "medium")));
  const headers = items.map((it) => (typeof it === "number" ? 0 : (it.header ?? 0)));
  const sectionHeights = items.map((it) => (typeof it === "number" ? 0 : (it.section ?? 0)));
  let units: Unit[] = [];

  const widthAt = (us: Unit[], height: number) =>
    us.reduce((sum, u) => sum + u.a * height + u.b, 0) + gap * (us.length - 1);
  /** Height at which `us` exactly fill `width`. */
  const fitHeight = (us: Unit[], width: number) =>
    (width - gap * (us.length - 1) - us.reduce((s, u) => s + u.b, 0)) / us.reduce((s, u) => s + u.a, 0);

  /** Takes non-large units from `from` until they fill `width` at height h. */
  const take = (from: number, width: number, initial: Unit[] = []) => {
    const taken = [...initial];
    let i = from;
    while (i < units.length && !units[i].large && (taken.length === 0 || widthAt(taken, h) < width)) {
      taken.push(units[i++]);
    }
    return { taken, next: i, full: taken.length > 0 && widthAt(taken, h) >= width };
  };

  const placeUnits = (us: Unit[], x0: number, y: number, height: number, out: LayoutBox[]) => {
    let x = x0;
    for (const u of us) {
      const w = u.a * height + u.b;
      if (u.indices.length === 1) {
        out.push({ index: u.indices[0], x, y, width: w, height, ...(u.header ? { header: u.header } : {}) });
      } else {
        const [i1, i2] = u.indices;
        const h1 = w / ratios[i1];
        out.push({ index: i1, x, y, width: w, height: h1 });
        out.push({ index: i2, x, y: y + h1 + gap, width: w, height: height - h1 - gap });
      }
      x += w + gap;
    }
    return x - gap - x0;
  };

  let y = 0;
  let bands = 0;
  // Page heading waiting to be attached to the next row.
  let section: LayoutSection | undefined;
  const addRow = (row: Omit<LayoutRow, "section">) => {
    rows.push(section ? { ...row, section } : row);
    section = undefined;
  };
  const pushRow = (us: Unit[], height: number) => {
    const boxes: LayoutBox[] = [];
    const width = placeUnits(us, 0, y, height, boxes);
    addRow({ y, height, width, boxes });
    y += height + gap;
  };

  // Each page heading starts a section that is laid out on its own.
  const starts = [0, ...sectionHeights.flatMap((h, idx) => (h > 0 && idx > 0 ? [idx] : []))];
  starts.forEach((start, s) => {
    const end = starts[s + 1] ?? items.length;
    if (sectionHeights[start] > 0) {
      section = { index: start, y, height: sectionHeights[start] };
      y += sectionHeights[start];
    }
    units = buildUnits(ratios, sizes, headers, gap, start, end);
    layoutUnits();
  });

  function layoutUnits() {
  let i = 0;
  while (i < units.length) {
    if (!units[i].large) {
      const row = take(i, W);
      if (row.full) {
        pushRow(row.taken, fitHeight(row.taken, W));
        i = row.next;
        continue;
      }
      if (row.next >= units.length) {
        pushRow(row.taken, Math.min(h, fitHeight(row.taken, W)));
        i = row.next;
        continue;
      }
      // Stopped at a large image: the images so far go beside it.
      i = placeBand(row.taken, row.next);
    } else {
      i = placeBand([], i);
    }
  }
  }

  function placeBand(pending: Unit[], li: number): number {
    const large = units[li];
    const ar = large.a;
    const estimate = 2 * h + gap;
    const after = li + 1;

    // Panoramas get a row of their own rather than squeezing everything beside them.
    if (ar * estimate + large.b > 0.75 * W) {
      if (pending.length) pushRow(pending, Math.min(h, fitHeight(pending, W)));
      pushRow([large], Math.min(estimate, fitHeight([large], W)));
      return after;
    }

    const besideWidth = W - ar * estimate - large.b - gap;
    const first = take(after, besideWidth, pending);
    const second = first.full ? take(first.next, besideWidth) : { taken: [], next: first.next, full: false };

    if (second.taken.length === 0) {
      // Not enough images for two rows beside it: it joins a normal row instead.
      const us = [...first.taken, large];
      pushRow(us, Math.min(h, fitHeight(us, W)));
      return first.next;
    }

    // Solve for the band height H so that both rows beside the large image fill
    // the remaining width exactly: h_i = K_i - M_i * H and H = h1 + gap + h2.
    const k = (us: Unit[]) =>
      (W - gap - large.b - gap * (us.length - 1) - us.reduce((s, u) => s + u.b, 0)) / us.reduce((s, u) => s + u.a, 0);
    const m = (us: Unit[]) => ar / us.reduce((s, u) => s + u.a, 0);
    const H = (k(first.taken) + k(second.taken) + gap) / (1 + m(first.taken) + m(second.taken));
    const h1 = k(first.taken) - m(first.taken) * H;
    const h2 = H - h1 - gap;
    const largeWidth = ar * H + large.b;

    const left = pending.length === 0 && bands % 2 === 0;
    const besideX = left ? largeWidth + gap : 0;
    const boxes: LayoutBox[] = [];
    placeUnits(first.taken, besideX, y, h1, boxes);
    placeUnits(second.taken, besideX, y + h1 + gap, h2, boxes);
    boxes.push({
      index: large.indices[0],
      x: left ? 0 : W - largeWidth,
      y,
      width: largeWidth,
      height: H,
      ...(large.header ? { header: large.header } : {}),
    });
    boxes.sort((p, q) => p.index - q.index);
    addRow({ y, height: H, width: W, boxes });
    y += H + gap;
    bands++;
    return second.next;
  }

  return { rows, height: Math.max(0, y - gap) };
}

/** Row height that makes a whole number of rows fill a page, as close to `target` as possible. */
export function rowHeightForPage(pageHeight: number, target: number, gap: number): number {
  const rows = Math.max(1, Math.round((pageHeight + gap) / (target + gap)));
  return (pageHeight - gap * (rows - 1)) / rows;
}

export interface Page {
  /** Boxes positioned relative to the page's content area. */
  boxes: LayoutBox[];
  /** Index of the first and one past the last image on the page. */
  start: number;
  end: number;
  /** Page heading at the top of the page, relative to the content area. */
  section?: LayoutSection;
}

/**
 * Splits laid-out rows into pages of `pageWidth` x `pageHeight`, the way a web page's
 * first screen ("above the fold") is designed. A page that would overflow is scaled
 * down to fit; each page's content is centered horizontally and vertically.
 */
export function paginate(layout: JustifiedLayout, pageWidth: number, pageHeight: number): Page[] {
  const pages: Page[] = [];
  let group: LayoutRow[] = [];

  const flush = () => {
    if (group.length === 0) return;
    const head = group[0].section;
    const top = head ? head.y : group[0].y;
    const last = group[group.length - 1];
    const blockHeight = last.y + last.height - top;
    const s = Math.min(1, pageHeight / blockHeight);
    const offsetY = (pageHeight - blockHeight * s) / 2;
    const boxes = group.flatMap((row) => {
      const offsetX = (pageWidth - row.width * s) / 2;
      return row.boxes.map((b) => ({
        index: b.index,
        x: offsetX + b.x * s,
        y: offsetY + (b.y - top) * s,
        width: b.width * s,
        height: b.height * s,
        ...(b.header ? { header: b.header * s } : {}),
      }));
    });
    pages.push({
      boxes,
      start: boxes[0].index,
      end: boxes[boxes.length - 1].index + 1,
      ...(head ? { section: { index: head.index, y: offsetY, height: head.height * s } } : {}),
    });
    group = [];
  };

  for (const row of layout.rows) {
    // Small tolerance so rounding doesn't push a row that fits onto the next page.
    const groupTop = group[0]?.section?.y ?? group[0]?.y;
    // A page heading always starts a new page.
    if (group.length > 0 && (row.section || row.y + row.height - groupTop > pageHeight + 0.5)) flush();
    group.push(row);
  }
  flush();
  return pages;
}
