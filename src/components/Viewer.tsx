import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FolderMinus, Heart, Info, PanelLeft, Pin, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { originalUrl, useWindowFullscreen, type ImageEntry } from "@/lib/api";
import { INSET_SHADOW, frameStyle } from "@/lib/frame";
import type { Frame, Heading, Shadow } from "@/lib/settings";
import {
  captionLineHeight,
  DEFAULT_VIEWER_SETTINGS,
  hasRoomToPin,
  pinLayout,
  nextScreenFit,
  resolveTransition,
  useViewerSettings,
  type CaptionPlace,
  type CaptionSize,
  type Rect,
  type ViewerSettings,
  type ViewerTransition,
  type ViewerEffect,
} from "@/lib/viewer";
import type { Tag } from "@/lib/filter";
import type { Series } from "@/lib/library";
import { SeriesPicker } from "./SeriesPicker";
import { CollectionsPanel, FAVORITES_TARGET } from "./CollectionsPanel";
import { ViewerLookMenu } from "./ViewerLookMenu";
import { SavePinnedMenu, type SavePinnedChoice } from "./SavePinnedMenu";
import { HeadingText } from "./HeadingText";
import { GRID_THUMB_SIZE, VIEWER_THUMB_SIZE, requestThumbnail, viewerSize } from "@/lib/thumbnails";
import { cn, formatBytes } from "@/lib/utils";

interface ViewerProps {
  images: ImageEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onTrash: (index: number) => void;
  /** Shown in a series: takes the image out of it; the file stays. */
  onRemove?: (index: number) => void;
  isFavorite: (image: ImageEntry) => boolean;
  /** Favoriter and the series the image is in. */
  tagsOf: (image: ImageEntry) => Tag[];
  onToggleFavorite: (index: number) => void;
  /** The series listed in the sidebar, which the image can be added to. */
  series: Series[];
  onToggleSeries: (id: string, index: number) => void;
  onCreateSeries: (name: string, index: number) => void;
  newSeriesName: string;
  onShowShortcuts: () => void;
  /** The folder's frame and shadow, drawn when the viewer is set to show them. */
  frame: Frame;
  shadow: Shadow;
  /** Images kept in the top left corner while stepping on. */
  pinned: ImageEntry[];
  onPinnedChange: (pinned: ImageEntry[]) => void;
  /** Saves the pinned images, in order, as a new series, with the look when chosen. */
  onSavePinned: (name: string, look: ViewerSettings | undefined, appearance: boolean) => void;
  defaultPinnedName: string;
  /** A series' saved look, used instead of the usual one while this viewer is open. */
  savedLook?: ViewerSettings;
  /** The heading written for an image, if any. */
  headingOf: (image: ImageEntry) => Heading | undefined;
  /** Keyboard shortcuts pause while another dialog (the trash confirmation) is open. */
  paused: boolean;
}

interface Layer {
  id: number;
  path: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  /** How this image comes in, and how the one under it goes. */
  effect: ViewerEffect;
  /** 1 when stepping forward, -1 back. */
  dir: 1 | -1;
}

/** Resolves once the browser has decoded the image, so swapping it in never shows a blank frame. */
function decoded(src: string) {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => {});
}

/** Length of each effect; the covered image is dropped once the longest has finished. */
const DURATION: Record<ViewerEffect, number> = {
  none: 0,
  fade: 350,
  "slide-left": 700,
  "slide-right": 700,
  rise: 700,
  cascade: 800,
  parallax: 750,
};
const LONGEST = 800;

/** Size of a pinned preview, and the gap between them. */
const PIN_W = 120;
const PIN_H = 90;
const PIN_GAP = 8;
/** Pinned previews fill at most this many columns. */
const PIN_COLUMNS = 2;
/** Space between larger pinned pictures and the current one. */
const PIN_ROW_GAP = 12;

/** Pinned pictures and the current one glide to their new places as the layout changes. */
const SLOT_TRANSITION = "left 300ms ease-out, top 300ms ease-out, width 300ms ease-out, height 300ms ease-out";

/** Corner radii for "Rundade hörn": the frame's outer edge, and the picture inside it. */
function corners(rounded: boolean, framing: React.CSSProperties, width: number, height: number) {
  if (!rounded) return { outer: undefined, inner: undefined };
  const outer = Math.round(Math.max(8, Math.min(28, Math.min(width, height) * 0.03)));
  const pad = typeof framing.padding === "number" ? framing.padding : 0;
  return { outer, inner: pad ? Math.max(3, outer - pad) : outer };
}

const DROP_SHADOW = "0 24px 48px -12px rgb(0 0 0 / 0.55), 0 4px 12px rgb(0 0 0 / 0.25)";

interface Zoom {
  /** 1 shows the whole picture. */
  scale: number;
  /** Offset of the picture's center from the stage's, in screen pixels. */
  x: number;
  y: number;
}
const WHOLE: Zoom = { scale: 1, x: 0, y: 0 };
/** Clicks from the whole picture to the closest zoom. */
const ZOOM_STEPS = 3;

/** Where an image starts before it comes in. */
function enterStyle(effect: ViewerEffect, dir: 1 | -1): React.CSSProperties {
  switch (effect) {
    case "none":
      return {};
    case "slide-left":
      return { opacity: 0, transform: "translateX(-120px)" };
    case "slide-right":
      return { opacity: 0, transform: "translateX(120px)" };
    case "rise":
      return { opacity: 0, transform: "translateY(80px)" };
    case "cascade":
      return { opacity: 0, transform: "translateY(-48px) scale(0.94)" };
    case "parallax":
      // The new image passes over the old one, which drifts away more slowly, as if further back.
      return { opacity: 0.4, transform: `translateX(${dir * 60}vw)` };
    default:
      return { opacity: 0 };
  }
}

