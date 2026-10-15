// La mise en forme du texte (lot 4 bis de docs/11), la partie pure : ce qu'un objet qui porte du texte (une note, une
// forme, un tableau, l'étiquette d'un connecteur ou d'un groupe) montre de son texte, la valeur commune d'une sélection
// (`null` = mixte, la barre écrit « — »), et l'écriture d'un changement en opérations d'intention (une par objet, une
// requête, une entrée d'annulation). Les champs du contrat (Intent 1.7.0) s'appellent `text_*` sur une annotation et un
// connecteur, `label_*` sur un groupe : ce module seul connaît la correspondance. La barre contextuelle et l'inspecteur
// le lisent (la barre n'a rien que l'inspecteur n'ait pas). Sans DOM ni React, testé sous Node (`LDApp.textFormat`).
import type { Annotation, Connector, Group, Model } from "../../canvas/types";
import type { Op } from "../../shell/apps";
import type { Multi } from "./selection";
import { clampSize, stepSize } from "./sizes";

/** Ce qui porte du texte : une note, une forme, un tableau (pas une image ni un bloc de code : le code a sa taille et
 *  sa police à lui), un connecteur, un groupe. */
export type TextItem = { kind: "annotation"; a: Annotation } | { kind: "connector"; c: Connector } | { kind: "group"; g: Group };
export const carriesText = (a: Annotation): boolean => a.content.kind === "note" || a.content.kind === "shape" || a.content.kind === "table";

/** Le texte d'un objet, dans les mots de la barre. */
export interface TextFormat { size: number; font: string; weight: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; color: string }
/** Les couleurs d'un texte : l'encre du thème, la teinte de l'objet, ou l'une des douze teintes (contrat 1.7.0). */
export const TEXT_COLORS = ["ink", "hue", "blue", "sky", "indigo", "violet", "pink", "red", "orange", "amber", "lime", "green", "teal", "slate"] as const;

/** La famille de position d'un objet : la boîte (note, forme : horizontal et vertical), le tableau (horizontal), le groupe
 *  (neuf positions, dedans ou dehors), le connecteur (place le long du tracé, et côté). */
export type PositionKind = "box" | "table" | "group" | "connector";
export const positionKindOf = (item: TextItem): PositionKind =>
  (item.kind === "annotation" ? (item.a.content.kind === "table" ? "table" : "box") : item.kind);

/** Le texte d'un style : celui d'un groupe (`label_*`) ou d'une annotation et d'un connecteur (`text_*`). Un champ absent
 *  (un document d'avant 1.7.0 qu'un test construit à la main) se lit à son défaut. */
export function formatOfStyle(group: boolean, style: object): TextFormat {
  const s = style as Record<string, unknown>, p = group ? "label_" : "text_";
  const weight = String(s[p + "weight"] ?? "regular");
  return { size: Number(s[p + "size"]), font: String(s[p + "font"] ?? "sans"), weight, bold: weight === "bold", italic: s[p + "italic"] === true,
    underline: s[p + "underline"] === true, strike: s[p + "strike"] === true, color: String(s[p + "color"] ?? "hue") };
}
export const formatOf = (item: TextItem): TextFormat => formatOfStyle(item.kind === "group", item.kind === "group" ? item.g.style : item.kind === "annotation" ? item.a.style : item.c.style);

/** La position du texte d'un objet (les champs de sa famille). */
export interface TextPosition { align?: string; valign?: string; position?: string; placement?: string; at?: number; side?: string }
export function positionOf(item: TextItem): TextPosition {
  if (item.kind === "group") return { position: item.g.style.label_position, placement: item.g.style.label_placement };
  if (item.kind === "connector") return { at: item.c.style.label_at, side: item.c.style.label_side };
  return item.a.content.kind === "table" ? { align: item.a.style.text_align } : { align: item.a.style.text_align, valign: item.a.style.text_valign };
}

