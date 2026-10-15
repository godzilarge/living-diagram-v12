// Les valeurs sensibles d'un bloc de code (lot 16 de docs/11), la partie pure : repérées avant tout enregistrement
// (création, écriture, collage), quel que soit le langage choisi (une configuration Cisco déclarée « texte brut » est
// quand même lue). Une fois enregistré, le texte est lu par tous ceux qui ouvrent l'infrastructure et reste dans le
// journal ; la page avertit donc avant, et propose de retirer les valeurs (`<removed>`). Rien n'est envoyé ailleurs :
// la détection est ici, sur le texte local. Motifs Cisco repris de la grammaire obsidian-cisco-syntax (MIT), complétés
// pour FortiOS, Junos, les clés privées et les fichiers clé = valeur (YAML, JSON, Python, Bash). Ancrés au début de la
// ligne pour les configurations : le même mot dans une `description` n'est pas une valeur sensible. Sans DOM, testé
// sous Node (`LDApp.code`) ; les mots (nature, sorte) viennent des catalogues (`panel:code.secret`).
import { FORTIOS_SECRET_ATTRS } from "./fortios";
import { MASK } from "./tokens";
import type { Line } from "./tokens";

/** La sorte d'une valeur (clé du catalogue `panel:code.secretKind`). */
export type SecretKind = "account" | "password" | "snmp" | "ike" | "psk" | "keyString" | "aaaKey" | "ntpKey" | "fortios" | "junos" | "privateKey" | "generic";
/** Ce qu'elle est, pour décider (clé `panel:code.secretNature`) : un type 7 Cisco se déchiffre en une seconde, un hash
 *  de type 5, 8 ou 9 non. */
export type SecretNature = "hash" | "type7" | "encrypted" | "clear";
export interface Secret { line: number; start: number; end: number; kind: SecretKind; nature: SecretNature; length: number }

interface Rule { kind: SecretKind; re: RegExp; generic?: boolean }
/** Le motif avec ses indices (`d` : où commence et finit la valeur nommée `v`), posé à l'exécution (la cible ES2020 de la
 *  construction n'écrit pas ce drapeau dans un littéral). */
const rx = (re: RegExp): RegExp => new RegExp(re.source, re.flags + "d");
const RULES: Rule[] = [
  { kind: "account", re: rx(/^[ \t]*username[ \t]+\S+[ \t]+(?:.*?[ \t]+)?(?:password|secret)[ \t]+(?:\d{1,2}[ \t]+)?(?<v>\S+)/i) },
  { kind: "password", re: rx(/^[ \t]*(?:enable[ \t]+)?(?:password|secret)[ \t]+(?:\d{1,2}[ \t]+)?(?<v>\S+)/i) },
  { kind: "snmp", re: rx(/^[ \t]*snmp-server[ \t]+community[ \t]+(?<v>\S+)/i) },
  { kind: "ike", re: rx(/^[ \t]*crypto[ \t]+isakmp[ \t]+key[ \t]+(?:\d[ \t]+)?(?<v>\S+)/i) },
  { kind: "psk", re: rx(/^[ \t]*pre-shared-key[ \t]+(?:local[ \t]+|remote[ \t]+)?(?:\d[ \t]+)?(?<v>\S+)/i) },
  { kind: "keyString", re: rx(/^[ \t]*key-string[ \t]+(?:\d{1,2}[ \t]+)?(?<v>\S+)/i) },
  { kind: "aaaKey", re: rx(/^[ \t]*(?:(?:tacacs-server|radius-server)[ \t]+(?:host[ \t]+\S+[ \t]+)?)?key[ \t]+(?:0|6|7)[ \t]+(?<v>\S+)/i) },
  { kind: "ntpKey", re: rx(/^[ \t]*ntp[ \t]+authentication-key[ \t]+\d+[ \t]+\w+[ \t]+(?<v>\S+)/i) },
  { kind: "fortios", re: rx(new RegExp(`^[ \\t]*set[ \\t]+(?:${FORTIOS_SECRET_ATTRS})[ \\t]+(?:ENC[ \\t]+)?(?<v>"(?:[^"\\\\]|\\\\.)*"|\\S+)`, "i")) },
  { kind: "junos", re: rx(/(?:encrypted-password|secret|authentication-key|ascii-text)[ \t]+(?<v>"\$(?:9|1|5|6)\$[^"]*")/i) },
  { kind: "generic", generic: true, re: rx(/(?:^|[\s,{"'])["']?[\w.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|private[_-]?key|access[_-]?key)[\w.-]*["']?[ \t]*[:=][ \t]*(?<v>"[^"\n]+"|'[^'\n]+'|[^\s,#}]+)/i) },
];
// une référence (`$VAR`, `${VAR}`, `{{ vault_… }}`), un booléen, un vide : pas une valeur, pour la règle générique
const NOT_A_SECRET = /^["']?(?:\$\{?\w|\{\{|null\b|none\b|true\b|false\b|\*+["']?$|["']?$)/i;
const KEY_BEGIN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/, KEY_END = /-----END [A-Z ]*PRIVATE KEY-----/;

function natureOf(before: string, value: string): SecretNature {
  if (/\bENC[ \t]+$/.test(before)) return "encrypted";
  const type = (before.match(/\b(\d{1,2})[ \t]+$/) || [])[1];
  if (type === "7") return "type7";
  if (type === "5" || type === "8" || type === "9" || /^"?\$(?:1|5|6|8|9)\$/.test(value)) return "hash";
  return "clear";
}

/** Les valeurs sensibles d'un texte : ligne, début et fin de la valeur seule (indices dans la ligne), sorte, nature. */
export function findSecrets(text: string): Secret[] {
  const found: Secret[] = [];
  let inKey = false;
  text.split("\n").forEach((line, i) => {
    if (KEY_BEGIN.test(line)) { inKey = true; return; }
    if (inKey) {
      if (KEY_END.test(line)) inKey = false;
      else if (line.trim() && line.trim() !== MASK) found.push({ line: i, start: line.search(/\S/), end: line.length, kind: "privateKey", nature: "clear", length: line.trim().length });
      return;
    }
    const taken: [number, number][] = [];
    for (const rule of RULES) {
      const m = rule.re.exec(line) as (RegExpExecArray & { indices?: { groups?: Record<string, [number, number] | undefined> } }) | null;
      const span = m && m.indices && m.indices.groups ? m.indices.groups.v : undefined;
      if (!m || !span || !m.groups) continue;
      const [start, end] = span, value = m.groups.v;
      if (value.includes(MASK) || /^["']?["']?$/.test(value) || (rule.generic && NOT_A_SECRET.test(value))) continue;
      if (taken.some(([a, b]) => start < b && a < end)) continue;
      taken.push([start, end]);
      found.push({ line: i, start, end, kind: rule.kind, nature: natureOf(line.slice(0, start), value), length: value.replace(/^["']|["']$/g, "").length });
    }
  });
  return found.sort((a, b) => a.line - b.line || a.start - b.start);
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

export const secrets = { findSecrets, maskSecrets, maskedPreview, withSecrets };
