// Every sentence the Log view builds from its state, from the catalogue only (`journal`): the header's line (how
// many, where, the zone of the clocks), a facet's accessible name, the filters posed in words, a day's title, a row's
// author and sentence around each other, its tally, its revision, the context under the header (an object's history,
// a link to an entry), the foot, the export's result. Pure, tested under Node.
import type { JournalPage } from "../api/journal";
import type { Translate } from "../i18n";
import type { JournalFilters, JournalItem, Period } from "../state/journal";
import { dayLabel, isTrace, locale, rangeLabel, timeLabel, zoneLabel } from "../state/journal";
import type { RefKind } from "../state/journal-text";
import type { Cause } from "../state/useHome";
import { oldestOf } from "./rows";

/** How many changes the page answers: "412 changes", "3 changes match", "no change matches". */
export function totalWords(t: Translate, total: number, narrowed: boolean): string {
  if (!total) return t(narrowed ? "journal:ui.noneMatch" : "journal:ui.none");
  return t(narrowed ? "journal:ui.totalMatch" : "journal:ui.total", { count: total });
}

/** Where the log reads: every infrastructure, or one by its name (the one open included). */
export const scopeWords = (t: Translate, f: JournalFilters, current: string): string =>
  f.infrastructure === "*" ? t("journal:ui.allInfrastructures") : f.infrastructure || current;

/** The header's line: "412 changes · demo-dc · times UTC+1"; while nothing was read, "reading…". */
export function subtitleWords(t: Translate, status: string, scope: string, now: number): string {
  return t("journal:ui.subtitle", { total: status, scope, zone: t("journal:ui.zone", { zone: zoneLabel(now) }) });
}

/** A period in words, a range by its days. */
export const periodWords = (t: Translate, period: Period, f: Pick<JournalFilters, "from" | "to">, now: number): string =>
  period === "range" ? rangeLabel(f.from, f.to, now) : t(`journal:period.${period}`);

/** A facet's accessible name: its words (and note), then its count when read. */
export function facetSaid(t: Translate, label: string, count: number | null, note?: string): string {
  const named = note ? t("journal:ui.withNote", { label, note }) : label;
  return count === null ? named : t("journal:ui.facetSaid", { label: named, value: count });
}

/** The filters posed, in words (the empty state recalls them: one knows what one was looking for). */
export function posedWords(t: Translate, f: JournalFilters, now: number): string {
  const list = (items: readonly string[]): string => items.join(t("journal:listSep"));
  const out: string[] = [];
  if (f.q.trim()) out.push(t("journal:fact.quoted", { text: f.q.trim() }));
  if (f.categories.length) out.push(list(f.categories.map((c) => t(`journal:category.${c}`))));
  if (f.actions.length) out.push(list(f.actions.map((a) => t(`journal:action.${a}`))));
  if (f.authors.length) out.push(list(f.authors));
  if (f.period !== "all") out.push(periodWords(t, f.period, f, now));
  return out.length ? t("journal:ui.posed", { filters: out.join(t("journal:ui.posedSep")) }) : "";
}

/** A day's title, in sentence case ("Today", "Saturday 17 January 2026"). */
export function dayTitle(at: string, now: number): string {
  const label = dayLabel(at, now);
  return label.charAt(0).toLocaleUpperCase(locale()) + label.slice(1);
}

/** The pieces of a row's sentence around its author, as the catalogue orders them. */
export type Slot = Readonly<{ kind: "text" | "author" | "phrase"; text: string }>;
const AUTHOR = "\u0001", PHRASE = "\u0002";
export function authorSlots(t: Translate): Slot[] {
  const said = t("journal:ui.byAuthor", { author: AUTHOR, phrase: PHRASE });
  return said
    .split(/(\u0001|\u0002)/)
    .filter((part) => part !== "")
    .map((part) => (part === AUTHOR ? { kind: "author", text: "" } : part === PHRASE ? { kind: "phrase", text: "" } : { kind: "text", text: part }));
}

/** An author left blank is said "unknown", never an empty name. */
export const authorWords = (t: Translate, author: string): string => author.trim() || t("journal:ui.unknownAuthor");

/** The revision of a row: "r41", or the span of a fold "r32–r39". */
export function revisionWords(t: Translate, item: JournalItem): string {
  if (item.kind === "entry") return t("journal:ui.rev", { rev: item.entry.revision });
  return t("journal:ui.revs", { first: oldestOf(item).revision, last: item.entries[0].revision });
}

/** A fold or a session shown in part (a filter hides the rest): it says so, never merges two. */
const partWords = (t: Translate, item: Extract<JournalItem, { entries: unknown }>): string =>
  item.entries.length < item.size ? t("journal:ui.part", { shown: item.entries.length, size: item.size }) : "";

/** The tally of a fold: "×8" and "from 14:58 to 15:02". */
export function tallyWords(t: Translate, item: Extract<JournalItem, { kind: "fold" }>): Readonly<{ times: string; span: string }> {
  const span = t("journal:ui.fromTo", { from: timeLabel(oldestOf(item).at), to: timeLabel(item.entries[0].at), part: partWords(t, item) });
  return { times: t("journal:ui.tally", { total: item.entries.length }), span };
}

/** The note of a session: "312 requests since 08:41". */
export const sessionWords = (t: Translate, item: Extract<JournalItem, { kind: "session" }>): string =>
  t("journal:ui.since", { count: item.entries.length, time: timeLabel(oldestOf(item).at) }) + partWords(t, item);

/** What became of a cited object that is not there anymore. */
export const goneWords = (t: Translate, kind: RefKind): string => t(kind === "node" ? "journal:ui.goneNode" : "journal:ui.goneOther");

/** Under the header: the link to an entry, said as the page found it. */
export function linkWords(t: Translate, rev: number, page: JournalPage | null): string {
  if (!page || !page.start_missing) return t("journal:ui.linkTo", { rev });
  return t(page.entries.length && isTrace(page.entries[0]) ? "journal:ui.purgedRev" : "journal:ui.missingRev", { rev });
}

/** The foot: how many entries are read, of how many. */
export function shownWords(t: Translate, page: JournalPage, rev: number | null): string {
  const read = page.entries.length.toLocaleString(locale());
  return rev !== null ? t("journal:ui.shownFrom", { read, rev, total: page.total }) : t("journal:ui.shownOf", { read, total: page.total });
}

/** Why a read failed, in words: an HTTP status, or the network. */
export const causeWords = (t: Translate, cause: Cause): string =>
  typeof cause === "number" ? t("journal:ui.status", { status: cause }) : t(cause === "unreachable" ? "journal:ui.unreachable" : "journal:ui.invalid");

/** The export's result, said in a toast. */
export function exportWords(t: Translate, result: Readonly<{ ok: true; count: number; truncated: boolean }> | Readonly<{ ok: false; cause: Cause }>): string {
  if (!result.ok) return t("journal:ui.exportFailed", { message: causeWords(t, result.cause) });
  const said = t("journal:ui.exported", { count: result.count });
  return result.truncated ? t("journal:ui.exportLimit", { exported: said }) : said;
}
