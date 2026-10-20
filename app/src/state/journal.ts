// The Log view's pure logic (the v1's `journal.ts`, moved with brick 7): its filters, carried by the address, the
// query they make, the time (local day, clock, zone), the folds (a session of positions, a repeated gesture) and the
// days of the feed. The sentences are `journal-text.ts`. Pure, tested under Node.
import type { JournalAction, JournalCategory, JournalEntry, JournalOp } from "../api/journal";
import { ACTIONS, CATEGORIES, isAction, isCategory } from "../api/journal";
import { i18n, text } from "../i18n";
import type { TextKey } from "../i18n";

export type { JournalAction, JournalCategory, JournalEntry, JournalOp } from "../api/journal";
export { ACTIONS, CATEGORIES, isAction, isCategory } from "../api/journal";

/** The period: relative to now, or a range of days (`from` and `to` included, local time: "who deleted what between
 *  the 1st and the 15th"). */
export type Period = "all" | "24h" | "7d" | "30d" | "range";
export const PERIODS: readonly Period[] = ["24h", "7d", "30d", "all"];
const PERIOD_MS: Readonly<Record<"24h" | "7d" | "30d", number>> = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 };
export const isPeriod = (value: string): value is Period => value === "range" || (PERIODS as readonly string[]).includes(value);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A day `YYYY-MM-DD` read in local time (midnight); null when it does not read. */
export function localDay(day: string): Date | null {
  if (!DAY_RE.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}
const iso = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** The Log view's filters, carried by the address. `infrastructure`: `""` = the one open, `"*"` = all, a name = that
 *  one. `object`: the history of one object (a hostname or an identity `g…`, `a…`, `c…`). `rev`: a link to an entry,
 *  the page starts at that revision (not a filter: the latest are one click away). */
export type JournalFilters = Readonly<{
  q: string;
  authors: readonly string[];
  categories: readonly JournalCategory[];
  actions: readonly JournalAction[];
  infrastructure: string;
  period: Period;
  from: string;
  to: string;
  object: string;
  rev: number | null;
}>;
export const DEFAULT_FILTERS: JournalFilters = Object.freeze({ q: "", authors: [], categories: [], actions: [], infrastructure: "", period: "all", from: "", to: "", object: "", rev: null });
/** True when something narrows the log (a link to an entry does not). */
export const filtered = (f: JournalFilters): boolean => !!(f.q.trim() || f.authors.length || f.categories.length || f.actions.length || f.object || f.period !== "all");
export const sameFilters = (a: JournalFilters, b: JournalFilters): boolean => formatFilters(a).join("&") === formatFilters(b).join("&");

/** The query's parameters (repeatable: `author`, `category`, `action`); `current` = the infrastructure open. */
export function queryOf(f: JournalFilters, current: string, now: number, before?: string | null, limit?: number): [string, string][] {
  const out: [string, string][] = [];
  const infra = f.infrastructure === "*" ? "" : f.infrastructure || current;
  if (infra) out.push(["infrastructure", infra]);
  f.authors.forEach((a) => out.push(["author", a]));
  f.categories.forEach((c) => out.push(["category", c]));
  f.actions.forEach((a) => out.push(["action", a]));
  if (f.object && infra) out.push(["object", f.object]);
  if (f.q.trim()) out.push(["q", f.q.trim()]);
  if (f.period === "range") {
    const from = localDay(f.from), to = localDay(f.to);
    if (from) out.push(["since", iso(from)]);
    if (to) out.push(["until", iso(new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1))]); // the day `to` included
  } else if (f.period !== "all") out.push(["since", iso(new Date(now - PERIOD_MS[f.period]))]);
  if (before) out.push(["before", before]);
  else if (f.rev !== null && infra) out.push(["start", String(f.rev)]); // a revision is unique in its infrastructure only
  if (limit) out.push(["limit", String(limit)]);
  return out;
}

