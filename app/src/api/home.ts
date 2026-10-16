// What the home reads from the API, validated at the boundary: the archived infrastructures (`GET /api/infrastructures`),
// the latest modifications (`GET /api/intent/journal`), the diff between a run and the one before it
// (`GET /api/diff`, of which the home keeps the summary and the date of the earlier run). A malformed item is dropped,
// a fact the API did not give is null, never guessed; a body that is not the contract's shape is refused whole.
// Shapes: backend `schemas.py` (`InfrastructureList`), `journal.py` (`JournalEntry`), contracts `diff/summary.py`.
import type { Summary } from "@engine/contracts/diff";
import { getJson } from "./http";
import type { Answer, Fetch } from "./http";

export const ROUTES = { infrastructures: "/api/infrastructures", journal: "/api/intent/journal", diff: "/api/diff" } as const;
/** The latest modifications the home shows without a `homeChanges` preference. */
export const JOURNAL_LIMIT = 10;
/** The collections of each infrastructure the home asks for without a `homeRuns` preference (the API's default). */
export const RECENT_RUNS = 6;

export type Checks = Readonly<{ error: number; warning: number; info: number }>;
export type LastRun = Readonly<{ run_id: string; run_start: string; run_end: string | null; run_status: string }>;
/** `devices`: in the collection's scope; `answered`: the devices of its snapshot that answered (null without one). */
export type RecentRun = LastRun & Readonly<{ devices: number | null; answered: number | null; previous_run_id: string | null }>;
export type Infrastructure = Readonly<{
  infrastructure: string;
  runs: number;
  last_run: LastRun;
  /** The most recent collection that completed or was partial: the one that opens; null if there is none. */
  last_good_run: LastRun | null;
  devices: number | null;
  answered: number | null;
  checks: Checks | null;
  recent_runs: readonly RecentRun[];
}>;
export type InfrastructureList = Readonly<{ infrastructures: readonly Infrastructure[]; unreadable: number }>;

export type JournalSubject = Readonly<{ id: string; kind: string; label: string }>;
export type JournalOp = Readonly<{ op: string } & Record<string, unknown>>;
export type JournalEntry = Readonly<{
  infrastructure: string;
  revision: number;
  at: string;
  author: string;
  categories: readonly string[];
  actions: readonly string[];
  created: readonly string[];
  subjects: readonly JournalSubject[];
  ops: readonly JournalOp[];
}>;

/** The counts of a diff's summary, every one of them checked (the engine's `Summary`). */
export type DiffSummary = Readonly<Summary>;
export type DiffFacts = Readonly<{ summary: DiffSummary; beforeStart: string }>;

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const countOrNull = (value: unknown): number | null => (isCount(value) ? value : null);
const textOrNull = (value: unknown): string | null => (isText(value) ? value : null);
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isText) : []);

function lastRun(value: unknown): LastRun | null {
  if (!isRecord(value) || !isText(value.run_id) || !isText(value.run_start) || !isText(value.run_status)) return null;
  return { run_id: value.run_id, run_start: value.run_start, run_end: textOrNull(value.run_end), run_status: value.run_status };
}

function recentRun(value: unknown): RecentRun | null {
  const run = lastRun(value);
  if (!run || !isRecord(value)) return null;
  return { ...run, devices: countOrNull(value.devices), answered: countOrNull(value.answered), previous_run_id: textOrNull(value.previous_run_id) };
}

/** The checks by severity; one severity missing and nothing is said (never a 0 the API did not give). */
function checks(value: unknown): Checks | null {
  if (!isRecord(value) || !isCount(value.error) || !isCount(value.warning) || !isCount(value.info)) return null;
  return { error: value.error, warning: value.warning, info: value.info };
}

function infrastructure(value: unknown): Infrastructure | null {
  if (!isRecord(value) || !isText(value.infrastructure) || !isCount(value.runs)) return null;
  const last = lastRun(value.last_run);
  if (!last) return null;
  const recent = Array.isArray(value.recent_runs) ? value.recent_runs.map(recentRun).filter((run) => run !== null) : [];
  return {
    infrastructure: value.infrastructure,
    runs: value.runs,
    last_run: last,
    last_good_run: lastRun(value.last_good_run),
    devices: countOrNull(value.devices),
    answered: countOrNull(value.answered),
    checks: checks(value.checks),
    recent_runs: recent,
  };
}

