// The keyboard of edit mode: the palette's letters, the mode toggle, the editing keys, the modifiers.
import { describe, expect, it } from "vitest";
import { editKeyOf, NUDGE_FAST, NUDGE_STEP } from "../src/state/edit-keys";

const press = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; code: string }> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });
const IN = { editing: true, editable: false, onCanvas: true, hasSelection: true };
const OUT = { ...IN, editing: false };

describe("edit keys", () => {
  it("M toggles the mode from read and from edit; nothing else answers in read mode", () => {
    expect(editKeyOf(press("m"), OUT)).toEqual({ kind: "toggleEdit" });
    expect(editKeyOf(press("M"), IN)).toEqual({ kind: "toggleEdit" });
    expect(editKeyOf(press("n"), OUT)).toBeNull();
    expect(editKeyOf(press("z", { ctrlKey: true }), OUT)).toBeNull();
    expect(editKeyOf(press("Delete"), OUT)).toBeNull();
  });

  it("maps each letter of the palette to its tool, lower case only (Shift holds a rectangle)", () => {
    for (const [key, tool] of [["v", "select"], ["k", "connector"], ["n", "note"], ["s", "shape"], ["t", "table"], ["i", "image"], ["b", "code"], ["g", "group"]] as const)
      expect(editKeyOf(press(key), IN), key).toEqual({ kind: "tool", tool });
    expect(editKeyOf(press("N", { shiftKey: true }), IN)).toBeNull();
    expect(editKeyOf(press("l"), IN)).toBeNull();
  });

  it("knows the editing keys and the modifiers", () => {
    expect(editKeyOf(press("Escape"), IN)).toEqual({ kind: "escape" });
    expect(editKeyOf(press("Delete"), IN)).toEqual({ kind: "delete" });
    expect(editKeyOf(press("Backspace"), IN)).toEqual({ kind: "delete" });
    expect(editKeyOf(press("F2"), IN)).toEqual({ kind: "edit" });
    expect(editKeyOf(press("Enter"), IN)).toEqual({ kind: "edit" });
    expect(editKeyOf(press("Enter"), { ...IN, onCanvas: false })).toBeNull();
    expect(editKeyOf(press("Tab"), IN)).toEqual({ kind: "cycle", direction: 1 });
    expect(editKeyOf(press("Tab", { shiftKey: true }), IN)).toEqual({ kind: "cycle", direction: -1 });
    expect(editKeyOf(press("Tab"), { ...IN, hasSelection: false })).toBeNull();
    expect(editKeyOf(press("z", { ctrlKey: true }), IN)).toEqual({ kind: "undo" });
    expect(editKeyOf(press("Z", { metaKey: true, shiftKey: true }), IN)).toEqual({ kind: "redo" });
    expect(editKeyOf(press("y", { ctrlKey: true }), IN)).toEqual({ kind: "redo" });
    expect(editKeyOf(press("a", { ctrlKey: true }), IN)).toEqual({ kind: "selectAll" });
    expect(editKeyOf(press("d", { ctrlKey: true }), IN)).toEqual({ kind: "duplicate" });
    expect(editKeyOf(press("c", { ctrlKey: true }), IN)).toBeNull(); // the native copy event
  });

  it("nudges by a grid step, five with Shift; aligns with Alt and a letter, Alt+G snaps to a grid", () => {
    expect(editKeyOf(press("ArrowLeft"), IN)).toEqual({ kind: "nudge", dx: -NUDGE_STEP, dy: 0 });
    expect(editKeyOf(press("ArrowDown", { shiftKey: true }), IN)).toEqual({ kind: "nudge", dx: 0, dy: NUDGE_FAST });
    expect(editKeyOf(press("a", { altKey: true }), IN)).toEqual({ kind: "align", mode: "left" });
    expect(editKeyOf(press("H", { altKey: true, shiftKey: true, code: "KeyH" }), IN)).toEqual({ kind: "align", mode: "distribute-horizontal" });
    expect(editKeyOf(press("g", { altKey: true }), IN)).toEqual({ kind: "grid" });
    expect(editKeyOf(press("x", { altKey: true }), IN)).toBeNull();
  });

  it("knows the bars' keys: P pins, H hides, Ctrl+B sets bold, Ctrl+Shift+V pastes as a code block", () => {
    expect(editKeyOf(press("p"), IN)).toEqual({ kind: "pin" });
    expect(editKeyOf(press("h"), IN)).toEqual({ kind: "hide" });
    expect(editKeyOf(press("b", { ctrlKey: true }), IN)).toEqual({ kind: "bold" });
    expect(editKeyOf(press("V", { ctrlKey: true, shiftKey: true }), IN)).toEqual({ kind: "pasteCode" });
  });

  it("keeps the keys that act on the selection for the map: on a tab or a button they keep their sense", () => {
    const off = { ...IN, onCanvas: false };
    for (const key of ["Delete", "Backspace", "F2", "Enter", "Tab", "ArrowLeft", "p", "h"]) expect(editKeyOf(press(key), off), key).toBeNull();
    expect(editKeyOf(press("a", { ctrlKey: true }), off)).toBeNull();
    expect(editKeyOf(press("d", { ctrlKey: true }), off)).toBeNull();
    expect(editKeyOf(press("b", { ctrlKey: true }), off)).toBeNull();
    // the mode, the tools, Escape, undo and redo, the alignments work from anywhere outside a field
    expect(editKeyOf(press("n"), off)).toEqual({ kind: "tool", tool: "note" });
    expect(editKeyOf(press("Escape"), off)).toEqual({ kind: "escape" });
    expect(editKeyOf(press("z", { ctrlKey: true }), off)).toEqual({ kind: "undo" });
    expect(editKeyOf(press("a", { altKey: true }), off)).toEqual({ kind: "align", mode: "left" });
  });

  it("leaves every key to a field or an open layer", () => {
    expect(editKeyOf(press("m"), { ...IN, editable: true })).toBeNull();
    expect(editKeyOf(press("Delete"), { ...IN, editable: true })).toBeNull();
  });
});
