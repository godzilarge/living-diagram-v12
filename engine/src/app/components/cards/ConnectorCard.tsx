// La fiche d'un connecteur (docs/10 §6, Intent 1.4.0 ; ancres 1.5.0), dans la grammaire de l'inspecteur : ses deux
// bouts (libres ou attachés, avec leur ancre : un côté, ou le contour vers l'autre bout), son tracé (étiquette,
// pointes, forme, courbure, calque), puis son style, replié par défaut. Sur la toile, glisser un bout sur un élément
// l'y accroche (sur une ancre à portée, sinon sur le contour), la poignée du milieu courbe le tracé. Chaque réglage part aussitôt par
// l'hôte d'intention ; sans nom, tout se lit.
import { ArrowLeftRight, Crosshair, Link2Off, Lock, LockOpen, Spline, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BOUNDS, HEADS, LABEL, ROUTES, SIDES, SIDE_LABEL, isOrphan } from "../../../canvas/connectors";
import type { Side } from "../../../canvas/connectors";
import { FONTS, LABEL_COLORS, WEIGHTS } from "../../../canvas/groups";
import { hueLabel } from "../../../canvas/hues";
import type { Connector, ConnectorStyle, Model } from "../../../canvas/types";
import { useStore } from "../../state/store";
import { Badge } from "../../ui";
import { Confirm, Facts, IconButton, Inspector, InspectorHead, Menu, NumberField, Row, Section, Segmented, Select, TextInput, Title } from "../../ui/inspector";
import { HostLink, HueSetting, WriteHint, signed } from "./shared";
import { StrokeRow, TextRows, options } from "./style";

const LINES = ["solid", "dashed", "dotted"] as const;
const HEAD_OPTIONS = ["none/arrow", "arrow/none", "arrow/arrow", "none/none"] as const;
const HEAD_LABEL: Record<string, string> = { "none/arrow": "à l'arrivée", "arrow/none": "au départ", "arrow/arrow": "aux deux bouts", "none/none": "aucune" };

/** Un bout : ce qu'il vise, cliquable quand c'est un équipement, un groupe ou une annotation présents. */
function EndText({ model, end }: { model: Model; end: Connector["start"] }) {
  const { commands } = useStore();
  if (end.kind === "free") return <span title={end.x + ", " + end.y}>point libre</span>;
  if (end.kind === "device") return <HostLink hostname={end.ref} />;
  if (end.kind === "group") { const g = model.groupById.get(end.ref); return <>groupe {g ? <button type="button" className="linklike" onClick={() => commands.reveal({ kind: "group", id: end.ref })}>{g.label}</button> : <span>{end.ref}</span>}</>; }
  const a = model.annotationById.get(end.ref);
  return <>annotation {a ? <button type="button" className="linklike mono" onClick={() => commands.reveal({ kind: "annotation", id: end.ref })}>{end.ref}</button> : <span className="mono">{end.ref}</span>}</>;
}
/** L'ancre d'un bout attaché : le contour vers l'autre bout, ou le milieu d'un côté (le tracé coudé en part perpendiculairement). */
function SideSelect({ label, value, onChange }: { label: string; value: Side; onChange: (side: Side) => void }) {
  return <Select label={label} value={value} options={SIDES.map((side) => ({ value: side, label: SIDE_LABEL[side] }))} onChange={(side) => onChange(side as Side)} />;
}

