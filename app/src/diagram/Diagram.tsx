// The diagram page (design/comps/shell/index.html at rest): the v1 canvas under floating islands. The top row: the
// logo (back to the home), the context (infrastructure, collection, changes), the views and layers; the tools on the
// right. Bottom left the canvas controls, bottom right the run band. On the right, the panel of the selected element
// (brick 3) at the width the browser prefers (compact or wide) or in focus over the scrim; the canvas frames inside
// what the panel leaves. In place of the canvas, a centred island when there is no diagram to show (the token, a
// refusal, no collection). Ctrl+K and the tools island's button open the search palette (brick 4) over everything;
// a result chosen there is opened here (`useSearch`). Edit mode (brick 6, the pencil or M): the palette on the left,
// the panel and the band hidden, the contextual bar over the selected element inside the canvas, the context menu,
// the keyboard of edit mode before the shell's. The Log view (brick 7, `#mode=journal`): the ground over the canvas,
// which stays mounted and inert, the top row kept, the panel, the band, the canvas controls and the context menu
// gone; its pages (`useJournal`) are held here, so they survive the trip to the Diagram. The context menu opens in
// reading too, with the History of the object first. It renders `useDiagram`'s state and sends its commands; the
// canvas is mounted by `Canvas` alone, once a collection is read.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconLink, Island, LogoMark, Scrim, ToastHost } from "../ui";
import { useText } from "../i18n";
import { formatHash, formatSearch } from "../state/address";
import type { ShellKey } from "../state/keys";
import type { Width } from "../state/panel";
import { useDiagram } from "../state/useDiagram";
import type { DiagramCommands } from "../state/useDiagram";
import type { DiagramState, RunState } from "../state/diagram";
import type { EditKey } from "../state/edit-keys";
import type { EditCommands, Note } from "../state/edit-commands";
import { useAuthor } from "../state/author";
import { hiddenOf, hiddenRules } from "../state/hidden";
import type { StackHolder } from "@engine/app/canvas/undo";
import type { ContextRequest } from "@engine/app/canvas/Flow";
import type { Model } from "@engine/canvas/types";
import type { Insets } from "../state/zoom";
import type { Session } from "../api/run";
import { useInfrastructures } from "../state/useInfrastructures";
import { historyObjectOf } from "../state/journal";
import { useJournal } from "../state/useJournal";
import { Journal } from "../journal/Journal";
import { SearchPalette } from "../search/SearchPalette";
import { ContextBar } from "../edit/ContextBar";
import { ContextMenu } from "../edit/ContextMenu";
import { EditPalette } from "../edit/EditPalette";
import { usePrefs } from "../shell/usePrefs";
import type { Prefs } from "../prefs";
import { INITIAL_TABLE } from "../panel/InterfacesSection";
import type { TableState } from "../panel/InterfacesSection";
import { hasPanel, PanelHost } from "../panel/PanelHost";
import { Canvas } from "./Canvas";
import { CanvasControls } from "./CanvasControls";
import { CHROME, chromeWith } from "./chrome";
import { ContextIsland } from "./ContextIsland";
import { RunsIsland } from "./RunsIsland";
import { StateIsland } from "./StateIsland";
import { ToolsIsland } from "./ToolsIsland";
import { useNotices } from "./useNotices";
import type { Notices } from "./useNotices";
import { useEditKeys } from "./useEditKeys";
import { useSearch } from "./useSearch";
import { useShellKeys } from "./useShellKeys";
import { ViewsIsland } from "./ViewsIsland";
import { blockedOf } from "./words";
import "./Diagram.css";
import "../panel/panel.css";

/** A device of the run (neither an unknown neighbour nor a ghost of the diff): what a group gathers. */
function isDevice(model: Model, host: string): boolean {
  const node = model.nodeByHost.get(host);
  return !!node && node.kind !== "stub" && !node.ghost;
}

/** Another infrastructure opens its own page, on its latest collection. */
function openInfrastructure(infrastructure: string): void {
  window.location.assign(import.meta.env.BASE_URL + formatSearch({ infrastructure, runId: "", from: "" }));
}

type PanelControl = Readonly<{ shown: boolean; focus: boolean; setFocus: (focus: boolean) => void; onSearch: () => void }>;

