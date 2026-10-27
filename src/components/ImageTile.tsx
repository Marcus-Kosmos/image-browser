import { memo, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { ImageEntry } from "@/lib/api";
import type { LayoutBox } from "@/lib/layout";
import { useRevealOnView } from "@/lib/reveal";
import type { ImageSettings, ImageSize, Reveal } from "@/lib/settings";
import { GRID_THUMB_SIZE, requestThumbnail } from "@/lib/thumbnails";
import { cn } from "@/lib/utils";
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
  root: HTMLElement | null;
  settingsKey: string;
  settings: ImageSettings;
  onOpen: (index: number) => void;
  onTrash: (index: number) => void;
  onChange: (key: string, change: ImageSettings) => void;
}

const SIZE_KEYS: Record<string, ImageSize> = { "1": "small", "2": "medium", "3": "large" };

export const ImageTile = memo(function ImageTile({
  image,
  box,
  reveal,
  order,
  marked = false,
  root,
  settingsKey,
  settings,
  onOpen,
  onTrash,
  onChange,
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

  return (
    <div
      ref={ref}
      data-index={box.index}
      data-reveal={reveal}
      data-shown={shown ? "" : undefined}
      className={cn("group reveal absolute overflow-hidden rounded-sm", reveal === "none" && "bg-muted")}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        transitionDelay: shown ? `${order * 90}ms` : undefined,
        // Outlines are drawn outside the clipped box, so the ring isn't cut off.
        outline: `3px solid ${marked ? "var(--primary)" : "transparent"}`,
        outlineOffset: 3,
      }}
    >
      <button
        className="block size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        onClick={() => onOpen(box.index)}
        onKeyDown={(e) => {
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            onTrash(box.index);
          } else if (SIZE_KEYS[e.key]) {
            e.preventDefault();
            onChange(settingsKey, { size: SIZE_KEYS[e.key] });
          }
        }}
        aria-label={image.name}
        title={`${image.name}\n1, 2, 3: liten, mellan, stor`}
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pt-6 pb-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        {image.name}
      </div>
      <ImageMenu
        name={image.name}
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
    </div>
  );
});
