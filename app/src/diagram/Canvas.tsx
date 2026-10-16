// The canvas: the only component that mounts it (once per run), the v1's drawing unchanged (`engine/src/app/canvas/`,
// React Flow) inside the v2 shell. In brick 2 the canvas is read: selection, pan and zoom, hover; a drag moves a card
// locally as the v1 does without a name, nothing is written to the intent (`canWrite` false); the memorized placement
// is written as in the v1 (the engine's placement host). Editing, the context menu and the contextual bars come with
// brick 6. The canvas speaks through the v1's own i18n instance (its catalogues), kept in the page's language.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { selectionFromToken } from "@engine/canvas/model";
import { parseRule } from "@engine/canvas/query";
import type { Model, Selection } from "@engine/canvas/types";
import { applyLanguage, i18n as canvasI18n } from "@engine/i18n";
import { createPlacementHost } from "@engine/shell/placement";
import { setAssetReader } from "@engine/app/canvas/assets";
import { Flow } from "@engine/app/canvas/Flow";
import type { Viewport } from "@engine/app/canvas/toile";
import { createToile } from "@engine/app/canvas/toile";
import type { Toile } from "@engine/app/canvas/toile";
import type { Multi } from "@engine/app/state/selection";
import { readAsset } from "../api/assets";
import { makePlacer } from "../api/placement";
import type { Session } from "../api/run";
import type { Language } from "../i18n";
import { useText } from "../i18n";
import type { SelectionToken, ViewState } from "../state/address";
import type { CanvasHandle } from "../state/useDiagram";
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
  onSelect: (selection: Selection | null, hosts: readonly string[]) => void;
  onWantedMissing: (token: string) => void;
  onView: (zoom: number) => void;
  onHandle: (handle: CanvasHandle | null) => void;
  /** A line of status from the placement host ("3 devices placed and memorized"). */
  onNote: (text: string) => void;
};

const noop = (): void => undefined;
const sameSelection = (a: Selection | null, b: Selection | null): boolean => a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);
const sameHosts = (a: Iterable<string>, b: readonly string[]): boolean => [...a].sort().join("\n") === [...b].sort().join("\n");

/** Pushes the view into the canvas; true when something changed that asks for a new layout. In the Diagram view every
 *  cable is drawn, neutral: the hidden statuses only apply in Check (brick 7). */
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

export function Canvas(props: CanvasProps) {
  const { model, infrastructure, remembered, session, view, insets, prefs, language, selection, hosts, wanted, onSelect, onWantedMissing, onView, onHandle, onNote } = props;
  const t = useText();
  const host = useRef<HTMLDivElement>(null);
  // what the mount effect reads without depending on it: one canvas per run, never per render
  const latest = useRef({ view, insets, wanted, onSelect, onNote, onWantedMissing, session, t });
  latest.current = { view, insets, wanted, onSelect, onNote, onWantedMissing, session, t };
  const [toile, setToile] = useState<Toile | null>(null);

  // the v1 catalogues speak the page's language
  useEffect(() => {
    applyLanguage(language);
  }, [language]);

  // One canvas per run: React Flow is remounted with it (its key), its listeners leave with the old one.
  useEffect(() => {
    let created: Toile | null = null;
    const graph = (): Toile => created as Toile;
    const note = (text: string): void => latest.current.onNote(text);
    const say = (key: "refused" | "unreachable", status?: number): string =>
      key === "refused" ? latest.current.t("diagram:api.refused", { status: status ?? 0 }) : latest.current.t("diagram:api.unreachable");
    const placer = remembered ? makePlacer(() => latest.current.session(), say) : null;
    const placements = createPlacementHost(model, placer, { graph, note });
    const onSelected = (next: Selection | null, multi: Multi): void => latest.current.onSelect(next, multi.hosts);
    created = createToile(model, {
      onSelect: onSelected,
      onPlaced: placements.onPlaced,
      canWrite: () => false,
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
    const handle: CanvasHandle = { toile: created, area: () => host.current?.getBoundingClientRect() ?? { width: 0, height: 0 } };
    onHandle(handle);
    setToile(created);
    return () => {
      created?.flush();
      setAssetReader(null);
      onHandle(null);
    };
  }, [model, infrastructure, remembered, onHandle]);

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

  const viewChanged = useCallback((next: Viewport): void => onView(next.zoom), [onView]);
  // the grid is drawn by the host (the shell's, fixed on the screen), never by React Flow (the plan grid: edit mode)
  const flowPrefs = useMemo(() => ({ grid: false, snap: false, minimap: prefs.minimap, theme: prefs.theme, guides: false }), [prefs]);
  const runKey = `${model.source.infrastructure}\u0000${model.source.collector_run_id}`;
  return (
    <div className="diagram-canvas" ref={host} data-canvas="" data-grid={prefs.grid ? "" : undefined} tabIndex={-1}>
      {toile ? (
        <I18nextProvider i18n={canvasI18n}>
          <Flow
            key={runKey}
            toile={toile}
            prefs={flowPrefs}
            editable={false}
            onAnnotation={noop}
            onConnector={noop}
            onGroupLabel={noop}
            onConnectorCreate={noop}
            onContext={noop}
            editRequest={null}
            toolArmed={false}
            onToolDone={noop}
            onClone={noop}
            onView={viewChanged}
          />
        </I18nextProvider>
      ) : null}
    </div>
  );
}