/** Une valeur commune, ou `null` quand la sélection en mêle plusieurs. */
export type Mixed<T> = { [K in keyof T]: T[K] | null };
function common<T extends object>(values: T[]): Mixed<T> | null {
  if (!values.length) return null;
  const out = { ...values[0] } as Mixed<T>;
  for (const key of Object.keys(out) as (keyof T)[]) if (values.some((v) => v[key] !== values[0][key])) out[key] = null;
  return out;
}
/** Le texte commun d'une sélection : chaque champ, ou `null` s'il diffère. */
export const commonFormat = (items: TextItem[]): Mixed<TextFormat> | null => common(items.map(formatOf));
/** La famille de position d'une sélection, si elle n'en a qu'une (une note et une forme : la boîte ; avec un tableau :
 *  l'horizontal seul) ; sinon rien. */
export function commonPositionKind(items: TextItem[]): PositionKind | null {
  const kinds = new Set(items.map(positionKindOf));
  if (kinds.size === 1) return kinds.values().next().value as PositionKind;
  return kinds.size === 2 && kinds.has("box") && kinds.has("table") ? "table" : null;
}
export const commonPosition = (items: TextItem[]): Mixed<TextPosition> | null => common(items.map(positionOf));

/** Les objets d'une sélection qui portent du texte. */
export function itemsOf(model: Model, multi: Multi): TextItem[] {
  const out: TextItem[] = [];
  multi.annotations.forEach((id) => { const a = model.annotationById.get(id); if (a && carriesText(a)) out.push({ kind: "annotation", a }); });
  multi.connectors.forEach((id) => { const c = model.connectorById.get(id); if (c) out.push({ kind: "connector", c }); });
  multi.groups.forEach((id) => { const g = model.groupById.get(id); if (g) out.push({ kind: "group", g }); });
  return out;
}

/** Un changement du texte : une valeur posée, une taille d'un cran de l'échelle (`step`, Ctrl+Maj+> / <) ou de
 *  quelques pixels (`delta`, « − » et « + » d'une sélection mixte), un style basculé. `toggle` : la valeur
 *  qui suit pour toute la sélection (allumé partout s'il ne l'est pas partout, comme les traitements de texte). */
export type TextChange =
  | { size: number } | { step: 1 | -1 } | { delta: number } | { font: string } | { weight: string } | { color: string }
  | { toggle: "bold" | "italic" | "underline" | "strike" }
  | { align: string } | { valign: string } | { position: string } | { placement: string } | { at: number } | { side: string }
  | { padding: number } | { lineHeight: number };

/** La valeur que prend un style basculé sur une sélection : faux s'il est allumé partout, sinon vrai. */
export const toggledValue = (items: TextItem[], key: "bold" | "italic" | "underline" | "strike"): boolean => !items.every((item) => formatOf(item)[key]);

/** Le style d'un objet pour un changement, dans les champs du contrat de sa sorte ; `null` si rien ne change pour lui
 *  (une position d'une autre famille, une valeur déjà posée). */
export function stylePatch(item: TextItem, change: TextChange, on: boolean): Record<string, unknown> | null {
  const f = formatOf(item), group = item.kind === "group", p = group ? "label_" : "text_";
  let patch: Record<string, unknown> | null = null;
  if ("size" in change) patch = { [p + "size"]: clampSize(change.size) };
  else if ("step" in change) patch = { [p + "size"]: stepSize(f.size, change.step) };
  else if ("delta" in change) patch = { [p + "size"]: clampSize(f.size + change.delta) };
  else if ("font" in change) patch = { [p + "font"]: change.font };
  else if ("weight" in change) patch = { [p + "weight"]: change.weight };
  else if ("color" in change) patch = { [p + "color"]: change.color };
  else if ("toggle" in change) patch = change.toggle === "bold" ? { [p + "weight"]: on ? "bold" : "regular" } : { [p + change.toggle]: on };
  else patch = positionPatch(item, change);
  if (!patch) return null;
  const style = (item.kind === "annotation" ? item.a.style : item.kind === "connector" ? item.c.style : item.g.style) as unknown as Record<string, unknown>;
  return Object.entries(patch).every(([k, v]) => style[k] === v) ? null : patch;
}

