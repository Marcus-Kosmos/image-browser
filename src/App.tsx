import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Gallery } from "@/components/Gallery";
import { SubfolderBar } from "@/components/SubfolderBar";
import { Toast, type ToastMessage } from "@/components/Toast";
import { Toolbar, ROW_HEIGHT_MAX, ROW_HEIGHT_MIN } from "@/components/Toolbar";
import { TrashDialog } from "@/components/TrashDialog";
import { Viewer } from "@/components/Viewer";
import { pickFolders, scanFolder, trashFile, type ImageEntry } from "@/lib/api";
import { useFolderSettings } from "@/lib/settings";
import { folderName, parentFolder } from "@/lib/utils";

const STORAGE_FOLDERS = "image-browser:last-folders";

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
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [trashIndex, setTrashIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const folders = listing?.folders ?? [];
  const multiple = folders.length > 1;
  const viewKey = folders.join("\n");
  const { settings, update: updateSettings, updateImage } = useFolderSettings(listing ? viewKey : null);
  // File names can repeat across folders, so several folders key settings by full path.
  const imageKey = useCallback((image: ImageEntry) => (multiple ? image.path : image.name), [multiple]);

  const showToast = useCallback((text: string, tone: ToastMessage["tone"] = "success") => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  const loadFolders = useCallback(
    async (paths: string[]) => {
      const sorted = [...new Set(paths)].sort((a, b) => a.localeCompare(b, "sv", { numeric: true }));
      const results = await Promise.allSettled(sorted.map((p) => scanFolder(p)));
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
        images: loaded.flatMap((l) => l.images),
        // Folders that are already open don't need a shortcut.
        subfolders: loaded.flatMap((l) => l.subfolders).filter((p) => !opened.includes(p)),
      });
      setViewerIndex(null);
      store(STORAGE_FOLDERS, JSON.stringify(opened));
    },
    [showToast],
  );

  const openFolders = useCallback(async () => {
    const paths = await pickFolders();
    if (paths.length > 0) await loadFolders(paths);
  }, [loadFolders]);

  useEffect(() => {
    try {
      const last = JSON.parse(readStored(STORAGE_FOLDERS) ?? "[]");
      if (Array.isArray(last) && last.length > 0) void loadFolders(last);
    } catch {
      // Ignore a corrupt value; the user just picks a folder again.
    }
  }, [loadFolders]);

  const parent = folders.length === 1 ? parentFolder(folders[0]) : null;
  const goToParent = parent ? () => void loadFolders([parent]) : null;
  const refresh = useCallback(() => {
    if (listing) void loadFolders(listing.folders);
  }, [listing, loadFolders]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === "o") {
        e.preventDefault();
        void openFolders();
      } else if (e.key === "r") {
        e.preventDefault();
        refresh();
      } else if (e.key === "ArrowUp" && parent && viewerIndex === null) {
        e.preventDefault();
        void loadFolders([parent]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFolders, refresh, parent, viewerIndex, loadFolders]);

  const confirmTrash = async () => {
    if (!listing || trashIndex === null) return;
    const image = listing.images[trashIndex];
    setTrashIndex(null);
    try {
      await trashFile(image.path);
    } catch (err) {
      showToast(typeof err === "string" ? err : "Kunde inte flytta bilden till papperskorgen.", "error");
      return;
    }
    const images = listing.images.filter((_, i) => i !== trashIndex);
    setListing({ ...listing, images });
    if (viewerIndex !== null) {
      // Stay on the same position, which now holds the next image.
      setViewerIndex(images.length === 0 ? null : Math.min(viewerIndex, images.length - 1));
    }
    showToast(`${image.name} flyttades till papperskorgen.`);
  };

  const images = listing?.images ?? [];

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        folders={folders}
        imageCount={images.length}
        rowHeight={rowHeight}
        onRowHeightChange={(value) => {
          setRowHeight(value);
          store(STORAGE_ROW_HEIGHT, String(value));
        }}
        onOpenFolder={() => void openFolders()}
        onParent={goToParent}
        onRefresh={refresh}
        settings={settings}
        onSettingsChange={updateSettings}
      />
      {listing && <SubfolderBar subfolders={listing.subfolders} onOpen={(p) => void loadFolders([p])} />}
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
        />
      ) : (
        <EmptyState hasFolder={listing !== null} onOpenFolder={() => void openFolders()} />
      )}
      {viewerIndex !== null && images[viewerIndex] && (
        <Viewer
          images={images}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onTrash={setTrashIndex}
          paused={trashIndex !== null}
        />
      )}
      <TrashDialog
        image={trashIndex !== null ? images[trashIndex] ?? null : null}
        onCancel={() => setTrashIndex(null)}
        onConfirm={() => void confirmTrash()}
      />
      <Toast key={toast?.id} toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
