// La fiche d'un équipement en vue Contrôle (la fiche de la vue Diagramme est NodeFacts.tsx, 2026-10-09) : son identité
// (type, nom, matériel, état de collecte, diff, stack), ses actions (centrer, masquer, isoler), puis ses câbles avec
// leur statut, ses contrôles, son cluster HA ; ses structures, ce qui l'a vu, ses interfaces, repliés. Rien ne s'y
// édite : l'apparence et l'épingle se lisent et se changent en vue Diagramme.
import { Crosshair, EyeOff, Focus, Layers } from "lucide-react";
import { KIND_LABEL, COLLECTION_LABEL } from "../../../canvas/format";
import { hueOfNode } from "../../../canvas/hues";
import { LABEL as ICON_LABEL } from "../../../canvas/icons";
import { endLabel, ifaceKey } from "../../../canvas/model";
import type { Model, ModelNode } from "../../../canvas/types";
import { exactRule } from "../../../canvas/query";
import { useStore } from "../../state/store";
import { Badge, DiffBadge, SourceBadge } from "../../ui";
import { Facts, IconButton, Inspector, InspectorHead, List, ListRow, Section, Title } from "../../ui/inspector";
import { Cables, ChecksSection, HaRows, HistoryButton, TypeIcon, changeText, kindBadge } from "./shared";

// l'état de collecte d'un équipement, en mots (le contrat dit `unreachable`, `failed`, `partial`, `not_collected`)

function Interfaces({ model, node }: { model: Model; node: ModelNode }) {
  const ifaces = model.ifacesByNode.get(node.hostname) || [];
  const facing = (name: string): string => (model.linksByIface.get(ifaceKey(node.hostname, name)) || [])
    .map((l) => endLabel(l.a.hostname === node.hostname && l.a.interface === name ? l.b : l.a) + (l.ghost ? " (retiré)" : "")).join(", ");
  const lonely = (itf: { type: string; oper_status: string; hostname: string; name: string }): boolean =>
    (itf.type === "physical" || itf.type === "management") && itf.oper_status === "up" && !(model.linksByIface.get(ifaceKey(itf.hostname, itf.name)) || []).some((l) => !l.ghost);
  if (!ifaces.length) return <p className="insp-hint">aucune interface collectée</p>;
  return (
    <table className="insp-table">
      <thead><tr><th>port</th><th>état</th><th>en face</th></tr></thead>
      <tbody>{ifaces.map((itf) => <tr key={itf.name} className={lonely(itf) ? "lonely" : undefined} title={lonely(itf) ? "port physique up sans câble" : undefined}><td>{itf.name}</td><td>{itf.oper_status}</td><td>{facing(itf.name) || "—"}</td></tr>)}</tbody>
    </table>
  );
}

function Structures({ model, node }: { model: Model; node: ModelNode }) {
  const { commands } = useStore();
  const aggregates = model.aggregatesByNode.get(node.hostname) || [];
  const beams = model.beamsByNode.get(node.hostname) || [];
  if (!aggregates.length && !beams.length) return null;
  return (
    <Section title="Structures" count={aggregates.length + beams.length} collapsible defaultOpen={false}>
      <List label="structures">
        {beams.map((beam) => (
          <li key={beam.id}><button type="button" className="insp-list-row link" onClick={() => commands.reveal({ kind: "beam", id: beam.id })}>
            <span className="insp-list-main"><span className="faint">faisceau vers</span><span className="mono">{beam.a.hostname === node.hostname ? beam.b.hostname : beam.a.hostname}</span></span>
          </button></li>
        ))}
        {aggregates.map((agg) => (
          <li key={agg.key}><button type="button" className="insp-list-row link" onClick={() => commands.reveal({ kind: "aggregate", id: agg.key })}>
            <span className="insp-list-main"><span className="faint">agrégat</span><span className="mono">{agg.name}</span></span>
          </button></li>
        ))}
      </List>
    </Section>
  );
}

