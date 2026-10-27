import { ArrowUp, FolderOpen, Images, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { folderName } from "@/lib/utils";

interface ToolbarProps {
  folder: string | null;
  imageCount: number;
  rowHeight: number;
  onRowHeightChange: (value: number) => void;
  onOpenFolder: () => void;
  onParent: (() => void) | null;
  onRefresh: () => void;
}

export const ROW_HEIGHT_MIN = 100;
export const ROW_HEIGHT_MAX = 420;

export function Toolbar({
  folder,
  imageCount,
  rowHeight,
  onRowHeightChange,
  onOpenFolder,
  onParent,
  onRefresh,
}: ToolbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
      <Button variant="outline" size="sm" onClick={onOpenFolder} title="Öppna mapp (⌘O)">
        <FolderOpen />
        Öppna mapp
      </Button>
      {folder && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onParent ?? undefined}
            disabled={!onParent}
            title="Överordnad mapp (⌘↑)"
            aria-label="Överordnad mapp"
          >
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onRefresh} title="Läs in igen (⌘R)" aria-label="Läs in igen">
            <RefreshCw />
          </Button>
          <div className="ml-1 min-w-0" title={folder}>
            <div className="truncate text-sm font-semibold">{folderName(folder)}</div>
            <div className="text-xs text-muted-foreground">
              {imageCount} {imageCount === 1 ? "bild" : "bilder"}
            </div>
          </div>
        </>
      )}
      <div className="flex-1" />
      <label className="flex items-center gap-2 text-muted-foreground" title="Storlek på förhandsvisningar">
        <Images className="size-4" aria-hidden />
        <span className="sr-only">Storlek på förhandsvisningar</span>
        <input
          type="range"
          min={ROW_HEIGHT_MIN}
          max={ROW_HEIGHT_MAX}
          step={10}
          value={rowHeight}
          onChange={(e) => onRowHeightChange(Number(e.target.value))}
          className="w-36 accent-[var(--primary)]"
        />
      </label>
    </header>
  );
}
