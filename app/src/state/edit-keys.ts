// The keyboard of edit mode (DESIGN.md, Navigation: the edit palette; the tooltips say the keys): M enters and leaves
// the mode from anywhere; in the mode, a letter picks a tool of the palette (V select, K connector, N note, S shape,
// T table, I image, B code block, G group; L, declare a cable, waits for its lot), Escape puts the tool away then
// lets go of the selection, Delete and Backspace delete what the intent owns, F2 (Enter on the map) edits in place,
// Tab walks the selection, the arrows nudge it by one grid step (five with Shift), Ctrl+Z / Ctrl+Y undo and redo,
// Ctrl+A selects everything, Ctrl+D duplicates, Alt + a letter aligns a multiple selection (the v1's letters), Alt+G
// snaps it to a grid; P pins, H hides, Ctrl+B sets bold, Ctrl+Shift+V pastes as a code block (the bars' keys). In
// edit mode N and G belong to the palette: the grid and the overview keep their keys in read mode only (their
// tooltips say so). The keys that act on the selection (Delete, F2, Tab, the arrows, P, H, Ctrl+A / B / D / Shift+V)
// are the map's: on a button, a tab, a row, they keep their own sense (the v1's rule). Pure, tested under Node; the
// page decides what is a field, a layer or the map.
import { alignFromKey } from "@engine/app/state/floating";
import type { BarAlign } from "@engine/app/state/floating";
import { GRID } from "@engine/app/canvas/Flow";
import type { KeyPress } from "./keys";

export type PaletteTool = "select" | "connector" | "note" | "shape" | "table" | "image" | "code" | "group";

export type EditKey =
  | Readonly<{ kind: "toggleEdit" }>
  | Readonly<{ kind: "tool"; tool: PaletteTool }>
  | Readonly<{ kind: "escape" }>
  | Readonly<{ kind: "delete" }>
  | Readonly<{ kind: "edit" }>
  | Readonly<{ kind: "cycle"; direction: 1 | -1 }>
  | Readonly<{ kind: "nudge"; dx: number; dy: number }>
  | Readonly<{ kind: "undo" }>
  | Readonly<{ kind: "redo" }>
  | Readonly<{ kind: "selectAll" }>
  | Readonly<{ kind: "duplicate" }>
  | Readonly<{ kind: "align"; mode: BarAlign }>
  | Readonly<{ kind: "grid" }>
  /** P pins or unpins the selected devices, H hides them, Ctrl+B sets the selected note bold (the bars' keys). */
  | Readonly<{ kind: "pin" }>
  | Readonly<{ kind: "hide" }>
  | Readonly<{ kind: "bold" }>
  /** Ctrl+Shift+V: the paste that follows becomes a code block. */
  | Readonly<{ kind: "pasteCode" }>;

/** What the page knows when a key comes: the mode, whether the focus sits in a field or an open layer (`editable`:
 *  those keep their keys), whether it sits on the map itself (Enter and Tab are the map's there only), and whether
 *  something is selected (Tab walks it). */
export type EditKeyContext = Readonly<{ editing: boolean; editable: boolean; onCanvas: boolean; hasSelection: boolean }>;

export type EditPress = KeyPress & Readonly<{ code?: string }>;

/** The step of the arrows: one grid cell, five with Shift. */
export const NUDGE_STEP = GRID;
export const NUDGE_FAST = GRID * 5;

const TOOLS: Readonly<Record<string, PaletteTool>> = { v: "select", k: "connector", n: "note", s: "shape", t: "table", i: "image", b: "code", g: "group" };
const ARROWS: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** The edit action a key press asks for, or null (the page then tries the shell's keys, `keys.ts`). */
export function editKeyOf(press: EditPress, ctx: EditKeyContext): EditKey | null {
  if (ctx.editable) return null;
  const mod = press.ctrlKey || press.metaKey;
  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key;
  if (!mod && !press.altKey && !press.shiftKey && key === "m") return { kind: "toggleEdit" };
  if (!ctx.editing) return null;
  // the keys that act on the selection belong to the map: on a button, a tab, they keep their sense
  const map = ctx.onCanvas;
  if (mod && !press.altKey) {
    if (key === "z") return press.shiftKey ? { kind: "redo" } : { kind: "undo" };
    if (key === "y" && !press.shiftKey) return { kind: "redo" };
    if (key === "v" && press.shiftKey && map) return { kind: "pasteCode" };
    if (!map || press.shiftKey) return null;
    if (key === "a") return { kind: "selectAll" };
    if (key === "d") return { kind: "duplicate" };
    if (key === "b") return { kind: "bold" };
    return null;
  }
  if (press.altKey && !mod) {
    if (!press.shiftKey && (key === "g" || press.code === "KeyG")) return { kind: "grid" };
    const mode = alignFromKey(press.key, press.code ?? "", !!press.shiftKey);
    return mode ? { kind: "align", mode } : null;
  }
  if (press.key === "Escape") return { kind: "escape" };
  if (!press.shiftKey && Object.hasOwn(TOOLS, key)) return { kind: "tool", tool: TOOLS[key] };
  if (!map) return null;
  if (press.key === "Delete" || press.key === "Backspace") return { kind: "delete" };
  if (press.key === "F2" || (press.key === "Enter" && !press.shiftKey)) return { kind: "edit" };
  if (press.key === "Tab" && ctx.hasSelection) return { kind: "cycle", direction: press.shiftKey ? -1 : 1 };
  const arrow = ARROWS[press.key];
  if (arrow) {
    const step = press.shiftKey ? NUDGE_FAST : NUDGE_STEP;
    return { kind: "nudge", dx: arrow[0] * step, dy: arrow[1] * step };
  }
  if (!press.shiftKey && key === "p") return { kind: "pin" };
  if (!press.shiftKey && key === "h") return { kind: "hide" };
  return null;
}
