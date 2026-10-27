import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  REVEAL_LABELS,
  SIZE_LABELS,
  type ImageSettings,
  type ImageSize,
  type Reveal,
} from "@/lib/settings";

interface ImageMenuProps {
  name: string;
  settings: ImageSettings;
  onChange: (change: ImageSettings) => void;
  onOpenChange: (open: boolean) => void;
}

const SIZES: ImageSize[] = ["small", "medium", "large"];
const REVEALS: Reveal[] = ["none", "fade", "slide-left", "slide-right"];

/** Per-image settings: size in the layout and the effect it appears with. */
export function ImageMenu({ name, settings, onChange, onOpenChange }: ImageMenuProps) {
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
      top: Math.min(rect.bottom + 6, window.innerHeight - 260),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
    onOpenChange(true);
  };

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
            className="fixed z-50 w-60 rounded-lg border bg-popover p-3 text-sm text-foreground shadow-lg"
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
