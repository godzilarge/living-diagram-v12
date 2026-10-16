// The panels of what else the canvas selects, in the device panel's grammar, read only: a cable (its two ends, what
// the link shares, the two ports as the devices describe them), an aggregate (its facts and members), a bundle (its
// aggregates and cables), an HA cluster (its members and heartbeats). Groups, annotations and connectors are edit
// mode's (brick 6) and have no panel until then.
import { Cable, Boxes, Layers } from "lucide-react";
import type { ReactNode } from "react";
import type { Aggregate, Beam, Cluster, Model, ModelLink } from "@engine/canvas/types";
import type { CheckEntry } from "@engine/canvas/types";
import { Alerts, Facts, Link, Mark, PanelSection, Table } from "../ui";
import type { Alert, Fact } from "../ui";
import { useText } from "../i18n";
import type { Translate } from "../i18n";
import { aggregateRow, alertGroupsOf, cableFacts, haClusters, interfaceRows, severityCountsOf } from "../state/panel";
import type { CableEnd, InterfaceRow, Width } from "../state/panel";
import { cellOf, Muted } from "./cells";
import { PanelFrame } from "./PanelFrame";
import type { PanelActions } from "./PanelFrame";
import { HaSection } from "./StructureSections";
import type { Hrefs } from "./StructureSections";
import { alertRefsWords, alertWords, columnWords, memberStatusWords, severityWords, shortPort, speedWords } from "./words";

type Common = { width: Width; actions: PanelActions; hrefs: Hrefs };

/** The checks of a cable or an aggregate in words, as the device panel says them, seen from `hostname`. */
function ToCheckSection({ model, checks, hostname }: { model: Model; checks: readonly CheckEntry[]; hostname: string }) {
  const t = useText();
  const groups = alertGroupsOf(checks, hostname);
  if (!groups.length) return null;
  const items: Alert[] = groups.map((group) => ({
    id: `${group.severity}:${group.code}`,
    tone: group.tone,
    text: alertWords(t, group, model.catalogue),
    detail: alertRefsWords(t, group.refs, hostname) ?? undefined,
  }));
  return (
    <PanelSection heading={t("panel:toCheck.title")} aside={severityWords(t, severityCountsOf(groups)) ?? undefined}>
      <Alerts label={t("panel:toCheck.title")} items={items} />
    </PanelSection>
  );
}
const PORT_COLUMNS = ["state", "speed", "media", "mode", "description"] as const;
type PortColumn = (typeof PORT_COLUMNS)[number];
/** The port columns a width leaves room for next to the device and the port. */
const portColumnsFor = (width: Width): readonly PortColumn[] => (width === "compact" ? ["state", "speed"] : PORT_COLUMNS);

/** The two ports of a cable, or the members of an aggregate, as rows of the interface table with their device first. */
function PortsTable({ label, rows, hrefs, t, width }: { label: string; rows: readonly Readonly<{ hostname: string; port: string; row: InterfaceRow | null }>[]; hrefs: Hrefs; t: Translate; width: Width }) {
  const keys = portColumnsFor(width);
  const columns = [{ key: "device", label: t("panel:cable.device") }, { key: "port", label: columnWords(t, "port", "wide") }, ...keys.map((key) => ({ key, label: columnWords(t, key, "wide") }))];
  const context = { t, width: "wide" as const, href: hrefs.device };
  return (
    <Table
      label={label}
      columns={columns}
      density="compact"
      rows={rows.map((end) => ({
        id: `${end.hostname}\u0000${end.port}`,
        cells: {
          device: <Link href={hrefs.device(end.hostname)} variant="quiet">{end.hostname}</Link>,
          port: <span className="panel-port">{end.port}</span>,
          ...Object.fromEntries(keys.map((key) => [key, end.row ? cellOf(key, end.row, context) : <Muted>{t("panel:changes.empty")}</Muted>])),
        } as Record<string, ReactNode>,
      }))}
    />
  );
}

