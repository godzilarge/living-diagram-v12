// Une entrée du journal en mots (2026-10-09) : la phrase d'une opération, l'entrée en une ligne (rafale résumée par sa
// catégorie majoritaire), le détail regroupé par verbe (« a placé 500 équipements : » puis les noms), les faits d'une
// opération en mots (position, teinte, membres…), et le surlignage de la recherche. Le journal ne garde que la valeur
// nouvelle : on écrit « a placé », jamais « de A vers B ». Pur, testé sous Node.
import { TYPE_SHORT_LABEL } from "../../canvas/format";
import { hueLabel } from "../../canvas/hues";
import type { JournalCategory, JournalEntry, JournalOp, JournalSubject } from "./journal";

/** Un morceau de phrase : du texte, ou un objet cité (équipement, groupe, annotation, connecteur) qu'on peut montrer. */
export type RefKind = "node" | "group" | "annotation" | "connector";
export type Piece = string | { ref: RefKind; id: string; text: string };
export interface Sentence { pieces: Piece[]; category: JournalCategory }
/** Un fait d'une opération : un libellé, une valeur en mots, ou une liste (des membres, des équipements). */
export interface Fact { label: string; value: string; list?: string[] }
/** Un bloc du détail : une phrase, et les équipements qu'elle résume (une rafale d'un même verbe). */
export interface DetailGroup { sentence: Sentence; hosts: string[] }

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): string => (typeof value === "number" ? String(value).replace("-", "−") : "");
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
const given = (value: unknown): boolean => value !== null && value !== undefined;
export const count = (n: number, word: string, words?: string): string => n + " " + (n > 1 ? words || word + "s" : word);
const TYPE_LABEL = (type: string): string => TYPE_SHORT_LABEL[type] || type;

export function categoryOf(op: string): JournalCategory {
  if (op === "pin" || op === "unpin") return "positions";
  if (op === "color" || op === "uncolor" || op === "color_type" || op === "uncolor_type") return "colors";
  if (op.startsWith("group_")) return "groups";
  if (op.startsWith("annotation_")) return "annotations";
  if (op.startsWith("connector_")) return "connectors";
  return "other";
}

const KIND_WORD: Record<string, string> = { note: "une note", shape: "une forme", table: "un tableau", image: "une image" };
// l'annotation nommée par sa sorte : « a modifié le tableau VLAN · NAME », « a supprimé la note Salle B »
const THE_KIND: Record<string, string> = { note: "la note ", shape: "la forme ", table: "le tableau ", image: "l'image " };
const theAnnotation = (s: JournalSubject | null): string => (s && THE_KIND[s.form]) || "l'annotation ";
const FIELD_WORD: Record<string, string> = {
  x: "position", y: "position", w: "taille", h: "taille", content: "contenu", style: "style", anchor: "ancrage", z: "plan", locked: "verrou",
  leader: "ligne de rappel", label: "nom", description: "description", members: "membres", start: "bouts", end: "bouts", heads: "pointes", route: "tracé", bend: "courbure",
};
/** Ce qu'une modification change : ses clés renseignées (le journal écrit aussi les clés nulles), en mots, sans doublon. */
export function changedFields(op: JournalOp): string[] {
  const words: string[] = [];
  for (const [key, value] of Object.entries(op)) {
    if (key === "op" || key === "id" || !given(value)) continue;
    const word = FIELD_WORD[key] || key;
    if (!words.includes(word)) words.push(word);
  }
  return words;
}

