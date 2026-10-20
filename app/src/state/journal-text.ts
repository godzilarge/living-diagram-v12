// A log entry in words (the v1's `journal-text.ts`, moved with brick 7): the sentence of an operation, the entry in
// one line (a burst summed up by its majority category), the detail grouped by verb ("placed 500 devices:" then the
// names), the facts of an operation in words (position, hue, members…), and the search's highlight. The log keeps
// the new value only: "placed", never "from A to B". Pure, tested under Node.
// The words come from the `journal` catalogue. A sentence is written without its auxiliary (`say.pin` = "placed
// {{ref}}") and receives it from `withAux` ("a {{phrase}}" in French, nothing in English): the head of a line has an
// author column, the auxiliary is said to the screen reader alone. A cited object enters the sentence as `{{ref}}`,
// replaced by a marker then split: it stays a piece one can show. The hue, type and style words are the engine's
// (its catalogue follows the page's language, `applyLanguage`).
import { t as engine } from "@engine/i18n";
import { TYPE_SHORT_LABEL } from "@engine/canvas/format";
import { hueLabel } from "@engine/canvas/hues";
import { STYLE_LABEL } from "@engine/canvas/groups";
import { LABEL as ANNOTATION_WORD } from "@engine/canvas/annotations";
import { text } from "../i18n";
import type { TextKey } from "../i18n";
import type { JournalCategory, JournalEntry, JournalOp, JournalSubject } from "../api/journal";

/** A piece of a sentence: text, or a cited object (device, group, annotation, connector) one can show. */
export type RefKind = "node" | "group" | "annotation" | "connector";
export type Ref = Readonly<{ ref: RefKind; id: string; text: string }>;
export type Piece = string | Ref;
/** `verb`: the sentence starts with a verb (auxiliary included), which the head of a line marks; `destroy`: it
 *  removes something (the verb in red in the feed). */
export type Sentence = Readonly<{ pieces: readonly Piece[]; category: JournalCategory; verb?: boolean; destroy?: boolean }>;
/** A fact of an operation: a label, a value in words, or a list (members, devices). */
export type Fact = Readonly<{ label: string; value: string; list?: readonly string[] }>;
/** A block of the detail: a sentence, and the devices it sums up (a burst of one verb). */
export type DetailGroup = Readonly<{ sentence: Sentence; hosts: readonly string[] }>;

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): string => (typeof value === "number" ? String(value).replace("-", "−") : "");
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
const given = (value: unknown): boolean => value !== null && value !== undefined;
const TYPE_LABEL = (type: string): string => TYPE_SHORT_LABEL[type] || type;
/** A key of the `journal` catalogue; a composed key (`"style." + k`) stays behind a closed set. */
const tx = (key: string, values?: Record<string, string | number>): string => text(`journal:${key}` as TextKey, values);
const common = (key: string, values?: Record<string, string | number>): string => engine(`common:${key}` as never, values as never) as unknown as string;
/** The auxiliary alone ("a" in French, nothing in English): what the head of a line takes off the verb shown. */
export const auxiliary = (): string => tx("withAux", { phrase: "" });

export function categoryOf(op: string): JournalCategory {
  if (op === "pin" || op === "unpin") return "positions";
  if (op === "color" || op === "uncolor" || op === "color_type" || op === "uncolor_type") return "colors";
  if (op.startsWith("group_")) return "groups";
  if (op.startsWith("annotation_")) return "annotations";
  if (op.startsWith("connector_")) return "connectors";
  return "other";
}

const FIELD_KEY: ReadonlyMap<string, string> = new Map([
  ["x", "position"], ["y", "position"], ["w", "size"], ["h", "size"], ["content", "content"], ["style", "style"], ["anchor", "anchor"], ["z", "plane"], ["locked", "lock"],
  ["leader", "leader"], ["label", "name"], ["description", "description"], ["members", "members"], ["start", "ends"], ["end", "ends"], ["heads", "heads"], ["route", "route"], ["bend", "bend"],
]);
/** What a modification changes: its set keys (the log writes the null keys too), in words, once each. */
export function changedFields(op: JournalOp): string[] {
  const words: string[] = [];
  for (const [key, value] of Object.entries(op)) {
    if (key === "op" || key === "id" || !given(value)) continue;
    const field = FIELD_KEY.get(key);
    const word = field ? tx(`field.${field}`) : key;
    if (!words.includes(word)) words.push(word);
  }
  return words;
}

