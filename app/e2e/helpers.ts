// Opening a page for a test: its preferences stored before load, console errors and CSP refusals collected, the
// whole page in the viewport (forced tooltips and lists are placed against the real page, not a 900 px window).
// The home reads the API: `mockApi` answers `/api/**` from the fixtures (e2e/fixtures/, synthetic: lab-sec carries a
// hundred collections), refusing any other token than TOKEN with a 401, as the backend does, and keeping the
// `recent` latest collections of each infrastructure as the backend does; `open(…, { token, prefs })` stores the
// token in the tab and more browser preferences (`homeRuns`) first.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

export type Prefs = Readonly<{ theme: string; accent: string; lang: string }>;
export const LIGHT: Prefs = { theme: "light", accent: "cobalt", lang: "en" };
export const TOKEN = "demo-token";
/** The fixtures' "now": an evening after the last collections (2026-01-19). */
export const NOW = new Date("2026-01-19T19:30:00Z");

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));

/** `refuse`: every answer a 401 (a token revoked meanwhile); `refuseDiffs`: only the diffs (revoked after the page
 *  showed); `infrastructures`: another body for the list (many infrastructures, long names). */
export type ApiMock = {
  calls: string[];
  refuse: boolean;
  refuseDiffs: boolean;
  infrastructures?: unknown;
  diffsInFlight: number;
  mostDiffsInFlight: number;
  /** The diagram: the archived runs of every infrastructure (e2e/fixtures/diagram/runs.json), or these only. */
  runs?: readonly string[];
  /** The diagram: this many weekly runs before the three of the series (no snapshot: they only fill the band). */
  extraRuns?: number;
  /** The diagram: the list of runs answers after this many ms (a loading state to see). */
  delayRuns?: number;
  /** The placement documents written by the page (POST /api/placement), in order. */
  placements: unknown[];
};

/** The diagram's fixtures: a synthetic series of three collections (`ld-contracts generate --seed e2e-shell --devices
 *  8 --runs 3`, correlated by `ld correlate`, its diffs by `ld diff`), served under the infrastructure the page asks
 *  for: the snapshot's source and the diff's runs take the requested names, the rest is the series as generated. */
const DIAGRAM = join(FIXTURES, "diagram");
const diagramFixture = (name: string): unknown => JSON.parse(readFileSync(join(DIAGRAM, name), "utf8"));
const runsOf = (names?: readonly string[], extra = 0) => {
  const all = (diagramFixture("runs.json") as { runs: { run_id: string; run_start: string }[] }).runs;
  const kept = names ? all.filter((run) => names.includes(run.run_id)) : all;
  const first = Date.parse(kept[0]?.run_start ?? "2026-01-05T02:00:00Z");
  const before = Array.from({ length: extra }, (_, i) => {
    const start = new Date(first - (extra - i) * 7 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    return { ...kept[0], run_id: `demo-x${String(i).padStart(3, "0")}`, run_start: start, run_end: start };
  });
  return { runs: [...before, ...kept] };
};
function snapshotOf(infrastructure: string, runId: string): unknown {
  try {
    const snapshot = diagramFixture(`snapshot-${runId}.json`) as { source: Record<string, unknown> };
    return { ...snapshot, source: { ...snapshot.source, infrastructure, collector_run_id: runId } };
  } catch {
    return null;
  }
}
function fullDiffOf(from: string, to: string): unknown {
  try {
    const diff = diagramFixture(`diff-${from}-${to}.json`) as { before: Record<string, unknown>; after: Record<string, unknown> };
    return { ...diff, before: { ...diff.before, collector_run_id: from }, after: { ...diff.after, collector_run_id: to } };
  } catch {
    return null;
  }
}

/** The fixture's list. */
export const infrastructuresFixture = () => fixture("infrastructures.json") as { infrastructures: Record<string, unknown>[]; unreadable: number };

/** Answers the API from the fixtures, refusing what the mock's state says. */
export async function mockApi(page: Page, options: Partial<ApiMock> = {}): Promise<ApiMock> {
  const state: ApiMock = { calls: [], refuse: false, refuseDiffs: false, diffsInFlight: 0, mostDiffsInFlight: 0, placements: [], ...options };
  const diffs = fixture("diffs.json") as Record<string, unknown>;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    state.calls.push(url.pathname + url.search);
    if (state.refuse || route.request().headers().authorization !== `Bearer ${TOKEN}`)
      return route.fulfill({ status: 401, json: { code: "unauthorized", detail: "missing or invalid token" } });
    if (url.pathname === "/api/diff" && state.refuseDiffs) return route.fulfill({ status: 401, json: { code: "unauthorized" } });
    if (url.pathname === "/api/infrastructures") return route.fulfill({ json: recentOnly(state.infrastructures ?? fixture("infrastructures.json"), url) });
    if (url.pathname === "/api/intent/journal") return route.fulfill({ json: fixture("journal.json") });
    const answered = diagramRoute(url, route.request().method(), route.request().postDataJSON.bind(route.request()), state);
    if (answered) {
      if (url.pathname === "/api/ingest/bundles" && state.delayRuns) await new Promise((resolve) => setTimeout(resolve, state.delayRuns));
      return route.fulfill(answered);
    }
    const to = url.searchParams.get("to") ?? "";
    // the hundred collections of lab-sec share one diff: nothing changed
    const diff = url.pathname === "/api/diff" ? (diffs[to] ?? (to.startsWith("lab-") ? diffs["wan-0119"] : undefined)) : undefined;
    if (url.pathname === "/api/diff") {
      // a diff answers after a beat: two asked together would be seen in flight together
      state.diffsInFlight += 1;
      state.mostDiffsInFlight = Math.max(state.mostDiffsInFlight, state.diffsInFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      state.diffsInFlight -= 1;
    }
    return diff ? route.fulfill({ json: diff }) : route.fulfill({ status: 404, json: { code: "not_found" } });
  });
  return state;
}

