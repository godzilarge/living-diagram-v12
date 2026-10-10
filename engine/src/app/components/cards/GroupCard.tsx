// La fiche d'un groupe (docs/10 §5), dans la grammaire de l'inspecteur : nom et description éditables en place, les
// actions (centrer, sélectionner les membres ; masquer, isoler, appliquer la teinte et supprimer dans « … »), les
// membres (présents, absents), puis le cadre et l'étiquette. On ajoute un membre depuis la fiche d'un équipement ou
// d'une sélection. Chaque réglage part aussitôt par l'hôte d'intention, pour tout le monde ; sans nom, tout se lit.
import { Crosshair, EyeOff, Focus, Group as GroupIcon, Paintbrush, SquareDashedMousePointer, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BOUNDS, FONTS, LABEL_COLORS, PLACEMENTS, POSITIONS, SHAPES, STROKES, STYLE_LABEL, WEIGHTS, orphanMembers, presentMembers } from "../../../canvas/groups";
import { hueLabel } from "../../../canvas/hues";
import type { Group, GroupStyle, Model } from "../../../canvas/types";
import { useEditable, useStore } from "../../state/store";
import { plural } from "../../ui";
import { Confirm, Facts, IconButton, Inspector, InspectorHead, List, ListRow, Menu, NumberField, PositionField, Row, Section, Segmented, TextArea, Title, TitleInput } from "../../ui/inspector";
import { HistoryButton, HostLink, HueSetting, WriteHint, signed } from "./shared";
import { StrokeRow, TextRows, options } from "./style";

type StylePatch = Partial<GroupStyle>;
const PLACEMENT_WORDS = { inside: "dans le cadre", outside: "hors du cadre" };

function StyleSections({ s, onStyle }: { s: GroupStyle; onStyle: (patch: StylePatch) => void }) {
  return (
    <>
      <Section title="Cadre" collapsible>
        <Row label="forme"><Segmented label="forme" value={s.shape} options={options(SHAPES)} onPick={(shape) => onStyle({ shape })} /></Row>
        <Row label="teinte"><HueSetting value={s.hue} inherited={null} allowDefault={false} onPick={(hue) => onStyle({ hue: hue || "slate" })} /></Row>
        <Row label="remplissage"><NumberField label="remplissage" value={s.fill_opacity} min={BOUNDS.fill_opacity[0]} max={BOUNDS.fill_opacity[1]} unit="%" onCommit={(fill_opacity) => onStyle({ fill_opacity })} /></Row>
        <Row label="marge"><NumberField label="marge autour des membres" value={s.padding} min={BOUNDS.padding[0]} max={BOUNDS.padding[1]} unit="px" onCommit={(padding) => onStyle({ padding })} /></Row>
        <Row label="bordure"><StrokeRow value={s.stroke_style} options={options(STROKES)} width={s.stroke_width} bounds={BOUNDS.stroke_width}
          onStyle={(stroke_style) => onStyle({ stroke_style: stroke_style as GroupStyle["stroke_style"] })} onWidth={(stroke_width) => onStyle({ stroke_width })} /></Row>
        {s.shape !== "ellipse" ? <Row label="coins"><NumberField label="coins" value={s.radius} min={BOUNDS.radius[0]} max={BOUNDS.radius[1]} unit="px" onCommit={(radius) => onStyle({ radius })} /></Row> : null}
      </Section>
      <Section title="Étiquette" collapsible defaultOpen={false}>
        <Row label="position"><PositionField label="position de l'étiquette" options={POSITIONS} names={STYLE_LABEL} value={s.label_position} onPick={(label_position) => onStyle({ label_position })} /></Row>
        <Row label="placement"><Segmented label="dans ou hors du cadre" value={s.label_placement} options={options(PLACEMENTS, PLACEMENT_WORDS)} onPick={(label_placement) => onStyle({ label_placement })} /></Row>
        <TextRows value={{ size: s.label_size, weight: s.label_weight, font: s.label_font, color: s.label_color }}
          bounds={{ size: BOUNDS.label_size, weights: WEIGHTS, fonts: FONTS, colors: LABEL_COLORS }}
          onChange={(p) => onStyle({
            ...(p.size !== undefined ? { label_size: p.size } : {}), ...(p.weight ? { label_weight: p.weight as GroupStyle["label_weight"] } : {}),
            ...(p.font ? { label_font: p.font as GroupStyle["label_font"] } : {}), ...(p.color ? { label_color: p.color as GroupStyle["label_color"] } : {}),
          })} />
      </Section>
    </>
  );
}