/** An entry without its count of runs is not the contract's: the whole answer is refused. */
export function parseInfrastructures(body: unknown): InfrastructureList | null {
  if (!isRecord(body) || !Array.isArray(body.infrastructures)) return null;
  if (body.infrastructures.some((item) => isRecord(item) && !isCount(item.runs))) return null;
  const list = body.infrastructures.map(infrastructure).filter((item) => item !== null);
  return { infrastructures: list, unreadable: countOrNull(body.unreadable) ?? 0 };
}

function subject(value: unknown): JournalSubject | null {
  if (!isRecord(value) || !isText(value.id) || !isText(value.kind)) return null;
  return { id: value.id, kind: value.kind, label: typeof value.label === "string" ? value.label : "" };
}

function entry(value: unknown): JournalEntry | null {
  if (!isRecord(value) || !isText(value.infrastructure) || !isText(value.at) || typeof value.author !== "string") return null;
  if (!isCount(value.revision) || !Array.isArray(value.ops)) return null;
  const ops = value.ops.filter((op): op is JournalOp => isRecord(op) && isText(op.op));
  return {
    infrastructure: value.infrastructure,
    revision: value.revision,
    at: value.at,
    author: value.author,
    categories: texts(value.categories),
    actions: texts(value.actions),
    created: texts(value.created),
    subjects: Array.isArray(value.subjects) ? value.subjects.map(subject).filter((s) => s !== null) : [],
    ops,
  };
}

/** The latest entries, and the lines of the log the server skipped as unreadable. */
export type Journal = Readonly<{ entries: readonly JournalEntry[]; unreadable: number }>;

export function parseJournal(body: unknown): Journal | null {
  if (!isRecord(body) || !Array.isArray(body.entries)) return null;
  return { entries: body.entries.map(entry).filter((item) => item !== null), unreadable: countOrNull(body.unreadable) ?? 0 };
}

const SECTIONS = ["nodes", "interfaces", "links", "aggregates", "mlag_domains", "ha_clusters"] as const;

/** The counts of one part of the summary, all of them present; null otherwise. */
function counts<K extends string>(value: unknown, keys: readonly K[]): Record<K, number> | null {
  if (!isRecord(value) || !keys.every((key) => isCount(value[key]))) return null;
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Record<K, number>;
}

function summaryOf(value: unknown): Summary | null {
  if (!isRecord(value) || !isCount(value.volatile_changes)) return null;
  const sections = SECTIONS.map((name) => [name, counts(value[name], ["added", "removed", "changed"])] as const);
  const checks = counts(value.checks, ["appeared", "resolved", "persisted"]);
  const coverage = counts(value.coverage, ["changed"]);
  const events = counts(value.events, ["rebooted", "flapped"]);
  if (!checks || !coverage || !events || sections.some(([, part]) => !part)) return null;
  return { ...(Object.fromEntries(sections) as Pick<Summary, (typeof SECTIONS)[number]>), checks, coverage, events, volatile_changes: value.volatile_changes };
}

export function parseDiff(body: unknown): DiffFacts | null {
  if (!isRecord(body) || !isRecord(body.before) || !isText(body.before.start_datetime)) return null;
  const summary = summaryOf(body.summary);
  return summary ? { summary, beforeStart: body.before.start_datetime } : null;
}

/** `recent`: the latest collections of each infrastructure (1 to 100): the N most recent of all of them are in it. */
export const loadInfrastructures = (token: string, recent = RECENT_RUNS, fetchFn?: Fetch): Promise<Answer<InfrastructureList>> =>
  getJson(ROUTES.infrastructures, { recent }, token, parseInfrastructures, fetchFn);

export const loadJournal = (token: string, limit = JOURNAL_LIMIT, fetchFn?: Fetch): Promise<Answer<Journal>> =>
  getJson(ROUTES.journal, { limit }, token, parseJournal, fetchFn);

export const loadDiff = (token: string, infrastructure: string, from: string, to: string, fetchFn?: Fetch): Promise<Answer<DiffFacts>> =>
  getJson(ROUTES.diff, { infrastructure, from, to }, token, parseDiff, fetchFn);
