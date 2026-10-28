import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Info, Pin, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { originalUrl, type ImageEntry } from "@/lib/api";
import { INSET_SHADOW, frameStyle } from "@/lib/frame";
import type { Frame, Heading, Shadow } from "@/lib/settings";
import {
  CAPTION_HEIGHT,
  DEFAULT_VIEWER_SETTINGS,
  hasRoomToPin,
  pinLayout,
  resolveTransition,
  useViewerSettings,
  type CaptionPlace,
  type Rect,
  type ViewerSettings,
  type ViewerTransition,
  type ViewerEffect,
} from "@/lib/viewer";
import type { Tag } from "@/lib/filter";
import type { Series } from "@/lib/library";
import { SeriesPicker } from "./SeriesPicker";
import { ViewerLookMenu } from "./ViewerLookMenu";
import { SavePinnedMenu, type SavePinnedChoice } from "./SavePinnedMenu";
import { HeadingText } from "./HeadingText";
import { GRID_THUMB_SIZE, VIEWER_THUMB_SIZE, requestThumbnail } from "@/lib/thumbnails";
import { cn, formatBytes } from "@/lib/utils";

interface ViewerProps {
  images: ImageEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onTrash: (index: number) => void;
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

/** The largest box with the picture's shape that fits with its frame, never larger than the picture. */
function fit(room: { width: number; height: number }, width: number, height: number, frame: Frame) {
  const first = Math.min(room.width / width, room.height / height, 1);
  const room0 = framePad(frame, width * first, height * first);
  const scale = Math.max(0, Math.min((room.width - 2 * room0) / width, (room.height - 2 * room0) / height, 1));
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
    const cancelFull = requestThumbnail(image, VIEWER_THUMB_SIZE, (src) => show(src, true));
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
      .map((img) => requestThumbnail(img, VIEWER_THUMB_SIZE, (src) => void decoded(src)));
    return () => cancels.forEach((c) => c());
  }, [images, index]);

  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
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
  const room = layout ? { width: layout.current.width, height: layout.current.height } : space;
  // The largest box with the picture's shape that fits, never larger than the picture itself.
  // A heading above the picture takes a line from its room.
  const captionOf = (img: ImageEntry) => (look.captionPlace === "off" ? undefined : headingOf(img));
  const heading = captionOf(image);
  const captionHeight = heading ? CAPTION_HEIGHT[heading.level] : 0;
  const lift = heading && look.captionPlace === "above" ? captionHeight : 0;
  const pictureRoom = { width: room.width, height: Math.max(0, room.height - lift) };
  const box = fit(pictureRoom, image.width, image.height, frame);
  // Beside pinned pictures the stage hugs the picture, so zooming stays in its place.
  const view = layout ? { width: box.width, height: box.height + lift } : room;
  const top = layers[layers.length - 1];

  // Zoom: each click magnifies where it points, three clicks reach the closest view.
  const [zoom, setZoom] = useState<Zoom>(WHOLE);
  const [panning, setPanning] = useState(false);
  // With "Behåll zoom" each image comes back as it was left while the viewer is open.
  const kept = useRef(new Map<string, Zoom>());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setZoom((look.keepZoom && kept.current.get(image.path)) || WHOLE), [image]);
  // At least 3×, more for a picture with pixels to spare, so the last step shows them one to one.
  const maxScale = Math.min(12, Math.max(3, image.width / Math.max(1, box.picture.width)));
  const levels = Array.from({ length: ZOOM_STEPS + 1 }, (_, k) => maxScale ** (k / ZOOM_STEPS));
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
      const limitX = Math.max(0, (box.width * z.scale - view.width) / 2);
      const limitY = Math.max(0, (box.height * z.scale - view.height) / 2);
      return {
        scale: z.scale,
        x: Math.max(-limitX, Math.min(limitX, z.x)),
        y: Math.max(-limitY, Math.min(limitY, z.y)),
      };
    },
    [box.width, box.height, view.width, view.height],
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
      const next =
        dir > 0
          ? (levels.find((l) => l > zoom.scale + 0.001) ?? maxScale)
          : ([...levels].reverse().find((l) => l < zoom.scale - 0.001) ?? 1);
      zoomTo(next, px, py);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoom.scale, maxScale, zoomTo],
  );

  // The file itself once zoomed in, as the largest thumbnail runs out of detail.
  const [original, setOriginal] = useState<{
    path: string;
    src: string;
  } | null>(null);
  useEffect(() => {
    if (!zoomed || original?.path === image.path) return;
    let cancelled = false;
    const src = originalUrl(image);
    const img = new Image();
    img.src = src;
    img
      .decode()
      .then(() => !cancelled && setOriginal({ path: image.path, src }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [zoomed, image, original?.path]);

  // A press either drags the zoomed picture around or, without moving, is a zoom click.
  const press = useRef<{
    x: number;
    y: number;
    from: Zoom;
    moved: boolean;
  } | null>(null);
  const onStageDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, [role=menu]")) return;
    press.current = { x: e.clientX, y: e.clientY, from: zoom, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onStageMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || !zoomed) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < 4) return;
    p.moved = true;
    setPanning(true);
    setZoom(clamp({ ...p.from, x: p.from.x + dx, y: p.from.y + dy }));
  };
  const onStageUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    setPanning(false);
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
    const i = images.findIndex((img) => img.path === p.path);
    if (i >= 0) onIndexChange(i);
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
    >
      {/* Trash and close sit at opposite ends so one isn't clicked by mistake for the other. */}
      <div className="flex h-12 shrink-0 items-center gap-3 px-3">
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
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6"
        style={{ paddingLeft: pinsWidth ? pinsWidth + 48 : undefined }}
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
                onOpen={() => openPinned(beside[i])}
                onUnpin={() => unpin(beside[i])}
              />
            ))}
            <div
              ref={setStage}
              className={cn(
                "flex touch-none items-center justify-center overflow-hidden",
                layout ? "absolute" : "relative size-full",
              )}
              style={{
                ...(layout && {
                  left: layout.current.x + (layout.current.width - box.width) / 2,
                  top: layout.current.y + (layout.current.height - box.height - lift) / 2,
                  ...view,
                  transition: SLOT_TRANSITION,
                }),
                cursor: panning ? "grabbing" : atMax ? "zoom-out" : "zoom-in",
              }}
              onPointerDown={onStageDown}
              onPointerMove={onStageMove}
              onPointerUp={onStageUp}
              onPointerCancel={() => {
                press.current = null;
                setPanning(false);
              }}
            >
              {layers.map((layer, i) => (
                <LayerView
                  key={layer.id}
                  layer={
                    original?.path === layer.path && i === layers.length - 1 ? { ...layer, src: original.src } : layer
                  }
                  box={fit(pictureRoom, layer.width, layer.height, frame)}
                  lift={lift}
                  frame={frame}
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
                  width: box.width,
                  height: box.height,
                  transform: lift ? `translateY(${lift / 2}px)` : undefined,
                }}
              >
                {heading && (
                  <Caption
                    key={image.path}
                    heading={heading}
                    place={look.captionPlace}
                    height={captionHeight}
                    inset={framePad(frame, box.picture.width, box.picture.height) + 16}
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
      className={`absolute top-1/2 ${side === "left" ? "left-2" : "right-2"} flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}
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
  onOpen: () => void;
  onUnpin: () => void;
}

/** A small pinned image; a click shows it in full again. */
function PinnedPreview({ image, current, onOpen, onUnpin }: PinnedPreviewProps) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => requestThumbnail(image, GRID_THUMB_SIZE, setSrc), [image]);
  return (
    <div className="group relative shrink-0" style={{ width: PIN_W, height: PIN_H }}>
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
  onOpen: () => void;
  onUnpin: () => void;
}

/** A pinned picture shown large beside the current one; a click shows it on its own again. */
function PinnedPicture({ image, rect, frame, shadow, rounded, heading, place, onOpen, onUnpin }: PinnedPictureProps) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => requestThumbnail(image, VIEWER_THUMB_SIZE, setSrc), [image]);
  // Headings shrink with smaller pictures, but stay readable.
  const captionHeight = heading
    ? Math.max(18, Math.round(CAPTION_HEIGHT[heading.level] * Math.min(1, rect.height / 600)))
    : 0;
  const lift = heading && place === "above" ? captionHeight : 0;
  const box = fit({ width: rect.width, height: Math.max(0, rect.height - lift) }, image.width, image.height, frame);
  const framing = frameStyle(frame, box.picture.width, box.picture.height);
  const radius = corners(rounded, framing, box.width, box.height);
  return (
    <div
      className="group absolute"
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
          effect="none"
          animate={false}
        />
      )}
      <button
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
  effect: ViewerTransition;
  /** Comes in with the effect a moment after its picture. */
  animate: boolean;
}

/** An image's heading in full screen, above the picture or in one of its corners. */
function Caption({ heading, place, height, inset, effect, animate }: CaptionProps) {
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
        height={height}
        scale={0.62}
        style={
          over
            ? {
                color: heading.color ?? "#fff",
                textAlign: right ? "right" : "left",
                textShadow: "0 1px 3px rgb(0 0 0 / 0.6), 0 0 18px rgb(0 0 0 / 0.35)",
              }
            : undefined
        }
      />
    </div>
  );
}
