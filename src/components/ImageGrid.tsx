import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageEntry } from "@/lib/api";
import { justifiedLayout } from "@/lib/layout";
import { ImageTile } from "./ImageTile";

interface ImageGridProps {
  images: ImageEntry[];
  rowHeight: number;
  onOpen: (index: number) => void;
  onTrash: (index: number) => void;
}

const PADDING = 16;
const GAP = 6;
/** Rows this far outside the viewport stay mounted, so thumbnails are ready before they scroll in. */
const OVERSCAN = 800;

export function ImageGrid({ images, rowHeight, onOpen, onTrash }: ImageGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth - PADDING * 2);
      setViewport({ top: el.scrollTop, height: el.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(
    () => justifiedLayout(images.map((img) => img.width / img.height), width, rowHeight, GAP),
    [images, width, rowHeight],
  );

  const visibleRows = layout.rows.filter(
    (row) =>
      row.y + row.height >= viewport.top - OVERSCAN && row.y <= viewport.top + viewport.height + OVERSCAN,
  );

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto bg-canvas"
      onScroll={(e) => setViewport({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
    >
      <div className="relative" style={{ height: layout.height + PADDING * 2, margin: `0 ${PADDING}px` }}>
        <div className="absolute inset-x-0" style={{ top: PADDING }}>
          {visibleRows.flatMap((row) =>
            row.boxes.map((box) => (
              <ImageTile
                key={images[box.index].path}
                image={images[box.index]}
                box={box}
                onOpen={onOpen}
                onTrash={onTrash}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}
