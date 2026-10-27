export interface LayoutBox {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutRow {
  y: number;
  height: number;
  boxes: LayoutBox[];
}

export interface JustifiedLayout {
  rows: LayoutRow[];
  height: number;
}

/**
 * Packs images into rows that exactly fill `containerWidth`, like a puzzle:
 * each row is scaled so its images share one height close to `targetRowHeight`.
 * The last row keeps the target height instead of being stretched.
 */
export function justifiedLayout(
  aspectRatios: number[],
  containerWidth: number,
  targetRowHeight: number,
  gap: number,
): JustifiedLayout {
  const rows: LayoutRow[] = [];
  if (containerWidth <= 0) return { rows, height: 0 };

  let y = 0;
  let start = 0;
  let ratioSum = 0;

  const closeRow = (end: number, height: number) => {
    const boxes: LayoutBox[] = [];
    let x = 0;
    for (let i = start; i < end; i++) {
      const width = aspectRatios[i] * height;
      boxes.push({ index: i, x, y, width, height });
      x += width + gap;
    }
    rows.push({ y, height, boxes });
    y += height + gap;
    start = end;
    ratioSum = 0;
  };

  for (let i = 0; i < aspectRatios.length; i++) {
    ratioSum += aspectRatios[i];
    const count = i - start + 1;
    const available = containerWidth - gap * (count - 1);
    if (ratioSum * targetRowHeight >= available) {
      closeRow(i + 1, available / ratioSum);
    }
  }

  if (start < aspectRatios.length) {
    const count = aspectRatios.length - start;
    const available = containerWidth - gap * (count - 1);
    closeRow(aspectRatios.length, Math.min(targetRowHeight, available / ratioSum));
  }

  return { rows, height: Math.max(0, y - gap) };
}