function keyAction(key: ShellKey, commands: DiagramCommands, prefs: Prefs, setPrefs: (next: Prefs) => void, panel: PanelControl): void {
  switch (key) {
    case "deselect":
      if (panel.focus) panel.setFocus(false);
      else commands.select(null, []);
      return;
    case "grid": return setPrefs({ ...prefs, grid: !prefs.grid });
    case "minimap": return setPrefs({ ...prefs, minimap: !prefs.minimap });
    case "panelWide":
      if (!panel.shown) return;
      panel.setFocus(false);
      return setPrefs({ ...prefs, panel: prefs.panel === "wide" ? "compact" : "wide" });
    case "panelFocus":
      if (panel.shown) panel.setFocus(!panel.focus);
      return;
    case "center":
      if (panel.shown) commands.center();
      return;
    case "search":
      return panel.onSearch();
    default:
      return commands[key]();
  }
}

/** The selected note, when the selection is one (Ctrl+B). */
function selectedNote(model: Model | null, selection: DiagramState["selection"]) {
  const a = model && selection?.kind === "annotation" ? model.annotationById.get(selection.id) : undefined;
  return a && a.content.kind === "note" && !a.locked ? a : null;
}

/** What a key of edit mode does (`state/edit-keys.ts`): the palette's tools, Escape (the tool, then the selection),
 *  the editing keys, undo and redo, the bars' keys (P, H, Ctrl+B). Tab from the map goes to the contextual bar when
 *  one is shown (its one tab stop); without a bar it walks the selection. */
function editKeyAction(key: EditKey, state: DiagramState, model: Model | null, commands: DiagramCommands): void {
  const { edit } = commands;
  switch (key.kind) {
    case "pin": {
      const pinned = model ? state.hosts.filter((host) => model.pinByHost.has(host)) : [];
      if (pinned.length) edit.unpin(pinned);
      else state.hosts.forEach((host) => edit.pinHere(host));
      return;
    }
    case "hide": return edit.hideHosts(state.hosts);
    case "bold": {
      const note = selectedNote(model, state.selection);
      if (note) edit.annotationUpdate(note.id, { style: { text_weight: note.style.text_weight === "bold" ? "regular" : "bold" } });
      return;
    }
    case "pasteCode": return; // the paste event that follows is taken as code (`useEditKeys`)
    case "toggleEdit": return commands.toggleEdit();
    case "tool": return edit.usePalette(key.tool);
    case "escape":
      if (state.context) return commands.closeContext();
      if (state.tool) return edit.setTool(null);
      return commands.select(null, []);
    case "delete": edit.deleteSelection(); return;
    case "edit": edit.editSelection(); return;
    case "cycle": {
      const bar = key.direction === 1 ? document.querySelector<HTMLElement>('[data-float="context-bar"] .ui-control:not([aria-disabled="true"])') : null;
      if (bar) return bar.focus({ preventScroll: true });
      const next = edit.cycle(key.direction);
      if (next) document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape((next.kind === "node" ? "" : `${next.kind}:`) + next.id)}"]`)?.focus({ preventScroll: true });
      return;
    }
    case "nudge": edit.nudge(key.dx, key.dy); return;
    case "undo": return edit.undo();
    case "redo": return edit.redo();
    case "selectAll": return edit.selectAll();
    case "duplicate": edit.duplicate(); return;
    case "align": return edit.align(key.mode);
    case "grid": return edit.grid();
  }
}

type Ready = Extract<RunState, { kind: "ready" }>;
type ShownCanvasProps = {
  state: DiagramState; run: Ready; session: () => Session; commands: DiagramCommands; notices: Notices; insets: Insets;
  author: string; history: StackHolder; inert: boolean; children?: React.ReactNode;
};

/** The canvas of the collection read, with the view, the selection, the browser's preferences, and edit mode. */
function ShownCanvas({ state, run, session, commands, notices, insets, author, history, inert, children }: ShownCanvasProps) {
  const { prefs, language } = usePrefs();
  const { grid, minimap, theme } = prefs;
  const shown = useMemo(() => ({ grid, minimap, theme }), [grid, minimap, theme]);
  const onContext = useCallback((request: ContextRequest) => commands.openContext(request), [commands]);
  return (
    <Canvas
      model={run.model}
      infrastructure={state.address.infrastructure}
      remembered={run.remembered}
      session={session}
      view={state.view}
      insets={insets}
      prefs={shown}
      language={language}
      selection={state.selection}
      hosts={state.hosts}
      wanted={state.wanted}
      editing={state.editing}
      author={author}
      tool={state.tool}
      editRequest={state.editRequest}
      history={history}
      edit={commands.edit}
      onSelect={commands.select}
      onWantedMissing={notices.onWantedMissing}
      onView={commands.setZoom}
      onHandle={commands.setHandle}
      onNote={notices.onNote}
      onTouched={commands.touched}
      onContext={onContext}
      inert={inert}
    >
      {children}
    </Canvas>
  );
}

