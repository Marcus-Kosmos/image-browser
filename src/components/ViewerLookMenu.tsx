import { useEffect, useRef, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VIEWER_TRANSITIONS, VIEWER_TRANSITION_LABELS, type ViewerSettings } from "@/lib/viewer";
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
        title="Visning: övergång, ram och bakgrund"
        aria-label="Visning"
      >
        <SlidersHorizontal />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Visning i helskärm"
          className="absolute top-10 right-0 z-50 w-64 rounded-lg border border-white/15 bg-zinc-900/95 p-1.5 text-sm text-white shadow-xl backdrop-blur"
        >
          <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-white/60">Övergång mellan bilder</div>
          <div role="radiogroup" aria-label="Övergång" className="flex flex-col">
            {VIEWER_TRANSITIONS.map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={settings.transition === t}
                onClick={() => onChange({ transition: t })}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
              >
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", settings.transition === t ? "bg-white" : "bg-transparent")}
                  aria-hidden
                />
                {VIEWER_TRANSITION_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-white/10" />
          <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-white/60">Som i kartan</div>
          <Toggle
            checked={settings.frame}
            onChange={(frame) => onChange({ frame })}
            label="Visa ram och skugga"
          />
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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
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
