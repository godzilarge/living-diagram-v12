// Les fiches des structures (R4), dans la grammaire de l'inspecteur : un faisceau (deux agrégats, leurs câbles), un
// cluster HA (ses membres, ses heartbeats), un agrégat (ses membres, ses câbles, son domaine MLAG). Tout est lu dans
// le snapshot ; les mêmes fiches dans les deux vues, les contrôles de B1 en vue Contrôle seulement (2026-10-09).
import { Boxes, Crosshair, Layers, Network, ShieldCheck, SquareDashedMousePointer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { haModeText, shortPort } from "../../../canvas/format";
import { beamLabel, clusterLabel } from "../../../canvas/geometry";
import { endLabel, haRoleGroup } from "../../../canvas/model";
import type { Aggregate, Beam, Cluster, Model } from "../../../canvas/types";
import { useControl, useStore } from "../../state/store";
import { Badge, DiffBadge } from "../../ui";
import { Facts, IconButton, Inspector, InspectorHead, List, ListRow, Section, Title } from "../../ui/inspector";
import { ChecksSection, HostLink, LinkDot } from "./shared";
import { Ends } from "./LinkCard";

/** Les contrôles d'une structure, en vue Contrôle ; rien en vue Diagramme. */
function Checks({ model, checks }: { model: Model; checks: Beam["checks"] }) {
  const control = useControl();
  return control ? <ChecksSection model={model} checks={checks} /> : null;
}

/** Les câbles d'une structure, un par ligne (ouvre le câble). */
function CableList({ links }: { links: Beam["links"] }) {
  const { commands } = useStore();
  const { t } = useTranslation(["panel", "common"]);
  return (
    <List label={t("beam.cables")}>
      {links.map((link) => (
        <li key={link.id}><button type="button" className="insp-list-row link" onClick={() => commands.reveal({ kind: "link", id: link.id })}>
          <span className="insp-list-main" title={link.a.hostname + " · " + link.a.interface + " ↔ " + link.b.hostname + " · " + link.b.interface}><span className="mono">{shortPort(link.a.interface)}</span><span className="faint">↔</span><span className="mono">{shortPort(link.b.interface)}</span></span>
          <span className="insp-list-end"><LinkDot link={link} /></span>
        </button></li>
      ))}
    </List>
  );
}

export function BeamCard({ model, beam }: { model: Model; beam: Beam }) {
  const { commands } = useStore();
  const { t } = useTranslation(["panel", "common"]);
  const protocols = Array.from(new Set(beam.known.map((agg) => agg.raw.protocol + (agg.raw.lacp_mode ? " " + agg.raw.lacp_mode : ""))));
  return (
    <Inspector kind="beam">
      <InspectorHead icon={<Network />} kind={t("beam.kind")}
        actions={<IconButton label={t("beam.center")} onClick={() => commands.reveal({ kind: "beam", id: beam.id })}><Crosshair /></IconButton>}
        title={<Ends a={{ hostname: beam.a.hostname, port: beam.a.aggregate || "" }} b={{ hostname: beam.b.hostname, port: beam.b.aggregate || "" }} />}
        badges={beam.peerLink || beam.mlags.length || beam.degraded ? <>
          {beam.peerLink ? <Badge kind="structure" value="peer-link" label="peer-link" /> : null}
          {beam.mlags.map((d) => <Badge key={d.id} kind="structure" value="mlag" label={"MLAG " + d.raw.mlag_id} />)}
          {beam.degraded ? <Badge kind="severity" value="warning" label={t("beam.degraded")} /> : null}
        </> : undefined} />
      <Section title={t("beam.section")}>
        <Facts rows={[[t("beam.cables"), t("common:links", { count: beam.links.length })], [t("beam.protocol"), protocols.join(" / ") || null], [t("beam.nature"), beamLabel(beam, false) || null]]} />
        {beam.known.length ? (
          <List label={t("beam.aggregates")}>
            {beam.known.map((agg) => (
              <li key={agg.key}><button type="button" className="insp-list-row link" onClick={() => commands.reveal({ kind: "aggregate", id: agg.key })}>
                <span className="insp-list-main"><span className="faint">{t("beam.aggregate")}</span><span className="mono">{agg.hostname} · {agg.name}</span></span>
              </button></li>
            ))}
          </List>
        ) : null}
      </Section>
      <Section title={t("beam.cablesTitle")} count={beam.links.length}><CableList links={beam.links} /></Section>
      <Checks model={model} checks={beam.checks} />
    </Inspector>
  );
}

export function ClusterCard({ model, cluster }: { model: Model; cluster: Cluster }) {
  const { commands } = useStore();
  const { t } = useTranslation("panel");
  const change = model.changeOf("cluster", cluster.id);
  return (
    <Inspector kind="cluster">
      <InspectorHead icon={<ShieldCheck />} kind={t("cluster.kind")}
        actions={<>
          <IconButton label={t("cluster.center")} onClick={() => commands.reveal({ kind: "cluster", id: cluster.id })}><Crosshair /></IconButton>
          <IconButton label={t("cluster.selectMembers")} onClick={() => commands.selectHosts(cluster.hosts)}><SquareDashedMousePointer /></IconButton>
        </>}
        title={<Title>{cluster.raw.cluster_name || cluster.hosts.join(" + ")}</Title>}
        meta={clusterLabel(cluster, haModeText)}
        badges={<><Badge kind="structure" value="mode" label={haModeText(cluster.raw.mode)} />{change ? <DiffBadge kind={change.kind} /> : null}</>} />
      <Section title={t("cluster.members")} count={cluster.raw.members.length}>
        <List label={t("cluster.membersList")}>
          {cluster.raw.members.map((m) => (
            <ListRow key={m.hostname} trailing={m.priority !== null && m.priority !== undefined ? t("priority", { value: m.priority }) : null}>
              <HostLink hostname={m.hostname} />
              <Badge kind="ha" value={haRoleGroup(cluster.raw.mode, m.role)} label={m.role} />
              {m.state !== "up" ? <Badge kind="state" value={m.state} label={m.state} /> : null}
            </ListRow>
          ))}
        </List>
      </Section>
      {cluster.heartbeats.length ? (
        <Section title={t("cluster.heartbeat")} count={cluster.heartbeats.length}>
          <List label={t("cluster.heartbeats")}>
            {cluster.heartbeats.map((hb, i) => (hb.link
              ? <li key={i}><button type="button" className="insp-list-row link" onClick={() => commands.reveal({ kind: "link", id: (hb.link as NonNullable<typeof hb.link>).id })}><span className="insp-list-main"><span className="mono">{endLabel(hb)}</span></span></button></li>
              : <ListRow key={i} faint trailing={t("cluster.notObserved")}><span className="mono">{endLabel(hb)}</span></ListRow>))}
          </List>
        </Section>
      ) : null}
      <Checks model={model} checks={cluster.checks} />
    </Inspector>
  );
}

export function AggregateCard({ model, aggregate }: { model: Model; aggregate: Aggregate }) {
  const { commands } = useStore();
  const { t } = useTranslation("panel");
  const raw = aggregate.raw;
  return (
    <Inspector kind="aggregate">
      <InspectorHead icon={<Layers />} kind={t("aggregate.kind")}
        actions={<IconButton label={t("aggregate.center")} onClick={() => commands.reveal({ kind: "aggregate", id: aggregate.key })}><Crosshair /></IconButton>}
        title={<Title mono>{aggregate.name}</Title>}
        meta={<>{t("aggregate.on")} <HostLink hostname={aggregate.hostname} /></>}
        badges={raw.mlag_peer_link || aggregate.mlag || raw.degraded ? <>
          {raw.mlag_peer_link ? <Badge kind="structure" value="peer-link" label="peer-link" /> : null}
          {aggregate.mlag ? <Badge kind="structure" value="mlag" label={"MLAG " + aggregate.mlag.raw.mlag_id} /> : null}
          {raw.degraded ? <Badge kind="severity" value="warning" label={t("beam.degraded")} /> : null}
        </> : undefined} />
      <Section title={t("aggregate.section")}>
        <Facts rows={[[t("aggregate.protocol"), raw.protocol + (raw.lacp_mode ? " " + raw.lacp_mode : "")], [t("aggregate.peerLink"), raw.mlag_peer_link === null ? t("aggregate.notRead") : raw.mlag_peer_link ? t("aggregate.yes") : t("aggregate.no")]]} />
      </Section>
      <Section title={t("aggregate.members")} count={raw.members.length}>
        <List label={t("aggregate.membersList")}>{raw.members.map((m) => <ListRow key={m.name} trailing={m.status}><span className="mono">{m.name}</span></ListRow>)}</List>
      </Section>
      {aggregate.beams.length ? (
        <Section title={t("aggregate.beams")} count={aggregate.beams.length}>
          <List label={t("aggregate.beamsList")}>
            {aggregate.beams.map((beam) => (
              <li key={beam.id}><button type="button" className="insp-list-row link" onClick={() => commands.reveal({ kind: "beam", id: beam.id })}>
                <span className="insp-list-main"><Boxes className="faint" aria-hidden="true" /><span className="faint">{t("aggregate.to")}</span><span className="mono">{beam.a.hostname === aggregate.hostname ? beam.b.hostname : beam.a.hostname}</span></span>
              </button></li>
            ))}
          </List>
        </Section>
      ) : null}
      <Section title={t("aggregate.cables")} count={aggregate.cables.length}><CableList links={aggregate.cables} /></Section>
      <Checks model={model} checks={aggregate.checks} />
    </Inspector>
  );
}
