import { useEffect, useRef, useState } from "react";
import { Pipette } from "lucide-react";
import { pickColorFromPicture } from "@/lib/eyedropper";
import { cn } from "@/lib/utils";

/** Any color, picked in a small panel of the app's own instead of the system's color window. */
interface ColorPickerProps {
  /** The color chosen, as #rrggbb; none shows the rainbow. */
  value: string | undefined;
  /** Whether the chosen color is one of the swatches' own rather than one picked here. */
  custom: boolean;
  onChange: (color: string) => void;
  /** Where the panel opens: under the button, or over it (in the bar at the screen's bottom). */
  side?: "below" | "above";
  className?: string;
  /** Shown on the button when a color of its own is chosen, such as a check mark. */
  children?: React.ReactNode;
}

const RAINBOW = "conic-gradient(#f87171, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171)";

export function ColorPicker({ value, custom, onChange, side = "below", className, children }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Hue is kept apart, so it is not lost while the color is gray, white or black.
  const [hsv, setHsv] = useState(() => toHsv(value ?? "#808080"));
  useEffect(() => {
    // Only a color chosen elsewhere moves the panel's marks.
    if (!value || value === fromHsv(hsv)) return;
    const next = toHsv(value);
    setHsv((prev) => (next.s === 0 ? { ...next, h: prev.h } : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const [hex, setHex] = useState(value ?? "");
  useEffect(() => setHex(value ?? ""), [value]);
  // While a color is taken from a picture, the panel steps aside and the next click is the pipette's.
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  pickingRef.current = picking;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!pickingRef.current && !root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pickingRef.current) {
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

  const pick = (next: Hsv) => {
    setHsv(next);
    onChange(fromHsv(next));
  };

  const takeFromPicture = async () => {
    setPicking(true);
    const color = await pickColorFromPicture();
    setPicking(false);
    if (!color) return;
    setHsv(toHsv(color));
    onChange(color);
  };

  const area = useRef<HTMLDivElement>(null);
  const fromPointer = (e: React.PointerEvent) => {
    const rect = area.current?.getBoundingClientRect();
    if (!rect) return;
    const s = clamp((e.clientX - rect.left) / rect.width);
    const v = clamp(1 - (e.clientY - rect.top) / rect.height);
    pick({ h: hsv.h, s, v });
  };

  return (
    <div ref={root} className="relative" data-color-picker>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Valfri färg"
        aria-label="Valfri färg"
        aria-expanded={open}
        className={cn(
          "relative flex items-center justify-center overflow-hidden border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
        style={{ background: custom && value ? value : RAINBOW }}
      >
        {children}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Valfri färg"
          className={cn(
            "absolute right-0 z-50 w-52 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg",
            side === "above" ? "bottom-full mb-2" : "top-full mt-2",
            picking && "invisible",
          )}
        >
          <div
            ref={area}
            className="relative h-32 w-full cursor-crosshair touch-none rounded-md"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              fromPointer(e);
            }}
            onPointerMove={(e) => e.buttons === 1 && fromPointer(e)}
          >
            <span
              className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: fromHsv(hsv) }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(hsv.h)}
            onChange={(e) => pick({ ...hsv, h: Number(e.target.value) })}
            aria-label="Färgton"
            className="mt-2 h-3 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow"
            style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="size-6 shrink-0 rounded-md border" style={{ background: fromHsv(hsv) }} />
            <input
              value={hex}
              onChange={(e) => {
                setHex(e.target.value);
                const color = normalHex(e.target.value);
                if (color) {
                  setHsv(toHsv(color));
                  onChange(color);
                }
              }}
              spellCheck={false}
              aria-label="Färgkod"
              placeholder="#336699"
              className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={() => void takeFromPicture()}
              title="Ta en färg från en bild: klicka sedan på bilden (Esc avbryter)"
              aria-label="Ta en färg från en bild"
              className="flex size-7 shrink-0 items-center justify-center rounded-md border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Pipette className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

function normalHex(text: string): string | null {
  const t = text.trim().replace(/^#?/, "#").toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  if (/^#[0-9a-f]{3}$/.test(t)) return `#${[...t.slice(1)].map((c) => c + c).join("")}`;
  return null;
}

export function toHsv(hex: string): Hsv {
  const n = normalHex(hex) ?? "#808080";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function fromHsv({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
}
