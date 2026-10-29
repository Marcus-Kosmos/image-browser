import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Heading as HeadingIcon, SlidersHorizontal } from "lucide-react";
import type { HeadingKind } from "./HeadingDialog";
import type { Series } from "@/lib/library";
import { cn } from "@/lib/utils";
import {
  REVEAL_LABELS,
  SIZE_LABELS,
  type ImageSettings,
  type ImageSize,
  type Reveal,
} from "@/lib/settings";
import { useCloseOnLeaveAfterChoice } from "@/lib/menu";

interface ImageMenuProps {
  name: string;
  path: string;
  series: Series[];
  onToggleSeries: (id: string) => void;
  onEditHeading: (kind: HeadingKind) => void;
  settings: ImageSettings;
  onChange: (change: ImageSettings) => void;
  onOpenChange: (open: boolean) => void;
}

const SIZES: ImageSize[] = ["small", "medium", "large"];
const REVEALS: Reveal[] = ["none", "fade", "slide-left", "slide-right", "rise", "cascade", "parallax"];

/** Per-image settings: size in the layout and the effect it appears with. */
export function ImageMenu({ name, path, series, onToggleSeries, onEditHeading, settings, onChange, onOpenChange }: ImageMenuProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos !== null;

  const close = () => {
    setPos(null);
    onOpenChange(false);
    trigger.current?.focus();
  };

  const toggle = () => {
    if (open) return close();
    const rect = trigger.current!.getBoundingClientRect();
    const width = 240;
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
    onOpenChange(true);
  };

  // Keep the whole panel inside the window once its height is known.
  useLayoutEffect(() => {
    if (!pos || !panel.current) return;
    const height = panel.current.offsetHeight;
    const top = Math.max(8, Math.min(pos.top, window.innerHeight - height - 8));
    if (top !== pos.top) setPos({ ...pos, top });
  }, [pos]);

  useCloseOnLeaveAfterChoice(panel, open, close);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button[aria-pressed='true']")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close();
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

  const size = settings.size ?? "medium";

  return (
    <>
      <button
        ref={trigger}
        onClick={toggle}
        className={cn(
          "absolute top-1.5 left-1.5 flex size-7 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
          open && "opacity-100",
        )}
        title="Bildinställningar"
        aria-label={`Inställningar för ${name}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="size-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={`Inställningar för ${name}`}
            className="fixed z-50 max-h-[calc(100vh-16px)] w-60 overflow-y-auto rounded-lg border bg-popover p-3 text-sm text-foreground shadow-lg"
            style={pos}
          >
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Storlek</div>
            <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
              {SIZES.map((s) => (
                <button
                  key={s}
                  aria-pressed={size === s}
                  onClick={() => onChange({ size: s })}
                  className={cn(
                    "rounded-sm px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    size === s ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {SIZE_LABELS[s]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {size === "large"
                ? "Stor bild tar två rader, med andra bilder bredvid."
                : size === "small"
                  ? "Två små bilder i följd staplas på varandra."
                  : "Tangenter 1, 2, 3 byter storlek på markerad bild."}
            </p>
            <div className="mt-3 mb-1.5 text-xs font-medium text-muted-foreground">Effekt</div>
            <div className="flex flex-col">
              <MenuOption
                selected={settings.reveal === undefined}
                onClick={() => onChange({ reveal: undefined })}
                label="Samma som sidan"
              />
              {REVEALS.map((r) => (
                <MenuOption
                  key={r}
                  selected={settings.reveal === r}
                  onClick={() => onChange({ reveal: r })}
                  label={REVEAL_LABELS[r]}
                />
              ))}
            </div>
            <div className="mt-3 mb-1.5 text-xs font-medium text-muted-foreground">Rubriker</div>
            <div className="flex flex-col">
              {(["image", "page"] as const).map((kind) => {
                const current = kind === "image" ? settings.heading : settings.pageHeading;
                return (
                  <button
                    key={kind}
                    onClick={() => {
                      close();
                      onEditHeading(kind);
                    }}
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <HeadingIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">
                      {kind === "image"
                        ? current ? `Rubrik: ${current.text}` : "Rubrik ovanför bilden…"
                        : current ? `Sidrubrik: ${current.text}` : "Ny sida med rubrik…"}
                    </span>
                  </button>
                );
              })}
            </div>
            {series.length > 0 && (
              <>
                <div className="mt-3 mb-1.5 text-xs font-medium text-muted-foreground">Serier</div>
                <div className="flex max-h-40 flex-col overflow-y-auto">
                  {series.map((s) => {
                    const included = s.images.some((img) => img.path === path);
                    return (
                      <button
                        key={s.id}
                        role="menuitemcheckbox"
                        aria-checked={included}
                        onClick={() => onToggleSeries(s.id)}
                        className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          className={cn(
                            "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                            included && "border-foreground bg-foreground text-background",
                          )}
                          aria-hidden
                        >
                          {included && <Check className="size-3" strokeWidth={3} />}
                        </span>
                        <span className="truncate">{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function MenuOption({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      aria-pressed={selected}
      onClick={onClick}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", selected ? "bg-foreground" : "bg-transparent")}
        aria-hidden
      />
      {label}
    </button>
  );
}
