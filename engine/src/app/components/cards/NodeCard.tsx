// La fiche d'un équipement, dans la grammaire de l'inspecteur : son identité (type, nom, matériel, état de collecte,
// diff, stack), ses actions (centrer, masquer, isoler ; l'épingle dans « … »), puis ses câbles, ses contrôles, son
// cluster HA, son apparence (teinte, groupes) ; ses structures, ce qui l'a vu, ses interfaces, repliés.
import { Crosshair, EyeOff, Focus, Layers, PinOff, X } from "lucide-react";
import { KIND_LABEL } from "../../../canvas/format";
import { defaultHue, hueLabel, hueOfNode } from "../../../canvas/hues";
import { LABEL as ICON_LABEL } from "../../../canvas/icons";
import { endLabel, ifaceKey } from "../../../canvas/model";
import type { Model, ModelNode } from "../../../canvas/types";
import { exactRule } from "../../../canvas/query";
import { useStore } from "../../state/store";
import { Badge, DiffBadge, SourceBadge } from "../../ui";
import { Facts, Hint, IconButton, Inspector, InspectorHead, List, ListRow, Menu, Row, Section, Title } from "../../ui/inspector";
import { Cables, ChecksSection, GroupPicker, HaRows, HueSetting, TypeIcon, WriteHint, changeText, kindBadge, signed } from "./shared";

// l'état de collecte d'un équipement, en mots (le contrat dit `unreachable`, `failed`, `partial`, `not_collected`)
const COLLECTION_LABEL: Record<string, string> = { unreachable: "injoignable", failed: "collecte en échec", partial: "collecte partielle", not_collected: "non collecté" };

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

function Appearance({ model, node, canWrite }: { model: Model; node: ModelNode; canWrite: boolean }) {
  const { commands } = useStore();
  const hue = hueOfNode(model, node), own = model.colorByHost.get(node.hostname), typeColor = node.type ? model.colorByType.get(node.type) : undefined;
  const groups = model.groupsByHost.get(node.hostname) || [];
  const origin = own ? "choisie par " + signed(own.author, own.at) : typeColor ? "teinte du type, choisie par " + typeColor.author : "teinte par défaut du type";
  return (
    <Section title="Apparence">
      {canWrite ? null : <WriteHint action="changer sa teinte ou ses groupes" />}
      <Row label="teinte">{canWrite
        ? <HueSetting value={own ? own.hue : null} inherited={typeColor ? typeColor.hue : defaultHue(node.type)} onPick={(next) => commands.color(node.hostname, next)} />
        : <span className="insp-fact">{hueLabel(hue)}</span>}</Row>
      <Hint>{origin}</Hint>
      {groups.length ? (
        <List label="groupes">
          {groups.map((group) => (
            <ListRow key={group.id} trailing={canWrite && group.members.length > 1 ? <IconButton label={"retirer de " + group.label} onClick={() => commands.groupRemove(group.id, [node.hostname])}><X /></IconButton> : null}>
              <span className={"hue-dot hue-" + group.style.hue} aria-hidden="true" />
              <button type="button" className="linklike" onClick={() => commands.reveal({ kind: "group", id: group.id })}>{group.label}</button>
            </ListRow>
          ))}
        </List>
      ) : null}
      {canWrite ? <Row label="groupes"><GroupPicker model={model} hosts={[node.hostname]} exclude={groups.map((group) => group.id)} /></Row> : null}
    </Section>
  );
}

export function NodeCard({ model, node }: { model: Model; node: ModelNode }) {
  const { commands, handle } = useStore();
  const links = model.linksByNode.get(node.hostname) || [];
  const live = links.filter((l) => !l.ghost);
  const change = node.ghost ? { kind: "removed" as const } : model.changeOf("node", node.hostname);
  const pin = model.pinByHost.get(node.hostname);
  const local = !pin && !!handle && handle.toile.state.pinned.has(node.hostname);
  const canWrite = !!handle && handle.intents.canWrite();
  const seen = node.evidence ? node.evidence.seen_by : [];
  const hardware = [node.vendor, node.model].filter(Boolean).join(" · ");
  const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
  const word = node.type ? ICON_LABEL[node.type] || node.type : KIND_LABEL[node.kind] || node.kind;
  const kind = word.charAt(0).toUpperCase() + word.slice(1) + (node.site ? " · " + node.site : "");
  const badges = [
    node.collection && node.collection !== "success" ? <Badge key="c" kind="collection" value={node.collection} label={COLLECTION_LABEL[node.collection] || "collecte " + node.collection} /> : null,
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
          <IconButton label="masquer cet équipement et ses câbles" onClick={() => commands.hideHosts([node.hostname])}><EyeOff /></IconButton>
          <IconButton label="isoler avec ses voisins directs" onClick={() => commands.isolateHosts([node.hostname])}><Focus /></IconButton>
          {pin && canWrite ? <Menu label="plus d'actions" items={[{ label: "retirer l'épingle", icon: <PinOff />, onSelect: () => commands.unpin([node.hostname]) }]} /> : null}
        </>}
        title={<Title mono>{node.hostname}</Title>}
        meta={hardware || system ? [hardware, system].filter(Boolean).join(" · ") : undefined}
        badges={badges.length ? <>{badges}</> : undefined}>
        {pin ? <Hint>épinglé par {signed(pin.author, pin.at)}</Hint> : local ? <Hint>déplacé dans cette page, non enregistré</Hint> : null}
        {local && !canWrite ? <WriteHint action="l'épingler" /> : null}
      </InspectorHead>
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
      {node.kind === "stub" ? null : <Appearance model={model} node={node} canWrite={canWrite} />}
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
