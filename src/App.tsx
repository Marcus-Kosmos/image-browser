import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ImageGrid } from "@/components/ImageGrid";
import { SubfolderBar } from "@/components/SubfolderBar";
import { Toast, type ToastMessage } from "@/components/Toast";
import { Toolbar, ROW_HEIGHT_MAX, ROW_HEIGHT_MIN } from "@/components/Toolbar";
import { TrashDialog } from "@/components/TrashDialog";
import { Viewer } from "@/components/Viewer";
import { pickFolder, scanFolder, trashFile, type FolderListing } from "@/lib/api";
import { parentFolder } from "@/lib/utils";

const STORAGE_FOLDER = "image-browser:last-folder";
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
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [rowHeight, setRowHeight] = useState(() => {
    const stored = Number(readStored(STORAGE_ROW_HEIGHT));
    return stored >= ROW_HEIGHT_MIN && stored <= ROW_HEIGHT_MAX ? stored : 220;
  });
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [trashIndex, setTrashIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, tone: ToastMessage["tone"] = "success") => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  const loadFolder = useCallback(
    async (path: string) => {
      try {
        const result = await scanFolder(path);
        setListing(result);
        setViewerIndex(null);
        store(STORAGE_FOLDER, path);
      } catch (err) {
        showToast(typeof err === "string" ? err : "Kunde inte öppna mappen.", "error");
      }
    },
    [showToast],
  );

  const openFolder = useCallback(async () => {
    const path = await pickFolder();
    if (path) await loadFolder(path);
  }, [loadFolder]);

  useEffect(() => {
    const last = readStored(STORAGE_FOLDER);
    if (last) void loadFolder(last);
  }, [loadFolder]);

  const parent = listing ? parentFolder(listing.path) : null;
  const goToParent = parent ? () => void loadFolder(parent) : null;
  const refresh = useCallback(() => {
    if (listing) void loadFolder(listing.path);
  }, [listing, loadFolder]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === "o") {
        e.preventDefault();
        void openFolder();
      } else if (e.key === "r") {
        e.preventDefault();
        refresh();
      } else if (e.key === "ArrowUp" && parent && viewerIndex === null) {
        e.preventDefault();
        void loadFolder(parent);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFolder, refresh, parent, viewerIndex, loadFolder]);

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
        folder={listing?.path ?? null}
        imageCount={images.length}
        rowHeight={rowHeight}
        onRowHeightChange={(value) => {
          setRowHeight(value);
          store(STORAGE_ROW_HEIGHT, String(value));
        }}
        onOpenFolder={() => void openFolder()}
        onParent={goToParent}
        onRefresh={refresh}
      />
      {listing && <SubfolderBar subfolders={listing.subfolders} onOpen={(p) => void loadFolder(p)} />}
      {images.length > 0 ? (
        <ImageGrid images={images} rowHeight={rowHeight} onOpen={setViewerIndex} onTrash={setTrashIndex} />
      ) : (
        <EmptyState hasFolder={listing !== null} onOpenFolder={() => void openFolder()} />
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
