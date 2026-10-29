import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FRAME_LABELS,
  SHADOW_LABELS,
  type Frame,
  type FolderSettings,
  type Shadow,
} from "@/lib/settings";
import { prefersDarkText } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface AppearanceMenuProps {
  settings: FolderSettings;
  onChange: (change: Partial<FolderSettings>) => void;
  /** App-wide, unlike the rest of the menu. */
  askBeforeTrash: boolean;
  onAskBeforeTrashChange: (ask: boolean) => void;
  /** App-wide too: a mark on pictures made or changed by AI. */
  showAiMark: boolean;
  onShowAiMarkChange: (show: boolean) => void;
}

const SWATCHES: Array<{ color: string; name: string }> = [
  { color: "#ffffff", name: "Vit" },
  { color: "#f4efe6", name: "Papper" },
  { color: "#e4e4e4", name: "Ljusgrå" },
  { color: "#8a8a88", name: "Mellangrå" },
  { color: "#2b2b2b", name: "Kol" },
  { color: "#000000", name: "Svart" },
  { color: "#1e2a3a", name: "Nattblå" },
  { color: "#25322b", name: "Skog" },
  { color: "#5a2a2a", name: "Vinröd" },
];

const FRAMES: Frame[] = ["none", "line", "mat", "black"];
const SHADOWS: Shadow[] = ["none", "drop", "inset"];

/** Background color, frames and shadows for the folder, favorites or series shown. */
export function AppearanceMenu({
  settings,
  onChange,
  askBeforeTrash,
  onAskBeforeTrashChange,
  showAiMark,
  onShowAiMarkChange,
}: AppearanceMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[aria-checked='true']")?.focus();
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

  const custom = settings.background && !SWATCHES.some((s) => s.color === settings.background);

  return (
    <div ref={root} className="relative">
      <Button
        ref={trigger}
        variant="ghost"
        size="icon-sm"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(open && "bg-accent")}
        onClick={() => setOpen(!open)}
        title="Utseende: bakgrund, ramar och skuggor"
        aria-label="Utseende"
      >
        <Palette />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Utseende"
          className="absolute top-10 right-0 z-50 w-72 rounded-lg border bg-popover p-3 text-sm text-foreground shadow-lg"
        >
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Bakgrund</div>
          <div role="radiogroup" aria-label="Bakgrund" className="grid grid-cols-6 gap-1.5">
            <button
              role="radio"
              aria-checked={!settings.background}
              onClick={() => onChange({ background: undefined })}
              title="Standard (följer datorns ljusa eller mörka läge)"
              aria-label="Standard"
              className="relative size-9 overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              style={{ background: "linear-gradient(135deg, #f4f4f5 50%, #18181b 50%)" }}
            >
              {!settings.background && <CheckMark dark={false} />}
            </button>
            {SWATCHES.map((s) => (
              <button
                key={s.color}
                role="radio"
                aria-checked={settings.background === s.color}
                onClick={() => onChange({ background: s.color })}
                title={s.name}
                aria-label={s.name}
                className="relative size-9 rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                style={{ background: s.color }}
              >
                {settings.background === s.color && <CheckMark dark={prefersDarkText(s.color)} />}
              </button>
            ))}
            <label
              title="Valfri färg"
              className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring"
              style={{
                background: custom
                  ? settings.background
                  : "conic-gradient(#f87171, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171)",
              }}
            >
              <span className="sr-only">Valfri färg</span>
              <input
                type="color"
                value={settings.background ?? "#808080"}
                onChange={(e) => onChange({ background: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {custom && <CheckMark dark={prefersDarkText(settings.background!)} />}
            </label>
          </div>

          <div className="mt-3 mb-1.5 text-xs font-medium text-muted-foreground">Ram</div>
          <Segmented
            label="Ram"
            options={FRAMES}
            labels={FRAME_LABELS}
            value={settings.frame}
            onChange={(frame) => onChange({ frame })}
          />

          <div className="mt-3 mb-1.5 text-xs font-medium text-muted-foreground">Skugga</div>
          <Segmented
            label="Skugga"
            options={SHADOWS}
            labels={SHADOW_LABELS}
            value={settings.shadow}
            onChange={(shadow) => onChange({ shadow })}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Gäller mappen, favoriterna eller serien som visas, och sparas för den.
          </p>

          <div className="mt-3 border-t pt-3 mb-1.5 text-xs font-medium text-muted-foreground">Papperskorgen</div>
          <CheckRow checked={askBeforeTrash} onChange={onAskBeforeTrashChange}>
            Fråga innan en bild slängs
          </CheckRow>
          <p className="mt-1 px-2 text-xs text-muted-foreground">
            {askBeforeTrash ? "Gäller alla mappar." : "Ett klick flyttar bilden till papperskorgen. Gäller alla mappar."}
          </p>
          <div className="mt-3 border-t pt-3 mb-1.5 text-xs font-medium text-muted-foreground">AI</div>
          <CheckRow checked={showAiMark} onChange={onShowAiMarkChange}>
            Visa AI-märkning
          </CheckRow>
          <p className="mt-1 px-2 text-xs text-muted-foreground">
            Bilder som gjorts eller förstorats med AI får en märkning. Gäller alla mappar.
          </p>
        </div>
      )}
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
          checked && "border-foreground bg-foreground text-background",
        )}
        aria-hidden
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

function CheckMark({ dark }: { dark: boolean }) {
  return (
    <Check
      className={cn("absolute inset-0 m-auto size-4", dark ? "text-zinc-900" : "text-white")}
      strokeWidth={3}
      aria-hidden
    />
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ label, options, labels, value, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col">
      {options.map((o) => (
        <button
          key={o}
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", value === o ? "bg-foreground" : "bg-transparent")} aria-hidden />
          {labels[o]}
        </button>
      ))}
    </div>
  );
}
