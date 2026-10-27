import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Gallery } from "@/components/Gallery";
import { HeadingDialog, type HeadingKind } from "@/components/HeadingDialog";
import { Sidebar } from "@/components/Sidebar";
import { SubfolderBar } from "@/components/SubfolderBar";
import { Toast, type ToastMessage } from "@/components/Toast";
import { Toolbar, ROW_HEIGHT_MAX, ROW_HEIGHT_MIN } from "@/components/Toolbar";
import { TrashDialog } from "@/components/TrashDialog";
import { Viewer } from "@/components/Viewer";
import { pickFolders, scanFolder, trashFile, type ImageEntry } from "@/lib/api";
import {
  createSeries,
  deleteSeries,
  moveInSeries,
  removeImage,
  renameSeries,
  toggleFavorite,
  toggleInSeries,
  uniqueSeriesName,
  useLibrary,
  type LibraryView,
} from "@/lib/library";
import { saveSettings, useFolderSettings, type FolderSettings } from "@/lib/settings";
import { useBackgroundTheme } from "@/lib/theme";
import { folderName, parentFolder } from "@/lib/utils";

const STORAGE_FOLDERS = "image-browser:last-folders";
const STORAGE_SUBFOLDERS = "image-browser:include-subfolders";
const STORAGE_SIDEBAR = "image-browser:sidebar";
const STORAGE_VIEW = "image-browser:view";

/** The images of one or more folders opened together. */
interface Collection {
  folders: string[];
  images: ImageEntry[];
  subfolders: string[];
}
const STORAGE_ROW_HEIGHT = "image-browser:row-height";

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Remembering preferences is a convenience; ignore storage failures.
  }
}

