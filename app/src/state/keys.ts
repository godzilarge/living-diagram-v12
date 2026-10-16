// The diagram page's single-key shortcuts (DESIGN.md, Navigation: canvas controls and the panel; the tooltips say
// them): Escape lets go of the selection (or leaves the focus panel), F shows everything, G the grid, N the overview,
// + or = zooms in, − zooms out, 0 goes back to 100 %; with a panel open, W widens or narrows it, Shift+F enters or
// leaves its focus mode, C centres the view on the selected element. A key held with Ctrl, Meta or Alt belongs to
// the browser or another command; typing in a field and an open list or popover keep their keys (the page decides
// that, `editable`). Pure, tested under Node.

export type ShellKey = "deselect" | "fit" | "grid" | "minimap" | "zoomIn" | "zoomOut" | "zoomReset" | "panelWide" | "panelFocus" | "center";

export type KeyPress = Readonly<{ key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey?: boolean }>;

const KEYS: Readonly<Record<string, ShellKey>> = {
  Escape: "deselect",
  f: "fit",
  F: "fit",
  g: "grid",
  G: "grid",
  n: "minimap",
  N: "minimap",
  "+": "zoomIn",
  "=": "zoomIn",
  "-": "zoomOut",
  "−": "zoomOut",
  "0": "zoomReset",
  w: "panelWide",
  W: "panelWide",
  c: "center",
  C: "center",
};

/** The shortcut a key press asks for, or null; nothing while the focus is in a field or an open layer. */
export function shellKeyOf(press: KeyPress, editable: boolean): ShellKey | null {
  if (editable || press.ctrlKey || press.metaKey || press.altKey) return null;
  if (press.shiftKey && (press.key === "F" || press.key === "f")) return "panelFocus";
  return Object.hasOwn(KEYS, press.key) ? KEYS[press.key] : null;
}
