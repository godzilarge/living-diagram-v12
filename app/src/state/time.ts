// Dates and ages in the page's language, by Intl alone: "19 Jan, 02:00" / "19 janv., 02:00", "2 hr ago" /
// "il y a 2 h", "yesterday" + "17:42", "17 Jan". Pure: "now" is always a parameter (never `Date.now()` here) and the
// time zone may be given (the tests pin UTC; the page uses the browser's).

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
/** A collection older than this is late (`docs/a-juger-a-l-usage.md`). */
export const STALE_AFTER_DAYS = 7;

const formats = new Map<string, Intl.DateTimeFormat>();
function dateFormat(locale: string, name: string, options: Intl.DateTimeFormatOptions, timeZone?: string): Intl.DateTimeFormat {
  const key = `${locale}|${name}|${timeZone ?? ""}`;
  let found = formats.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    formats.set(key, found);
  }
  return found;
}

/** Milliseconds since the epoch, or null for a text that is not a date. */
export function parseTime(iso: string): number | null {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

/** "19 Jan, 02:00": a collection's start. Empty for an unreadable date. */
export function shortDateTime(iso: string, locale: string, timeZone?: string): string {
  const time = parseTime(iso);
  if (time === null) return "";
  return dateFormat(locale, "short", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, timeZone).format(time);
}

/** "19 Jan 2026" and "02:00": a collection's start as the run choice says it. Empty for an unreadable date. */
export function dateAndClock(iso: string, locale: string, timeZone?: string): Readonly<{ date: string; time: string }> {
  const time = parseTime(iso);
  if (time === null) return { date: "", time: "" };
  const date = dateFormat(locale, "day-year", { day: "numeric", month: "short", year: "numeric" }, timeZone).format(time);
  return { date, time: clock(time, locale, timeZone) };
}

const sameYear = (a: number, b: number, timeZone?: string) =>
  dateFormat("en", "year", { year: "numeric" }, timeZone).format(a) === dateFormat("en", "year", { year: "numeric" }, timeZone).format(b);

/** "17 Jan" ("17 Jan 2025" in another year than now's). Empty for an unreadable date. */
export function dayMonth(iso: string, locale: string, now: number, timeZone?: string): string {
  const time = parseTime(iso);
  if (time === null) return "";
  const withYear = !sameYear(time, now, timeZone);
  return dateFormat(locale, withYear ? "day-year" : "day", withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" }, timeZone).format(time);
}

function clock(time: number, locale: string, timeZone?: string): string {
  return dateFormat(locale, "clock", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, timeZone).format(time);
}

const calendarDay = (time: number, timeZone?: string) =>
  dateFormat("en-CA", "calendar", { year: "numeric", month: "2-digit", day: "2-digit" }, timeZone).format(time);

/** When something happened: a relative age under 24 h, "yesterday" and its time, else the day. */
export type When = Readonly<{ kind: "text"; text: string }> | Readonly<{ kind: "dayAt"; day: string; time: string }>;

export function when(iso: string, now: number, locale: string, timeZone?: string): When {
  const time = parseTime(iso);
  if (time === null) return { kind: "text", text: "" };
  const age = Math.max(0, now - time);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (age < MINUTE_MS) return { kind: "text", text: relative.format(0, "second") };
  if (age < HOUR_MS) return { kind: "text", text: relative.format(-Math.floor(age / MINUTE_MS), "minute") };
  if (age < DAY_MS) return { kind: "text", text: relative.format(-Math.floor(age / HOUR_MS), "hour") };
  if (calendarDay(time, timeZone) === calendarDay(now - DAY_MS, timeZone))
    return { kind: "dayAt", day: relative.format(-1, "day"), time: clock(time, locale, timeZone) };
  return { kind: "text", text: dayMonth(iso, locale, now, timeZone) };
}

/** Whole days between a date and now (0 for a date in the future); null for an unreadable date. */
export function daysSince(iso: string, now: number): number | null {
  const time = parseTime(iso);
  return time === null ? null : Math.max(0, Math.floor((now - time) / DAY_MS));
}

/** A collection is late when it started more than seven whole days before now. */
export function isStale(iso: string, now: number): boolean {
  const time = parseTime(iso);
  return time !== null && now - time > STALE_AFTER_DAYS * DAY_MS;
}
