// La fiche d'un câble en vue Contrôle (celle de la vue Diagramme est LinkFacts.tsx, 2026-10-09) : ses deux bouts, son
// statut et ses sources, pourquoi il est dessiné (une phrase), ses faits (vitesse, faisceau, agrégats), ses contrôles,
// les deux ports côte à côte ; les évidences une à une, repliées.
import { Cable, Crosshair } from "lucide-react";
import { RESOLUTION_LABEL, speedText, whyText } from "../../../canvas/format";
import type { ReactNode } from "react";
import { endLabel, interfaceAt } from "../../../canvas/model";
import type { Model, ModelLink } from "../../../canvas/types";
import type { Endpoint } from "../../../contracts/snapshot";
import { useStore } from "../../state/store";
import { Badge, DiffBadge, SourceBadge, StatusBadge } from "../../ui";
import { Facts, IconButton, Inspector, InspectorHead, Section } from "../../ui/inspector";
import { l2Text } from "./NodeFacts";
import { ChecksSection, HostLink, changeText } from "./shared";

/** Le titre d'un port : l'équipement, puis le port dessous (un nom long ne se coupe jamais au milieu). */
const PortHead = ({ end }: { end: Endpoint }) => <h4><span className="host">{end.hostname}</span><span className="port">{end.interface || "port non précisé"}</span></h4>;

/** Une description brute, coupable après chaque `|` (la convention `criticité|voisin|port|options`). */
const Breakable = ({ text }: { text: string }): ReactNode => text.split("|").map((part, i) => <span key={i}>{i ? "|" : ""}<wbr />{part}</span>);

/** Un bout de câble tel que son équipement le décrit : état, vitesse, média, agrégat, mode L2, description brute. */
export function Port({ model, end, removed }: { model: Model; end: Endpoint; removed: boolean }) {
  const found = interfaceAt(model, end.hostname, end.interface, removed);
  if (!found) return <div className="insp-port"><PortHead end={end} /><p className="insp-hint">absent de interfaces[] : non collecté, ou nom tel qu'annoncé par le voisin</p></div>;
  const itf = found.itf;
  return (
    <div className="insp-port">
      <PortHead end={end} />
      {found.ghost ? <p className="insp-hint">interface retirée : valeurs de la run d'avant</p> : null}
      <Facts rows={[
        ["état", itf.oper_status + (itf.oper_reason ? " · " + itf.oper_reason : "")],
        ["vitesse", [speedText(itf.speed_mbps), itf.duplex].filter(Boolean).join(" · ") || null],
        ["média", itf.media],
        ["agrégat", itf.aggregate ? itf.aggregate.name + (itf.aggregate.member_status ? " (" + itf.aggregate.member_status + ")" : "") : null],
        ["L2", l2Text(itf)],
      ]} />
      {itf.description !== null ? <p className="desc" title="description brute"><Breakable text={itf.description} /></p> : null}
    </div>
  );
}

/** Les deux bouts d'un câble ou d'un faisceau, l'un sous l'autre : l'équipement (ouvre sa fiche), le port. */
export function Ends({ a, b }: { a: { hostname: string; port: string }; b: { hostname: string; port: string } }) {
  return (
    <div className="insp-ends">
      <span><HostLink hostname={a.hostname} /> <span className="port">{a.port}</span></span>
      <span><HostLink hostname={b.hostname} /> <span className="port">{b.port}</span></span>
    </div>
  );
}

export function LinkCard({ model, link }: { model: Model; link: ModelLink }) {
  const { commands } = useStore();
  const raw = link.raw;
  const change = link.ghost ? { kind: "removed" as const } : model.changeOf("link", link.id);
  return (
    <Inspector kind="link">
      <InspectorHead icon={<Cable />} kind="Câble"
        actions={<IconButton label="centrer la toile sur le câble" onClick={() => commands.reveal({ kind: "link", id: link.id })}><Crosshair /></IconButton>}
        title={<Ends a={{ hostname: raw.a.hostname, port: raw.a.interface || "" }} b={{ hostname: raw.b.hostname, port: raw.b.interface || "" }} />}
        meta={whyText(link, false)}
        badges={<>
          <StatusBadge status={link.status} />
          {raw.oper === "down" ? <Badge kind="oper" value="down" label="down" /> : null}
          {link.sources.map((src) => <SourceBadge key={src} source={src} />)}
          {change ? <DiffBadge kind={change.kind} /> : null}
        </>} />
      {raw.speed_mbps || link.beam || raw.aggregate_a || raw.aggregate_b ? (
        <Section title="Lien">
          <Facts rows={[
            ["vitesse", raw.speed_mbps ? speedText(raw.speed_mbps) : null],
            ["faisceau", link.beam ? <button key="b" type="button" className="linklike mono" onClick={() => commands.reveal({ kind: "beam", id: (link.beam as NonNullable<typeof link.beam>).id })}>{link.beam.a.aggregate} ⇄ {link.beam.b.aggregate}</button> : null],
            ["agrégats", [raw.aggregate_a, raw.aggregate_b].filter(Boolean).join(" · ") || null],
          ]} />
        </Section>
      ) : null}
      {change && change.kind === "changed" ? <Section title="Changements" count={change.fields.length}><Facts rows={change.fields.slice(0, 6).map((f) => [f.path, changeText(f.before, f.after)])} /></Section> : null}
      <ChecksSection model={model} checks={link.checks} />
      <Section title="Ports"><div className="insp-ports"><Port model={model} end={raw.a} removed={link.ghost} /><Port model={model} end={raw.b} removed={link.ghost} /></div></Section>
      <Section title="Évidences" count={raw.evidence.length} collapsible defaultOpen={false}>
        {raw.evidence.map((e, i) => (
          <div key={i} className="insp-evidence">
            <div className="insp-badges"><SourceBadge source={e.source} /></div>
            <Facts rows={[["témoin", endLabel(e.witness)], ["il annonce", e.remote_raw.name + " · " + (e.remote_raw.port === null ? "sans port" : e.remote_raw.port)],
              ["résolu en", e.remote_resolved.hostname + " · " + (e.remote_resolved.interface === null ? "port non précisé" : e.remote_resolved.interface)], ["résolution", RESOLUTION_LABEL[e.resolution] || e.resolution]]} />
          </div>
        ))}
        {link.portChecks.length ? <p className="insp-hint">{link.portChecks.length} contrôle(s) d'un port partagé avec d'autres câbles, non comptés ici.</p> : null}
      </Section>
    </Inspector>
  );
}
