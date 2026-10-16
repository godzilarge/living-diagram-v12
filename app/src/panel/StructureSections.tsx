// The structures of a device, as the mockup's sections: the MLAG pair (with whom, the peer link, the domains and
// where they lead), the aggregates (a mini table: aggregate, to, active members with the state mark), the HA cluster
// (mode, the members with role, state and priority, the heartbeats), the stack members. Every value comes from
// `state/panel.ts`; the words from the catalogue.
import { Facts, Link, Mark, PanelSection, Table } from "../ui";
import type { Fact } from "../ui";
import { useText } from "../i18n";
import type { AggregateRow, HaFacts, MlagPair } from "../state/panel";
import { countDown } from "../state/panel";
import type { Stack } from "@engine/contracts/snapshot";
import { haModeWords, haRoleWords, haStateWords, shortPort } from "./words";
import { Muted } from "./cells";

export type Hrefs = Readonly<{ device: (hostname: string) => string }>;

export function MlagSection({ pairs, hrefs }: { pairs: readonly MlagPair[]; hrefs: Hrefs }) {
  const t = useText();
  if (!pairs.length) return null;
  const peers = Array.from(new Set(pairs.map((pair) => pair.peer).filter((peer): peer is string => !!peer)));
  const peerLink = pairs.map((pair) => pair.peerLink).find((link) => link !== null) ?? null;
  const facts: Fact[] = [
    { label: t("panel:mlag.with"), value: peers.length ? peers.map((peer, i) => <span key={peer}>{i ? t("panel:mlag.join") : ""}<Link href={hrefs.device(peer)}>{peer}</Link></span>) : <Muted>{t("panel:changes.empty")}</Muted> },
    ...(peerLink
      ? [{ label: t("panel:mlag.peerLink"), value: t("panel:mlag.peerLinkWords", { name: peerLink.name, count: peerLink.total, state: peerLink.up ? t("panel:mlag.up") : t("panel:mlag.down") }) }]
      : []),
    {
      label: t("panel:mlag.domains"),
      value: pairs.map((pair) => (pair.downstream ? t("panel:mlag.domain", { id: pair.mlagId, to: pair.downstream }) : t("panel:mlag.domainAlone", { id: pair.mlagId }))).join(t("panel:mlag.join")),
    },
  ];
  return (
    <PanelSection heading={t("panel:mlag.title")}>
      <Facts items={facts} />
    </PanelSection>
  );
}

export function AggregatesSection({ rows, hrefs }: { rows: readonly AggregateRow[]; hrefs: Hrefs }) {
  const t = useText();
  if (!rows.length) return null;
  const down = countDown(rows);
  const aside = down ? t("panel:aggregates.asideDown", { count: rows.length, down }) : t("panel:aggregates.aside", { count: rows.length });
  const columns = [
    { key: "name", label: t("panel:aggregates.aggregate") },
    { key: "to", label: t("panel:aggregates.to") },
    { key: "members", label: t("panel:aggregates.members"), align: "end" as const },
  ];
  const toWords = (row: AggregateRow) => {
    if (!row.to.length) return <Muted>{t("panel:aggregates.noCable")}</Muted>;
    const links = row.to.map((host, i) => <span key={host}>{i ? t("panel:mlag.join") : ""}<Link href={hrefs.device(host)} variant="quiet">{host}</Link></span>);
    return (
      <>
        {links}
        {row.peerLink ? <Muted>{t("panel:mlag.join")}{t("panel:aggregates.peerLink")}</Muted> : null}
      </>
    );
  };
  const tableRows = rows.map((row) => ({
    id: row.id,
    cells: {
      name: <span className="panel-port">{row.name}</span>,
      to: toWords(row),
      members: <Mark tone={row.tone}>{t("panel:aggregates.membersOf", { bundled: row.bundled, total: row.total })}</Mark>,
    },
  }));
  return (
    <PanelSection heading={t("panel:aggregates.title")} aside={aside}>
      <Table label={t("panel:aggregates.title")} columns={columns} rows={tableRows} density="compact" />
    </PanelSection>
  );
}

