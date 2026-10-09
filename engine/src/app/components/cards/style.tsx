// Les réglages de style que partagent les fiches d'édition (annotation, connecteur, groupe) : les options des
// énumérations avec leurs mots et leurs icônes, la rangée du trait (style et épaisseur) et les rangées du texte
// (police et taille, graisse, couleur, alignements). Deux valeurs ne partagent une rangée que si elles disent la même
// chose (le trait, la police) ; une valeur seule occupe toute la largeur : le bord droit reste droit. Les valeurs viennent des énumérations du contrat (groups.ts, annotations.ts), jamais d'une liste ici.
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart } from "lucide-react";
import type { ReactNode } from "react";
import { STYLE_LABEL } from "../../../canvas/groups";
import { NumberField, Pair, Row, Segmented, Select } from "../../ui/inspector";
import type { Option } from "../../ui/inspector";

// les alignements se lisent en icônes (le standard des éditeurs) ; le reste se dit en mots
const ICONS: Record<string, ReactNode> = {
  left: <AlignLeft />, center: <AlignCenter />, right: <AlignRight />,
  top: <AlignVerticalJustifyStart />, middle: <AlignVerticalJustifyCenter />, bottom: <AlignVerticalJustifyEnd />,
};
const WORDS: Record<string, string> = {
  ...STYLE_LABEL, none: "aucune", left: "gauche", center: "centre", right: "droite", top: "haut", middle: "milieu", bottom: "bas",
  back: "dessous", front: "dessus", straight: "droit", elbow: "coudé", curve: "courbe", free: "libre", device: "équipement", group: "groupe",
};

/** Les options d'une énumération : le mot (et l'icône quand elle existe). */
export const options = <T extends string>(values: readonly T[], words: Record<string, string> = {}): Option<T>[] =>
  values.map((value) => ({ value, label: words[value] || WORDS[value] || value, icon: ICONS[value] }));

/** Le trait d'un cadre, d'une forme ou d'un connecteur : son style, et son épaisseur à côté tant qu'il y en a un. */
export function StrokeRow({ label = "style de bordure", value, options: choices, width, bounds, onStyle, onWidth }: {
  label?: string; value: string; options: Option<string>[]; width: number; bounds: readonly [number, number]; onStyle: (value: string) => void; onWidth: (width: number) => void;
}) {
  const select = <Select label={label} value={value} options={choices} onChange={onStyle} />;
  if (value === "none") return select;
  return <Pair>{select}<NumberField label="épaisseur" value={width} min={bounds[0]} max={bounds[1]} unit="px" onCommit={onWidth} /></Pair>;
}

type TextStyle = { size: number; weight: string; font: string; color: string; align?: string; valign?: string };
type TextBounds = { size: readonly [number, number]; weights: readonly string[]; fonts: readonly string[]; colors: readonly string[]; aligns?: readonly string[]; valigns?: readonly string[] };

/** Les rangées du texte : police et sa taille, graisse, couleur, et les alignements quand la sorte en a. */
export function TextRows({ value, bounds, onChange }: { value: TextStyle; bounds: TextBounds; onChange: (patch: Partial<TextStyle>) => void }) {
  return (
    <>
      <Row label="police"><Pair>
        <Segmented label="police" value={value.font} options={options(bounds.fonts)} onPick={(font) => onChange({ font })} />
        <NumberField label="taille du texte" value={value.size} min={bounds.size[0]} max={bounds.size[1]} unit="px" onCommit={(size) => onChange({ size })} />
      </Pair></Row>
      <Row label="graisse"><Segmented label="graisse" value={value.weight} options={options(bounds.weights)} onPick={(weight) => onChange({ weight })} /></Row>
      <Row label="couleur"><Segmented label="couleur du texte" value={value.color} options={options(bounds.colors)} onPick={(color) => onChange({ color })} /></Row>
      {bounds.aligns && value.align !== undefined ? (
        <Row label="alignement">{bounds.valigns && value.valign !== undefined ? (
          <Pair>
            <Segmented label="alignement horizontal" iconOnly value={value.align} options={options(bounds.aligns)} onPick={(align) => onChange({ align })} />
            <Segmented label="alignement vertical" iconOnly value={value.valign} options={options(bounds.valigns)} onPick={(valign) => onChange({ valign })} />
          </Pair>
        ) : <Segmented label="alignement horizontal" iconOnly value={value.align} options={options(bounds.aligns)} onPick={(align) => onChange({ align })} />}</Row>
      ) : null}
    </>
  );
}
