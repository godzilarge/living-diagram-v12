// The commands of edit mode (brick 6), the v1's editing logic behind the v2 shell: the intent commands (groups,
// annotations, connectors, insert, delete), the clipboard (copy, cut, paste, duplicate, clone), the code block, the
// floating bar's own (pin here, lock, hue for a selection) come from the v1's factories in `engine/src/app/state/`,
// pure of any DOM and fed by injection; what they asked of the v1 store (its actions, its state) is answered here
// (`shim`): a note becomes a toast, an in-place edit or an armed tool an action of the v2 reducer. The shell's own
// editing commands (align, snap to a grid, hide, isolate, hue, pin, select, nudge, undo, redo, the tool) are written
// here against the mounted canvas. Everything that writes goes through the intent host: under the name, to the log,
// into the undo stack. Those factories move into `app/src/` with the cut-over (brick 8), when the v1 store goes.
import { GRID } from "@engine/app/canvas/Flow";
import type { Undo } from "@engine/app/canvas/undo";
import type { Toile } from "@engine/app/canvas/toile";
import type { AlignMode, BoxMode } from "@engine/canvas/align";
import { exactRule } from "@engine/canvas/query";
import type { Model, Selection } from "@engine/canvas/types";
import type { Op, Placer } from "@engine/shell/apps";
import type { IntentHost } from "@engine/shell/intent";
import type { PlacementHost } from "@engine/shell/placement";
import type { AppWriter } from "@engine/app/api/writers";
import { clipboardCommands } from "@engine/app/state/clipboard-commands";
import type { ClipboardCommands } from "@engine/app/state/clipboard-commands";
import { codeCommands } from "@engine/app/state/code-commands";
import type { CodeCommands } from "@engine/app/state/code-commands";
import { floatingCommands } from "@engine/app/state/floating-commands";
import type { FloatingCommands } from "@engine/app/state/floating-commands";
import { intentCommands } from "@engine/app/state/intent-commands";
import type { IntentCommands } from "@engine/app/state/intent-commands";
import { initialState as v1State } from "@engine/app/state/reducer";
import { defaultPrefs as v1Prefs } from "@engine/app/state/prefs";
import { alignCommand, movableCount } from "@engine/app/state/floating";
import type { BarAlign } from "@engine/app/state/floating";
import type { Item } from "@engine/app/state/selection";
import type { Action as V1Action, AppState as V1State, NoteOffer } from "@engine/app/state/types";
import { t as v1 } from "@engine/i18n";
import { currentAuthor } from "./author";
import type { Action, DiagramState, Tool } from "./diagram";
import type { ViewState } from "./address";
import type { PaletteTool } from "./edit-keys";
import { text } from "../i18n";

/** What the shell holds of the mounted canvas: the v2's handle, plus the v1's hosts the editing goes through. */
export type EditHandle = Readonly<{
  toile: Toile;
  area: () => Readonly<{ width: number; height: number }>;
  intents: IntentHost;
  placements: PlacementHost;
  writer: AppWriter;
  placer: Placer | null;
  undo: Undo;
}>;

/** A toast with an optional action (the v1's status line offered to hide the devices a deletion kept, or to remove
 *  the sensitive values of a paste from another infrastructure). */
export type Note = Readonly<{ text: string; busy?: boolean; offer?: NoteOffer }>;

export type EditDeps = Readonly<{
  dispatch: (action: Action) => void;
  current: () => DiagramState;
  session: () => Readonly<{ token: string; infrastructure: string }>;
  handle: () => EditHandle | null;
  setView: (patch: Partial<ViewState>) => void;
  note: (note: Note | null) => void;
}>;

