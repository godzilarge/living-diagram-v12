// La fiche d'une annotation (docs/10 §6), dans la grammaire de l'inspecteur : l'en-tête (sorte, actions, titre,
// ancre et signature), le contenu selon la sorte (texte, forme et étiquette, tableau, image), la position (ancrage,
// boîte, calque, ligne de rappel), puis la forme et le texte, repliés par défaut. Chaque réglage part aussitôt par
// l'hôte d'intention ; sans nom, tout se lit. Signée et datée : une intention, jamais un fait collecté.
import { Code, Copy, Crosshair, Image as ImageIcon, Link2Off, Lock, LockOpen, Shapes, StickyNote, Table2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { t } from "../../../i18n";
import { ALIGNS, ANCHORS, BOUNDS, KIND_LABEL, LABEL, MAX_LABEL, MAX_NOTE, PLANES, SHAPES, VALIGNS, isOrphan } from "../../../canvas/annotations";
import { MAX_CELL, MAX_COLUMNS, MAX_ROWS, columnsOf, deleteColumn, deleteRow, insertColumn, insertRow, setCell } from "../../../canvas/table";
import type { TableContent } from "../../../contracts/intent";
import { FONTS, LABEL_COLORS, STROKES, WEIGHTS } from "../../../canvas/groups";
import { hueLabel } from "../../../canvas/hues";
import type { Annotation, AnnotationStyle, Model } from "../../../canvas/types";
import { useEditable, useStore } from "../../state/store";
import { Badge } from "../../ui";
import { Confirm, Facts, IconButton, Inspector, InspectorHead, Menu, NumberField, Pair, Row, Section, Segmented, Select, Stepper, Switch, TextArea, TextInput, Title } from "../../ui/inspector";
import { HistoryButton, HostLink, HueSetting, WriteHint, signed } from "./shared";
import { StrokeRow, TextSection, options } from "./style";
import { carriesText } from "../../state/text-format";
import { CodeContentRows, CodeDisplay, codeTitle } from "./CodeCard";

type Content = Annotation["content"];
const KIND_ICON: Record<string, ReactNode> = { note: <StickyNote />, shape: <Shapes />, table: <Table2 />, image: <ImageIcon />, code: <Code /> };
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const titleOf = (c: Content): string => (c.kind === "note" ? c.text.split("\n")[0].slice(0, 60) || t("panel:annotation.note")
  : c.kind === "shape" ? c.label || capital(LABEL[c.shape]) : c.kind === "table" ? t("panel:annotation.table", { rows: c.rows.length, cols: c.rows[0] ? c.rows[0].length : 0 })
    : c.kind === "code" ? codeTitle(c, t("panel:code.untitled")) : c.alt || t("panel:annotation.image"));

/** Le tableau : la grille des cellules (les fusions, largeurs et hauteurs se règlent sur la toile), le nombre de lignes
 *  et de colonnes (bornes du contrat), l'en-tête ; chaque geste rend un contenu neuf (table.ts). */
function TableEditor({ content, onChange }: { content: TableContent; onChange: (content: TableContent) => void }) {
  const [local, setLocal] = useState<TableContent>(content);
  const { t } = useTranslation("panel");
  useEffect(() => { setLocal(content); }, [content]);
  const cols = columnsOf(local);
  const commit = (): void => { if (JSON.stringify(local.rows) !== JSON.stringify(content.rows)) onChange(local); };
  const change = (next: TableContent): void => { setLocal(next); onChange(next); };
  return (
    <>
      <table className="insp-cells" aria-label={t("annotation.cells")} title={t("annotation.cellsTitle")}>
        <tbody>
          {local.rows.map((row, i) => (
            <tr key={i} className={local.header && i === 0 ? "head" : undefined}>
              {row.map((cell, j) => <td key={j}><input value={cell} maxLength={MAX_CELL} aria-label={t("annotation.cell", { row: i + 1, col: j + 1 })} spellCheck={false} onChange={(e) => setLocal(setCell(local, i, j, e.target.value))} onBlur={commit} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <Row label={t("annotation.rows")}><Stepper label={t("annotation.rows")} value={local.rows.length} min={1} max={MAX_ROWS} onChange={(n) => change(n > local.rows.length ? insertRow(local, local.rows.length) : deleteRow(local, local.rows.length - 1))} /></Row>
      <Row label={t("annotation.columns")}><Stepper label={t("annotation.columns")} value={cols} min={1} max={MAX_COLUMNS} onChange={(n) => change(n > cols ? insertColumn(local, cols) : deleteColumn(local, cols - 1))} /></Row>
      <Row label={t("annotation.header")}><Switch label={t("annotation.headerLabel")} checked={local.header} onChange={(header) => change({ ...local, header })} /></Row>
    </>
  );
}

/** L'ancrage : libre, sur un équipement (son hostname, proposé), sur un groupe (choisi dans la liste). */
function AnchorRows({ model, a, onAnchor }: { model: Model; a: Annotation; onAnchor: (anchor: Annotation["anchor"]) => void }) {
  const groups = Array.from(model.groupById.values()).sort((x, y) => x.label.localeCompare(y.label));
  const { t } = useTranslation("panel");
  const [want, setWant] = useState<string>(a.anchor.kind);
  useEffect(() => { setWant(a.anchor.kind); }, [a.anchor.kind]);
  const pick = (kind: string): void => {
    setWant(kind);
    if (kind === "free") onAnchor({ kind: "free", ref: null });
    else if (kind === "group" && groups.length) onAnchor({ kind: "group", ref: groups[0].id });
  };
  const kinds = groups.length ? ANCHORS : ANCHORS.filter((kind) => kind !== "group");
  return (
    <>
      <Row label={t("annotation.anchor")}><Segmented label={t("annotation.anchor")} value={want} options={options(kinds)} onPick={pick} /></Row>
      {want === "device" ? (
        <Row label={t("annotation.device")}>
          <TextInput value={a.anchor.kind === "device" ? a.anchor.ref || "" : ""} label={t("annotation.anchorDevice")} placeholder={t("annotation.hostname")} mono max={253} list="anchor-hosts"
            onCommit={(host) => { if (host && model.nodeByHost.has(host)) onAnchor({ kind: "device", ref: host }); }} />
          <datalist id="anchor-hosts">{model.nodes.filter((n) => n.kind !== "stub").slice(0, 400).map((n) => <option key={n.hostname} value={n.hostname} />)}</datalist>
        </Row>
      ) : null}
      {want === "group" && groups.length ? (
        <Row label={t("annotation.group")}><Select label={t("annotation.anchorGroup")} value={a.anchor.kind === "group" ? a.anchor.ref || "" : ""} options={groups.map((g) => ({ value: g.id, label: g.label }))} onChange={(id) => { if (id) onAnchor({ kind: "group", ref: id }); }} /></Row>
      ) : null}
    </>
  );
}

function ContentRows({ a, canWrite, onContent, onTable, onImage }: { a: Annotation; canWrite: boolean; onContent: (next: Content) => void; onTable: (next: TableContent) => void; onImage: (file: File) => void }) {
  const c = a.content;
  const { t } = useTranslation("panel");
  if (c.kind === "code") return <CodeContentRows a={a} c={c} canWrite={canWrite} />;
  if (!canWrite) {
    if (c.kind === "table") return <table className="insp-table"><tbody>{c.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>;
    return <p className="insp-text">{c.kind === "note" ? c.text : c.kind === "shape" ? c.label || LABEL[c.shape] : c.alt}</p>;
  }
  if (c.kind === "note") return <TextArea value={c.text} max={MAX_NOTE} rows={3} allowEmpty={false} label={t("annotation.noteText")} onCommit={(text) => onContent({ kind: "note", text })} />;
  if (c.kind === "table") return <TableEditor content={c} onChange={onTable} />;
  if (c.kind === "shape") {
    return (
      <>
        <Row label={t("annotation.shape")}><Segmented label={t("annotation.shape")} value={c.shape} options={options(SHAPES)} onPick={(shape) => onContent({ ...c, shape })} /></Row>
        <Row label={t("annotation.label")}><TextInput value={c.label} max={MAX_LABEL} label={t("annotation.shapeLabel")} placeholder={t("annotation.noLabel")} onCommit={(label) => onContent({ ...c, label })} /></Row>
      </>
    );
  }
  return (
    <>
      <Row label={t("annotation.alt")}><TextInput value={c.alt} max={120} label={t("annotation.altLabel")} placeholder={t("annotation.altPlaceholder")} onCommit={(alt) => onContent({ ...c, alt })} /></Row>
      <Row label={t("annotation.file")}>
        <label className="pbtn insp-file"><ImageIcon /> {t("annotation.replace")}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t("annotation.newFile")} onChange={(event) => { const chosen = event.target.files && event.target.files[0]; if (chosen) onImage(chosen); event.target.value = ""; }} /></label>
        <span className="insp-hint">{t("annotation.formats")}</span>
      </Row>
    </>
  );
}

function StyleSections({ a, onStyle }: { a: Annotation; onStyle: (patch: Partial<AnnotationStyle>) => void }) {
  const s = a.style, c = a.content;
  const { t } = useTranslation("panel");
  return (
    <>
      <Section title={t("annotation.shapeSection")} collapsible defaultOpen={false}>
        <Row label={t("hue")}><HueSetting value={s.hue} inherited={null} allowDefault={false} onPick={(hue) => onStyle({ hue: hue || "slate" })} /></Row>
        {c.kind === "code" ? null : <Row label={t("style.fill")}><NumberField label={t("style.fill")} value={s.fill_opacity} min={BOUNDS.fill_opacity[0]} max={BOUNDS.fill_opacity[1]} unit="%" onCommit={(fill_opacity) => onStyle({ fill_opacity })} /></Row>}
        <Row label={t("style.border")}><StrokeRow value={s.stroke_style} options={options(STROKES)} width={s.stroke_width} bounds={BOUNDS.stroke_width}
          onStyle={(stroke_style) => onStyle({ stroke_style: stroke_style as AnnotationStyle["stroke_style"] })} onWidth={(stroke_width) => onStyle({ stroke_width })} /></Row>
        <Row label={t("style.corners")}><NumberField label={t("style.corners")} value={s.radius} min={BOUNDS.radius[0]} max={BOUNDS.radius[1]} unit="px" onCommit={(radius) => onStyle({ radius })} /></Row>
      </Section>
      {carriesText(a) ? <TextSection items={[{ kind: "annotation", a }]} /> : null}
    </>
  );
}

export function AnnotationCard({ model, a }: { model: Model; a: Annotation }) {
  const { commands } = useStore();
  const { t } = useTranslation("panel");
  const canWrite = useEditable();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setConfirm(false); }, [a.id]);
  const s = a.style, c = a.content;
  const orphan = isOrphan(model, a);
  const update = (patch: Parameters<typeof commands.annotationUpdate>[1]): void => commands.annotationUpdate(a.id, patch);
  const anchorText = a.anchor.kind === "free" ? t("annotation.free")
    : a.anchor.kind === "device" ? <>{t("annotation.on")} <HostLink hostname={a.anchor.ref || ""} /></>
      : <>{t("annotation.on")} <button type="button" className="linklike" onClick={() => commands.reveal({ kind: "group", id: a.anchor.ref || "" })}>{(model.groupById.get(a.anchor.ref || "") || { label: a.anchor.ref }).label}</button></>;
  return (
    <Inspector kind="annotation">
      <InspectorHead icon={KIND_ICON[c.kind]} kind={capital(KIND_LABEL[c.kind] || c.kind)}
        actions={<>
          {!orphan ? <IconButton label={t("annotation.center")} onClick={() => commands.reveal({ kind: "annotation", id: a.id })}><Crosshair /></IconButton> : null}
          <HistoryButton object={a.id} />
          {canWrite ? <IconButton label={t("annotation.duplicate")} onClick={() => commands.annotationDuplicate(a.id)}><Copy /></IconButton> : null}
          {canWrite ? <IconButton label={a.locked ? t("annotation.unlock") : t("annotation.lock")} pressed={a.locked} onClick={() => update({ locked: !a.locked })}>{a.locked ? <Lock /> : <LockOpen />}</IconButton> : null}
          {canWrite ? <Menu label={t("node.moreActions")} items={[
            ...(a.anchor.kind !== "free" ? [{ label: t("annotation.detach"), icon: <Link2Off />, onSelect: () => commands.annotationDetach(a.id) }] : []),
            { label: t("annotation.delete"), icon: <Trash2 />, danger: true, separated: true, onSelect: () => setConfirm(true) },
          ]} /> : null}
        </>}
        title={<Title>{titleOf(c)}</Title>}
        meta={<>{anchorText} · {signed(a.author, a.at)}</>}
        badges={a.locked || orphan ? <>
          {a.locked ? <Badge kind="state" value="locked" label={t("annotation.locked")} icon={<Lock aria-hidden="true" />} /> : null}
          {orphan ? <Badge kind="pin" value="orphan" label={t("annotation.orphan")} title={t("annotation.orphanTitle")} /> : null}
        </> : undefined}>
        {canWrite ? null : <WriteHint action={t("annotation.toEdit")} />}
        {confirm ? <Confirm text={t("annotation.confirmDelete")} action={t("annotation.delete")} onCancel={() => setConfirm(false)} onConfirm={() => commands.annotationDelete(a.id)} /> : null}
      </InspectorHead>
      <Section title={c.kind === "code" ? t("code.section") : t("annotation.content")}>
        <ContentRows a={a} canWrite={canWrite} onContent={(content) => update({ content })} onTable={(next) => commands.tableUpdate(a.id, next)} onImage={(file) => commands.annotationImage(file, a.id)} />
      </Section>
      {canWrite && c.kind === "code" ? <CodeDisplay a={a} c={c} /> : null}
      {canWrite ? (
        <>
          <Section title={t("annotation.positionSection")} collapsible>
            <AnchorRows model={model} a={a} onAnchor={(anchor) => update({ anchor, ...(anchor.kind === "free" ? { leader: false } : {}) })} />
            <Row label={t("annotation.position")}><Pair>
              <NumberField label="x" prefix="X" value={a.x} min={-1e6} max={1e6} onCommit={(x) => update({ x })} />
              <NumberField label="y" prefix="Y" value={a.y} min={-1e6} max={1e6} onCommit={(y) => update({ y })} />
            </Pair></Row>
            <Row label={t("annotation.size")}><Pair>
              <NumberField label={t("annotation.width")} prefix={t("annotation.widthPrefix")} value={a.w} min={BOUNDS.size[0]} max={BOUNDS.size[1]} onCommit={(w) => update({ w })} />
              <NumberField label={t("annotation.height")} prefix={t("annotation.heightPrefix")} value={a.h} min={BOUNDS.size[0]} max={BOUNDS.size[1]} onCommit={(h) => update({ h })} />
            </Pair></Row>
            {a.anchor.kind === "free"
              ? <Row label={t("annotation.plane")}><Segmented label={t("annotation.plane")} value={a.z} options={options(PLANES)} onPick={(z) => update({ z })} /></Row>
              : <Row label={t("annotation.plane")}><span className="insp-hint">{t("annotation.planeAttached")}</span></Row>}
            <Row label={t("annotation.opacity")}><NumberField label={t("annotation.opacity")} value={s.opacity} min={BOUNDS.opacity[0]} max={BOUNDS.opacity[1]} unit="%" onCommit={(opacity) => update({ style: { opacity } })} /></Row>
            {a.anchor.kind !== "free" ? <Row label={t("annotation.leader")}><Switch label={t("annotation.leaderLabel")} checked={a.leader} onChange={(leader) => update({ leader })} /></Row> : null}
          </Section>
          <StyleSections a={a} onStyle={(style) => update({ style })} />
        </>
      ) : (
        <Section title={t("annotation.appearance")}><Facts rows={[[t("annotation.hue"), hueLabel(s.hue)], [t("annotation.text"), s.text_size + " px"], [t("annotation.box"), a.w + " × " + a.h]]} /></Section>
      )}
    </Inspector>
  );
}