export function CablePanel({ model, link, width, actions, hrefs }: Common & { model: Model; link: ModelLink }) {
  const t = useText();
  const facts = cableFacts(model, link);
  const ends: readonly CableEnd[] = [facts.a, facts.b];
  const state = facts.oper === "up" ? t("panel:cable.up") : facts.oper === "down" ? t("panel:cable.down") : t("panel:cable.unknown");
  const items: Fact[] = [
    { label: t("panel:cable.state"), value: <Mark tone={facts.oper === "up" ? "ok" : facts.oper === "down" ? "error" : "neutral"}>{state}</Mark> },
    ...(facts.speedMbps !== null ? [{ label: t("panel:cable.speed"), value: speedWords(t, facts.speedMbps) }] : []),
    ...(facts.aggregates.length ? [{ label: t("panel:cable.aggregates"), value: facts.aggregates.join(t("panel:interfaces.listJoin")) }] : []),
    ...(facts.beam ? [{ label: t("panel:cable.bundle"), value: t("panel:cable.bundleWords", { a: facts.beam.a, b: facts.beam.b }) }] : []),
  ];
  return (
    <PanelFrame
      heading={t("panel:cable.ends", { a: facts.a.hostname, b: facts.b.hostname })}
      subheading={t("panel:cable.ports", { a: shortPort(facts.a.port), b: shortPort(facts.b.port) })}
      tile={<Cable />}
      width={width}
      actions={actions}
    >
      <ToCheckSection model={model} checks={facts.checks} hostname={facts.a.hostname} />
      <PanelSection heading={t("panel:cable.title")}>
        {facts.removed ? <p className="panel-note">{t("panel:cable.removed")}</p> : null}
        <Facts items={items} columns={width === "compact" ? 1 : 2} />
      </PanelSection>
      <PanelSection heading={t("panel:cable.portsTitle")}>
        {ends.some((end) => !end.known) ? <p className="panel-note">{t("panel:cable.unknownEnd")}</p> : null}
        <PortsTable label={t("panel:cable.portsTitle")} rows={ends} hrefs={hrefs} t={t} width={width} />
      </PanelSection>
    </PanelFrame>
  );
}

const PROTOCOLS = ["lacp", "static", "pagp"] as const;

export function AggregatePanel({ model, aggregate, width, actions, hrefs }: Common & { model: Model; aggregate: Aggregate }) {
  const t = useText();
  const row = aggregateRow(aggregate);
  const raw = aggregate.raw;
  const rows = interfaceRows(model, aggregate.hostname);
  const members = raw.members.map((member) => ({ hostname: aggregate.hostname, port: member.name, row: rows.find((r) => r.name === member.name) ?? null, status: member.status }));
  const items: Fact[] = [
    { label: t("panel:aggregates.state"), value: <Mark tone={row.tone}>{t("panel:aggregates.membersOf", { bundled: row.bundled, total: row.total })}</Mark> },
    { label: t("panel:aggregates.protocol"), value: (PROTOCOLS as readonly string[]).includes(raw.protocol) ? t(`panel:aggregates.protocolWords.${raw.protocol}`) : raw.protocol },
    ...(raw.lacp_mode ? [{ label: t("panel:aggregates.lacpMode"), value: raw.lacp_mode }] : []),
    ...(raw.min_links !== null ? [{ label: t("panel:aggregates.minLinks"), value: String(raw.min_links) }] : []),
    ...(raw.mlag_id !== null ? [{ label: t("panel:aggregates.mlagId"), value: String(raw.mlag_id) }] : []),
    { label: t("panel:aggregates.to"), value: row.to.length ? row.to.map((host, i) => <span key={host}>{i ? t("panel:mlag.join") : ""}<Link href={hrefs.device(host)}>{host}</Link></span>) : <Muted>{t("panel:aggregates.noCable")}</Muted> },
  ];
  const memberKeys = portColumnsFor(width).filter((key) => key !== "mode");
  const columns = [{ key: "member", label: t("panel:aggregates.member") }, { key: "status", label: t("panel:aggregates.memberState") }, ...memberKeys.map((key) => ({ key, label: columnWords(t, key, "wide") }))];
  const context = { t, width: "wide" as const, href: hrefs.device };
  return (
    <PanelFrame heading={aggregate.name} subheading={aggregate.hostname} tile={<Layers />} width={width} actions={actions}>
      <ToCheckSection model={model} checks={aggregate.checks} hostname={aggregate.hostname} />
      <PanelSection heading={t("panel:kind.aggregate")}>
        <Facts items={items} columns={width === "compact" ? 1 : 2} />
      </PanelSection>
      <PanelSection heading={t("panel:aggregates.membersTitle")} aside={t("panel:aggregates.count", { count: members.length })}>
        <Table
          label={t("panel:aggregates.membersTitle")}
          columns={columns}
          density="compact"
          rows={members.map((member) => ({
            id: member.port,
            cells: {
              member: <span className="panel-port">{member.port}</span>,
              status: <Mark tone={member.status === "bundled" ? "ok" : member.status === "down" || member.status === "suspended" ? "error" : "neutral"}>{memberStatusWords(t, member.status)}</Mark>,
              ...Object.fromEntries(memberKeys.map((key) => [key, member.row ? cellOf(key, member.row, context) : <Muted>{t("panel:changes.empty")}</Muted>])),
            } as Record<string, ReactNode>,
          }))}
        />
      </PanelSection>
    </PanelFrame>
  );
}

