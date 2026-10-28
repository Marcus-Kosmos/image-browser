import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, type EmptyKind } from "@/components/EmptyState";
import { Gallery } from "@/components/Gallery";
import { HeadingDialog, type HeadingKind } from "@/components/HeadingDialog";
import { LockedState } from "@/components/LockedState";
import { Sidebar } from "@/components/Sidebar";
import { SubfolderBar } from "@/components/SubfolderBar";
import { Toast, type ToastMessage } from "@/components/Toast";
import { Toolbar, ROW_HEIGHT_MAX, ROW_HEIGHT_MIN } from "@/components/Toolbar";
import { TrashDialog } from "@/components/TrashDialog";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { SelectionBar } from "@/components/SelectionBar";
import { Viewer } from "@/components/Viewer";
import { confirmOwner, pickFolders, scanFolder, trashFile, type ImageEntry } from "@/lib/api";
import { NO_FILTER, filterImages, isFiltering, libraryIndex, type ImageFilter, type Tag } from "@/lib/filter";
import {
  addToFavorites,
  addToSeries,
  createSeries,
  deletePlace,
  deleteSeries,
  findPlace,
  forgetFolders,
  itemKey,
  moveInSeries,
  privacyOf,
  removeFromFavorites,
  removeImage,
  renamePlace,
  rememberFolders,
  renameSeries,
  savePlace,
  setPrivacy,
  toggleFavorite,
  toggleInSeries,
  uniqueSeriesName,
  useLibrary,
  type LibraryItem,
  type LibraryView,
  type Privacy,
} from "@/lib/library";
import { saveSettings, useFolderSettings, type FolderSettings } from "@/lib/settings";
import { useBackgroundTheme } from "@/lib/theme";
import type { ViewerSettings } from "@/lib/viewer";
import { folderName, parentFolder } from "@/lib/utils";

