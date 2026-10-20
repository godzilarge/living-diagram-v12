// The home's rows, derived from what the API gave: the infrastructures (most recent collection first, the last one
// that gave data shown and opened, a failure after it said in red, late after seven days, its checks), the latest
// collections of every infrastructure merged (who answered, how many did not), and what each one changed since the one
// before (the engine's own count of a diff, read after the page shows). Pure, tested under Node.
import { diffCount } from "@engine/canvas/model";
import type { DiffFacts, DiffSummary, Infrastructure, LastRun, RecentRun } from "../api/home";
import type { Tone } from "../ui";
import { daysSince, isStale, parseTime } from "./time";

/** The collections the widget lists when the browser has no `homeRuns` preference (`prefs.ts`). */
export const LATEST_RUNS = 6;
/** Where an infrastructure opens: the v2's own diagram shell (brick 2), at the base the page is served from
 *  (`/next/` built, `/` in development); the component passes `import.meta.env.BASE_URL`. */
export const DIAGRAM_ROUTE = "/";

export type StatusKey = "completed" | "partial" | "failed" | "failedOn" | "running" | "unknown" | "stale";
/** `days`: how late (stale); `date`: when the last collection failed (failedOn); `unreachable`: the devices of a
 *  partial collection that did not answer. */
export type Status = Readonly<{ key: StatusKey; tone: Tone; days?: number; date?: string; unreachable?: number }>;

const BY_STATUS: Readonly<Record<string, Status>> = {
  completed: { key: "completed", tone: "neutral" },
  partial: { key: "partial", tone: "warning" },
  failed: { key: "failed", tone: "error" },
  running: { key: "running", tone: "neutral" },
};

/** A collection's result in words; with `now`, a collection more than seven days old says how late it is. */
export function statusOf(run: Readonly<{ run_status: string; run_start: string }>, now?: number): Status {
  if (now !== undefined && isStale(run.run_start, now)) return { key: "stale", tone: "warning", days: daysSince(run.run_start, now) ?? 0 };
  return BY_STATUS[run.run_status] ?? { key: "unknown", tone: "neutral" };
}

const byStartDesc = (a: string, b: string) => (parseTime(b) ?? 0) - (parseTime(a) ?? 0);

export function openHref(infrastructure: string, runId: string, base = DIAGRAM_ROUTE): string {
  return `${base}?${new URLSearchParams({ infrastructure, run_id: runId }).toString()}`;
}

/** Where the latest modifications open: the Log of every infrastructure (`jinfra=*`, as the widget mixes them), on
 *  the page of the infrastructure of the most recent entry. */
export function logHref(infrastructure: string, base = DIAGRAM_ROUTE): string {
  return `${base}?${new URLSearchParams({ infrastructure }).toString()}#mode=journal&jinfra=*`;
}

export type InfraRow = Readonly<{
  name: string;
  devices: number | null;
  /** The start of the collection the row shows and opens. */
  lastStart: string;
  status: Status;
  errors: number | null;
  warnings: number | null;
  /** The most recent collection: its row shows the way in. */
  recent: boolean;
  href: string;
}>;

/** The collection an infrastructure shows and opens: the last one that gave data, else the last one. */
export const shownRun = (item: Infrastructure): LastRun => item.last_good_run ?? item.last_run;

/** An infrastructure's status: a failure after its last good collection is said with its date, in red; otherwise
 *  the status of the collection shown, late when it is more than seven days old. */
export function infraStatus(item: Infrastructure, now: number): Status {
  const failedAfterGood = item.last_run.run_status === "failed" && item.last_good_run !== null;
  if (failedAfterGood) return { key: "failedOn", tone: "error", date: item.last_run.run_start };
  return statusOf(shownRun(item), now);
}

export function infraRows(list: readonly Infrastructure[], now: number, base = DIAGRAM_ROUTE): InfraRow[] {
  const sorted = [...list].sort((a, b) => byStartDesc(a.last_run.run_start, b.last_run.run_start) || a.infrastructure.localeCompare(b.infrastructure));
  return sorted.map((item, index) => ({
    name: item.infrastructure,
    devices: item.devices,
    lastStart: shownRun(item).run_start,
    status: infraStatus(item, now),
    errors: item.checks?.error ?? null,
    warnings: item.checks?.warning ?? null,
    recent: index === 0,
    href: openHref(item.infrastructure, shownRun(item).run_id, base),
  }));
}

export type RunRow = Readonly<RecentRun & { infrastructure: string; key: string; status: Status }>;

export const runKey = (infrastructure: string, runId: string) => JSON.stringify([infrastructure, runId]);

/** A partial collection says how many devices did not answer, when both counts are known and some did not. */
export function runStatus(run: RecentRun): Status {
  const status = statusOf(run);
  const missing = run.devices !== null && run.answered !== null ? run.devices - run.answered : 0;
  return status.key === "partial" && missing > 0 ? { ...status, unreachable: missing } : status;
}

/** The latest collections of all the infrastructures, the most recent first. */
export function latestRuns(list: readonly Infrastructure[], limit = LATEST_RUNS): RunRow[] {
  const all = list.flatMap((item) =>
    item.recent_runs.map((run) => ({ ...run, infrastructure: item.infrastructure, key: runKey(item.infrastructure, run.run_id), status: runStatus(run) })),
  );
  return all
    .sort((a, b) => byStartDesc(a.run_start, b.run_start) || a.infrastructure.localeCompare(b.infrastructure) || a.run_id.localeCompare(b.run_id))
    .slice(0, limit);
}

