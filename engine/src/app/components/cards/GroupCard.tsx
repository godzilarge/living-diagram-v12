// La fiche d'un groupe (docs/10 §5), dans la grammaire de l'inspecteur : nom et description éditables en place, les
// actions (centrer, sélectionner les membres ; masquer, isoler, appliquer la teinte et supprimer dans « … » : la
// suppression est directe, Ctrl+Z la défait, comme depuis le menu contextuel, lot 1 de docs/11), les
// membres (présents, absents), puis le cadre et l'étiquette. On ajoute un membre depuis la fiche d'un équipement ou
// d'une sélection. Chaque réglage part aussitôt par l'hôte d'intention, pour tout le monde ; sans nom, tout se lit.
import { Crosshair, EyeOff, Focus, Group as GroupIcon, Paintbrush, SquareDashedMousePointer, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BOUNDS, FONTS, LABEL_COLORS, PLACEMENTS, POSITIONS, SHAPES, STROKES, STYLE_LABEL, WEIGHTS, orphanMembers, presentMembers } from "../../../canvas/groups";
import { hueLabel } from "../../../canvas/hues";
import type { Group, GroupStyle, Model } from "../../../canvas/types";
import { useEditable, useStore } from "../../state/store";
import { Facts, IconButton, Inspector, InspectorHead, List, ListRow, Menu, NumberField, PositionField, Row, Section, Segmented, TextArea, Title, TitleInput } from "../../ui/inspector";
import { HistoryButton, HostLink, HueSetting, WriteHint, signed } from "./shared";
import { StrokeRow, TextRows, options } from "./style";

type StylePatch = Partial<GroupStyle>;
function StyleSections({ s, onStyle }: { s: GroupStyle; onStyle: (patch: StylePatch) => void }) {
  const { t } = useTranslation("panel");
  const placementWords = { inside: t("style.inside"), outside: t("style.outside") };
  return (
    <>
      <Section title={t("style.frame")} collapsible>
        <Row label={t("style.shape")}><Segmented label={t("style.shape")} value={s.shape} options={options(SHAPES)} onPick={(shape) => onStyle({ shape })} /></Row>
        <Row label={t("hue")}><HueSetting value={s.hue} inherited={null} allowDefault={false} onPick={(hue) => onStyle({ hue: hue || "slate" })} /></Row>
        <Row label={t("style.fill")}><NumberField label={t("style.fill")} value={s.fill_opacity} min={BOUNDS.fill_opacity[0]} max={BOUNDS.fill_opacity[1]} unit="%" onCommit={(fill_opacity) => onStyle({ fill_opacity })} /></Row>
        <Row label={t("style.padding")}><NumberField label={t("style.paddingLabel")} value={s.padding} min={BOUNDS.padding[0]} max={BOUNDS.padding[1]} unit="px" onCommit={(padding) => onStyle({ padding })} /></Row>
        <Row label={t("style.border")}><StrokeRow value={s.stroke_style} options={options(STROKES)} width={s.stroke_width} bounds={BOUNDS.stroke_width}
          onStyle={(stroke_style) => onStyle({ stroke_style: stroke_style as GroupStyle["stroke_style"] })} onWidth={(stroke_width) => onStyle({ stroke_width })} /></Row>
        {s.shape !== "ellipse" ? <Row label={t("style.corners")}><NumberField label={t("style.corners")} value={s.radius} min={BOUNDS.radius[0]} max={BOUNDS.radius[1]} unit="px" onCommit={(radius) => onStyle({ radius })} /></Row> : null}
      </Section>
      <Section title={t("style.label")} collapsible defaultOpen={false}>
        <Row label={t("style.position")}><PositionField label={t("style.labelPosition")} options={POSITIONS} names={STYLE_LABEL} value={s.label_position} onPick={(label_position) => onStyle({ label_position })} /></Row>
        <Row label={t("style.placement")}><Segmented label={t("style.placementLabel")} value={s.label_placement} options={options(PLACEMENTS, placementWords)} onPick={(label_placement) => onStyle({ label_placement })} /></Row>
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
  const { t } = useTranslation("panel");
  const canWrite = useEditable();
  const present = presentMembers(model, group), orphans = orphanMembers(model, group);
  const s = group.style;
  const count = t("group.members", { count: group.members.length }) + (orphans.length ? " · " + t("group.absent", { count: orphans.length }) : "");
  return (
    <Inspector kind="group">
      <InspectorHead icon={<GroupIcon />} kind={t("group.kind")}
        actions={<>
          <IconButton label={t("group.center")} onClick={() => commands.reveal({ kind: "group", id: group.id })}><Crosshair /></IconButton>
          <HistoryButton object={group.id} />
          <IconButton label={t("group.selectMembers")} disabled={!present.length} onClick={() => commands.selectHosts(present)}><SquareDashedMousePointer /></IconButton>
          <Menu label={t("group.moreActions")} items={[
            { label: t("group.hideMembers"), icon: <EyeOff />, disabled: !present.length, onSelect: () => commands.hideHosts(present) },
            { label: t("group.isolateMembers"), icon: <Focus />, disabled: !present.length, onSelect: () => commands.isolateHosts(present) },
            ...(canWrite ? [
              { label: t("group.applyHue"), icon: <Paintbrush />, disabled: !present.length, onSelect: () => commands.colorHosts(present, s.hue) },
              { label: t("group.delete"), icon: <Trash2 />, danger: true, separated: true, onSelect: () => commands.groupDelete(group.id) },
            ] : []),
          ]} />
        </>}
        title={canWrite ? <TitleInput value={group.label} label={t("group.name")} max={80} onCommit={(label) => commands.groupUpdate(group.id, { label })} /> : <Title>{group.label}</Title>}
        meta={<>{count} · {signed(group.author, group.at)}</>}>
        {canWrite
          ? <TextArea value={group.description} max={500} rows={1} placeholder={t("group.addDescription")} label={t("group.description")} onCommit={(description) => commands.groupUpdate(group.id, { description })} />
          : group.description ? <p className="insp-text">{group.description}</p> : null}
        {canWrite ? null : <WriteHint action={t("group.toEdit")} />}
      </InspectorHead>
      <Section title={t("group.membersTitle")} count={group.members.length}>
        <List label={t("group.membersList")}>
          {group.members.map((host) => {
            const absent = orphans.includes(host);
            const remove = canWrite && group.members.length > 1 ? <IconButton label={t("group.removeMember", { host })} onClick={() => commands.groupRemove(group.id, [host])}><X /></IconButton> : null;
            return <ListRow key={host} faint={absent} trailing={absent ? <>{t("group.absentWord")}{remove}</> : remove}>{absent ? <span className="mono">{host}</span> : <HostLink hostname={host} />}</ListRow>;
          })}
        </List>
      </Section>
      {canWrite ? <StyleSections s={s} onStyle={(style) => commands.groupUpdate(group.id, { style })} />
        : <Section title={t("group.appearance")}><Facts rows={[[t("group.shape"), STYLE_LABEL[s.shape]], [t("group.hue"), hueLabel(s.hue)]]} /></Section>}
    </Inspector>
  );
}