function subjectOf(entry: JournalEntry, op: JournalOp, index: number): JournalSubject | null {
  let id = str(op.id);
  if (!id && op.op.endsWith("_create")) {
    const rank = entry.ops.slice(0, index + 1).filter((o) => o.op === op.op).length;
    id = op.op[0] + entry.revision + "-" + rank;
  }
  if (!id) return null;
  const kind = op.op.startsWith("group") ? "group" : op.op.startsWith("annotation") ? "annotation" : "connector";
  return entry.subjects.find((s) => s.id === id) || { id, kind, label: "", form: "" };
}
const node = (host: string): Piece => ({ ref: "node", id: host, text: host });
/** Un sujet cité : son nom d'alors, sinon son identité (la phrase dit déjà sa sorte). */
const subject = (s: JournalSubject | null): Piece => (s ? { ref: s.kind, id: s.id, text: s.label || s.id } : "");
const changes = (op: JournalOp): string => { const f = changedFields(op); return f.length ? " : " + f.join(", ") : ""; };

// ---- la purge (`ld journal prune`, côté serveur) : une ligne de trace, jamais une requête de la page
const CATEGORY_WORD: Record<string, string> = { positions: "positions", colors: "couleurs", groups: "groupes", annotations: "annotations", connectors: "connecteurs", other: "autres" };
/** Une date de purge, en UTC (une date seule est minuit UTC : en heure locale, elle tomberait la veille). */
export function utcDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).replace(/^1 /, "1er ");
  const midnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return midnight ? day : day + ", " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
const pruneCategories = (op: JournalOp): string => strings(op.categories).map((c) => CATEGORY_WORD[c] || c).join(", ");
function pruneText(op: JournalOp): string {
  const n = typeof op.removed === "number" ? op.removed : 0, cats = pruneCategories(op);
  return "a purgé le journal : " + count(n, "entrée") + (n > 1 ? " antérieures" : " antérieure") + " au " + utcDay(str(op.before)) + (cats ? " (" + cats + ")" : "");
}

/** Une opération en une phrase. */
export function sentenceOf(entry: JournalEntry, op: JournalOp, index: number): Sentence {
  const host = str(op.hostname), s = subjectOf(entry, op, index);
  const say = (...pieces: Piece[]): Sentence => ({ pieces: pieces.filter((p) => p !== ""), category: categoryOf(op.op) });
  switch (op.op) {
    case "pin": return say("a placé ", node(host));
    case "unpin": return say("a désépinglé ", node(host));
    case "color": return say("a coloré ", node(host), " en " + hueLabel(str(op.hue)));
    case "uncolor": return say("a rendu ", node(host), " à la couleur de son type");
    case "color_type": return say("a coloré le type " + TYPE_LABEL(str(op.type)) + " en " + hueLabel(str(op.hue)));
    case "uncolor_type": return say("a rendu le type " + TYPE_LABEL(str(op.type)) + " à sa teinte par défaut");
    case "group_create": return say("a créé le groupe ", subject(s), " (" + count(strings(op.members).length, "membre") + ")");
    case "group_update": return say("a modifié le groupe ", subject(s), changes(op));
    case "group_add": return say("a ajouté " + count(strings(op.members).length, "membre") + " au groupe ", subject(s));
    case "group_remove": return say("a retiré " + count(strings(op.members).length, "membre") + " du groupe ", subject(s));
    case "group_delete": return say("a supprimé le groupe ", subject(s));
    case "annotation_create": return say("a ajouté " + (KIND_WORD[str(record(op.content)?.kind)] || "une annotation") + " ", subject(s));
    case "annotation_update": return say("a modifié " + theAnnotation(s), subject(s), changes(op));
    case "annotation_delete": return say("a supprimé " + theAnnotation(s), subject(s));
    case "connector_create": return say("a tracé le connecteur ", subject(s));
    case "connector_update": return say("a modifié le connecteur ", subject(s), changes(op));
    case "connector_delete": return say("a supprimé le connecteur ", subject(s));
    case "journal_prune": return say(pruneText(op));
    default: return say("opération inconnue « " + op.op + " »");
  }
}