export type EditCommands = IntentCommands & ClipboardCommands & CodeCommands & FloatingCommands & Readonly<{
  /** Aligns the selection as the bar's volet says (cards alone keep the rule of the centres). */
  align: (mode: BarAlign) => void;
  /** Snaps the selection to a grid (three elements at least; the page says so otherwise). */
  grid: (cols?: number | null) => void;
  hideHosts: (hosts: readonly string[]) => void;
  isolateHosts: (hosts: readonly string[]) => void;
  /** The hue of a device (null: back to its type's), of several, the pin removed. */
  color: (hostname: string, hue: string | null) => void;
  colorHosts: (hosts: readonly string[], hue: string | null) => void;
  unpin: (hosts: readonly string[]) => void;
  /** Removes what the intent says of a device: its pin and its own hue, in one write. */
  removeIntent: (hostname: string) => void;
  copyName: (hostname: string) => void;
  selectHosts: (hosts: readonly string[]) => void;
  clearSelection: () => void;
  selectAll: () => void;
  cycle: (direction: 1 | -1) => Item | null;
  /** F2 or Enter: the in-place edit of the selected element; false when it has none. */
  editSelection: () => boolean;
  requestEdit: (id: string, cell: readonly [number, number] | null, kind?: "annotation" | "group") => void;
  setTool: (tool: Tool | null) => void;
  toggleTool: (tool: Tool) => void;
  /** A palette tool: an insertion at the centre of the view, the connector tool armed, a group of the selection. */
  usePalette: (tool: PaletteTool, shape?: "rectangle" | "ellipse") => void;
  /** An image or a text from elsewhere (Ctrl+V): an image annotation, a code block, or a note. */
  paste: (data: DataTransfer) => boolean;
  nudge: (dx: number, dy: number) => boolean;
  fit: () => void;
  reveal: (selection: Selection) => void;
  /** Opens the file chooser of the palette's image tool (the page mounts it). */
  pickImage: () => void;
  undo: () => void;
  redo: () => void;
  /** Can the intent be written now: edit mode, a name, an intent read with the run. */
  canWrite: () => boolean;
  /** Why not, in words; null when it can. */
  whyNot: () => string | null;
}>;