function subjectOf(entry: JournalEntry, op: JournalOp, index: number): JournalSubject | null {
  let id = str(op.id);
  if (!id && op.op.endsWith("_create")) {
    const rank = entry.ops.slice(0, index + 1).filter((o) => o.op === op.op).length;
    id = `${op.op[0]}${entry.revision}-${rank}`;
  }
  if (!id) return null;
  const kind = op.op.startsWith("group") ? "group" : op.op.startsWith("annotation") ? "annotation" : "connector";
  return entry.subjects.find((s) => s.id === id) ?? { id, kind, label: "", form: "", unnamed: null, parts: null };
}
const node = (host: string): Piece => ({ ref: "node", id: host, text: host });
const FORMS = ["note", "shape", "table", "image", "code"];
// The name of a subject received from the server: a typed name is never translated; a connector without a label is
// named by its ends, whose unnamed ones the server marks (`parts[].unnamed`: `free`, `group`, `note`…), said in the
// page's language.
const UNNAMED_KINDS = new Set(["note", "shape", "table", "image", "code", "annotation", "group", "connector", "free"]);
/** The name of a subject in the page's language; empty when it has none (the sentence then says its kind). */
export function subjectLabel(s: Pick<JournalSubject, "label" | "parts">): string {
  if (s.parts && s.parts.length) return s.parts.map((p) => (p.unnamed && UNNAMED_KINDS.has(p.unnamed) ? tx(`unnamedRef.${p.unnamed}`) : p.text || "")).join(" → ");
  return s.label;
}
// An unnamed subject is said by its kind, never by its identity ("the shape a980-1" spoke to nobody; the identity
// stays in the tooltip and in "raw"). The sentence already says the kind: "the untitled shape", "the empty note".
const unnamed = (s: JournalSubject): string => (s.kind === "annotation" ? tx(`unnamed.${FORMS.includes(s.form) ? s.form : "annotation"}`) : tx("unnamed.other"));
/** A named group or annotation is set in quotes (DESIGN.md, the Log view); a device, a connector or a subject said by
 *  its kind is not. */
export const quotedName = (kind: RefKind, name: string): string => (name && (kind === "group" || kind === "annotation") ? tx("fact.quoted", { text: name }) : name);
/** A cited subject: its name of then (quoted for a group or an annotation), else its kind. */
const subject = (s: JournalSubject | null): Piece => (s ? { ref: s.kind, id: s.id, text: quotedName(s.kind, subjectLabel(s)) || unnamed(s) } : "");
/** A group or an annotation cited by an anchor or an end: their name, else their kind (the server cites them). */
function refName(entry: JournalEntry | undefined, ref: string): string {
  const s = entry ? entry.subjects.find((x) => x.id === ref) : undefined;
  if (!s) return ref.startsWith("g") ? tx("unnamedRef.aGroup") : ref.startsWith("a") ? tx("unnamedRef.anAnnotation") : ref;
  if (subjectLabel(s)) return s.kind === "group" ? tx("groupNamed", { label: subjectLabel(s) }) : subjectLabel(s);
  return s.kind === "group" ? tx("unnamedRef.group") : tx(`unnamedRef.${FORMS.includes(s.form) ? s.form : "annotation"}`);
}
/** A sentence that removes something: it stands out in the feed (the verb in red). */
export const destroys = (sentence: Sentence): boolean => sentence.destroy === true;
const changes = (op: JournalOp): string => {
  const f = changedFields(op);
  return f.length ? tx("fieldsSep") + f.join(tx("listSep")) : "";
};

