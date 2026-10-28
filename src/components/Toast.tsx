import { useEffect } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

export interface ToastMessage {
  id: number;
  text: string;
  tone: "success" | "error";
  /** A button beside the text, such as "Visa i Finder". */
  action?: { label: string; run: () => void };
}

/** `raised` lifts it above the selection bar. */
export function Toast({
  toast,
  onDone,
  raised = false,
}: {
  toast: ToastMessage | null;
  onDone: () => void;
  raised?: boolean;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDone, toast.tone === "error" || toast.action ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [toast, onDone]);

  if (!toast) return null;
  const Icon = toast.tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role="status"
      className={`fixed ${raised ? "bottom-20" : "bottom-4"} left-1/2 z-[60] flex max-w-md -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover px-4 py-2.5 text-sm shadow-lg`}
    >
      <Icon className={`size-4 shrink-0 ${toast.tone === "error" ? "text-destructive" : "text-muted-foreground"}`} />
      {toast.text}
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.run();
            onDone();
          }}
          className="ml-1 shrink-0 rounded-md px-2 py-0.5 font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
