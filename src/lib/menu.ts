import { useEffect, useRef, type RefObject } from "react";

/** Fields where a click starts a choice rather than makes one: typing, or a list that opens. */
const FIELD = "input:not([type=checkbox]):not([type=radio]), select, textarea";

/**
 * Closes an open menu when the pointer leaves it after a choice was made in it, so it does not
 * have to be clicked away. `root` holds the menu (and may hold its button, which is not a choice).
 * Before any choice, or while a field in it is being used, leaving keeps it open.
 */
export function useCloseOnLeaveAfterChoice(root: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const onClose = useRef(close);
  onClose.current = close;

  useEffect(() => {
    const el = root.current;
    if (!open || !el) return;
    let chose = false;
    let timer = 0;
    const isField = (t: EventTarget | null) => t instanceof Element && !!t.closest(FIELD);
    const onDown = (e: PointerEvent) => {
      if (isField(e.target)) chose = false;
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element) || isField(t) || t.closest("[aria-expanded]")) return;
      if (t.closest("button, [role^=menuitem], label, a")) chose = true;
    };
    const onChange = () => {
      chose = true;
    };
    const onLeave = () => {
      if (chose) timer = window.setTimeout(() => onClose.current(), 250);
    };
    const onEnter = () => window.clearTimeout(timer);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick);
    el.addEventListener("change", onChange);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerenter", onEnter);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick);
      el.removeEventListener("change", onChange);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerenter", onEnter);
    };
  }, [root, open]);
}
