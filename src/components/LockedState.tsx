import { Fingerprint, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown instead of the images of a locked series or locked favorites. */
export function LockedState({ name, onUnlock }: { name: string; onUnlock: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Lock className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <h1 className="text-base font-semibold">{name} är låst</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Lås upp med Touch ID eller datorns lösenord. Den låses igen när du lämnar den eller lägger appen i bakgrunden.
        </p>
      </div>
      <Button onClick={onUnlock} data-autofocus>
        <Fingerprint />
        Lås upp
      </Button>
    </div>
  );
}
