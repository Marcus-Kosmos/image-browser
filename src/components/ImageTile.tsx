import { memo, useEffect, useRef, useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import type { ImageEntry } from "@/lib/api";
import type { LayoutBox } from "@/lib/layout";
import type { Series } from "@/lib/library";
import { useRevealOnView } from "@/lib/reveal";
import type { Frame, ImageSettings, ImageSize, Reveal, Shadow } from "@/lib/settings";
import { GRID_THUMB_SIZE, requestThumbnail } from "@/lib/thumbnails";
import { cn } from "@/lib/utils";
import type { HeadingKind } from "./HeadingDialog";
import { HeadingText } from "./HeadingText";
import { ImageMenu } from "./ImageMenu";

interface ImageTileProps {
  image: ImageEntry;
  box: LayoutBox;
  /** Effect already resolved from the folder and image settings. */
  reveal: Exclude<Reveal, "slide-alternate">;
  /** Position within its row, used to stagger the reveal. */
  order: number;
  /** Drawn with a ring, to show where the image last viewed full screen is. */
  marked?: boolean;
  favorite: boolean;
  frame: Frame;
  shadow: Shadow;
  /** All saved series, so the menu can add the image to one or take it out. */
  series: Series[];
  root: HTMLElement | null;
  settingsKey: string;
  settings: ImageSettings;
  onOpen: (index: number) => void;
  onTrash: (index: number) => void;
  onChange: (key: string, change: ImageSettings) => void;
  onToggleFavorite: (index: number) => void;
  onToggleSeries: (id: string, index: number) => void;
  onEditHeading: (index: number, kind: HeadingKind) => void;
  /** In a series, where the image can be dragged to a new place. */
  reorderable: boolean;
  /** This image is being dragged. */
  dragging: boolean;
  onReorderStart: (index: number, e: React.PointerEvent) => void;
  onReorderKey: (index: number, step: -1 | 1) => void;
}

/** Padding and color of each frame; the padding grows with the picture, like a real mat. */
function frameStyle(frame: Frame, width: number, height: number): React.CSSProperties {
  const short = Math.min(width, height);
  switch (frame) {
    case "line":
      return { border: "1px solid color-mix(in oklab, var(--foreground) 35%, transparent)" };
    case "mat":
      return {
        padding: Math.max(6, Math.round(short * 0.05)),
        background: "#fbfaf7",
        border: "1px solid rgb(0 0 0 / 0.08)",
      };
    case "black":
      return { padding: Math.max(4, Math.round(short * 0.03)), background: "#111" };
    default:
      return {};
  }
}

const SIZE_KEYS: Record<string, ImageSize> = { "1": "small", "2": "medium", "3": "large" };

export const ImageTile = memo(function ImageTile({
  image,
  box,
  reveal,
  order,
  marked = false,
  favorite,
  frame,
  shadow,
  series,
  root,
  settingsKey,
  settings,
  onOpen,
  onTrash,
  onChange,
  onToggleFavorite,
  onToggleSeries,
  onEditHeading,
  reorderable,
  dragging,
  onReorderStart,
  onReorderKey,
}: ImageTileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inView = useRevealOnView(ref, root, reveal !== "none");

  useEffect(() => {
    setUrl(null);
    setLoaded(false);
    return requestThumbnail(image, GRID_THUMB_SIZE, setUrl);
  }, [image]);

  // Wait for the thumbnail too, so the effect plays on the picture rather than an empty box.
  const shown = inView && (loaded || reveal === "none");
  const header = box.header ?? 0;
  const framing = frameStyle(frame, box.width, box.height - header);

  return (
    <div
      ref={ref}
      data-index={box.index}
      data-reveal={reveal}
      data-shown={shown ? "" : undefined}
      className="group reveal absolute"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        transitionDelay: shown ? `${order * 90}ms` : undefined,
      }}
    >
      {settings.heading && header > 0 && (
        <HeadingText
          heading={settings.heading}
          height={header}
          scale={0.55}
          onEdit={() => onEditHeading(box.index, "image")}
        />
      )}
      <div
        className={cn("absolute inset-x-0 bottom-0 overflow-hidden rounded-sm", reveal === "none" && frame === "none" && "bg-muted")}
        style={{
          ...framing,
          top: header,
          boxShadow: shadow === "drop" ? "0 12px 24px -8px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.2)" : undefined,
          // Outlines are drawn outside the clipped box, so the ring isn't cut off.
          outline: `3px solid ${marked ? "var(--primary)" : "transparent"}`,
          outlineOffset: 3,
          opacity: dragging ? 0.35 : undefined,
          transition: "outline-color 0.6s ease-out, opacity 0.15s ease-out",
        }}
      >
        <button
          className="block size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          onClick={() => onOpen(box.index)}
          onPointerDown={reorderable ? (e) => onReorderStart(box.index, e) : undefined}
          onKeyDown={(e) => {
            if (reorderable && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
              e.preventDefault();
              onReorderKey(box.index, e.key === "ArrowLeft" ? -1 : 1);
            } else if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              onTrash(box.index);
            } else if (SIZE_KEYS[e.key]) {
              e.preventDefault();
              onChange(settingsKey, { size: SIZE_KEYS[e.key] });
            } else if (e.key === "f") {
              e.preventDefault();
              onToggleFavorite(box.index);
            }
          }}
          aria-label={image.name}
          title={`${image.name}\n1, 2, 3: liten, mellan, stor · F: favorit${reorderable ? "\nDra till en ny plats, eller Alt + pil vänster/höger" : ""}`}
        >
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              onLoad={() => setLoaded(true)}
              className="size-full object-cover transition-opacity duration-200"
              style={{ opacity: loaded ? 1 : 0 }}
            />
          )}
        </button>
        {shadow === "inset" && (
          <div
            className="pointer-events-none absolute"
            style={{ inset: framing.padding ?? 0, boxShadow: "inset 0 0 24px rgb(0 0 0 / 0.6), inset 0 0 4px rgb(0 0 0 / 0.4)" }}
            aria-hidden
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pt-6 pr-10 pb-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          {image.name}
        </div>
        <ImageMenu
          name={image.name}
          path={image.path}
          series={series}
          onToggleSeries={(id) => onToggleSeries(id, box.index)}
          onEditHeading={(kind) => onEditHeading(box.index, kind)}
          settings={settings}
          onChange={(change) => onChange(settingsKey, change)}
          onOpenChange={setMenuOpen}
        />
        <button
          onClick={() => onTrash(box.index)}
          className={cn(
            "absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
            menuOpen && "opacity-100",
          )}
          title="Flytta till papperskorgen"
          aria-label={`Flytta ${image.name} till papperskorgen`}
          tabIndex={-1}
        >
          <Trash2 className="size-4" />
        </button>
        <button
          onClick={() => onToggleFavorite(box.index)}
          className={cn(
            "absolute right-1.5 bottom-1.5 flex size-7 items-center justify-center rounded-md text-white transition-opacity hover:bg-black/40 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
            favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          title={favorite ? "Ta bort från favoriter (F)" : "Lägg till i favoriter (F)"}
          aria-label={favorite ? `Ta bort ${image.name} från favoriter` : `Lägg till ${image.name} i favoriter`}
          aria-pressed={favorite}
          tabIndex={-1}
        >
          <Heart className={cn("size-4 drop-shadow", favorite && "fill-current")} />
        </button>
      </div>
    </div>
  );
});
