// A toolbar's keyboard (WAI-ARIA toolbar): one stop in the tab order (roving tabindex: the button last focused, else
// the first), the arrows of its orientation walk its buttons, Home and End go to the ends. The page's edit keys leave
// those keys to a toolbar that holds the focus (`diagram/useEditKeys.ts`). The tab stops are set on the DOM after each
// render (the buttons are primitives; their `tabindex` is not React's to keep).
import { useCallback, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

const buttonsOf = (root: HTMLElement | null): HTMLElement[] => (root ? Array.from(root.querySelectorAll<HTMLElement>(":scope button")) : []);

export function useToolbarKeys<T extends HTMLElement>(orientation: "horizontal" | "vertical") {
  const ref = useRef<T>(null);
  const at = useRef(0);
  useLayoutEffect(() => {
    const buttons = buttonsOf(ref.current);
    const stop = Math.min(at.current, buttons.length - 1);
    buttons.forEach((button, index) => button.setAttribute("tabindex", index === stop ? "0" : "-1"));
  });
  const onFocus = useCallback(() => {
    const found = buttonsOf(ref.current).indexOf(document.activeElement as HTMLElement);
    if (found < 0) return;
    at.current = found;
    buttonsOf(ref.current).forEach((button, index) => button.setAttribute("tabindex", index === found ? "0" : "-1"));
  }, []);
  const onKeyDown = useCallback((event: KeyboardEvent<T>) => {
    const back = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const forth = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
    const buttons = buttonsOf(ref.current);
    const from = buttons.indexOf(document.activeElement as HTMLElement);
    if (from < 0 || !buttons.length) return;
    const next = event.key === back ? (from - 1 + buttons.length) % buttons.length : event.key === forth ? (from + 1) % buttons.length
      : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    event.stopPropagation();
    buttons[next].focus();
  }, [orientation]);
  return { ref, onFocus, onKeyDown };
}
