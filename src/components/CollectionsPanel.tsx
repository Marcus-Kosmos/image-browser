import { Check, Heart, Images } from "lucide-react";
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
}: CollectionsPanelProps) {
  return (
    <nav aria-label="Samlingar" className="flex w-56 shrink-0 flex-col border-r border-current/15 text-sm">
      <div className="px-4 pt-3 pb-1.5 text-xs font-medium text-current/60">Samlingar</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <Row
          target={FAVORITES_TARGET}
          icon={<Heart className={cn("size-4", favorite && "fill-current")} />}
          name="Favoriter"
          member={favorite}
          over={over === FAVORITES_TARGET}
          added={added === FAVORITES_TARGET}
          onClick={onToggleFavorite}
        />
        {series.length > 0 && <div className="px-2 pt-3 pb-1.5 text-xs font-medium text-current/60">Serier</div>}
        {series.map((s) => (
          <Row
            key={s.id}
            target={s.id}
            icon={<Images className="size-4" />}
            name={s.name}
            count={s.images.length}
            member={inSeries(s.id)}
            over={over === s.id}
            added={added === s.id}
            onClick={() => onToggleSeries(s.id)}
          />
        ))}
      </div>
      <p className="px-4 py-3 text-[11px] text-current/50">
        Dra bilden hit för att lägga den i en samling, eller klicka för att lägga till eller ta bort den.
      </p>
    </nav>
  );
}

function Row({
  target,
  icon,
  name,
  count,
  member,
  over,
  added,
  onClick,
}: {
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
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-current/10 focus-visible:bg-current/10 focus-visible:outline-none",
        over && "bg-current/20 ring-2 ring-current/60",
        added && "bg-current/20",
      )}
    >
      <span className="shrink-0 text-current/80">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {member ? (
        <Check className="size-4 shrink-0" aria-label="Bilden finns här" />
      ) : (
        count !== undefined && <span className="shrink-0 text-xs text-current/50">{count}</span>
      )}
    </button>
  );
}
