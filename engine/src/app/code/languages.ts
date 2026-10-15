// Les langages d'un bloc de code (lot 16 de docs/11), la partie pure : la liste du contrat (`CodeLanguage`, Intent
// 1.6.0), la grammaire Prism de chacun, la normalisation d'un texte collé et la détection du langage (un score par
// langage, le meilleur s'il se détache), reprises du prototype validé (`bac-a-sable/lot-16/`). Les noms
// affichés viennent des catalogues (`common:codeLanguage`). Sans DOM, testé sous Node (`LDApp.code`).
import { labelMap } from "../../i18n/core";
import type { CodeContent } from "../../contracts/intent";

/** Les langages, dans l'ordre de la liste : le code d'abord, puis la configuration réseau. */
export const LANGUAGES = [
  { id: "plain", prism: null, network: false },
  { id: "python", prism: "python", network: false },
  { id: "bash", prism: "bash", network: false },
  { id: "json", prism: "json", network: false },
  { id: "yaml", prism: "yaml", network: false },
  { id: "cisco_ios", prism: "cisco", network: true },
  { id: "fortios", prism: "fortios", network: true },
] as const;
export type LanguageId = (typeof LANGUAGES)[number]["id"];
export const LANGUAGE_IDS: readonly LanguageId[] = LANGUAGES.map((l) => l.id);
export const prismNameOf = (id: string): string | null => (LANGUAGES.find((l) => l.id === id) || { prism: null }).prism;
/** Le nom d'un langage (« Cisco IOS / NX-OS », « Texte brut ») et sa forme de pastille (« CISCO », « TEXTE »). */
export const LANGUAGE_LABEL: Record<string, string> = labelMap("common:codeLanguage", LANGUAGE_IDS);
export const LANGUAGE_SHORT: Record<string, string> = labelMap("common:codeLanguageShort", LANGUAGE_IDS);

/** Les caractères jamais admis dans un bloc : contrôles C0 (sauf la tabulation, convertie) et C1, DEL, contrôles
 *  bidirectionnels (un texte lu par des auditeurs ne doit pas pouvoir se lire autrement qu'il n'est écrit : « Trojan
 *  Source »), séparateurs de ligne et de paragraphe Unicode (revue du 2026-10-15, B4). */
const BANNED = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

/** Une ligne, tabulations en espaces à quatre colonnes et caractères interdits retirés. */
function cleanLine(line: string): string {
  let col = 0, out = "";
  for (const ch of line) {
    if (ch === "\t") { const k = 4 - (col % 4); out += " ".repeat(k); col += k; }
    else if (!BANNED.test(ch)) { out += ch; col += 1; }
  }
  return out;
}

/** Un texte qu'on écrit (déposé, tapé) : retours Windows en LF, tabulations en espaces, caractères interdits retirés ;
 *  rien d'autre (les blancs de fin restent : on est en train d'écrire). */
export const cleanTyped = (text: string): string => text.replace(/\r\n?/g, "\n").split("\n").map(cleanLine).join("\n");

/** Un texte collé ou écrit, à la forme que le contrat admet : `cleanTyped`, puis blancs de fin de ligne et lignes vides
 *  de bord retirés. */
export function normalizeCode(text: string): string {
  return cleanTyped(text).split("\n").map((line) => line.replace(/\s+$/, "")).join("\n").replace(/^\n+|\n+$/g, "");
}

