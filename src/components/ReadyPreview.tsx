import { WandSparkles, X } from "lucide-react";

/** An enlarged picture that finished while the user was looking at something else. */
export interface ReadyPicture {
  /** The new file, beside the original. */
  path: string;
  name: string;
  /** A thumbnail to show; null when it could not be made. */
  url: string | null;
}

/**
 * The enlarged picture, whole, in the upper right corner below the toolbar, so finishing an
 * enlargement never pulls the user away from where they are. Big enough to judge: beside a
 * portrait picture it fits in the free space, over a landscape one that fills the screen it
 * sits inset on top. Clicking it opens the enlarged picture; the X lets it go.
 */
export function ReadyPreview({
  ready,
  onOpen,
  onDismiss,
}: {
  ready: ReadyPicture;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="group fixed top-16 right-4 z-[60] w-[clamp(200px,22vw,360px)] overflow-hidden rounded-lg border bg-popover/80 text-popover-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-popover">
      <button
        onClick={onOpen}
        title={`Visa ${ready.name}`}
        className="block w-full text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {ready.url ? (
          <img src={ready.url} alt="" draggable={false} className="block max-h-[55vh] w-full bg-black/20 object-contain" />
        ) : (
          <div className="flex h-32 items-center justify-center bg-muted">
            <WandSparkles className="size-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs">
          <WandSparkles className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">Förstorad: {ready.name}</span>
        </div>
      </button>
      <button
        onClick={onDismiss}
        title="Stäng"
        aria-label="Stäng"
        className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