export function BundlePanel({ beam, width, actions, hrefs }: Common & { beam: Beam }) {
  const t = useText();
  const items: Fact[] = [
    { label: beam.a.hostname, value: <Link href={hrefs.device(beam.a.hostname)}>{beam.a.aggregate}</Link> },
    { label: beam.b.hostname, value: <Link href={hrefs.device(beam.b.hostname)}>{beam.b.aggregate}</Link> },
    { label: t("panel:bundle.cablesTitle"), value: t("panel:bundle.cables", { count: beam.links.length }) },
    ...(beam.degraded ? [{ label: t("panel:aggregates.state"), value: <Mark tone="warning">{t("panel:bundle.degraded")}</Mark> }] : []),
    ...(beam.peerLink ? [{ label: t("panel:mlag.peerLink"), value: t("panel:bundle.peerLink") }] : []),
  ];
  const columns = [{ key: "a", label: beam.a.hostname }, { key: "b", label: beam.b.hostname }, { key: "state", label: t("panel:cable.state") }];
  return (
    <PanelFrame heading={t("panel:cable.ends", { a: beam.a.aggregate, b: beam.b.aggregate })} subheading={t("panel:cable.ends", { a: beam.a.hostname, b: beam.b.hostname })} tile={<Layers />} width={width} actions={actions}>
      <PanelSection heading={t("panel:bundle.title")}>
        <Facts items={items} columns={width === "compact" ? 1 : 2} />
      </PanelSection>
      <PanelSection heading={t("panel:bundle.cablesTitle")} aside={t("panel:bundle.cables", { count: beam.links.length })}>
        <Table
          label={t("panel:bundle.cablesTitle")}
          columns={columns}
          density="compact"
          rows={beam.links.map((link) => {
            const a = link.a.hostname === beam.a.hostname ? link.a : link.b;
            const b = a === link.a ? link.b : link.a;
            return {
              id: link.id,
              cells: {
                a: <span className="panel-port">{shortPort(a.interface)}</span>,
                b: <span className="panel-port">{shortPort(b.interface)}</span>,
                state: <Mark tone={link.raw.oper === "up" ? "ok" : link.raw.oper === "down" ? "error" : "neutral"}>{link.raw.oper === "up" ? t("panel:cable.up") : link.raw.oper === "down" ? t("panel:cable.down") : t("panel:cable.unknown")}</Mark>,
              },
            };
          })}
        />
      </PanelSection>
    </PanelFrame>
  );
}

export function ClusterPanel({ model, cluster, width, actions, hrefs }: Common & { model: Model; cluster: Cluster }) {
  const t = useText();
  const facts = haClusters(model, cluster.hosts[0]).filter((c) => c.id === cluster.id);
  return (
    <PanelFrame heading={cluster.raw.cluster_name ?? cluster.hosts.join(t("panel:mlag.join"))} subheading={t("panel:kind.cluster")} tile={<Boxes />} width={width} actions={actions}>
      <HaSection clusters={facts} hrefs={hrefs} />
    </PanelFrame>
  );
}
