// The run band of the diagram (design/comps/shell/index.html, `.runs`): the infrastructure's collections, the current
// one and the compared one marked, then "Compare with…" any earlier collection, or none. Hidden with fewer than two
// collections. Opening a run from the band compares it with the one before it (`state/runs.ts`).
import { RunBand } from "../ui";
import { useText } from "../i18n";
import type { DiagramState } from "../state/diagram";
import type { DiagramCommands } from "../state/useDiagram";
import { bandOf, compareChoices } from "../state/runs";
import { bandItems, compareOptions } from "./words";

export function RunsIsland({ state, now, commands }: { state: DiagramState; now: number; commands: Pick<DiagramCommands, "openFromBand" | "compareTo"> }) {
  const t = useText();
  const runs = state.runs ?? [];
  const { runId, from } = state.address;
  const choices = compareChoices(runs, runId);
  return (
    <RunBand
      name="runs"
      className="diagram-runs"
      label={t("diagram:band.label")}
      comparedLabel={t("diagram:band.compared")}
      items={bandItems(t, bandOf(runs, runId, from), now)}
      onOpen={commands.openFromBand}
      compare={{
        label: t("diagram:band.compareLabel"),
        triggerLabel: t("diagram:band.compareWith"),
        options: compareOptions(t, choices, now),
        value: from,
        onChange: commands.compareTo,
        disabled: state.run.kind === "loading" || choices.length === 0,
        disabledReason: state.run.kind === "loading" ? t("diagram:band.compareBusy") : t("diagram:band.noEarlier"),
      }}
    />
  );
}
