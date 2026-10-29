import { Check, Heart, Images, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Series } from "@/lib/library";
import { cn } from "@/lib/utils";

/** Drop target id of Favoriter; series use their own id. */
export const FAVORITES_TARGET = "favorites";

interface CollectionsPanelProps {
  series: Series[];
  /** Whether the image shown is in Favoriter. */
  favorite: boolean;
  /** Whether the image shown is in the series. */
  inSeries: (id: string) => boolean;
  onToggleFavorite: () => void;
  onToggleSeries: (id: string) => void;
  /** The collection the image is being dragged over. */
  over: string | null;
  /** The collection the image was just dropped in, shown for a moment. */
  added: string | null;
  /** Only the icons, until the mouse comes over it. */
  compact: boolean;
  /** Stays open beside the picture instead of folding in when the mouse leaves. */
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}

/** Favoriter and the series beside the picture in full screen, to click or drop the picture on. */
export function CollectionsPanel({
  series,
  favorite,
  inSeries,
  onToggleFavorite,
  onToggleSeries,
  over,
  added,
  compact,
  pinned,
  onPinnedChange,
  className,
  style,
}: CollectionsPanelProps) {
  return (
    <nav
      aria-label="Samlingar"
      className={cn(
        "flex flex-col overflow-hidden border-r border-current/15 text-sm transition-[width] duration-150 ease-out",
        compact ? "w-12" : "w-56",
        className,
      )}
      style={style}
    >
      <div className={cn("flex h-10 shrink-0 items-center gap-1 pt-1.5", compact ? "justify-center" : "px-2")}>
        <button
          type="button"
          onClick={() => onPinnedChange(!pinned)}
          aria-pressed={pinned}
          title={pinned ? "Fäll in sidomenyn (C)" : "Håll sidomenyn utfälld (C)"}
          aria-label={pinned ? "Fäll in sidomenyn" : "Håll sidomenyn utfälld"}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md text-current/70 hover:bg-current/15 hover:text-current focus-visible:bg-current/15 focus-visible:outline-none",
            pinned && "text-current",
          )}
        >
          {pinned ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
        {!compact && <span className="truncate text-xs font-medium text-current/60">Samlingar</span>}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto", compact ? "px-1.5" : "px-2")}>
        <Row
          compact={compact}
          target={FAVORITES_TARGET}
          icon={<Heart className={cn("size-4", favorite && "fill-current")} />}
          name="Favoriter"
          member={favorite}
          over={over === FAVORITES_TARGET}
          added={added === FAVORITES_TARGET}
          onClick={onToggleFavorite}
        />
        {series.length > 0 &&
          (compact ? (
            <div className="mx-auto my-2 h-px w-6 bg-current/20" aria-hidden />
          ) : (
            <div className="px-2 pt-3 pb-1.5 text-xs font-medium text-current/60">Serier</div>
          ))}
        {series.map((s) => (
          <Row
            key={s.id}
            compact={compact}
            target={s.id}
            icon={
              compact ? (
                <span className="flex size-6 items-center justify-center rounded-md bg-current/15 text-xs font-semibold">
                  {s.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
              ) : (
                <Images className="size-4" />
              )
            }
            name={s.name}
            count={s.images.length}
            member={inSeries(s.id)}
            over={over === s.id}
            added={added === s.id}
            onClick={() => onToggleSeries(s.id)}
          />
        ))}
      </div>
      {!compact && (
        <p className="w-56 px-4 py-3 text-[11px] text-current/50">
          Dra bilden hit för att lägga den i en samling, eller klicka för att lägga till eller ta bort den.
        </p>
      )}
    </nav>
  );
}

function Row({
  compact,
  target,
  icon,
  name,
  count,
  member,
  over,
  added,
  onClick,
}: {
  compact: boolean;
  target: string;
  icon: React.ReactNode;
  name: string;
  count?: number;
  member: boolean;
  over: boolean;
  added: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-collection={target}
      aria-pressed={member}
      onClick={onClick}
      title={member ? `Ta bort bilden ur ${name}` : `Lägg bilden i ${name}`}
      aria-label={name}
      className={cn(
        "relative flex w-full items-center gap-2 rounded-md py-1.5 text-left transition-colors hover:bg-current/10 focus-visible:bg-current/10 focus-visible:outline-none",
        compact ? "h-9 justify-center px-0" : "px-2",
        over && "bg-current/20 ring-2 ring-current/60",
        added && "bg-current/20",
      )}
    >
      <span className="shrink-0 text-current/80">{icon}</span>
      {compact ? (
        member && (
          <span className="absolute right-0.5 bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-current">
            <Check className="size-2.5 text-[var(--viewer-bg)]" strokeWidth={3} aria-label="Bilden finns här" />
          </span>
        )
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{name}</span>
      {member ? (
        <Check className="size-4 shrink-0" aria-label="Bilden finns här" />
      ) : (
        count !== undefined && <span className="shrink-0 text-xs text-current/50">{count}</span>
      )}
        </>
      )}
    </button>
  );
}
