import { Sparkles, WandSparkles } from "lucide-react";
import type { ImageEntry } from "@/lib/api";

/** The AI mark's icon and words: Imagime's own enlargements and other programs' AI pictures look different. */
export function AiMark({ kind, className }: { kind: NonNullable<ImageEntry["ai"]>; className?: string }) {
  const Icon = kind === "imagime" ? WandSparkles : Sparkles;
  return (
    <>
      <Icon className={className} aria-hidden />
      {kind === "imagime" ? "AI-förstorad" : "AI-bild"}
    </>
  );
}

export const aiMarkTitle = (kind: NonNullable<ImageEntry["ai"]>) =>
  kind === "imagime" ? "Förstorad med AI i Imagime" : "Märkt som gjord med AI av ett annat program";
