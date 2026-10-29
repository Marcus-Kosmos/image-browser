import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Palette, Pipette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ColorPicker";
import {
  FRAME_LABELS,
  SHADOW_LABELS,
  type Frame,
  type FolderSettings,
  type Shadow,
} from "@/lib/settings";
import { prefersDarkText, themesFromColors, type ColorTheme } from "@/lib/theme";
import { sampleColors, type ImageEntry } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCloseOnLeaveAfterChoice } from "@/lib/menu";

interface AppearanceMenuProps {
  settings: FolderSettings;
  onChange: (change: Partial<FolderSettings>) => void;
  /** App-wide, unlike the rest of the menu. */
  askBeforeTrash: boolean;
  onAskBeforeTrashChange: (ask: boolean) => void;
  /** App-wide too: a mark on pictures made or changed by AI. */
  showAiMark: boolean;
  onShowAiMarkChange: (show: boolean) => void;
  /** The pictures shown, which a color theme can be taken from. */
  pictures: ImageEntry[];
}

/** Pictures a theme is taken from at most, spread over the whole set. */
const THEME_SAMPLE = 40;

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
  pictures,
}: AppearanceMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useCloseOnLeaveAfterChoice(root, open, () => setOpen(false));

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

  // Themes taken from the pictures' own colors, worked out when asked for.
  const [themes, setThemes] = useState<ColorTheme[] | "working" | null>(null);
  // Each time it is asked again, other pictures are looked at and their hues paired anew.
  const round = useRef(0);
  useEffect(() => {
    setThemes(null);
    round.current = 0;
  }, [pictures]);
  const findThemes = async () => {
    const again = Array.isArray(themes);
    setThemes("working");
    const step = Math.max(1, pictures.length / THEME_SAMPLE);
    const offset = again ? Math.random() * step : 0;
    const sample = Array.from(
      { length: Math.min(THEME_SAMPLE, pictures.length) },
      (_, i) => pictures[Math.min(pictures.length - 1, Math.floor(i * step + offset))],
    );
    if (again) round.current += 1;
    setThemes(themesFromColors(await sampleColors(sample).catch(() => []), round.current));
  };
  // A plain background brings back text and buttons in its own colors.
  const pickBackground = (background: string | undefined) => onChange({ background, text: undefined, accent: undefined });
  const fromPictures = !!settings.text || !!settings.accent;

  const custom = settings.background && !fromPictures && !SWATCHES.some((s) => s.color === settings.background);

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
              onClick={() => pickBackground(undefined)}
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
                aria-checked={settings.background === s.color && !fromPictures}
                onClick={() => pickBackground(s.color)}
                title={s.name}
                aria-label={s.name}
                className="relative size-9 rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                style={{ background: s.color }}
              >
                {settings.background === s.color && !fromPictures && <CheckMark dark={prefersDarkText(s.color)} />}
              </button>
            ))}
            <ColorPicker
              value={settings.background}
              custom={!!custom}
              onChange={pickBackground}
              className="size-9 rounded-md"
            >
              {custom && <CheckMark dark={prefersDarkText(settings.background!)} />}
            </ColorPicker>
          </div>

          <button
            onClick={findThemes}
            disabled={pictures.length === 0 || themes === "working"}
            title={
              Array.isArray(themes)
                ? "Sex nya förslag ur bildernas färger"
                : "Ta fram färger ur bilderna som visas: bakgrund, text och knappar i deras vanligaste färger"
            }
            className="mt-2 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {themes === "working" ? <LoaderCircle className="size-4 animate-spin" /> : <Pipette className="size-4" />}
            {Array.isArray(themes) && themes.length > 0 ? "Andra färger från bilderna" : "Färger från bilderna"}
          </button>
          {Array.isArray(themes) &&
            (themes.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">Bilderna kunde inte läsas.</p>
            ) : (
              <div role="radiogroup" aria-label="Färger från bilderna" className="mt-1 grid grid-cols-6 gap-1.5">
                {themes.map((t) => {
                  const chosen =
                    settings.background === t.background && settings.text === t.text && settings.accent === t.accent;
                  return (
                    <button
                      key={t.background + t.text + t.accent}
                      role="radio"
                      aria-checked={chosen}
                      onClick={() => onChange(t)}
                      title="Bakgrund, text och knappar i bildernas färger"
                      aria-label="Färgtema från bilderna"
                      className={cn(
                        "relative flex size-9 flex-col items-center justify-center gap-0.5 rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        chosen && "ring-2 ring-foreground",
                      )}
                      style={{ background: t.background }}
                    >
                      <span className="text-[11px] leading-none font-semibold" style={{ color: t.text }}>
                        Aa
                      </span>
                      <span className="h-1 w-4 rounded-full" style={{ background: t.accent }} />
                    </button>
                  );
                })}
              </div>
            ))}

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