const MARK = "\u0001";
/** The sentence of a key, auxiliary included, the cited object (`ref`) split into a piece of its own. */
function phrase(key: string, values: Record<string, string | number>, ref: Piece = ""): Piece[] {
  const said = tx("withAux", { phrase: tx(key, { ...values, ref: MARK }) });
  const [before, after = ""] = said.split(MARK);
  return [before, ref, after].filter((p) => p !== "");
}

// ---- the purge (`ld journal prune`, on the server): a trace line, never a request of the page
/** A purge date, in UTC (a bare date is midnight UTC: in local time it would fall the day before). */
export function utcDay(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const locale = text("ui:locale");
  const day = d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).replace(/^1 /, `${tx("firstDay")} `);
  const midnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return midnight ? day : `${day}, ${d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
}
const CATEGORY_KEYS = new Set(["positions", "colors", "groups", "annotations", "connectors", "other"]);
const categoryWord = (c: string): string => (CATEGORY_KEYS.has(c) ? tx(`category.${c}`).toLocaleLowerCase(text("ui:locale")) : c);
const pruneCategories = (op: JournalOp): string => strings(op.categories).map(categoryWord).join(tx("listSep"));

const DELETES = new Set(["group_delete", "annotation_delete", "connector_delete"]);
const say = (op: JournalOp, pieces: Piece[], verb = true): Sentence => ({ pieces, category: categoryOf(op.op), verb, destroy: DELETES.has(op.op) });
const kindKey = (s: JournalSubject | null, kind: unknown): string => {
  const k = str(kind) || (s ? s.form : "");
  return FORMS.includes(k) ? k : "other";
};

/** One operation as a sentence. */
export function sentenceOf(entry: JournalEntry, op: JournalOp, index: number): Sentence {
  const host = str(op.hostname), s = subjectOf(entry, op, index);
  const members = strings(op.members).length;
  switch (op.op) {
    case "pin": case "unpin": case "uncolor": return say(op, phrase(`say.${op.op}`, {}, node(host)));
    case "color": return say(op, phrase("say.color", { hue: hueLabel(str(op.hue)) }, node(host)));
    case "color_type": return say(op, phrase("say.color_type", { type: TYPE_LABEL(str(op.type)), hue: hueLabel(str(op.hue)) }));
    case "uncolor_type": return say(op, phrase("say.uncolor_type", { type: TYPE_LABEL(str(op.type)) }));
    case "group_create": case "group_add": case "group_remove": return say(op, phrase(`say.${op.op}`, { count: members }, subject(s)));
    case "group_update": case "connector_update": return say(op, [...phrase(`say.${op.op}`, {}, subject(s)), changes(op)].filter((p) => p !== ""));
    case "group_delete": case "connector_create": case "connector_delete": return say(op, phrase(`say.${op.op}`, {}, subject(s)));
    case "annotation_create": return say(op, phrase(`say.annotation_create.${kindKey(null, record(op.content)?.kind)}`, {}, subject(s)));
    case "annotation_update": return say(op, [...phrase(`say.annotation_update.${kindKey(s, "")}`, {}, subject(s)), changes(op)].filter((p) => p !== ""));
    case "annotation_delete": return say(op, phrase(`say.annotation_delete.${kindKey(s, "")}`, {}, subject(s)));
    case "journal_prune": {
      const cats = pruneCategories(op);
      return say(op, phrase("say.journal_prune", { count: typeof op.removed === "number" ? op.removed : 0, date: utcDay(str(op.before)), categories: cats ? ` (${cats})` : "" }));
    }
    default: return say(op, [tx("say.unknown", { op: op.op })], false);
  }
}

// A burst of one operation (a dragged selection, every pin removed) is said in one sentence.
const BATCH = new Set(["pin", "unpin", "color", "uncolor", "group_create", "group_delete", "annotation_create", "annotation_update", "annotation_delete", "connector_create", "connector_update", "connector_delete"]);
const HOST_OPS = new Set(["pin", "unpin", "color", "uncolor"]);
// a burst of `color` groups by hue: "coloured 4 devices red:"
const groupKey = (op: JournalOp): string => op.op + (op.op === "color" ? `:${str(op.hue)}` : "");

/** The operations grouped by key, in the order of first appearance. */
function grouped(ops: readonly JournalOp[]): { key: string; ops: JournalOp[]; first: number }[] {
  const out: { key: string; ops: JournalOp[]; first: number }[] = [];
  ops.forEach((op, i) => {
    const key = groupKey(op), found = out.find((g) => g.key === key);
    if (found) found.ops.push(op);
    else out.push({ key, ops: [op], first: i });
  });
  return out;
}
function batchSentence(ops: readonly JournalOp[]): Sentence {
  const hue = ops[0].op === "color" ? hueLabel(str(ops[0].hue)) : "";
  return say(ops[0], phrase(`batch.${ops[0].op}`, { count: ops.length, hue }));
}

/** The category that carries the entry: the most frequent among its operations (on a tie, the first met). */
export function majority(entry: JournalEntry): JournalCategory {
  const counts = new Map<JournalCategory, number>();
  entry.ops.forEach((op) => {
    const c = categoryOf(op.op);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  });
  let best: JournalCategory = "other", n = 0;
  counts.forEach((v, c) => {
    if (v > n) {
      best = c;
      n = v;
    }
  });
  return best;
}

/** The entry in one line: the sentence of its operation, a burst summed up, or the largest group and the count of
 *  the rest; the category is the one of the majority of the operations. */
export function headline(entry: JournalEntry): Sentence {
  const ops = entry.ops;
  if (!ops.length) return { pieces: [tx("say.empty")], category: "other" };
  const groups = grouped(ops);
  const main = groups.reduce((a, b) => (b.ops.length > a.ops.length ? b : a));
  const batch = main.ops.length > 1 && BATCH.has(main.ops[0].op);
  const lead = batch ? batchSentence(main.ops) : sentenceOf(entry, main.ops[0], main.first);
  const rest = ops.length - (batch ? main.ops.length : 1);
  const pieces = rest ? [...lead.pieces, tx("andMore", { count: rest })] : lead.pieces;
  return { ...lead, pieces, category: majority(entry) };
}

/** The detail of an entry of several operations: one sentence per group of one verb on devices (with the names,
 *  once each), one sentence per other operation; `max` sentences at most. */
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
      const hosts = [...new Set(same.map((o) => str(o.hostname)).filter(Boolean))];
      out.push(same.length > 1 ? { sentence: batchSentence(same), hosts } : { sentence: sentenceOf(entry, op, i), hosts: [] });
      return;
    }
    out.push({ sentence: sentenceOf(entry, op, i), hosts: [] });
  });
  return out;
}

// ---- the facts of an operation, in words (the detail of an entry of one operation)
const HUE = (v: unknown): string => hueLabel(str(v));
const PERCENT = (v: unknown): string => common("punct.percent", { value: num(v) });
/** An enumerated value of the style in the page's language (`solid`, `top_left`, `mono`). */
const STYLE_WORD = (v: unknown): string => STYLE_LABEL[str(v)] || ANNOTATION_WORD[str(v)] || str(v);
const STYLE_FORMAT: Readonly<Record<string, (v: unknown) => string>> = {
  hue: HUE, fill_opacity: PERCENT, opacity: PERCENT, stroke_width: num, padding: num, radius: num, label_size: num, text_size: num,
};
const STYLE_KEYS = new Set(["hue", "shape", "fill_opacity", "opacity", "stroke_width", "stroke_style", "padding", "radius", "label_position", "label_placement", "label_size",
  "label_weight", "label_font", "label_color", "text_size", "text_weight", "text_font", "text_color", "text_align", "text_valign"]);
function styleText(value: unknown): string {
  const style = record(value);
  if (!style) return "";
  return Object.entries(style).filter(([, v]) => given(v)).map(([k, v]) => {
    if (!STYLE_KEYS.has(k)) return `${k} ${String(v)}`;
    return `${tx(`style.${k}`)} ${(STYLE_FORMAT[k] ?? STYLE_WORD)(v)}`;
  }).join(tx("listSep"));
}
const quoted = (value: string): string => tx("fact.quoted", { text: value });
const kindWord = (kind: string): string => common(`annotationKind.${kind}`);
function contentText(value: unknown): string {
  const c = record(value);
  if (!c) return "";
  if (c.kind === "note") {
    const note = str(c.text).trim().replace(/\s+/g, " ");
    return `${kindWord("note")} ${quoted(note.length > 80 ? `${note.slice(0, 79)}…` : note)}`;
  }
  if (c.kind === "table") {
    const rows = Array.isArray(c.rows) ? c.rows : [];
    return tx("fact.table", { rows: rows.length, cols: Math.max(0, ...rows.map((r) => (Array.isArray(r) ? r.length : 0))) });
  }
  if (c.kind === "image") return kindWord("image") + (str(c.alt) ? ` ${quoted(str(c.alt))}` : "");
  if (c.kind === "shape") return (STYLE_WORD(c.shape) || kindWord("shape")) + (str(c.label) ? ` ${quoted(str(c.label))}` : "");
  // a code block: its title, its language, its lines; never its text (a kept secret may live there)
  if (c.kind === "code") return `${kindWord("code")}${str(c.title) ? ` ${quoted(str(c.title))}` : ""} ${tx("fact.code", { language: common(`codeLanguage.${str(c.language)}`), count: str(c.text).split("\n").length })}`;
  return str(c.kind);
}
const SIDES = new Set(["n", "e", "s", "w"]);
function endText(value: unknown, entry?: JournalEntry): string {
  const e = record(value);
  if (!e) return "";
  if (e.kind === "free") return tx("fact.point", { x: num(e.x), y: num(e.y) });
  const side = SIDES.has(str(e.side)) ? tx("fact.side", { side: common(`side.${str(e.side)}`) }) : "";
  return (e.kind === "device" ? str(e.ref) : refName(entry, str(e.ref))) + side;
}
const ROUTES = new Set(["straight", "elbow", "curve"]), HEADS = new Set(["none", "arrow"]);
const word = (set: Set<string>, value: unknown): string => (set.has(str(value)) ? common(`connectorWord.${str(value)}`) : str(value));

/** The facts of an operation: what it set, in words; the null keys say nothing. `entry` names the groups and
 *  annotations it cites (anchor, ends). */
export function factsOf(op: JournalOp, entry?: JournalEntry): Fact[] {
  const facts: Fact[] = [];
  const add = (label: string, value: string, list?: readonly string[]): void => {
    if (value || (list && list.length)) facts.push({ label, value, list });
  };
  const f = (key: string): string => tx(`fact.${key}`);
  if (op.op === "journal_prune") {
    add(f("removed"), typeof op.removed === "number" ? String(op.removed) : "");
    if (typeof op.first_revision === "number" && typeof op.last_revision === "number") add(f("revisions"), tx("fact.revisionRange", { first: op.first_revision, last: op.last_revision }));
    add(f("before"), utcDay(str(op.before)));
    add(f("categories"), pruneCategories(op) || f("allCategories"));
    add(f("archive"), str(op.archive));
    add(f("digest"), str(op.sha256) ? `sha256 ${str(op.sha256)}` : "");
    return facts;
  }
  if (given(op.x) || given(op.y)) add(f("position"), `${num(op.x)}, ${num(op.y)}`);
  if (given(op.w) || given(op.h)) add(f("size"), `${num(op.w)} × ${num(op.h)}`);
  if (given(op.hue)) add(f("hue"), HUE(op.hue));
  if (given(op.type)) add(f("type"), TYPE_LABEL(str(op.type)));
  if (given(op.label)) add(f("name"), str(op.label) || f("emptyName"));
  if (str(op.description)) add(f("description"), str(op.description));
  if (given(op.members)) add(tx("fact.members", { count: strings(op.members).length }), "", strings(op.members));
  if (given(op.content)) add(f("content"), contentText(op.content));
  const anchor = record(op.anchor);
  if (anchor) add(f("anchor"), anchor.kind === "free" ? common("annotationWord.free") : anchor.kind === "device" ? str(anchor.ref) : refName(entry, str(anchor.ref)));
  if (given(op.start)) add(f("start"), endText(op.start, entry));
  if (given(op.end)) add(f("end"), endText(op.end, entry));
  const heads = record(op.heads);
  if (heads) add(f("heads"), `${word(HEADS, heads.start)} → ${word(HEADS, heads.end)}`);
  if (given(op.route)) add(f("route"), word(ROUTES, op.route));
  if (given(op.bend)) add(f("bend"), num(op.bend));
  if (given(op.z)) add(f("plane"), common(op.z === "back" ? "annotationWord.back" : "annotationWord.front"));
  if (given(op.locked)) add(f("lock"), f(op.locked ? "locked" : "unlocked"));
  if (given(op.leader)) add(f("leader"), f(op.leader ? "yes" : "no"));
  if (given(op.style)) add(f("style"), styleText(op.style));
  return facts;
}

/** A session of positions in one sentence: "placed 48 devices", "… and unpinned 3". */
export function sessionSentence(placed: number, unpinned: number): Sentence {
  const said = placed ? tx("batch.pin", { count: placed }) + (unpinned ? tx("andUnpinned", { total: unpinned }) : "") : tx("batch.unpin", { count: unpinned });
  return { pieces: [tx("withAux", { phrase: said })], category: "positions", verb: true };
}

// ---- the search, highlighted
/** The comparable text, without case nor accents, **of the same length** as the text (one character for one: the
 *  indexes of a match hold in the original); the same fold as the server (`journal_words.fold`). */
export function foldText(value: string): string {
  let out = "";
  for (const ch of value) {
    const bare = ch.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
    out += bare.length === ch.length ? bare : ch.length === 1 && bare.length > 0 ? bare[0] : ch;
  }
  return out;
}
/** The text cut on the words searched (without case nor accents): `hit` = a word found. */
export function marks(value: string, words: readonly string[]): { text: string; hit: boolean }[] {
  const wanted = words.map(foldText).filter(Boolean);
  if (!wanted.length || !value) return [{ text: value, hit: false }];
  const low = foldText(value), out: { text: string; hit: boolean }[] = [];
  let at = 0;
  while (at < value.length) {
    let best = -1, len = 0;
    for (const w of wanted) {
      const i = low.indexOf(w, at);
      if (i >= 0 && (best < 0 || i < best || (i === best && w.length > len))) {
        best = i;
        len = w.length;
      }
    }
    if (best < 0) {
      out.push({ text: value.slice(at), hit: false });
      break;
    }
    if (best > at) out.push({ text: value.slice(at, best), hit: false });
    out.push({ text: value.slice(best, best + len), hit: true });
    at = best + len;
  }
  return out;
}
export const textOf = (s: Sentence): string => s.pieces.map((p) => (typeof p === "string" ? p : p.text)).join("");
/** True when every word searched reads in the sentence: else the match is in the detail, and the line says so. */
export const visibleMatch = (s: Sentence, author: string, words: readonly string[]): boolean => {
  const said = foldText(`${author} ${textOf(s)}`);
  return words.every((w) => said.includes(foldText(w)));
};
/** What a search found outside the sentence: the first name (device, member, cited object) that holds a word
 *  searched, to say on the line ("found: dc01-core-02"); null when the match is elsewhere (a content). */
export function hiddenHit(entry: JournalEntry, words: readonly string[]): string | null {
  const wanted = words.map(foldText);
  const names = entry.ops.flatMap((op) => [str(op.hostname), ...strings(op.members)]).concat(entry.subjects.map((s) => subjectLabel(s)));
  return names.find((n) => n && wanted.some((w) => foldText(n).includes(w))) ?? null;
}
/** The first object an entry cites (what "o" opens from the keyboard). */
export function firstRef(entry: JournalEntry): Ref | null {
  for (let i = 0; i < entry.ops.length; i++) {
    const piece = sentenceOf(entry, entry.ops[i], i).pieces.find((p): p is Ref => typeof p !== "string");
    if (piece) return piece;
  }
  return null;
}
