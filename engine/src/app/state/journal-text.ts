// Une entrée du journal en mots (2026-10-09) : la phrase d'une opération, l'entrée en une ligne (rafale résumée par sa
// catégorie majoritaire), le détail regroupé par verbe (« a placé 500 équipements : » puis les noms), les faits d'une
// opération en mots (position, teinte, membres…), et le surlignage de la recherche. Le journal ne garde que la valeur
// nouvelle : on écrit « a placé », jamais « de A vers B ». Pur, testé sous Node.
// Les mots viennent du catalogue `journal` (2026-10-10, lot 5 de la langue). Une phrase s'écrit sans son auxiliaire
// (`say.pin` = « placé {{ref}} ») et le reçoit par `withAux` (« a {{phrase}} » en français, rien en anglais) : la tête
// d'une ligne a une colonne Auteur, l'auxiliaire n'y est dit qu'au lecteur d'écran (shared.tsx, `Phrase`). Un objet cité
// entre dans la phrase par `{{ref}}`, remplacé par une marque puis découpé : il reste un morceau qu'on peut montrer.
import type { ParseKeys } from "i18next";
import { t, locale } from "../../i18n";
import { TYPE_SHORT_LABEL } from "../../canvas/format";
import { hueLabel } from "../../canvas/hues";
import { STYLE_LABEL } from "../../canvas/groups";
import { LABEL as ANNOTATION_WORD } from "../../canvas/annotations";
import type { JournalCategory, JournalEntry, JournalOp, JournalSubject } from "./journal";

/** Un morceau de phrase : du texte, ou un objet cité (équipement, groupe, annotation, connecteur) qu'on peut montrer. */
export type RefKind = "node" | "group" | "annotation" | "connector";
export type Piece = string | { ref: RefKind; id: string; text: string };
/** `verb` : la phrase commence par un verbe (auxiliaire compris), que la tête de ligne marque ; `destroy` : elle
 *  retire quelque chose (verbe en rouge dans le fil). */
export interface Sentence { pieces: Piece[]; category: JournalCategory; verb?: boolean; destroy?: boolean }
/** Un fait d'une opération : un libellé, une valeur en mots, ou une liste (des membres, des équipements). */
export interface Fact { label: string; value: string; list?: string[] }
/** Un bloc du détail : une phrase, et les équipements qu'elle résume (une rafale d'un même verbe). */
export interface DetailGroup { sentence: Sentence; hosts: string[] }

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): string => (typeof value === "number" ? String(value).replace("-", "−") : "");
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
const given = (value: unknown): boolean => value !== null && value !== undefined;
const TYPE_LABEL = (type: string): string => TYPE_SHORT_LABEL[type] || type;
/** Une clé du catalogue `journal`, vérifiée par `tsc` (revue de l'interface bilingue, B8) ; une clé composée
 *  (`"style." + k`) passe par `dyn`, toujours derrière un ensemble fermé. */
type JournalKey = ParseKeys<"journal">;
const dyn = (key: string): JournalKey => key as JournalKey;
const tx = (key: JournalKey, values?: Record<string, unknown>): string => t(("journal:" + key) as never, values as never) as unknown as string;
/** L'auxiliaire seul (« a » en français, rien en anglais) : ce que la tête de ligne retire du verbe affiché. */
export const auxiliary = (): string => tx("withAux", { phrase: "" });

export function categoryOf(op: string): JournalCategory {
  if (op === "pin" || op === "unpin") return "positions";
  if (op === "color" || op === "uncolor" || op === "color_type" || op === "uncolor_type") return "colors";
  if (op.startsWith("group_")) return "groups";
  if (op.startsWith("annotation_")) return "annotations";
  if (op.startsWith("connector_")) return "connectors";
  return "other";
}

