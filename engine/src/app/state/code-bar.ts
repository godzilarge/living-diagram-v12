// La barre contextuelle d'un bloc de code (lot 16 de docs/11), la partie pure : dans la grammaire de la barre (lot 4),
// l'objet (teinte) | le code (langage et police, deux boutons à volet qui disent leur valeur ; coloration et numéros,
// deux bascules ; ajuster la hauteur, seulement si la boîte n'y est pas déjà ; taille) | plan, verrou | dupliquer,
// supprimer. Copier vit dans l'en-tête du bloc et dans la fiche, pas ici (il était à côté de dupliquer, icône presque
// identique : revue du prototype). La coloration n'existe pas sur un texte brut. Ce que chaque bouton fait : `codeRun`.
import type { Annotation } from "../../canvas/types";
import type { CodeContent } from "../../contracts/intent";
import { t } from "../../i18n";
import { CODE, CODE_FONTS, CODE_SIZES, fitHeight, lineCount } from "../code/geometry";
import { LANGUAGE_LABEL, detectLanguage } from "../code/languages";
import type { BarButton, BarEntry } from "./floating";
import type { Commands } from "./store";

const L = (key: string, values?: Record<string, unknown>): string => t(("shell:fbar." + key) as never, values as never) as unknown as string;
const FONT_SHORT: Record<string, string> = Object.fromEntries(CODE_FONTS.map((f) => [f.id, f.short]));
const FONT_FAMILY: Record<string, string> = Object.fromEntries(CODE_FONTS.map((f) => [f.id, f.family]));

/** Les boutons communs que la barre d'une annotation fabrique déjà (teinte, plan, verrou, dupliquer, supprimer). */
export interface Shared { hue: BarButton; plane: BarButton[]; lock: BarButton; dup: BarButton; del: BarButton; sep: BarEntry }

export function codeEntries(a: Annotation, c: CodeContent, shared: Shared): BarEntry[] {
  const found = detectLanguage(c.text);
  const hint = found.sure && found.id !== c.language && found.id !== "plain";
  const language = LANGUAGE_LABEL[c.language] || c.language;
  const lang: BarButton = { id: "code_language", label: hint ? L("codeLanguageHint", { value: language, detected: LANGUAGE_LABEL[found.id] }) : L("codeLanguageOf", { value: language }),
    face: { kind: "text", text: language, hint }, volet: { kind: "codeLanguage", value: c.language, text: c.text } };
  const font: BarButton = { id: "code_font", label: L("codeFontOf", { value: FONT_FAMILY[c.font] || c.font }), face: { kind: "text", text: FONT_SHORT[c.font] || c.font, font: c.font },
    volet: { kind: "codeFont", value: c.font } };
  const colored = c.language === "plain" ? [] : [{ id: "code_highlight", label: c.highlight ? L("codeHighlightOn") : L("codeHighlightOff"), face: { kind: "icon", icon: "highlighter" }, pressed: c.highlight } as BarButton];
  const numbers: BarButton = { id: "code_numbers", label: c.line_numbers ? L("codeNumbersOn") : L("codeNumbersOff"), face: { kind: "icon", icon: "listOrdered" }, pressed: c.line_numbers };
  const total = lineCount(c.text);
  const fit = a.h === fitHeight(total, a.style.text_size) ? []
    : [{ id: "code_fit", label: total > CODE.FIT_MAX ? L("codeFitMax", { max: CODE.FIT_MAX }) : L("codeFit"), face: { kind: "icon", icon: "fitHeight" } } as BarButton];
  const size: BarButton = { id: "text_size", label: L("codeSizeOf", { value: a.style.text_size }), face: { kind: "value", icon: "textSize", text: String(a.style.text_size) },
    volet: { kind: "choice", title: L("codeSize"), value: String(a.style.text_size), options: CODE_SIZES.map((px) => ({ value: String(px), label: px + " px", num: String(px) })) } };
  return [shared.hue, shared.sep, lang, font, ...colored, numbers, ...fit, size, shared.sep, ...shared.plane, shared.lock, shared.sep, shared.dup, shared.del];
}

/** Ce qu'un bouton propre au bloc de code fait ; faux pour un bouton commun (la barre le fait comme pour toute annotation). */
export function codeRun(id: string, value: string | null, a: Annotation, c: CodeContent, commands: Commands): boolean {
  if (id === "code_language" && value) commands.codeSet([a.id], { language: value as CodeContent["language"] });
  else if (id === "code_font" && value) commands.codeSet([a.id], { font: value as CodeContent["font"] });
  else if (id === "code_highlight") commands.codeSet([a.id], { highlight: !c.highlight });
  else if (id === "code_numbers") commands.codeSet([a.id], { line_numbers: !c.line_numbers });
  else if (id === "code_fit") commands.codeFit([a.id]);
  else return false;
  return true;
}
