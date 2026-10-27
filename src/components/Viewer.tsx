import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Info, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageEntry } from "@/lib/api";
import { INSET_SHADOW, frameStyle } from "@/lib/frame";
import type { Frame, Shadow } from "@/lib/settings";
import { resolveTransition, useViewerSettings, type ViewerEffect } from "@/lib/viewer";
import type { Tag } from "@/lib/filter";
import type { Series } from "@/lib/library";
import { SeriesPicker } from "./SeriesPicker";
import { ViewerLookMenu } from "./ViewerLookMenu";
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
  const picture = { width: Math.round(width * scale), height: Math.round(height * scale) };
  const pad = framePad(frame, picture.width, picture.height);
  return { picture, width: picture.width + 2 * pad, height: picture.height + 2 * pad };
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
  paused,
}: ViewerProps) {
  const { settings: look, update: updateLook } = useViewerSettings();
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

  // The largest box with the picture's shape that fits, never larger than the picture itself.
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!stage) return;
    const measure = () => setRoom({ width: stage.clientWidth, height: stage.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);
  const box = fit(room, image.width, image.height, frame);
  const top = layers[layers.length - 1];

  const favorite = isFavorite(image);
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      // Typing a series name must not trash or step.
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const digit = Number(e.key);
      if (e.key === "Escape") onClose();
      else if (Number.isInteger(digit) && digit >= 1 && digit <= series.length) onToggleSeries(series[digit - 1].id, index);
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
  }, [paused, index, hasPrev, hasNext, onClose, onIndexChange, onTrash, onToggleFavorite, series, onToggleSeries]);

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden outline-none"
      // The page's colors when chosen; otherwise black, with light text and a light frame line.
      style={
        look.background
          ? { background: "var(--canvas)", color: "var(--foreground)" }
          : ({ background: "#000", color: "#fafafa", "--foreground": "#fafafa" } as React.CSSProperties)
      }
      role="dialog" aria-modal="true" aria-label={image.name}>
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
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6">
        <div ref={setStage} className="relative flex size-full items-center justify-center">
          {layers.map((layer, i) => (
            <LayerView
              key={layer.id}
              layer={layer}
              box={fit(room, layer.width, layer.height, frame)}
              frame={frame}
              shadow={shadow}
              animate={i > 0}
              exit={i < layers.length - 1 ? top : undefined}
            />
          ))}
          {/* Sized to the picture, so the heart sits on its corner whatever its shape. */}
          <div className="pointer-events-none relative shrink-0 *:pointer-events-auto" style={{ width: box.width, height: box.height }}>
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
        <NavButton side="left" disabled={!hasPrev} onClick={() => onIndexChange(index - 1)} />
        <NavButton side="right" disabled={!hasNext} onClick={() => onIndexChange(index + 1)} />
      </div>
    </div>
  );
}

function NavButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  const label = side === "left" ? "Föregående bild (←)" : "Nästa bild (→)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
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
  /** Plays the layer's effect when added on top. */
  animate: boolean;
  /** The layer that now covers this one, whose effect decides how this one goes. */
  exit?: Layer;
}

/** One picture with its frame, centered on the stage, coming in or going out. */
function LayerView({ layer, box, frame, shadow, animate, exit }: LayerViewProps) {
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
  const motion = exit
    ? { ...exitStyle(exit.effect, exit.dir), transition: transitionFor(exit.effect) }
    : entered
      ? { opacity: 1, transform: "none", transition: transitionFor(layer.effect) }
      : { ...enterStyle(layer.effect, layer.dir), transition: "none" };
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `calc(50% - ${box.width / 2}px)`,
        top: `calc(50% - ${box.height / 2}px)`,
        width: box.width,
        height: box.height,
        ...framing,
        boxShadow: shadow === "drop" ? "0 24px 48px -12px rgb(0 0 0 / 0.55), 0 4px 12px rgb(0 0 0 / 0.25)" : undefined,
        willChange: "opacity, transform",
        ...motion,
      }}
    >
      <img src={layer.src} alt={layer.alt} draggable={false} className="block size-full object-contain" />
      {shadow === "inset" && (
        <div className="absolute" style={{ inset: framing.padding ?? 0, boxShadow: INSET_SHADOW }} aria-hidden />
      )}
    </div>
  );
}
