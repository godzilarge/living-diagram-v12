// La fiche d'une annotation (docs/10 §6), dans la grammaire de l'inspecteur : l'en-tête (sorte, actions, titre,
// ancre et signature), le contenu selon la sorte (texte, forme et étiquette, tableau, image), la position (ancrage,
// boîte, calque, ligne de rappel), puis la forme et le texte, repliés par défaut. Chaque réglage part aussitôt par
// l'hôte d'intention ; sans nom, tout se lit. Signée et datée : une intention, jamais un fait collecté.
import { Copy, Crosshair, Image as ImageIcon, Link2Off, Lock, LockOpen, Shapes, StickyNote, Table2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ALIGNS, ANCHORS, BOUNDS, KIND_LABEL, LABEL, MAX_LABEL, MAX_NOTE, PLANES, SHAPES, VALIGNS, isOrphan } from "../../../canvas/annotations";
import { MAX_CELL, MAX_COLUMNS, MAX_ROWS, columnsOf, deleteColumn, deleteRow, insertColumn, insertRow, setCell } from "../../../canvas/table";
import type { TableContent } from "../../../contracts/intent";
import { FONTS, LABEL_COLORS, STROKES, WEIGHTS } from "../../../canvas/groups";
import { hueLabel } from "../../../canvas/hues";
import type { Annotation, AnnotationStyle, Model } from "../../../canvas/types";
import { useEditable, useStore } from "../../state/store";
import { Badge } from "../../ui";
import { Confirm, Facts, IconButton, Inspector, InspectorHead, Menu, NumberField, Pair, Row, Section, Segmented, Select, Stepper, Switch, TextArea, TextInput, Title } from "../../ui/inspector";
import { HostLink, HueSetting, WriteHint, signed } from "./shared";
import { StrokeRow, TextRows, options } from "./style";

type Content = Annotation["content"];
const KIND_ICON: Record<string, ReactNode> = { note: <StickyNote />, shape: <Shapes />, table: <Table2 />, image: <ImageIcon /> };
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const titleOf = (c: Content): string => (c.kind === "note" ? c.text.split("\n")[0].slice(0, 60) || "Note"
  : c.kind === "shape" ? c.label || capital(LABEL[c.shape]) : c.kind === "table" ? "Tableau " + c.rows.length + " × " + (c.rows[0] ? c.rows[0].length : 0) : c.alt || "Image");

/** Le tableau : la grille des cellules (les fusions, largeurs et hauteurs se règlent sur la toile), le nombre de lignes
 *  et de colonnes (bornes du contrat), l'en-tête ; chaque geste rend un contenu neuf (table.ts). */
