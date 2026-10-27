import type { Frame } from "./settings";

/** Padding and color of each frame; the padding grows with the picture, like a real mat. */
export function frameStyle(frame: Frame, width: number, height: number): React.CSSProperties {
  const short = Math.min(width, height);
  switch (frame) {
    case "line":
      return { border: "1px solid color-mix(in oklab, var(--foreground) 35%, transparent)" };
    case "mat":
      return {
        padding: Math.max(6, Math.round(short * 0.05)),
        background: "#fbfaf7",
        border: "1px solid rgb(0 0 0 / 0.08)",
      };
    case "black":
      return { padding: Math.max(4, Math.round(short * 0.03)), background: "#111" };
    default:
      return {};
  }
}

/** Shadow drawn inside the frame, over the picture. */
export const INSET_SHADOW = "inset 0 0 24px rgb(0 0 0 / 0.6), inset 0 0 4px rgb(0 0 0 / 0.4)";
