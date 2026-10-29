import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageEntry } from "@/lib/api";
import { justifiedLayout, paginate, rowHeightForPage, type LayoutBox } from "@/lib/layout";
import { resolveReveal } from "@/lib/reveal";
import type { Tag } from "@/lib/filter";
import type { Series } from "@/lib/library";
import {
  IMAGE_HEADING_HEIGHT,
  PAGE_HEADING_HEIGHT,
  type FolderSettings,
  type ImageSettings,
} from "@/lib/settings";
import type { HeadingKind } from "./HeadingDialog";
import { HeadingText } from "./HeadingText";
import { cn } from "@/lib/utils";
import { ImageTile } from "./ImageTile";
import type { Waiting } from "./WaitingRing";

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
  /** Given in a series: takes the image out of it, leaving the file where it is. */
  onRemove?: (index: number) => void;
  onChangeImage: (key: string, change: ImageSettings) => void;
  /** Paths of favorite images. */
  favorites: Set<string>;
  /** Tags (Favoriter and series) of each image, by path. */
  tags: Map<string, Tag[]>;
  series: Series[];
  onToggleFavorite: (index: number) => void;
  onToggleSeries: (id: string, index: number) => void;
  onEditHeading: (index: number, kind: HeadingKind) => void;
  /** Given in a series: images can be dragged to a new place. `to` is the index to land before. */
  onMove?: (from: number, to: number) => void;
  /**
   * Images dropped on Favoriter or a series in the sidebar (rows marked with data-drop-target):
   * the dragged one, or all selected ones when it is part of the selection.
   */
  onDropOnLibrary: (indices: number[], target: string) => void;
  /** Paths of the selected images. */
  selected: Set<string>;
  onSelectionChange: (paths: Set<string>) => void;
  /** Image to bring into view and mark, e.g. the one just viewed full screen. A new object re-triggers it. */
  highlight?: { index: number } | null;
  /** Marks pictures made or changed by AI. */
  showAiMark?: boolean;
  /** The picture being enlarged, shown as the old version until the copy arrives. */
  waiting?: Waiting | null;
  /** Given in a series: the empty space after the last picture shows a plus that picks pictures to add. */
  onAdd?: () => void;
  /** Says what the plus adds to, e.g. the series' name. */
  addTo?: string;
}

/** Where the plus for adding pictures goes, beside the last row or under it. */
interface AddSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Under the last row, so it adds to the height of the content. */
  below: boolean;
}

/** Narrowest free space beside the last row that the plus is placed in. */
const ADD_MIN_WIDTH = 120;
/** Height of the plus when it goes under the last row. */
const ADD_MAX_HEIGHT = 160;

/** The free space after the last row's boxes, or a band under them when the row is full. */
function addSlotAfter(boxes: LayoutBox[], width: number, room: number): AddSlot | null {
  const bottom = Math.max(...boxes.map((b) => b.y));
  const row = boxes.filter((b) => b.y === bottom);
  const right = Math.max(...row.map((b) => b.x + b.width));
  const height = Math.max(...row.map((b) => b.height));
  const free = width - right - GAP;
  if (free >= Math.min(ADD_MIN_WIDTH, height)) return { x: right + GAP, y: bottom, width: free, height, below: false };
  const under = Math.min(height, ADD_MAX_HEIGHT, room - (bottom + height + GAP));
  if (under < 64) return null;
  return { x: 0, y: bottom + height + GAP, width, height: under, below: true };
}

const GAP = 6;
const FLOW_PADDING = 16;
const PAGE_PADDING_X = 32;
const PAGE_PADDING_Y = 28;
const PAGE_NUMBER_SPACE = 24;
/** Content this far outside the viewport stays mounted, so thumbnails are ready before they scroll in. */
const OVERSCAN = 800;
/** Pointer travel before a press turns into a drag rather than a click. */
const DRAG_THRESHOLD = 6;
/** Distance from the top or bottom edge that scrolls while dragging. */
const EDGE = 64;
/** How long to hold at an edge in pages mode before turning the page. */
const PAGE_TURN_DELAY = 600;

