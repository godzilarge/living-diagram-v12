// La coloration d'un bloc de code (lot 16 de docs/11), la partie pure : `Prism.tokenize` découpe le texte en un arbre
// de chaînes et de jetons (jamais de HTML) ; chaque jeton est rangé dans l'une de onze familles, qui ont chacune une
// couleur dans les deux thèmes (`styles/code.css`, contraste ≥ 4,5:1 testé). La toile dessine une famille en
// `<tspan class="tk-…">`, la fiche en `<span class="tk-…">`. Sans DOM, testé sous Node (`LDApp.code`).
import type { PrismNode, PrismToken } from "prismjs/components/prism-core";
import { Prism } from "./prism";
import { prismNameOf } from "./languages";

/** Les familles : une couleur chacune ; `secret` (une valeur sensible gardée, en rouge souligné) et `masked` (le
 *  marqueur `<removed>`, discret). */
export const FAMILIES = ["comment", "keyword", "string", "number", "function", "builtin", "property", "punct", "variable", "secret", "masked"] as const;
export type Family = (typeof FAMILIES)[number];
/** Le marqueur d'une valeur retirée : la convention de RANCID (sauvegardes de configurations), lisible par un ingénieur
 *  réseau et neutre vis-à-vis de la langue de l'interface (le texte enregistré est partagé, l'interface est bilingue). */
export const MASK = "<removed>";

// Le premier nom connu, type puis alias, décide. `for-or-select` (la variable d'une boucle Bash, alias `variable`) n'y
// est pas : il tombait dans les mots-clés (`for hote in` coloré comme `for`), son alias le range dans les variables.
const FAMILY: Record<string, Family> = {
  comment: "comment", prolog: "comment", shebang: "comment", doctype: "comment",
  keyword: "keyword", important: "keyword", rule: "keyword", atrule: "keyword", mode: "keyword", negation: "keyword", directive: "keyword",
  string: "string", char: "string", "attr-value": "string", regex: "string", "triple-quoted-string": "string", "template-string": "string", scalar: "string",
  number: "number", boolean: "number", constant: "number", null: "number", datetime: "number", "ip-address": "number", "ipv6-address": "number", "mac-address": "number", "file-descriptor": "number",
  function: "function", "function-name": "function", decorator: "function",
  builtin: "builtin", "class-name": "builtin", interface: "builtin", protocol: "builtin",
  property: "property", key: "property", "attr-name": "property", tag: "property",
  operator: "punct", punctuation: "punct",
  variable: "variable", parameter: "variable", environment: "variable", "assign-left": "variable",
  secret: "secret",
};
export function familyOf(token: Pick<PrismToken, "type" | "alias">, inherited: Family | null): Family | null {
  const names = [token.type].concat(Array.isArray(token.alias) ? token.alias : token.alias ? [token.alias] : []);
  for (const name of names) if (FAMILY[name]) return FAMILY[name];
  return inherited;
}

/** Un morceau de ligne : son texte, sa famille (`null` = l'encre du code). */
export interface Segment { t: string; c: Family | null }
export type Line = Segment[];

function runsOf(text: string, language: string, highlight: boolean): Segment[] {
  const name = prismNameOf(language);
  const grammar = highlight && name ? Prism.languages[name] : undefined;
  if (!grammar) return [{ t: text, c: null }];
  const runs: Segment[] = [];
  const walk = (node: PrismNode, family: Family | null): void => {
    if (typeof node === "string") { if (node) runs.push({ t: node, c: family }); return; }
    if (Array.isArray(node)) { node.forEach((n) => walk(n, family)); return; }
    walk(node.content, familyOf(node, family));
  };
  walk(Prism.tokenize(text, grammar), null);
  return runs;
}

/** Un nombre collé derrière une lettre ou un tiret n'est pas un nombre (`dc01-acc-01`, `core-02`) : les grammaires Cisco
 *  et YAML le colorent ; corrigé ici, une fois pour toutes les grammaires (YAML découpe aussi le tiret d'un nom en
 *  ponctuation : `dc01-core-02` redevient un seul mot). Règle du prototype validé. */
/** Le nombre au rang `i` continue-t-il un mot ? Collé à une lettre (`acc01`), ou à un tiret qui suit lui-même un mot
 *  (`acc-01`) ; un tiret seul après une espace est un signe (`= -9.0` reste un nombre). */
function glued(runs: Segment[], i: number): boolean {
  const prev = runs[i - 1].t;
  if (/[A-Za-z_]$/.test(prev)) return true;
  if (!prev.endsWith("-")) return false;
  if (prev.length > 1) return /\w-$/.test(prev);
  return i >= 2 && /\w$/.test(runs[i - 2].t);
}

