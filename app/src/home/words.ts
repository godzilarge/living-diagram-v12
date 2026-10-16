// The home's words built from the state: a status, a date, an age, the "compared" and "devices" cells of a collection,
// why a widget has no data, the sentence of a feed entry. Shared by the widgets; every sentence comes from the
// catalogue, values interpolated, never assembled here.
import type { JournalEntry } from "../api/home";
import type { Translate } from "../i18n";
import type { Compared, RunRow, Status } from "../state/home";
import { journalLine } from "../state/journal-line";
import { dayMonth, when } from "../state/time";
import type { Load } from "../state/useHome";

export const DASH = "—";
/** A diff still being read. */
export const PENDING = "…";

export function statusWords(t: Translate, status: Status, now: number): string {
  const locale = t("ui:locale");
  if (status.key === "stale") return t("home:status.stale", { count: status.days ?? 0 });
  if (status.key === "failedOn") return t("home:status.failedOn", { date: dayMonth(status.date ?? "", locale, now) });
  if (status.key === "partial" && status.unreachable) return t("home:status.partialUnreachable", { count: status.unreachable });
  return t(`home:status.${status.key}`);
}

export function whenWords(t: Translate, iso: string, now: number): string {
  const at = when(iso, now, t("ui:locale"));
  return at.kind === "dayAt" ? t("home:time.dayAt", { day: at.day, time: at.time }) : at.text;
}

/** The "compared" cell: nothing to compare, still reading, unavailable (404, 500), or the total. */
export function comparedWords(t: Translate, compared: Compared, now: number): string {
  if (compared.kind === "none") return DASH;
  if (compared.kind === "pending") return PENDING;
  if (compared.kind === "failed") return t("home:runs.unavailable");
  if (compared.total === 0) return t("home:runs.noChange");
  return t("home:runs.changes", { count: compared.total, date: dayMonth(compared.since, t("ui:locale"), now) });
}

/** The "devices" cell: who answered out of the scope, else the scope, else a dash. */
export function runDevicesWords(t: Translate, run: Pick<RunRow, "devices" | "answered">): string {
  if (run.answered !== null && run.devices !== null) return t("home:runs.answered", { count: run.answered, devices: run.devices });
  if (run.answered !== null) return t("home:runs.answeredOnly", { count: run.answered });
  return run.devices === null ? DASH : t("home:runs.devices", { count: run.devices });
}

/** The sentence of a load that failed: refused with a status, answered outside the contract, or no answer. */
export function failedWords(t: Translate, load: Load<unknown>): string {
  if (load.kind !== "failed" || load.cause === "unreachable") return t("home:unreachable");
  if (load.cause === "invalid") return t("home:invalid");
  return t("home:failed", { status: load.cause });
}

/** What a feed entry did, its other changes counted: "moved 3 devices and 1 other change". */
export function entryWords(t: Translate, entry: JournalEntry): string {
  const line = journalLine(entry);
  const phrase = t(line.key, line.values);
  return line.more > 0 ? t("home:journal.andMore", { phrase, count: line.more }) : phrase;
}

/** A sentence around its author, as the catalogue orders them: the text before and after the author's name. */
export type ByAuthor = Readonly<{ before: string; author: string; after: string }>;
const MARK = "\u0001";

export function byAuthorWords(t: Translate, entry: JournalEntry): ByAuthor {
  const author = entry.author.trim() || t("home:journal.unknownAuthor");
  const text = t("home:journal.byAuthor", { author: MARK, phrase: entryWords(t, entry) });
  const [before, after = ""] = text.split(MARK);
  return { before, author, after };
}

/** The foot of a widget: the archive entries skipped as unreadable; nothing when there are none. */
export function unreadableWords(t: Translate, load: Load<Readonly<{ unreadable: number }>>): string | undefined {
  return load.kind === "ok" && load.data.unreadable > 0 ? t("home:unreadable", { count: load.data.unreadable }) : undefined;
}
