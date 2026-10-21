// The canvas: the only component that mounts it (once per run), the v1's drawing unchanged (`engine/src/app/canvas/`,
// React Flow) inside the v2 shell. Read mode (brick 2): selection, pan and zoom, hover; nothing moves and nothing is
// written (Orhan, 2026-10-17: a move that cannot be undone is an edit; the pencil opens everything that moves). Edit mode
// (brick 6): the v1's hosts are mounted with the canvas (the intent writer under the declared name, the intent host,
// the undo stack of the infrastructure) and the canvas's gestures write through them (a drag pins, a mixed selection
// moves in one write, an annotation resizes or is edited in place, the connector tool draws, Alt + drag clones); the
// plan grid, the magnet and the guides are edit mode's. The contextual bar and the context menu are the page's: the
// bar renders as a child of the canvas (it reads the view and the gestures). The canvas speaks through the v1's own
// i18n instance (its catalogues), kept in the page's language.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { selectionFromToken } from "@engine/canvas/model";
import { parseRule } from "@engine/canvas/query";
import type { Model, Selection } from "@engine/canvas/types";
import type { End } from "@engine/canvas/connectors";
import type { Point } from "@engine/canvas/layout";
import type { TableContent } from "@engine/contracts/intent";
import type { ConnectorPatch, Op } from "@engine/shell/apps";
import { applyLanguage, i18n as canvasI18n, t as v1 } from "@engine/i18n";
import { createIntentHost } from "@engine/shell/intent";
import { createPlacementHost } from "@engine/shell/placement";
import { makeWriter } from "@engine/app/api/writers";
import { setAssetReader } from "@engine/app/canvas/assets";
import { CodeContext } from "@engine/app/canvas/code";
import { CodeDraftLayer } from "@engine/app/canvas/code-draft";
import { Flow } from "@engine/app/canvas/Flow";
import type { ContextRequest } from "@engine/app/canvas/Flow";
import type { MoveCause, Toile, Viewport } from "@engine/app/canvas/toile";
import { createToile } from "@engine/app/canvas/toile";
import { createUndo } from "@engine/app/canvas/undo";
import type { StackHolder, Undo } from "@engine/app/canvas/undo";
import { dropLocal } from "@engine/app/state/history";
import type { Item, Multi } from "@engine/app/state/selection";
import { readAsset } from "../api/assets";
import { makePlacer } from "../api/placement";
import type { Session } from "../api/run";
import type { Language } from "../i18n";
import { useText } from "../i18n";
import type { SelectionToken, ViewState } from "../state/address";
import type { EditRequestState, Tool } from "../state/diagram";
import type { EditCommands, EditHandle } from "../state/edit-commands";
import type { Insets } from "../state/zoom";
import "./Canvas.css";

export type CanvasPrefs = Readonly<{ grid: boolean; minimap: boolean; theme: "light" | "dark" }>;

export type CanvasProps = {
  model: Model;
  /** The infrastructure of the address: a selection asked for another one waits for its canvas. */
  infrastructure: string;
  remembered: boolean;
  session: () => Session;
  view: ViewState;
  /** What the shell lays over the map (its islands, the panel): fitting and centring frame inside the rest. */
  insets: Insets;
  prefs: CanvasPrefs;
  language: Language;
  selection: Selection | null;
  hosts: readonly string[];
  wanted: SelectionToken | null;
  /** Edit mode: the intent is written (under `author`), the plan grid and the guides show, the gestures edit. */
  editing: boolean;
  author: string;
  tool: Tool | null;
  editRequest: EditRequestState | null;
  /** The undo stack of the infrastructure (it crosses the runs). */
  history: StackHolder;
  edit: EditCommands;
  onSelect: (selection: Selection | null, hosts: readonly string[]) => void;
  onWantedMissing: (token: string) => void;
  onView: (zoom: number) => void;
  onHandle: (handle: EditHandle | null) => void;
  /** A line of status from a host ("3 devices placed and memorized", "annotation created"). */
  onNote: (text: string) => void;
  /** An intent write accepted: what reads the model re-reads it. */
  onTouched: () => void;
  onContext: (request: ContextRequest) => void;
  /** What the page lays over the canvas in its own coordinates (the contextual bar). */
  children?: ReactNode;
};

