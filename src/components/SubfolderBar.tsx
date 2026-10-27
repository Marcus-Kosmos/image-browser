import { Folder } from "lucide-react";
import { folderName } from "@/lib/utils";

interface SubfolderBarProps {
  subfolders: string[];
  onOpen: (path: string) => void;
}

export function SubfolderBar({ subfolders, onOpen }: SubfolderBarProps) {
  if (subfolders.length === 0) return null;
  return (
    <nav aria-label="Undermappar" className="flex shrink-0 gap-2 overflow-x-auto border-b bg-background px-3 py-2">
      {subfolders.map((path) => (
        <button
          key={path}
          onClick={() => onOpen(path)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Folder className="size-3.5 text-muted-foreground" aria-hidden />
          {folderName(path)}
        </button>
      ))}
    </nav>
  );
}
