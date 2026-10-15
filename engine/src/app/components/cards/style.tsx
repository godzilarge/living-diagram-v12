// Les réglages de style que partagent les fiches d'édition (annotation, connecteur, groupe, sélection) : les options des
// énumérations avec leurs mots et leurs icônes, la rangée du trait (style et épaisseur) et la section du texte (lot 4
// bis : le modèle de la barre contextuelle). Deux valeurs ne partagent une rangée que si elles disent la même
// chose (le trait, la police) ; une valeur seule occupe toute la largeur : le bord droit reste droit. Les valeurs viennent des énumérations du contrat (groups.ts, annotations.ts), jamais d'une liste ici.
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Italic, Strikethrough, Underline } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { labelMap } from "../../../i18n";
import { ALIGNS, VALIGNS } from "../../../canvas/annotations";
import { FONTS, PLACEMENTS, POSITIONS, STYLE_LABEL, WEIGHTS } from "../../../canvas/groups";
import { useStore } from "../../state/store";
import { SIZE_MAX, SIZE_MIN } from "../../state/sizes";
import { colorWord } from "../../state/text-bar";
import { LINE_HEIGHT, PADDING, TEXT_COLORS, commonBox, commonFormat, commonPosition, commonPositionKind } from "../../state/text-format";
import type { Mixed, PositionKind, TextChange, TextItem, TextPosition } from "../../state/text-format";
import { IconButton, NumberField, Pair, PositionField, Row, Section, Segmented, Select } from "../../ui/inspector";
import type { Option } from "../../ui/inspector";
import { Stepper } from "../TextVolets";

// les alignements se lisent en icônes (le standard des éditeurs) ; le reste se dit en mots
const ICONS: Record<string, ReactNode> = {
  left: <AlignLeft />, center: <AlignCenter />, right: <AlignRight />,
  top: <AlignVerticalJustifyStart />, middle: <AlignVerticalJustifyCenter />, bottom: <AlignVerticalJustifyEnd />,
};
// les mots des fiches, qui l'emportent sur ceux du style d'un groupe (« aucune » plutôt que « sans bordure »)
const WORDS = labelMap("panel:words", ["none", "left", "center", "right", "top", "middle", "bottom", "back", "front", "straight", "elbow", "curve", "free", "device", "group"]);

/** Les options d'une énumération : le mot (et l'icône quand elle existe), dans la langue de la page. */
export const options = <T extends string>(values: readonly T[], words: Record<string, string> = {}): Option<T>[] =>
  values.map((value) => ({ value, label: words[value] || WORDS[value] || STYLE_LABEL[value] || value, icon: ICONS[value] }));

/** Le trait d'un cadre, d'une forme ou d'un connecteur : son style, et son épaisseur à côté tant qu'il y en a un. */
export function StrokeRow({ label, value, options: choices, width, bounds, onStyle, onWidth }: {
  label?: string; value: string; options: Option<string>[]; width: number; bounds: readonly [number, number]; onStyle: (value: string) => void; onWidth: (width: number) => void;
}) {
  const { t } = useTranslation("panel");
  const select = <Select label={label || t("style.borderStyle")} value={value} options={choices} onChange={onStyle} />;
  if (value === "none") return select;
  return <Pair>{select}<NumberField label={t("style.thickness")} value={width} min={bounds[0]} max={bounds[1]} unit="px" onCommit={onWidth} /></Pair>;
}

/** Le texte d'un objet ou de toute une sélection (lot 4 bis de docs/11), le même modèle que la barre contextuelle
 *  (state/text-format.ts : la barre n'a rien que la fiche n'ait pas) : police et taille, graisse, italique, souligné,
 *  barré, couleur (l'encre, la teinte de l'objet, l'une des douze), la position selon la famille (alignements d'une note,
 *  d'une forme ou d'un tableau ; neuf positions dedans ou dehors pour un groupe ; place et côté de l'étiquette d'un
 *  connecteur), et pour une note ou une forme la marge et l'interligne. Une valeur mixte se dit « — ». Chaque réglage
 *  part par `textFormat` : une écriture pour toute la sélection. */