const noop = (): void => undefined;
const sameSelection = (a: Selection | null, b: Selection | null): boolean => a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);
const sameHosts = (a: Iterable<string>, b: readonly string[]): boolean => [...a].sort().join("\n") === [...b].sort().join("\n");

/** Pushes the view into the canvas; true when something changed that asks for a new layout. Every cable is drawn,
 *  neutral: the v1's Check drawing (statuses, hidden statuses) is not used, Check is a page of its own (brick 7a). */
function pushView(toile: Toile, view: ViewState): boolean {
  const f = toile.state.filters;
  const hide = view.hide.map(parseRule);
  const only = view.only ? parseRule(view.only) : null;
  const changed =
    f.showStubs !== view.showStubs || f.showDiff !== view.showDiff || toile.state.layers.notes !== view.showNotes || toile.state.control ||
    f.hide.map((r) => r.text).join("\n") !== view.hide.join("\n") || (f.only ? f.only.text : "") !== view.only || f.hiddenStatuses.size > 0;
  f.showStubs = view.showStubs;
  f.showDiff = view.showDiff;
  f.hide = hide;
  f.only = only;
  f.hiddenStatuses = new Set();
  toile.state.showPorts = view.showPorts;
  toile.state.control = false;
  toile.state.layers = { speeds: view.showSpeeds, beams: view.showBeams, pins: view.showPins, notes: view.showNotes, oper: view.showOper };
  return changed;
}

type Latest = Pick<CanvasProps, "view" | "insets" | "wanted" | "onSelect" | "onNote" | "onWantedMissing" | "onTouched" | "session" | "editing" | "author" | "edit"> & { t: ReturnType<typeof useText> };

/** The v1's hosts around a toile: the writer under the name, the intent host, the undo stack; the canvas hooks that
 *  go through them, gated by edit mode (in read mode nothing drags: `movable` is false on the canvas). */
function mountHosts(model: Model, latest: { current: Latest }, history: StackHolder, remembered: boolean, graph: () => Toile) {
  const frozen = (): Session => ({ token: latest.current.session().token, infrastructure: model.source.infrastructure });
  const writer = makeWriter(frozen, latest.current.author, noop);
  writer.locked = !model.intent; // the intent could not be read with the run: nothing is written blind
  history.set(dropLocal(history.get())); // another canvas's local moves do not replay here
  const note = (text: string): void => latest.current.onNote(text);
  const say = (key: "refused" | "unreachable", status?: number): string =>
    key === "refused" ? latest.current.t("diagram:api.refused", { status: status ?? 0 }) : latest.current.t("diagram:api.unreachable");
  let undo: Undo | null = null;
  const intents = createIntentHost(model, writer, {
    graph, openInGraph: (selection) => graph().reveal(selection), refreshPage: () => latest.current.onTouched(), note,
    mounted: () => false, container: () => document.createElement("div"), parts: (ops) => (undo && !undo.replays(ops) ? undo : null),
  });
  const placer = remembered ? makePlacer(() => latest.current.session(), say) : null;
  const placements = createPlacementHost(model, placer, { graph, note });
  undo = createUndo(model, writer, intents, graph, history, note);
  const editing = (): boolean => latest.current.editing;
  const writable = (): boolean => editing() && intents.canWrite();
  // A gesture on a mixed selection: pins and the annotations' and connectors' operations in one write, one undo entry.
  const onBlock = (pins: Map<string, Point>, ops: Op[], cause: MoveCause): void => {
    if (!editing()) return;
    const pinOps = [...pins.keys()].sort().map((hostname): Op => { const p = pins.get(hostname) as Point; return { op: "pin", hostname, x: Math.round(p.x), y: Math.round(p.y) }; });
    const count = pins.size + new Set(ops.map((op) => ("id" in op ? op.id : ""))).size;
    if (cause === "gridded" && !intents.canWrite()) { note(v1("shell:messages.griddedLocal", { count })); return; }
    const key = cause === "gridded" ? "shell:messages.itemsGridded" : cause === "aligned" ? "shell:messages.itemsAligned" : "shell:messages.itemsMoved";
    void intents.apply(pinOps.concat(ops), v1(key, { count, author: writer.author }));
  };
  const hooks = {
    onPin: (hostname: string, point: Point): void => { if (writable()) intents.onPin(hostname, point); },
    onPins: (moves: Map<string, Point>, cause: Parameters<typeof intents.onPins>[1]): void => { if (writable()) intents.onPins(moves, cause); },
    onPlaced: placements.onPlaced,
    onMoved: (before: Map<string, Point>, after: Map<string, Point>): void => { if (editing() && undo) undo.onMoved(before, after); },
    onBlock,
    canWrite: writable,
  };
  return { writer, intents, placements, placer, undo, hooks };
}

