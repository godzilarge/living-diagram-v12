// Les valeurs sensibles d'un bloc de code (lot 16 de docs/11), la partie pure : repérées avant tout enregistrement
// (création, écriture, collage), quel que soit le langage choisi (une configuration Cisco déclarée « texte brut » est
// quand même lue). Une fois enregistré, le texte est lu par tous ceux qui ouvrent l'infrastructure et reste dans le
// journal ; la page avertit donc avant, et propose de retirer les valeurs (`<removed>`). Rien n'est envoyé ailleurs :
// la détection est ici, sur le texte local. Les motifs sont dans secret-rules.ts ; ici, la lecture ligne à ligne, avec
// ce qui demande un contexte (une clé privée sur plusieurs lignes, un bloc YAML `password: |`, la communauté SNMP de
// FortiOS) ; toutes les valeurs d'une ligne, chacune en entier (revue du 2026-10-15, H1 et H2). Sans DOM, testé sous
// Node (`LDApp.code`) ; les mots (nature, sorte) viennent des catalogues (`panel:code.secret`).
import { BLOCK_SCALAR, FORTI_COMMUNITY, FORTI_NAME, KEY_BEGIN, KEY_END, PLACEHOLDER, REFERENCE, RULES, TRIGGER } from "./secret-rules";
import type { Rule, SecretKind } from "./secret-rules";
import { MASK } from "./tokens";
import type { Line } from "./tokens";

export type { SecretKind } from "./secret-rules";
/** Ce qu'elle est, pour décider (clé `panel:code.secretNature`) : un type 7 Cisco se déchiffre en une seconde, un hash
 *  de type 5, 8 ou 9 non. */
export type SecretNature = "hash" | "type7" | "encrypted" | "clear";
export interface Secret { line: number; start: number; end: number; kind: SecretKind; nature: SecretNature; length: number }

type Spans = Record<string, [number, number] | undefined>;
/** Ce que la lecture retient d'une ligne à l'autre : dans une clé privée, dans un bloc YAML (l'indentation de sa clé),
 *  dans `config system snmp community` de FortiOS (la profondeur des `config` / `end`). */
interface Scan { inKey: boolean; block: number | null; forti: number }