interface DragState {
  from: number;
  /** Index the image lands before; equal to `from` or `from + 1` leaves it in place. */
  to: number;
  x: number;
  y: number;
  thumb: string | null;
  /** Insertion line, in viewport coordinates. */
  bar: { left: number; top: number; height: number } | null;
  /** Sidebar row under the pointer, e.g. "favorites" or "series:<id>". */
  drop: string | null;
  /** How many images are dragged: more than one when the dragged image is selected. */
  count: number;
}

/** Rectangle dragged out over the gallery to select the images it touches, in viewport coordinates. */
interface Marquee {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function Gallery({
  viewKey,
  images,
  imageKey,
  rowHeight,
  settings,
  onOpen,
  onTrash,
  onRemove,
  onChangeImage,
  favorites,
  tags,
  series,
  onToggleFavorite,
  onToggleSeries,
  onEditHeading,
  onMove,
  onDropOnLibrary,
  selected,
  onSelectionChange,
  highlight,
  waiting,
  showAiMark = false,
  onAdd,
  addTo,
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
      images.map((img) => {
        const own = settings.images[imageKey(img)];
        return {
          aspectRatio: img.width / img.height,
          size: own?.size,
          header: own?.heading ? IMAGE_HEADING_HEIGHT[own.heading.level] : undefined,
          section: own?.pageHeading ? PAGE_HEADING_HEIGHT[own.pageHeading.level] : undefined,
        };
      }),
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

  const flowAdd = useMemo(() => {
    if (!onAdd || pagesMode) return null;
    const boxes = layout.rows.flatMap((r) => r.boxes);
    if (boxes.length === 0) return null;
    return addSlotAfter(boxes, size.width - FLOW_PADDING * 2, Infinity);
  }, [onAdd, pagesMode, layout, size.width]);

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

  // Dragging to reorder a series, or onto Favoriter or a series in the sidebar. Pointer events rather than HTML drag and drop, which the app window
  // reserves for files dropped from Finder.
  const [drag, setDrag] = useState<DragState | null>(null);
  const [settling, setSettling] = useState(false);
  const live = useRef({ root, onMove, onDropOnLibrary, pagesMode, pageHeight, images, selected, onSelectionChange });
  live.current = { root, onMove, onDropOnLibrary, pagesMode, pageHeight, images, selected, onSelectionChange };

  /** The dragged image, or every selected image in order when it is one of them. */
  const draggedIndices = (from: number) => {
    const { images, selected } = live.current;
    if (!selected.has(images[from]?.path)) return [from];
    return images.flatMap((img, i) => (selected.has(img.path) ? [i] : []));
  };
  const suppressClick = useRef(false);

  const startReorder = useCallback((from: number, start: React.PointerEvent) => {
    // Shift + drag selects with a rectangle instead.
    if (start.button !== 0 || start.shiftKey) return;
    const tile = (start.currentTarget as HTMLElement).closest<HTMLElement>("[data-index]");
    const thumb = tile?.querySelector("img")?.getAttribute("src") ?? null;
    let state: DragState | null = null;
    let pointer = { x: start.clientX, y: start.clientY };
    let frame = 0;
    let edgeSince = 0;

    let dropRow: HTMLElement | null = null;
    const markDrop = (row: HTMLElement | null) => {
      if (row === dropRow) return;
      dropRow?.removeAttribute("data-drop-active");
      row?.setAttribute("data-drop-active", "");
      dropRow = row;
    };

    const target = (x: number, y: number, prev: DragState | null): Pick<DragState, "to" | "bar" | "drop"> => {
      const under = document.elementsFromPoint(x, y);
      const row = under.map((e) => e.closest<HTMLElement>("[data-drop-target]")).find(Boolean) ?? null;
      markDrop(row);
      if (row) return { to: from, bar: null, drop: row.dataset.dropTarget ?? null };
      // Several selected images go to the sidebar together; only a single one can be moved in place.
      if (!live.current.onMove || (state?.count ?? 1) > 1) return { to: from, bar: null, drop: null };
      const el = under
        .map((e) => e.closest<HTMLElement>("[data-index]"))
        .find((e) => e && live.current.root?.contains(e));
      if (!el) return prev ? { to: prev.to, bar: prev.bar, drop: null } : { to: from, bar: null, drop: null };
      const index = Number(el.dataset.index);
      const rect = el.getBoundingClientRect();
      const before = x < rect.left + rect.width / 2;
      const to = before ? index : index + 1;
      if (to === from || to === from + 1) return { to: from, bar: null, drop: null };
      return { to, drop: null, bar: { left: (before ? rect.left : rect.right) + (before ? -GAP / 2 : GAP / 2), top: rect.top, height: rect.height } };
    };

    const update = () => {
      if (!state) return;
      state = { ...state, ...pointer, ...target(pointer.x, pointer.y, state) };
      setDrag(state);
    };

    // Scrolls while the pointer is held near the top or bottom edge of the gallery.
    const tick = (time: number) => {
      const r = live.current.root;
      if (!state || !r) return;
      const rect = r.getBoundingClientRect();
      const inside = pointer.x >= rect.left && pointer.x <= rect.right;
      const dir = !inside ? 0 : pointer.y < rect.top + EDGE ? -1 : pointer.y > rect.bottom - EDGE ? 1 : 0;
      if (dir === 0) edgeSince = 0;
      else if (live.current.pagesMode) {
        if (!edgeSince) edgeSince = time;
        else if (time - edgeSince > PAGE_TURN_DELAY) {
          const page = Math.round(r.scrollTop / live.current.pageHeight) + dir;
          r.scrollTo({ top: page * live.current.pageHeight, behavior: "smooth" });
          edgeSince = time;
        }
      } else {
        const depth = dir < 0 ? rect.top + EDGE - pointer.y : pointer.y - (rect.bottom - EDGE);
        r.scrollTop += dir * Math.min(24, 4 + depth / 3);
      }
      if (dir !== 0) update();
      frame = requestAnimationFrame(tick);
    };

    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(frame);
      document.body.classList.remove("reordering");
      markDrop(null);
      if (!state) return;
      // The press ended a drag, so the click that follows must not open the viewer.
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const { to, drop } = state;
      state = null;
      setDrag(null);
      if (commit && drop) live.current.onDropOnLibrary(draggedIndices(from), drop);
      else if (commit && to !== from && to !== from + 1) {
        setSettling(true);
        setTimeout(() => setSettling(false), 400);
        live.current.onMove?.(from, to);
        setMarked(to > from ? to - 1 : to);
        setTimeout(() => setMarked(null), 1500);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (!state) {
        if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) < DRAG_THRESHOLD) return;
        state = { from, to: from, ...pointer, thumb, bar: null, drop: null, count: draggedIndices(from).length };
        document.body.classList.add("reordering");
        frame = requestAnimationFrame(tick);
      }
      update();
    };
    const onPointerUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state) {
        e.stopPropagation();
        finish(false);
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  }, []);

