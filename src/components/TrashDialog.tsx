import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ImageEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TrashDialogProps {
  image: ImageEntry | null;
  onCancel: () => void;
  /** `dontAsk` is true when the user chose to trash without this question from now on. */
  onConfirm: (dontAsk: boolean) => void;
}

export function TrashDialog({ image, onCancel, onConfirm }: TrashDialogProps) {
  const [dontAsk, setDontAsk] = useState(false);
  useEffect(() => {
    if (image) setDontAsk(false);
  }, [image]);

  return (
    <Dialog open={image !== null} onClose={onCancel} labelledBy="trash-title">
      <h2 id="trash-title" className="text-lg font-semibold">
        Flytta till papperskorgen?
      </h2>
      <p className="mt-2 text-sm break-all text-muted-foreground">
        <span className="font-medium text-foreground">{image?.name}</span> flyttas till papperskorgen. Du kan
        lägga tillbaka den från papperskorgen i Finder.
      </p>
      <button
        role="checkbox"
        aria-checked={dontAsk}
        onClick={() => setDontAsk(!dontAsk)}
        className="mt-4 flex items-center gap-2 rounded-sm text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-[3px] border",
            dontAsk && "border-foreground bg-foreground text-background",
          )}
          aria-hidden
        >
          {dontAsk && <Check className="size-3" strokeWidth={3} />}
        </span>
        Fråga inte igen, släng direkt
      </button>
      {dontAsk && (
        <p className="mt-1 ml-6 text-xs text-muted-foreground">Du kan slå på frågan igen under Utseende.</p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Behåll bilden
        </Button>
        <Button variant="destructive" onClick={() => onConfirm(dontAsk)} data-autofocus>
          <Trash2 />
          Flytta till papperskorgen
        </Button>
      </div>
    </Dialog>
  );
}
