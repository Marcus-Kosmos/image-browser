import { memo, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { ImageEntry } from "@/lib/api";
import type { LayoutBox } from "@/lib/layout";
import { GRID_THUMB_SIZE, requestThumbnail } from "@/lib/thumbnails";

interface ImageTileProps {
  image: ImageEntry;
  box: LayoutBox;
  onOpen: (index: number) => void;
  onTrash: (index: number) => void;
}

export const ImageTile = memo(function ImageTile({ image, box, onOpen, onTrash }: ImageTileProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setUrl(null);
    setLoaded(false);
    return requestThumbnail(image, GRID_THUMB_SIZE, setUrl);
  }, [image]);

  return (
    <div
      className="group absolute overflow-hidden rounded-sm bg-muted"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
    >
      <button
        className="block size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        onClick={() => onOpen(box.index)}
        onKeyDown={(e) => {
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            onTrash(box.index);
          }
        }}
        aria-label={image.name}
        title={image.name}
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
      <button
        onClick={() => onTrash(box.index)}
        className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        title="Flytta till papperskorgen"
        aria-label={`Flytta ${image.name} till papperskorgen`}
        tabIndex={-1}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
});