// Une rafale d'une même opération (glisser une sélection, retirer toutes les épingles) se dit en une phrase.
const BATCH: Record<string, [string, string]> = {
  pin: ["a placé ", "équipement"], unpin: ["a désépinglé ", "équipement"], color: ["a coloré ", "équipement"], uncolor: ["a rendu à la couleur de leur type ", "équipement"],
  group_create: ["a créé ", "groupe"], group_delete: ["a supprimé ", "groupe"], annotation_create: ["a ajouté ", "annotation"], annotation_update: ["a modifié ", "annotation"],
  annotation_delete: ["a supprimé ", "annotation"], connector_create: ["a tracé ", "connecteur"], connector_update: ["a modifié ", "connecteur"], connector_delete: ["a supprimé ", "connecteur"],
};
const HOST_OPS = new Set(["pin", "unpin", "color", "uncolor"]);
// une rafale de `color` se regroupe par teinte : « a coloré 4 équipements en rouge : »
const groupKey = (op: JournalOp): string => op.op + (op.op === "color" ? ":" + str(op.hue) : "");

/** Les opérations regroupées par clé, dans l'ordre de première apparition. */
function grouped(ops: JournalOp[]): { key: string; ops: JournalOp[]; first: number }[] {
  const out: { key: string; ops: JournalOp[]; first: number }[] = [];
  ops.forEach((op, i) => {
    const key = groupKey(op), found = out.find((g) => g.key === key);
    if (found) found.ops.push(op); else out.push({ key, ops: [op], first: i });
  });
  return out;
}
function batchSentence(ops: JournalOp[]): Sentence {
  const [verb, word] = BATCH[ops[0].op];
  const hue = ops[0].op === "color" ? " en " + hueLabel(str(ops[0].hue)) : "";
  return { pieces: [verb + count(ops.length, word) + hue], category: categoryOf(ops[0].op) };
}

/** La catégorie qui porte l'entrée : la plus fréquente parmi ses opérations (à égalité, la première rencontrée). */
export function majority(entry: JournalEntry): JournalCategory {
  const counts = new Map<JournalCategory, number>();
  entry.ops.forEach((op) => { const c = categoryOf(op.op); counts.set(c, (counts.get(c) || 0) + 1); });
  let best: JournalCategory = "other", n = 0;
  counts.forEach((v, c) => { if (v > n) { best = c; n = v; } });
  return best;
}

/** L'entrée en une ligne : la phrase de son opération, une rafale résumée, ou le groupe le plus nombreux et le compte
 *  du reste ; la catégorie est celle de la majorité des opérations. */
export function headline(entry: JournalEntry): Sentence {
  const ops = entry.ops;
  if (!ops.length) return { pieces: ["requête sans opération"], category: "other" };
  const groups = grouped(ops);
  const main = groups.reduce((a, b) => (b.ops.length > a.ops.length ? b : a));
  const lead = main.ops.length > 1 && BATCH[main.ops[0].op] ? batchSentence(main.ops) : sentenceOf(entry, main.ops[0], main.first);
  const rest = ops.length - (main.ops.length > 1 && BATCH[main.ops[0].op] ? main.ops.length : 1);
  const pieces = rest ? lead.pieces.concat(" et " + count(rest, "autre modification", "autres modifications")) : lead.pieces;
  return { pieces, category: majority(entry) };
}

/** Le détail d'une entrée de plusieurs opérations : une phrase par groupe d'un même verbe sur des équipements (avec
 *  les noms, dédoublonnés), une phrase par autre opération ; `max` phrases au plus. */
export function detailGroups(entry: JournalEntry, max = 50): DetailGroup[] {
  const out: DetailGroup[] = [];
  const done = new Set<string>();
  entry.ops.forEach((op, i) => {
    if (out.length >= max) return;
    if (HOST_OPS.has(op.op)) {
      const key = groupKey(op);
      if (done.has(key)) return;
      done.add(key);
      const same = entry.ops.filter((o) => groupKey(o) === key);
      const hosts = Array.from(new Set(same.map((o) => str(o.hostname)).filter(Boolean)));
      out.push(same.length > 1 ? { sentence: batchSentence(same), hosts } : { sentence: sentenceOf(entry, op, i), hosts: [] });
      return;
    }
    out.push({ sentence: sentenceOf(entry, op, i), hosts: [] });
  });
  return out;
}

