import { useEffect, useState, type RefObject } from "react";
import type { Reveal } from "./settings";

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

/** Resolves "slide-alternate" to a direction: even rows come from the left, odd from the right. */
export function resolveReveal(reveal: Reveal, row: number): Exclude<Reveal, "slide-alternate"> {
  if (reveal !== "slide-alternate") return reveal;
  return row % 2 === 0 ? "slide-left" : "slide-right";
}