export function Diagram() {
  const t = useText();
  const { prefs, setPrefs } = usePrefs();
  const insetsRef = useRef<Insets>(CHROME);
  const insetsOf = useCallback(() => insetsRef.current, []);
  // the toasts of the edit commands are shown by `useNotices`, which needs the commands for an offer's action: a ref
  const editRef = useRef<EditCommands | null>(null);
  const noticesRef = useRef<Notices | null>(null);
  const notify = useCallback((note: Note | null) => noticesRef.current?.onEdit(note), []);
  const { state, session, commands, handle, history } = useDiagram(insetsOf, notify);
  editRef.current = commands.edit;
  const author = useAuthor();
  const infrastructures = useInfrastructures(state.token, state.address.infrastructure);
  const [now] = useState(Date.now);
  const notices = useNotices(t, state.run, commands.dropWanted, editRef);
  noticesRef.current = notices;
  // the canvas's own lines of status ("8 devices placed and memorized") are the Diagram's: the Log does not show them
  const journalShown = state.view.mode === "journal";
  const [focus, setFocus] = useState(false);
  const [table, setTable] = useState<TableState>(INITIAL_TABLE);
  const run = state.run;
  const model = run.kind === "ready" ? run.model : null;
  const editing = state.editing;
  // the Log covers the map: its pages are read while it shows, kept while the Diagram shows
  const journal = useJournal({ token: state.token, filters: state.view.journal, infrastructure: state.address.infrastructure, shown: journalShown, onRefused: commands.refuse });
  const hidden = useMemo(() => (model ? hiddenRules(model.nodes, model.links, state.view) : []), [model, state.view]);
  const hiddenCount = useMemo(() => (model ? hiddenOf(model.nodes, model.links, state.view).length : 0), [model, state.view]);
  // the panel and the band hide while editing (DESIGN.md, Hide when empty)
  const shown = !!model && !editing && !journalShown && hasPanel(model, state.selection);
  const width: Width | null = shown ? (focus ? "focus" : prefs.panel) : null;
  const insets = useMemo(() => chromeWith(width), [width]);
  insetsRef.current = insets;
  const search = useSearch({ state, model, infrastructures, commands, prefs, setPrefs, onInfrastructure: openInfrastructure, hidden: hiddenCount });
  const panel: PanelControl = { shown, focus, setFocus, onSearch: search.control.onOpen };
  // edit mode's keys first (they stop there), then the shell's
  const clipboard = useMemo(
    () => ({
      onCopy: (data: DataTransfer, cut: boolean) => commands.edit.copyEvent(data, cut),
      onPaste: (data: DataTransfer) => commands.edit.pasteEvent(data),
      onPasteCode: (data: DataTransfer | null) => (data ? commands.edit.pasteCodeEvent(data) : commands.edit.pasteCodeFromMenu(null)),
    }),
    [commands],
  );
  useEditKeys((key) => (journalShown ? undefined : editKeyAction(key, state, model, commands)), { editing, hasSelection: !!state.selection || state.hosts.length > 0 }, clipboard);
  // in the Log, the keys that act on the canvas do not answer; Ctrl+K stays the palette
  useShellKeys((key) => (journalShown && key !== "search" ? undefined : keyAction(key, commands, prefs, setPrefs, panel)));
  // leaving edit mode closes the focus panel's scrim too
  useEffect(() => {
    if (editing) setFocus(false);
  }, [editing]);
  const title = t(journalShown ? "journal:ui.page" : "diagram:page", { infrastructure: state.address.infrastructure });
  useEffect(() => {
    document.title = title;
  }, [title]);
  // another element selected: its table starts unfiltered and unsorted (the scope and the chosen columns stay)
  const selectedKey = state.selection ? `${state.selection.kind}\u0000${state.selection.id}` : "";
  useEffect(() => {
    setTable((current) => ({ ...current, query: "", sort: null }));
    if (!selectedKey) setFocus(false);
  }, [selectedKey]);
  // the panel closed from the keyboard (Enter on its close button): the focus goes to the map, never to the body
  const wasShown = useRef(shown);
  useEffect(() => {
    if (wasShown.current && !shown && document.activeElement === document.body) document.querySelector<HTMLElement>(".diagram-canvas")?.focus();
    wasShown.current = shown;
  }, [shown]);
  const hrefs = useMemo(
    () => ({ device: (hostname: string) => formatSearch(state.address) + formatHash(state.view, { kind: "node", token: hostname }) }),
    [state.address, state.view],
  );
  const historyObject = state.selection ? historyObjectOf(state.selection) : null;
  const actions = useMemo(
    () => ({
      onWiden: () => {
        setFocus(false);
        setPrefs({ ...prefs, panel: prefs.panel === "wide" ? "compact" : "wide" });
      },
      onFocus: () => setFocus((current) => !current),
      onCentre: () => commands.center(),
      onClose: () => commands.select(null, []),
      // the Log on the selected element, for what the log names (the context menu's History row, reachable from the keyboard here)
      ...(historyObject ? { onHistory: () => commands.openHistory(historyObject) } : {}),
    }),
    [commands, prefs, setPrefs, historyObject],
  );
  const blocked = blockedOf(t, state);
  return (
    <div className="diagram">
      <div className="diagram-top diagram-top-start">
        <Island name="brand" layout="bar">
          <IconLink href={import.meta.env.BASE_URL} label={t("shell:home")} icon={<LogoMark />} tooltipPlacement="bottom-start" />
        </Island>
        <ContextIsland
          state={state}
          infrastructures={infrastructures.map((item) => item.name)}
          now={now}
          onInfrastructure={openInfrastructure}
          onRun={commands.openFromBand}
          onShowChanges={(shownDiff) => commands.setView({ showDiff: shownDiff })}
        />
        <ViewsIsland model={model} value={state.view.mode} onView={(mode) => commands.setView({ mode })} />
      </div>
      <div className="diagram-top diagram-top-end">
        <ToolsIsland search={search.control} />
      </div>
      {/* edit mode's palette, on the left (DESIGN.md, Edit palette) */}
      {editing && model && !blocked ? (
        <EditPalette
          tool={state.tool}
          canGroup={state.hosts.some((host) => isDevice(model, host))}
          edit={commands.edit}
          history={{ undo: history.get().undo.length > 0, redo: history.get().redo.length > 0 }}
          hidden={hidden}
          hiddenCount={hiddenCount}
        />
      ) : null}
      {blocked && (!journalShown || blocked.kind === "token") ? <StateIsland blocked={blocked} onConnect={commands.connect} /> : null}
      {journalShown && state.token === "present" ? (
        <Journal
          hook={journal}
          filters={state.view.journal}
          address={state.address}
          view={state.view}
          model={model}
          setJournal={commands.setJournal}
          showFromJournal={commands.showFromJournal}
        />
      ) : null}
      {/* the panel of the selected element, before the canvas in the DOM: Tab reaches it before the cards */}
      {model && width ? (
        <div className="diagram-panel" data-width={width}>
          <PanelHost model={model} selection={state.selection} width={width} table={table} onTable={setTable} actions={actions} hrefs={hrefs} now={now} />
        </div>
      ) : null}
      {/* the bottom row: the canvas controls on the left (with a canvas only, never in focus), the band on the right,
          which shrinks and scrolls inside before the two could meet */}
      <div className="diagram-bottom" hidden={journalShown}>
        {!blocked && handle && width !== "focus" ? (
          <CanvasControls
            zoom={state.zoom}
            grid={prefs.grid}
            minimap={prefs.minimap}
            editing={editing}
            commands={commands}
            onGrid={() => setPrefs({ ...prefs, grid: !prefs.grid })}
            onMinimap={() => setPrefs({ ...prefs, minimap: !prefs.minimap })}
            onEdit={commands.toggleEdit}
          />
        ) : null}
        {editing ? null : <RunsIsland state={state} now={now} commands={commands} />}
      </div>
      {state.context && handle && !journalShown ? (
        <ContextMenu
          menu={state.context}
          toile={handle.toile}
          hosts={state.hosts}
          hasSelection={!!state.selection || state.hosts.length > 0}
          edit={commands.edit}
          onClose={commands.closeContext}
          onHistory={commands.openHistory}
        />
      ) : null}
      <ToastHost name="toast" closeLabel={t("ui:close")} />
      <Scrim open={width === "focus"} onDismiss={() => setFocus(false)} />
      <SearchPalette {...search.palette} />
      {/* the canvas last in the DOM: Tab reaches every island before the cards; it paints under them (z-index) */}
      {run.kind === "ready" ? (
        <ShownCanvas state={state} run={run} session={session} commands={commands} notices={notices} insets={insets} author={author} history={history} inert={journalShown}>
          <ContextBar edit={commands.edit} revision={state.revision} tool={state.tool} />
        </ShownCanvas>
      ) : null}
    </div>
  );
}
