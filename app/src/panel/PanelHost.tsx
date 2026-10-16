// What the panel shows for the canvas's selection: a device, a cable, an aggregate, a bundle, an HA cluster; nothing
// for a group, an annotation or a connector (edit mode, brick 6), nothing without a selection (the panel hides).
// It renders the page's state (the selection, the width) and sends its actions; it never touches the canvas.
import { aggregateOf, beamOf, clusterOf, linkOf, nodeOf } from "@engine/canvas/model";
import type { Model, Selection } from "@engine/canvas/types";
import type { Width } from "../state/panel";
import { DevicePanel } from "./DevicePanel";
import type { TableState } from "./InterfacesSection";
import { AggregatePanel, BundlePanel, CablePanel, ClusterPanel } from "./OtherPanels";
import type { PanelActions } from "./PanelFrame";
import type { Hrefs } from "./StructureSections";

export type PanelHostProps = {
  model: Model;
  selection: Selection | null;
  width: Width;
  table: TableState;
  onTable: (next: TableState) => void;
  actions: PanelActions;
  hrefs: Hrefs;
  now: number;
};

/** Whether the selection has a panel at all (the page reserves the panel's width only then). */
export function hasPanel(model: Model, selection: Selection | null): boolean {
  return !!(nodeOf(model, selection) || linkOf(model, selection) || aggregateOf(model, selection) || beamOf(model, selection) || clusterOf(model, selection));
}

export function PanelHost({ model, selection, width, table, onTable, actions, hrefs, now }: PanelHostProps) {
  const node = nodeOf(model, selection);
  if (node) return <DevicePanel model={model} node={node} width={width} table={table} onTable={onTable} actions={actions} hrefs={hrefs} now={now} />;
  const link = linkOf(model, selection);
  if (link) return <CablePanel model={model} link={link} width={width} actions={actions} hrefs={hrefs} />;
  const aggregate = aggregateOf(model, selection);
  if (aggregate) return <AggregatePanel model={model} aggregate={aggregate} width={width} actions={actions} hrefs={hrefs} />;
  const beam = beamOf(model, selection);
  if (beam) return <BundlePanel beam={beam} width={width} actions={actions} hrefs={hrefs} />;
  const cluster = clusterOf(model, selection);
  if (cluster) return <ClusterPanel model={model} cluster={cluster} width={width} actions={actions} hrefs={hrefs} />;
  return null;
}
