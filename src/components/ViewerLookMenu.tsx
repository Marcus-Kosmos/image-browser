import { useEffect, useRef, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  CAPTION_PLACES,
  CAPTION_PLACE_LABELS,
  CAPTION_SIZES,
  CAPTION_SIZE_LABELS,
  PIN_SIZES,
  PIN_SIZE_LABELS,
  SCREEN_FITS,
  SCREEN_FIT_LABELS,
  VIEWER_TRANSITIONS,
  VIEWER_TRANSITION_LABELS,
  type CaptionSize,
  type ViewerSettings,
  type ViewerTransition,
} from "@/lib/viewer";
import { cn } from "@/lib/utils";

interface ViewerLookMenuProps {
  settings: ViewerSettings;
  onChange: (change: Partial<ViewerSettings>) => void;
}

/** Transition, frame and background in full screen, chosen without leaving it. */
export function ViewerLookMenu({ settings, onChange }: ViewerLookMenuProps) {
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

  return (
    <div ref={root} className="relative">
      <Button
        ref={trigger}
        variant="ghost"
        size="icon-sm"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn("text-current/80 hover:bg-current/15 hover:text-current", open && "bg-current/15")}
        onClick={() => setOpen(!open)}
        title="Visning: övergång, zoom, fästa bilder, rubriker, ram, hörn och bakgrund"
        aria-label="Visning"
      >
        <SlidersHorizontal />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Visning i helskärm"
          className="absolute right-0 bottom-11 z-50 max-h-[calc(100vh-8rem)] w-64 overflow-y-auto rounded-lg border border-white/15 bg-zinc-900/95 p-1.5 text-sm text-white shadow-xl backdrop-blur"
        >
          <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-white/60">Övergång mellan bilder</div>
          <div role="radiogroup" aria-label="Övergång" className="flex flex-col">
            {VIEWER_TRANSITIONS.map((t) => (
              <Radio
                key={t}
                checked={settings.transition === t}
                onChange={() => onChange({ transition: t })}
                label={VIEWER_TRANSITION_LABELS[t]}
              />
            ))}
          </div>
          <div className="my-1 h-px bg-white/10" />
          <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-white/60">En bild i taget (H)</div>
          <div role="radiogroup" aria-label="En bild i taget" className="flex flex-col">
            {SCREEN_FITS.map((fit) => (
              <Radio
                key={fit}
                checked={settings.screen === fit}
                onChange={() => onChange({ screen: fit })}
                label={SCREEN_FIT_LABELS[fit]}
              />
            ))}
          </div>
          <div className="my-1 h-px bg-white/10" />
          <Toggle
            checked={settings.keepZoom}
            onChange={(keepZoom) => onChange({ keepZoom })}
            label="Behåll zoom när du bläddrar"
          />
          <Toggle checked={settings.rounded} onChange={(rounded) => onChange({ rounded })} label="Rundade hörn" />
          <Toggle
            checked={settings.dockHides}
            onChange={(dockHides) => onChange({ dockHides })}
            label="Göm knappraden tills musen är vid nederkanten"
          />
          <div className="my-1 h-px bg-white/10" />
          <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-white/60">Fästa bilder (P)</div>
          <div role="radiogroup" aria-label="Fästa bilder" className="flex flex-col">
            {PIN_SIZES.map((size) => (
              <Radio
                key={size}
                checked={settings.pinSize === size}
                onChange={() => onChange({ pinSize: size })}
                label={PIN_SIZE_LABELS[size]}
              />
            ))}
          </div>
          <div className="my-1 h-px bg-white/10" />
          <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-white/60">Rubriker</div>
          <div role="radiogroup" aria-label="Rubriker" className="flex flex-col">
            {CAPTION_PLACES.map((place) => (
              <Radio
                key={place}
                checked={settings.captionPlace === place}
                onChange={() => onChange({ captionPlace: place })}
                label={CAPTION_PLACE_LABELS[place]}
              />
            ))}
          </div>
          {settings.captionPlace !== "off" && (
            <label className="flex items-center gap-2 px-2 py-1.5">
              <span className="w-20 shrink-0 whitespace-nowrap text-white/80">Storlek</span>
              <NativeSelect
                value={settings.captionSize}
                onChange={(e) => onChange({ captionSize: e.target.value as CaptionSize })}
                wrapperClassName="flex-1 text-white"
                className="rounded-md border border-white/20 bg-black/40 px-1.5 py-1 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {CAPTION_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {CAPTION_SIZE_LABELS[size]}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          {settings.captionPlace !== "off" && (
            <label className="flex items-center gap-2 px-2 py-1.5">
              <span className="w-20 shrink-0 whitespace-nowrap text-white/80">Kommer in</span>
              <NativeSelect
                value={settings.captionEffect}
                onChange={(e) => onChange({ captionEffect: e.target.value as ViewerTransition })}
                wrapperClassName="flex-1 text-white"
                className="rounded-md border border-white/20 bg-black/40 px-1.5 py-1 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {VIEWER_TRANSITIONS.map((t) => (
                  <option key={t} value={t}>
                    {VIEWER_TRANSITION_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <div className="my-1 h-px bg-white/10" />
          <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-white/60">Som i kartan</div>
          <Toggle checked={settings.frame} onChange={(frame) => onChange({ frame })} label="Visa ram och skugga" />
          <Toggle
            checked={settings.background}
            onChange={(background) => onChange({ background })}
            label="Visa bakgrundsfärgen"
          />
          <p className="px-2 pt-1 pb-0.5 text-[11px] text-white/50">
            Ram, skugga och färg väljs under Utseende och följer mappen eller serien. Gäller helskärm i alla mappar.
          </p>
        </div>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
    >
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-white/50",
          checked && "border-white bg-white text-black",
        )}
        aria-hidden
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      onClick={onChange}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", checked ? "bg-white" : "bg-transparent")} aria-hidden />
      {label}
    </button>
  );
}