export function NodeCard({ model, node }: { model: Model; node: ModelNode }) {
  const { commands } = useStore();
  const links = model.linksByNode.get(node.hostname) || [];
  const live = links.filter((l) => !l.ghost);
  const change = node.ghost ? { kind: "removed" as const } : model.changeOf("node", node.hostname);
  const seen = node.evidence ? node.evidence.seen_by : [];
  const hardware = [node.vendor, node.model].filter(Boolean).join(" · ");
  const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
  const word = node.type ? ICON_LABEL[node.type] || node.type : KIND_LABEL[node.kind] || node.kind;
  const kind = word.charAt(0).toUpperCase() + word.slice(1) + (node.site ? " · " + node.site : "");
  const badges = [
    node.collection && node.collection !== "success" ? <Badge key="c" kind="collection" value={node.collection} label={node.collection === "unreachable" ? COLLECTION_LABEL.unreachable : "collecte " + (COLLECTION_LABEL[node.collection] || node.collection)} /> : null,
    kindBadge(node.kind), change ? <DiffBadge key="d" kind={change.kind} /> : null,
    node.stack ? <Badge key="s" kind="count" value="stack" icon={<Layers aria-hidden="true" />} label={String(node.stack.member_count)} title={"stack de " + node.stack.member_count + " membres"} /> : null,
  ].filter(Boolean);
  const ha = model.haMembershipsByHost.get(node.hostname) || [];
  const nodeChecks = model.checksByNode.get(node.hostname) || [];
  const alarming = nodeChecks.some((check) => check.severity === "error" || check.severity === "warning");
  const checks = <ChecksSection model={model} checks={nodeChecks} />;
  return (
    <Inspector kind="node">
      <InspectorHead icon={<TypeIcon type={node.type} hue={hueOfNode(model, node)} />} kind={kind}
        actions={<>
          <IconButton label="centrer la toile sur cet équipement" onClick={() => commands.reveal({ kind: "node", id: node.hostname })}><Crosshair /></IconButton>
          <HistoryButton object={node.hostname} />
          <IconButton label="masquer cet équipement et ses câbles" onClick={() => commands.hideHosts([node.hostname])}><EyeOff /></IconButton>
          <IconButton label="isoler avec ses voisins directs" onClick={() => commands.isolateHosts([node.hostname])}><Focus /></IconButton>
        </>}
        title={<Title mono>{node.hostname}</Title>}
        meta={hardware || system ? [hardware, system].filter(Boolean).join(" · ") : undefined}
        badges={badges.length ? <>{badges}</> : undefined} />
      {/* une erreur ou un avertissement se lit avant les câbles ; sinon les contrôles (infos) viennent après */}
      {change && change.kind === "changed" && model.diff ? (
        <Section title="Changements" count={change.fields.length}><Facts rows={change.fields.slice(0, 6).map((f) => [f.path, changeText(f.before, f.after)])} /></Section>
      ) : null}
      {alarming ? checks : null}
      <Section title="Câbles" count={live.length + (links.length - live.length ? " · " + (links.length - live.length) + " retiré(s)" : "")}>
        <Cables hostname={node.hostname} links={links} />
      </Section>
      {alarming ? null : checks}
      {ha.length ? <Section title="Cluster HA" count={ha.length}><HaRows model={model} hostname={node.hostname} /></Section> : null}
      <Structures model={model} node={node} />
      {seen.length ? (
        <Section title="Vu par" count={seen.length} collapsible defaultOpen={false}>
          <List label="vu par">{seen.map((w, i) => <ListRow key={i}><SourceBadge source={w.source} /><span className="mono">{endLabel(w)}</span></ListRow>)}</List>
        </Section>
      ) : null}
      <Section title="Interfaces" count={(model.ifacesByNode.get(node.hostname) || []).length} collapsible defaultOpen={false}><Interfaces model={model} node={node} /></Section>
      {node.serial_number || node.reported_hostname ? (
        <Section title="Identité" collapsible defaultOpen={false}>
          <Facts rows={[["série", <span key="s" className="mono">{node.serial_number}</span>], ["nom annoncé", node.reported_hostname ? <span key="n" className="mono">{node.reported_hostname}</span> : null], ["règle", <code key="r">{exactRule([node.hostname])}</code>]]} />
        </Section>
      ) : null}
    </Inspector>
  );
}