export default function App() {
  const [listing, setListing] = useState<Collection | null>(null);
  const [rowHeight, setRowHeight] = useState(() => {
    const stored = Number(readStored(STORAGE_ROW_HEIGHT));
    return stored >= ROW_HEIGHT_MIN && stored <= ROW_HEIGHT_MAX ? stored : 220;
  });
  const [includeSubfolders, setIncludeSubfolders] = useState(() => readStored(STORAGE_SUBFOLDERS) !== "false");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Set when the viewer closes, so the gallery can show where that image is.
  const [highlight, setHighlight] = useState<{ index: number } | null>(null);
  const [trashIndex, setTrashIndex] = useState<number | null>(null);
  const [headingEdit, setHeadingEdit] = useState<{ index: number; kind: HeadingKind } | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => readStored(STORAGE_SIDEBAR) !== "false");
  const { library, change: changeLibrary } = useLibrary();
  const [view, setView] = useState<LibraryView>(() => {
    try {
      return JSON.parse(readStored(STORAGE_VIEW) ?? "") as LibraryView;
    } catch {
      return { kind: "folders" };
    }
  });
  // A series just created, whose name the sidebar should open for editing.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const folders = listing?.folders ?? [];
  const multiple = folders.length > 1;
  const series = view.kind === "series" ? library.series.find((s) => s.id === view.id) : undefined;
  const inFolders = view.kind === "folders";
  const viewKey = inFolders
    ? folders.join("\n")
    : view.kind === "favorites"
      ? "library:favorites"
      : `library:series:${view.id}`;
  const { settings, update: updateSettings, updateImage } = useFolderSettings(
    inFolders ? (listing ? viewKey : null) : viewKey,
  );
  useBackgroundTheme(settings.background);
  // File names can repeat across folders: one folder keys settings by the path inside it
  // (just the name for its own files), several folders and the library by full path.
  const imageKey = useCallback(
    (image: ImageEntry) =>
      !inFolders || multiple ? image.path : image.path.slice(folders[0].replace(/[\\/]+$/, "").length + 1),
    [inFolders, multiple, folders],
  );

  const selectView = useCallback((next: LibraryView) => {
    setView(next);
    setViewerIndex(null);
    store(STORAGE_VIEW, JSON.stringify(next));
  }, []);

  // A series deleted elsewhere (or a stale stored view) falls back to the folders.
  useEffect(() => {
    if (view.kind === "series" && !series) selectView({ kind: "folders" });
  }, [view, series, selectView]);

  const showToast = useCallback((text: string, tone: ToastMessage["tone"] = "success") => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  const loadFolders = useCallback(
    async (paths: string[], recursive = includeSubfolders, keepView = false) => {
      const sorted = [...new Set(paths)].sort((a, b) => a.localeCompare(b, "sv", { numeric: true }));
      const results = await Promise.allSettled(sorted.map((p) => scanFolder(p, recursive)));
      const loaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = sorted.filter((_, i) => results[i].status === "rejected");
      if (loaded.length === 0) {
        const first = results[0];
        const reason = first?.status === "rejected" && typeof first.reason === "string" ? first.reason : null;
        showToast(reason ?? "Kunde inte öppna mappen.", "error");
        return;
      }
      if (failed.length > 0) {
        showToast(`Kunde inte öppna ${failed.map(folderName).join(", ")}.`, "error");
      }
      const opened = loaded.map((l) => l.path);
      setListing({
        folders: opened,
        // A folder and one of its subfolders may both be open; show each image once.
        images: [...new Map(loaded.flatMap((l) => l.images).map((img) => [img.path, img])).values()],
        // Folders that are already open don't need a shortcut.
        subfolders: loaded.flatMap((l) => l.subfolders).filter((p) => !opened.includes(p)),
      });
      if (!keepView) selectView({ kind: "folders" });
      store(STORAGE_FOLDERS, JSON.stringify(opened));
    },
    [showToast, includeSubfolders, selectView],
  );

  const toggleSubfolders = () => {
    const next = !includeSubfolders;
    setIncludeSubfolders(next);
    store(STORAGE_SUBFOLDERS, String(next));
    if (listing) void loadFolders(listing.folders, next);
  };

  const openFolders = useCallback(async () => {
    const paths = await pickFolders();
    if (paths.length > 0) await loadFolders(paths);
  }, [loadFolders]);

  useEffect(() => {
    try {
      const last = JSON.parse(readStored(STORAGE_FOLDERS) ?? "[]");
      // Reopen the last folders without leaving the favorites or series shown last.
      if (Array.isArray(last) && last.length > 0) void loadFolders(last, includeSubfolders, true);
    } catch {
      // Ignore a corrupt value; the user just picks a folder again.
    }
    // Only on start; later loads are triggered by the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parent = folders.length === 1 ? parentFolder(folders[0]) : null;
  const goToParent = parent ? () => void loadFolders([parent]) : null;
  const refresh = useCallback(() => {
    if (listing) void loadFolders(listing.folders, includeSubfolders, true);
  }, [listing, loadFolders, includeSubfolders]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === "o") {
        e.preventDefault();
        void openFolders();
      } else if (e.key === "r" && inFolders) {
        e.preventDefault();
        refresh();
      } else if (e.key === "ArrowUp" && parent && inFolders && viewerIndex === null) {
        e.preventDefault();
        void loadFolders([parent]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFolders, refresh, parent, inFolders, viewerIndex, loadFolders]);

  const images = useMemo(
    () => (view.kind === "favorites" ? library.favorites : series ? series.images : (listing?.images ?? [])),
    [view.kind, library.favorites, series, listing],
  );
  const favoritePaths = useMemo(() => new Set(library.favorites.map((img) => img.path)), [library.favorites]);

  // The list can shrink under the viewer, e.g. when an image is taken out of the favorites shown.
  useEffect(() => {
    if (viewerIndex !== null && viewerIndex >= images.length) {
      setViewerIndex(images.length === 0 ? null : images.length - 1);
    }
  }, [viewerIndex, images.length]);

  const onToggleFavorite = useCallback(
    (index: number) => changeLibrary((lib) => toggleFavorite(lib, images[index])),
    [changeLibrary, images],
  );
  const onToggleSeries = useCallback(
    (id: string, index: number) => changeLibrary((lib) => toggleInSeries(lib, id, images[index])),
    [changeLibrary, images],
  );

  const onMoveImage = useCallback(
    (from: number, to: number) => {
      if (series) changeLibrary((lib) => moveInSeries(lib, series.id, from, to));
    },
    [changeLibrary, series],
  );

  const newSeries = () => {
    const id = crypto.randomUUID();
    const base =
      view.kind === "favorites"
        ? "Favoriter"
        : series
          ? series.name
          : folders.length === 1
            ? folderName(folders[0])
            : "Ny serie";
    // The series starts with the layout of what it was made from; its images are keyed by path.
    const copied: FolderSettings = { ...settings, images: {} };
    for (const img of images) {
      const own = settings.images[imageKey(img)];
      if (own) copied.images[img.path] = own;
    }
    saveSettings(`library:series:${id}`, copied);
    changeLibrary((lib) => createSeries(lib, id, uniqueSeriesName(lib, base), images));
    selectView({ kind: "series", id });
    setRenamingId(id);
  };

  const removeSeries = (id: string) => {
    changeLibrary((lib) => deleteSeries(lib, id));
    try {
      localStorage.removeItem(`image-browser:folder:library:series:${id}`);
    } catch {
      // Leftover settings are harmless.
    }
    if (view.kind === "series" && view.id === id) selectView({ kind: "folders" });
  };

  const confirmTrash = async () => {
    if (trashIndex === null) return;
    const image = images[trashIndex];
    setTrashIndex(null);
    if (!image) return;
    try {
      await trashFile(image.path);
    } catch (err) {
      showToast(typeof err === "string" ? err : "Kunde inte flytta bilden till papperskorgen.", "error");
      return;
    }
    changeLibrary((lib) => removeImage(lib, image.path));
    if (listing) setListing({ ...listing, images: listing.images.filter((img) => img.path !== image.path) });
    if (viewerIndex !== null && images.length === 1) setViewerIndex(null);
    // Otherwise the viewer stays on the same position, which now holds the next image.
    showToast(`${image.name} flyttades till papperskorgen.`);
  };

  const libraryTitle = view.kind === "favorites" ? "Favoriter" : (series?.name ?? null);
  const emptyKind =
    view.kind === "favorites" ? "favorites" : series ? "series" : listing ? "empty-folder" : "no-folder";

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        folders={folders}
        libraryTitle={libraryTitle}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => {
          setSidebarOpen(!sidebarOpen);
          store(STORAGE_SIDEBAR, String(!sidebarOpen));
        }}
        imageCount={images.length}
        rowHeight={rowHeight}
        onRowHeightChange={(value) => {
          setRowHeight(value);
          store(STORAGE_ROW_HEIGHT, String(value));
        }}
        onOpenFolder={() => void openFolders()}
        onParent={goToParent}
        onRefresh={refresh}
        includeSubfolders={includeSubfolders}
        onToggleSubfolders={toggleSubfolders}
        settings={settings}
        onSettingsChange={updateSettings}
      />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <Sidebar
            folders={folders}
            library={library}
            view={view}
            onSelect={selectView}
            onOpenFolder={() => void openFolders()}
            onNewSeries={newSeries}
            canCreateSeries={images.length > 0}
            onRename={(id, name) => changeLibrary((lib) => renameSeries(lib, id, name))}
            onDelete={removeSeries}
            renamingId={renamingId}
            onRenamingDone={() => setRenamingId(null)}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {listing && inFolders && <SubfolderBar subfolders={listing.subfolders} onOpen={(p) => void loadFolders([p])} />}
          {images.length > 0 ? (
            <Gallery
              viewKey={viewKey}
              images={images}
              imageKey={imageKey}
              rowHeight={rowHeight}
              settings={settings}
              onOpen={setViewerIndex}
              onTrash={setTrashIndex}
              onChangeImage={updateImage}
              favorites={favoritePaths}
              series={library.series}
              onToggleFavorite={onToggleFavorite}
              onToggleSeries={onToggleSeries}
              onEditHeading={(index, kind) => setHeadingEdit({ index, kind })}
              onMove={series ? onMoveImage : undefined}
              highlight={highlight}
            />
          ) : (
            <EmptyState kind={emptyKind} onOpenFolder={() => void openFolders()} />
          )}
        </div>
      </div>
      {viewerIndex !== null && images[viewerIndex] && (
        <Viewer
          images={images}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => {
            setHighlight({ index: viewerIndex });
            setViewerIndex(null);
          }}
          onTrash={setTrashIndex}
          isFavorite={(img) => favoritePaths.has(img.path)}
          onToggleFavorite={onToggleFavorite}
          paused={trashIndex !== null}
        />
      )}
      {(() => {
        const image = headingEdit ? images[headingEdit.index] : undefined;
        const own = image ? settings.images[imageKey(image)] : undefined;
        const field = headingEdit?.kind === "page" ? "pageHeading" : "heading";
        return (
          <HeadingDialog
            kind={image ? headingEdit!.kind : null}
            imageName={image?.name ?? ""}
            heading={own?.[field]}
            onSave={(heading) => {
              if (image) updateImage(imageKey(image), { [field]: heading });
              setHeadingEdit(null);
            }}
            onClose={() => setHeadingEdit(null)}
          />
        );
      })()}
      <TrashDialog
        image={trashIndex !== null ? images[trashIndex] ?? null : null}
        onCancel={() => setTrashIndex(null)}
        onConfirm={() => void confirmTrash()}
      />
      <Toast key={toast?.id} toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
