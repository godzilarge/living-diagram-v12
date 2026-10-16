// The diagram page (design/comps/shell/index.html at rest): the v1 canvas under floating islands. The top row: the
// logo (back to the home), the context (infrastructure, collection, changes), the views and layers; the tools on the
// right. Bottom left the canvas controls, bottom right the run band. On the right, the panel of the selected element
// (brick 3) at the width the browser prefers (compact or wide) or in focus over the scrim; the canvas frames inside
// what the panel leaves. In place of the canvas, a centred island when there is no diagram to show (the token, a
// refusal, no collection). Ctrl+K and the tools island's button open the search palette (brick 4) over everything;
// a result chosen there is opened here (`useSearch`). It renders `useDiagram`'s state and sends its commands; the
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
import type { Insets } from "../state/zoom";
import type { Session } from "../api/run";
import { useInfrastructures } from "../state/useInfrastructures";
import { SearchPalette } from "../search/SearchPalette";
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
import { useSearch } from "./useSearch";
import { useShellKeys } from "./useShellKeys";
import { ViewsIsland } from "./ViewsIsland";
import { blockedOf } from "./words";
import "./Diagram.css";
import "../panel/panel.css";

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

type Ready = Extract<RunState, { kind: "ready" }>;
type ShownCanvasProps = { state: DiagramState; run: Ready; session: () => Session; commands: DiagramCommands; notices: Notices; insets: Insets };

/** The canvas of the collection read, with the view, the selection and the browser's preferences. */
function ShownCanvas({ state, run, session, commands, notices, insets }: ShownCanvasProps) {
  const { prefs, language } = usePrefs();
  const { grid, minimap, theme } = prefs;
  const shown = useMemo(() => ({ grid, minimap, theme }), [grid, minimap, theme]);
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
      onSelect={commands.select}
      onWantedMissing={notices.onWantedMissing}
      onView={commands.setZoom}
      onHandle={commands.setHandle}
      onNote={notices.onNote}
    />
  );
}

export function Diagram() {
  const t = useText();
  const { prefs, setPrefs } = usePrefs();
  const insetsRef = useRef<Insets>(CHROME);
  const insetsOf = useCallback(() => insetsRef.current, []);
  const { state, session, commands, handle } = useDiagram(insetsOf);
  const infrastructures = useInfrastructures(state.token, state.address.infrastructure);
  const [now] = useState(Date.now);
  const notices = useNotices(t, state.run, commands.dropWanted);
  const [focus, setFocus] = useState(false);
  const [table, setTable] = useState<TableState>(INITIAL_TABLE);
  const run = state.run;
  const model = run.kind === "ready" ? run.model : null;
  const shown = !!model && hasPanel(model, state.selection);
  const width: Width | null = shown ? (focus ? "focus" : prefs.panel) : null;
  const insets = useMemo(() => chromeWith(width), [width]);
  insetsRef.current = insets;
  const search = useSearch({ state, model, infrastructures, commands, prefs, setPrefs, onInfrastructure: openInfrastructure });
  const panel: PanelControl = { shown, focus, setFocus, onSearch: search.control.onOpen };
  useShellKeys((key) => keyAction(key, commands, prefs, setPrefs, panel));
  const title = t("diagram:page", { infrastructure: state.address.infrastructure });
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
  const actions = useMemo(
    () => ({
      onWiden: () => {
        setFocus(false);
        setPrefs({ ...prefs, panel: prefs.panel === "wide" ? "compact" : "wide" });
      },
      onFocus: () => setFocus((current) => !current),
      onCentre: () => commands.center(),
      onClose: () => commands.select(null, []),
    }),
    [commands, prefs, setPrefs],
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
        <ViewsIsland model={model} onView={(mode) => commands.setView({ mode })} />
      </div>
      <div className="diagram-top diagram-top-end">
        <ToolsIsland search={search.control} />
      </div>
      {blocked ? <StateIsland blocked={blocked} onConnect={commands.connect} /> : null}
      {/* the panel of the selected element, before the canvas in the DOM: Tab reaches it before the cards */}
      {model && width ? (
        <div className="diagram-panel" data-width={width}>
          <PanelHost model={model} selection={state.selection} width={width} table={table} onTable={setTable} actions={actions} hrefs={hrefs} now={now} />
        </div>
      ) : null}
      {/* the bottom row: the canvas controls on the left (with a canvas only, never in focus), the band on the right,
          which shrinks and scrolls inside before the two could meet */}
      <div className="diagram-bottom">
        {!blocked && handle && width !== "focus" ? (
          <CanvasControls
            zoom={state.zoom}
            grid={prefs.grid}
            minimap={prefs.minimap}
            commands={commands}
            onGrid={() => setPrefs({ ...prefs, grid: !prefs.grid })}
            onMinimap={() => setPrefs({ ...prefs, minimap: !prefs.minimap })}
          />
        ) : null}
        <RunsIsland state={state} now={now} commands={commands} />
      </div>
      <ToastHost name="toast" closeLabel={t("ui:close")} />
      <Scrim open={width === "focus"} onDismiss={() => setFocus(false)} />
      <SearchPalette {...search.palette} />
      {/* the canvas last in the DOM: Tab reaches every island before the cards; it paints under them (z-index) */}
      {run.kind === "ready" ? <ShownCanvas state={state} run={run} session={session} commands={commands} notices={notices} insets={insets} /> : null}
    </div>
  );
}
