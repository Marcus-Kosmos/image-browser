import { FolderOpen, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({ hasFolder, onOpenFolder }: { hasFolder: boolean; onOpenFolder: () => void }) {
  const Icon = hasFolder ? ImageOff : FolderOpen;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <h1 className="text-base font-semibold">{hasFolder ? "Inga bilder i den här mappen" : "Välj en eller flera bildmappar"}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {hasFolder
            ? "Öppna en annan mapp eller välj en undermapp ovan."
            : "Håll ⌘ för att markera flera mappar. Bilderna visas som förhandsvisningar som passar ihop som ett pussel."}
        </p>
      </div>
      <Button onClick={onOpenFolder}>
        <FolderOpen />
        Öppna mapp
      </Button>
    </div>
  );
}
