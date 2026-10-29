import { useEffect, useRef, useState } from "react";
import { GalleryHorizontalEnd } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "./ViewerLookMenu";
import { cn } from "@/lib/utils";
import { useCloseOnLeaveAfterChoice } from "@/lib/menu";

export interface SavePinnedChoice {
  name: string;
  /** Keep the full screen look: layout of pinned images, corners, transition, frame and color on or off. */
  look: boolean;
  /** Keep the folder's background color, frame and shadow. */
  appearance: boolean;
}

interface SavePinnedMenuProps {
  count: number;
  defaultName: string;
  onSave: (choice: SavePinnedChoice) => void;
}

/** "Spara som serie" in full screen: a name, and whether the look comes along. */
export function SavePinnedMenu({ count, defaultName, onSave }: SavePinnedMenuProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [look, setLook] = useState(true);
  const [appearance, setAppearance] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useCloseOnLeaveAfterChoice(root, open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    input.current?.select();
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
    // Start from the suggested name each time it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    onSave({ name: name.trim() || defaultName, look, appearance });
    setOpen(false);
  };

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
        title="Spara de fästa bilderna, i samma ordning, som en ny serie"
        aria-label="Spara som serie"
      >
        <GalleryHorizontalEnd />
      </Button>
      {open && (
        <form
          role="dialog"
          aria-label="Spara som serie"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="absolute right-0 bottom-11 z-50 w-72 rounded-lg border border-white/15 bg-zinc-900/95 p-2 text-sm text-white shadow-xl backdrop-blur"
        >
          <label className="block px-1 pb-1 text-xs font-medium text-white/60" htmlFor="pinned-series-name">
            Seriens namn ({count === 1 ? "1 bild" : `${count} bilder`})
          </label>
          <input
            ref={input}
            id="pinned-series-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-2 w-full rounded-md border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
          />
          <Toggle checked={look} onChange={setLook} label="Spara visningen: pussel, hörn och övergång" />
          <Toggle checked={appearance} onChange={setAppearance} label="Spara bakgrundsfärg, ram och skugga" />
          <div className="flex justify-end pt-2">
            <Button type="submit" size="sm" className="bg-white text-black hover:bg-white/90">
              Spara serien
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