function mended(runs: Segment[]): Segment[] {
  const out = runs.slice();
  const plain = (c: Family | null): Family | null => (c === "punct" ? null : c);
  for (let i = 1; i < out.length; i += 1) {
    const prev = out[i - 1], next = out[i + 1];
    if (out[i].t === "-" && out[i].c === "punct" && /\w$/.test(prev.t) && next && /^\w/.test(next.t)) out[i] = { t: "-", c: plain(prev.c) };
    else if (out[i].c === "number" && /^\d/.test(out[i].t) && glued(out, i)) out[i] = { t: out[i].t, c: plain(prev.c) };
  }
  return out;
}

/** Au-delà, une ligne se dessine sans coloration : certaines grammaires officielles (Bash `function-name`, YAML,
 *  Python) sont quadratiques sur une longue ligne sans blanc (1,2 s pour 20 000 caractères ; revue du 2026-10-15, B3).
 *  Mesuré : à 2 000, le pire cas coûte ~15 ms par ligne ; aucune ligne de configuration n'en approche. */
export const LONG_LINE = 2000;

/** Les morceaux du texte : les suites de lignes ordinaires, colorées ensemble (une chaîne sur plusieurs lignes garde sa
 *  couleur), et chaque ligne démesurée, seule, sans coloration ; séparés par leur retour à la ligne. */
function chunked(text: string, language: string, highlight: boolean): Segment[] {
  const lines = text.split("\n");
  if (!highlight || lines.every((l) => l.length <= LONG_LINE)) return runsOf(text, language, highlight);
  const pieces: { long: boolean; lines: string[] }[] = [];
  for (const line of lines) {
    const long = line.length > LONG_LINE, last = pieces[pieces.length - 1];
    if (!long && last && !last.long) last.lines.push(line); else pieces.push({ long, lines: [line] });
  }
  return pieces.flatMap((p, i) => {
    const runs: Segment[] = p.long ? [{ t: p.lines[0], c: null }] : runsOf(p.lines.join("\n"), language, true);
    return i ? [{ t: "\n", c: null } as Segment].concat(runs) : runs;
  });
}

/** Le texte en lignes de segments ; sans coloration, une seule famille nulle. Un marqueur `<removed>` se lit comme tel,
 *  quelle que soit la grammaire (et même sans coloration). */
export function codeLines(text: string, language: string, highlight: boolean): Line[] {
  const out: Line[] = [[]];
  for (const run of mended(chunked(text, language, highlight))) {
    run.t.split("\n").forEach((part, i) => {
      if (i) out.push([]);
      if (!part) return;
      part.split(MASK).forEach((piece, k) => {
        if (k) out[out.length - 1].push({ t: MASK, c: "masked" });
        if (piece) out[out.length - 1].push({ t: piece, c: run.c });
      });
    });
  }
  return out;
}

// Les lignes d'un bloc se recalculent quand son texte, son langage ou la coloration changent, jamais à chaque image
// (défilement, survol) : une entrée par bloc dessiné, la dernière gardée.
const cache = new Map<string, { key: string; lines: Line[] }>();
export function linesOf(id: string, text: string, language: string, highlight: boolean): Line[] {
  const key = language + "\u0000" + (highlight ? 1 : 0) + "\u0000" + text;
  const hit = cache.get(id);
  if (hit && hit.key === key) return hit.lines;
  const lines = codeLines(text, language, highlight);
  if (cache.size > 400) cache.clear();
  cache.set(id, { key, lines });
  return lines;
}

/** Une ligne coupée à `max` caractères (chasse fixe : la largeur se calcule) ; `clipped` si coupée (la place du
 *  repère « › » est réservée). Pas de retour à la ligne : une configuration ne se coupe pas. */
export function clipLine(segs: Line, max: number): { segs: Line; clipped: boolean } {
  const length = segs.reduce((k, s) => k + s.t.length, 0);
  if (length <= max) return { segs, clipped: false };
  const room = max - 1;
  let n = 0;
  const out: Line = [];
  for (const s of segs) {
    if (n >= room) break;
    const left = room - n;
    if (s.t.length <= left) { out.push(s); n += s.t.length; } else { out.push({ t: s.t.slice(0, left), c: s.c }); break; }
  }
  return { segs: out, clipped: true };
}

export const tokens = { FAMILIES, MASK, LONG_LINE, familyOf, codeLines, clipLine };
