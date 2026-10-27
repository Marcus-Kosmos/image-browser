import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageEntry } from "@/lib/api";
import { justifiedLayout, paginate, rowHeightForPage, type LayoutBox } from "@/lib/layout";
import { resolveReveal } from "@/lib/reveal";
import type { FolderSettings, ImageSettings } from "@/lib/settings";
import { ImageTile } from "./ImageTile";

interface GalleryProps {
  /** Changes when another folder or set of folders is opened. */
  viewKey: string;
  images: ImageEntry[];
  /** Key under which an image's settings are stored. */
  imageKey: (image: ImageEntry) => string;
  rowHeight: number;
  settings: FolderSettings;
  onOpen: (index: number) => void;
  onTrash: (index: number) => void;
  onChangeImage: (key: string, change: ImageSettings) => void;
  /** Image to bring into view and mark, e.g. the one just viewed full screen. A new object re-triggers it. */
  highlight?: { index: number } | null;
}

const GAP = 6;
const FLOW_PADDING = 16;
const PAGE_PADDING_X = 32;
const PAGE_PADDING_Y = 28;
const PAGE_NUMBER_SPACE = 24;
/** Content this far outside the viewport stays mounted, so thumbnails are ready before they scroll in. */
const OVERSCAN = 800;

export function Gallery({
  viewKey,
  images,
  imageKey,
  rowHeight,
  settings,
  onOpen,
  onTrash,
  onChangeImage,
  highlight,
}: GalleryProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  /** First image in view, kept in view when the layout changes (resize, mode, size). */
  const anchor = useRef(0);
  const pagesMode = settings.viewMode === "pages";

  useEffect(() => {
    if (!root) return;
    const measure = () => setSize({ width: root.clientWidth, height: root.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  const items = useMemo(
    () =>
      images.map((img) => ({
        aspectRatio: img.width / img.height,
        size: settings.images[imageKey(img)]?.size,
      })),
    [images, imageKey, settings.images],
  );

  const pageBottom = PAGE_PADDING_Y + (settings.showPageNumbers ? PAGE_NUMBER_SPACE : 0);
  const pageContent = {
    width: size.width - PAGE_PADDING_X * 2,
    height: size.height - PAGE_PADDING_Y - pageBottom,
  };

  const layout = useMemo(() => {
    if (pagesMode) {
      const rh = rowHeightForPage(pageContent.height, rowHeight, GAP);
      return justifiedLayout(items, pageContent.width, rh, GAP);
    }
    return justifiedLayout(items, size.width - FLOW_PADDING * 2, rowHeight, GAP);
  }, [pagesMode, items, size.width, pageContent.width, pageContent.height, rowHeight]);

  const pages = useMemo(
    () => (pagesMode && pageContent.height > 0 ? paginate(layout, pageContent.width, pageContent.height) : []),
    [pagesMode, layout, pageContent.width, pageContent.height],
  );

  // Row number and position within the row for each image, for alternating and staggered effects.
  const placement = useMemo(() => {
    const row = new Array<number>(images.length);
    const order = new Array<number>(images.length);
    layout.rows.forEach((r, ri) => r.boxes.forEach((b, bi) => ((row[b.index] = ri), (order[b.index] = bi))));
    return { row, order };
  }, [layout, images.length]);

  const pageHeight = size.height;
  const currentPage = pagesMode && pageHeight > 0 ? Math.round(scrollTop / pageHeight) : 0;

  const onScroll = (top: number) => {
    setScrollTop(top);
    if (pagesMode) {
      const page = pages[Math.round(top / pageHeight)];
      if (page) anchor.current = page.start;
    } else {
      const row = layout.rows.find((r) => r.y + r.height + FLOW_PADDING > top);
      if (row) anchor.current = row.boxes[0].index;
    }
  };

  // Keep the anchor image in view when the layout changes.
  useLayoutEffect(() => {
    if (!root) return;
    let target = 0;
    if (pagesMode) {
      const idx = pages.findIndex((p) => anchor.current >= p.start && anchor.current < p.end);
      target = Math.max(0, idx) * pageHeight;
    } else {
      const row = layout.rows.find((r) => r.boxes.some((b) => b.index === anchor.current));
      target = row ? row.y : 0;
    }
    root.scrollTop = target;
    setScrollTop(root.scrollTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, pages, root]);

  // A new folder starts at the top.
  useEffect(() => {
    anchor.current = 0;
    if (root) root.scrollTop = 0;
  }, [viewKey, root]);

  // Center the highlighted image (or show its page), mark it for a moment and give it focus.
  const [marked, setMarked] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!highlight || !root) return;
    const { index } = highlight;
    if (pagesMode) {
      const page = pages.findIndex((p) => index >= p.start && index < p.end);
      if (page >= 0) root.scrollTop = page * pageHeight;
    } else {
      const box = layout.rows.flatMap((r) => r.boxes).find((b) => b.index === index);
      if (box) root.scrollTop = FLOW_PADDING + box.y + box.height / 2 - root.clientHeight / 2;
    }
    anchor.current = index;
    setScrollTop(root.scrollTop);
    setMarked(index);
    const frame = requestAnimationFrame(() =>
      root.querySelector<HTMLElement>(`[data-index="${index}"] button`)?.focus({ preventScroll: true }),
    );
    const timer = setTimeout(() => setMarked(null), 2500);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
    // Only when a new highlight is requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, root]);

  const goToPage = useCallback(
    (page: number) => root?.scrollTo({ top: page * pageHeight, behavior: "smooth" }),
    [root, pageHeight],
  );

  const renderTile = (box: LayoutBox, offsetX: number, offsetY: number) => {
    const image = images[box.index];
    const key = imageKey(image);
    const imageSettings = settings.images[key] ?? {};
    return (
      <ImageTile
        key={image.path}
        image={image}
        box={{ ...box, x: box.x + offsetX, y: box.y + offsetY }}
        reveal={resolveReveal(imageSettings.reveal ?? settings.reveal, placement.row[box.index])}
        order={placement.order[box.index]}
        marked={marked === box.index}
        root={root}
        settingsKey={key}
        settings={imageSettings}
        onOpen={onOpen}
        onTrash={onTrash}
        onChange={onChangeImage}
      />
    );
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={setRoot}
        className="absolute inset-0 overflow-y-auto bg-canvas"
        style={pagesMode ? { scrollSnapType: "y mandatory" } : undefined}
        onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
      >
        {pagesMode ? (
          <div className="relative" style={{ height: pages.length * pageHeight }}>
            {pages.map((page, i) =>
              Math.abs(i - currentPage) > 1 ? null : (
                <section
                  key={i}
                  aria-label={`Sida ${i + 1}`}
                  className="absolute inset-x-0"
                  style={{ top: i * pageHeight, height: pageHeight, scrollSnapAlign: "start" }}
                >
                  {page.boxes.map((box) => renderTile(box, PAGE_PADDING_X, PAGE_PADDING_Y))}
                  {settings.showPageNumbers && (
                    <div
                      className="absolute inset-x-0 text-center text-xs text-muted-foreground tabular-nums"
                      style={{ bottom: PAGE_PADDING_Y - 4 }}
                    >
                      {i + 1}
                    </div>
                  )}
                </section>
              ),
            )}
            {/* Snap points for pages that aren't mounted. */}
            {pages.map((_, i) =>
              Math.abs(i - currentPage) > 1 ? (
                <div
                  key={`snap-${i}`}
                  className="absolute inset-x-0"
                  style={{ top: i * pageHeight, height: pageHeight, scrollSnapAlign: "start" }}
                />
              ) : null,
            )}
          </div>
        ) : (
          <div className="relative" style={{ height: layout.height + FLOW_PADDING * 2 }}>
            {layout.rows
              .filter(
                (row) =>
                  row.y + row.height + FLOW_PADDING >= scrollTop - OVERSCAN &&
                  row.y <= scrollTop + size.height + OVERSCAN,
              )
              .flatMap((row) => row.boxes.map((box) => renderTile(box, FLOW_PADDING, FLOW_PADDING)))}
          </div>
        )}
      </div>
      {pagesMode && pages.length > 1 && (
        <div className="absolute right-4 bottom-4 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 0}
            title="Föregående sida (Page Up)"
            aria-label="Föregående sida"
          >
            <ChevronUp />
          </Button>
          <span className="px-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
            Sida {currentPage + 1} av {pages.length}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= pages.length - 1}
            title="Nästa sida (Page Down)"
            aria-label="Nästa sida"
          >
            <ChevronDown />
          </Button>
        </div>
      )}
    </div>
  );
}
