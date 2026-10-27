import { ArrowUp, FolderOpen, FolderTree, Hash, Images, RectangleHorizontal, RefreshCw, Rows3, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REVEAL_LABELS, type FolderSettings, type Reveal, type ViewMode } from "@/lib/settings";
import { cn, folderName } from "@/lib/utils";

interface ToolbarProps {
  folders: string[];
  imageCount: number;
  rowHeight: number;
  onRowHeightChange: (value: number) => void;
  onOpenFolder: () => void;
  onParent: (() => void) | null;
  onRefresh: () => void;
  includeSubfolders: boolean;
  onToggleSubfolders: () => void;
  settings: FolderSettings;
  onSettingsChange: (change: Partial<FolderSettings>) => void;
}

export const ROW_HEIGHT_MIN = 100;
export const ROW_HEIGHT_MAX = 420;

export function Toolbar({
  folders,
  imageCount,
  rowHeight,
  onRowHeightChange,
  onOpenFolder,
  onParent,
  onRefresh,
  includeSubfolders,
  onToggleSubfolders,
  settings,
  onSettingsChange,
}: ToolbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
      <Button variant="outline" size="sm" onClick={onOpenFolder} title="Öppna en eller flera mappar (⌘O). Håll ⌘ för att markera flera.">
        <FolderOpen />
        Öppna mapp
      </Button>
      {folders.length > 0 && (
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={includeSubfolders}
            className={cn(includeSubfolders && "bg-accent")}
            onClick={onToggleSubfolders}
            title={includeSubfolders ? "Visar bilder i undermappar. Klicka för att bara visa mappen." : "Visa även bilder i undermappar"}
            aria-label="Visa bilder i undermappar"
          >
            <FolderTree />
          </Button>
          <div className="ml-1 min-w-0" title={folders.join("\n")}>
            <div className="truncate text-sm font-semibold">
              {folders.length === 1 ? folderName(folders[0]) : `${folders.length} mappar`}
            </div>
            <div className="text-xs text-muted-foreground">
              {imageCount} {imageCount === 1 ? "bild" : "bilder"}
            </div>
          </div>
        </>
      )}
      <div className="flex-1" />
      {folders.length > 0 && (
        <>
          <div role="radiogroup" aria-label="Visning" className="flex items-center rounded-md bg-muted p-0.5">
            <ModeButton
              mode="flow"
              current={settings.viewMode}
              onSelect={(viewMode) => onSettingsChange({ viewMode })}
              label="Flöde"
              title="Kontinuerligt flöde"
              icon={<Rows3 />}
            />
            <ModeButton
              mode="pages"
              current={settings.viewMode}
              onSelect={(viewMode) => onSettingsChange({ viewMode })}
              label="Sidor"
              title="Sidor som fyller fönstret"
              icon={<RectangleHorizontal />}
            />
          </div>
          {settings.viewMode === "pages" && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={settings.showPageNumbers}
              className={cn(settings.showPageNumbers && "bg-accent")}
              onClick={() => onSettingsChange({ showPageNumbers: !settings.showPageNumbers })}
              title={settings.showPageNumbers ? "Dölj sidnummer" : "Visa sidnummer"}
              aria-label="Sidnummer"
            >
              <Hash />
            </Button>
          )}
          <label className="relative flex items-center" title="Effekt när bilder visas">
            <Sparkles className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Effekt när bilder visas</span>
            <select
              value={settings.reveal}
              onChange={(e) => onSettingsChange({ reveal: e.target.value as Reveal })}
              className="h-8 appearance-none rounded-md border bg-background pr-3 pl-8 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {(Object.keys(REVEAL_LABELS) as Reveal[]).map((r) => (
                <option key={r} value={r}>
                  {REVEAL_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <div className="mx-1 h-6 w-px bg-border" aria-hidden />
        </>
      )}
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

interface ModeButtonProps {
  mode: ViewMode;
  current: ViewMode;
  onSelect: (mode: ViewMode) => void;
  label: string;
  title: string;
  icon: React.ReactNode;
}

function ModeButton({ mode, current, onSelect, label, title, icon }: ModeButtonProps) {
  const active = mode === current;
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={() => onSelect(mode)}
      title={title}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
        active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
