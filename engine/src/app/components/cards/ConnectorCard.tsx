// La fiche d'un connecteur (docs/10 §6, Intent 1.4.0 ; ancres 1.5.0), dans la grammaire de l'inspecteur : ses deux
// bouts (libres ou attachés, avec leur ancre : un côté, ou le contour vers l'autre bout), son tracé (étiquette,
// pointes, forme, courbure, calque), puis son style, replié par défaut. Sur la toile, glisser un bout sur un élément
// l'y accroche (sur une ancre à portée, sinon sur le contour), la poignée du milieu courbe le tracé. Chaque réglage part aussitôt par
// l'hôte d'intention ; sans nom, tout se lit.
import { ArrowLeftRight, Crosshair, Link2Off, Lock, LockOpen, Spline, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { labelMap } from "../../../i18n";
import { BOUNDS, HEADS, LABEL, ROUTES, SIDES, SIDE_LABEL, isOrphan } from "../../../canvas/connectors";
import type { Side } from "../../../canvas/connectors";
import { FONTS, LABEL_COLORS, WEIGHTS } from "../../../canvas/groups";
import { KIND_LABEL, summary as annotationSummary } from "../../../canvas/annotations";
import { hueLabel } from "../../../canvas/hues";
import type { Connector, ConnectorStyle, Model } from "../../../canvas/types";
import { useEditable, useStore } from "../../state/store";
import { Badge } from "../../ui";
import { Confirm, Facts, IconButton, Inspector, InspectorHead, Menu, NumberField, Row, Section, Segmented, Select, TextInput, Title } from "../../ui/inspector";
import { HistoryButton, HostLink, HueSetting, WriteHint, signed } from "./shared";
import { StrokeRow, TextSection, options } from "./style";

const LINES = ["solid", "dashed", "dotted"] as const;
const HEAD_OPTIONS = ["none/arrow", "arrow/none", "arrow/arrow", "none/none"] as const;
const HEAD_KEY: Record<string, string> = { "none/arrow": "atEnd", "arrow/none": "atStart", "arrow/arrow": "both", "none/none": "none" };
const HEAD_WORDS = labelMap("panel:connector", Object.values(HEAD_KEY));
const headLabel = (heads: string): string => HEAD_WORDS[HEAD_KEY[heads]] || heads;

/** Un bout : ce qu'il vise, cliquable quand c'est un équipement, un groupe ou une annotation présents. */
function EndText({ model, end }: { model: Model; end: Connector["start"] }) {
  const { commands } = useStore();
  const { t } = useTranslation("panel");
  if (end.kind === "free") return <span title={end.x + ", " + end.y}>{t("connector.freePoint")}</span>;
  if (end.kind === "device") return <HostLink hostname={end.ref} />;
  if (end.kind === "group") { const g = model.groupById.get(end.ref); return <>{t("connector.group")} {g ? <button type="button" className="linklike" onClick={() => commands.reveal({ kind: "group", id: end.ref })}>{g.label}</button> : <span>{end.ref}</span>}</>; }
  // une annotation par son texte (ou sa sorte), jamais par son identifiant (lot 4 de docs/11, comme la fiche multiple)
  const a = model.annotationById.get(end.ref);
  return a ? <button type="button" className="linklike" title={annotationSummary(a)} onClick={() => commands.reveal({ kind: "annotation", id: end.ref })}>{annotationSummary(a) || KIND_LABEL[a.content.kind]}</button> : <span>{t("connector.annotation")}</span>;
}
/** L'ancre d'un bout attaché : le contour vers l'autre bout, ou le milieu d'un côté (le tracé coudé en part perpendiculairement). */
function SideSelect({ label, value, onChange }: { label: string; value: Side; onChange: (side: Side) => void }) {
  return <Select label={label} value={value} options={SIDES.map((side) => ({ value: side, label: SIDE_LABEL[side] }))} onChange={(side) => onChange(side as Side)} />;
}

export function ConnectorCard({ model, c }: { model: Model; c: Connector }) {
  const { commands } = useStore();
  const { t } = useTranslation("panel");
  const canWrite = useEditable();
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
      <InspectorHead icon={<Spline />} kind={arrow ? t("connector.arrow") : t("connector.connector")}
        actions={<>
          {!orphan ? <IconButton label={t("connector.center")} onClick={() => commands.reveal({ kind: "connector", id: c.id })}><Crosshair /></IconButton> : null}
          <HistoryButton object={c.id} />
          {canWrite ? <IconButton label={t("connector.reverse")} onClick={() => update({ start: c.end, end: c.start, heads: { start: c.heads.end, end: c.heads.start } })}><ArrowLeftRight /></IconButton> : null}
          {canWrite ? <IconButton label={c.locked ? t("annotation.unlock") : t("annotation.lock")} pressed={c.locked} onClick={() => update({ locked: !c.locked })}>{c.locked ? <Lock /> : <LockOpen />}</IconButton> : null}
          {canWrite ? <Menu label={t("node.moreActions")} items={[
            ...(c.start.kind !== "free" || c.end.kind !== "free" ? [{ label: t("connector.detach"), icon: <Link2Off />, onSelect: () => commands.connectorDetach(c.id) }] : []),
            { label: t("annotation.delete"), icon: <Trash2 />, danger: true, separated: true, onSelect: () => setConfirm(true) },
          ]} /> : null}
        </>}
        title={<Title>{c.label || LABEL[c.route].charAt(0).toUpperCase() + LABEL[c.route].slice(1)}</Title>}
        meta={signed(c.author, c.at)}
        badges={c.locked || orphan ? <>
          {c.locked ? <Badge kind="state" value="locked" label={t("connector.locked")} icon={<Lock aria-hidden="true" />} /> : null}
          {orphan ? <Badge kind="pin" value="orphan" label={t("connector.orphan")} title={t("connector.orphanTitle")} /> : null}
        </> : undefined}>
        {canWrite ? null : <WriteHint action={t("group.toEdit")} />}
        {confirm ? <Confirm text={t("connector.confirmDelete")} action={t("annotation.delete")} onCancel={() => setConfirm(false)} onConfirm={() => commands.connectorDelete(c.id)} /> : null}
      </InspectorHead>
      {/* un bout par rangée : ce qu'il vise, et son ancre à droite quand il est attaché (un seul mot « ancre » de moins) */}
      <Section title={t("connector.ends")}>
        <Row label={t("connector.start")}><span className="insp-end"><span className="insp-end-what"><EndText model={model} end={c.start} /></span>
          {canWrite && c.start.kind !== "free" ? <SideSelect label={t("connector.startAnchor")} value={c.start.side} onChange={(side) => update({ start: { ...c.start, side } as Connector["start"] })} /> : null}</span></Row>
        <Row label={t("connector.end")}><span className="insp-end"><span className="insp-end-what"><EndText model={model} end={c.end} /></span>
          {canWrite && c.end.kind !== "free" ? <SideSelect label={t("connector.endAnchor")} value={c.end.side} onChange={(side) => update({ end: { ...c.end, side } as Connector["end"] })} /> : null}</span></Row>
      </Section>
      {canWrite ? (
        <>
          <Section title={t("connector.path")} collapsible>
            <Row label={t("connector.label")}><TextInput value={c.label} max={80} label={t("connector.labelLabel")} placeholder={t("annotation.noLabel")} onCommit={(label) => update({ label })} /></Row>
            <Row label={t("connector.heads")}><Select label={t("connector.heads")} value={heads} options={HEAD_OPTIONS.map((value) => ({ value, label: headLabel(value) }))}
              onChange={(pick) => { const [start, end] = pick.split("/") as [typeof HEADS[number], typeof HEADS[number]]; update({ heads: { start, end } }); }} /></Row>
            <Row label={t("connector.shape")}><Segmented label={t("connector.shapeLabel")} value={c.route} options={options(ROUTES)} onPick={(route) => update({ route })} /></Row>
            {c.route !== "straight" ? <Row label={t("connector.bend")}><NumberField label={t("connector.bend")} value={c.bend} min={-400} max={400} onCommit={(bend) => update({ bend })} /></Row> : null}
            <Row label={t("annotation.plane")}><Segmented label={t("annotation.plane")} value={c.z} options={options(["back", "front"] as const)} onPick={(z) => update({ z })} /></Row>
            <Row label={t("annotation.opacity")}><NumberField label={t("annotation.opacity")} value={s.opacity} min={BOUNDS.opacity[0]} max={BOUNDS.opacity[1]} unit="%" onCommit={(opacity) => style({ opacity })} /></Row>
          </Section>
          <Section title={t("connector.stroke")} collapsible defaultOpen={false}>
            <Row label={t("hue")}><HueSetting value={s.hue} inherited={null} allowDefault={false} onPick={(hue) => style({ hue: hue || "slate" })} /></Row>
            <Row label={t("connector.strokeRow")}><StrokeRow label={t("connector.strokeStyle")} value={s.stroke_style} options={options(LINES)} width={s.stroke_width} bounds={BOUNDS.stroke_width}
              onStyle={(stroke_style) => style({ stroke_style: stroke_style as ConnectorStyle["stroke_style"] })} onWidth={(stroke_width) => style({ stroke_width })} /></Row>
          </Section>
          <TextSection items={[{ kind: "connector", c }]} />
        </>
      ) : (
        <Section title={t("annotation.appearance")}><Facts rows={[[t("annotation.hue"), hueLabel(s.hue)], [t("connector.route"), LABEL[c.route]], [t("connector.heads"), headLabel(heads)]]} /></Section>
      )}
    </Inspector>
  );
}
