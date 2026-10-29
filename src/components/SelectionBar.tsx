import { useEffect, useRef, useState } from "react";
import { ChevronDown, FolderMinus, FolderPlus, ArrowDownToDot, Heart, HeartOff, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Series } from "@/lib/library";
import { cn } from "@/lib/utils";
import { SeriesMenuList } from "./SeriesMenuList";
import { useCloseOnLeaveAfterChoice } from "@/lib/menu";

interface SelectionBarProps {
  count: number;
  series: Series[];
  /** How many of the selected images are favorites already. */
  favoriteCount: number;
  onFavorite: () => void;
  onUnfavorite: () => void;
  onAddToSeries: (id: string) => void;
  onCreateSeries: (name: string) => void;
  /** In a series: takes the selected images out of it; the files stay. */
  onRemoveFromSeries?: () => void;
  newSeriesName: string;
  onSelectAll: () => void;
  allSelected: boolean;
  onClear: () => void;
  /** Shows the selected files in Finder. */
  onReveal: () => void;
  /** Moves the selected files to the trash. */
  onTrash: () => void;
}

/** Shown while images are selected: what can be done with all of them at once. */
export function SelectionBar({
  count,
  series,
  favoriteCount,
  onFavorite,
  onUnfavorite,
  onAddToSeries,
  onCreateSeries,
  onRemoveFromSeries,
  newSeriesName,
  onSelectAll,
  allSelected,
  onClear,
  onReveal,
  onTrash,
}: SelectionBarProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useCloseOnLeaveAfterChoice(menu, open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const done = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div
      role="toolbar"
      aria-label="Markerade bilder"
      className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-popover p-1 pl-3 text-sm text-foreground shadow-lg"
    >
      <span className="mr-1 font-medium whitespace-nowrap tabular-nums">
        {count} {count === 1 ? "markerad" : "markerade"}
      </span>
      {!allSelected && (
        <Button variant="ghost" size="sm" onClick={onSelectAll} title="Markera alla (⌘A)">
          Markera alla
        </Button>
      )}
      <div className="mx-1 h-5 w-px bg-border" aria-hidden />
      {/* A mixed selection offers both, so either can be done in one click. */}
      {favoriteCount < count && (
        <Button variant="ghost" size="sm" onClick={onFavorite} title="Lägg de markerade i Favoriter">
          <Heart />
          Favoriter
        </Button>
      )}
      {favoriteCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onUnfavorite}
          title={
            favoriteCount === count
              ? "Ta bort de markerade från Favoriter"
              : `Ta bort de ${favoriteCount} markerade som är favoriter från Favoriter`
          }
        >
          <HeartOff />
          Ta bort från favoriter
        </Button>
      )}
      <div ref={menu} className="relative">
        <Button
          variant="ghost"
          size="sm"
          className={cn(open && "bg-accent")}
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Lägg de markerade i en serie"
        >
          <FolderPlus />
          Lägg i serie
          <ChevronDown className="text-muted-foreground" />
        </Button>
        {open && (
          <div
            role="menu"
            aria-label="Serier"
            className="absolute right-0 bottom-10 w-60 rounded-lg border bg-popover p-1 shadow-lg"
          >
            <SeriesMenuList
              series={series}
              onPick={(id) => done(() => onAddToSeries(id))}
              onCreate={(name) => done(() => onCreateSeries(name))}
              defaultName={newSeriesName}
            />
          </div>
        )}
      </div>
      {onRemoveFromSeries && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemoveFromSeries}
          title="Ta bort de markerade ur serien. Filerna finns kvar."
        >
          <FolderMinus />
          Ta bort ur serien
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={onReveal} title="Visa i Finder" aria-label="Visa i Finder">
        <ArrowDownToDot />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onTrash}
        title="Flytta de markerade till papperskorgen"
        aria-label="Flytta de markerade till papperskorgen"
        className="hover:text-destructive"
      >
        <Trash2 />
      </Button>
      <div className="mx-1 h-5 w-px bg-border" aria-hidden />
      <Button variant="ghost" size="icon-sm" onClick={onClear} title="Avmarkera (Esc)" aria-label="Avmarkera">
        <X />
      </Button>
    </div>
  );
}
