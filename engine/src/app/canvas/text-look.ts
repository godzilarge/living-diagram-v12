// L'allure d'un texte sur la toile (lot 4 bis de docs/11), la partie pure : les classes (police, couleur) et les
// attributs de présentation SVG (graisse, italique, souligné, barré) d'une note, d'une forme, d'un tableau, de
// l'étiquette d'un connecteur ou d'un groupe. Jamais un style en ligne (CSP) : la couleur d'une teinte passe par une
// classe (`tc-<teinte>`, canvas.css), le reste par `font-weight`, `font-style` et `text-decoration`, attributs SVG. Les
// vrais italiques d'Inter et de JetBrains Mono sont embarqués (fonts.css). Sans DOM, testé sous Node.
import { WEIGHT_VALUE } from "../../canvas/groups";
import { formatOfStyle } from "../state/text-format";

export interface TextLook { className: string; fontWeight: number; fontStyle: "italic" | undefined; textDecoration: string | undefined }

/** L'allure du texte d'un style (`group` : celui d'un groupe, `label_*`) ; `base` : la classe du texte
 *  (`annotation-text`, `frame-label`), `ink` : la classe de l'encre pour cette famille (`text-ink`, `label-ink`). La
 *  teinte de l'objet (`hue`) est le défaut de la classe de base. */
export function lookOf(group: boolean, style: object, base: string, ink: string): TextLook {
  const f = formatOfStyle(group, style);
  const color = f.color === "ink" ? " " + ink : f.color === "hue" ? "" : " tc-" + f.color;
  const decoration = [f.underline ? "underline" : "", f.strike ? "line-through" : ""].filter(Boolean).join(" ");
  return {
    className: base + (f.font === "mono" ? " font-mono" : "") + color,
    fontWeight: WEIGHT_VALUE[f.weight] || 450,
    fontStyle: f.italic ? "italic" : undefined,
    textDecoration: decoration || undefined,
  };
}

export const textLook = { lookOf };
