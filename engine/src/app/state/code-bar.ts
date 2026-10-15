// La barre contextuelle d'un bloc de code (lots 16 et 16 bis de docs/11), la partie pure. Bloc sélectionné, dans la
// grammaire de la barre (lot 4) : l'objet (teinte) | le code (langage, à volet, qui dit sa valeur ; coloration, numéros
// et retour à la ligne, trois bascules ; ajuster la hauteur, seulement si la boîte n'y est pas déjà ; la taille libre,
// « 13 ⌄ », dont le volet porte « − n + » puis les quatre polices) | plan, verrou | dupliquer, supprimer. Copier vit dans
// l'en-tête du bloc et dans la fiche, pas ici. Pendant l'écriture, la même barre devient celle de l'écriture
// (`writingEntries` : chercher, retour à la ligne, taille, abandonner, enregistrer), puis celle de la recherche
// (components/WritingBar.tsx). Ce que chaque bouton fait : `codeRun`.
import type { Annotation } from "../../canvas/types";
import type { CodeContent } from "../../contracts/intent";
import { t } from "../../i18n";
import { CODE, fitHeightOf, lineCount } from "../code/geometry";
import { LANGUAGE_LABEL, detectLanguage } from "../code/languages";
import type { Writing } from "../code/writing";
import type { BarButton, BarEntry } from "./floating";
import type { Commands } from "./store";

const L = (key: string, values?: Record<string, unknown>): string => t(("shell:fbar." + key) as never, values as never) as unknown as string;
const SEP: BarEntry = { id: "sep" };

/** Les boutons communs que la barre d'une annotation fabrique déjà (teinte, plan, verrou, dupliquer, supprimer). */
export interface Shared { hue: BarButton; plane: BarButton[]; lock: BarButton; dup: BarButton; del: BarButton; sep: BarEntry }

/** La taille et la police du code, un seul bouton : « 13 ⌄ », le volet « − n + » puis les quatre polices. */
const sizeButton = (size: number, font: string): BarButton => ({ id: "text_size", label: L("codeSizeOf", { value: size }), keys: L("keyTextSize"),
  face: { kind: "value", icon: "textSize", text: String(size) }, volet: { kind: "textSize", value: size, font, fonts: "code" } });
const wrapButton = (wrap: boolean): BarButton => ({ id: "code_wrap", label: wrap ? L("codeWrapOn") : L("codeWrapOff"), face: { kind: "icon", icon: "wrap" }, pressed: wrap });

export function codeEntries(a: Annotation, c: CodeContent, shared: Shared): BarEntry[] {
  const found = detectLanguage(c.text);
  const hint = found.sure && found.id !== c.language && found.id !== "plain";
  const language = LANGUAGE_LABEL[c.language] || c.language;
  const lang: BarButton = { id: "code_language", label: hint ? L("codeLanguageHint", { value: language, detected: LANGUAGE_LABEL[found.id] }) : L("codeLanguageOf", { value: language }),
    face: { kind: "text", text: language, hint }, volet: { kind: "codeLanguage", value: c.language, text: c.text } };
  const colored = c.language === "plain" ? [] : [{ id: "code_highlight", label: c.highlight ? L("codeHighlightOn") : L("codeHighlightOff"), face: { kind: "icon", icon: "highlighter" }, pressed: c.highlight } as BarButton];
  const numbers: BarButton = { id: "code_numbers", label: c.line_numbers ? L("codeNumbersOn") : L("codeNumbersOff"), face: { kind: "icon", icon: "listOrdered" }, pressed: c.line_numbers };
  const shape = { w: a.w, size: a.style.text_size, font: c.font, numbers: c.line_numbers, text: c.text, wrap: c.wrap };
  const fit = a.h === fitHeightOf(shape) ? []
    : [{ id: "code_fit", label: lineCount(c.text) > CODE.FIT_MAX ? L("codeFitMax", { max: CODE.FIT_MAX }) : L("codeFit"), face: { kind: "icon", icon: "fitHeight" } } as BarButton];
  return [shared.hue, shared.sep, lang, ...colored, numbers, wrapButton(c.wrap), ...fit, sizeButton(a.style.text_size, c.font), shared.sep, ...shared.plane, shared.lock, shared.sep, shared.dup, shared.del];
}

/** La barre de l'écriture d'un bloc : chercher (Ctrl+F), retour à la ligne, taille et police, abandonner (deux clics
 *  s'il y a des modifications : `armed`), enregistrer. Les commandes en icônes, le mot en infobulle. */
export function writingEntries(w: Writing, armed: boolean): BarEntry[] {
  const abandon: BarButton = { id: "code_abandon", label: armed ? L("codeAbandonSure") : w.dirty ? L("codeAbandonDirty") : L("codeAbandon"), face: { kind: "icon", icon: "abandon" }, danger: true, pressed: armed ? true : undefined };
  return [
    { id: "code_search", label: L("codeSearch"), face: { kind: "icon", icon: "search" }, keys: "Ctrl+F", aria: "Control+F" },
    wrapButton(w.wrap), sizeButton(w.size, w.font), SEP, abandon,
    { id: "code_save", label: L("codeSave"), face: { kind: "icon", icon: "save" }, keys: L("keySave"), aria: "Control+Enter" },
  ];
}

/** Ce qu'un bouton propre au bloc de code fait ; faux pour un bouton commun (la barre le fait comme pour toute annotation). */
export function codeRun(id: string, value: string | null, a: Annotation, c: CodeContent, commands: Commands): boolean {
  if (id === "code_language" && value) commands.codeSet([a.id], { language: value as CodeContent["language"] });
  else if (id === "code_highlight") commands.codeSet([a.id], { highlight: !c.highlight });
  else if (id === "code_numbers") commands.codeSet([a.id], { line_numbers: !c.line_numbers });
  else if (id === "code_wrap") commands.codeSet([a.id], { wrap: !c.wrap });
  else if (id === "code_fit") commands.codeFit([a.id]);
  else if (id === "text_size" && value && value.startsWith("font:")) commands.codeSet([a.id], { font: value.slice(5) as CodeContent["font"] });
  else if (id === "text_size" && value && value.startsWith("size:")) commands.annotationUpdate(a.id, { style: { text_size: Number(value.slice(5)) } });
  else return false;
  return true;
}

export const codeBar = { codeEntries, writingEntries };
