import { useEffect, useRef, useState } from "react";
import { Check, FolderPlus, Plus } from "lucide-react";
import type { Series } from "@/lib/library";
import { cn } from "@/lib/utils";
import { useCloseOnLeaveAfterChoice } from "@/lib/menu";

interface SeriesPickerProps {
  path: string;
  series: Series[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
  onCreate: (name: string) => void;
  defaultName: string;
}

/** Adds the image shown in full screen to a series, or takes it out, without leaving the viewer. */
export function SeriesPicker({ path, series, open, onOpenChange, onToggle, onCreate, defaultName }: SeriesPickerProps) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const count = series.filter((s) => s.images.some((img) => img.path === path)).length;

  const close = () => {
    onOpenChange(false);
    trigger.current?.focus();
  };

  useCloseOnLeaveAfterChoice(root, open, close);

  useEffect(() => {
    if (!open) {
      setNaming(null);
      return;
    }
    root.current?.querySelector<HTMLElement>("[role='menuitemcheckbox'], [data-new]")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const create = () => {
    const name = naming?.trim();
    if (!name) return;
    onCreate(name);
    close();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Lägg till i serie (S)"
        aria-label={count > 0 ? `Lägg till i serie, finns i ${count}` : "Lägg till i serie"}
        className={cn(
          "relative flex size-8 items-center justify-center rounded-md text-current/80 hover:bg-current/15 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current [&_svg]:size-4",
          open && "bg-current/15 text-current",
        )}
      >
        <FolderPlus />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Serier"
          className="absolute bottom-11 left-1/2 z-10 w-64 -translate-x-1/2 rounded-lg border border-white/15 bg-zinc-900/95 p-1.5 text-sm text-white shadow-xl backdrop-blur"
        >
          <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-white/60">Lägg till i serie</div>
          <div className="flex max-h-[50vh] flex-col overflow-y-auto">
            {series.map((s, i) => {
              const included = s.images.some((img) => img.path === path);
              return (
                <button
                  key={s.id}
                  role="menuitemcheckbox"
                  aria-checked={included}
                  onClick={() => onToggle(s.id)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-white/50",
                      included && "border-white bg-white text-black",
                    )}
                    aria-hidden
                  >
                    {included && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {i < 9 && (
                    <kbd className="rounded border border-white/20 px-1 font-sans text-[10px] text-white/60">{i + 1}</kbd>
                  )}
                </button>
              );
            })}
          </div>
          {series.length > 0 && <div className="my-1 h-px bg-white/10" />}
          {naming === null ? (
            <button
              data-new
              onClick={() => setNaming(defaultName)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
            >
              <Plus className="size-3.5 shrink-0" aria-hidden />
              Ny serie med bilden…
            </button>
          ) : (
            <form
              className="flex items-center gap-1.5 px-1 py-1"
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <label className="sr-only" htmlFor="new-series-name">
                Namn på den nya serien
              </label>
              <input
                id="new-series-name"
                autoFocus
                value={naming}
                onChange={(e) => setNaming(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="h-8 min-w-0 flex-1 rounded-md border border-white/20 bg-black/40 px-2 text-sm text-white outline-none focus:border-white/60"
              />
              <button
                type="submit"
                disabled={!naming.trim()}
                className="h-8 rounded-md bg-white px-2.5 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-40"
              >
                Skapa
              </button>
            </form>
          )}
          {series.length > 0 && (
            <p className="px-2 pt-1 pb-0.5 text-[11px] text-white/50">Siffertangenterna lägger till direkt, även när menyn är stängd.</p>
          )}
        </div>
      )}
    </div>
  );
}
