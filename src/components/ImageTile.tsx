import { memo, useEffect, useRef, useState } from "react";
import { Check, FileWarning, FolderMinus, Heart, ImageOff, Trash2 } from "lucide-react";
import { AiMark, aiMarkTitle } from "./AiMark";
import type { ImageEntry } from "@/lib/api";
import { INSET_SHADOW, frameStyle } from "@/lib/frame";
import type { Tag } from "@/lib/filter";
import type { LayoutBox } from "@/lib/layout";
import type { Series } from "@/lib/library";
import { useRevealOnView } from "@/lib/reveal";
import type { Frame, ImageSettings, ImageSize, Shadow, TileReveal } from "@/lib/settings";
import { GRID_THUMB_SIZE, requestThumbnail } from "@/lib/thumbnails";
import { cn } from "@/lib/utils";
import type { HeadingKind } from "./HeadingDialog";
import { HeadingText } from "./HeadingText";
import { ImageMenu } from "./ImageMenu";
import { WaitingRing } from "./WaitingRing";

interface ImageTileProps {
  image: ImageEntry;
  box: LayoutBox;
  /** Effect already resolved from the folder and image settings. */
  reveal: TileReveal;
  /** Position within its row, used to stagger the reveal. */
  order: number;
  /** Drawn with a ring, to show where the image last viewed full screen is. */
  marked?: boolean;
  /** Part of the current selection. */
  selected?: boolean;
  /** Shows that the picture was made or changed by AI. */
  aiMark?: ImageEntry["ai"];
  /** When an enlarged copy of this picture began to be made, while it is on its way. */
  waitingSince?: number;
  favorite: boolean;
  tags?: Tag[];
  frame: Frame;
  shadow: Shadow;
  /** All saved series, so the menu can add the image to one or take it out. */
  series: Series[];
  root: HTMLElement | null;
  settingsKey: string;
  settings: ImageSettings;
  /** A click; with ⌘ or Shift it selects rather than opens. */
  onOpen: (index: number, e: React.MouseEvent) => void;
  onTrash: (index: number) => void;
  /** In a series: takes the image out of it; the file stays. */
  onRemove?: (index: number) => void;
  onChange: (key: string, change: ImageSettings) => void;
  onToggleFavorite: (index: number) => void;
  onToggleSeries: (id: string, index: number) => void;
  onEditHeading: (index: number, kind: HeadingKind) => void;
  /** In a series, where the image can be moved to a new place. */
  reorderable: boolean;
  /** This image is being dragged. */
  dragging: boolean;
  /** A press that may become a drag: to a new place in a series, or onto the sidebar. */
  onDragStart: (index: number, e: React.PointerEvent) => void;
  onReorderKey: (index: number, step: -1 | 1) => void;
}

const SIZE_KEYS: Record<string, ImageSize> = { "1": "small", "2": "medium", "3": "large" };