const FIELD_KEY: Record<string, string> = {
  x: "position", y: "position", w: "size", h: "size", content: "content", style: "style", anchor: "anchor", z: "plane", locked: "lock",
  leader: "leader", label: "name", description: "description", members: "members", start: "ends", end: "ends", heads: "heads", route: "route", bend: "bend",
};
/** Ce qu'une modification change : ses clés renseignées (le journal écrit aussi les clés nulles), en mots, sans doublon. */
export function changedFields(op: JournalOp): string[] {
  const words: string[] = [];
  for (const [key, value] of Object.entries(op)) {
    if (key === "op" || key === "id" || !given(value)) continue;
    const word = FIELD_KEY[key] ? tx(dyn("field." + FIELD_KEY[key])) : key;
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
const FORMS = ["note", "shape", "table", "image"];
// Le nom d'un sujet reçu du serveur : un nom saisi ne se traduit jamais ; un connecteur sans étiquette se nomme par ses
// bouts, dont le serveur marque ceux qui n'ont pas de nom (`parts[].unnamed` : `free`, `group`, `note`…), que la page dit
// dans sa langue (revue de l'interface bilingue, B3 : la page traduisait avant par comparaison de texte, et un groupe
// nommé « point libre » devenait « free point »).
const UNNAMED_KINDS = new Set(["note", "shape", "table", "image", "annotation", "group", "connector", "free"]);
/** Le nom d'un sujet dans la langue de la page ; vide s'il n'en a pas (la phrase dit alors sa sorte). */
export function subjectLabel(s: Pick<JournalSubject, "label" | "parts">): string {
  if (s.parts && s.parts.length) return s.parts.map((p) => (p.unnamed && UNNAMED_KINDS.has(p.unnamed) ? tx(dyn("unnamedRef." + p.unnamed)) : p.text || "")).join(" → ");
  return s.label;
}
// Un sujet sans nom se dit par sa sorte, jamais par son identité (revue Impeccable du 2026-10-10 : « la forme a980-1 »
// ne parlait à personne ; l'identité reste dans l'infobulle et dans « brut »). La phrase dit déjà la sorte : « la forme
// sans titre », « la note vide ». Les mêmes mots que le serveur pour un bout de connecteur (`journal.py`, `_UNNAMED`).
const unnamed = (s: JournalSubject): string => (s.kind === "annotation" ? tx(dyn("unnamed." + (FORMS.includes(s.form) ? s.form : "annotation"))) : tx("unnamed.other"));
/** Un sujet cité : son nom d'alors, sinon sa sorte. */
const subject = (s: JournalSubject | null): Piece => (s ? { ref: s.kind, id: s.id, text: subjectLabel(s) || unnamed(s) } : "");
/** Un groupe ou une annotation cités par un ancrage ou un bout : leur nom, sinon leur sorte (le serveur les cite). */
function refName(entry: JournalEntry | undefined, ref: string): string {
  const s = entry ? entry.subjects.find((x) => x.id === ref) : undefined;
  if (!s) return ref.startsWith("g") ? tx("unnamedRef.aGroup") : ref.startsWith("a") ? tx("unnamedRef.anAnnotation") : ref;
  if (subjectLabel(s)) return s.kind === "group" ? tx("groupNamed", { label: subjectLabel(s) }) : subjectLabel(s);
  return s.kind === "group" ? tx("unnamedRef.group") : tx(dyn("unnamedRef." + (FORMS.includes(s.form) ? s.form : "annotation")));
}
/** Une phrase qui retire quelque chose : elle ressort dans le fil (verbe en rouge). */
export const destroys = (sentence: Sentence): boolean => sentence.destroy === true;
const changes = (op: JournalOp): string => { const f = changedFields(op); return f.length ? tx("fieldsSep") + f.join(tx("listSep")) : ""; };

const MARK = "\u0001";
/** La phrase d'une clé, auxiliaire compris, l'objet cité (`ref`) découpé en morceau à part. */
function phrase(key: string, values: Record<string, unknown>, ref: Piece = ""): Piece[] {
  const text = tx("withAux", { phrase: tx(dyn(key), { ...values, ref: MARK }) });
  const [before, after = ""] = text.split(MARK);
  return [before, ref, after].filter((p) => p !== "");
}

// ---- la purge (`ld journal prune`, côté serveur) : une ligne de trace, jamais une requête de la page
/** Une date de purge, en UTC (une date seule est minuit UTC : en heure locale, elle tomberait la veille). */
export function utcDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).replace(/^1 /, tx("firstDay") + " ");
  const midnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return midnight ? day : day + ", " + d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
const CATEGORY_KEYS = new Set(["positions", "colors", "groups", "annotations", "connectors", "other"]);
const categoryWord = (c: string): string => (CATEGORY_KEYS.has(c) ? tx(dyn("category." + c)).toLocaleLowerCase(locale()) : c);
const pruneCategories = (op: JournalOp): string => strings(op.categories).map(categoryWord).join(tx("listSep"));

const DELETES = new Set(["group_delete", "annotation_delete", "connector_delete"]);
const say = (op: JournalOp, pieces: Piece[], verb = true): Sentence => ({ pieces, category: categoryOf(op.op), verb, destroy: DELETES.has(op.op) });
const kindKey = (s: JournalSubject | null, kind: unknown): string => { const k = str(kind) || (s ? s.form : ""); return FORMS.includes(k) ? k : "other"; };

/** Une opération en une phrase. */
export function sentenceOf(entry: JournalEntry, op: JournalOp, index: number): Sentence {
  const host = str(op.hostname), s = subjectOf(entry, op, index);
  const members = strings(op.members).length;
  switch (op.op) {
    case "pin": case "unpin": case "uncolor": return say(op, phrase("say." + op.op, {}, node(host)));
    case "color": return say(op, phrase("say.color", { hue: hueLabel(str(op.hue)) }, node(host)));
    case "color_type": return say(op, phrase("say.color_type", { type: TYPE_LABEL(str(op.type)), hue: hueLabel(str(op.hue)) }));
    case "uncolor_type": return say(op, phrase("say.uncolor_type", { type: TYPE_LABEL(str(op.type)) }));
    case "group_create": case "group_add": case "group_remove": return say(op, phrase("say." + op.op, { count: members }, subject(s)));
    case "group_update": case "connector_update": return say(op, [...phrase("say." + op.op, {}, subject(s)), changes(op)].filter((p) => p !== ""));
    case "group_delete": case "connector_create": case "connector_delete": return say(op, phrase("say." + op.op, {}, subject(s)));
    case "annotation_create": return say(op, phrase("say.annotation_create." + kindKey(null, record(op.content)?.kind), {}, subject(s)));
    case "annotation_update": return say(op, [...phrase("say.annotation_update." + kindKey(s, ""), {}, subject(s)), changes(op)].filter((p) => p !== ""));
    case "annotation_delete": return say(op, phrase("say.annotation_delete." + kindKey(s, ""), {}, subject(s)));
    case "journal_prune": {
      const cats = pruneCategories(op);
      return say(op, phrase("say.journal_prune", { count: typeof op.removed === "number" ? op.removed : 0, date: utcDay(str(op.before)), categories: cats ? " (" + cats + ")" : "" }));
    }
    default: return say(op, [tx("say.unknown", { op: op.op })], false);
  }
}

// Une rafale d'une même opération (glisser une sélection, retirer toutes les épingles) se dit en une phrase.
const BATCH = new Set(["pin", "unpin", "color", "uncolor", "group_create", "group_delete", "annotation_create", "annotation_update", "annotation_delete", "connector_create", "connector_update", "connector_delete"]);
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
  const hue = ops[0].op === "color" ? hueLabel(str(ops[0].hue)) : "";
  return say(ops[0], phrase("batch." + ops[0].op, { count: ops.length, hue }));
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
  if (!ops.length) return { pieces: [tx("say.empty")], category: "other" };
  const groups = grouped(ops);
  const main = groups.reduce((a, b) => (b.ops.length > a.ops.length ? b : a));
  const batch = main.ops.length > 1 && BATCH.has(main.ops[0].op);
  const lead = batch ? batchSentence(main.ops) : sentenceOf(entry, main.ops[0], main.first);
  const rest = ops.length - (batch ? main.ops.length : 1);
  const pieces = rest ? lead.pieces.concat(tx("andMore", { count: rest })) : lead.pieces;
  return { ...lead, pieces, category: majority(entry) };
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
const PERCENT = (v: unknown): string => t("common:punct.percent", { value: num(v) });
/** Une valeur énumérée du style dans la langue de la page (`solid`, `top_left`, `mono` : revue de l'interface bilingue, B7). */
const STYLE_WORD = (v: unknown): string => STYLE_LABEL[str(v)] || ANNOTATION_WORD[str(v)] || str(v);
const STYLE_FORMAT: Record<string, (v: unknown) => string> = {
  hue: HUE, fill_opacity: PERCENT, opacity: PERCENT, stroke_width: num, padding: num, radius: num, label_size: num, text_size: num,
};
const STYLE_KEYS = new Set(["hue", "shape", "fill_opacity", "opacity", "stroke_width", "stroke_style", "padding", "radius", "label_position", "label_placement", "label_size",
  "label_weight", "label_font", "label_color", "text_size", "text_weight", "text_font", "text_color", "text_align", "text_valign"]);
function styleText(value: unknown): string {
  const style = record(value);
  if (!style) return "";
  return Object.entries(style).filter(([, v]) => given(v)).map(([k, v]) => {
    if (!STYLE_KEYS.has(k)) return k + " " + String(v);
    return tx(dyn("style." + k)) + " " + (STYLE_FORMAT[k] || STYLE_WORD)(v);
  }).join(tx("listSep"));
}
const quoted = (text: string): string => tx("fact.quoted", { text });
const kindWord = (kind: string): string => t(("common:annotationKind." + kind) as never) as unknown as string;
function contentText(value: unknown): string {
  const c = record(value);
  if (!c) return "";
  if (c.kind === "note") { const text = str(c.text).trim().replace(/\s+/g, " "); return kindWord("note") + " " + quoted(text.length > 80 ? text.slice(0, 79) + "…" : text); }
  if (c.kind === "table") { const rows = Array.isArray(c.rows) ? c.rows : []; return tx("fact.table", { rows: rows.length, cols: Math.max(0, ...rows.map((r) => (Array.isArray(r) ? r.length : 0))) }); }
  if (c.kind === "image") return kindWord("image") + (str(c.alt) ? " " + quoted(str(c.alt)) : "");
  if (c.kind === "shape") return (STYLE_WORD(c.shape) || kindWord("shape")) + (str(c.label) ? " " + quoted(str(c.label)) : "");
  return str(c.kind);
}
const SIDES = new Set(["n", "e", "s", "w"]);
function endText(value: unknown, entry?: JournalEntry): string {
  const e = record(value);
  if (!e) return "";
  if (e.kind === "free") return tx("fact.point", { x: num(e.x), y: num(e.y) });
  const side = SIDES.has(str(e.side)) ? tx("fact.side", { side: t(("common:side." + str(e.side)) as never) }) : "";
  return (e.kind === "device" ? str(e.ref) : refName(entry, str(e.ref))) + side;
}
const ROUTES = new Set(["straight", "elbow", "curve"]), HEADS = new Set(["none", "arrow"]);
const word = (set: Set<string>, value: unknown): string => (set.has(str(value)) ? t(("common:connectorWord." + str(value)) as never) as unknown as string : str(value));

/** Les faits d'une opération : ce qu'elle a posé, en mots ; les clés nulles ne disent rien. `entry` nomme les groupes et
 *  annotations qu'elle cite (ancrage, bouts). */
export function factsOf(op: JournalOp, entry?: JournalEntry): Fact[] {
  const facts: Fact[] = [];
  const add = (label: string, value: string, list?: string[]): void => { if (value || (list && list.length)) facts.push({ label, value, list }); };
  const f = (key: string): string => tx(dyn("fact." + key));
  if (op.op === "journal_prune") {
    add(f("removed"), typeof op.removed === "number" ? String(op.removed) : "");
    if (typeof op.first_revision === "number" && typeof op.last_revision === "number") add(f("revisions"), tx("fact.revisionRange", { first: op.first_revision, last: op.last_revision }));
    add(f("before"), utcDay(str(op.before)));
    add(f("categories"), pruneCategories(op) || f("allCategories"));
    add(f("archive"), str(op.archive));
    add(f("digest"), str(op.sha256) ? "sha256 " + str(op.sha256) : "");
    return facts;
  }
  if (given(op.x) || given(op.y)) add(f("position"), num(op.x) + ", " + num(op.y));
  if (given(op.w) || given(op.h)) add(f("size"), num(op.w) + " × " + num(op.h));
  if (given(op.hue)) add(f("hue"), HUE(op.hue));
  if (given(op.type)) add(f("type"), TYPE_LABEL(str(op.type)));
  if (given(op.label)) add(f("name"), str(op.label) || f("emptyName"));
  if (str(op.description)) add(f("description"), str(op.description));
  if (given(op.members)) add(tx("fact.members", { count: strings(op.members).length }), "", strings(op.members));
  if (given(op.content)) add(f("content"), contentText(op.content));
  const anchor = record(op.anchor);
  if (anchor) add(f("anchor"), anchor.kind === "free" ? t("common:annotationWord.free") : anchor.kind === "device" ? str(anchor.ref) : refName(entry, str(anchor.ref)));
  if (given(op.start)) add(f("start"), endText(op.start, entry));
  if (given(op.end)) add(f("end"), endText(op.end, entry));
  const heads = record(op.heads);
  if (heads) add(f("heads"), word(HEADS, heads.start) + " → " + word(HEADS, heads.end));
  if (given(op.route)) add(f("route"), word(ROUTES, op.route));
  if (given(op.bend)) add(f("bend"), num(op.bend));
  if (given(op.z)) add(f("plane"), t(op.z === "back" ? "common:annotationWord.back" : "common:annotationWord.front"));
  if (given(op.locked)) add(f("lock"), f(op.locked ? "locked" : "unlocked"));
  if (given(op.leader)) add(f("leader"), f(op.leader ? "yes" : "no"));
  if (given(op.style)) add(f("style"), styleText(op.style));
  return facts;
}

/** Une session de positions en une phrase : « a placé 48 équipements », « … et désépinglé 3 ». */
export function sessionSentence(placed: number, unpinned: number): Sentence {
  const text = placed ? tx("batch.pin", { count: placed }) + (unpinned ? tx("andUnpinned", { total: unpinned }) : "") : tx("batch.unpin", { count: unpinned });
  return { pieces: [tx("withAux", { phrase: text })], category: "positions", verb: true };
}

// ---- la recherche, surlignée
/** Le texte comparable, sans la casse ni les accents, **de même longueur** que le texte (un caractère pour un : les
 *  index d'une correspondance valent dans l'original) ; le même pli que le serveur (`journal_words.fold` : revue, B1). */
export function foldText(text: string): string {
  let out = "";
  for (const ch of text) {
    const bare = ch.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
    out += bare.length === ch.length ? bare : ch.length === 1 && bare.length > 0 ? bare[0] : ch;
  }
  return out;
}
/** Le texte découpé sur les mots cherchés (sans la casse ni les accents) : `hit` = un mot trouvé. */
export function marks(text: string, words: string[]): { text: string; hit: boolean }[] {
  const wanted = words.map(foldText).filter(Boolean);
  if (!wanted.length || !text) return [{ text, hit: false }];
  const low = foldText(text), out: { text: string; hit: boolean }[] = [];
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
  const text = foldText(author + " " + textOf(s));
  return words.every((w) => text.includes(foldText(w)));
};
/** Ce qu'une recherche a trouvé hors de la phrase : le premier nom (équipement, membre, objet cité) qui contient un
 *  mot cherché, à dire sur la ligne (« trouvé : dc01-core-02 ») ; `null` si la correspondance est ailleurs (contenu). */
export function hiddenHit(entry: JournalEntry, words: string[]): string | null {
  const wanted = words.map(foldText);
  const names = entry.ops.flatMap((op) => [str(op.hostname), ...strings(op.members)]).concat(entry.subjects.map((s) => subjectLabel(s)));
  return names.find((n) => n && wanted.some((w) => foldText(n).includes(w))) || null;
}
/** Le premier objet cité par une entrée (ce que « o » ouvre au clavier). */
export function firstRef(entry: JournalEntry): Exclude<Piece, string> | null {
  for (let i = 0; i < entry.ops.length; i++) {
    const piece = sentenceOf(entry, entry.ops[i], i).pieces.find((p): p is Exclude<Piece, string> => typeof p !== "string");
    if (piece) return piece;
  }
  return null;
}
