import { useEffect, useRef, useState } from "react";
import { Folder, FolderOpen, GalleryHorizontalEnd, Heart, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Library, LibraryView, Series } from "@/lib/library";
import { cn, folderName } from "@/lib/utils";

interface SidebarProps {
  folders: string[];
  library: Library;
  view: LibraryView;
  onSelect: (view: LibraryView) => void;
  onOpenFolder: () => void;
  /** Saves what is shown now as a new series. */
  onNewSeries: () => void;
  canCreateSeries: boolean;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** A series that was just created and should start with its name being edited. */
  renamingId: string | null;
  onRenamingDone: () => void;
}

export function Sidebar({
  folders,
  library,
  view,
  onSelect,
  onOpenFolder,
  onNewSeries,
  canCreateSeries,
  onRename,
  onDelete,
  renamingId,
  onRenamingDone,
}: SidebarProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Series | null>(null);

  useEffect(() => {
    if (renamingId) setEditing(renamingId);
  }, [renamingId]);

  const stopEditing = () => {
    setEditing(null);
    onRenamingDone();
  };

  return (
    <aside aria-label="Bibliotek" className="flex w-60 shrink-0 flex-col overflow-y-auto border-r bg-background py-3 text-sm">
      <SectionTitle>Mappar</SectionTitle>
      {folders.length > 0 ? (
        <Item
          active={view.kind === "folders"}
          onClick={() => onSelect({ kind: "folders" })}
          icon={<Folder />}
          label={folders.length === 1 ? folderName(folders[0]) : `${folders.length} mappar`}
          title={folders.join("\n")}
        />
      ) : (
        <Item active={false} onClick={onOpenFolder} icon={<FolderOpen />} label="Öppna mapp" />
      )}

      <SectionTitle className="mt-4">Bibliotek</SectionTitle>
      <Item
        active={view.kind === "favorites"}
        onClick={() => onSelect({ kind: "favorites" })}
        icon={<Heart />}
        label="Favoriter"
        count={library.favorites.length}
      />

      <div className="mt-4 flex items-center justify-between pr-2">
        <SectionTitle className="mb-0">Serier</SectionTitle>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          onClick={onNewSeries}
          disabled={!canCreateSeries}
          title="Spara bilderna som visas nu som en ny serie"
          aria-label="Ny serie"
        >
          <Plus />
        </Button>
      </div>
      {library.series.length === 0 && (
        <p className="px-4 py-1 text-xs text-muted-foreground">
          Spara det som visas som en serie med plus-knappen, eller lägg till bilder via bildens inställningar.
        </p>
      )}
      {library.series.map((s) =>
        editing === s.id ? (
          <RenameField
            key={s.id}
            initial={s.name}
            onSave={(name) => {
              if (name && name !== s.name) onRename(s.id, name);
              stopEditing();
            }}
            onCancel={stopEditing}
          />
        ) : (
          <Item
            key={s.id}
            active={view.kind === "series" && view.id === s.id}
            onClick={() => onSelect({ kind: "series", id: s.id })}
            icon={<GalleryHorizontalEnd />}
            label={s.name}
            count={s.images.length}
            actions={
              <>
                <RowAction label={`Byt namn på ${s.name}`} title="Byt namn" onClick={() => setEditing(s.id)}>
                  <Pencil />
                </RowAction>
                <RowAction
                  label={`Ta bort ${s.name}`}
                  title="Ta bort serien"
                  onClick={() => setDeleting(s)}
                  className="hover:text-destructive"
                >
                  <Trash2 />
                </RowAction>
              </>
            }
          />
        ),
      )}

      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} labelledBy="delete-series-title">
        <h2 id="delete-series-title" className="text-lg font-semibold">
          Ta bort serien?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{deleting?.name}</span> tas bort ur biblioteket. Bilderna
          ligger kvar i sina mappar.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleting(null)} data-autofocus>
            Behåll serien
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (deleting) onDelete(deleting.id);
              setDeleting(null);
            }}
          >
            <Trash2 />
            Ta bort serien
          </Button>
        </div>
      </Dialog>
    </aside>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("mb-1 px-4 text-xs font-medium text-muted-foreground", className)}>{children}</h2>;
}

interface ItemProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title?: string;
  count?: number;
  actions?: React.ReactNode;
}

function Item({ active, onClick, icon, label, title, count, actions }: ItemProps) {
  return (
    <div className={cn("group relative mx-2 flex items-center rounded-md", active ? "bg-accent" : "hover:bg-accent/60")}>
      <button
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        title={title ?? label}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
      >
        {icon}
        <span className={cn("truncate", active && "font-medium")}>{label}</span>
        {count !== undefined && (
          <span className={cn("ml-auto pr-1 text-xs text-muted-foreground tabular-nums", actions && "group-hover:invisible group-focus-within:invisible")}>
            {count}
          </span>
        )}
      </button>
      {actions && (
        <div className="absolute right-1 flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">{actions}</div>
      )}
    </div>
  );
}

interface RowActionProps {
  label: string;
  title: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}

function RowAction({ label, title, onClick, className, children }: RowActionProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={label}
      className={cn(
        "flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3.5",
        className,
      )}
    >
      {children}
    </button>
  );
}

function RenameField({ initial, onSave, onCancel }: { initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <div className="mx-2 flex h-8 items-center gap-2 rounded-md bg-accent px-2">
      <GalleryHorizontalEnd className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={input}
        value={value}
        aria-label="Seriens namn"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSave(value.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(value.trim());
          else if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        className="h-6 min-w-0 flex-1 rounded-sm border bg-background px-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
