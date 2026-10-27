import { useEffect, useState, type RefObject } from "react";
import type { Reveal, TileReveal } from "./settings";

/**
 * Becomes true the first time the element scrolls into view inside `root`,
 * and stays true so the animation only plays once.
 */
export function useRevealOnView(ref: RefObject<HTMLElement>, root: HTMLElement | null, enabled: boolean) {
  const [shown, setShown] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { root, threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, root, enabled]);

  return shown;
}

/**
 * The effects "Växla automatiskt" takes turns with, one per row. Every third row stays still,
 * so not everything on screen moves at once.
 */
export const AUTO_CYCLE: TileReveal[] = [
  "fade",
  "slide-left",
  "none",
  "slide-right",
  "rise",
  "none",
  "cascade",
  "parallax",
  "none",
];

/**
 * Resolves the effects that vary by row: "slide-alternate" comes from the left on even rows
 * and from the right on odd ones; "auto" moves on to the next effect each row.
 */
export function resolveReveal(reveal: Reveal, row: number): TileReveal {
  if (reveal === "slide-alternate") return row % 2 === 0 ? "slide-left" : "slide-right";
  if (reveal === "auto") return AUTO_CYCLE[row % AUTO_CYCLE.length];
  return reveal;
}
