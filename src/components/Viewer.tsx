import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageEntry } from "@/lib/api";
import type { Tag } from "@/lib/filter";
import type { Series } from "@/lib/library";
import { SeriesPicker } from "./SeriesPicker";
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
  /** Keyboard shortcuts pause while another dialog (the trash confirmation) is open. */
  paused: boolean;
}

interface Layer {
  id: number;
  path: string;
  src: string;
  alt: string;
}

/** Resolves once the browser has decoded the image, so swapping it in never shows a blank frame. */
function decoded(src: string) {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => {});
}

const FADE_MS = 350;

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
  paused,
}: ViewerProps) {
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
    const show = (src: string, isSharp: boolean) =>
      void decoded(src).then(() => {
        // Ignore a late grid thumbnail once the sharp version is up, and anything after moving on.
        if (cancelled || (sharp && !isSharp)) return;
        sharp ||= isSharp;
        setLayers((prev) => {
          const top = prev[prev.length - 1];
          if (top?.path === image.path) return [...prev.slice(0, -1), { ...top, src }];
          return [...prev.slice(-1), { id: nextId.current++, path: image.path, src, alt: image.name }];
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
  }, [image]);

  // Drop the covered image once the fade has finished.
  useEffect(() => {
    if (layers.length < 2) return;
    const timer = setTimeout(() => setLayers((prev) => prev.slice(-1)), FADE_MS + 50);
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
  const scale = Math.min(room.width / image.width, room.height / image.height, 1);
  const box = { width: Math.round(image.width * scale), height: Math.round(image.height * scale) };

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
      className="fixed inset-0 z-40 flex flex-col bg-black text-white outline-none"
      role="dialog" aria-modal="true" aria-label={image.name}>
      {/* Trash and close sit at opposite ends so one isn't clicked by mistake for the other. */}
      <div className="flex h-12 shrink-0 items-center gap-3 px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white/80 hover:bg-destructive hover:text-white"
          onClick={() => onTrash(index)}
          title="Flytta till papperskorgen (⌫)"
          aria-label="Flytta till papperskorgen"
        >
          <Trash2 />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-medium">{image.name}</div>
          <div className="text-xs text-white/60">
            {index + 1} av {images.length} · {image.width} × {image.height} · {formatBytes(image.size)}
            {tagsOf(image).map((t) => (
              <span key={t.key} className="ml-1.5 rounded-sm bg-white/15 px-1.5 py-px text-white/80">
                {t.name}
              </span>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/15 hover:text-white"
          onClick={onClose}
          title="Stäng (Esc)"
          aria-label="Stäng"
        >
          <X />
        </Button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6">
        <div ref={setStage} className="relative flex size-full items-center justify-center">
          {/* Sized to the picture, so the heart sits on its corner whatever its shape. */}
          <div className="relative shrink-0" style={{ width: box.width, height: box.height }}>
            {layers.map((layer, i) => (
              <FadeImage key={layer.id} layer={layer} animate={i > 0} covered={i < layers.length - 1} />
            ))}
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

/** Fades in when added on top, and out once a newer image covers it. */
function FadeImage({ layer, animate, covered }: { layer: Layer; animate: boolean; covered: boolean }) {
  const [visible, setVisible] = useState(!animate);
  useEffect(() => {
    // Start transparent for one frame, then fade in.
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <img
      src={layer.src}
      alt={layer.alt}
      draggable={false}
      className="absolute inset-0 size-full object-contain"
      style={{ opacity: visible && !covered ? 1 : 0, transition: `opacity ${FADE_MS}ms ease-out` }}
    />
  );
}
