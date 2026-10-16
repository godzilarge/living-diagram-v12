// The page's single-key shortcuts (`state/keys.ts`), listened to on the window at the capture phase (the canvas's
// nodes take Escape for themselves otherwise): never while the focus is in a field, an editable text, or an open list
// or popover (a layer keeps its own keys: typeahead, Escape).
import { useEffect, useRef } from "react";
import { shellKeyOf } from "../state/keys";
import type { ShellKey } from "../state/keys";

const FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** The keys belong elsewhere: to a field, an editable text, or an open layer (a list, a popover: Escape closes it,
 *  whether the focus sits inside it or on its trigger). */
function editable(target: EventTarget | null): boolean {
  if (document.querySelector("[data-layer]")) return true;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || FIELDS.has(target.tagName);
}

export function useShellKeys(run: (key: ShellKey) => void): void {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const key = shellKeyOf(event, editable(event.target));
      if (!key) return;
      event.preventDefault();
      latest.current(key);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
