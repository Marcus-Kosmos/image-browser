import { useEffect } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

export interface ToastMessage {
  id: number;
  text: string;
  tone: "success" | "error";
}

export function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDone, toast.tone === "error" ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [toast, onDone]);

  if (!toast) return null;
  const Icon = toast.tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[60] flex max-w-md -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover px-4 py-2.5 text-sm shadow-lg"
    >
      <Icon className={`size-4 shrink-0 ${toast.tone === "error" ? "text-destructive" : "text-muted-foreground"}`} />
      {toast.text}
    </div>
  );
}
