import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog } from "@/components/ui/dialog";
import { listFonts } from "@/lib/api";
import type { Heading, HeadingLevel } from "@/lib/settings";
import { prefersDarkText } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { HeadingText } from "./HeadingText";

export type HeadingKind = "image" | "page";

interface HeadingDialogProps {
  /** Which heading is edited; null closes the dialog. */
  kind: HeadingKind | null;
  imageName: string;
  heading: Heading | undefined;
  onSave: (heading: Heading | undefined) => void;
  onClose: () => void;
}

export const HEADING_COLORS = ["#ffffff", "#18181b", "#8a8a88", "#b91c1c", "#c2410c", "#a16207", "#15803d", "#1d4ed8", "#7e22ce"];
const LEVELS: HeadingLevel[] = [1, 2, 3];
const STYLE_KEY = "image-browser:last-heading-style";

/** Color, font and size of the last saved heading, so a series of headings is quick to make alike. */
export function lastStyle(): Partial<Heading> {
  try {
    return JSON.parse(localStorage.getItem(STYLE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberStyle(heading: Heading) {
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify({ color: heading.color, font: heading.font, size: heading.size }));
  } catch {
    // Remembering the style is a convenience.
  }
}

export function HeadingDialog({ kind, imageName, heading, onSave, onClose }: HeadingDialogProps) {
  const [draft, setDraft] = useState<Heading>({ text: "", level: 2 });
  const [fonts, setFonts] = useState<string[]>([]);

  useEffect(() => {
    if (!kind) return;
    setDraft(heading ?? { text: "", level: kind === "page" ? 1 : 3, ...lastStyle(), size: undefined });
    void listFonts().then(setFonts);
  }, [kind, heading]);

  const save = () => {
    const text = draft.text.trim();
    if (!text) return onSave(undefined);
    rememberStyle(draft);
    onSave({ ...draft, text });
  };

  const update = (change: Partial<Heading>) => setDraft((d) => ({ ...d, ...change }));
  const custom = draft.color && !HEADING_COLORS.includes(draft.color);

  return (
    <Dialog open={kind !== null} onClose={onClose} labelledBy="heading-title" className="max-w-lg">
      <h2 id="heading-title" className="text-lg font-semibold">
        {kind === "page" ? "Sidrubrik" : "Rubrik ovanför bilden"}
      </h2>
      <p className="mt-1 text-sm break-words text-muted-foreground">
        {kind === "page"
          ? `Rubriken får en egen rad, och ${imageName} börjar en ny sida under den.`
          : `Rubriken visas på en rad ovanför ${imageName}.`}
      </p>

      <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="heading-text">
        Text
      </label>
      <input
        id="heading-text"
        data-autofocus
        value={draft.text}
        onChange={(e) => update({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Otherwise the key press goes on to the button that gets focus when the dialog closes.
            e.preventDefault();
            save();
          }
        }}
        placeholder={kind === "page" ? "Till exempel Sommaren 2025" : "Till exempel Morgon vid sjön"}
        className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
        <span className="text-xs font-medium text-muted-foreground">Nivå</span>
        <div role="radiogroup" aria-label="Nivå" className="flex w-fit gap-1 rounded-md bg-muted p-1">
          {LEVELS.map((level) => (
            <button
              key={level}
              role="radio"
              aria-checked={draft.level === level}
              onClick={() => update({ level, size: undefined })}
              className={cn(
                "rounded-sm px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                draft.level === level ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              H{level}
            </button>
          ))}
        </div>

        <span className="text-xs font-medium text-muted-foreground">Färg</span>
        <div role="radiogroup" aria-label="Färg" className="flex flex-wrap gap-1.5">
          <button
            role="radio"
            aria-checked={!draft.color}
            onClick={() => update({ color: undefined })}
            title="Samma som texten (anpassas efter bakgrunden)"
            aria-label="Standard"
            className="relative size-7 rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            style={{ background: "linear-gradient(135deg, #f4f4f5 50%, #18181b 50%)" }}
          >
            {!draft.color && <Mark dark={false} />}
          </button>
          {HEADING_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={draft.color === c}
              onClick={() => update({ color: c })}
              aria-label={c}
              className="relative size-7 rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              style={{ background: c }}
            >
              {draft.color === c && <Mark dark={prefersDarkText(c)} />}
            </button>
          ))}
          <label
            title="Valfri färg"
            className="relative size-7 cursor-pointer overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring"
            style={{
              background: custom
                ? draft.color
                : "conic-gradient(#f87171, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171)",
            }}
          >
            <span className="sr-only">Valfri färg</span>
            <input
              type="color"
              value={draft.color ?? "#808080"}
              onChange={(e) => update({ color: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            {custom && <Mark dark={prefersDarkText(draft.color!)} />}
          </label>
        </div>

        <label className="text-xs font-medium text-muted-foreground" htmlFor="heading-font">
          Typsnitt
        </label>
        <NativeSelect
          id="heading-font"
          wrapperClassName="w-full"
          value={draft.font ?? ""}
          onChange={(e) => update({ font: e.target.value || undefined })}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Systemets typsnitt</option>
          {draft.font && !fonts.includes(draft.font) && <option value={draft.font}>{draft.font}</option>}
          {fonts.map((f) => (
            <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
              {f}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="mt-4 rounded-md border px-3" style={{ background: "var(--canvas)" }} aria-hidden>
        <HeadingText
          heading={{ ...draft, text: draft.text || "Förhandsvisning" }}
          height={kind === "page" ? 56 : 36}
          scale={kind === "page" ? 0.5 : 0.55}
        />
      </div>

      <div className="mt-6 flex items-center gap-2">
        {heading && (
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onSave(undefined)}>
            <Trash2 />
            Ta bort rubriken
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="outline" onClick={onClose}>
          Avbryt
        </Button>
        <Button onClick={save}>Spara rubriken</Button>
      </div>
    </Dialog>
  );
}

function Mark({ dark }: { dark: boolean }) {
  return (
    <Check
      className={cn("absolute inset-0 m-auto size-3.5", dark ? "text-zinc-900" : "text-white")}
      strokeWidth={3}
      aria-hidden
    />
  );
}
