// What the diagram shell reads of a run (the v1's `api/client.ts`, in the v2's grammar): the archived runs of an
// infrastructure (`GET /api/ingest/bundles`), then a run as the engine builds its model: the snapshot (required), and
// with it the ingestion report, the diff against `from`, the intent and the memorized placement (each optional: the run
// opens without it, and says so). Bodies are checked at the boundary for the shape the engine reads; a part outside its
// shape is treated as missing, never guessed. Pure: `fetch` is a parameter, so Node tests every path.
import type { Diff } from "@engine/contracts/diff";
import type { Snapshot } from "@engine/contracts/snapshot";
import type { IngestData, Intent, PageData, Placement } from "@engine/canvas/types";
import { getJson, withParams } from "./http";
import type { Answer, Fetch } from "./http";

export const ROUTES = {
  runs: "/api/ingest/bundles",
  snapshot: "/api/snapshot",
  report: "/api/ingest/report",
  diff: "/api/diff",
  intent: "/api/intent",
  placement: "/api/placement",
} as const;

export type RunEntry = Readonly<{ run_id: string; run_start: string; run_end: string | null; run_status: string; stored_at: string }>;
export type Session = Readonly<{ token: string; infrastructure: string }>;
/** A part of the run the API could not give: the run opens without it. */
export type Missing = "report" | "diff" | "intent" | "placement" | "runs";
export type RunData = Readonly<{ data: PageData; runs: readonly RunEntry[] | null; missing: readonly Missing[]; remembered: boolean }>;

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function runEntry(value: unknown): RunEntry | null {
  if (!isRecord(value) || !isText(value.run_id) || !isText(value.run_start) || !isText(value.run_status)) return null;
  return {
    run_id: value.run_id,
    run_start: value.run_start,
    run_end: isText(value.run_end) ? value.run_end : null,
    run_status: value.run_status,
    stored_at: isText(value.stored_at) ? value.stored_at : "",
  };
}

/** The runs of an infrastructure, in the API's order (by start); an entry outside the shape is dropped. */
export function parseRuns(body: unknown): readonly RunEntry[] | null {
  if (!isRecord(body) || !Array.isArray(body.runs)) return null;
  return body.runs.map(runEntry).filter((run) => run !== null);
}

/** The snapshot as the engine reads it: its version and its lists present. */
export function parseSnapshot(body: unknown): Snapshot | null {
  if (!isRecord(body) || !isText(body.snapshot_version) || !isRecord(body.source)) return null;
  if (!["nodes", "interfaces", "links"].every((key) => Array.isArray(body[key]))) return null;
  return body as unknown as Snapshot;
}

export function parseReport(body: unknown): IngestData | null {
  if (!isRecord(body) || !isRecord(body.summary)) return null;
  return { summary: body.summary as IngestData["summary"], findings: (Array.isArray(body.findings) ? body.findings : []) as IngestData["findings"] };
}

export function parseFullDiff(body: unknown): Diff | null {
  if (!isRecord(body) || !isRecord(body.summary) || !isRecord(body.before) || !isText(body.before.start_datetime)) return null;
  return body as unknown as Diff;
}

export const parseIntent = (body: unknown): Intent | null => (isRecord(body) && typeof body.revision === "number" ? (body as unknown as Intent) : null);
export const parsePlacement = (body: unknown): Placement | null =>
  isRecord(body) && typeof body.revision === "number" && Array.isArray(body.places) ? (body as unknown as Placement) : null;

export const loadRuns = (session: Session, fetchFn?: Fetch): Promise<Answer<readonly RunEntry[]>> =>
  getJson(ROUTES.runs, { infrastructure: session.infrastructure }, session.token, parseRuns, fetchFn);

/** The run `runId`, compared with `from` when given. Only the snapshot can refuse the run; every other part missing
 *  is listed in `missing`. A 401 anywhere is the token's: the run is refused. */
export async function loadRun(session: Session, runId: string, from: string, fetchFn?: Fetch): Promise<Answer<RunData>> {
  const { infrastructure, token } = session;
  const of = { infrastructure };
  const [snapshot, report, diff, intent, placement, runs] = await Promise.all([
    getJson(ROUTES.snapshot, { ...of, run_id: runId }, token, parseSnapshot, fetchFn),
    getJson(ROUTES.report, { ...of, run_id: runId }, token, parseReport, fetchFn),
    from ? getJson(ROUTES.diff, { ...of, from, to: runId }, token, parseFullDiff, fetchFn) : Promise.resolve(null),
    getJson(ROUTES.intent, of, token, parseIntent, fetchFn),
    getJson(ROUTES.placement, of, token, parsePlacement, fetchFn),
    getJson(ROUTES.runs, of, token, parseRuns, fetchFn),
  ]);
  if (snapshot.kind !== "ok") return snapshot;
  const parts = { report, diff, intent, placement, runs } as const;
  if (Object.values(parts).some((part) => part?.kind === "unauthorized")) return { kind: "unauthorized" };
  const missing = (Object.keys(parts) as Missing[]).filter((key) => parts[key] !== null && parts[key]?.kind !== "ok");
  const data: PageData = {
    snapshot: snapshot.data,
    ingest: report.kind === "ok" ? report.data : null,
    origin: `api · ${infrastructure} · ${runId}`,
    catalogue: {},
    ...(diff?.kind === "ok" ? { diff: diff.data } : {}),
    ...(intent.kind === "ok" ? { intent: intent.data } : {}),
    ...(placement.kind === "ok" ? { placement: placement.data } : {}),
  };
  return { kind: "ok", data: { data, runs: runs.kind === "ok" ? runs.data : null, missing, remembered: placement.kind === "ok" } };
}

/** The address of a POST of the placement document (`api/placement.ts`). */
export const placementUrl = (infrastructure: string): string => withParams(ROUTES.placement, { infrastructure });
