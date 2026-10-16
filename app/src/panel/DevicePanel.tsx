// A device's panel (design/comps/shell/index.html, the `.panel` at rest, `panel-wide`, `panel-focus`): the header
// (type tile, hostname, hardware), then in compact and wide: To check (the alerts in words), Identity (the facts, in
// two columns when wide), Interfaces, the MLAG pair, the aggregates, the HA cluster, the stack, the changes since
// the compared collection; in focus: a strip of facts under the header and the interface table alone, every column.
// A neighbour never collected (stub) or a device of another infrastructure shows what its neighbours announce.
import { ArrowLeftRight, BrickWall, CircleDashed, HelpCircle, Route, Scale, Server, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import type { Model, ModelNode } from "@engine/canvas/types";
import { Alerts, Facts, Mark, PanelSection } from "../ui";
import type { Alert, Fact } from "../ui";
import { useText } from "../i18n";
import type { Translate } from "../i18n";
import { aggregateRows, alertsOf, haClusters, interfaceRows, liveCables, mlagPairs, mlagPeers, removedCables, severityCountsOf } from "../state/panel";
import type { Width } from "../state/panel";
import { dayMonth } from "../state/time";
import { Muted } from "./cells";
import { InterfacesSection } from "./InterfacesSection";
import type { TableState } from "./InterfacesSection";
import { PanelFrame } from "./PanelFrame";
import type { PanelActions } from "./PanelFrame";
import { AggregatesSection, HaSection, MlagSection, StackSection } from "./StructureSections";
import type { Hrefs } from "./StructureSections";
import { alertRefsWords, alertWords, changeValueWords, collectionWords, durationWords, severityWords, shortPort, sourceWords, subheadingWords } from "./words";

const TILE: Readonly<Record<string, ReactNode>> = {
  switch: <ArrowLeftRight />, router: <Route />, firewall: <BrickWall />, load_balancer: <Scale />, wireless_controller: <Wifi />, server: <Server />,
};
export const deviceTile = (node: Pick<ModelNode, "kind" | "type">): ReactNode => (node.kind === "stub" ? <CircleDashed /> : (node.type && TILE[node.type]) || <HelpCircle />);

export type DevicePanelProps = {
  model: Model;
  node: ModelNode;
  width: Width;
  table: TableState;
  onTable: (next: TableState) => void;
  actions: PanelActions;
  hrefs: Hrefs;
  now: number;
};

function identityFacts(t: Translate, model: Model, node: ModelNode): Fact[] {
  const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
  const live = liveCables(model, node.hostname).length;
  const removed = removedCables(model, node.hostname).length;
  const facts: (Fact | null)[] = [
    node.vendor ? { label: t("panel:identity.vendor"), value: node.vendor } : null,
    node.model ? { label: t("panel:identity.model"), value: node.model } : null,
    system ? { label: t("panel:identity.system"), value: system } : null,
    node.site ? { label: t("panel:identity.site"), value: node.site } : null,
    node.serial_number ? { label: t("panel:identity.serial"), value: node.serial_number } : null,
    node.reported_hostname && node.reported_hostname !== node.hostname ? { label: t("panel:identity.reportedName"), value: node.reported_hostname } : null,
    { label: t("panel:identity.uptime"), value: durationWords(t, node.uptime_seconds) },
    { label: t("panel:identity.collection"), value: collectionWords(t, node.collection, model.source.run.start_datetime) },
    { label: t("panel:identity.cables"), value: removed ? t("panel:identity.cablesRemoved", { count: live, removed }) : String(live) },
    node.stack ? { label: t("panel:identity.stack"), value: t("panel:identity.stackMembers", { count: node.stack.member_count }) } : null,
    node.virtual_contexts.length ? { label: t("panel:identity.contexts"), value: node.virtual_contexts.join(t("panel:interfaces.listJoin")) } : null,
    node.evidence?.capabilities.length ? { label: t("panel:identity.capabilities"), value: node.evidence.capabilities.join(t("panel:interfaces.listJoin")) } : null,
  ];
  return facts.filter((fact): fact is Fact => fact !== null && fact.value !== null && fact.value !== undefined);
}

/** The focus strip: model, system, site, collection, MLAG pair, aggregates, to check. */
function stripFacts(t: Translate, model: Model, node: ModelNode, toCheck: ReactNode | null): Fact[] {
  const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
  const peers = mlagPeers(mlagPairs(model, node.hostname));
  const aggregates = aggregateRows(model, node.hostname).length;
  const facts: (Fact | null)[] = [
    node.model ? { label: t("panel:identity.model"), value: node.model } : null,
    system ? { label: t("panel:identity.system"), value: system } : null,
    node.site ? { label: t("panel:identity.site"), value: node.site } : null,
    { label: t("panel:identity.collection"), value: collectionWords(t, node.collection, model.source.run.start_datetime) },
    peers.length ? { label: t("panel:identity.mlagPair"), value: peers.join(t("panel:mlag.join")) } : null,
    aggregates ? { label: t("panel:identity.aggregates"), value: String(aggregates) } : null,
    { label: t("panel:identity.toCheck"), value: toCheck ?? <Muted>{t("panel:identity.nothing")}</Muted> },
  ];
  return facts.filter((fact): fact is Fact => fact !== null && fact.value !== null && fact.value !== undefined);
}

/** The fields of a device the diff may change, each with its label in the catalogue; another path is written as is. */
const FIELDS = ["collection", "os_version", "os_name", "model", "serial_number", "site", "uptime_seconds", "reported_hostname", "vendor", "type", "stack", "virtual_contexts"] as const;
type Field = (typeof FIELDS)[number];

function ChangesSection({ model, node, now }: { model: Model; node: ModelNode; now: number }) {
  const t = useText();
  const change = node.ghost ? { kind: "removed" as const, fields: [] } : model.changeOf("node", node.hostname);
  if (!change || !model.diff) return null;
  const date = dayMonth(model.diff.before.start_datetime, t("ui:locale"), now);
  if (change.kind !== "changed") return <p className="panel-note">{t(change.kind === "added" ? "panel:changes.added" : "panel:changes.removed", { date })}</p>;
  return (
    <PanelSection heading={t("panel:changes.title", { date })}>
      <Facts
        items={change.fields.map((field) => ({
          label: (FIELDS as readonly string[]).includes(field.path) ? t(`panel:changes.field.${field.path as Field}`) : field.path.replace(/_/g, " "),
          value: t("panel:changes.arrow", { before: changeValueWords(t, field.path, field.before), after: changeValueWords(t, field.path, field.after) }),
        }))}
      />
    </PanelSection>
  );
}

/** The witnesses of a node never collected: one fact per witness port, its sources joined (LLDP, CDP, description). */
function SeenBySection({ node }: { node: ModelNode }) {
  const t = useText();
  if (!node.evidence || !node.evidence.seen_by.length) return null;
  const byPort = new Map<string, { hostname: string; port: string; sources: string[] }>();
  for (const w of node.evidence.seen_by) {
    const key = `${w.hostname}\u0000${w.interface}`;
    const seen = byPort.get(key) ?? { hostname: w.hostname, port: w.interface, sources: [] };
    byPort.set(key, { ...seen, sources: [...seen.sources, sourceWords(t, w.source)] });
  }
  return (
    <PanelSection heading={t("panel:identity.seenBy")}>
      <p className="panel-note">{node.kind === "stub" ? t("panel:identity.stubHint") : t("panel:identity.externalHint")}</p>
      <Facts items={Array.from(byPort.values()).map((w) => ({ label: w.hostname, value: t("panel:identity.seenByLine", { port: shortPort(w.port), sources: w.sources.join(t("panel:identity.seenJoin")) }) }))} />
    </PanelSection>
  );
}

export function DevicePanel({ model, node, width, table, onTable, actions, hrefs, now }: DevicePanelProps) {
  const t = useText();
  const hostname = node.hostname;
  const alerts = alertsOf(model, hostname);
  const counts = severityCountsOf(alerts);
  const severity = severityWords(t, counts);
  const rows = interfaceRows(model, hostname);
  const items: Alert[] = alerts.map((group) => ({
    id: `${group.severity}:${group.code}`,
    tone: group.tone,
    text: alertWords(t, group, model.catalogue),
    detail: alertRefsWords(t, group.refs, hostname) ?? undefined,
  }));
  const worst = counts.error ? "error" : counts.warning ? "warning" : "neutral";
  const focus = width === "focus";
  const stubLike = node.kind !== "device";
  return (
    <PanelFrame heading={hostname} subheading={subheadingWords(t, node)} tile={deviceTile(node)} width={width} actions={actions}>
      {focus ? <Facts layout="strip" items={stripFacts(t, model, node, severity ? <Mark tone={worst}>{severity}</Mark> : null)} /> : null}
      {!focus && alerts.length ? (
        <PanelSection heading={t("panel:toCheck.title")} aside={severity ?? undefined}>
          <Alerts label={t("panel:toCheck.title")} items={items} />
        </PanelSection>
      ) : null}
      {!focus ? (
        <PanelSection heading={t("panel:identity.title")}>
          <Facts items={identityFacts(t, model, node)} columns={width === "wide" ? 2 : 1} />
        </PanelSection>
      ) : null}
      {!focus ? <SeenBySection node={node} /> : null}
      {!focus ? <ChangesSection model={model} node={node} now={now} /> : null}
      {stubLike && !rows.length ? null : focus ? (
        // in focus the table is the panel: no section heading (the mockup hides it), the scope bar right under the strip
        <div className="panel-focus-ports">
          <InterfacesSection rows={rows} width={width} table={table} onTable={onTable} href={hrefs.device} />
        </div>
      ) : (
        <PanelSection heading={t("panel:interfaces.title")} aside={t("panel:interfaces.ports", { count: rows.length })}>
          <InterfacesSection rows={rows} width={width} table={table} onTable={onTable} href={hrefs.device} />
        </PanelSection>
      )}
      {!focus ? <MlagSection pairs={mlagPairs(model, hostname)} hrefs={hrefs} /> : null}
      {!focus ? <AggregatesSection rows={aggregateRows(model, hostname)} hrefs={hrefs} /> : null}
      {!focus ? <HaSection clusters={haClusters(model, hostname)} hrefs={hrefs} /> : null}
      {!focus ? <StackSection stack={node.stack} /> : null}
    </PanelFrame>
  );
}
