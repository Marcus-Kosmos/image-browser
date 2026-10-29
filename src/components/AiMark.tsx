import { Sparkles, WandSparkles } from "lucide-react";
import type { ImageEntry } from "@/lib/api";

/** The AI mark's icon and words: Imagime's own enlargements and other programs' AI pictures look different. */
export function AiMark({
  kind,
  className,
  iconOnly = false,
}: {
  kind: NonNullable<ImageEntry["ai"]>;
  className?: string;
  /** Just the icon, where there is no room for the words; the title says them. */
  iconOnly?: boolean;
}) {
  const Icon = kind === "imagime" ? WandSparkles : Sparkles;
  return (
    <>
      <Icon className={className} aria-hidden />
      {!iconOnly && (kind === "imagime" ? "AI-förstorad" : "AI-bild")}
    </>
  );
}

export const aiMarkTitle = (kind: NonNullable<ImageEntry["ai"]>) =>
  kind === "imagime" ? "Förstorad med AI i Imagime" : "Märkt som gjord med AI av ett annat program";