export function ConnectorCard({ model, c }: { model: Model; c: Connector }) {
  const { commands, handle } = useStore();
  const canWrite = !!handle && handle.intents.canWrite();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setConfirm(false); }, [c.id]);
  const s = c.style;
  const orphan = isOrphan(model, c);
  const update = (patch: Parameters<typeof commands.connectorUpdate>[1]): void => commands.connectorUpdate(c.id, patch);
  const style = (patch: Partial<ConnectorStyle>): void => update({ style: patch });
  const heads = c.heads.start + "/" + c.heads.end;
  const arrow = c.heads.start === "arrow" || c.heads.end === "arrow";
  return (
    <Inspector kind="connector">
      <InspectorHead icon={<Spline />} kind={arrow ? "Flèche" : "Connecteur"}
        actions={<>
          {!orphan ? <IconButton label="centrer la toile sur le connecteur" onClick={() => commands.reveal({ kind: "connector", id: c.id })}><Crosshair /></IconButton> : null}
          {canWrite ? <IconButton label="inverser le sens" onClick={() => update({ start: c.end, end: c.start, heads: { start: c.heads.end, end: c.heads.start } })}><ArrowLeftRight /></IconButton> : null}
          {canWrite ? <IconButton label={c.locked ? "déverrouiller" : "verrouiller"} pressed={c.locked} onClick={() => update({ locked: !c.locked })}>{c.locked ? <Lock /> : <LockOpen />}</IconButton> : null}
          {canWrite ? <Menu label="plus d'actions" items={[
            ...(c.start.kind !== "free" || c.end.kind !== "free" ? [{ label: "détacher les deux bouts", icon: <Link2Off />, onSelect: () => commands.connectorDetach(c.id) }] : []),
            { label: "supprimer", icon: <Trash2 />, danger: true, separated: true, onSelect: () => setConfirm(true) },
          ]} /> : null}
        </>}
        title={<Title>{c.label || LABEL[c.route].charAt(0).toUpperCase() + LABEL[c.route].slice(1)}</Title>}
        meta={signed(c.author, c.at)}
        badges={c.locked || orphan ? <>
          {c.locked ? <Badge kind="state" value="locked" label="verrouillé" icon={<Lock aria-hidden="true" />} /> : null}
          {orphan ? <Badge kind="pin" value="orphan" label="orphelin" title="un bout vise un élément absent de cette run : non dessiné, jamais effacé en silence" /> : null}
        </> : undefined}>
        {canWrite ? null : <WriteHint action="le modifier" />}
        {confirm ? <Confirm text="Supprimer ce connecteur ?" action="supprimer" onCancel={() => setConfirm(false)} onConfirm={() => commands.connectorDelete(c.id)} /> : null}
      </InspectorHead>
      {/* un bout par rangée : ce qu'il vise, et son ancre à droite quand il est attaché (un seul mot « ancre » de moins) */}
      <Section title="Bouts">
        <Row label="départ"><span className="insp-end"><span className="insp-end-what"><EndText model={model} end={c.start} /></span>
          {canWrite && c.start.kind !== "free" ? <SideSelect label="ancre du départ" value={c.start.side} onChange={(side) => update({ start: { ...c.start, side } as Connector["start"] })} /> : null}</span></Row>
        <Row label="arrivée"><span className="insp-end"><span className="insp-end-what"><EndText model={model} end={c.end} /></span>
          {canWrite && c.end.kind !== "free" ? <SideSelect label="ancre de l'arrivée" value={c.end.side} onChange={(side) => update({ end: { ...c.end, side } as Connector["end"] })} /> : null}</span></Row>
      </Section>
      {canWrite ? (
        <>
          <Section title="Tracé" collapsible>
            <Row label="étiquette"><TextInput value={c.label} max={80} label="étiquette du connecteur" placeholder="sans étiquette" onCommit={(label) => update({ label })} /></Row>
            <Row label="pointes"><Select label="pointes" value={heads} options={HEAD_OPTIONS.map((value) => ({ value, label: HEAD_LABEL[value] }))}
              onChange={(pick) => { const [start, end] = pick.split("/") as [typeof HEADS[number], typeof HEADS[number]]; update({ heads: { start, end } }); }} /></Row>
            <Row label="forme"><Segmented label="forme du tracé" value={c.route} options={options(ROUTES)} onPick={(route) => update({ route })} /></Row>
            {c.route !== "straight" ? <Row label="courbure"><NumberField label="courbure" value={c.bend} min={-400} max={400} onCommit={(bend) => update({ bend })} /></Row> : null}
            <Row label="plan"><Segmented label="plan" value={c.z} options={options(["back", "front"] as const)} onPick={(z) => update({ z })} /></Row>
            <Row label="opacité"><NumberField label="opacité" value={s.opacity} min={BOUNDS.opacity[0]} max={BOUNDS.opacity[1]} unit="%" onCommit={(opacity) => style({ opacity })} /></Row>
          </Section>
          <Section title="Trait" collapsible defaultOpen={false}>
            <Row label="teinte"><HueSetting value={s.hue} inherited={null} allowDefault={false} onPick={(hue) => style({ hue: hue || "slate" })} /></Row>
            <Row label="trait"><StrokeRow label="style du trait" value={s.stroke_style} options={options(LINES)} width={s.stroke_width} bounds={BOUNDS.stroke_width}
              onStyle={(stroke_style) => style({ stroke_style: stroke_style as ConnectorStyle["stroke_style"] })} onWidth={(stroke_width) => style({ stroke_width })} /></Row>
          </Section>
          <Section title="Texte" collapsible defaultOpen={false}>
            <TextRows value={{ size: s.text_size, weight: s.text_weight, font: s.text_font, color: s.text_color }}
              bounds={{ size: BOUNDS.text_size, weights: WEIGHTS, fonts: FONTS, colors: LABEL_COLORS }}
              onChange={(p) => style({
                ...(p.size !== undefined ? { text_size: p.size } : {}), ...(p.weight ? { text_weight: p.weight as ConnectorStyle["text_weight"] } : {}),
                ...(p.font ? { text_font: p.font as ConnectorStyle["text_font"] } : {}), ...(p.color ? { text_color: p.color as ConnectorStyle["text_color"] } : {}),
              })} />
          </Section>
        </>
      ) : (
        <Section title="Apparence"><Facts rows={[["teinte", hueLabel(s.hue)], ["tracé", LABEL[c.route]], ["pointes", HEAD_LABEL[heads]]]} /></Section>
      )}
    </Inspector>
  );
}
