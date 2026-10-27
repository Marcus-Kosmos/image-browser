import { useState } from "react";
import { GalleryHorizontalEnd, Plus } from "lucide-react";
import type { Series } from "@/lib/library";

interface SeriesMenuListProps {
  series: Series[];
  onPick: (id: string) => void;
  /** Makes a new series, named by the user, with the images. */
  onCreate: (name: string) => void;
  defaultName: string;
}

/** Menu items for putting images in one of the series, or in a new one. */
export function SeriesMenuList({ series, onPick, onCreate, defaultName }: SeriesMenuListProps) {
  const [naming, setNaming] = useState<string | null>(null);
  const item =
    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0";

  return (
    <>
      <div className="flex max-h-64 flex-col overflow-y-auto">
        {series.map((s) => (
          <button key={s.id} role="menuitem" onClick={() => onPick(s.id)} className={item}>
            <GalleryHorizontalEnd className="text-muted-foreground" />
            <span className="truncate">{s.name}</span>
          </button>
        ))}
      </div>
      {series.length > 0 && <div className="my-1 h-px bg-border" role="separator" />}
      {naming === null ? (
        <button role="menuitem" onClick={() => setNaming(defaultName)} className={item}>
          <Plus />
          Ny serie…
        </button>
      ) : (
        <form
          className="flex items-center gap-1.5 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (naming.trim()) onCreate(naming.trim());
          }}
        >
          <label className="sr-only" htmlFor="series-menu-name">
            Namn på den nya serien
          </label>
          <input
            id="series-menu-name"
            autoFocus
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={!naming.trim()}
            className="h-8 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Skapa
          </button>
        </form>
      )}
    </>
  );
}
