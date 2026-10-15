// Les boutons du texte dans la barre contextuelle (lot 4 bis de docs/11), la partie pure : la taille libre (« 13 ⌄ »,
// un volet « − n + » puis la police), gras, italique, souligné, barré, la couleur du texte (l'encre, la teinte de
// l'objet ou l'une des douze), la position (alignements d'une note ou d'une forme, d'un tableau ; neuf positions dedans
// ou dehors pour un groupe ; place et côté de l'étiquette d'un connecteur). Pour un objet ou toute une sélection : une
// valeur mixte se dit « — » (la taille), « mixte » (le libellé), un état mixte (`aria-pressed="mixed"`). Ce que chaque
// bouton fait : `textChangeOf` ; la barre l'écrit par les commandes du store. Sans DOM ni React, testé sous Node.
import { t } from "../../i18n";
import type { BarButton, BarEntry } from "./floating";
import { commonFormat, commonPosition, commonPositionKind } from "./text-format";
import type { Mixed, TextChange, TextFormat, TextItem } from "./text-format";

const L = (key: string, values?: Record<string, unknown>): string => t(("shell:fbar." + key) as never, values as never) as unknown as string;
/** La valeur mixte d'une sélection, sur un bouton. */
export const MIXED = "—";
const pressedOf = (value: boolean | null): boolean | "mixed" => (value === null ? "mixed" : value);

/** Les ids des boutons du texte (la barre les exécute par `textChangeOf`). */
export const TEXT_IDS = ["text_size", "bold", "italic", "underline", "strike", "text_color", "text_position"] as const;

/** Les boutons du texte d'un objet ou d'une sélection ; rien si aucun ne porte de texte. */
export function textEntries(items: TextItem[]): BarEntry[] {
  const f = commonFormat(items);
  if (!f) return [];
  const size = f.size === null ? MIXED : String(f.size);
  const word = (key: string, value: boolean | null): string => L(key) + (value === null ? " (" + L("hueMixed") + ")" : "");
  const out: BarEntry[] = [
    { id: "text_size", label: L("textSizeOf", { value: f.size === null ? L("hueMixed") : f.size + " px" }), face: { kind: "value", icon: "textSize", text: size },
      keys: L("keyTextSize"), volet: { kind: "textSize", value: f.size, font: f.font, fonts: "text" } },
    toggle("bold", word("bold", f.bold), "bold", f.bold, "Ctrl+B"),
    toggle("italic", word("italic", f.italic), "italic", f.italic, "Ctrl+I"),
    toggle("underline", word("underline", f.underline), "underline", f.underline, "Ctrl+U"),
    toggle("strike", word("strike", f.strike), "strike", f.strike, L("keyStrike")),
    { id: "text_color", label: L("textColorOf", { value: colorWord(f.color) }), face: { kind: "icon", icon: "textColor" }, volet: { kind: "textColor", value: f.color } },
  ];
  const position = positionButton(items);
  return position ? out.concat(position) : out;
}

function toggle(id: string, label: string, icon: "bold" | "italic" | "underline" | "strike", value: boolean | null, keys: string): BarButton {
  return { id, label, face: { kind: "icon", icon }, keys, aria: keys.replace(/Ctrl/g, "Control").replace(/Maj/g, "Shift"), pressed: pressedOf(value) };
}

/** Le mot d'une couleur de texte (« encre », « teinte de l'objet », « violet », « mixte »). */
export function colorWord(color: string | null): string {
  if (color === null) return L("hueMixed");
  if (color === "ink" || color === "hue") return L("textColors." + color);
  return t(("common:hue." + color) as never) as unknown as string;
}

function positionButton(items: TextItem[]): BarButton | null {
  const kind = commonPositionKind(items), p = commonPosition(items);
  if (!kind || !p) return null;
  const volet = { kind: "textPosition" as const, position: kind, value: p };
  if (kind === "group") return { id: "text_position", label: L("labelPositionOf", { value: p.position === null ? L("hueMixed") : t(("common:groupStyle." + p.position) as never) as unknown as string }), face: { kind: "glyph", glyph: "position", value: p.position || "center" }, volet };
  if (kind === "connector") return { id: "text_position", label: L("labelPlaceOf", { value: p.at === null ? L("hueMixed") : p.at + " %" }), face: { kind: "icon", icon: "labelPlace" }, volet };
  const icon = p.align === "center" ? "alignCenter" : p.align === "right" ? "alignRight" : "alignLeft";
  return { id: "text_position", label: L("textAlignOf", { value: p.align === null ? L("hueMixed") : L("textAligns." + p.align) }), face: { kind: "icon", icon }, volet };
}

/** Ce qu'un bouton du texte fait : le changement, pour la valeur choisie dans son volet (`size:14`, `font:mono`,
 *  `color:violet`, `align:center`, `at:50`…) ; `null` pour une valeur qu'il ne connaît pas. */
export function textChangeOf(id: string, value: string | null): TextChange | null {
  if (id === "bold" || id === "italic" || id === "underline" || id === "strike") return { toggle: id };
  if (!value) return null;
  const [key, raw] = [value.slice(0, value.indexOf(":")), value.slice(value.indexOf(":") + 1)];
  if (key === "size") return { size: Number(raw) };
  if (key === "step") return { step: raw === "1" ? 1 : -1 };
  if (key === "delta") return { delta: Number(raw) };
  if (key === "font") return { font: raw };
  if (key === "color") return { color: raw };
  if (key === "at") return { at: Number(raw) };
  if (key === "align" || key === "valign" || key === "position" || key === "placement" || key === "side") return { [key]: raw } as TextChange;
  return null;
}

export type { Mixed, TextFormat };
export const textBar = { MIXED, TEXT_IDS, textEntries, textChangeOf, colorWord };