function TableEditor({ content, onChange }: { content: TableContent; onChange: (content: TableContent) => void }) {
  const [local, setLocal] = useState<TableContent>(content);
  useEffect(() => { setLocal(content); }, [content]);
  const cols = columnsOf(local);
  const commit = (): void => { if (JSON.stringify(local.rows) !== JSON.stringify(content.rows)) onChange(local); };
  const change = (next: TableContent): void => { setLocal(next); onChange(next); };
  return (
    <>
      <table className="insp-cells" aria-label="cellules du tableau" title="sur la toile : double-clic édite une cellule, clic droit insère, supprime, fusionne">
        <tbody>
          {local.rows.map((row, i) => (
            <tr key={i} className={local.header && i === 0 ? "head" : undefined}>
              {row.map((cell, j) => <td key={j}><input value={cell} maxLength={MAX_CELL} aria-label={"ligne " + (i + 1) + ", colonne " + (j + 1)} spellCheck={false} onChange={(e) => setLocal(setCell(local, i, j, e.target.value))} onBlur={commit} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <Row label="lignes"><Stepper label="lignes" value={local.rows.length} min={1} max={MAX_ROWS} onChange={(n) => change(n > local.rows.length ? insertRow(local, local.rows.length) : deleteRow(local, local.rows.length - 1))} /></Row>
      <Row label="colonnes"><Stepper label="colonnes" value={cols} min={1} max={MAX_COLUMNS} onChange={(n) => change(n > cols ? insertColumn(local, cols) : deleteColumn(local, cols - 1))} /></Row>
      <Row label="en-tête"><Switch label="première ligne en en-tête" checked={local.header} onChange={(header) => change({ ...local, header })} /></Row>
    </>
  );
}

/** L'ancrage : libre, sur un équipement (son hostname, proposé), sur un groupe (choisi dans la liste). */
function AnchorRows({ model, a, onAnchor }: { model: Model; a: Annotation; onAnchor: (anchor: Annotation["anchor"]) => void }) {
  const groups = Array.from(model.groupById.values()).sort((x, y) => x.label.localeCompare(y.label));
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
      <Row label="ancrage"><Segmented label="ancrage" value={want} options={options(kinds)} onPick={pick} /></Row>
      {want === "device" ? (
        <Row label="équipement">
          <TextInput value={a.anchor.kind === "device" ? a.anchor.ref || "" : ""} label="équipement d'ancrage" placeholder="hostname" mono max={253} list="anchor-hosts"
            onCommit={(host) => { if (host && model.nodeByHost.has(host)) onAnchor({ kind: "device", ref: host }); }} />
          <datalist id="anchor-hosts">{model.nodes.filter((n) => n.kind !== "stub").slice(0, 400).map((n) => <option key={n.hostname} value={n.hostname} />)}</datalist>
        </Row>
      ) : null}
      {want === "group" && groups.length ? (
        <Row label="groupe"><Select label="groupe d'ancrage" value={a.anchor.kind === "group" ? a.anchor.ref || "" : ""} options={groups.map((g) => ({ value: g.id, label: g.label }))} onChange={(id) => { if (id) onAnchor({ kind: "group", ref: id }); }} /></Row>
      ) : null}
    </>
  );
}

function ContentRows({ a, canWrite, onContent, onTable, onImage }: { a: Annotation; canWrite: boolean; onContent: (next: Content) => void; onTable: (next: TableContent) => void; onImage: (file: File) => void }) {
  const c = a.content;
  if (!canWrite) {
    if (c.kind === "table") return <table className="insp-table"><tbody>{c.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>;
    return <p className="insp-text">{c.kind === "note" ? c.text : c.kind === "shape" ? c.label || LABEL[c.shape] : c.alt}</p>;
  }
  if (c.kind === "note") return <TextArea value={c.text} max={MAX_NOTE} rows={3} allowEmpty={false} label="texte de la note" onCommit={(text) => onContent({ kind: "note", text })} />;
  if (c.kind === "table") return <TableEditor content={c} onChange={onTable} />;
  if (c.kind === "shape") {
    return (
      <>
        <Row label="forme"><Segmented label="forme" value={c.shape} options={options(SHAPES)} onPick={(shape) => onContent({ ...c, shape })} /></Row>
        <Row label="étiquette"><TextInput value={c.label} max={MAX_LABEL} label="étiquette de la forme" placeholder="sans étiquette" onCommit={(label) => onContent({ ...c, label })} /></Row>
      </>
    );
  }
  return (
    <>
      <Row label="texte alt."><TextInput value={c.alt} max={120} label="texte de remplacement" placeholder="ce que montre l'image" onCommit={(alt) => onContent({ ...c, alt })} /></Row>
      <Row label="fichier">
        <label className="pbtn insp-file"><ImageIcon /> Remplacer…<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="nouveau fichier d'image" onChange={(event) => { const chosen = event.target.files && event.target.files[0]; if (chosen) onImage(chosen); event.target.value = ""; }} /></label>
        <span className="insp-hint">PNG, JPEG, WebP · 4 Mo</span>
      </Row>
    </>
  );
}

function StyleSections({ a, onStyle }: { a: Annotation; onStyle: (patch: Partial<AnnotationStyle>) => void }) {
  const s = a.style, c = a.content;
  return (
    <>
      <Section title="Forme" collapsible defaultOpen={false}>
        <Row label="teinte"><HueSetting value={s.hue} inherited={null} allowDefault={false} onPick={(hue) => onStyle({ hue: hue || "slate" })} /></Row>
        <Row label="remplissage"><NumberField label="remplissage" value={s.fill_opacity} min={BOUNDS.fill_opacity[0]} max={BOUNDS.fill_opacity[1]} unit="%" onCommit={(fill_opacity) => onStyle({ fill_opacity })} /></Row>
        <Row label="bordure"><StrokeRow value={s.stroke_style} options={options(STROKES)} width={s.stroke_width} bounds={BOUNDS.stroke_width}
          onStyle={(stroke_style) => onStyle({ stroke_style: stroke_style as AnnotationStyle["stroke_style"] })} onWidth={(stroke_width) => onStyle({ stroke_width })} /></Row>
        <Row label="coins"><NumberField label="coins" value={s.radius} min={BOUNDS.radius[0]} max={BOUNDS.radius[1]} unit="px" onCommit={(radius) => onStyle({ radius })} /></Row>
      </Section>
      {c.kind !== "image" ? (
        <Section title="Texte" collapsible defaultOpen={false}>
          <TextRows value={{ size: s.text_size, weight: s.text_weight, font: s.text_font, color: s.text_color, align: s.text_align, valign: c.kind !== "table" ? s.text_valign : undefined }}
            bounds={{ size: BOUNDS.text_size, weights: WEIGHTS, fonts: FONTS, colors: LABEL_COLORS, aligns: ALIGNS, valigns: c.kind !== "table" ? VALIGNS : undefined }}
            onChange={(p) => onStyle({
              ...(p.size !== undefined ? { text_size: p.size } : {}), ...(p.weight ? { text_weight: p.weight as AnnotationStyle["text_weight"] } : {}),
              ...(p.font ? { text_font: p.font as AnnotationStyle["text_font"] } : {}), ...(p.color ? { text_color: p.color as AnnotationStyle["text_color"] } : {}),
              ...(p.align ? { text_align: p.align as AnnotationStyle["text_align"] } : {}), ...(p.valign ? { text_valign: p.valign as AnnotationStyle["text_valign"] } : {}),
            })} />
        </Section>
      ) : null}
    </>
  );
}

export function AnnotationCard({ model, a }: { model: Model; a: Annotation }) {
  const { commands } = useStore();
  const canWrite = useEditable();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setConfirm(false); }, [a.id]);
  const s = a.style, c = a.content;
  const orphan = isOrphan(model, a);
  const update = (patch: Parameters<typeof commands.annotationUpdate>[1]): void => commands.annotationUpdate(a.id, patch);
  const anchorText = a.anchor.kind === "free" ? "libre"
    : a.anchor.kind === "device" ? <>sur <HostLink hostname={a.anchor.ref || ""} /></>
      : <>sur <button type="button" className="linklike" onClick={() => commands.reveal({ kind: "group", id: a.anchor.ref || "" })}>{(model.groupById.get(a.anchor.ref || "") || { label: a.anchor.ref }).label}</button></>;
  return (
    <Inspector kind="annotation">
      <InspectorHead icon={KIND_ICON[c.kind]} kind={capital(KIND_LABEL[c.kind] || c.kind)}
        actions={<>
          {!orphan ? <IconButton label="centrer la toile sur l'annotation" onClick={() => commands.reveal({ kind: "annotation", id: a.id })}><Crosshair /></IconButton> : null}
          {canWrite ? <IconButton label="dupliquer" onClick={() => commands.annotationDuplicate(a.id)}><Copy /></IconButton> : null}
          {canWrite ? <IconButton label={a.locked ? "déverrouiller" : "verrouiller"} pressed={a.locked} onClick={() => update({ locked: !a.locked })}>{a.locked ? <Lock /> : <LockOpen />}</IconButton> : null}
          {canWrite ? <Menu label="plus d'actions" items={[
            ...(a.anchor.kind !== "free" ? [{ label: "détacher, là où elle est", icon: <Link2Off />, onSelect: () => commands.annotationDetach(a.id) }] : []),
            { label: "supprimer", icon: <Trash2 />, danger: true, separated: true, onSelect: () => setConfirm(true) },
          ]} /> : null}
        </>}
        title={<Title>{titleOf(c)}</Title>}
        meta={<>{anchorText} · {signed(a.author, a.at)}</>}
        badges={a.locked || orphan ? <>
          {a.locked ? <Badge kind="state" value="locked" label="verrouillée" icon={<Lock aria-hidden="true" />} /> : null}
          {orphan ? <Badge kind="pin" value="orphan" label="orpheline" title="son ancre n'est pas dans cette run : non dessinée, jamais effacée en silence" /> : null}
        </> : undefined}>
        {canWrite ? null : <WriteHint action="la modifier" />}
        {confirm ? <Confirm text="Supprimer cette annotation ?" action="supprimer" onCancel={() => setConfirm(false)} onConfirm={() => commands.annotationDelete(a.id)} /> : null}
      </InspectorHead>
      <Section title="Contenu">
        <ContentRows a={a} canWrite={canWrite} onContent={(content) => update({ content })} onTable={(next) => commands.tableUpdate(a.id, next)} onImage={(file) => commands.annotationImage(file, a.id)} />
      </Section>
      {canWrite ? (
        <>
          <Section title="Position" collapsible>
            <AnchorRows model={model} a={a} onAnchor={(anchor) => update({ anchor, ...(anchor.kind === "free" ? { leader: false } : {}) })} />
            <Row label="position"><Pair>
              <NumberField label="x" prefix="X" value={a.x} min={-1e6} max={1e6} onCommit={(x) => update({ x })} />
              <NumberField label="y" prefix="Y" value={a.y} min={-1e6} max={1e6} onCommit={(y) => update({ y })} />
            </Pair></Row>
            <Row label="taille"><Pair>
              <NumberField label="largeur" prefix="L" value={a.w} min={BOUNDS.size[0]} max={BOUNDS.size[1]} onCommit={(w) => update({ w })} />
              <NumberField label="hauteur" prefix="H" value={a.h} min={BOUNDS.size[0]} max={BOUNDS.size[1]} onCommit={(h) => update({ h })} />
            </Pair></Row>
            <Row label="plan"><Segmented label="plan" value={a.z} options={options(PLANES)} onPick={(z) => update({ z })} /></Row>
            <Row label="opacité"><NumberField label="opacité" value={s.opacity} min={BOUNDS.opacity[0]} max={BOUNDS.opacity[1]} unit="%" onCommit={(opacity) => update({ style: { opacity } })} /></Row>
            {a.anchor.kind !== "free" ? <Row label="rappel"><Switch label="ligne de rappel vers l'ancre" checked={a.leader} onChange={(leader) => update({ leader })} /></Row> : null}
          </Section>
          <StyleSections a={a} onStyle={(style) => update({ style })} />
        </>
      ) : (
        <Section title="Apparence"><Facts rows={[["teinte", hueLabel(s.hue)], ["texte", s.text_size + " px"], ["boîte", a.w + " × " + a.h]]} /></Section>
      )}
    </Inspector>
  );
}