// ---- les faits d'une opération, en mots (le détail d'une entrée d'une seule opération)
const HUE = (v: unknown): string => hueLabel(str(v));
const STYLE_WORD: Record<string, [string, (v: unknown) => string]> = {
  hue: ["teinte", HUE], shape: ["forme", str], fill_opacity: ["remplissage", (v) => num(v) + " %"], opacity: ["opacité", (v) => num(v) + " %"],
  stroke_width: ["trait", num], stroke_style: ["bordure", str], padding: ["marge", num], radius: ["coins", num], label_position: ["étiquette", str],
  label_placement: ["étiquette", str], label_size: ["taille du texte", num], label_weight: ["graisse", str], label_font: ["police", str],
  label_color: ["couleur du texte", str], text_size: ["taille du texte", num], text_weight: ["graisse", str], text_font: ["police", str],
  text_color: ["couleur du texte", str], text_align: ["alignement", str], text_valign: ["alignement vertical", str],
};
function styleText(value: unknown): string {
  const style = record(value);
  if (!style) return "";
  return Object.entries(style).filter(([, v]) => given(v)).map(([k, v]) => {
    const [label, fmt] = STYLE_WORD[k] || [k, (x: unknown) => String(x)];
    return label + " " + fmt(v);
  }).join(", ");
}
function contentText(value: unknown): string {
  const c = record(value);
  if (!c) return "";
  if (c.kind === "note") { const text = str(c.text).trim().replace(/\s+/g, " "); return "note « " + (text.length > 80 ? text.slice(0, 79) + "…" : text) + " »"; }
  if (c.kind === "table") { const rows = Array.isArray(c.rows) ? c.rows : []; return "tableau " + rows.length + " × " + Math.max(0, ...rows.map((r) => (Array.isArray(r) ? r.length : 0))); }
  if (c.kind === "image") return "image" + (str(c.alt) ? " « " + str(c.alt) + " »" : "");
  if (c.kind === "shape") return (str(c.shape) || "forme") + (str(c.label) ? " « " + str(c.label) + " »" : "");
  return str(c.kind);
}
const SIDE: Record<string, string> = { n: "haut", e: "droite", s: "bas", w: "gauche" };
function endText(value: unknown): string {
  const e = record(value);
  if (!e) return "";
  if (e.kind === "free") return "point (" + num(e.x) + ", " + num(e.y) + ")";
  const side = SIDE[str(e.side)];
  return str(e.ref) + (side ? ", côté " + side : "");
}
const ROUTE: Record<string, string> = { straight: "droit", elbow: "coudé", curve: "courbe" };
const HEAD: Record<string, string> = { none: "aucune", arrow: "flèche" };