export function HaSection({ clusters, hrefs }: { clusters: readonly HaFacts[]; hrefs: Hrefs }) {
  const t = useText();
  if (!clusters.length) return null;
  const columns = [
    { key: "member", label: t("panel:ha.member") },
    { key: "role", label: t("panel:ha.role") },
    { key: "state", label: t("panel:ha.state") },
    { key: "priority", label: t("panel:ha.priority"), align: "end" as const },
  ];
  return (
    <>
      {clusters.map((cluster) => (
        <PanelSection key={cluster.id} heading={cluster.name ?? t("panel:ha.title")} aside={cluster.name ? t("panel:ha.title") : undefined}>
          <Facts
            items={[
              { label: t("panel:ha.mode"), value: haModeWords(t, cluster.mode) },
              {
                label: t("panel:ha.heartbeats"),
                value: cluster.heartbeats.length
                  ? cluster.heartbeats.map((hb) => t(hb.cabled ? "panel:ha.heartbeat" : "panel:ha.heartbeatNoCable", { host: hb.hostname, port: shortPort(hb.port) })).join(t("panel:ha.join"))
                  : <Muted>{t("panel:changes.empty")}</Muted>,
              },
            ]}
          />
          <Table
            label={cluster.name ?? t("panel:ha.title")}
            columns={columns}
            rows={cluster.members.map((member) => ({
              id: member.hostname,
              current: member.hostname === cluster.own.hostname,
              cells: {
                member: member.hostname === cluster.own.hostname ? <span className="panel-port">{member.hostname}</span> : <Link href={hrefs.device(member.hostname)} variant="quiet">{member.hostname}</Link>,
                role: haRoleWords(t, member.role),
                state: <Mark tone={member.state === "down" ? "error" : "neutral"}>{haStateWords(t, member.state)}</Mark>,
                priority: member.priority === null ? <Muted>{t("panel:changes.empty")}</Muted> : String(member.priority),
              },
            }))}
            density="compact"
          />
        </PanelSection>
      ))}
    </>
  );
}

const ROLES = ["active", "standby", "member", "master"] as const;
const STATES = ["ready", "removed", "provisioned", "version_mismatch"] as const;

export function StackSection({ stack }: { stack: Stack | null }) {
  const t = useText();
  if (!stack) return null;
  const columns = [
    { key: "slot", label: t("panel:stack.slot"), align: "end" as const },
    { key: "model", label: t("panel:stack.model") },
    { key: "serial", label: t("panel:stack.serial") },
    { key: "role", label: t("panel:stack.role") },
    { key: "state", label: t("panel:stack.state") },
    { key: "priority", label: t("panel:stack.priority"), align: "end" as const },
  ];
  const dash = <Muted>{t("panel:changes.empty")}</Muted>;
  return (
    <PanelSection heading={t("panel:stack.title")} aside={t("panel:identity.stackMembers", { count: stack.member_count })}>
      <Table
        label={t("panel:stack.title")}
        columns={columns}
        rows={stack.members.map((member) => ({
          id: String(member.slot),
          cells: {
            slot: String(member.slot),
            model: member.model ?? dash,
            serial: member.serial ?? dash,
            role: (ROLES as readonly string[]).includes(member.role) ? t(`panel:stack.roles.${member.role}`) : member.role,
            state: (
              <Mark tone={member.state === "removed" || member.state === "version_mismatch" ? "error" : "neutral"}>
                {(STATES as readonly string[]).includes(member.state) ? t(`panel:stack.states.${member.state}`) : member.state}
              </Mark>
            ),
            priority: member.priority === null ? dash : String(member.priority),
          },
        }))}
        density="compact"
      />
    </PanelSection>
  );
}
