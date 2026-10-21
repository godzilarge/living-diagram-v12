// The Check view (design/comps/shell/control.html, direction A "the register", chosen by Orhan on 2026-10-17): a page
// of widgets on the ground under the diagram's top row; the map gives way. The verdicts take the left column, the
// coverage, the cables and their sources and the delivery the right one (480 px). It renders the run's model and the
// archived runs; nothing is read here (no new route). A target of a verdict is an address the diagram page listens to.
import type { Model } from "@engine/canvas/types";
import type { RunEntry } from "../api/run";
import { useText } from "../i18n";
import type { Address, ViewState } from "../state/address";
import { CoverageWidget } from "./CoverageWidget";
import { DeliveryWidget } from "./DeliveryWidget";
import { SourcesWidget } from "./SourcesWidget";
import { VerdictsWidget } from "./VerdictsWidget";
import "./control.css";

export type ControlViewProps = { model: Model; address: Address; view: ViewState; runs: readonly RunEntry[] | null; now: number };

export function ControlView({ model, address, view, runs, now }: ControlViewProps) {
  const t = useText();
  return (
    <main className="control-space" aria-label={t("control:space")}>
      <div className="control-col">
        <VerdictsWidget model={model} address={address} view={view} />
      </div>
      <div className="control-col">
        <CoverageWidget model={model} />
        <SourcesWidget model={model} />
        <DeliveryWidget model={model} runs={runs} runId={address.runId} now={now} />
      </div>
    </main>
  );
}
