import { FolderOpen, GalleryHorizontalEnd, Heart, ImageOff, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export type EmptyKind = "no-folder" | "empty-folder" | "favorites" | "series" | "no-match";

const CONTENT: Record<EmptyKind, { icon: typeof FolderOpen; title: string; text: string }> = {
  "no-folder": {
    icon: FolderOpen,
    title: "Välj en eller flera bildmappar",
    text: "Håll ⌘ för att markera flera mappar. Bilderna visas som förhandsvisningar som passar ihop som ett pussel.",
  },
  "empty-folder": {
    icon: ImageOff,
    title: "Inga bilder i den här mappen",
    text: "Öppna en annan mapp eller välj en undermapp ovan.",
  },
  favorites: {
    icon: Heart,
    title: "Inga favoriter ännu",
    text: "Klicka på hjärtat på en bild, eller tryck F, så samlas den här.",
  },
  "no-match": {
    icon: SearchX,
    title: "Inga bilder matchar",
    text: "Ingen bild här har det namnet, de taggarna eller det datumet.",
  },
  series: {
    icon: GalleryHorizontalEnd,
    title: "Serien är tom",
    text: "Lägg till bilder via bildens inställningar (reglageikonen uppe till vänster på bilden).",
  },
};

export function EmptyState({
  kind,
  onOpenFolder,
  onClearFilter,
}: {
  kind: EmptyKind;
  onOpenFolder: () => void;
  onClearFilter?: () => void;
}) {
  const { icon: Icon, title, text } = CONTENT[kind];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <h1 className="text-base font-semibold">{title}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
      </div>
      {(kind === "no-folder" || kind === "empty-folder") && (
        <Button onClick={onOpenFolder}>
          <FolderOpen />
          Öppna mapp
        </Button>
      )}
      {kind === "no-match" && onClearFilter && (
        <Button variant="outline" onClick={onClearFilter}>
          Rensa sökning och filter
        </Button>
      )}
    </div>
  );
}
