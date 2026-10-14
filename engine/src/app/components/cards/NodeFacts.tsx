// La fiche d'un équipement en vue Diagramme (Orhan, 2026-10-09 : « uniquement des informations provenant des
// équipements : hostname, serial, version, site, table d'interfaces, transceiver, cdp + lldp s'il y a ») : ce que le
// device dit de lui-même, dans l'ordre où on le lit. Aucun verdict de B1 ici (statuts, contrôles, sources, état de
// collecte : vue Contrôle) ; le diff, lui, se lit dans les deux vues. L'apparence (teinte, groupes) ferme la fiche,
// repliée : tout ce qui s'édite reste dans cette vue.
import { Crosshair, EyeOff, Focus, Layers, PinOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { KIND_LABEL, durationText, shortPort } from "../../../canvas/format";
import { hueOfNode } from "../../../canvas/hues";
import { LABEL as ICON_LABEL } from "../../../canvas/icons";
import { endLabel, ifaceKey } from "../../../canvas/model";
import { neighborsOf } from "../../../canvas/neighbors";
import { speedToken } from "../../../canvas/pill";
import type { Model, ModelNode } from "../../../canvas/types";
import type { SnapshotInterface } from "../../../contracts/snapshot";
import { useEditable, useStore, useWriteLock } from "../../state/store";
import { t } from "../../../i18n";
import { Badge, DiffBadge, SourceBadge } from "../../ui";
import { Facts, Hint, IconButton, Inspector, InspectorHead, List, ListRow, Menu, Section, Title } from "../../ui/inspector";
import { Appearance } from "./Appearance";
import { Cables, HaRows, HistoryButton, TypeIcon, WriteHint, changeRows, kindBadge, signed } from "./shared";

/** L'état d'un port en un mot : ce que le device dit (`oper_status`), « admin down » quand c'est lui qui l'a coupé. */
const stateWord = (itf: SnapshotInterface): string => (itf.admin_status === "down" ? t("panel:node.adminDown") : itf.oper_status);
/** Le mode L2 d'un port en bref : « access 10 », « trunk · natif 1 », rien si sans objet. */
export function l2Text(itf: SnapshotInterface): string | null {
  if (itf.switchport_mode === "access") return "access" + (itf.access_vlan ? " " + itf.access_vlan : "");
  if (itf.switchport_mode === "trunk") return "trunk" + (itf.native_vlan ? " · " + t("panel:node.native", { vlan: itf.native_vlan }) : "");
  if (itf.vlan_id) return "VLAN " + itf.vlan_id;
  return null;
}

/** La table des interfaces : port, état, vitesse, média ; en face et description quand le panneau est large. */
function InterfaceTable({ model, node }: { model: Model; node: ModelNode }) {
  const ifaces = model.ifacesByNode.get(node.hostname) || [];
  const { t } = useTranslation("panel");
  const facing = (name: string): string => (model.linksByIface.get(ifaceKey(node.hostname, name)) || []).filter((l) => !l.ghost)
    .map((l) => { const other = l.a.hostname === node.hostname && l.a.interface === name ? l.b : l.a; return other.hostname + (other.interface ? " · " + shortPort(other.interface) : ""); }).join(", ");
  if (!ifaces.length) return <p className="insp-hint">{t("node.noInterfaces")}</p>;
  return (
    <table className="insp-table facts-table">
      <thead><tr><th>{t("node.port")}</th><th>{t("node.state")}</th><th>{t("node.speed")}</th><th>{t("node.media")}</th><th className="wide">{t("node.facing")}</th><th className="wide">{t("node.description")}</th></tr></thead>
      <tbody>{ifaces.map((itf) => (
        <tr key={itf.name} className={itf.oper_status === "up" ? undefined : "faint"}>
          <td className="mono" title={itf.name + (itf.type !== "physical" ? " · " + itf.type : "")}>{shortPort(itf.name)}</td>
          <td title={itf.oper_reason || undefined}>{stateWord(itf)}</td>
          <td>{typeof itf.speed_mbps === "number" ? speedToken(itf.speed_mbps) + (itf.duplex === "half" ? " half" : "") : "—"}</td>
          <td className="clip" title={itf.media || undefined}>{itf.media || "—"}</td>
          <td className="wide mono clip" title={facing(itf.name) || undefined}>{facing(itf.name) || "—"}</td>
          <td className="wide clip" title={itf.description || undefined}>{itf.description || "—"}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

/** Ce que l'équipement annonce de ses voisins, brut : port local, voisin, port d'en face, protocole ; un clic ouvre
 *  l'équipement que B1 en a fait. */
function Neighbors({ model, node }: { model: Model; node: ModelNode }) {
  const { commands } = useStore();
  const rows = neighborsOf(model, node.hostname);
  const { t } = useTranslation("panel");
  if (!rows.length) return <p className="insp-hint">{t("node.noNeighbors")}</p>;
  return (
    <List label={t("node.neighbors")}>
      {rows.map((row) => (
        <li key={row.port + "\u0000" + row.neighbor + "\u0000" + row.neighborPort}>
          <button type="button" className="insp-list-row link" title={row.port + " → " + row.neighbor + (row.neighborPort ? " · " + row.neighborPort : "")} onClick={() => commands.reveal({ kind: "node", id: row.resolved })}>
            <span className="insp-list-main cable"><span className="mono insp-port-local">{shortPort(row.port)}</span><span className="insp-remote"><span className="mono">{row.neighbor}</span>{row.neighborPort ? <span className="mono faint">{shortPort(row.neighborPort)}</span> : null}</span></span>
            <span className="insp-list-end">{row.sources.map((src) => <SourceBadge key={src} source={src} />)}</span>
          </button>
        </li>
      ))}
    </List>
  );
}

/** Les agrégats de l'équipement (topic `aggregates`) : nom, protocole, membres ; un clic ouvre l'agrégat. */
function Aggregates({ model, node }: { model: Model; node: ModelNode }) {
  const { commands } = useStore();
  const aggregates = model.aggregatesByNode.get(node.hostname) || [];
  const { t } = useTranslation("panel");
  if (!aggregates.length) return null;
  return (
    <Section title={t("node.aggregatesTitle")} count={aggregates.length} collapsible defaultOpen>
      <List label={t("node.aggregates")}>
        {aggregates.map((agg) => (
          <li key={agg.key}><button type="button" className="insp-list-row link" onClick={() => commands.reveal({ kind: "aggregate", id: agg.key })}>
            <span className="insp-list-main"><span className="mono">{shortPort(agg.name)}</span><span className="faint">{agg.raw.protocol}{agg.raw.lacp_mode ? " " + agg.raw.lacp_mode : ""}</span></span>
            <span className="insp-list-end faint">{t("node.members", { count: agg.raw.members.length })}</span>
          </button></li>
        ))}
      </List>
    </Section>
  );
}

export function NodeFacts({ model, node }: { model: Model; node: ModelNode }) {
  const { commands, handle } = useStore();
  const { t } = useTranslation("panel");
  const canWrite = useEditable();
  const locked = useWriteLock(); // l'intention illisible se dit en tête : rien ne s'écrira sur cette fiche
  const links = model.linksByNode.get(node.hostname) || [];
  const live = links.filter((l) => !l.ghost);
  const change = node.ghost ? { kind: "removed" as const } : model.changeOf("node", node.hostname);
  const pin = model.pinByHost.get(node.hostname);
  const local = !pin && !!handle && handle.toile.state.pinned.has(node.hostname);
  const hardware = [node.vendor, node.model].filter(Boolean).join(" ");
  const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
  const word = node.type ? ICON_LABEL[node.type] || node.type : KIND_LABEL[node.kind] || node.kind;
  const kind = word.charAt(0).toUpperCase() + word.slice(1) + (node.site ? " · " + node.site : "");
  const stub = node.kind === "stub";
  const seen = node.evidence ? node.evidence.seen_by : [];
  const badges = [
    kindBadge(node.kind), change ? <DiffBadge key="d" kind={change.kind} /> : null,
    node.stack ? <Badge key="s" kind="count" value="stack" icon={<Layers aria-hidden="true" />} label={String(node.stack.member_count)} title={t("node.stackOf", { count: node.stack.member_count })} /> : null,
  ].filter(Boolean);
  const ifaceCount = (model.ifacesByNode.get(node.hostname) || []).length;
  const neighborCount = neighborsOf(model, node.hostname).length;
  return (
    <Inspector kind="node-facts">
      <InspectorHead icon={<TypeIcon type={node.type} hue={hueOfNode(model, node)} />} kind={kind}
        actions={<>
          <IconButton label={t("node.center")} onClick={() => commands.reveal({ kind: "node", id: node.hostname })}><Crosshair /></IconButton>
          <HistoryButton object={node.hostname} />
          <IconButton label={t("node.hide")} onClick={() => commands.hideHosts([node.hostname])}><EyeOff /></IconButton>
          <IconButton label={t("node.isolate")} onClick={() => commands.isolateHosts([node.hostname])}><Focus /></IconButton>
          {pin && canWrite ? <Menu label={t("node.moreActions")} items={[{ label: t("node.unpin"), icon: <PinOff />, onSelect: () => commands.unpin([node.hostname]) }]} /> : null}
        </>}
        title={<Title mono>{node.hostname}</Title>}
        meta={hardware || system ? [hardware, system].filter(Boolean).join(" · ") : undefined}
        badges={badges.length ? <>{badges}</> : undefined}>
        {pin ? <Hint>{t("node.pinnedBy", { who: signed(pin.author, pin.at) })}</Hint> : local ? <Hint>{t("node.movedHere")}</Hint> : null}
        {locked || (local && !canWrite) ? <WriteHint action={t("node.toPin")} /> : null}
      </InspectorHead>
      {change && change.kind === "changed" && model.diff ? (
        <Section title={t("node.changes")} count={change.fields.length}><Facts rows={changeRows(change.fields)} /></Section>
      ) : null}
      <Section title={t("node.identity")}>
        <Facts rows={[
          [t("node.hardware"), hardware || null], [t("node.system"), system || null], [t("node.site"), node.site],
          [t("node.serial"), node.serial_number ? <span key="s" className="mono">{node.serial_number}</span> : null],
          [t("node.reportedName"), node.reported_hostname && node.reported_hostname !== node.hostname ? <span key="n" className="mono">{node.reported_hostname}</span> : null],
          [t("node.uptime"), durationText(node.uptime_seconds)],
          [t("node.stack"), node.stack ? t("node.members", { count: node.stack.member_count }) : null],
          [t("node.contexts"), node.virtual_contexts.length ? node.virtual_contexts.join(", ") : null],
          stub && node.evidence && node.evidence.capabilities.length ? [t("node.capabilities"), node.evidence.capabilities.join(", ")] : null,
        ]} />
        {stub ? <Hint>{t("node.stubHint")}</Hint> : null}
      </Section>
      {seen.length && (stub || node.kind === "external") ? (
        <Section title={t("node.seenBy")} count={seen.length}>
          <List label={t("node.seenByList")}>{seen.map((w, i) => <ListRow key={i}><SourceBadge source={w.source} /><span className="mono">{endLabel(w)}</span></ListRow>)}</List>
        </Section>
      ) : null}
      <Section title={t("node.cablesTitle")} count={live.length + (links.length - live.length ? " · " + t("node.removedCount", { count: links.length - live.length }) : "")}>
        <Cables hostname={node.hostname} links={links} />
      </Section>
      {(model.haMembershipsByHost.get(node.hostname) || []).length ? <Section title={t("node.haCluster")}><HaRows model={model} hostname={node.hostname} /></Section> : null}
      <Aggregates model={model} node={node} />
      {stub ? null : <Section title={t("node.interfaces")} count={ifaceCount} collapsible defaultOpen><InterfaceTable model={model} node={node} /></Section>}
      {stub ? null : <Section title={t("node.lldpCdp")} count={neighborCount} collapsible defaultOpen><Neighbors model={model} node={node} /></Section>}
      {stub ? null : <Appearance model={model} node={node} canWrite={canWrite} />}
    </Inspector>
  );
}