/** Les faits d'une opération : ce qu'elle a posé, en mots ; les clés nulles ne disent rien. */
export function factsOf(op: JournalOp): Fact[] {
  const facts: Fact[] = [];
  const add = (label: string, value: string, list?: string[]): void => { if (value || (list && list.length)) facts.push({ label, value, list }); };
  if (op.op === "journal_prune") {
    add("retirées", typeof op.removed === "number" ? String(op.removed) : "");
    if (typeof op.first_revision === "number" && typeof op.last_revision === "number") add("révisions", "r" + op.first_revision + " à r" + op.last_revision);
    add("avant le", utcDay(str(op.before)));
    add("catégories", pruneCategories(op) || "toutes");
    add("archive", str(op.archive));
    add("empreinte", str(op.sha256) ? "sha256 " + str(op.sha256) : "");
    return facts;
  }
  if (given(op.x) || given(op.y)) add("position", num(op.x) + ", " + num(op.y));
  if (given(op.w) || given(op.h)) add("taille", num(op.w) + " × " + num(op.h));
  if (given(op.hue)) add("teinte", HUE(op.hue));
  if (given(op.type)) add("type", TYPE_LABEL(str(op.type)));
  if (given(op.label)) add("nom", str(op.label) || "(vide)");
  if (str(op.description)) add("description", str(op.description));
  if (given(op.members)) add(count(strings(op.members).length, "membre"), "", strings(op.members));
  if (given(op.content)) add("contenu", contentText(op.content));
  const anchor = record(op.anchor);
  if (anchor) add("ancrage", anchor.kind === "free" ? "libre" : str(anchor.ref));
  if (given(op.start)) add("départ", endText(op.start));
  if (given(op.end)) add("arrivée", endText(op.end));
  const heads = record(op.heads);
  if (heads) add("pointes", (HEAD[str(heads.start)] || str(heads.start)) + " → " + (HEAD[str(heads.end)] || str(heads.end)));
  if (given(op.route)) add("tracé", ROUTE[str(op.route)] || str(op.route));
  if (given(op.bend)) add("courbure", num(op.bend));
  if (given(op.z)) add("plan", op.z === "back" ? "dessous" : "dessus");
  if (given(op.locked)) add("verrou", op.locked ? "verrouillé" : "déverrouillé");
  if (given(op.leader)) add("ligne de rappel", op.leader ? "oui" : "non");
  if (given(op.style)) add("style", styleText(op.style));
  return facts;
}

// ---- la recherche, surlignée
/** Le texte découpé sur les mots cherchés (sans la casse) : `hit` = un mot trouvé. */
export function marks(text: string, words: string[]): { text: string; hit: boolean }[] {
  const wanted = words.map((w) => w.toLocaleLowerCase("fr")).filter(Boolean);
  if (!wanted.length || !text) return [{ text, hit: false }];
  const low = text.toLocaleLowerCase("fr"), out: { text: string; hit: boolean }[] = [];
  let at = 0;
  while (at < text.length) {
    let best = -1, len = 0;
    for (const w of wanted) { const i = low.indexOf(w, at); if (i >= 0 && (best < 0 || i < best || (i === best && w.length > len))) { best = i; len = w.length; } }
    if (best < 0) { out.push({ text: text.slice(at), hit: false }); break; }
    if (best > at) out.push({ text: text.slice(at, best), hit: false });
    out.push({ text: text.slice(best, best + len), hit: true });
    at = best + len;
  }
  return out;
}
export const textOf = (s: Sentence): string => s.pieces.map((p) => (typeof p === "string" ? p : p.text)).join("");
/** Vrai si chaque mot cherché se lit dans la phrase : sinon, la correspondance est dans le détail, et la ligne le dit. */
export const visibleMatch = (s: Sentence, author: string, words: string[]): boolean => {
  const text = (author + " " + textOf(s)).toLocaleLowerCase("fr");
  return words.every((w) => text.includes(w.toLocaleLowerCase("fr")));
};
/** Ce qu'une recherche a trouvé hors de la phrase : le premier nom (équipement, membre, objet cité) qui contient un
 *  mot cherché, à dire sur la ligne (« trouvé : dc01-core-02 ») ; `null` si la correspondance est ailleurs (contenu). */
export function hiddenHit(entry: JournalEntry, words: string[]): string | null {
  const wanted = words.map((w) => w.toLocaleLowerCase("fr"));
  const names = entry.ops.flatMap((op) => [str(op.hostname), ...strings(op.members)]).concat(entry.subjects.map((s) => s.label));
  return names.find((n) => n && wanted.some((w) => n.toLocaleLowerCase("fr").includes(w))) || null;
}
/** Le premier objet cité par une entrée (ce que « o » ouvre au clavier). */
export function firstRef(entry: JournalEntry): Exclude<Piece, string> | null {
  for (let i = 0; i < entry.ops.length; i++) {
    const piece = sentenceOf(entry, entry.ops[i], i).pieces.find((p): p is Exclude<Piece, string> => typeof p !== "string");
    if (piece) return piece;
  }
  return null;
}