/** What changed between two collections, counted as the engine counts it (the Diff tab of the diagram). */
export const changeTotal = (summary: DiffSummary): number => diffCount({ summary });

/** What the "compared with the previous" cell says: nothing to compare, still reading, unavailable, or the total. */
export type Compared =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "pending" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "done"; total: number; since: string }>;

export type DiffOutcome = Readonly<{ kind: "ok"; facts: DiffFacts }> | Readonly<{ kind: "failed" }>;

export function comparedOf(run: RunRow, diffs: ReadonlyMap<string, DiffOutcome>): Compared {
  if (!run.previous_run_id) return { kind: "none" };
  const outcome = diffs.get(run.key);
  if (!outcome) return { kind: "pending" };
  if (outcome.kind === "failed") return { kind: "failed" };
  return { kind: "done", total: changeTotal(outcome.facts.summary), since: outcome.facts.beforeStart };
}

// ---- sorting and filtering the two tables: transient (never in the address nor the preferences), stable (rows that
// tie keep the default order: the most recent collection first), a missing value last in both directions.

export type SortDirection = "ascending" | "descending";
export type InfraSortKey = "name" | "devices" | "last" | "status" | "check";
export type RunSortKey = "date" | "infrastructure" | "result" | "devices";
export type TableSort<K extends string> = Readonly<{ key: K; direction: SortDirection }>;

/** A status read as a severity: failed, late, partial, running, succeeded; unknown has none (sorted last). */
const STATUS_RANK: Readonly<Partial<Record<StatusKey, number>>> = { failed: 0, failedOn: 0, stale: 1, partial: 2, running: 3, completed: 4 };
export const statusRank = (status: Status): number | null => STATUS_RANK[status.key] ?? null;

/** Names compare as identifiers do: numbers in them by value, case aside, the same on every machine. */
const NAMES = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

type Value = number | string | null;
type Key<T> = (row: T) => readonly Value[];

function compareValues(a: readonly Value[], b: readonly Value[], sign: number): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const [x, y] = [a[i] ?? null, b[i] ?? null];
    if (x === y) continue;
    if (x === null) return 1; // missing last, whatever the direction
    if (y === null) return -1;
    const order = typeof x === "string" && typeof y === "string" ? NAMES.compare(x, y) : Number(x) - Number(y);
    if (order !== 0) return sign * order;
  }
  return 0;
}

function sortBy<T>(rows: readonly T[], key: Key<T>, direction: SortDirection): T[] {
  const sign = direction === "ascending" ? 1 : -1;
  const keyed = rows.map((row, index) => ({ row, index, value: key(row) }));
  keyed.sort((a, b) => compareValues(a.value, b.value, sign) || a.index - b.index);
  return keyed.map((item) => item.row);
}

const INFRA_KEYS: Readonly<Record<InfraSortKey, Key<InfraRow>>> = {
  name: (row) => [row.name],
  devices: (row) => [row.devices],
  last: (row) => [parseTime(row.lastStart)],
  status: (row) => [statusRank(row.status)],
  // errors, then warnings: a row whose checks were not read has neither
  check: (row) => (row.errors === null || row.warnings === null ? [null] : [row.errors, row.warnings]),
};

const RUN_KEYS: Readonly<Record<RunSortKey, Key<RunRow>>> = {
  date: (row) => [parseTime(row.run_start)],
  infrastructure: (row) => [row.infrastructure],
  result: (row) => [statusRank(row.status)],
  // who answered: the number the cell leads with
  devices: (row) => [row.answered],
};

/** The rows in the order of a column; without one, the default order (the most recent collection first). */
export function sortInfraRows(rows: readonly InfraRow[], sort?: TableSort<InfraSortKey>): InfraRow[] {
  return sort ? sortBy(rows, INFRA_KEYS[sort.key], sort.direction) : [...rows];
}

export function sortRunRows(rows: readonly RunRow[], sort?: TableSort<RunSortKey>): RunRow[] {
  return sort ? sortBy(rows, RUN_KEYS[sort.key], sort.direction) : [...rows];
}

/** The filter over a list of collections by what its rows say: a failure after a good collection is failed, a late
 *  one is late; running and unknown rows are only in "all". A collection is never late: only an infrastructure is. */
export const INFRA_FILTERS = ["all", "completed", "partial", "failed", "stale"] as const;
export const RUN_FILTERS = ["all", "completed", "partial", "failed"] as const;
export type StatusFilter = (typeof INFRA_FILTERS)[number];

const FILTER_OF: Readonly<Partial<Record<StatusKey, StatusFilter>>> = {
  completed: "completed",
  partial: "partial",
  failed: "failed",
  failedOn: "failed",
  stale: "stale",
};

export const filterOf = (status: Status): StatusFilter | null => FILTER_OF[status.key] ?? null;

export function filterRows<T extends Readonly<{ status: Status }>>(rows: readonly T[], filter: StatusFilter): T[] {
  return filter === "all" ? [...rows] : rows.filter((row) => filterOf(row.status) === filter);
}

/** How many rows each segment of the filter holds; "all" counts every row. */
export function filterCounts(rows: readonly Readonly<{ status: Status }>[], filters: readonly StatusFilter[]): Readonly<Record<string, number>> {
  return Object.fromEntries(filters.map((filter) => [filter, filter === "all" ? rows.length : rows.filter((row) => filterOf(row.status) === filter).length]));
}