export function Canvas(props: CanvasProps) {
  const { model, infrastructure, remembered, view, insets, prefs, language, selection, hosts, wanted, editing, author, tool, editRequest, history, edit, onWantedMissing, onView, onHandle, onContext, children } = props;
  const t = useText();
  const host = useRef<HTMLDivElement>(null);
  // what the mount effect reads without depending on it: one canvas per run, never per render
  const latest = useRef<Latest>({ view, insets, wanted, onSelect: props.onSelect, onNote: props.onNote, onWantedMissing, onTouched: props.onTouched, session: props.session, editing, author, edit, t });
  latest.current = { view, insets, wanted, onSelect: props.onSelect, onNote: props.onNote, onWantedMissing, onTouched: props.onTouched, session: props.session, editing, author, edit, t };
  const [handle, setHandle] = useState<EditHandle | null>(null);
  const toile = handle?.toile ?? null;

  // the v1 catalogues speak the page's language
  useEffect(() => {
    applyLanguage(language);
  }, [language]);

  // One canvas per run: React Flow is remounted with it (its key), its listeners leave with the old one.
  useEffect(() => {
    let created: Toile | null = null;
    const graph = (): Toile => created as Toile;
    const hosted = mountHosts(model, latest, history, remembered, graph);
    const onSelected = (next: Selection | null, multi: Multi): void => latest.current.onSelect(next, multi.hosts);
    created = createToile(model, {
      onSelect: onSelected,
      ...hosted.hooks,
      later: (run, ms) => {
        const timer = window.setTimeout(run, ms);
        return () => window.clearTimeout(timer);
      },
    });
    created.state.insets = { ...latest.current.insets };
    pushView(created, latest.current.view);
    created.render(false);
    // the selection the address asks for: shown, or said missing before the canvas answers "nothing selected" (which
    // the store takes as the answer to what it asked)
    const asked = latest.current.wanted;
    const first = asked ? selectionFromToken(model, asked.kind, asked.token) : null;
    if (asked && !first && model.source.infrastructure === infrastructure) latest.current.onWantedMissing(asked.token);
    if (first) created.reveal(first);
    else created.select(null);
    setAssetReader((asset) => readAsset(latest.current.session(), asset));
    const mounted: EditHandle = {
      toile: created, area: () => host.current?.getBoundingClientRect() ?? { width: 0, height: 0 },
      intents: hosted.intents, placements: hosted.placements, writer: hosted.writer, placer: hosted.placer, undo: hosted.undo,
    };
    onHandle(mounted);
    setHandle(mounted);
    return () => {
      created?.flush(); // a burst of arrows still pending is written before the canvas goes
      setAssetReader(null);
      onHandle(null);
    };
  }, [model, infrastructure, remembered, history, onHandle]);

  // The declared name follows: the writer signs the next write with it.
  useEffect(() => {
    if (handle) handle.writer.author = author;
  }, [handle, author]);

  // The insets follow the panel: what "show everything" and "centre" frame around.
  useEffect(() => {
    if (toile) toile.state.insets = { ...insets };
  }, [toile, insets]);

  // The view (toggles, rules): a new layout, framing kept; the port names: a repaint.
  useEffect(() => {
    if (!toile) return;
    if (pushView(toile, view)) toile.render(true);
    else toile.repaint();
  }, [toile, view]);

  // A selection asked elsewhere (the address): the canvas resolves it, shows it, and says so (`onSelect`).
  useEffect(() => {
    if (!toile) return;
    if (wanted) {
      if (model.source.infrastructure !== infrastructure) return;
      const found = selectionFromToken(model, wanted.kind, wanted.token);
      if (found) toile.reveal(found);
      else onWantedMissing(wanted.token);
      return;
    }
    if (sameSelection(toile.state.selection, selection) && sameHosts(toile.state.selected, hosts)) return;
    if (hosts.length >= 2) toile.selectHosts([...hosts]);
    else if (selection) toile.reveal(selection);
    else toile.select(null);
  }, [toile, model, infrastructure, wanted, selection, hosts, onWantedMissing]);

  // Leaving edit mode puts the tool away in the canvas too (its armed state follows `tool`); nothing else to do.
  const viewChanged = useCallback((next: Viewport): void => onView(next.zoom), [onView]);
  // An annotation dragged, resized or edited in place (its text, a table): one write under the name (the v1's rule).
  const onAnnotation = useCallback((id: string, patch: { x?: number; y?: number; w?: number; h?: number; text?: string; content?: TableContent }): void => {
    const { text, content, ...box } = patch;
    const shape = model.annotationById.get(id);
    if (text !== undefined && shape && shape.content.kind === "shape") edit.annotationUpdate(id, { content: { ...shape.content, label: text.slice(0, 80) } });
    else if (text !== undefined) edit.annotationUpdate(id, { content: { kind: "note", text } });
    else if (content) edit.annotationUpdate(id, { content });
    else edit.annotationUpdate(id, box);
  }, [edit, model]);
  const onGroupLabel = useCallback((id: string, label: string): void => edit.groupUpdate(id, { label: label.slice(0, 80) }), [edit]);
  const onConnector = useCallback((id: string, patch: ConnectorPatch): void => edit.connectorUpdate(id, patch), [edit]);
  const onConnectorCreate = useCallback((fields: { start: End; end: End }): void => edit.connectorCreate(fields), [edit]);
  // the connector tool is put away after a creation, unless Shift is held (a series)
  const onToolDone = useCallback((keep: boolean): void => { if (!keep) edit.setTool(null); }, [edit]);
  const onClone = useCallback((items: Item[], d: Point): void => edit.cloneDrop(items, d), [edit]);
  const editable = editing && !!author && !!handle && !handle.writer.locked;
  // the read grid is the shell's, fixed on the screen; edit mode shows the plan grid (the one a drag snaps to), the
  // magnet and the guides, as the v1 drew them
  // in edit mode the minimap takes the run band's place, bottom right (the band hides there; the palette holds the left)
  const flowPrefs = useMemo(
    () => ({
      grid: editing && prefs.grid,
      snap: editing,
      minimap: prefs.minimap,
      theme: prefs.theme,
      guides: editing,
      minimapPosition: editing ? ("bottom-right" as const) : ("bottom-left" as const),
    }),
    [prefs, editing],
  );
  const code = useMemo(() => ({ commands: edit, infrastructure: model.source.infrastructure }), [edit, model]);
  const runKey = `${model.source.infrastructure}\u0000${model.source.collector_run_id}`;
  return (
    <div className="diagram-canvas" ref={host} data-canvas="" data-grid={prefs.grid && !editing ? "" : undefined} data-editing={editing ? "" : undefined} tabIndex={-1}>
      {toile ? (
        <I18nextProvider i18n={canvasI18n}>
          <CodeContext.Provider value={code}>
            <Flow
              key={runKey}
              toile={toile}
              prefs={flowPrefs}
              editable={editable}
              movable={editable}
              onAnnotation={onAnnotation}
              onConnector={onConnector}
              onGroupLabel={onGroupLabel}
              onConnectorCreate={onConnectorCreate}
              onContext={onContext}
              editRequest={editRequest ? { id: editRequest.id, cell: editRequest.cell ? [editRequest.cell[0], editRequest.cell[1]] : null, at: editRequest.at, kind: editRequest.kind } : null}
              toolArmed={tool === "connector"}
              onToolDone={onToolDone}
              onClone={onClone}
              onView={viewChanged}
            >
              <CodeDraftLayer />
              {editable ? children : null}
            </Flow>
          </CodeContext.Provider>
        </I18nextProvider>
      ) : null}
    </div>
  );
}
