import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DropOverlay } from "@/components/DropOverlay";
import { UpscaleDialog, type UpscaleChoice } from "@/components/UpscaleDialog";
import { PublishDialog } from "@/components/PublishDialog";
import {
  confirmOwner,
  onFileDrop,
  pickFolders,
  pickImages,
  pickSaveFolder,
  publishWebPage,
  scanFolder,
  sortDropped,
  contentHashes,
  trashFile,
  upscaleImage,
  cloudUpscaleImage,
  imageDataUrl,
  saveEnlarged,
  revealInFinder,
  fileStates,
  expectBiggerPicsDownload,
  writeWebPage,
  type ImageEntry,
  type WebHost,
} from "@/lib/api";
import {
  NO_FILTER,
  filterImages,
  isFiltering,
  keepDuplicates,
  libraryIndex,
  possibleDuplicates,
  type ImageFilter,
  type Tag,
} from "@/lib/filter";
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
  removeFromSeries,
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
import { openBiggerPics, upscaleWithBiggerPics } from "@/lib/biggerpics";
import { buildWebPage, pagePictures, saveWebHost } from "@/lib/webpage";
import { folderName, parentFolder } from "@/lib/utils";
import type { Waiting } from "@/components/WaitingRing";

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
const STORAGE_SHOW_AI = "image-browser:show-ai-mark";

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
  const [showAiMark, setShowAiMark] = useState(() => readStored(STORAGE_SHOW_AI) !== "false");
  const changeShowAiMark = (show: boolean) => {
    setShowAiMark(show);
    store(STORAGE_SHOW_AI, String(show));
  };
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
  const {
    settings,
    update: updateSettings,
    updateImage,
  } = useFolderSettings(inFolders ? (listing ? viewKey : null) : viewKey);
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

  const showToast = useCallback(
    (text: string, tone: ToastMessage["tone"] = "success", action?: ToastMessage["action"]) => {
      setToast({ id: Date.now(), text, tone, action });
    },
    [],
  );
  const reveal = useCallback(
    (paths: string[]) => revealInFinder(paths).catch((e) => showToast(String(e), "error")),
    [showToast],
  );

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

  // Pictures and folders the library remembers can be moved, changed or deleted in Finder meanwhile.
  // Looked up again whenever the library changes and when the app comes back to the front.
  const [onDisk, setOnDisk] = useState<Map<string, number | null>>(new Map());
  useEffect(() => {
    const paths = [
      ...new Set([
        ...library.favorites.map((i) => i.path),
        ...library.series.flatMap((s) => s.images.map((i) => i.path)),
        ...(library.recent ?? []).flat(),
        ...(library.places ?? []).flatMap((p) => p.folders),
      ]),
    ];
    let current = true;
    const look = () =>
      fileStates(paths)
        .then((states) => {
          if (current && states) setOnDisk(new Map(paths.map((p, i) => [p, states[i]])));
        })
        .catch(() => {});
    void look();
    window.addEventListener("focus", look);
    return () => {
      current = false;
      window.removeEventListener("focus", look);
    };
  }, [library]);
  const goneFolders = useMemo(
    () => new Set([...onDisk].filter(([, modified]) => modified === null).map(([path]) => path)),
    [onDisk],
  );

  const allImages = useMemo(() => {
    if (locked) return [];
    if (view.kind === "folders") return listing?.images ?? [];
    const kept = view.kind === "favorites" ? library.favorites : (series?.images ?? []);
    return kept.map((image) => {
      const modified = onDisk.get(image.path);
      if (modified === null) return { ...image, gone: true };
      // The current time also fetches a fresh thumbnail.
      if (modified !== undefined && image.modified && modified !== image.modified) return { ...image, modified, changed: true };
      return image;
    });
  }, [locked, view.kind, library.favorites, series, listing, onDisk]);
  // Tags are Favoriter and the series an image is in; hidden ones count only while shown.
  const index = useMemo(() => libraryIndex(library, showHidden), [library, showHidden]);
  const [filter, setFilter] = useState<ImageFilter>(NO_FILTER);
  const filtering = isFiltering(filter);
  // Fingerprints of pictures' contents by path and change time, read only when looking for copies.
  const [hashCache, setHashCache] = useState<Map<string, string>>(() => new Map());
  const hashKey = (img: ImageEntry) => `${img.path}|${img.modified}`;
  useEffect(() => {
    if (!filter.duplicates) return;
    const wanted = possibleDuplicates(allImages).filter((img) => !hashCache.has(hashKey(img)));
    if (wanted.length === 0) return;
    let stale = false;
    if (wanted.length > 20) showToast(`Jämför ${wanted.length} bilder för att hitta dubbletter…`);
    contentHashes(wanted.map((img) => img.path))
      .then((found) => {
        if (stale) return;
        setHashCache((prev) => {
          const next = new Map(prev);
          wanted.forEach((img, i) => next.set(hashKey(img), found[i] ?? `oläslig:${img.path}`));
          return next;
        });
      })
      .catch(() => !stale && showToast("Kunde inte jämföra bilderna.", "error"));
    return () => {
      stale = true;
    };
  }, [filter.duplicates, allImages, hashCache, showToast]);
  const images = useMemo(() => {
    const shown = filterImages(allImages, filter, index);
    if (!filter.duplicates) return shown;
    const hashes = new Map<string, string>();
    for (const img of shown) {
      const hash = hashCache.get(hashKey(img));
      if (hash) hashes.set(img.path, hash);
    }
    return keepDuplicates(shown, hashes);
  }, [allImages, filter, index, hashCache]);
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
        (fresh.length === 1
          ? `${fresh[0].name} lades till i ${name}.`
          : `${fresh.length} bilder lades till i ${name}.`) + (already > 0 ? ` ${already} fanns redan där.` : ""),
      );
    },
    [library, changeLibrary, showToast],
  );

  const unfavorite = useCallback(
    (removed: ImageEntry[]) => {
      const gone = removed.filter((img) => favoritePaths.has(img.path));
      if (gone.length === 0) return;
      changeLibrary((lib) => removeFromFavorites(lib, gone));
      showToast(
        gone.length === 1
          ? `${gone[0].name} togs bort från Favoriter.`
          : `${gone.length} bilder togs bort från Favoriter.`,
      );
    },
    [favoritePaths, changeLibrary, showToast],
  );

  /** Takes images out of the series shown; unlike the trash, the files stay where they are. */
  const takeOutOfSeries = (removed: ImageEntry[]) => {
    if (!series || removed.length === 0) return;
    changeLibrary((lib) => removeFromSeries(lib, series.id, removed));
    setSelected(new Set());
    if (viewerIndex !== null) {
      // The next image takes its place; after the last one, the one before it.
      if (images.length <= removed.length) setViewerIndex(null);
      else if (viewerIndex >= images.length - removed.length) setViewerIndex(images.length - removed.length - 1);
    }
    showToast(
      removed.length === 1
        ? `${removed[0].name} togs bort ur ${series.name}. Filen finns kvar.`
        : `${removed.length} bilder togs bort ur ${series.name}. Filerna finns kvar.`,
    );
  };

  const newSeriesWith = useCallback(
    (name: string, added: ImageEntry[]) => {
      const unique = uniqueSeriesName(library, name);
      changeLibrary((lib) => createSeries(lib, crypto.randomUUID(), unique, added));
      showToast(`Serien ${unique} skapades med ${added.length === 1 ? "bilden" : `${added.length} bilder`}.`);
    },
    [library, changeLibrary, showToast],
  );

  const onDropOnLibrary = useCallback(
    (indices: number[], target: string) => {
      const dropped = indices.flatMap((i) => (images[i] ? [images[i]] : []));
      if (target !== "new-series") return addTo(target, dropped);
      // Dropped below the series: a new one, named right away in the sidebar.
      const id = crypto.randomUUID();
      const name = uniqueSeriesName(library, "Ny serie");
      changeLibrary((lib) => createSeries(lib, id, name, dropped));
      setRenamingId(id);
      showToast(`Serien ${name} skapades med ${dropped.length === 1 ? "bilden" : `${dropped.length} bilder`}.`);
    },
    [images, addTo, library, changeLibrary, showToast],
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
          // The whole series pinned, from its first page.
          setPinned(images);
          setViewerIndex(0);
        }
      : undefined;

  // The series or Favoriter as a web page, to put on the user's own web host or save on the Mac.
  const [publishing, setPublishing] = useState(false);
  const webPage = (title: string) => {
    const { pictures, files } = pagePictures(images, (img) => settings.images[imageKey(img)]);
    const html = buildWebPage(title, pictures, {
      background: settings.background,
      frame: settings.frame,
      shadow: settings.shadow,
      rounded: series?.look?.rounded ?? false,
    });
    return { html, files };
  };
  const publishPage = async (host: WebHost, name: string) => {
    const { html, files } = webPage(libraryTitle ?? name);
    const result = await publishWebPage(host, name, html, files);
    // Remember the SFTP server's key, so a different server answering later is noticed.
    if (result.fingerprint) saveWebHost({ ...host, fingerprint: result.fingerprint });
    return result.url;
  };
  const savePageLocally = async (name: string) => {
    const parent = await pickSaveFolder();
    if (!parent) return null;
    const dir = `${parent.replace(/\/+$/, "")}/${name}`;
    const { html, files } = webPage(libraryTitle ?? name);
    await writeWebPage(dir, html, files);
    return dir;
  };

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
      item.kind === "favorites"
        ? library.favorites
        : (library.series.find((s) => s.id === (item as { id: string }).id)?.images ?? []),
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

  // Files and folders dragged in from Finder. In a series the images are added to it;
  // otherwise their folders open and the first image is shown in full screen.
  const [dropping, setDropping] = useState(false);
  const [showOnLoad, setShowOnLoad] = useState<string | null>(null);
  const dropInto = series && !locked ? series : null;
  /** Paths compare equal however their letters (å, ä, ö) were composed. */
  const samePath = (path: string) => path.normalize("NFC");
  const handleDrop = async (paths: string[]) => {
    const { folders: droppedFolders, images: droppedImages } = await sortDropped(paths);
    if (droppedFolders.length === 0 && droppedImages.length === 0) {
      showToast("Det finns inga bilder eller mappar bland det du släppte.", "error");
      return;
    }
    if (dropInto && droppedImages.length > 0) {
      const parents = [...new Set(droppedImages.map(parentFolder).filter((p): p is string => p !== null))];
      const listings = await Promise.allSettled(parents.map((p) => scanFolder(p, false)));
      const wanted = new Set(droppedImages.map(samePath));
      const entries = listings
        .flatMap((r) => (r.status === "fulfilled" ? r.value.images : []))
        .filter((img) => wanted.has(samePath(img.path)));
      if (entries.length === 0) {
        showToast("Kunde inte läsa bilderna.", "error");
        return;
      }
      addTo(`series:${dropInto.id}`, entries);
      // Show the first one where it now is in the series.
      setShowOnLoad(entries[0].path);
      return;
    }
    const parents = droppedImages.map(parentFolder).filter((p): p is string => p !== null);
    const targets = [...new Set([...droppedFolders, ...parents])];
    setFilter(NO_FILTER);
    setShowOnLoad(droppedImages[0] ?? null);
    const count = await loadFolders(targets);
    if (count !== null) changeLibrary((lib) => rememberFolders(lib, targets));
  };
  // AI enlargement: a new file beside the original, shown once it is read in.
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const upscaling = waiting !== null;
  // The picture the wand was clicked for, while the dialog asks how to enlarge it.
  const [upscaleFor, setUpscaleFor] = useState<ImageEntry | null>(null);
  /** Asks bigger.pics, open in `popup`, to enlarge the picture; null when the window was closed without it. */
  const enlargeWithBiggerPics = async (image: ImageEntry, popup: Window | null) => {
    if (!popup) throw "bigger.pics kunde inte öppnas.";
    const format = /\.jpe?g$/i.test(image.name) ? "jpeg" : "png";
    // The Download button there saves beside the original too, and closes the window.
    let downloaded = null as string | null;
    const stopWaiting = new AbortController();
    const stopDownloads = await expectBiggerPicsDownload(image, (path) => {
      downloaded = path;
      stopWaiting.abort();
    });
    try {
      const result = await upscaleWithBiggerPics(
        popup,
        { url: () => imageDataUrl(image), name: image.name, format, context: image.path },
        window,
        stopWaiting.signal,
      );
      // The picture is back: a download bigger.pics makes as well would only be a copy.
      stopDownloads();
      if (downloaded) return downloaded;
      return result && (await saveEnlarged(image, result.blob, format));
    } finally {
      stopDownloads();
    }
  };
  const upscale = async (image: ImageEntry, choice: UpscaleChoice, popup: Window | null) => {
    setWaiting({ path: image.path, since: Date.now() });
    showToast(
      choice.mode === "local"
        ? `Förstorar ${image.name} med AI. Det kan ta upp till en minut.`
        : choice.mode === "bigger"
          ? `Förstora ${image.name} i bigger.pics-fönstret och klicka på Send this back eller Download.`
          : `Skickar ${image.name} till Stability AI. Det kan ta ett par minuter.`,
    );
    try {
      const made =
        choice.mode === "local"
          ? await upscaleImage(image)
          : choice.mode === "bigger"
            ? await enlargeWithBiggerPics(image, popup)
            : await cloudUpscaleImage(image, { mode: choice.mode, prompt: choice.prompt, amount: choice.amount });
      if (!made) {
        showToast("bigger.pics stängdes utan att bilden skickades tillbaka.");
        return;
      }
      const name = made.split("/").pop() ?? made;
      if (series && !locked) {
        // In a series, the copy goes into it, beside the original.
        await handleDrop([made]);
      } else if (listing) {
        await loadFolders(listing.folders, includeSubfolders, true);
      }
      setShowOnLoad(made);
      showToast(`Sparad som ${name}, bredvid originalet.`, "success", {
        label: "Visa i Finder",
        run: () => void reveal([made]),
      });
    } catch (e) {
      showToast(typeof e === "string" ? e : "AI-förstoringen misslyckades.", "error");
    } finally {
      setWaiting(null);
    }
  };
  // Picked in a dialog that previews the pictures, they open like pictures dropped from Finder.
  const openImages = async () => {
    const paths = await pickImages();
    if (paths.length > 0) await handleDrop(paths);
  };
  const latestOpenImages = useRef(openImages);
  latestOpenImages.current = openImages;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void latestOpenImages.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const latestDrop = useRef(handleDrop);
  latestDrop.current = handleDrop;
  useEffect(
    () =>
      onFileDrop((state) => {
        if (state === "over") setDropping(true);
        else if (state === "left") setDropping(false);
        else {
          setDropping(false);
          void latestDrop.current(state.dropped);
        }
      }),
    [],
  );
  // A dropped image opens full screen once its folder, or the series it went into, is shown.
  useEffect(() => {
    if (!showOnLoad) return;
    const wanted = samePath(showOnLoad);
    const i = images.findIndex((img) => samePath(img.path) === wanted);
    if (i < 0) return;
    setViewerIndex(i);
    setShowOnLoad(null);
  }, [images, showOnLoad]);
  // Say so when it never turns up, rather than leaving the drop unanswered.
  useEffect(() => {
    if (!showOnLoad) return;
    const t = window.setTimeout(() => {
      setShowOnLoad(null);
      showToast(`Kunde inte visa ${showOnLoad.split("/").pop()}.`, "error");
    }, 5000);
    return () => window.clearTimeout(t);
  }, [showOnLoad, showToast]);

  const libraryTitle = view.kind === "favorites" ? "Favoriter" : (series?.name ?? null);
  const emptyKind: EmptyKind =
    filtering && allImages.length > 0
      ? "no-match"
      : view.kind === "favorites"
        ? "favorites"
        : series
          ? "series"
          : listing
            ? "empty-folder"
            : "no-folder";

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
        onOpenImages={() => void openImages()}
        onParent={goToParent}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
        onShowPuzzle={showPuzzle}
        onPublish={libraryTitle !== null && images.length > 0 && !locked ? () => setPublishing(true) : undefined}
        includeSubfolders={includeSubfolders}
        onToggleSubfolders={toggleSubfolders}
        settings={settings}
        onSettingsChange={updateSettings}
        askBeforeTrash={askBeforeTrash}
        onAskBeforeTrashChange={changeAskBeforeTrash}
        showAiMark={showAiMark}
        onShowAiMarkChange={changeShowAiMark}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <Sidebar
            folders={folders}
            goneFolders={goneFolders}
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
              const name =
                listing.folders.length === 1 ? folderName(listing.folders[0]) : `${listing.folders.length} mappar`;
              changeLibrary((lib) =>
                savePlace(lib, { id, name, folders: listing.folders, recursive: includeSubfolders }),
              );
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
              onRemoveFromSeries={series ? () => takeOutOfSeries(selectedImages) : undefined}
              newSeriesName={uniqueSeriesName(library, "Ny serie")}
              onSelectAll={() => setSelected(new Set(images.map((img) => img.path)))}
              allSelected={selectedImages.length === images.length}
              onClear={() => setSelected(new Set())}
              onReveal={() => void reveal(selectedImages.map((img) => img.path))}
            />
          )}
          {listing && inFolders && (
            <SubfolderBar subfolders={listing.subfolders} onOpen={(p) => void loadFolders([p])} />
          )}
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
              onRemove={series ? (i) => images[i] && takeOutOfSeries([images[i]]) : undefined}
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
              showAiMark={showAiMark}
              waiting={waiting}
            />
          ) : (
            <EmptyState
              kind={emptyKind}
              onOpenFolder={() => void openFolders()}
              onOpenImages={() => void openImages()}
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
          onRemove={series && !locked ? (i) => images[i] && takeOutOfSeries([images[i]]) : undefined}
          onUpscale={(i) => images[i] && setUpscaleFor(images[i])}
          onReveal={(i) => images[i] && void reveal([images[i].path])}
          upscaling={upscaling}
          showAiMark={showAiMark}
          onShowAiMarkChange={changeShowAiMark}
          waiting={waiting}
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
          headingOf={(img) => settings.images[imageKey(img)]?.heading}
          shadow={settings.shadow}
          paused={trashIndex !== null || shortcutsOpen || upscaleFor !== null}
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
        image={trashIndex !== null ? (images[trashIndex] ?? null) : null}
        onCancel={() => setTrashIndex(null)}
        onConfirm={confirmTrash}
      />
      <UpscaleDialog
        image={upscaleFor}
        onCancel={() => setUpscaleFor(null)}
        onStart={(choice) => {
          const image = upscaleFor;
          setUpscaleFor(null);
          // The window has to open in the click itself, before anything is awaited.
          const popup = choice.mode === "bigger" ? openBiggerPics() : null;
          if (image) void upscale(image, choice, popup);
        }}
      />
      <PublishDialog
        seriesName={publishing ? libraryTitle : null}
        onClose={() => setPublishing(false)}
        onPublish={publishPage}
        onSaveLocal={savePageLocally}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {dropping && <DropOverlay into={dropInto?.name ?? null} />}
      <Toast key={toast?.id} toast={toast} onDone={() => setToast(null)} raised={selectedImages.length > 0} />
    </div>
  );
}