// ---- the address: `#mode=journal&jq=…&jau=…&jcat=a,b&jact=deleted&jobj=…&jinfra=*&jp=7d` (or `jp=range&jfrom=YYYY-MM-DD&jto=…`),
// `jrev=986` for a link to an entry; the same keys as the v1, written in Log mode only
export function parseFilters(pairs: readonly (readonly [string, string])[]): JournalFilters {
  let f: JournalFilters = DEFAULT_FILTERS;
  for (const [key, value] of pairs) {
    if (key === "jq") f = { ...f, q: value };
    else if (key === "jau" && value.trim() && !f.authors.includes(value)) f = { ...f, authors: [...f.authors, value] };
    else if (key === "jcat") f = { ...f, categories: value.split(",").filter(isCategory) };
    else if (key === "jact") f = { ...f, actions: value.split(",").filter(isAction) };
    else if (key === "jobj" && value.trim()) f = { ...f, object: value };
    else if (key === "jrev" && /^\d{1,9}$/.test(value)) f = { ...f, rev: Number(value) };
    else if (key === "jinfra") f = { ...f, infrastructure: value };
    else if (key === "jp" && isPeriod(value)) f = { ...f, period: value };
    else if (key === "jfrom" && localDay(value)) f = { ...f, from: value };
    else if (key === "jto" && localDay(value)) f = { ...f, to: value };
  }
  // "all": neither an object's history nor a link (an identity, a revision are unique in their infrastructure only)
  if (f.infrastructure === "*") f = { ...f, object: "", rev: null };
  if (f.period !== "range" || (!f.from && !f.to)) f = { ...f, period: f.period === "range" ? "all" : f.period, from: "", to: "" };
  return Object.freeze(f);
}
export function formatFilters(f: JournalFilters): string[] {
  const parts: string[] = [];
  if (f.q) parts.push(`jq=${encodeURIComponent(f.q)}`);
  f.authors.forEach((a) => parts.push(`jau=${encodeURIComponent(a)}`));
  if (f.categories.length) parts.push(`jcat=${f.categories.join(",")}`);
  if (f.actions.length) parts.push(`jact=${f.actions.join(",")}`);
  if (f.object) parts.push(`jobj=${encodeURIComponent(f.object)}`);
  if (f.infrastructure) parts.push(`jinfra=${encodeURIComponent(f.infrastructure)}`);
  if (f.period !== "all") parts.push(`jp=${f.period}`);
  if (f.period === "range" && f.from) parts.push(`jfrom=${f.from}`);
  if (f.period === "range" && f.to) parts.push(`jto=${f.to}`);
  if (f.rev !== null) parts.push(`jrev=${f.rev}`);
  return parts;
}

// ---- the time: the formats follow the page's language, one formatter per language and per form
const formats = new Map<string, Intl.DateTimeFormat>();
export const locale = (): string => text("ui:locale");
function format(name: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale()}|${name}`;
  let found = formats.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(locale(), options);
    formats.set(key, found);
  }
  return found;
}
const tx = (key: string, values?: Record<string, string | number>): string => text(`journal:${key}` as TextKey, values);
const RANGE_DAY = (): Intl.DateTimeFormat => format("range-day", { day: "numeric", month: "short" });
const RANGE_YEAR = (): Intl.DateTimeFormat => format("range-year", { day: "numeric", month: "short", year: "numeric" });
/** The range in short words, for its segment: "1 Sept – 15 Sept", "since 1 Sept", "until 15 Sept". */
export function rangeLabel(from: string, to: string, now: number): string {
  const a = localDay(from), b = localDay(to), year = new Date(now).getFullYear();
  const fmt = (d: Date): string => (d.getFullYear() === year ? RANGE_DAY() : RANGE_YEAR()).format(d);
  if (a && b) return a.getTime() === b.getTime() ? fmt(a) : `${fmt(a)} – ${fmt(b)}`;
  if (a) return tx("since", { date: fmt(a) });
  if (b) return tx("until", { date: fmt(b) });
  return tx("period.range");
}
const DAY = (): Intl.DateTimeFormat => format("day", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const TIME = (): Intl.DateTimeFormat => format("time", { hour: "2-digit", minute: "2-digit" });
const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
/** The day of a date, in local time: "today", "yesterday", else the date in words ("Thursday 1 October 2026"; the
 *  first of the month as the language writes it, `journal:firstDay`). */
export function dayLabel(at: string, now: number): string {
  const d = new Date(at), today = new Date(now), yesterday = new Date(now - 864e5);
  if (dayKey(d) === dayKey(today)) return tx("today");
  if (dayKey(d) === dayKey(yesterday)) return tx("yesterday");
  return DAY().formatToParts(d).map((p) => (p.type === "day" && p.value === "1" ? tx("firstDay") : p.value)).join("");
}
export const timeLabel = (at: string): string => TIME().format(new Date(at));
/** The zone of the clocks shown (an audit must know it): "UTC+2", "UTC+5:30", "UTC". */
export function zoneLabel(now: number): string {
  const minutes = -new Date(now).getTimezoneOffset();
  if (!minutes) return "UTC";
  const abs = Math.abs(minutes), h = Math.floor(abs / 60), m = abs % 60;
  return `UTC${minutes > 0 ? "+" : "−"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}
