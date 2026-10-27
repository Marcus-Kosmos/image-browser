import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ImageEntry } from "@/lib/api";

interface TrashDialogProps {
  image: ImageEntry | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TrashDialog({ image, onCancel, onConfirm }: TrashDialogProps) {
  return (
    <Dialog open={image !== null} onClose={onCancel} labelledBy="trash-title">
      <h2 id="trash-title" className="text-lg font-semibold">
        Flytta till papperskorgen?
      </h2>
      <p className="mt-2 text-sm break-all text-muted-foreground">
        <span className="font-medium text-foreground">{image?.name}</span> flyttas till papperskorgen. Du kan
        lägga tillbaka den från papperskorgen i Finder.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Behåll bilden
        </Button>
        <Button variant="destructive" onClick={onConfirm} data-autofocus>
          <Trash2 />
          Flytta till papperskorgen
        </Button>
      </div>
    </Dialog>
  );
}