export interface Detection { id: LanguageId; sure: boolean; score: number }
const CISCO_LINE = /^(?:!|interface |hostname |router |ip |ipv6 |vlan |line |snmp-server |username |spanning-tree |aaa |service |logging |ntp |feature |vpc |banner |enable |boot |version |crypto |access-list |show |\s+(?:switchport|ip address|description|shutdown|no |channel-group|spanning-tree|vpc|standby|ip helper))/;
const PYTHON_LINE = /^\s*(?:def |class |import |from \S+ import |return\b|if .*:$|for .*:$|elif |else:|try:|except|with .*:$|print\(|@\w)/;
// Bash : des marqueurs sûrs (mots du langage, commandes courantes, un tube vers un filtre connu) ; un tube ou un `&&`
// quelconque ne compte que pour un peu (un tableau texte à `|` n'est pas du Bash : revue du 2026-10-15, M4).
const BASH_LINE = /^\s*(?:#!.*sh|export |if \[|fi$|then$|do$|done$|for \w+ in|while |case |esac|echo |set -|local |\w+=\S|.*\$\{?\w|(?:sudo|ssh|scp|curl|wget|cd|ls|cat|grep|awk|sed|chmod|chown|mkdir|rm|cp|mv|systemctl|git|docker|kubectl|ansible(?:-playbook)?|python3?|pip3?) |.*\|\s*(?:e?grep|awk|sed|sort|uniq|wc|head|tail|cut|tr|xargs|tee|less|more|jq|column)\b)/;
const BASH_WEAK = /\|\s*\w|&&/;

/** Le langage d'un texte : un score par langage (la part des lignes qui lui ressemblent), le meilleur s'il dépasse
 *  0,2 ; `sure` quand il dépasse 0,45 et se détache du second de 0,15. */
export function detectLanguage(text: string): Detection {
  const lines = text.split("\n").filter((l) => l.trim()), n = Math.max(1, lines.length);
  const ratio = (re: RegExp): number => lines.filter((l) => re.test(l)).length / n;
  const s: Record<string, number> = { plain: 0.05 };
  const t = text.trim();
  if (/^[{[]/.test(t)) { try { JSON.parse(t); s.json = 1; } catch (error) { s.json = 0.4; } }
  s.fortios = ratio(/^\s*(?:config|edit|set|unset|next|end)\b/) * (/^\s*config\s+\S/m.test(text) ? 1 : 0.5);
  s.cisco_ios = ratio(CISCO_LINE) * 1.1;
  s.python = ratio(PYTHON_LINE) * 1.3 + (/\bself\.|__name__/.test(text) ? 0.2 : 0);
  s.bash = ratio(BASH_LINE) * 1.1 + lines.filter((l) => !BASH_LINE.test(l) && BASH_WEAK.test(l)).length / n * 0.3 + (/^#!.*\b(?:ba|z|)sh\b/.test(t) ? 0.5 : 0);
  s.yaml = ratio(/^\s*(?:- |[\w.-]+:(?:\s|$)|---$)/) * (/^\s*[\w.-]+:\s/m.test(text) ? 1 : 0.3);
  const ranked = Object.entries(s).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [best, top] = ranked[0], second = ranked[1] ? ranked[1][1] : 0;
  return { id: (top < 0.2 ? "plain" : best) as LanguageId, sure: top >= 0.45 && top - second >= 0.15, score: Math.round(top * 100) / 100 };
}

/** Un texte collé devient-il un bloc de code ? Trois lignes au moins et un langage reconnu **sûr** (réponse d'Orhan,
 *  question 2 du prototype ; « sûr » depuis la revue du 2026-10-15, M4 : une liste à puces ou un tableau texte restent
 *  des notes) ; sinon une note, comme avant. */
export function pastedAsCode(text: string): Detection | null {
  const normal = normalizeCode(text);
  if (normal.split("\n").length < 3) return null;
  const found = detectLanguage(normal);
  return found.id === "plain" || !found.sure ? null : found;
}

/** Ce que devient un texte collé. Ctrl+V : un bloc de code si `pastedAsCode` le dit (langage sûr) ou s'il porte une
 *  valeur sensible (l'avertissement doit passer, une note n'en a pas), avec le langage détecté ; sinon une note.
 *  « Coller comme bloc de code » (Ctrl+Maj+V, menu du fond ; Orhan, 2026-10-15) : toujours un bloc, avec le langage
 *  détecté même non sûr, sinon texte brut. Un texte vide n'est rien. */
export function pasteChoice(text: string, options: { secret: boolean; force: boolean }): { as: "code"; language: LanguageId; sure: boolean } | { as: "note" } | { as: "nothing" } {
  const normal = normalizeCode(text);
  if (!normal.trim()) return { as: "nothing" };
  const code = pastedAsCode(normal);
  if (code) return { as: "code", language: code.id, sure: true };
  if (!options.force && !options.secret) return { as: "note" };
  const found = detectLanguage(normal);
  return { as: "code", language: found.id, sure: found.id !== "plain" && found.sure };
}

/** Le contenu d'un bloc neuf : texte brut, coloré, numéroté, JetBrains Mono, sans titre (contrat : tout s'écrit). */
export const DEFAULT_CODE_CONTENT: CodeContent = { kind: "code", text: "", language: "plain", title: "", highlight: true, line_numbers: true, font: "jetbrains_mono" };

export const languages = { LANGUAGES, LANGUAGE_IDS, DEFAULT_CODE_CONTENT, cleanTyped, normalizeCode, detectLanguage, pastedAsCode, pasteChoice, prismNameOf };
