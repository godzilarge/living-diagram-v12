// The context island (design/comps/shell/index.html, `.ctx`): the infrastructure, the collection shown, then the
// summary of the diff against the compared collection ("14 changes", the detail in its tooltip), only when there is a
// diff. The collection choice turns busy while a collection is read. Below 1200 px the summary folds away (DESIGN.md,
// Layout: responsive).
import { GitCompare } from "lucide-react";
import { Button, Island, Select, Separator } from "../ui";
import { useText } from "../i18n";
import type { DiagramState } from "../state/diagram";
import { diffFactsOf } from "../state/diff-facts";
import { changesWords, runOptions } from "./words";

export type ContextIslandProps = {
  state: DiagramState;
  infrastructures: readonly string[];
  now: number;
  onInfrastructure: (infrastructure: string) => void;
  onRun: (runId: string) => void;
  onShowChanges: (shown: boolean) => void;
};

/** The diff summary: its words, its detail in the tooltip; pressed, the changes are drawn on the map (the v1's
 *  toggle, `diff=0` in the address when off). */
function Changes({ state, now, onShowChanges }: { state: DiagramState; now: number; onShowChanges: (shown: boolean) => void }) {
  const t = useText();
  const facts = state.run.kind === "ready" ? diffFactsOf(state.run.model) : null;
  if (!facts) return null;
  const words = changesWords(t, facts, now);
  const shown = state.view.showDiff;
  return (
    <span className="diagram-diff">
      <Separator />
      <Button icon={<GitCompare />} tooltip={words.tooltip} pressed={shown} onClick={() => onShowChanges(!shown)} aria-description={t("diagram:context.showChanges")}>
        {words.label}
      </Button>
    </span>
  );
}

export function ContextIsland({ state, infrastructures, now, onInfrastructure, onRun, onShowChanges }: ContextIslandProps) {
  const t = useText();
  // busy while a collection is read, and while the list of collections is (a run named without its compared one,
  // the home's link: the page lists first, then opens)
  const listing = state.run.kind === "idle" && state.token === "present" && state.runs === null && state.runsCause === null;
  const loading = state.run.kind === "loading" || listing;
  const runs = state.runs ?? [];
  const waiting = runs.length === 0 && loading;
  return (
    <Island name="context" layout="bar">
      <Select
        name="infrastructures"
        label={t("diagram:context.infrastructure")}
        options={infrastructures.map((name) => ({ value: name, label: name }))}
        value={state.address.infrastructure}
        onChange={(name) => (name !== state.address.infrastructure ? onInfrastructure(name) : undefined)}
      />
      {runs.length > 0 || waiting ? (
        <Select
          name="runs"
          label={t("diagram:context.run")}
          options={runOptions(t, runs)}
          value={state.address.runId}
          onChange={onRun}
          loading={loading}
          triggerLabel={waiting ? t("diagram:state.loading") : undefined}
        />
      ) : null}
      <Changes state={state} now={now} onShowChanges={onShowChanges} />
    </Island>
  );
}