function positionPatch(item: TextItem, change: TextChange): Record<string, unknown> | null {
  const kind = positionKindOf(item);
  if ("align" in change) return kind === "box" || kind === "table" ? { text_align: change.align } : null;
  if ("valign" in change) return kind === "box" ? { text_valign: change.valign } : null;
  if ("position" in change) return kind === "group" ? { label_position: change.position } : null;
  if ("placement" in change) return kind === "group" ? { label_placement: change.placement } : null;
  if ("at" in change) return kind === "connector" ? { label_at: Math.min(100, Math.max(0, Math.round(change.at))) } : null;
  if ("side" in change) return kind === "connector" ? { label_side: change.side } : null;
  if ("padding" in change) return kind === "box" ? { text_padding: Math.min(PADDING[1], Math.max(PADDING[0], Math.round(change.padding))) } : null;
  if ("lineHeight" in change) return kind === "box" ? { text_line_height: Math.min(LINE_HEIGHT[1], Math.max(LINE_HEIGHT[0], Math.round(change.lineHeight))) } : null;
  return null;
}
/** Les bornes de la marge et de l'interligne d'une note ou d'une forme (le contrat). */
export const PADDING = [0, 64] as const, LINE_HEIGHT = [100, 300] as const;
/** La marge et l'interligne communs d'une sélection de notes et de formes (la fiche les règle, pas la barre). */
export const commonBox = (items: TextItem[]): Mixed<{ padding: number; lineHeight: number }> | null =>
  (items.length && items.every((i) => positionKindOf(i) === "box") ? common(items.map((i) => { const st = (i as { a: Annotation }).a.style; return { padding: st.text_padding, lineHeight: st.text_line_height }; })) : null);

/** Les opérations d'un changement sur une sélection : une par objet qui change, rien pour les autres. */
export function textOps(items: TextItem[], change: TextChange): Op[] {
  const on = "toggle" in change ? toggledValue(items, change.toggle) : true;
  return items.flatMap((item): Op[] => {
    const style = stylePatch(item, change, on);
    if (!style) return [];
    if (item.kind === "annotation") return [{ op: "annotation_update", id: item.a.id, style } as Op];
    if (item.kind === "connector") return [{ op: "connector_update", id: item.c.id, style } as Op];
    return [{ op: "group_update", id: item.g.id, style } as Op];
  });
}

/** Les raccourcis du texte (sur la sélection, hors d'un champ) : Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Maj+X, Ctrl+Maj+> et <
 *  (une lettre lue sur la touche, sinon sa place sur le clavier). */
export function shortcutOf(key: string, code: string, ctrl: boolean, shift: boolean, alt: boolean): TextChange | null {
  if (!ctrl || alt) return null;
  if (key === ">" || key === "<") return { step: key === ">" ? 1 : -1 };
  const letter = /^[a-z]$/i.test(key) ? key.toLowerCase() : /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : "";
  if (shift) return letter === "x" ? { toggle: "strike" } : null;
  return letter === "b" ? { toggle: "bold" } : letter === "i" ? { toggle: "italic" } : letter === "u" ? { toggle: "underline" } : null;
}

/** La place de l'étiquette d'un connecteur : trois repères (début, milieu, fin), un cran de 10 % depuis les bouts. */
export const LABEL_MARKS: readonly number[] = [10, 50, 90];

export const textFormat = { TEXT_COLORS, LABEL_MARKS, carriesText, formatOf, formatOfStyle, positionOf, positionKindOf, commonFormat, commonPosition, commonPositionKind, commonBox, itemsOf, toggledValue, stylePatch, textOps, shortcutOf };