/** Where a covered image goes as the next one comes in with `effect`. */
function exitStyle(effect: ViewerEffect, dir: 1 | -1): React.CSSProperties {
  if (effect === "parallax") return { opacity: 0, transform: `translateX(${-dir * 18}vw)` };
  return { opacity: 0 };
}

function transitionFor(effect: ViewerEffect) {
  const ms = DURATION[effect];
  if (!ms) return "none";
  return `opacity ${ms}ms ease-out, transform ${ms}ms cubic-bezier(0.16, 1, 0.3, 1)`;
}

/** Padding a frame adds on each side of a picture this size. */
function framePad(frame: Frame, width: number, height: number) {
  const style = frameStyle(frame, width, height);
  return (typeof style.padding === "number" ? style.padding : 0) + (style.border ? 1 : 0);
}

/**
 * The largest box with the picture's shape that fits with its frame, never larger than the picture.
 * "grow" lets it grow past its own size to fill the room; "cover" fills the room, cut at the edges.
 */
function fit(
  room: { width: number; height: number },
  width: number,
  height: number,
  frame: Frame,
  mode: "fit" | "grow" | "cover" = "fit",
) {
  if (mode === "cover") {
    const scale = Math.max(room.width / width, room.height / height);
    const picture = { width: Math.round(width * scale), height: Math.round(height * scale) };
    return { picture, ...picture };
  }
  const most = mode === "grow" ? Infinity : 1;
  const first = Math.min(room.width / width, room.height / height, most);
  const room0 = framePad(frame, width * first, height * first);
  const scale = Math.max(0, Math.min((room.width - 2 * room0) / width, (room.height - 2 * room0) / height, most));
  const picture = {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
  const pad = framePad(frame, picture.width, picture.height);
  return {
    picture,
    width: picture.width + 2 * pad,
    height: picture.height + 2 * pad,
  };
}

export function Viewer({
  images,
  index,
  onIndexChange,
  onClose,
  onTrash,
  onRemove,
  isFavorite,
  tagsOf,
  onToggleFavorite,
  series,
  onToggleSeries,
  onCreateSeries,
  newSeriesName,
  onShowShortcuts,
  frame: folderFrame,
  shadow: folderShadow,
  pinned,
  onPinnedChange,
  onSavePinned,
  defaultPinnedName,
  savedLook,
  headingOf,
  paused,
}: ViewerProps) {
  const { settings: usual, update: updateUsual } = useViewerSettings();
  // A saved look can be changed here for the moment, without changing the series or the usual look.
  // Looks saved before an option existed get its default.
  const [own, setOwn] = useState(savedLook && { ...DEFAULT_VIEWER_SETTINGS, ...savedLook });
  const look = own ?? usual;
  const updateLook = (change: Partial<ViewerSettings>) => (own ? setOwn({ ...own, ...change }) : updateUsual(change));
  // On the whole screen the header shows while the mouse moves, and fades when it rests.
  const [chrome, setChrome] = useState(true);
  const resting = useRef(0);
  const wake = () => {
    setChrome(true);
    window.clearTimeout(resting.current);
    resting.current = window.setTimeout(() => setChrome(false), 2500);
  };
  useEffect(() => {
    wake();
    return () => window.clearTimeout(resting.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look.screen]);
  const frame = look.frame ? folderFrame : "none";
  const shadow = look.frame ? folderShadow : "none";
  // Read when the image changes, so changing the setting doesn't replay the current one.
  const transition = useRef(look.transition);
  transition.current = look.transition;
  const step = useRef(0);
  const lastIndex = useRef(index);
  const [picking, setPicking] = useState(false);
  const image = images[index];
  // The image on top fades in over the previous one, which is removed once covered.
  const [layers, setLayers] = useState<Layer[]>([]);
  const nextId = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  // Take focus from the grid tile that opened the viewer, so its key handlers don't fire underneath.
  // On close the gallery moves focus to the image last viewed.
  useEffect(() => {
    root.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sharp = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const chosen = resolveTransition(transition.current, step.current++);
    const effect: ViewerEffect = reduced && chosen !== "none" ? "fade" : chosen;
    const dir: 1 | -1 = index < lastIndex.current ? -1 : 1;
    lastIndex.current = index;
    const show = (src: string, isSharp: boolean) =>
      void decoded(src).then(() => {
        // Ignore a late grid thumbnail once the sharp version is up, and anything after moving on.
        if (cancelled || (sharp && !isSharp)) return;
        sharp ||= isSharp;
        setLayers((prev) => {
          const top = prev[prev.length - 1];
          if (top?.path === image.path) return [...prev.slice(0, -1), { ...top, src }];
          const layer: Layer = {
            id: nextId.current++,
            path: image.path,
            src,
            alt: image.name,
            width: image.width,
            height: image.height,
            effect,
            dir,
          };
          return [...prev.slice(-1), layer];
        });
      });
    // Show the grid thumbnail quickly, then swap in the sharp version.
    const cancelPreview = requestThumbnail(image, GRID_THUMB_SIZE, (src) => show(src, false));
    const cancelFull = requestThumbnail(image, viewerSize(image), (src) => show(src, true));
    return () => {
      cancelled = true;
      cancelPreview();
      cancelFull();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // Drop the covered image once the transition has finished.
  useEffect(() => {
    if (layers.length < 2) return;
    const timer = setTimeout(() => setLayers((prev) => prev.slice(-1)), LONGEST + 50);
    return () => clearTimeout(timer);
  }, [layers.length]);

  // Prepare the neighbours so stepping to them is instant.
  useEffect(() => {
    const cancels = [images[index - 1], images[index + 1]]
      .filter(Boolean)
      .map((img) => requestThumbnail(img, viewerSize(img), (src) => void decoded(src)));
    return () => cancels.forEach((c) => c());
  }, [images, index]);

  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  // The whole area below the header, which a zoomed picture fills.
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!area) return;
    const measure = () => setAreaSize({ width: area.clientWidth, height: area.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [area]);
  useEffect(() => {
    if (!content) return;
    const measure = () => setSpace({ width: content.clientWidth, height: content.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [content]);
  // Larger pinned pictures share the space with the current one, which is shown once, on the right.
  const pinSize = look.pinSize;
  const beside = pinSize === "small" ? [] : pinned.filter((p) => p.path !== image.path);
  const layout = pinSize === "small" ? null : pinLayout(pinSize, beside, image, space, PIN_ROW_GAP);
  // One image at a time can take the whole screen: the header steps aside and the margins go.
  const wide = !layout && look.screen !== "margins";
  const fitMode = !wide ? "fit" : look.screen === "fill" ? "cover" : "grow";
  // A frame cut off at the screen's edges would look broken, so a filling picture goes without.
  const pictureFrame = fitMode === "cover" ? "none" : frame;
  useWindowFullscreen(wide);
  const room = layout ? { width: layout.current.width, height: layout.current.height } : space;
  // The largest box with the picture's shape that fits, never larger than the picture itself.
  // A heading above the picture takes a line from its room.
  const captionOf = (img: ImageEntry) => (look.captionPlace === "off" ? undefined : headingOf(img));
  const heading = captionOf(image);
  const captionHeight = heading ? captionLineHeight(heading.level, look.captionSize, room.height) : 0;
  const lift = heading && look.captionPlace === "above" ? captionHeight : 0;
  const pictureRoom = { width: room.width, height: Math.max(0, room.height - lift) };
  const box = fit(pictureRoom, image.width, image.height, pictureFrame, fitMode);
  // Beside pinned pictures the stage hugs the picture, so zooming stays in its place.
  const view = layout ? { width: box.width, height: box.height + lift } : room;
  // The part of the picture on screen, where the heart and heading go when it's cut at the edges.
  const shown = { width: Math.min(box.width, pictureRoom.width), height: Math.min(box.height, pictureRoom.height) };
  const top = layers[layers.length - 1];

  // Zoom: each click magnifies where it points, three clicks reach the closest view.
  const [zoom, setZoom] = useState<Zoom>(WHOLE);
  const [panning, setPanning] = useState(false);
  // With "Behåll zoom" each image comes back as it was left while the viewer is open.
  const kept = useRef(new Map<string, Zoom>());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setZoom((look.keepZoom && kept.current.get(image.path)) || WHOLE), [image]);
  // Zoomed, the picture is seen through the whole area, not just its own place.
  const zoomView = areaSize.width > 0 ? areaSize : view;
  // Where the pinned pictures' box sits in that area, to reach its corner from inside it.
  const areaOffset = layout
    ? { x: (content?.offsetLeft ?? 0) + (space.width - layout.width) / 2, y: (space.height - layout.height) / 2 }
    : { x: 0, y: 0 };
  // Beside pinned pictures the first step fills the area with the picture, then it zooms on from there.
  const fullScale = layout ? Math.max(1, Math.min(zoomView.width / box.width, zoomView.height / box.height)) : 1;
  // At least 3× that, more for a picture with pixels to spare, so the last step shows them one to one.
  const maxScale = Math.min(12 * fullScale, Math.max(3 * fullScale, image.width / Math.max(1, box.picture.width)));
  const levels = [
    ...(fullScale > 1.05 ? [1] : []),
    ...Array.from({ length: ZOOM_STEPS + 1 }, (_, k) => fullScale * (maxScale / fullScale) ** (k / ZOOM_STEPS)),
  ];
  const zoomed = zoom.scale > 1.001;
  const atMax = zoom.scale >= maxScale - 0.001;
  useEffect(() => {
    if (zoomed) kept.current.set(image.path, zoom);
    else kept.current.delete(image.path);
    // Only a change of zoom; a new image restores its own first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  /** Keeps the picture covering the stage, so it can't be dragged off screen. */
  const clamp = useCallback(
    (z: Zoom): Zoom => {
      const limitX = Math.max(0, (box.width * z.scale - zoomView.width) / 2);
      const limitY = Math.max(0, (box.height * z.scale - zoomView.height) / 2);
      return {
        scale: z.scale,
        x: Math.max(-limitX, Math.min(limitX, z.x)),
        y: Math.max(-limitY, Math.min(limitY, z.y)),
      };
    },
    [box.width, box.height, zoomView.width, zoomView.height],
  );

  /** Zooms to `scale`, keeping the point `px, py` (from the stage's center) where it is. */
  const zoomTo = useCallback(
    (scale: number, px = 0, py = 0) =>
      setZoom((z) => {
        if (scale <= 1.001) return WHOLE;
        const qx = (px - z.x) / z.scale;
        const qy = (py - z.y) / z.scale;
        return clamp({ scale, x: px - qx * scale, y: py - qy * scale });
      }),
    [clamp],
  );
  const stepZoom = useCallback(
    (dir: 1 | -1, px = 0, py = 0) => {
      // From its place among pinned pictures, the picture first grows to fill the area, centered.
      if (dir > 0 && !zoomed && fullScale > 1.05) return zoomTo(fullScale);
      const next =
        dir > 0
          ? (levels.find((l) => l > zoom.scale + 0.001) ?? maxScale)
          : ([...levels].reverse().find((l) => l < zoom.scale - 0.001) ?? 1);
      zoomTo(next, px, py);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoom.scale, zoomed, fullScale, maxScale, zoomTo],
  );

  // The file itself once zoomed in, as the largest thumbnail runs out of detail.
  const [original, setOriginal] = useState<{
    path: string;
    src: string;
  } | null>(null);
  useEffect(() => {
    if (!zoomed || original?.path === image.path) return;
    let cancelled = false;
    let cancelConverted = () => {};
    const use = (src: string) =>
      void decoded(src).then(() => {
        if (!cancelled) setOriginal({ path: image.path, src });
      });
    const src = originalUrl(image);
    const img = new Image();
    img.src = src;
    img
      .decode()
      .then(() => !cancelled && setOriginal({ path: image.path, src }))
      // A format the browser can't draw (RAW, some HEIC) is converted at full size instead.
      .catch(() => {
        if (!cancelled) cancelConverted = requestThumbnail(image, Math.max(image.width, image.height), use);
      });
    return () => {
      cancelled = true;
      cancelConverted();
    };
  }, [zoomed, image, original?.path]);

  // A press either drags the zoomed picture around or, without moving, is a zoom click.
  const press = useRef<{
    x: number;
    y: number;
    from: Zoom;
    moved: boolean;
  } | null>(null);
  // Dragging the whole picture carries it to Favoriter or a series beside it; zoomed, a drag pans instead.
  const [carry, setCarry] = useState<{ x: number; y: number; over: string | null } | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(null), 1200);
    return () => window.clearTimeout(t);
  }, [added]);
  const inSeries = (id: string) => !!series.find((s) => s.id === id)?.images.some((img) => img.path === image.path);
  const dropIn = (target: string) => {
    if (target === FAVORITES_TARGET) {
      if (!favorite) onToggleFavorite(index);
    } else if (!inSeries(target)) onToggleSeries(target, index);
    setAdded(target);
  };
  const onStageDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, [role=menu]")) return;
    press.current = { x: e.clientX, y: e.clientY, from: zoom, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onStageMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!zoomed) {
      if (!p.moved && Math.hypot(dx, dy) < 6) return;
      p.moved = true;
      if (!look.collections) updateLook({ collections: true });
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-collection]");
      setCarry({ x: e.clientX, y: e.clientY, over: target?.dataset.collection ?? null });
      return;
    }
    if (!p.moved && Math.hypot(dx, dy) < 4) return;
    p.moved = true;
    setPanning(true);
    setZoom(clamp({ ...p.from, x: p.from.x + dx, y: p.from.y + dy }));
  };
  const onStageUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    setPanning(false);
    if (carry) {
      if (carry.over) dropIn(carry.over);
      setCarry(null);
      return;
    }
    if (!p || p.moved || !stage) return;
    const rect = stage.getBoundingClientRect();
    const px = e.clientX - rect.left - rect.width / 2;
    const py = e.clientY - rect.top - rect.height / 2;
    if (e.altKey) stepZoom(-1, px, py);
    else if (atMax) zoomTo(1);
    else stepZoom(1, px, py);
  };

  // Scrolling or swiping moves around a zoomed picture.
  useEffect(() => {
    if (!stage || !zoomed) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp({ ...z, x: z.x - e.deltaX, y: z.y - e.deltaY }));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [stage, zoomed, clamp]);

  // Small pinned previews fill a column down the left, then a second one beside it.
  const pinRows = Math.max(1, Math.floor((space.height + PIN_GAP) / (PIN_H + PIN_GAP)));
  const pinColumns = Math.min(PIN_COLUMNS, Math.ceil(pinned.length / pinRows));
  const pinsWidth = pinSize === "small" && pinColumns ? 16 + pinColumns * (PIN_W + PIN_GAP) : 0;
  const isPinned = pinned.some((p) => p.path === image.path);
  // Larger ones stop when the next picture, assumed shaped like this one, would get too small.
  const pinsFull =
    !isPinned &&
    (pinSize === "small"
      ? pinned.length >= pinRows * PIN_COLUMNS
      : !hasRoomToPin(pinSize, [...pinned, image], image, space, PIN_ROW_GAP));
  const togglePin = useCallback(() => {
    if (pinned.some((p) => p.path === image.path)) onPinnedChange(pinned.filter((p) => p.path !== image.path));
    else if (!pinsFull) onPinnedChange([...pinned, image]);
  }, [pinned, image, pinsFull, onPinnedChange]);
  const openPinned = (p: ImageEntry) => {
    // The click that ends a drag doesn't open the image.
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    const i = images.findIndex((img) => img.path === p.path);
    if (i >= 0) onIndexChange(i);
  };

  // A pinned image dragged onto another takes its place; the others make room as it passes.
  const [dragging, setDragging] = useState<string | null>(null);
  const dragged = useRef(false);
  const latestPinned = useRef(pinned);
  latestPinned.current = pinned;
  const startPinDrag = (path: string, e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-unpin]")) return;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    let lastOver: string | null = null;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      moved = true;
      setDragging(path);
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-pin]")?.getAttribute("data-pin");
      if (!over || over === lastOver) return;
      lastOver = over;
      if (over === path) return;
      const list = latestPinned.current;
      const from = list.findIndex((p) => p.path === path);
      const to = list.findIndex((p) => p.path === over);
      if (from < 0 || to < 0) return;
      const next = [...list];
      next.splice(to, 0, ...next.splice(from, 1));
      onPinnedChange(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dragged.current = moved;
      // Forget it once the click that may follow has passed, so a drag ending elsewhere doesn't swallow the next click.
      setTimeout(() => (dragged.current = false), 0);
      setDragging(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const unpin = (p: ImageEntry) => onPinnedChange(pinned.filter((q) => q.path !== p.path));

  const favorite = isFavorite(image);
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      // Typing a series name must not trash or step.
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const digit = Number(e.key);
      if (e.key === "Escape") {
        if (zoomed) setZoom(WHOLE);
        else onClose();
      } else if (e.key === "+" || e.key === "=") stepZoom(1);
      else if (e.key === "-") stepZoom(-1);
      else if (e.key === "0") setZoom(WHOLE);
      else if (e.key === "p") togglePin();
      else if (e.key === "h") updateLook({ screen: nextScreenFit(look.screen) });
      else if (e.key === "c") updateLook({ collections: !look.collections });
      else if (Number.isInteger(digit) && digit >= 1 && digit <= series.length)
        onToggleSeries(series[digit - 1].id, index);
      else if (e.key === "s") setPicking((p) => !p);
      else if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
      else if (e.key === "Delete" || e.key === "Backspace") onTrash(index);
      else if (e.key === "f") onToggleFavorite(index);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    paused,
    index,
    hasPrev,
    hasNext,
    onClose,
    onIndexChange,
    onTrash,
    onToggleFavorite,
    series,
    onToggleSeries,
    zoomed,
    stepZoom,
    togglePin,
    look.screen,
    look.collections,
    updateLook,
  ]);

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden outline-none"
      // The page's colors when chosen; otherwise black, with light text and a light frame line.
      style={
        look.background
          ? { background: "var(--canvas)", color: "var(--foreground)" }
          : ({
              background: "#000",
              color: "#fafafa",
              "--foreground": "#fafafa",
            } as React.CSSProperties)
      }
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      onPointerMove={wide ? wake : undefined}
    >
      {/* Trash and close sit at opposite ends so one isn't clicked by mistake for the other. */}
      <div
        className={cn(
          "flex h-12 shrink-0 items-center gap-3 px-3",
          wide && "absolute inset-x-0 top-0 z-30 transition-opacity duration-300",
          wide && !chrome && "opacity-0 focus-within:opacity-100 hover:opacity-100",
        )}
        style={
          wide
            ? {
                background: look.background
                  ? "color-mix(in oklab, var(--canvas) 85%, transparent)"
                  : "linear-gradient(rgb(0 0 0 / 0.6), transparent)",
              }
            : undefined
        }
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-current/80 hover:bg-destructive hover:text-white"
          onClick={() => onTrash(index)}
          title="Flytta till papperskorgen (⌫)"
          aria-label="Flytta till papperskorgen"
        >
          <Trash2 />
        </Button>
        {onRemove && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-2 text-current/80 hover:bg-current/15 hover:text-current"
            onClick={() => onRemove(index)}
            title="Ta bort ur serien (filen finns kvar)"
            aria-label="Ta bort ur serien"
          >
            <FolderMinus />
          </Button>
        )}
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-medium">{image.name}</div>
          <div className="text-xs text-current/60">
            {index + 1} av {images.length} · {image.width} × {image.height} · {formatBytes(image.size)}
            {tagsOf(image).map((t) => (
              <span key={t.key} className="ml-1.5 rounded-sm bg-current/15 px-1.5 py-px">
                {t.name}
              </span>
            ))}
          </div>
        </div>
        {pinned.length > 0 && (
          <SavePinnedMenu
            count={pinned.length}
            defaultName={defaultPinnedName}
            onSave={({ name, look: keepLook, appearance }: SavePinnedChoice) =>
              onSavePinned(name, keepLook ? look : undefined, appearance)
            }
          />
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={look.collections}
          className={cn(
            "text-current/80 hover:bg-current/15 hover:text-current",
            look.collections && "bg-current/15 text-current",
          )}
          onClick={() => updateLook({ collections: !look.collections })}
          title={look.collections ? "Dölj samlingarna (C)" : "Visa Favoriter och serierna, att dra bilden till (C)"}
          aria-label="Samlingar"
        >
          <PanelLeft />
        </Button>
        <ViewerLookMenu settings={look} onChange={updateLook} />
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-current/80 hover:bg-current/15 hover:text-current"
          onClick={onShowShortcuts}
          title="Kortkommandon (?)"
          aria-label="Kortkommandon"
        >
          <Info />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-current hover:bg-current/15 hover:text-current"
          onClick={onClose}
          title="Stäng (Esc)"
          aria-label="Stäng"
        >
          <X />
        </Button>
      </div>
      <div className={cn("flex min-h-0 flex-1", wide && look.collections && "pt-12")}>
        {look.collections && (
          <CollectionsPanel
            series={series}
            favorite={favorite}
            inSeries={inSeries}
            onToggleFavorite={() => onToggleFavorite(index)}
            onToggleSeries={(id) => onToggleSeries(id, index)}
            over={carry?.over ?? null}
            added={added}
          />
        )}
        <div
          ref={setArea}
          className={cn("relative flex min-w-0 flex-1 items-center justify-center", !wide && "px-14 pb-6")}
          style={{ paddingLeft: pinsWidth && !wide ? pinsWidth + 48 : undefined }}
        >
          {pinSize === "small" && pinned.length > 0 && (
            <div
              className="absolute top-0 left-4 flex flex-col flex-wrap content-start"
              style={{
                gap: PIN_GAP,
                height: pinRows * (PIN_H + PIN_GAP) - PIN_GAP,
              }}
              aria-label="Fästa bilder"
            >
              {pinned.map((p) => (
                <PinnedPreview
                  key={p.path}
                  image={p}
                  current={p.path === image.path}
                  dragging={dragging === p.path}
                  onDragStart={(e) => startPinDrag(p.path, e)}
                  onOpen={() => openPinned(p)}
                  onUnpin={() => unpin(p)}
                />
              ))}
            </div>
          )}
          <div ref={setContent} className="flex size-full min-w-0 items-center justify-center">
            <div
              className={layout ? "relative shrink-0" : "contents"}
              style={layout ? { width: layout.width, height: layout.height } : undefined}
              aria-label={layout ? "Fästa bilder och bilden som visas" : undefined}
            >
              {layout?.pins.map((rect, i) => (
                <PinnedPicture
                  key={beside[i].path}
                  image={beside[i]}
                  rect={rect}
                  frame={frame}
                  shadow={shadow}
                  rounded={look.rounded}
                  heading={captionOf(beside[i])}
                  place={look.captionPlace}
                  size={look.captionSize}
                  dragging={dragging === beside[i].path}
                  onDragStart={(e) => startPinDrag(beside[i].path, e)}
                  onOpen={() => openPinned(beside[i])}
                  onUnpin={() => unpin(beside[i])}
                />
              ))}
              <div
                ref={setStage}
                className={cn(
                  "flex touch-none items-center justify-center overflow-hidden",
                  layout || zoomed ? "absolute" : "relative size-full",
                  zoomed && "z-10",
                )}
                style={{
                  ...(layout && {
                    left: layout.current.x + (layout.current.width - box.width) / 2,
                    top: layout.current.y + (layout.current.height - box.height - lift) / 2,
                    ...view,
                    transition: SLOT_TRANSITION,
                  }),
                  // Zoomed, it covers the whole area below the header, pinned pictures included.
                  ...(zoomed && {
                    left: layout ? -areaOffset.x : 0,
                    top: layout ? -areaOffset.y : 0,
                    ...zoomView,
                    background: look.background ? "var(--canvas)" : "#000",
                  }),
                  cursor: panning || carry ? "grabbing" : atMax ? "zoom-out" : "zoom-in",
                }}
                onPointerDown={onStageDown}
                onPointerMove={onStageMove}
                onPointerUp={onStageUp}
                onPointerCancel={() => {
                  press.current = null;
                  setPanning(false);
                  setCarry(null);
                }}
              >
                {layers.map((layer, i) => (
                  <LayerView
                    key={layer.id}
                    layer={
                      original?.path === layer.path && i === layers.length - 1 ? { ...layer, src: original.src } : layer
                    }
                    box={fit(pictureRoom, layer.width, layer.height, pictureFrame, fitMode)}
                    lift={lift}
                    frame={pictureFrame}
                    shadow={shadow}
                    rounded={look.rounded}
                    animate={i > 0}
                    exit={i < layers.length - 1 ? top : undefined}
                    zoom={i === layers.length - 1 && layer.path === image.path ? zoom : WHOLE}
                    panning={panning}
                  />
                ))}
                {/* Sized to the picture, so the heart sits on its corner whatever its shape. Hidden while zoomed. */}
                <div
                  className={cn(
                    "pointer-events-none relative shrink-0 transition-opacity",
                    zoomed ? "opacity-0" : "*:pointer-events-auto",
                  )}
                  style={{
                    ...shown,
                    transform: lift ? `translateY(${lift / 2}px)` : undefined,
                  }}
                >
                  {heading && (
                    <Caption
                      key={image.path}
                      heading={heading}
                      place={look.captionPlace}
                      height={captionHeight}
                      inset={framePad(pictureFrame, box.picture.width, box.picture.height) + 16}
                      width={shown.width}
                      effect={look.captionEffect}
                      animate
                    />
                  )}
                  <button
                    onClick={togglePin}
                    disabled={pinsFull}
                    aria-pressed={isPinned}
                    title={
                      isPinned
                        ? "Lossa bilden (P)"
                        : pinsFull
                          ? "Det får inte plats fler fästa bilder"
                          : "Fäst bilden medan du bläddrar vidare (P)"
                    }
                    aria-label={isPinned ? "Lossa bilden" : "Fäst bilden"}
                    className={cn(
                      "absolute right-29 bottom-3 flex size-11 items-center justify-center rounded-full bg-black/35 text-white transition-opacity hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30",
                      isPinned ? "opacity-100" : "opacity-70 hover:opacity-100",
                    )}
                  >
                    <Pin className={cn("size-6 drop-shadow", isPinned && "fill-current")} />
                  </button>
                  <button
                    onClick={() => onToggleFavorite(index)}
                    aria-pressed={favorite}
                    title={favorite ? "Ta bort från favoriter (F)" : "Lägg till i favoriter (F)"}
                    aria-label={favorite ? "Ta bort från favoriter" : "Lägg till i favoriter"}
                    className={cn(
                      "absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full bg-black/35 text-white transition-opacity hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                      favorite ? "opacity-100" : "opacity-70 hover:opacity-100",
                    )}
                  >
                    <Heart className={cn("size-6 drop-shadow", favorite && "fill-current")} />
                  </button>
                  <SeriesPicker
                    path={image.path}
                    series={series}
                    open={picking}
                    onOpenChange={setPicking}
                    onToggle={(id) => onToggleSeries(id, index)}
                    onCreate={(name) => onCreateSeries(name, index)}
                    defaultName={newSeriesName}
                  />
                </div>
              </div>
            </div>
          </div>
          <NavButton
            side="left"
            disabled={!hasPrev}
            onClick={() => onIndexChange(index - 1)}
            style={pinsWidth ? { left: pinsWidth + 4 } : undefined}
          />
          <NavButton side="right" disabled={!hasNext} onClick={() => onIndexChange(index + 1)} />
        </div>
      </div>
      {carry && (
        <img
          src={top.src}
          alt=""
          className="pointer-events-none fixed z-50 max-h-24 max-w-24 rounded-md opacity-80 shadow-xl"
          style={{ left: carry.x + 8, top: carry.y + 8 }}
        />
      )}
    </div>
  );
}

interface NavButtonProps {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}

function NavButton({ side, disabled, onClick, style }: NavButtonProps) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  const label = side === "left" ? "Föregående bild (←)" : "Nästa bild (→)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={style}
      title={label}
      aria-label={label}
      className={`absolute top-1/2 z-20 ${side === "left" ? "left-2" : "right-2"} flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}
    >
      <Icon className="size-6" />
    </button>
  );
}

interface LayerViewProps {
  layer: Layer;
  box: ReturnType<typeof fit>;
  frame: Frame;
  shadow: Shadow;
  rounded: boolean;
  /** Room kept free above the picture for its heading. */
  lift: number;
  /** Plays the layer's effect when added on top. */
  animate: boolean;
  /** The layer that now covers this one, whose effect decides how this one goes. */
  exit?: Layer;
  zoom: Zoom;
  /** Follows the pointer without easing while the picture is dragged. */
  panning: boolean;
}

/** One picture with its frame, centered on the stage, coming in or going out. */
function LayerView({ layer, box, frame, shadow, rounded, lift, animate, exit, zoom, panning }: LayerViewProps) {
  const [entered, setEntered] = useState(!animate);
  useEffect(() => {
    // Paint the starting position first, then move to rest.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  const framing = frameStyle(frame, box.picture.width, box.picture.height);
  const radius = corners(rounded, framing, box.width, box.height);
  const motion = exit
    ? {
        ...exitStyle(exit.effect, exit.dir),
        transition: transitionFor(exit.effect),
      }
    : entered
      ? {
          opacity: 1,
          transform: "none",
          transition: transitionFor(layer.effect),
        }
      : { ...enterStyle(layer.effect, layer.dir), transition: "none" };
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `calc(50% - ${box.width / 2}px)`,
        top: `calc(50% - ${(box.height - lift) / 2}px)`,
        width: box.width,
        height: box.height,
        transform: zoom.scale === 1 ? undefined : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
        transition: panning ? "none" : "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        className="relative size-full"
        style={{
          ...framing,
          borderRadius: radius.outer,
          boxShadow: shadow === "drop" ? DROP_SHADOW : undefined,
          ...motion,
        }}
      >
        <img
          src={layer.src}
          alt={layer.alt}
          draggable={false}
          className="block size-full object-contain"
          style={{ borderRadius: radius.inner }}
        />
        {shadow === "inset" && (
          <div
            className="absolute"
            style={{ inset: framing.padding ?? 0, boxShadow: INSET_SHADOW, borderRadius: radius.inner }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

interface PinnedPreviewProps {
  image: ImageEntry;
  current: boolean;
  dragging: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  onOpen: () => void;
  onUnpin: () => void;
}

/** A small pinned image; a click shows it in full again. */
function PinnedPreview({ image, current, dragging, onDragStart, onOpen, onUnpin }: PinnedPreviewProps) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => requestThumbnail(image, GRID_THUMB_SIZE, setSrc), [image]);
  return (
    <div
      data-pin={image.path}
      onPointerDown={onDragStart}
      className={cn("group relative shrink-0 touch-none", dragging && "cursor-grabbing opacity-50")}
      style={{ width: PIN_W, height: PIN_H }}
    >
      <button
        onClick={(e) => {
          // Keep the ring for the image shown, not the one last clicked.
          e.currentTarget.blur();
          onOpen();
        }}
        title={`${image.name}\nVisa i helskärm`}
        aria-label={`Visa ${image.name}`}
        aria-current={current || undefined}
        className={cn(
          "flex size-full items-center justify-center rounded-md bg-current/10 p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current",
          current && "ring-2 ring-current",
        )}
      >
        {src && <img src={src} alt="" draggable={false} className="max-h-full max-w-full rounded-sm object-contain" />}
      </button>
      <button
        data-unpin
        onClick={onUnpin}
        title="Lossa från hörnet"
        aria-label={`Lossa ${image.name} från hörnet`}
        className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

interface PinnedPictureProps {
  image: ImageEntry;
  /** The slot the layout gave it; the picture keeps its shape, centered inside. */
  rect: Rect;
  frame: Frame;
  shadow: Shadow;
  rounded: boolean;
  heading?: Heading;
  place: CaptionPlace;
  size: CaptionSize;
  dragging: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  onOpen: () => void;
  onUnpin: () => void;
}

/** A pinned picture shown large beside the current one; a click shows it on its own again. */
function PinnedPicture({
  image,
  rect,
  frame,
  shadow,
  rounded,
  heading,
  place,
  size,
  dragging,
  onDragStart,
  onOpen,
  onUnpin,
}: PinnedPictureProps) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => requestThumbnail(image, VIEWER_THUMB_SIZE, setSrc), [image]);
  // Headings shrink with smaller pictures, but stay readable.
  const captionHeight = heading
    ? Math.max(18, Math.round(captionLineHeight(heading.level, size, rect.height) * Math.min(1, rect.height / 600)))
    : 0;
  const lift = heading && place === "above" ? captionHeight : 0;
  const box = fit({ width: rect.width, height: Math.max(0, rect.height - lift) }, image.width, image.height, frame);
  const framing = frameStyle(frame, box.picture.width, box.picture.height);
  const radius = corners(rounded, framing, box.width, box.height);
  return (
    <div
      data-pin={image.path}
      onPointerDown={onDragStart}
      className={cn("group absolute touch-none", dragging && "z-10 cursor-grabbing opacity-60")}
      style={{
        left: rect.x + (rect.width - box.width) / 2,
        top: rect.y + (rect.height - box.height + lift) / 2,
        width: box.width,
        height: box.height,
        transition: SLOT_TRANSITION,
      }}
    >
      <button
        onClick={(e) => {
          e.currentTarget.blur();
          onOpen();
        }}
        title={`${image.name}\nVisa i stort`}
        aria-label={`Visa ${image.name}`}
        className="block size-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        style={{ ...framing, borderRadius: radius.outer, boxShadow: shadow === "drop" ? DROP_SHADOW : undefined }}
      >
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            className="block size-full object-contain"
            style={{ borderRadius: radius.inner }}
          />
        )}
      </button>
      {shadow === "inset" && (
        <div
          className="pointer-events-none absolute"
          style={{ inset: framing.padding ?? 0, boxShadow: INSET_SHADOW, borderRadius: radius.inner }}
          aria-hidden
        />
      )}
      {heading && (
        <Caption
          heading={heading}
          place={place}
          height={captionHeight}
          inset={framePad(frame, box.picture.width, box.picture.height) + Math.round(captionHeight / 3)}
          width={box.width}
          effect="none"
          animate={false}
        />
      )}
      <button
        data-unpin
        onClick={onUnpin}
        title="Lossa bilden"
        aria-label={`Lossa ${image.name}`}
        className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

interface CaptionProps {
  heading: Heading;
  place: CaptionPlace;
  height: number;
  /** Distance from the picture's edges when the heading sits on it. */
  inset: number;
  /** Width of the picture; a heading above it shrinks to fit rather than being cut. */
  width: number;
  effect: ViewerTransition;
  /** Comes in with the effect a moment after its picture. */
  animate: boolean;
}

let measure: CanvasRenderingContext2D | null = null;

/** The largest line height, up to `height`, at which the heading fits in `width` on one line. */
function fitLine(heading: Heading, height: number, width: number): number {
  measure ??= document.createElement("canvas").getContext("2d");
  if (!measure) return height;
  const weight = heading.level === 3 ? 500 : 600;
  const family = heading.font ? `"${heading.font}", system-ui, sans-serif` : "system-ui, sans-serif";
  measure.font = `${weight} 100px ${family}`;
  // Text width grows with its size, so one measurement at 100px gives the size that fits.
  const per100 = measure.measureText(heading.text).width;
  if (per100 <= 0) return height;
  const fits = Math.floor(((width * 0.98) / per100) * (100 / 0.62));
  return Math.max(18, Math.min(height, fits));
}

/** An image's heading in full screen, above the picture or in one of its corners. */
function Caption({ heading, place, height, inset, width, effect, animate }: CaptionProps) {
  const [entered, setEntered] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => setEntered(true), 180);
    return () => clearTimeout(timer);
  }, [animate]);
  const motion: React.CSSProperties = entered
    ? { opacity: 1, transform: "none", transition: transitionFor(resolveTransition(effect, 0)) }
    : { ...enterStyle(resolveTransition(effect, 0), 1), transition: "none" };
  const over = place !== "above";
  const right = place.endsWith("right");
  const line = over ? height : fitLine(heading, height, width);
  const position: React.CSSProperties = over
    ? {
        [place.startsWith("top") ? "top" : "bottom"]: inset,
        [right ? "right" : "left"]: inset,
        maxWidth: `calc(100% - ${inset * 2}px)`,
      }
    : { left: 0, right: 0, bottom: "100%" };
  return (
    <div className="pointer-events-none absolute" style={{ ...position, ...motion }}>
      <HeadingText
        heading={heading}
        height={line}
        scale={0.62}
        style={
          over
            ? {
                color: heading.color ?? "#fff",
                textAlign: right ? "right" : "left",
                textShadow: "0 1px 3px rgb(0 0 0 / 0.6), 0 0 18px rgb(0 0 0 / 0.35)",
                // On the picture a long heading wraps onto up to three lines instead of being cut.
                height: "auto",
                lineHeight: 1.1,
                whiteSpace: "normal",
                overflowWrap: "break-word",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
              }
            : undefined
        }
      />
    </div>
  );
}