/** The log's order: the most recent first (date, infrastructure, revision), as the server. */
export function newer(a: JournalEntry, b: JournalEntry): boolean {
  const ta = Date.parse(a.at), tb = Date.parse(b.at);
  if (ta !== tb) return ta > tb;
  if (a.infrastructure !== b.infrastructure) return a.infrastructure > b.infrastructure;
  return a.revision > b.revision;
}
/** The link to an entry: the application open on its infrastructure, the Log starting at its revision. `base` =
 *  the application's address without query nor fragment (`origin + pathname`: it may live under a sub-path). */
export function entryLink(base: string, entry: JournalEntry): string {
  const infra = encodeURIComponent(entry.infrastructure);
  return `${base}?infrastructure=${infra}#mode=journal&jinfra=${infra}&jrev=${entry.revision}`;
}
/** A purge trace (`ld journal prune`): never the target of a link. */
export const isTrace = (e: JournalEntry): boolean => e.ops.some((op) => op.op === "journal_prune");
/** The identity of an entry: infrastructure, revision and date (a purge trace carries the current revision: its date
 *  alone tells it from the entry of the same revision). */
export const keyOf = (e: JournalEntry): string => `${e.infrastructure}\u0000${e.revision}\u0000${e.at}`;

// ---- the folds: a session of positions ("placed 48 devices, 312 requests"), or the same gesture repeated (eight
// times "modified the table: style" in a minute, "×8"). The server computes them on the whole log of the
// infrastructure; the page folds the neighbouring entries of one group; a filter may hide a part of it, never merge two.
export type JournalItem =
  | Readonly<{ kind: "entry"; key: string; entry: JournalEntry }>
  | Readonly<{ kind: "fold"; key: string; entries: readonly JournalEntry[]; size: number }>
  | Readonly<{ kind: "session"; key: string; entries: readonly JournalEntry[]; size: number }>;
const groupKey = (e: JournalEntry): string | null => (e.group ? `${e.infrastructure}\u0000${e.group.id}` : null);
/** The entries, those of one group folded when they follow each other (in the order received, the most recent first). */
export function fold(entries: readonly JournalEntry[]): JournalItem[] {
  const out: JournalItem[] = [];
  let run: JournalEntry[] = [];
  const close = (): void => {
    const group = run.length ? run[0].group : null;
    if (run.length > 1 && group) out.push({ kind: group.kind === "session" ? "session" : "fold", key: (group.kind === "session" ? "s" : "f") + keyOf(run[0]), entries: run, size: group.size });
    else run.forEach((entry) => out.push({ kind: "entry", key: keyOf(entry), entry }));
    run = [];
  };
  for (const entry of entries) {
    const key = groupKey(entry);
    if (run.length && (!key || key !== groupKey(run[0]))) close();
    run = [...run, entry];
    if (!key) close();
  }
  close();
  return out;
}
/** The operation of a fold: the most recent, with everything the others changed too ("style, position"). */
export function mergedOp(entries: readonly JournalEntry[]): JournalOp {
  const merged: Record<string, unknown> = { ...entries[0].ops[0] };
  for (const e of entries.slice(1)) for (const [k, v] of Object.entries(e.ops[0])) if (merged[k] === null || merged[k] === undefined) merged[k] = v;
  return merged as JournalOp;
}
/** The devices a session placed or unpinned, once each, the most recent first. */
export function sessionHosts(entries: readonly JournalEntry[]): Readonly<{ placed: string[]; unpinned: string[] }> {
  const placed = new Set<string>(), unpinned = new Set<string>();
  for (const e of entries)
    for (const op of e.ops) {
      const host = typeof op.hostname === "string" ? op.hostname : "";
      if (host) (op.op === "unpin" ? unpinned : placed).add(host);
    }
  return { placed: [...placed], unpinned: [...unpinned] };
}
export const firstEntry = (item: JournalItem): JournalEntry => (item.kind === "entry" ? item.entry : item.entries[0]);
export const entriesOf = (item: JournalItem): readonly JournalEntry[] => (item.kind === "entry" ? [item.entry] : item.entries);
/** The items by day (local time), in the order received. */
export function byDay(items: readonly JournalItem[], now: number): Readonly<{ day: string; key: string; items: JournalItem[] }>[] {
  const out: { day: string; key: string; items: JournalItem[] }[] = [];
  for (const item of items) {
    const at = firstEntry(item).at, key = dayKey(new Date(at)), last = out[out.length - 1];
    if (last && last.key === key) last.items.push(item);
    else out.push({ day: dayLabel(at, now), key, items: [item] });
  }
  return out;
}

/** What the context menu's "History" row opens for its target: a device by its hostname, a group, an annotation or a
 *  connector by its identity; nothing for the map. */
export const historyObjectOf = (target: Readonly<{ kind: string; id?: string }>): string | null => (target.kind === "pane" || !target.id ? null : target.id);

/** The page's language at the time of the call (the day labels are cached per language). */
export const language = (): string => i18n.language;
