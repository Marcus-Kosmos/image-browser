import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageEntry } from "@/lib/api";
import { GRID_THUMB_SIZE, VIEWER_THUMB_SIZE, requestThumbnail } from "@/lib/thumbnails";
import { formatBytes } from "@/lib/utils";

interface ViewerProps {
  images: ImageEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onTrash: (index: number) => void;
  /** Keyboard shortcuts pause while another dialog (the trash confirmation) is open. */
  paused: boolean;
}

export function Viewer({ images, index, onIndexChange, onClose, onTrash, paused }: ViewerProps) {
  const image = images[index];
  const [preview, setPreview] = useState<string | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Take focus from the grid tile that opened the viewer, so its key handlers don't fire underneath.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    setPreview(null);
    setFull(null);
    // Show the grid thumbnail instantly, then swap in the sharp version.
    const cancelPreview = requestThumbnail(image, GRID_THUMB_SIZE, setPreview);
    const cancelFull = requestThumbnail(image, VIEWER_THUMB_SIZE, setFull);
    return () => {
      cancelPreview();
      cancelFull();
    };
  }, [image]);

  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
      else if (e.key === "Delete" || e.key === "Backspace") onTrash(index);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, index, hasPrev, hasNext, onClose, onIndexChange, onTrash]);

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="fixed inset-0 z-40 flex flex-col bg-black text-white outline-none"
      role="dialog" aria-modal="true" aria-label={image.name}>
      <div className="flex h-12 shrink-0 items-center gap-3 px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{image.name}</div>
          <div className="text-xs text-white/60">
            {index + 1} av {images.length} · {image.width} × {image.height} · {formatBytes(image.size)}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/15 hover:text-white"
          onClick={() => onTrash(index)}
          title="Flytta till papperskorgen (⌫)"
          aria-label="Flytta till papperskorgen"
        >
          <Trash2 />
        </Button>
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
        {(full ?? preview) && (
          <img
            src={full ?? preview!}
            alt={image.name}
            draggable={false}
            className="max-h-full max-w-full object-contain"
            style={{ aspectRatio: `${image.width} / ${image.height}` }}
          />
        )}
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
