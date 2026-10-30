import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  Ellipsis,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderX,
  GalleryHorizontalEnd,
  Heart,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Library, LibraryItem, LibraryView, Place, Privacy, Series } from "@/lib/library";
import { cn, folderName } from "@/lib/utils";
import { SeriesMenuList } from "./SeriesMenuList";
import { useCloseOnLeaveAfterChoice } from "@/lib/menu";

interface SidebarProps {
  folders: string[];
  /** Remembered folders that have been moved or deleted outside the app. */
  goneFolders: Set<string>;
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
  onSetPrivacy: (item: LibraryItem, change: Privacy) => void;
  /** The saved place for the open folders, if they are saved. */
  currentPlace: Place | undefined;
  onSavePlace: () => void;
  onOpenPlace: (place: Place) => void;
  onRenamePlace: (id: string, name: string) => void;
  onDeletePlace: (id: string) => void;
  onOpenRecent: (folders: string[]) => void;
  onForgetRecent: (folders: string[]) => void;
  /** Puts all images of Favoriter or a series into a series, or a new one. */
  onCopyAll: (from: LibraryView, toSeries: string) => void;
  onCopyAllToNew: (from: LibraryView, name: string) => void;
  newSeriesName: string;
}

export function Sidebar({
  folders,
  goneFolders,
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
  onSetPrivacy,
  currentPlace,
  onSavePlace,
  onOpenPlace,
  onRenamePlace,
  onDeletePlace,
  onOpenRecent,
  onForgetRecent,
  onCopyAll,
  onCopyAllToNew,
  newSeriesName,
}: SidebarProps) {
  const copyTo = (from: LibraryView, exclude?: string) => ({
    series: library.series.filter((s) => s.id !== exclude),
    onPick: (id: string) => onCopyAll(from, id),
    onCreate: (name: string) => onCopyAllToNew(from, name),
    defaultName: newSeriesName,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Series | null>(null);

  useEffect(() => {
    if (renamingId) setEditing(renamingId);
  }, [renamingId]);

  const places = library.places ?? [];
  const sameFolders = (a: string[], b: string[]) => [...a].sort().join("\n") === [...b].sort().join("\n");
  // Folders opened before stay listed; saved ones show under their own name instead.
  const recent = (library.recent ?? []).filter((r) => !places.some((p) => sameFolders(p.folders, r)));
  const folderLabel = (paths: string[]) => (paths.length === 1 ? folderName(paths[0]) : `${paths.length} mappar`);

  const stopEditing = () => {
    setEditing(null);
    onRenamingDone();
  };

  return (
    <aside aria-label="Bibliotek" className="flex w-60 shrink-0 flex-col overflow-y-auto border-r bg-background py-3 text-sm">
      <div className="flex items-center justify-between pr-2">
        <SectionTitle className="mb-0">Mappar</SectionTitle>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          onClick={onSavePlace}
          disabled={folders.length === 0 || currentPlace !== undefined}
          title={currentPlace ? `Sparade som ${currentPlace.name}` : "Spara de öppna mapparna med ett eget namn"}
          aria-label="Spara mappvalet"
        >
          <BookmarkPlus />
        </Button>
      </div>
      {folders.length === 0 && (
        <Item active={false} onClick={onOpenFolder} icon={<FolderOpen />} label="Öppna mapp" />
      )}
      {recent.map((r) => {
        const open = sameFolders(r, folders);
        const gone = r.filter((f) => goneFolders.has(f));
        return (
          <Item
            key={r.join("\n")}
            active={view.kind === "folders" && open}
            onClick={() => (open ? onSelect({ kind: "folders" }) : onOpenRecent(r))}
            icon={gone.length ? <FolderX /> : <Folder />}
            label={folderLabel(r)}
            title={goneTitle(r.join("\n"), gone)}
            gone={gone.length > 0}
            actions={<RowMenu label={folderLabel(r)} onDelete={() => onForgetRecent(r)} deleteLabel="Glöm mappen" />}
          />
        );
      })}
      {folders.length > 0 && !currentPlace && !recent.some((r) => sameFolders(r, folders)) && (
        <Item
          active={view.kind === "folders"}
          onClick={() => onSelect({ kind: "folders" })}
          icon={<Folder />}
          label={folderLabel(folders)}
          title={folders.join("\n")}
        />
      )}
      {places.map((p) =>
        editing === p.id ? (
          <RenameField
            key={p.id}
            initial={p.name}
            icon={<Bookmark />}
            label="Mappvalets namn"
            onSave={(name) => {
              if (name && name !== p.name) onRenamePlace(p.id, name);
              stopEditing();
            }}
            onCancel={stopEditing}
          />
        ) : (
          <Item
            key={p.id}
            active={view.kind === "folders" && currentPlace?.id === p.id}
            onClick={() => onOpenPlace(p)}
            icon={p.folders.some((f) => goneFolders.has(f)) ? <FolderX /> : <Bookmark />}
            label={p.name}
            title={goneTitle(`${p.name}\n${p.folders.join("\n")}`, p.folders.filter((f) => goneFolders.has(f)))}
            gone={p.folders.some((f) => goneFolders.has(f))}
            actions={
              <RowMenu
                label={p.name}
                onRename={() => setEditing(p.id)}
                onDelete={() => onDeletePlace(p.id)}
                deleteLabel="Glöm mappvalet"
              />
            }
          />
        ),
      )}

      <SectionTitle className="mt-4">Bibliotek</SectionTitle>
      <Item
        active={view.kind === "favorites"}
        onClick={() => onSelect({ kind: "favorites" })}
        icon={<Heart />}
        label="Favoriter"
        count={library.favorites.length}
        privacy={library.favoritesPrivacy}
        dropTarget="favorites"
        actions={
          <RowMenu
            label="Favoriter"
            privacy={library.favoritesPrivacy ?? {}}
            onPrivacy={(change) => onSetPrivacy({ kind: "favorites" }, change)}
            copyTo={library.favorites.length > 0 ? copyTo({ kind: "favorites" }) : undefined}
          />
        }
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
          Spara det som visas som en serie med plus-knappen, eller dra bilder hit.
        </p>
      )}
      {library.series.map((s) =>
        editing === s.id ? (
          <RenameField
            key={s.id}
            initial={s.name}
            icon={<GalleryHorizontalEnd />}
            label="Seriens namn"
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
            privacy={s}
            dropTarget={`series:${s.id}`}
            actions={
              <RowMenu
                label={s.name}
                privacy={s}
                onPrivacy={(change) => onSetPrivacy({ kind: "series", id: s.id }, change)}
                onRename={() => setEditing(s.id)}
                onDelete={() => setDeleting(s)}
                copyTo={s.images.length > 0 ? copyTo({ kind: "series", id: s.id }, s.id) : undefined}
              />
            }
          />
        ),
      )}

      {/* Shown while pictures are dragged from the gallery: dropping them here makes a new series. */}
      <div
        data-drop-target="new-series"
        className="mx-2 mt-1 hidden items-center gap-2 rounded-md border border-dashed border-current/30 px-3 py-1.5 text-sm text-muted-foreground data-drop-active:border-ring data-drop-active:bg-accent data-drop-active:text-foreground [.reordering_&]:flex"
      >
        <Plus className="size-4 shrink-0" />
        Släpp för en ny serie
      </div>

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
  privacy?: Privacy;
  /** Lets images be dragged here from the gallery. */
  dropTarget?: string;
  actions?: React.ReactNode;
  /** Its folder is no longer where it was, so it is greyed out. */
  gone?: boolean;
}

/** The row's tooltip, saying which of its folders are no longer where they were. */
function goneTitle(title: string, gone: string[]) {
  if (gone.length === 0) return title;
  return `${title}\n\n${gone.length === 1 ? "Mappen" : "De här mapparna"} finns inte längre, flyttad eller borttagen utanför appen:\n${gone.join("\n")}`;
}

function Item({ active, onClick, icon, label, title, count, privacy, dropTarget, actions, gone }: ItemProps) {
  return (
    <div
      data-drop-target={dropTarget}
      className={cn(
        "group relative mx-2 flex items-center rounded-md data-drop-active:bg-accent data-drop-active:ring-2 data-drop-active:ring-ring",
        active ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <button
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        title={title ?? label}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
      >
        {icon}
        <span className={cn("truncate", active && "font-medium", gone && "text-muted-foreground")}>
          {label}
        </span>
        {privacy?.hidden && <EyeOff className="!size-3" aria-label="Privat" />}
        {privacy?.locked && <Lock className="!size-3" aria-label="Låst" />}
        {count !== undefined && (
          <span
            className={cn(
              "ml-auto pr-1 text-xs text-muted-foreground tabular-nums",
              actions && "group-hover:invisible group-focus-within:invisible group-has-[[aria-expanded=true]]:invisible",
            )}
          >
            {count}
          </span>
        )}
      </button>
      {actions && (
        <div className="absolute right-1 flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}

interface RowMenuProps {
  label: string;
  privacy?: Privacy;
  onPrivacy?: (change: Privacy) => void;
  onRename?: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  /** "Lägg alla i serie": puts every image of the row into a series. */
  copyTo?: { series: Series[]; onPick: (id: string) => void; onCreate: (name: string) => void; defaultName: string };
}

/** The ⋯ menu on a library row: rename, hide, lock and delete. */
function RowMenu({ label, privacy, onPrivacy, onRename, onDelete, deleteLabel = "Ta bort serien", copyTo }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  // The menu turns into a list of series after "Lägg alla i serie".
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!open) setPicking(false);
  }, [open]);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useCloseOnLeaveAfterChoice(root, open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const at = items.indexOf(document.activeElement as HTMLElement);
        items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        onClick={() => setOpen(!open)}
        title="Fler val"
        aria-label={`Fler val för ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3.5"
      >
        <Ellipsis />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute top-7 right-0 z-50 w-52 rounded-lg border bg-popover p-1 text-sm text-foreground shadow-lg"
        >
          {picking && copyTo ? (
            <>
              <MenuItem icon={<ArrowLeft />} onClick={() => setPicking(false)} className="text-muted-foreground">
                Lägg alla i serie
              </MenuItem>
              <div className="my-1 h-px bg-border" role="separator" />
              <SeriesMenuList
                series={copyTo.series}
                onPick={(id) => choose(() => copyTo.onPick(id))()}
                onCreate={(name) => choose(() => copyTo.onCreate(name))()}
                defaultName={copyTo.defaultName}
              />
            </>
          ) : (
          <>
          {copyTo && (
            <MenuItem icon={<FolderPlus />} onClick={() => setPicking(true)}>
              Lägg alla i serie…
            </MenuItem>
          )}
          {onRename && (
            <MenuItem icon={<Pencil />} onClick={choose(onRename)}>
              Byt namn
            </MenuItem>
          )}
          {privacy && onPrivacy && (
            <>
              <MenuItem
                icon={privacy.hidden ? <Eye /> : <EyeOff />}
                onClick={choose(() => onPrivacy({ hidden: !privacy.hidden }))}
              >
                {privacy.hidden ? "Sluta vara privat" : "Gör privat"}
              </MenuItem>
              <MenuItem
                icon={privacy.locked ? <LockOpen /> : <Lock />}
                onClick={choose(() => onPrivacy({ locked: !privacy.locked }))}
              >
                {privacy.locked ? "Ta bort låset" : "Lås med Touch ID"}
              </MenuItem>
            </>
          )}
          {onDelete && (
            <>
              {privacy && <div className="my-1 h-px bg-border" role="separator" />}
              <MenuItem icon={<Trash2 />} onClick={choose(onDelete)} className="text-destructive">
                {deleteLabel}
              </MenuItem>
            </>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  onClick,
  className,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

interface RenameFieldProps {
  initial: string;
  icon: React.ReactNode;
  label: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

function RenameField({ initial, icon, label, onSave, onCancel }: RenameFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <div className="mx-2 flex h-8 items-center gap-2 rounded-md bg-accent px-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
      {icon}
      <input
        ref={input}
        value={value}
        aria-label={label}
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
