import { useEffect, useRef, useState } from "react";
import { Check, ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DATE_RANGE_LABELS, NO_FILTER, type DateRange, type ImageFilter, type Tag } from "@/lib/filter";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  filter: ImageFilter;
  onChange: (filter: ImageFilter) => void;
  /** Tags there are to filter on: Favoriter and the (listed) series. */
  tags: Tag[];
}

const RANGES = Object.keys(DATE_RANGE_LABELS) as DateRange[];

/** Search by name or tag, and a menu to filter on tags and dates. */
export function FilterBar({ filter, onChange, tags }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const active =
    filter.tags.length + (filter.since !== "all" ? 1 : 0) + (filter.newestFirst ? 1 : 0) + (filter.duplicates ? 1 : 0);

  // ⌘F jumps to the search field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role=menuitemcheckbox], [role=menuitemradio]")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const toggleTag = (key: string) =>
    onChange({ ...filter, tags: filter.tags.includes(key) ? filter.tags.filter((t) => t !== key) : [...filter.tags, key] });

  return (
    <div ref={root} className="relative flex items-center gap-1">
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Sök på namn eller tagg</span>
        <input
          ref={input}
          type="search"
          value={filter.text}
          onChange={(e) => onChange({ ...filter, text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape" && filter.text) {
              e.stopPropagation();
              onChange({ ...filter, text: "" });
            }
          }}
          placeholder="Sök namn, tagg"
          title="Sök på filnamn eller tagg (⌘F)"
          className="h-8 w-40 rounded-md border bg-background pr-7 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {filter.text && (
          <button
            onClick={() => onChange({ ...filter, text: "" })}
            className="absolute right-1.5 flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
            aria-label="Rensa sökningen"
            title="Rensa sökningen"
          >
            <X className="size-3.5" />
          </button>
        )}
      </label>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon-sm"
        className={cn("relative", (open || active > 0) && "bg-accent")}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Filtrera och sortera: taggar, datum, senast ändrad och dubbletter"
        aria-label={active > 0 ? `Filter, ${active} valda` : "Filter"}
      >
        <ListFilter />
        {active > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground tabular-nums">
            {active}
          </span>
        )}
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Filter"
          className="absolute top-10 right-0 z-50 w-64 rounded-lg border bg-popover p-1 text-sm text-foreground shadow-lg"
        >
          <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Taggar</div>
          {tags.length === 0 && (
            <p className="px-2 pb-1 text-xs text-muted-foreground">Lägg bilder i Favoriter eller en serie så blir de taggar.</p>
          )}
          <div className="max-h-56 overflow-y-auto">
            {tags.map((t) => (
              <Option key={t.key} role="menuitemcheckbox" checked={filter.tags.includes(t.key)} onClick={() => toggleTag(t.key)}>
                {t.name}
              </Option>
            ))}
          </div>
          <div className="my-1 h-px bg-border" role="separator" />
          <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Tillagd</div>
          {RANGES.map((r) => (
            <Option key={r} role="menuitemradio" checked={filter.since === r} onClick={() => onChange({ ...filter, since: r })}>
              {DATE_RANGE_LABELS[r]}
            </Option>
          ))}
          <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
            När bilden lades i Favoriter eller en serie, annars filens datum.
          </p>
          <div className="my-1 h-px bg-border" role="separator" />
          <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Ordning</div>
          <Option
            role="menuitemradio"
            checked={!filter.newestFirst}
            onClick={() => onChange({ ...filter, newestFirst: false })}
          >
            Mappens eller seriens ordning
          </Option>
          <Option role="menuitemradio" checked={filter.newestFirst} onClick={() => onChange({ ...filter, newestFirst: true })}>
            Senast ändrad först
          </Option>
          <div className="my-1 h-px bg-border" role="separator" />
          <Option
            role="menuitemcheckbox"
            checked={filter.duplicates}
            onClick={() => onChange({ ...filter, duplicates: !filter.duplicates })}
          >
            Visa bara dubbletter
          </Option>
          <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
            Bilder med exakt samma innehåll, sida vid sida. Slå på undermappar för att jämföra dem också.
          </p>
          {active > 0 && (
            <>
              <div className="my-1 h-px bg-border" role="separator" />
              <button
                role="menuitem"
                onClick={() => onChange({ ...NO_FILTER, text: filter.text })}
                className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                Rensa filtret
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Option({
  role,
  checked,
  onClick,
  children,
}: {
  role: "menuitemcheckbox" | "menuitemradio";
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role={role}
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      <span className="flex size-4 shrink-0 items-center justify-center">{checked && <Check className="size-4" />}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}