export function makeEditCommands(deps: EditDeps): EditCommands {
  const { dispatch, current, session, handle, setView, note } = deps;
  const say = (words: string): void => note({ text: words });
  const graph = (): Toile | null => handle()?.toile ?? null;
  const model = (): Model | null => handle()?.toile.model ?? null;

  // The v1 factories' view of the page: its actions answered here, its state projected from the v2's.
  const shim = (action: V1Action): void => {
    switch (action.type) {
      case "note":
        if (action.text === null) note(null);
        else note({ text: action.text, busy: !!action.busy, offer: action.offer });
        return;
      case "editRequest":
        dispatch({ type: "editRequest", request: action.request });
        return;
      case "tool":
        dispatch({ type: "tool", tool: action.tool });
        return;
      case "context":
        dispatch({ type: "context", menu: action.menu });
        return;
      case "touched":
        dispatch({ type: "touched" });
        return;
      case "select":
        graph()?.select(action.selection);
        return;
      default:
        return;
    }
  };
  const v1Current = (): V1State => {
    const state = current();
    const toile = graph();
    const base = v1State();
    // edit mode owns the plan grid: an insertion and a paste snap to it (the v1 asked a preference)
    return {
      ...base,
      token: session().token,
      author: currentAuthor(),
      address: state.address,
      prefs: { ...v1Prefs(), snap: true, guides: true, grid: true },
      view: { ...base.view, mode: "diagram" },
      selection: state.selection,
      hosts: [...state.hosts],
      picked: toile ? toile.state.multi : base.picked,
      tool: state.tool,
    };
  };
  const intent = intentCommands({ dispatch: shim, current: v1Current, session, handle, codeInsert: (at) => code.codeInsert(at) });
  const code = codeCommands({ dispatch: shim, current: v1Current, handle });
  const clipboard = clipboardCommands({
    dispatch: shim, current: v1Current, session, handle,
    pasteForeign: (data) => commands.paste(data),
    pasteCode: (raw, at) => code.codePaste(raw, { force: true, at }),
  });
  const floating = floatingCommands({ handle });

  const writable = (): boolean => { const h = handle(); return !!h && current().editing && h.intents.canWrite(); };
  const whyNot = (): string | null => {
    const h = handle();
    if (!h) return null;
    if (!current().editing) return null;
    if (h.writer.locked) return v1("shell:messages.intentLocked");
    return h.intents.canWrite() ? null : text("edit:mode.giveName");
  };

  const commands: EditCommands = {
    ...intent, ...clipboard, ...code, ...floating,
    align: (mode) => {
      const g = graph(), m = model();
      if (!g || !m) return;
      g.alignSelected(alignCommand(mode, movableCount(m, g.state.multi).cardsOnly) as AlignMode | BoxMode);
    },
    grid: (cols = null) => {
      const g = graph();
      if (g && !g.gridSelected({ cols, order: "name", snap: GRID })) say(v1("shell:messages.gridNeedsThree"));
    },
    hideHosts: (hosts) => {
      if (!hosts.length) return;
      setView({ hide: [...current().view.hide, exactRule([...hosts])] });
      graph()?.select(null);
    },
    isolateHosts: (hosts) => { if (hosts.length) setView({ only: exactRule([...hosts]) }); },
    color: (hostname, hue) => handle()?.intents.onColor(hostname, hue),
    colorHosts: (hosts, hue) => handle()?.intents.onColors([...hosts], hue),
    unpin: (hosts) => handle()?.intents.unpin([...hosts]),
    removeIntent: (hostname) => {
      const h = handle();
      if (!h) return;
      const ops: Op[] = [];
      if (h.toile.model.pinByHost.has(hostname)) ops.push({ op: "unpin", hostname });
      if (h.toile.model.colorByHost.has(hostname)) ops.push({ op: "uncolor", hostname });
      if (ops.length) void h.intents.apply(ops, v1("shell:history.unpinned", { who: hostname }));
    },
    copyName: (hostname) => {
      const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      if (!clip || typeof clip.writeText !== "function") { say(v1("shell:clipboard.readRefused")); return; }
      void clip.writeText(hostname).then(() => say(v1("shell:clipboard.namesCopied", { count: 1 })), () => say(v1("shell:clipboard.tabOnly")));
    },
    selectHosts: (hosts) => graph()?.selectHosts([...hosts]),
    clearSelection: () => graph()?.select(null),
    selectAll: () => { const g = graph(); if (g) g.selectItems(g.allItems()); },
    cycle: (direction) => graph()?.cycle(direction) ?? null,
    editSelection: () => {
      const h = handle(), sel: Selection | null = h ? h.toile.state.selection : null;
      if (!h || !sel || !writable()) return false;
      if (sel.kind === "group" && h.toile.model.groupById.has(sel.id)) { commands.requestEdit(sel.id, null, "group"); return true; }
      const a = sel.kind === "annotation" ? h.toile.model.annotationById.get(sel.id) : undefined;
      if (!a || a.locked || (a.content.kind !== "note" && a.content.kind !== "shape" && a.content.kind !== "code")) return false;
      commands.requestEdit(sel.id, null);
      return true;
    },
    requestEdit: (id, cell, kind) => dispatch({ type: "editRequest", request: { id, cell, at: Date.now(), ...(kind ? { kind } : {}) } }),
    setTool: (tool) => {
      if (current().tool === tool) return;
      dispatch({ type: "tool", tool });
      if (tool === "connector") say(v1("shell:messages.connectorTool"));
      else note(null);
    },
    toggleTool: (tool) => commands.setTool(current().tool === tool ? null : tool),
    usePalette: (tool, shape = "rectangle") => {
      const h = handle();
      if (!h) return;
      if (tool === "select") { commands.setTool(null); return; }
      if (tool === "connector") { commands.toggleTool("connector"); return; }
      const why = whyNot();
      if (why) { say(why); return; }
      // the image tool asks for a file first (the palette's hidden input, `pickImage`); the file then inserts it
      if (tool === "image") { commands.pickImage(); return; }
      if (tool === "group") {
        const devices = h.toile.state.multi.hosts.filter((host) => { const n = h.toile.model.nodeByHost.get(host); return !!n && n.kind !== "stub" && !n.ghost; });
        if (devices.length) commands.groupCreate(v1("shell:context.defaultGroup"), devices);
        return;
      }
      const centre = h.toile.viewCenter();
      const at = { x: centre.x - 100, y: centre.y - 40 };
      commands.insertAt(tool === "shape" ? shape : tool, at);
    },
    paste: (data) => {
      const h = handle();
      if (!h || !writable()) return false;
      const file = Array.from(data.files || []).find((f) => ["image/png", "image/jpeg", "image/webp"].includes(f.type));
      if (file) { commands.annotationImage(file); return true; }
      const raw = data.getData("text/plain") || "";
      if (code.codePaste(raw)) return true;
      const words = raw.replace(/\r\n?/g, "\n").trim();
      if (!words) return false;
      commands.annotationCreate({ kind: "note", text: words.slice(0, 2000) });
      return true;
    },
    nudge: (dx, dy) => !!graph()?.nudge(dx, dy),
    fit: () => graph()?.fit(),
    reveal: (selection) => void graph()?.reveal(selection),
    pickImage: () => document.querySelector<HTMLInputElement>("[data-image-file]")?.click(),
    undo: () => void handle()?.undo.undo(),
    redo: () => void handle()?.undo.redo(),
    canWrite: writable,
    whyNot,
  };
  return commands;
}