type Fulfil = { status?: number; json: unknown };

/** The diagram's routes: the runs, a snapshot, its report, the full diff of two archived runs, the intent, the
 *  placement (read, and written: the document grows by what the page sends); null for any other call. */
function diagramRoute(url: URL, method: string, postData: () => unknown, state: ApiMock): Fulfil | null {
  const infrastructure = url.searchParams.get("infrastructure") ?? "";
  const runId = url.searchParams.get("run_id") ?? "";
  const notFound = { status: 404, json: { code: "not_found" } };
  switch (url.pathname) {
    case "/api/ingest/bundles":
      return { json: runsOf(state.runs, state.extraRuns) };
    case "/api/snapshot": {
      const snapshot = snapshotOf(infrastructure, runId);
      return snapshot ? { json: snapshot } : notFound;
    }
    case "/api/ingest/report":
      return snapshotOf(infrastructure, runId) ? { json: diagramFixture("report.json") } : notFound;
    case "/api/intent":
      return { json: { ...(diagramFixture("intent.json") as object), infrastructure } };
    case "/api/placement": {
      if (method === "POST") {
        const write = postData() as { places: unknown[] };
        state.placements.push(write);
        return { json: { infrastructure, revision: state.placements.length, updated_at: "2026-01-19T19:30:00Z", places: write.places } };
      }
      return { json: { ...(diagramFixture("placement.json") as object), infrastructure } };
    }
    case "/api/diff": {
      const diff = fullDiffOf(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "");
      return diff ? { json: diff } : null;
    }
    default:
      return null;
  }
}

/** The `recent` latest collections of each infrastructure (6 by default), as `GET /api/infrastructures` keeps them. */
function recentOnly(body: unknown, url: URL): unknown {
  const recent = Number(url.searchParams.get("recent") ?? 6);
  const list = body as { infrastructures: { recent_runs?: unknown[] }[] };
  return { ...list, infrastructures: list.infrastructures.map((item) => ({ ...item, recent_runs: (item.recent_runs ?? []).slice(0, recent) })) };
}

/** Opens a page with its preferences stored, collects console errors and CSP refusals. */
export async function open(page: Page, path: string, prefs: Prefs, options: { token?: string; prefs?: Record<string, unknown> } = {}) {
  const problems: string[] = [];
  page.on("console", (message) => {
    // a 401 of the API is part of the token flow, not a defect of the page
    if (/status of 401/.test(message.text())) return;
    if (message.type() === "error" || /Content Security Policy/i.test(message.text())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.addInitScript(
    ({ stored, token }) => {
      localStorage.setItem("ld-prefs", JSON.stringify(stored));
      if (token && !sessionStorage.getItem("ld-test-seeded")) {
        sessionStorage.setItem("ld-api-token", token);
        sessionStorage.setItem("ld-test-seeded", "1");
      }
    },
    { stored: { theme: prefs.theme, accent: prefs.accent, language: prefs.lang, ...options.prefs }, token: options.token ?? "" },
  );
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  // the whole page in the viewport: forced tooltips and lists are placed against the real page, not a 900 px window
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height > 900) await page.setViewportSize({ width: 1440, height });
  await page.waitForTimeout(600); // forced tooltips and popovers finish their fade
  return problems;
}