function natureOf(before: string, value: string): SecretNature {
  if (/\bENC[ \t]+$/.test(before)) return "encrypted";
  const type = (before.match(/\b(\d{1,2})[ \t]+$/) || [])[1];
  if (type === "7") return "type7";
  if (type === "5" || type === "8" || type === "9" || /^["']?\$(?:1|2[aby]?|5|6|8|9|y|argon2\w*)\$/.test(value) || /^0x[0-9a-f]+$/i.test(value)) return "hash";
  return "clear";
}
const indentOf = (line: string): number => line.length - line.trimStart().length;
const unquoted = (value: string): string => value.replace(/^["']|["']$/g, "");
const wholeLine = (line: string, i: number, kind: SecretKind): Secret => ({ line: i, start: indentOf(line), end: line.trimEnd().length, kind, nature: "clear", length: line.trim().length });

/** Les valeurs d'un motif sur une ligne (toutes ses occurrences, toutes ses valeurs nommées), hors références et
 *  gabarits ; `block` : la clé d'un bloc YAML a été vue (la valeur est dessous). */
function ruleSecrets(line: string, i: number, rule: Rule, onBlock: () => void): Secret[] {
  const out: Secret[] = [];
  for (const m of line.matchAll(rule.re) as IterableIterator<RegExpMatchArray & { indices?: { groups?: Spans } }>) {
    const groups = m.indices && m.indices.groups ? m.indices.groups : {};
    for (const [name, span] of Object.entries(groups)) {
      if (!name.startsWith("v") || !span) continue;
      const [start, end] = span, value = line.slice(start, end);
      if (rule.generic && BLOCK_SCALAR.test(value)) { onBlock(); continue; }
      if (value.includes(MASK) || PLACEHOLDER.test(value) || (rule.shell && REFERENCE.test(value))) continue;
      out.push({ line: i, start, end, kind: rule.kind, nature: natureOf(line.slice(0, start), value), length: unquoted(value).length });
    }
  }
  return out;
}

/** Les valeurs d'une ligne qui demandent un contexte ; `null` : la ligne se lit avec les motifs. */
function contextSecrets(line: string, i: number, scan: Scan): Secret[] | null {
  if (KEY_BEGIN.test(line)) { scan.inKey = true; return []; }
  if (scan.inKey) {
    if (KEY_END.test(line)) scan.inKey = false;
    return line.trim() && line.trim() !== MASK && !KEY_END.test(line) ? [wholeLine(line, i, "privateKey")] : [];
  }
  if (scan.block !== null) {
    if (!line.trim()) return [];
    if (indentOf(line) > scan.block) return line.trim() === MASK ? [] : [wholeLine(line, i, "generic")];
    scan.block = null;
  }
  if (FORTI_COMMUNITY.test(line)) { scan.forti = 1; return []; }
  if (scan.forti) {
    if (/^\s*config\b/i.test(line)) scan.forti += 1;
    else if (/^\s*end\b/i.test(line)) scan.forti -= 1;
    const m = scan.forti === 1 ? (FORTI_NAME.exec(line) as (RegExpExecArray & { indices?: { groups?: Spans } }) | null) : null;
    const span = m && m.indices && m.indices.groups ? m.indices.groups.v : undefined;
    if (span && !line.slice(span[0], span[1]).includes(MASK)) return [{ line: i, start: span[0], end: span[1], kind: "snmp", nature: "clear", length: unquoted(line.slice(span[0], span[1])).length }];
  }
  return null;
}

/** Les valeurs sensibles d'un texte : ligne, début et fin de la valeur seule (indices dans la ligne), sorte, nature. */
export function findSecrets(text: string): Secret[] {
  const found: Secret[] = [];
  const scan: Scan = { inKey: false, block: null, forti: 0 };
  text.split("\n").forEach((line, i) => {
    const context = contextSecrets(line, i, scan);
    if (context) { found.push(...context); return; }
    if (!TRIGGER.test(line)) return;
    const taken: [number, number][] = [];
    for (const rule of RULES) {
      for (const f of ruleSecrets(line, i, rule, () => { scan.block = indentOf(line); })) {
        if (taken.some(([a, b]) => f.start < b && a < f.end)) continue;
        taken.push([f.start, f.end]);
        found.push(f);
      }
    }
  });
  return found.sort((a, b) => a.line - b.line || a.start - b.start);
}

/** La valeur d'un constat, sans guillemets de bord. */
export const secretValue = (text: string, f: Secret): string => unquoted((text.split("\n")[f.line] || "").slice(f.start, f.end));

/** Les valeurs d'un texte qui ne sont pas déjà dans le texte enregistré (revue du 2026-10-15, M1) : une valeur gardée
 *  telle quelle ne se redemande pas à chaque écriture du même bloc ; une nouvelle, si. Un brouillon : `saved` vide. */
export function newSecrets(text: string, saved: string, found: Secret[] = findSecrets(text)): Secret[] {
  if (!saved) return found;
  const kept = new Set(findSecrets(saved).map((f) => secretValue(saved, f)));
  return found.filter((f) => !kept.has(secretValue(text, f)));
}

/** Le texte, chaque valeur sensible remplacée par `<removed>` (les guillemets gardés : la commande reste lisible). */
export function maskSecrets(text: string, found: Secret[] = findSecrets(text)): string {
  const lines = text.split("\n");
  const byLine = new Map<number, Secret[]>();
  for (const f of found) byLine.set(f.line, (byLine.get(f.line) || []).concat(f));
  byLine.forEach((secrets, i) => {
    let line = lines[i];
    if (line === undefined) return;
    for (const f of secrets.slice().sort((a, b) => b.start - a.start)) {
      const value = line.slice(f.start, f.end), q = /^["']/.test(value) ? value[0] : "";
      line = line.slice(0, f.start) + q + MASK + q + line.slice(f.end);
    }
    lines[i] = line;
  });
  return lines.join("\n");
}

/** La ligne montrée dans l'avertissement : la valeur remplacée par des points (on ne la revoit jamais en clair). */
export const maskedPreview = (line: string, f: Secret): string => (line.slice(0, f.start) + "•".repeat(Math.min(8, Math.max(4, f.length))) + line.slice(f.end)).trim();

/** Les lignes d'un bloc, une valeur sensible gardée marquée `secret` (rouge souligné), quelle que soit la grammaire ;
 *  les segments sont coupés à ses bords. */
export function withSecrets(lines: Line[], found: Secret[]): Line[] {
  if (!found.length) return lines;
  const byLine = new Map<number, Secret[]>();
  for (const f of found) byLine.set(f.line, (byLine.get(f.line) || []).concat(f));
  return lines.map((segs, i) => {
    const spans = byLine.get(i);
    if (!spans) return segs;
    const out: Line = [];
    let at = 0;
    for (const s of segs) {
      let from = 0;
      const end = at + s.t.length;
      const cuts = spans.flatMap((f) => [f.start, f.end]).filter((x) => x > at && x < end).sort((a, b) => a - b);
      for (const cut of cuts.concat(end)) {
        const piece = s.t.slice(from, cut - at);
        if (piece) out.push({ t: piece, c: spans.some((f) => at + from >= f.start && at + from < f.end) ? "secret" : s.c });
        from = cut - at;
      }
      at = end;
    }
    return out;
  });
}

export const secrets = { findSecrets, newSecrets, secretValue, maskSecrets, maskedPreview, withSecrets };