export const ImageTile = memo(function ImageTile({
  image,
  box,
  reveal,
  order,
  marked = false,
  selected = false,
  aiMark,
  waitingSince,
  favorite,
  tags,
  frame,
  shadow,
  series,
  root,
  settingsKey,
  settings,
  onOpen,
  onTrash,
  onRemove,
  onChange,
  onToggleFavorite,
  onToggleSeries,
  onEditHeading,
  reorderable,
  dragging,
  onDragStart,
  onReorderKey,
}: ImageTileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  // The thumbnail that has finished loading. Compared with `url` rather than reset to false,
  // because a reloaded folder hands back the same cached thumbnail and the browser then
  // fires no new load event, which left the tile hidden for good.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const loaded = url !== null && loadedUrl === url;
  const [menuOpen, setMenuOpen] = useState(false);
  const inView = useRevealOnView(ref, root, reveal !== "none");
  const picture = useRef<HTMLImageElement>(null);
  useParallax(ref, picture, root, reveal === "parallax" && loaded);

  useEffect(() => requestThumbnail(image, GRID_THUMB_SIZE, setUrl), [image]);

  // Wait for the thumbnail too, so the effect plays on the picture rather than an empty box.
  const shown = inView && (loaded || reveal === "none" || !!image.gone);
  const header = box.header ?? 0;
  // Too narrow for its buttons side by side: they go into the menu, which opens from one button.
  const compact = box.width < (onRemove ? 168 : 136);
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
        // A cascade lets the images of a row fall in one after another, more slowly.
        transitionDelay: shown ? `${order * (reveal === "cascade" ? 220 : 90)}ms` : undefined,
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
          outline: `3px solid ${marked || selected ? "var(--primary)" : "transparent"}`,
          outlineOffset: 3,
          opacity: dragging ? 0.35 : undefined,
          transition: "outline-color 0.6s ease-out, opacity 0.15s ease-out",
        }}
      >
        <button
          className="block size-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          data-tile
          // A picture that is gone can still be selected, to be taken out, but there is nothing to open.
          onClick={(e) => (image.gone && !e.metaKey && !e.shiftKey ? undefined : onOpen(box.index, e))}
          onPointerDown={(e) => onDragStart(box.index, e)}
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
          aria-pressed={selected || undefined}
          title={`${image.name}\n1, 2, 3: liten, mellan, stor · F: favorit\n⌘- eller Skift-klick: markera · Skift + dra: markera flera med en ruta${reorderable ? "\nDra till en ny plats, eller Alt + pil vänster/höger" : ""}`}
        >
          {image.gone ? (
            <span className="flex size-full flex-col items-center justify-center gap-1 bg-muted p-2 text-center text-xs text-muted-foreground">
              <ImageOff className="size-6" aria-hidden />
              <span className="font-medium">Bilden är borta</span>
              <span>Flyttad eller borttagen utanför appen</span>
            </span>
          ) : url && (
            <img
              ref={picture}
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) => setLoadedUrl(e.currentTarget.getAttribute("src"))}
              className="size-full object-cover transition-opacity duration-200"
              style={{ opacity: loaded ? 1 : 0 }}
            />
          )}
        </button>
        {shadow === "inset" && (
          <div
            className="pointer-events-none absolute"
            style={{ inset: framing.padding ?? 0, boxShadow: INSET_SHADOW }}
            aria-hidden
          />
        )}
        {waitingSince !== undefined && <WaitingRing since={waitingSince} compact />}
        {image.changed && (
          <span
            className={cn(
              "pointer-events-none absolute bottom-1.5 left-1.5 flex h-6 items-center gap-1 rounded-md bg-black/55 px-1.5 text-xs font-medium text-white transition-opacity group-hover:opacity-0",
              (menuOpen || selected) && "opacity-0",
            )}
            title="Filen har ändrats utanför appen sedan den lades här"
          >
            <FileWarning className="size-3.5" aria-hidden />
            Ändrad
          </span>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pt-6 pr-10 pb-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          <div className="truncate">{image.name}</div>
          {tags && tags.length > 0 && (
            <div className="mt-1 flex gap-1 overflow-hidden whitespace-nowrap">
              {tags.map((t) => (
                <span key={t.key} className="shrink-0 rounded-sm bg-white/20 px-1.5 py-px text-[11px] leading-4">
                  {t.name}
                </span>
              ))}
            </div>
          )}
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
          actions={
            compact
              ? [
                  {
                    label: favorite ? "Ta bort från favoriter" : "Lägg till i favoriter",
                    icon: <Heart className={cn(favorite && "fill-current")} />,
                    onClick: () => onToggleFavorite(box.index),
                  },
                  ...(onRemove
                    ? [{ label: "Ta bort ur serien", icon: <FolderMinus />, onClick: () => onRemove(box.index) }]
                    : []),
                  {
                    label: "Flytta till papperskorgen",
                    icon: <Trash2 />,
                    onClick: () => onTrash(box.index),
                    danger: true,
                  },
                ]
              : undefined
          }
        />
        {onRemove && !compact && (
          <button
            onClick={() => onRemove(box.index)}
            className={cn(
              "absolute top-1.5 right-10 flex size-7 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              menuOpen && "opacity-100",
            )}
            title="Ta bort ur serien (filen finns kvar)"
            aria-label={`Ta bort ${image.name} ur serien`}
            tabIndex={-1}
          >
            <FolderMinus className="size-4" />
          </button>
        )}
        {!compact && (
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
        )}
        <button
          onClick={() => onToggleFavorite(box.index)}
          className={cn(
            "absolute right-1.5 bottom-1.5 flex size-7 items-center justify-center rounded-md text-white transition-opacity hover:bg-black/40 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
            // Small, it shows only when it is a favorite; the menu has it otherwise.
            favorite ? "opacity-100" : compact ? "hidden" : "opacity-0 group-hover:opacity-100",
          )}
          title={favorite ? "Ta bort från favoriter (F)" : "Lägg till i favoriter (F)"}
          aria-label={favorite ? `Ta bort ${image.name} från favoriter` : `Lägg till ${image.name} i favoriter`}
          aria-pressed={favorite}
          tabIndex={-1}
        >
          <Heart className={cn("size-4 drop-shadow", favorite && "fill-current")} />
        </button>
        {aiMark && (
          <span
            className={cn(
              "pointer-events-none absolute top-1.5 right-1.5 flex h-6 items-center gap-1 rounded-md bg-black/55 px-1.5 text-xs font-medium text-white transition-opacity group-hover:opacity-0",
              menuOpen && "opacity-0",
            )}
            title={aiMarkTitle(aiMark)}
          >
            <AiMark kind={aiMark} className="size-3.5" iconOnly={compact} />
          </span>
        )}
        {selected && (
          <span
            className="pointer-events-none absolute bottom-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
            aria-hidden
          >
            <Check className="size-4" strokeWidth={3} />
          </span>
        )}
      </div>
    </div>
  );
});

/**
 * Moves the picture a little slower than the page while scrolling, so it seems to lie further
 * back. The picture is enlarged slightly so its edges never show.
 */
function useParallax(
  tile: React.RefObject<HTMLElement>,
  picture: React.RefObject<HTMLImageElement>,
  root: HTMLElement | null,
  enabled: boolean,
) {
  useEffect(() => {
    const img = picture.current;
    if (!enabled || !root || !img || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = tile.current?.getBoundingClientRect();
      if (!box) return;
      const view = root.getBoundingClientRect();
      // -1 when the tile's center is at the bottom of the view, 1 at the top.
      const offset = (view.top + view.height / 2 - (box.top + box.height / 2)) / (view.height / 2);
      const shift = Math.max(-1, Math.min(1, offset)) * 7;
      img.style.transform = `translateY(${shift.toFixed(2)}%) scale(1.18)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      img.style.transform = "";
    };
  }, [tile, picture, root, enabled]);
}