export function GroupCard({ model, group }: { model: Model; group: Group }) {
  const { commands } = useStore();
  const canWrite = useEditable();
  const present = presentMembers(model, group), orphans = orphanMembers(model, group);
  const s = group.style;
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setConfirm(false); }, [group.id]);
  const count = plural(group.members.length, "membre") + (orphans.length ? " · " + orphans.length + " absent" + (orphans.length > 1 ? "s" : "") : "");
  return (
    <Inspector kind="group">
      <InspectorHead icon={<GroupIcon />} kind="Groupe"
        actions={<>
          <IconButton label="centrer la toile sur le groupe" onClick={() => commands.reveal({ kind: "group", id: group.id })}><Crosshair /></IconButton>
          <HistoryButton object={group.id} />
          <IconButton label="sélectionner les membres" disabled={!present.length} onClick={() => commands.selectHosts(present)}><SquareDashedMousePointer /></IconButton>
          <Menu label="plus d'actions" items={[
            { label: "masquer les membres", icon: <EyeOff />, disabled: !present.length, onSelect: () => commands.hideHosts(present) },
            { label: "isoler les membres", icon: <Focus />, disabled: !present.length, onSelect: () => commands.isolateHosts(present) },
            ...(canWrite ? [
              { label: "appliquer la teinte aux membres", icon: <Paintbrush />, disabled: !present.length, onSelect: () => commands.colorHosts(present, s.hue) },
              { label: "supprimer le groupe", icon: <Trash2 />, danger: true, separated: true, onSelect: () => setConfirm(true) },
            ] : []),
          ]} />
        </>}
        title={canWrite ? <TitleInput value={group.label} label="nom du groupe" max={80} onCommit={(label) => commands.groupUpdate(group.id, { label })} /> : <Title>{group.label}</Title>}
        meta={<>{count} · {signed(group.author, group.at)}</>}>
        {canWrite
          ? <TextArea value={group.description} max={500} rows={1} placeholder="Ajouter une description" label="description du groupe" onCommit={(description) => commands.groupUpdate(group.id, { description })} />
          : group.description ? <p className="insp-text">{group.description}</p> : null}
        {canWrite ? null : <WriteHint action="le modifier" />}
        {confirm ? <Confirm text={"Supprimer « " + group.label + " » ?"} action="supprimer" onCancel={() => setConfirm(false)} onConfirm={() => commands.groupDelete(group.id)} /> : null}
      </InspectorHead>
      <Section title="Membres" count={group.members.length}>
        <List label="membres">
          {group.members.map((host) => {
            const absent = orphans.includes(host);
            const remove = canWrite && group.members.length > 1 ? <IconButton label={"retirer " + host + " du groupe"} onClick={() => commands.groupRemove(group.id, [host])}><X /></IconButton> : null;
            return <ListRow key={host} faint={absent} trailing={absent ? <>absent{remove}</> : remove}>{absent ? <span className="mono">{host}</span> : <HostLink hostname={host} />}</ListRow>;
          })}
        </List>
      </Section>
      {canWrite ? <StyleSections s={s} onStyle={(style) => commands.groupUpdate(group.id, { style })} />
        : <Section title="Apparence"><Facts rows={[["forme", STYLE_LABEL[s.shape]], ["teinte", hueLabel(s.hue)]]} /></Section>}
    </Inspector>
  );
}