const STORAGE_FOLDERS = "image-browser:last-folders";
const STORAGE_SUBFOLDERS = "image-browser:include-subfolders";
const STORAGE_SIDEBAR = "image-browser:sidebar";
const STORAGE_VIEW = "image-browser:view";
const STORAGE_ASK_TRASH = "image-browser:ask-before-trash";

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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Off when the user chose to trash with one click, without the question.
  const [askBeforeTrash, setAskBeforeTrash] = useState(() => readStored(STORAGE_ASK_TRASH) !== "false");
  const [headingEdit, setHeadingEdit] = useState<{ index: number; kind: HeadingKind } | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => readStored(STORAGE_SIDEBAR) !== "false");
  const { library, change: changeLibrary } = useLibrary();
  const [view, setView] = useState<LibraryView>(() => {
    try {
      const stored = JSON.parse(readStored(STORAGE_VIEW) ?? "") as LibraryView;
      // Something hidden or locked is never what the app opens with.
      const { hidden, locked } = privacyOf(library, stored);
      return hidden || locked ? { kind: "folders" } : stored;
    } catch {
      return { kind: "folders" };
    }
  });
  // Hidden series and favorites are listed only after "Visa dolda", until the app restarts.
  const [showHidden, setShowHidden] = useState(false);
  // The locked series (or favorites) opened with Touch ID; it locks again when left.
  const [unlocked, setUnlocked] = useState<string | null>(null);
  // A series just created, whose name the sidebar should open for editing.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const folders = listing?.folders ?? [];
  const multiple = folders.length > 1;
  const series = view.kind === "series" ? library.series.find((s) => s.id === view.id) : undefined;
  const inFolders = view.kind === "folders";
  const locked = !!privacyOf(library, view).locked && unlocked !== itemKey(view);
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
    setUnlocked((key) => (key === itemKey(next) ? key : null));
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

  const itemName = useCallback(
    (item: LibraryView) =>
      item.kind === "series" ? (library.series.find((s) => s.id === item.id)?.name ?? "serien") : "Favoriter",
    [library.series],
  );

  /** Asks for Touch ID or the password; true when the owner confirmed. */
  const askOwner = useCallback(
    async (reason: string) => {
      try {
        return await confirmOwner(reason);
      } catch (err) {
        showToast(typeof err === "string" ? err : "Kunde inte fråga efter Touch ID.", "error");
        return false;
      }
    },
    [showToast],
  );

  const unlock = useCallback(
    async (item: LibraryView) => {
      if (await askOwner(`låsa upp ${itemName(item)}`)) setUnlocked(itemKey(item));
    },
    [askOwner, itemName],
  );

  const openView = (next: LibraryView) => {
    selectView(next);
    if (privacyOf(library, next).locked && unlocked !== itemKey(next)) void unlock(next);
  };

  const changePrivacy = async (item: LibraryItem, change: Privacy) => {
    // Anyone could take a lock off otherwise.
    if (change.locked === false && !(await askOwner(`ta bort låset på ${itemName(item)}`))) return;
    changeLibrary((lib) => setPrivacy(lib, item, change));
    if (change.locked) setUnlocked((key) => (key === itemKey(item) ? null : key));
  };

  // Lock again when the app goes to the background or is minimized.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setUnlocked(null);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
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
        return null;
      }
      if (failed.length > 0) {
        showToast(`Kunde inte öppna ${failed.map(folderName).join(", ")}.`, "error");
      }
      const opened = loaded.map((l) => l.path);
      // A folder and one of its subfolders may both be open; show each image once.
      const found = [...new Map(loaded.flatMap((l) => l.images).map((img) => [img.path, img])).values()];
      setListing({
        folders: opened,
        images: found,
        // Folders that are already open don't need a shortcut.
        subfolders: loaded.flatMap((l) => l.subfolders).filter((p) => !opened.includes(p)),
      });
      if (!keepView) selectView({ kind: "folders" });
      store(STORAGE_FOLDERS, JSON.stringify(opened));
      return found.length;
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
    if (paths.length === 0) return;
    const count = await loadFolders(paths);
    if (count !== null) changeLibrary((lib) => rememberFolders(lib, paths));
  }, [loadFolders, changeLibrary]);

  useEffect(() => {
    try {
      const last = JSON.parse(readStored(STORAGE_FOLDERS) ?? "[]");
      // Reopen the last folders without leaving the favorites or series shown last.
      if (Array.isArray(last) && last.length > 0) {
        void loadFolders(last, includeSubfolders, true).then((count) => {
          if (count !== null) changeLibrary((lib) => rememberFolders(lib, last));
        });
      }
    } catch {
      // Ignore a corrupt value; the user just picks a folder again.
    }
    // Only on start; later loads are triggered by the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parent = folders.length === 1 ? parentFolder(folders[0]) : null;
  const goToParent = parent ? () => void loadFolders([parent]) : null;
  // Spins the button and then says what was found, so a click is seen to do something.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!listing || refreshing) return;
    setRefreshing(true);
    const [count] = await Promise.all([
      loadFolders(listing.folders, includeSubfolders, true),
      new Promise((resolve) => setTimeout(resolve, 600)),
    ]);
    setRefreshing(false);
    if (count !== null) showToast(`Mappen lästes in igen: ${count === 1 ? "1 bild" : `${count} bilder`}.`);
  }, [listing, refreshing, loadFolders, includeSubfolders, showToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === "o") {
        e.preventDefault();
        void openFolders();
      } else if (e.key === "r" && inFolders) {
        e.preventDefault();
        void refresh();
      } else if (e.key === "ArrowUp" && parent && inFolders && viewerIndex === null) {
        e.preventDefault();
        void loadFolders([parent]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFolders, refresh, parent, inFolders, viewerIndex, loadFolders]);

  const allImages = useMemo(
    () =>
      locked
        ? []
        : view.kind === "favorites"
          ? library.favorites
          : series
            ? series.images
            : (listing?.images ?? []),
    [locked, view.kind, library.favorites, series, listing],
  );
  // Tags are Favoriter and the series an image is in; hidden ones count only while shown.
  const index = useMemo(() => libraryIndex(library, showHidden), [library, showHidden]);
  const [filter, setFilter] = useState<ImageFilter>(NO_FILTER);
  const filtering = isFiltering(filter);
  const images = useMemo(() => filterImages(allImages, filter, index), [allImages, filter, index]);
  const tagChoices = useMemo<Tag[]>(
    () => [
      ...(showHidden || !library.favoritesPrivacy?.hidden ? [{ key: "favorites", name: "Favoriter" }] : []),
      ...library.series.filter((s) => showHidden || !s.hidden).map((s) => ({ key: `series:${s.id}`, name: s.name })),
    ],
    [library, showHidden],
  );
  // A filter on a tag that no longer exists (deleted or hidden series) is dropped.
  useEffect(() => {
    const keys = new Set(tagChoices.map((t) => t.key));
    if (filter.tags.some((k) => !keys.has(k))) setFilter((f) => ({ ...f, tags: f.tags.filter((k) => keys.has(k)) }));
  }, [tagChoices, filter.tags]);
  const place = useMemo(() => (listing ? findPlace(library, listing.folders) : undefined), [library, listing]);
  const listedSeries = useMemo(
    () => (showHidden ? library.series : library.series.filter((s) => !s.hidden)),
    [showHidden, library.series],
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

  /** Adds images to Favoriter ("favorites") or a series ("series:<id>") and says how it went. */
  const addTo = useCallback(
    (target: string, added: ImageEntry[]) => {
      if (added.length === 0) return;
      const seriesId = target.startsWith("series:") ? target.slice("series:".length) : null;
      const list = seriesId ? library.series.find((s) => s.id === seriesId) : null;
      if (seriesId && !list) return;
      const name = list ? list.name : "Favoriter";
      const there = new Set((list ? list.images : library.favorites).map((img) => img.path));
      const fresh = added.filter((img) => !there.has(img.path));
      if (fresh.length === 0) {
        showToast(added.length === 1 ? `${added[0].name} finns redan i ${name}.` : `Bilderna finns redan i ${name}.`);
        return;
      }
      changeLibrary((lib) => (seriesId ? addToSeries(lib, seriesId, fresh) : addToFavorites(lib, fresh)));
      const already = added.length - fresh.length;
      showToast(
        (fresh.length === 1 ? `${fresh[0].name} lades till i ${name}.` : `${fresh.length} bilder lades till i ${name}.`) +
          (already > 0 ? ` ${already} fanns redan där.` : ""),
      );
    },
    [library, changeLibrary, showToast],
  );

  const unfavorite = useCallback(
    (removed: ImageEntry[]) => {
      const gone = removed.filter((img) => favoritePaths.has(img.path));
      if (gone.length === 0) return;
      changeLibrary((lib) => removeFromFavorites(lib, gone));
      showToast(gone.length === 1 ? `${gone[0].name} togs bort från Favoriter.` : `${gone.length} bilder togs bort från Favoriter.`);
    },
    [favoritePaths, changeLibrary, showToast],
  );

  const newSeriesWith = useCallback(
    (name: string, added: ImageEntry[]) => {
      const unique = uniqueSeriesName(library, name);
      changeLibrary((lib) => createSeries(lib, crypto.randomUUID(), unique, added));
      showToast(`Serien ${unique} skapades med ${added.length === 1 ? "bilden" : `${added.length} bilder`}.`);
    },
    [library, changeLibrary, showToast],
  );

  const onDropOnLibrary = useCallback(
    (indices: number[], target: string) => addTo(target, indices.flatMap((i) => (images[i] ? [images[i]] : []))),
    [images, addTo],
  );

  // Images selected with ⌘-click, Shift-click or a rectangle; cleared when another view opens.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [viewKey]);
  // Images kept in the corner of the full screen view, for this folder or list only.
  const [pinned, setPinned] = useState<ImageEntry[]>([]);
  useEffect(() => setPinned([]), [viewKey]);
  // A series' saved look while it is shown "som pussel"; the usual look comes back on close.
  const [viewerLook, setViewerLook] = useState<ViewerSettings | null>(null);
  const showPuzzle =
    series?.look && images.length > 0 && !locked
      ? () => {
          setViewerLook(series.look!);
          setPinned(images.slice(0, -1));
          setViewerIndex(images.length - 1);
        }
      : undefined;

  const savePinned = (name: string, look: ViewerSettings | undefined, appearance: boolean) => {
    const id = crypto.randomUUID();
    const unique = uniqueSeriesName(library, name);
    if (appearance) {
      // Like a series made from a whole view: its colors and frame, and the pinned images' own settings by path.
      const copied: FolderSettings = { ...settings, images: {} };
      for (const img of pinned) {
        const own = settings.images[imageKey(img)];
        if (own) copied.images[img.path] = own;
      }
      saveSettings(`library:series:${id}`, copied);
    }
    changeLibrary((lib) => createSeries(lib, id, unique, pinned, look));
    showToast(
      `Serien ${unique} skapades med ${pinned.length === 1 ? "bilden" : `${pinned.length} bilder`}` +
        (look ? ". Visa den som pussel från serien." : "."),
    );
  };
  const selectedImages = useMemo(() => images.filter((img) => selected.has(img.path)), [images, selected]);
  // ⌘A selects every image shown, Esc clears the selection.
  useEffect(() => {
    if (viewerIndex !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && images.length > 0) {
        e.preventDefault();
        setSelected(new Set(images.map((img) => img.path)));
      } else if (e.key === "Escape" && selected.size > 0) {
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, images, selected.size]);

  const libraryImages = useCallback(
    (item: LibraryView) =>
      item.kind === "favorites" ? library.favorites : (library.series.find((s) => s.id === (item as { id: string }).id)?.images ?? []),
    [library],
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

  const trashImage = async (image: ImageEntry) => {
    try {
      await trashFile(image.path);
    } catch (err) {
      showToast(typeof err === "string" ? err : "Kunde inte flytta bilden till papperskorgen.", "error");
      return;
    }
    changeLibrary((lib) => removeImage(lib, image.path));
    setListing((prev) => prev && { ...prev, images: prev.images.filter((img) => img.path !== image.path) });
    if (viewerIndex !== null && images.length === 1) setViewerIndex(null);
    // Otherwise the viewer stays on the same position, which now holds the next image.
    showToast(`${image.name} flyttades till papperskorgen.`);
  };

  const changeAskBeforeTrash = (ask: boolean) => {
    setAskBeforeTrash(ask);
    store(STORAGE_ASK_TRASH, String(ask));
  };

  const requestTrash = (index: number) => {
    const image = images[index];
    if (!image) return;
    if (askBeforeTrash) setTrashIndex(index);
    else void trashImage(image);
  };

  const confirmTrash = (dontAsk: boolean) => {
    const image = trashIndex !== null ? images[trashIndex] : undefined;
    setTrashIndex(null);
    if (dontAsk) changeAskBeforeTrash(false);
    if (image) void trashImage(image);
  };

  const libraryTitle = view.kind === "favorites" ? "Favoriter" : (series?.name ?? null);
  const emptyKind: EmptyKind =
    filtering && allImages.length > 0
      ? "no-match"
      : view.kind === "favorites" ? "favorites" : series ? "series" : listing ? "empty-folder" : "no-folder";

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        folders={folders}
        libraryTitle={libraryTitle}
        placeName={place?.name ?? null}
        filter={filter}
        onFilterChange={setFilter}
        tags={tagChoices}
        totalCount={filtering ? allImages.length : null}
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
        onRefresh={() => void refresh()}
        refreshing={refreshing}
        onShowPuzzle={showPuzzle}
        includeSubfolders={includeSubfolders}
        onToggleSubfolders={toggleSubfolders}
        settings={settings}
        onSettingsChange={updateSettings}
        askBeforeTrash={askBeforeTrash}
        onAskBeforeTrashChange={changeAskBeforeTrash}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <Sidebar
            folders={folders}
            library={library}
            view={view}
            onSelect={openView}
            onOpenFolder={() => void openFolders()}
            onNewSeries={newSeries}
            canCreateSeries={images.length > 0}
            onRename={(id, name) => changeLibrary((lib) => renameSeries(lib, id, name))}
            onDelete={removeSeries}
            renamingId={renamingId}
            onRenamingDone={() => setRenamingId(null)}
            showHidden={showHidden}
            onToggleShowHidden={() => setShowHidden(!showHidden)}
            onSetPrivacy={(item, change) => void changePrivacy(item, change)}
            currentPlace={place}
            onSavePlace={() => {
              if (!listing) return;
              const id = crypto.randomUUID();
              const name = listing.folders.length === 1 ? folderName(listing.folders[0]) : `${listing.folders.length} mappar`;
              changeLibrary((lib) => savePlace(lib, { id, name, folders: listing.folders, recursive: includeSubfolders }));
              selectView({ kind: "folders" });
              setRenamingId(id);
            }}
            onOpenPlace={(p) => {
              selectView({ kind: "folders" });
              setIncludeSubfolders(p.recursive);
              store(STORAGE_SUBFOLDERS, String(p.recursive));
              if (!place || place.id !== p.id) void loadFolders(p.folders, p.recursive);
            }}
            onRenamePlace={(id, name) => changeLibrary((lib) => renamePlace(lib, id, name))}
            onDeletePlace={(id) => changeLibrary((lib) => deletePlace(lib, id))}
            onOpenRecent={(paths) => void loadFolders(paths)}
            onForgetRecent={(paths) => changeLibrary((lib) => forgetFolders(lib, paths))}
            onCopyAll={(from, id) => addTo(`series:${id}`, libraryImages(from))}
            onCopyAllToNew={(from, name) => newSeriesWith(name, libraryImages(from))}
            newSeriesName={uniqueSeriesName(library, "Ny serie")}
          />
        )}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {selectedImages.length > 0 && !locked && (
            <SelectionBar
              count={selectedImages.length}
              series={listedSeries}
              favoriteCount={selectedImages.filter((img) => favoritePaths.has(img.path)).length}
              onFavorite={() => addTo("favorites", selectedImages)}
              onUnfavorite={() => unfavorite(selectedImages)}
              onAddToSeries={(id) => addTo(`series:${id}`, selectedImages)}
              onCreateSeries={(name) => newSeriesWith(name, selectedImages)}
              newSeriesName={uniqueSeriesName(library, "Ny serie")}
              onSelectAll={() => setSelected(new Set(images.map((img) => img.path)))}
              allSelected={selectedImages.length === images.length}
              onClear={() => setSelected(new Set())}
            />
          )}
          {listing && inFolders && <SubfolderBar subfolders={listing.subfolders} onOpen={(p) => void loadFolders([p])} />}
          {locked ? (
            <LockedState name={itemName(view)} onUnlock={() => void unlock(view)} />
          ) : images.length > 0 ? (
            <Gallery
              viewKey={viewKey}
              images={images}
              imageKey={imageKey}
              rowHeight={rowHeight}
              settings={settings}
              onOpen={setViewerIndex}
              onTrash={requestTrash}
              onChangeImage={updateImage}
              favorites={favoritePaths}
              series={listedSeries}
              onToggleFavorite={onToggleFavorite}
              onToggleSeries={onToggleSeries}
              onEditHeading={(index, kind) => setHeadingEdit({ index, kind })}
              onMove={series && !filtering ? onMoveImage : undefined}
              tags={index.tags}
              onDropOnLibrary={onDropOnLibrary}
              selected={selected}
              onSelectionChange={setSelected}
              highlight={highlight}
            />
          ) : (
            <EmptyState
              kind={emptyKind}
              onOpenFolder={() => void openFolders()}
              onClearFilter={() => setFilter(NO_FILTER)}
              onRefresh={() => void refresh()}
              onShowSubfolders={
                listing && listing.subfolders.length > 0 && !includeSubfolders ? toggleSubfolders : undefined
              }
            />
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
            if (viewerLook) {
              setViewerLook(null);
              setPinned([]);
            }
          }}
          onTrash={requestTrash}
          isFavorite={(img) => favoritePaths.has(img.path)}
          tagsOf={(img) => index.tags.get(img.path) ?? []}
          onToggleFavorite={onToggleFavorite}
          series={listedSeries}
          onToggleSeries={(id, i) => {
            const image = images[i];
            const target = library.series.find((s) => s.id === id);
            if (!image || !target) return;
            const included = target.images.some((img) => img.path === image.path);
            onToggleSeries(id, i);
            showToast(included ? `Togs bort från ${target.name}.` : `Lades till i ${target.name}.`);
          }}
          onCreateSeries={(name, i) => images[i] && newSeriesWith(name, [images[i]])}
          newSeriesName={uniqueSeriesName(library, "Ny serie")}
          onShowShortcuts={() => setShortcutsOpen(true)}
          frame={settings.frame}
          pinned={pinned}
          onPinnedChange={setPinned}
          onSavePinned={savePinned}
          defaultPinnedName={uniqueSeriesName(library, "Fästa bilder")}
          savedLook={viewerLook ?? undefined}
          shadow={settings.shadow}
          paused={trashIndex !== null || shortcutsOpen}
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
        onConfirm={confirmTrash}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Toast key={toast?.id} toast={toast} onDone={() => setToast(null)} raised={selectedImages.length > 0} />
    </div>
  );
}