  /** Alt + arrow left or right moves the focused image one step. */
  const reorderByKey = useCallback((index: number, step: -1 | 1) => {
    const move = live.current.onMove;
    if (!move) return;
    move(index, step < 0 ? index - 1 : index + 2);
  }, []);

  // Selecting: ⌘-click adds or removes one image, Shift-click a run of images from the last one
  // clicked, and dragging over the empty space between images selects the ones the rectangle touches.
  const lastClicked = useRef<number | null>(null);
  const clickTile = (index: number, e: React.MouseEvent) => {
    const path = images[index].path;
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      onSelectionChange(next);
      lastClicked.current = index;
    } else if (e.shiftKey) {
      const from = lastClicked.current ?? index;
      const [a, b] = from < index ? [from, index] : [index, from];
      onSelectionChange(new Set([...selected, ...images.slice(a, b + 1).map((img) => img.path)]));
      lastClicked.current = index;
    } else {
      onOpen(index);
    }
  };

  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const startMarquee = (start: React.PointerEvent<HTMLDivElement>) => {
    const r = root;
    if (start.button !== 0 || !r) return;
    // From the empty space between images, or from an image while holding Shift (a plain drag on
    // an image moves it instead). Headings and buttons keep their own behavior.
    const target = start.target as HTMLElement;
    const onTile = !!target.closest("[data-index]");
    if (onTile ? !start.shiftKey : target.closest("[data-index], button, a, input, [role=button]")) return;
    const keep = start.metaKey || start.ctrlKey || start.shiftKey ? new Set(selected) : new Set<string>();
    const origin = { x: start.clientX, y: start.clientY + r.scrollTop };
    let pointer = { x: start.clientX, y: start.clientY };
    let active = false;
    let frame = 0;

    const update = () => {
      const top = Math.min(origin.y - r.scrollTop, pointer.y);
      const bottom = Math.max(origin.y - r.scrollTop, pointer.y);
      const rect = {
        left: Math.min(origin.x, pointer.x),
        top,
        width: Math.abs(pointer.x - origin.x),
        height: bottom - top,
      };
      setMarquee(rect);
      const next = new Set(keep);
      for (const el of r.querySelectorAll<HTMLElement>("[data-index]")) {
        const b = el.getBoundingClientRect();
        const hit = b.right > rect.left && b.left < rect.left + rect.width && b.bottom > rect.top && b.top < bottom;
        const img = live.current.images[Number(el.dataset.index)];
        if (hit && img) next.add(img.path);
      }
      live.current.onSelectionChange(next);
    };
    // Scrolls while the pointer is held near the top or bottom edge, so a selection can span rows out of view.
    const tick = () => {
      const rect = r.getBoundingClientRect();
      const dir = pointer.y < rect.top + EDGE ? -1 : pointer.y > rect.bottom - EDGE ? 1 : 0;
      if (dir !== 0 && !live.current.pagesMode) {
        r.scrollTop += dir * 12;
        update();
      }
      frame = requestAnimationFrame(tick);
    };
    const onPointerMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (!active) {
        if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) < DRAG_THRESHOLD) return;
        active = true;
        document.body.classList.add("selecting");
        frame = requestAnimationFrame(tick);
      }
      update();
    };
    const finish = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      cancelAnimationFrame(frame);
      document.body.classList.remove("selecting");
      setMarquee(null);
      if (active) {
        // The press ended a selection, so the click that follows must not open or select an image.
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
      }
      // A plain click on the empty space clears the selection, as in Finder.
      if (!active && keep.size === 0 && live.current.selected.size > 0) live.current.onSelectionChange(new Set());
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const renderTile = (box: LayoutBox, offsetX: number, offsetY: number) => {
    const image = images[box.index];
    const key = imageKey(image);
    const imageSettings = settings.images[key] ?? {};
    return (
      <ImageTile
        key={image.path}
        image={image}
        box={{ ...box, x: box.x + offsetX, y: box.y + offsetY }}
        reveal={resolveReveal(imageSettings.reveal ?? settings.reveal, placement.row[box.index], box.index)}
        order={placement.order[box.index]}
        marked={marked === box.index}
        aiMark={showAiMark ? image.ai : undefined}
        waitingSince={waiting?.path === image.path ? waiting.since : undefined}
        selected={selected.has(image.path)}
        favorite={favorites.has(image.path)}
        tags={tags.get(image.path)}
        frame={settings.frame}
        shadow={settings.shadow}
        series={series}
        root={root}
        settingsKey={key}
        settings={imageSettings}
        onOpen={clickTile}
        onTrash={onTrash}
        onRemove={onRemove}
        onChange={onChangeImage}
        onToggleFavorite={onToggleFavorite}
        onToggleSeries={onToggleSeries}
        onEditHeading={onEditHeading}
        reorderable={!!onMove}
        dragging={drag?.from === box.index}
        onDragStart={startReorder}
        onReorderKey={reorderByKey}
      />
    );
  };

  const pageAdd =
    onAdd && pagesMode && pages.length > 0 && pages[pages.length - 1].boxes.length > 0
      ? addSlotAfter(pages[pages.length - 1].boxes, pageContent.width, pageContent.height)
      : null;
  const renderAdd = (slot: AddSlot, x: number, y: number) => (
    <button
      key="add"
      type="button"
      onClick={onAdd}
      title={addTo ? `Lägg till bilder i ${addTo}` : "Lägg till bilder"}
      aria-label={addTo ? `Lägg till bilder i ${addTo}` : "Lägg till bilder"}
      className="group absolute flex items-center justify-center rounded-lg border-2 border-dashed border-transparent text-current/70 transition-colors hover:border-current/25 hover:bg-current/5 focus-visible:border-current/40 focus-visible:outline-none"
      style={{ left: x + slot.x, top: y + slot.y, width: slot.width, height: slot.height }}
    >
      <span className="flex flex-col items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="flex size-11 items-center justify-center rounded-full bg-current/10">
          <Plus className="size-5" />
        </span>
        <span className="text-xs">Lägg till bilder</span>
      </span>
    </button>
  );

  const renderSection = (section: { index: number; y: number; height: number }, x: number, y: number, width: number) => {
    const heading = settings.images[imageKey(images[section.index])]?.pageHeading;
    if (!heading) return null;
    return (
      <div key={`section-${section.index}`} className="absolute flex items-end" style={{ left: x, top: y + section.y, width, height: section.height }}>
        <HeadingText
          heading={heading}
          height={section.height * 0.8}
          scale={0.62}
          onEdit={() => onEditHeading(section.index, "page")}
        />
      </div>
    );
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={setRoot}
        className={cn("absolute inset-0 overflow-y-auto bg-canvas", settling && "settling")}
        style={pagesMode ? { scrollSnapType: "y mandatory" } : undefined}
        onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
        onPointerDown={startMarquee}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
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
                  {page.section && renderSection(page.section, PAGE_PADDING_X, PAGE_PADDING_Y, pageContent.width)}
                  {page.boxes.map((box) => renderTile(box, PAGE_PADDING_X, PAGE_PADDING_Y))}
                  {pageAdd && i === pages.length - 1 && renderAdd(pageAdd, PAGE_PADDING_X, PAGE_PADDING_Y)}
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
          <div
            className="relative"
            style={{ height: layout.height + FLOW_PADDING * 2 + (flowAdd?.below ? flowAdd.height + GAP : 0) }}
          >
            {layout.rows
              .filter(
                (row) =>
                  row.y + row.height + FLOW_PADDING >= scrollTop - OVERSCAN &&
                  row.y <= scrollTop + size.height + OVERSCAN,
              )
              .flatMap((row) => [
                ...(row.section ? [renderSection(row.section, FLOW_PADDING, FLOW_PADDING, size.width - FLOW_PADDING * 2)] : []),
                ...row.boxes.map((box) => renderTile(box, FLOW_PADDING, FLOW_PADDING)),
              ])}
            {flowAdd && renderAdd(flowAdd, FLOW_PADDING, FLOW_PADDING)}
          </div>
        )}
      </div>
      {drag?.bar && (
        <div
          className="pointer-events-none fixed z-40 w-1 -translate-x-1/2 rounded-full bg-primary shadow"
          style={{ left: drag.bar.left, top: drag.bar.top, height: drag.bar.height }}
          aria-hidden
        />
      )}
      {drag?.thumb && (
        <div className="pointer-events-none fixed z-50 translate-x-3 translate-y-3" style={{ left: drag.x, top: drag.y }} aria-hidden>
          {drag.count > 1 && (
            <div className="absolute top-1 left-1 h-full w-28 rotate-6 rounded-sm bg-muted shadow-lg ring-1 ring-black/10" />
          )}
          <img
            src={drag.thumb}
            alt=""
            className="relative w-28 rotate-2 rounded-sm opacity-90 shadow-xl ring-1 ring-black/10"
          />
          {drag.count > 1 && (
            <span className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground shadow">
              {drag.count}
            </span>
          )}
        </div>
      )}
      {marquee && (
        <div
          className="pointer-events-none fixed z-40 rounded-sm border border-primary bg-primary/15"
          style={marquee}
          aria-hidden
        />
      )}
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