export function TextSection({ items }: { items: TextItem[] }) {
  const { commands } = useStore();
  const { t } = useTranslation(["panel", "shell"]);
  const f = commonFormat(items), p = commonPosition(items), kind = commonPositionKind(items), box = commonBox(items);
  if (!f) return null;
  const change = (c: TextChange): void => commands.textFormat(items, c);
  const mixed = "—";
  const colors = TEXT_COLORS.map((value) => ({ value, label: colorWord(value) }));
  const toggles: ["italic" | "underline" | "strike", ReactNode, string, string][] = [
    ["italic", <Italic key="i" />, t("shell:fbar.italic"), "Ctrl+I"], ["underline", <Underline key="u" />, t("shell:fbar.underline"), "Ctrl+U"],
    ["strike", <Strikethrough key="s" />, t("shell:fbar.strike"), t("shell:fbar.keyStrike")]];
  return (
    <Section title={t("annotation.textSection")} collapsible defaultOpen={false}>
      <Row label={t("style.font")}><Pair>
        <Segmented label={t("style.font")} value={(f.font ?? "") as string} options={options(FONTS)} onPick={(font) => change({ font })} />
        {f.size === null
          ? <Stepper label={t("style.textSize")} value={null} min={SIZE_MIN} max={SIZE_MAX} unit="px" onStep={(dir) => change({ delta: dir })} onSet={(size) => change({ size })} />
          : <NumberField label={t("style.textSize")} value={f.size} min={SIZE_MIN} max={SIZE_MAX} unit="px" onCommit={(size) => change({ size })} />}
      </Pair></Row>
      <Row label={t("style.weight")}><Segmented label={t("style.weight")} value={(f.weight ?? "") as string} options={options(WEIGHTS)} onPick={(weight) => change({ weight })} /></Row>
      <Row label={t("style.decoration")}><span className="insp-actions">
        {toggles.map(([key, icon, word, keys]) => <IconButton key={key} label={word + " · " + keys} pressed={f[key] === null ? "mixed" : !!f[key]} onClick={() => change({ toggle: key })}>{icon}</IconButton>)}
      </span></Row>
      <Row label={t("style.color")}><Select label={t("style.textColor")} value={f.color ?? ""} placeholder={f.color === null ? mixed : undefined} options={colors} onChange={(color) => { if (color) change({ color }); }} /></Row>
      {kind && p ? <PositionRows kind={kind} p={p} change={change} /> : null}
      {box ? (
        <>
          <Row label={t("style.textPadding")}><NumberField label={t("style.textPadding")} value={box.padding ?? 8} min={PADDING[0]} max={PADDING[1]} unit="px" onCommit={(padding) => change({ padding })} /></Row>
          <Row label={t("style.lineHeight")}><NumberField label={t("style.lineHeight")} value={box.lineHeight ?? 135} min={LINE_HEIGHT[0]} max={LINE_HEIGHT[1]} step={5} unit="%" onCommit={(lineHeight) => change({ lineHeight })} /></Row>
        </>
      ) : null}
    </Section>
  );
}

/** La position du texte, selon la famille de la sélection. */
function PositionRows({ kind, p, change }: { kind: PositionKind; p: Mixed<TextPosition>; change: (c: TextChange) => void }) {
  const { t } = useTranslation(["panel", "shell"]);
  if (kind === "group") {
    const placementWords = { inside: t("style.inside"), outside: t("style.outside") };
    return (
      <>
        <Row label={t("style.position")}><PositionField label={t("style.labelPosition")} options={POSITIONS} names={STYLE_LABEL} value={(p.position ?? "center") as typeof POSITIONS[number]} onPick={(position) => change({ position })} /></Row>
        <Row label={t("style.placement")}><Segmented label={t("style.placementLabel")} value={(p.placement ?? "") as string} options={options(PLACEMENTS, placementWords)} onPick={(placement) => change({ placement })} /></Row>
      </>
    );
  }
  if (kind === "connector") {
    const sides = { above: t("shell:fbar.sides.above"), on: t("shell:fbar.sides.on"), below: t("shell:fbar.sides.below") };
    return (
      <>
        <Row label={t("style.labelAt")}><NumberField label={t("shell:fbar.labelPlace")} value={p.at ?? 50} min={0} max={100} step={5} unit="%" onCommit={(at) => change({ at })} /></Row>
        <Row label={t("style.labelSide")}><Segmented label={t("shell:fbar.labelSide")} value={(p.side ?? "") as string} options={options(["above", "on", "below"] as const, sides)} onPick={(side) => change({ side })} /></Row>
      </>
    );
  }
  return (
    <Row label={t("style.alignment")}>{kind === "box" ? (
      <Pair>
        <Segmented label={t("style.alignH")} iconOnly value={(p.align ?? "") as string} options={options(ALIGNS)} onPick={(align) => change({ align })} />
        <Segmented label={t("style.alignV")} iconOnly value={(p.valign ?? "") as string} options={options(VALIGNS)} onPick={(valign) => change({ valign })} />
      </Pair>
    ) : <Segmented label={t("style.alignH")} iconOnly value={(p.align ?? "") as string} options={options(ALIGNS)} onPick={(align) => change({ align })} />}</Row>
  );
}
