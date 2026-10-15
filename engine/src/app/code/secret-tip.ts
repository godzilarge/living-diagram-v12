// Le rappel des valeurs sensibles gardées telles quelles (Orhan, 2026-10-15), la partie pure : ce que la bulle dit au
// survol d'une valeur (dessinée en `tk-secret`) ou du bouclier de l'en-tête d'un bloc. Sa nature (« type 7 :
// réversible », « hash »…), sa sorte et sa ligne, et qui la lit : tous ceux qui ouvrent l'infrastructure. Jamais la
// valeur elle-même. Rien n'est redemandé ni bloqué : un rappel. Des blocs de bulle (canvas/bubble.ts les dessine, comme
// pour un câble ou un équipement) ; le texte de la fiche (`secretTitle`) dit la même chose en une ligne. Sans DOM ni
// minuterie, testé sous Node (`LDApp.code`).
import type { Block, Tone } from "../../canvas/bubble";
import { t } from "../../i18n";
import type { Secret } from "./secrets";

/** Au-delà, la bulle du bouclier compte le reste (la fiche les montre toutes, dans le code). */
export const SECRET_TIP_ROWS = 6;

const kindOf = (f: Secret): string => t(("panel:code.secretKind." + f.kind) as never) as unknown as string;
const natureOf = (f: Secret): string => t(("panel:code.secretNature." + f.nature) as never) as unknown as string;
/** Un hash ne se lit pas : sans alarme ; le reste (en clair, type 7, chiffré réversible) en avertissement. */
const toneOf = (f: Secret): Tone => (f.nature === "hash" ? "muted" : "warning");

/** La bulle d'une valeur gardée : sa sorte et sa nature, sa ligne, qui la lit. */
export function secretLines(f: Secret, infrastructure: string): Block[] {
  return [
    { kind: "head", title: t("panel:code.tipKept"), icon: null, pills: [{ text: natureOf(f), tone: toneOf(f) }], sub: t("panel:code.tipWhere", { line: f.line + 1, kind: kindOf(f) }) },
    { kind: "space" },
    { kind: "note", text: t("panel:code.tipReadable", { infrastructure }), tone: "warning" },
  ];
}

/** La bulle du bouclier : toutes les valeurs gardées du bloc, une par ligne (six au plus), et qui les lit. */
export function shieldLines(found: Secret[], infrastructure: string): Block[] {
  const shown = found.slice(0, SECRET_TIP_ROWS), rest = found.length - shown.length;
  return [
    { kind: "head", title: t("panel:code.tipKeptCount", { count: found.length }), icon: null, pills: [], sub: null },
    { kind: "space" },
    ...shown.map((f): Block => ({ kind: "row", label: t("panel:code.warnLine", { line: f.line + 1 }), values: [{ text: kindOf(f) }, f.nature === "hash" ? { text: natureOf(f), muted: true } : { text: natureOf(f), tone: "warning" }] })),
    ...(rest > 0 ? [{ kind: "note", text: t("panel:code.tipMore", { count: rest }) } as Block] : []),
    { kind: "rule" },
    { kind: "note", text: t("panel:code.tipReadable", { infrastructure }), tone: "warning" },
  ];
}

/** La même chose en une ligne, pour l'infobulle de la fiche (`title`) : « mot de passe, type 7 : réversible, ligne 3 ;
 *  lisible par tous ceux qui ouvrent demo-dc ». */
export const secretTitle = (f: Secret, infrastructure: string): string =>
  t("panel:code.tipTitle", { kind: kindOf(f), nature: natureOf(f), line: f.line + 1, infrastructure });
export const shieldTitle = (found: Secret[], infrastructure: string): string =>
  t("panel:code.tipShieldTitle", { count: found.length, infrastructure });

export const secretTip = { SECRET_TIP_ROWS, secretLines, shieldLines, secretTitle, shieldTitle };
