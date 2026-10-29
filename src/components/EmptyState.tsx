import { FolderOpen, FolderTree, GalleryHorizontalEnd, Heart, ImageOff, ImagePlus, RefreshCw, SearchX } from "lucide-react";
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
    text: "Har du lagt till bilder nyss? Prova Läs in igen. Annars öppna en annan mapp eller välj en undermapp ovan.",
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
    text: "Välj bilder att lägga här, eller dra dem hit från Finder.",
  },
};

export function EmptyState({
  kind,
  onOpenFolder,
  onOpenImages,
  onClearFilter,
  onRefresh,
  onShowSubfolders,
  onAddToSeries,
}: {
  kind: EmptyKind;
  onOpenFolder: () => void;
  onOpenImages: () => void;
  onClearFilter?: () => void;
  onRefresh?: () => void;
  /** Set when the folder has subfolders whose images are not shown. */
  onShowSubfolders?: () => void;
  /** Picks pictures to put in the empty series shown. */
  onAddToSeries?: () => void;
}) {
  const { icon: Icon, title } = CONTENT[kind];
  const text =
    kind === "empty-folder" && onShowSubfolders
      ? "Bilderna kanske ligger i undermapparna. Visa dem här, eller välj en undermapp ovan."
      : CONTENT[kind].text;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <h1 className="text-base font-semibold">{title}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
      </div>
      {kind === "no-folder" && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onOpenFolder}>
            <FolderOpen />
            Öppna mapp
          </Button>
          <Button variant="outline" onClick={onOpenImages} title="Se bilderna som miniatyrer först">
            <ImagePlus />
            Välj bland bilderna
          </Button>
        </div>
      )}
      {kind === "empty-folder" && (
        <div className="flex flex-wrap justify-center gap-2">
          {onShowSubfolders && (
            <Button onClick={onShowSubfolders}>
              <FolderTree />
              Visa bilder i undermappar
            </Button>
          )}
          {onRefresh && (
            <Button variant={onShowSubfolders ? "outline" : "default"} onClick={onRefresh}>
              <RefreshCw />
              Läs in igen
            </Button>
          )}
          <Button variant="outline" onClick={onOpenFolder}>
            <FolderOpen />
            Öppna en annan mapp
          </Button>
        </div>
      )}
      {kind === "series" && onAddToSeries && (
        <Button onClick={onAddToSeries}>
          <ImagePlus />
          Lägg till bilder
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
