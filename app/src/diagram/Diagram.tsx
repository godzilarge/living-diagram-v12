// The diagram page (design/comps/shell/index.html at rest): the v1 canvas under floating islands. The top row: the
// logo (back to the home), the context (infrastructure, collection, changes), the views and layers; the tools on the
// right. Bottom left the canvas controls, bottom right the run band. In place of the canvas, a centred island when
// there is no diagram to show (the token, a refusal, no collection). It renders `useDiagram`'s state and sends its
// commands; the canvas is mounted by `Canvas` alone, once a collection is read.
import { useEffect, useMemo, useState } from "react";
import { IconLink, Island, LogoMark, ToastHost } from "../ui";
import { useText } from "../i18n";
import { formatSearch } from "../state/address";
import type { ShellKey } from "../state/keys";
import { useDiagram } from "../state/useDiagram";
import type { DiagramCommands } from "../state/useDiagram";
import type { DiagramState, RunState } from "../state/diagram";
import type { Session } from "../api/run";
import { useInfrastructures } from "../state/useInfrastructures";
import { usePrefs } from "../shell/usePrefs";
import type { Prefs } from "../prefs";
import { Canvas } from "./Canvas";
import { CanvasControls } from "./CanvasControls";
import { CHROME } from "./chrome";
import { ContextIsland } from "./ContextIsland";
import { RunsIsland } from "./RunsIsland";
import { StateIsland } from "./StateIsland";
import { ToolsIsland } from "./ToolsIsland";
import { useNotices } from "./useNotices";
import type { Notices } from "./useNotices";
import { useShellKeys } from "./useShellKeys";
import { ViewsIsland } from "./ViewsIsland";
import { blockedOf } from "./words";
import "./Diagram.css";

/** Another infrastructure opens its own page, on its latest collection. */
function openInfrastructure(infrastructure: string): void {
  window.location.assign(import.meta.env.BASE_URL + formatSearch({ infrastructure, runId: "", from: "" }));
}

function keyAction(key: ShellKey, commands: DiagramCommands, prefs: Prefs, setPrefs: (next: Prefs) => void): void {
  if (key === "deselect") commands.select(null, []);
  else if (key === "grid") setPrefs({ ...prefs, grid: !prefs.grid });
  else if (key === "minimap") setPrefs({ ...prefs, minimap: !prefs.minimap });
  else commands[key]();
}

type Ready = Extract<RunState, { kind: "ready" }>;
type ShownCanvasProps = { state: DiagramState; run: Ready; session: () => Session; commands: DiagramCommands; notices: Notices };

/** The canvas of the collection read, with the view, the selection and the browser's preferences. */
function ShownCanvas({ state, run, session, commands, notices }: ShownCanvasProps) {
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
  const { state, session, commands, handle } = useDiagram(CHROME);
  const infrastructures = useInfrastructures(state.token, state.address.infrastructure);
  const [now] = useState(Date.now);
  const notices = useNotices(t, state.run, commands.dropWanted);
  useShellKeys((key) => keyAction(key, commands, prefs, setPrefs));
  const title = t("diagram:page", { infrastructure: state.address.infrastructure });
  useEffect(() => {
    document.title = title;
  }, [title]);
  const blocked = blockedOf(t, state);
  const run = state.run;
  return (
    <div className="diagram">
      <div className="diagram-top diagram-top-start">
        <Island name="brand" layout="bar">
          <IconLink href={import.meta.env.BASE_URL} label={t("shell:home")} icon={<LogoMark />} tooltipPlacement="bottom-start" />
        </Island>
        <ContextIsland
          state={state}
          infrastructures={infrastructures}
          now={now}
          onInfrastructure={openInfrastructure}
          onRun={commands.openFromBand}
          onShowChanges={(shown) => commands.setView({ showDiff: shown })}
        />
        <ViewsIsland model={run.kind === "ready" ? run.model : null} onView={(mode) => commands.setView({ mode })} />
      </div>
      <div className="diagram-top diagram-top-end">
        <ToolsIsland />
      </div>
      {blocked ? <StateIsland blocked={blocked} onConnect={commands.connect} /> : null}
      {/* the bottom row: the canvas controls on the left (with a canvas only), the band on the right, which shrinks
          and scrolls inside before the two could meet */}
      <div className="diagram-bottom">
        {!blocked && handle ? (
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
      {/* the canvas last in the DOM: Tab reaches every island before the cards; it paints under them (z-index) */}
      {run.kind === "ready" ? <ShownCanvas state={state} run={run} session={session} commands={commands} notices={notices} /> : null}
    </div>
  );
}
