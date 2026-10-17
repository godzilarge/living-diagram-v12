// The keyboard of edit mode (`state/edit-keys.ts`), listened to on the window at the capture phase before the shell's
// keys (`useShellKeys`): a key edit mode takes stops there (N and G are the palette's in the mode). Never while the
// focus is in a field, an editable text or an open layer (a list, a popover, the search palette), which keep their
// keys. Enter and Tab are the map's only when the focus sits on it (or on nothing); on a button they keep their sense.
// The native copy, cut and paste events (Ctrl+C / X / V) go to the canvas's selection in edit mode, unless the page
// has text selected or the focus is in a field: the browser then keeps them.
import { useEffect, useRef } from "react";
import { editKeyOf } from "../state/edit-keys";
import type { EditKey } from "../state/edit-keys";
import { focusMap } from "../edit/focus";

const FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function editable(target: EventTarget | null): boolean {
  if (document.querySelector("[data-layer]")) return true;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || FIELDS.has(target.tagName);
}

/** The focus is on the map, or on the page itself: a node of the canvas, the canvas, the body. */
function onCanvas(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  if (target === document.body || target.classList.contains("diagram") || target.classList.contains("diagram-canvas")) return true;
  return !!target.closest(".flow-host") && !target.closest("[data-float]");
}

/** The keys a toolbar keeps for itself when it holds the focus (the edit palette, a contextual bar): its arrows walk
 *  its buttons (`edit/useToolbarKeys.ts`). */
const TOOLBAR_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);
const plain = (event: KeyboardEvent): boolean => !event.ctrlKey && !event.metaKey && !event.altKey;
function toolbarKey(event: KeyboardEvent): boolean {
  return plain(event) && TOOLBAR_KEYS.has(event.key) && event.target instanceof HTMLElement && !!event.target.closest("[role='toolbar']");
}

/** Escape on a contextual bar (no volet open: an open layer takes its Escape first) gives the focus back to the map
 *  and keeps the selection; anywhere else it puts the tool away, then lets go. */
function barEscape(event: KeyboardEvent): boolean {
  return plain(event) && event.key === "Escape" && !document.querySelector("[data-layer]") && event.target instanceof HTMLElement && !!event.target.closest("[data-float='context-bar']");
}


export type EditKeysContext = Readonly<{ editing: boolean; hasSelection: boolean }>;
export type ClipboardHandlers = Readonly<{
  onCopy: (data: DataTransfer, cut: boolean) => boolean;
  onPaste: (data: DataTransfer) => boolean;
  /** Ctrl+Shift+V: the paste event that follows, as a code block; null when the browser sent none (the page reads
   *  the clipboard itself). */
  onPasteCode: (data: DataTransfer | null) => void;
}>;

/** After Ctrl+Shift+V the browser's `paste` comes in the same task; without it after this long the page reads the
 *  clipboard itself; armed, the paste stays "as a code block" this long at most (the v1's rule). */
const AS_CODE_WAIT_MS = 300, AS_CODE_MS = 1000;

export function useEditKeys(run: (key: EditKey) => void, context: EditKeysContext, clipboard: ClipboardHandlers): void {
  const latest = useRef({ run, context, clipboard });
  latest.current = { run, context, clipboard };
  useEffect(() => {
    const asCode = { at: 0, timer: null as number | null };
    const disarm = (): void => { if (asCode.timer !== null) window.clearTimeout(asCode.timer); asCode.at = 0; asCode.timer = null; };
    const onKey = (event: KeyboardEvent): void => {
      const { context: ctx } = latest.current;
      if (ctx.editing && toolbarKey(event)) return;
      if (ctx.editing && barEscape(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        focusMap();
        return;
      }
      const key = editKeyOf(event, { editing: ctx.editing, editable: editable(event.target), onCanvas: onCanvas(event.target), hasSelection: ctx.hasSelection });
      if (!key) return;
      if (key.kind === "pasteCode") {
        // the browser's paste is let through (it carries the clipboard); without it, the page reads the clipboard
        disarm();
        asCode.at = performance.now();
        asCode.timer = window.setTimeout(() => { asCode.timer = null; if (asCode.at) { asCode.at = 0; latest.current.clipboard.onPasteCode(null); } }, AS_CODE_WAIT_MS);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      latest.current.run(key);
    };
    const onPaste = (event: ClipboardEvent): void => {
      if (!latest.current.context.editing || editable(event.target) || !event.clipboardData) return;
      if (asCode.at && performance.now() - asCode.at < AS_CODE_MS) {
        disarm();
        event.preventDefault();
        latest.current.clipboard.onPasteCode(event.clipboardData);
        return;
      }
      if (latest.current.clipboard.onPaste(event.clipboardData)) event.preventDefault();
    };
    const onCopy = (cut: boolean) => (event: ClipboardEvent): void => {
      if (!latest.current.context.editing || editable(event.target) || !event.clipboardData) return;
      if (String(window.getSelection?.() ?? "")) return; // text selected in the page: the browser copies it
      if (latest.current.clipboard.onCopy(event.clipboardData, cut)) event.preventDefault();
    };
    const copy = onCopy(false), cut = onCopy(true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("paste", onPaste);
    window.addEventListener("copy", copy);
    window.addEventListener("cut", cut);
    return () => {
      disarm();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("copy", copy);
      window.removeEventListener("cut", cut);
    };
  }, []);
}
