import { ImageDown } from "lucide-react";

/** Shown while files are dragged over the window from Finder: says what letting go will do. */
export function DropOverlay({ into }: { into: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-background/60 p-6 backdrop-blur-sm">
      <div className="flex size-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/60 text-center">
        <ImageDown className="size-10 text-primary" aria-hidden />
        <div className="text-lg font-medium">{into ? `Släpp för att lägga i ${into}` : "Släpp för att visa"}</div>
        <div className="max-w-sm text-sm text-muted-foreground">
          {into
            ? "Bilderna läggs till i serien. Filerna ligger kvar där de är."
            : "Bildens mapp öppnas och bilden visas i helskärm. En mapp öppnas som den är."}
        </div>
      </div>
    </div>
  );
}
