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
  /** The memorized placement, as the page's writes grow it by the backend's rule (`record` keeps what is memorized
   *  and adds the fresh places; `replace` takes the write as it is; a stale `base_revision` is refused with the
   *  current document, 409); read back by GET /api/placement. */
  placement?: PlacementDoc;
  /** The intent document, as the page's writes (POST /api/intent/patches) grow it; read back by GET /api/intent. */
  intent?: IntentDoc;
  /** Every operation the page wrote, in order. */
  ops: Record<string, unknown>[];
};

type PlacementDoc = { infrastructure: string; revision: number; updated_at: string | null; places: { hostname: string }[] };

type IntentDoc = {
  intent_version: string; infrastructure: string; revision: number; updated_at: string | null;
  pins: Record<string, unknown>[]; type_colors: Record<string, unknown>[]; device_colors: Record<string, unknown>[];
  groups: Record<string, unknown>[]; annotations: Record<string, unknown>[]; connectors: Record<string, unknown>[];
};
const ANNOTATION_STYLE: Record<string, Record<string, unknown>> = {
  note: { hue: "amber", fill_opacity: 12, stroke_width: 1, stroke_style: "solid", radius: 8, opacity: 100, text_size: 13, text_weight: "regular", text_font: "sans", text_color: "ink", text_align: "left", text_valign: "top" },
  shape: { hue: "slate", fill_opacity: 8, stroke_width: 2, stroke_style: "solid", radius: 12, opacity: 100, text_size: 12, text_weight: "semibold", text_font: "sans", text_color: "hue", text_align: "center", text_valign: "middle" },
  table: { hue: "slate", fill_opacity: 0, stroke_width: 1, stroke_style: "solid", radius: 6, opacity: 100, text_size: 12, text_weight: "regular", text_font: "mono", text_color: "ink", text_align: "left", text_valign: "top" },
  image: { hue: "slate", fill_opacity: 0, stroke_width: 0, stroke_style: "none", radius: 8, opacity: 100, text_size: 12, text_weight: "regular", text_font: "sans", text_color: "ink", text_align: "left", text_valign: "top" },
  code: { hue: "slate", fill_opacity: 0, stroke_width: 1, stroke_style: "solid", radius: 8, opacity: 100, text_size: 13, text_weight: "regular", text_font: "mono", text_color: "ink", text_align: "left", text_valign: "top" },
};
const ANNOTATION_SIZE: Record<string, { w: number; h: number }> = { note: { w: 220, h: 80 }, shape: { w: 200, h: 120 }, table: { w: 160, h: 52 }, image: { w: 320, h: 240 }, code: { w: 480, h: 240 } };
const CONNECTOR_STYLE = { hue: "slate", stroke_width: 2, stroke_style: "solid", opacity: 100, text_size: 12, text_weight: "semibold", text_font: "sans", text_color: "hue" };
const GROUP_STYLE = { hue: "blue", shape: "rectangle", radius: 16, fill_opacity: 8, stroke_width: 2, stroke_style: "dashed", padding: 24, label_position: "top_left", label_placement: "inside", label_size: 13, label_weight: "semibold", label_font: "sans", label_color: "hue" };

/** A write that names an unknown element: refused as the backend refuses it (422, its code). */
class Refused extends Error {}
function known(map: Map<string, Record<string, unknown>>, id: unknown, code: string): Record<string, unknown> {
  const found = map.get(String(id));
  if (!found) throw new Refused(code);
  return found;
}

/** The backend's rule for a write (backend/src/ld_backend/intent.py `_applied`): the operations in order on the
 *  five lists, last writer wins by key, a created element gets `a<revision+1>-<n>`, the revision grows by one. */
function applyOps(doc: IntentDoc, ops: Record<string, unknown>[], author: string, now: string): IntentDoc {
  const by = (list: Record<string, unknown>[], key: string) => new Map(list.map((item) => [String(item[key]), item]));
  const pins = by(doc.pins, "hostname"), typeColors = by(doc.type_colors, "type"), deviceColors = by(doc.device_colors, "hostname");
  const groups = by(doc.groups, "id"), annotations = by(doc.annotations, "id"), connectors = by(doc.connectors, "id");
  const revision = doc.revision + 1;
  let created = 0, drawn = 0, linked = 0;
  const content = (op: Record<string, unknown>) => op.content as { kind: string };
  for (const op of ops) {
    const { op: kind, ...rest } = op;
    switch (kind) {
      case "pin": pins.set(String(op.hostname), { ...rest, author, at: now }); break;
      case "unpin": pins.delete(String(op.hostname)); break;
      case "color": deviceColors.set(String(op.hostname), { ...rest, author, at: now }); break;
      case "uncolor": deviceColors.delete(String(op.hostname)); break;
      case "color_type": typeColors.set(String(op.type), { ...rest, author, at: now }); break;
      case "uncolor_type": typeColors.delete(String(op.type)); break;
      case "group_create": {
        created += 1;
        const id = `g${revision}-${created}`;
        groups.set(id, { id, label: op.label, description: op.description ?? "", members: [...new Set(op.members as string[])].sort(), style: { ...GROUP_STYLE, ...(op.style as object) }, author, at: now });
        break;
      }
      case "group_update": { const g = known(groups, op.id, "unknown_group"); groups.set(String(op.id), { ...g, ...rest, style: { ...(g.style as object), ...(op.style as object) }, author, at: now }); break; }
      case "group_add": { const g = known(groups, op.id, "unknown_group"); groups.set(String(op.id), { ...g, members: [...new Set([...(g.members as string[]), ...(op.members as string[])])].sort(), author, at: now }); break; }
      case "group_remove": { const g = known(groups, op.id, "unknown_group"); groups.set(String(op.id), { ...g, members: (g.members as string[]).filter((m) => !(op.members as string[]).includes(m)), author, at: now }); break; }
      case "group_delete": known(groups, op.id, "unknown_group"); groups.delete(String(op.id)); break;
      case "annotation_create": {
        drawn += 1;
        const id = `a${revision}-${drawn}`, kindOf = content(op).kind;
        annotations.set(id, { id, anchor: { kind: "free", ref: null }, x: 0, y: 0, z: "front", locked: false, leader: false, ...rest, w: op.w ?? ANNOTATION_SIZE[kindOf].w, h: op.h ?? ANNOTATION_SIZE[kindOf].h, style: { ...ANNOTATION_STYLE[kindOf], ...(op.style as object) }, author, at: now });
        break;
      }
      case "annotation_update": { const a = known(annotations, op.id, "unknown_annotation"); annotations.set(String(op.id), { ...a, ...rest, style: { ...(a.style as object), ...(op.style as object) }, author, at: now }); break; }
      case "annotation_delete": known(annotations, op.id, "unknown_annotation"); annotations.delete(String(op.id)); break;
      case "connector_create": {
        linked += 1;
        const id = `c${revision}-${linked}`;
        connectors.set(id, { id, heads: { start: "none", end: "arrow" }, route: "straight", bend: 0, label: "", z: "front", locked: false, ...rest, style: { ...CONNECTOR_STYLE, ...(op.style as object) }, author, at: now });
        break;
      }
      case "connector_update": { const c = known(connectors, op.id, "unknown_connector"); connectors.set(String(op.id), { ...c, ...rest, style: { ...(c.style as object), ...(op.style as object) }, author, at: now }); break; }
      case "connector_delete": known(connectors, op.id, "unknown_connector"); connectors.delete(String(op.id)); break;
      default: break;
    }
  }
  const sorted = (map: Map<string, Record<string, unknown>>) => [...map.keys()].sort().map((key) => map.get(key) as Record<string, unknown>);
  return { ...doc, revision, updated_at: now, pins: sorted(pins), type_colors: sorted(typeColors), device_colors: sorted(deviceColors), groups: sorted(groups), annotations: sorted(annotations), connectors: sorted(connectors) };
}

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
  const state: ApiMock = { calls: [], refuse: false, refuseDiffs: false, diffsInFlight: 0, mostDiffsInFlight: 0, placements: [], ops: [], ...options };
  const diffs = fixture("diffs.json") as Record<string, unknown>;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    state.calls.push(url.pathname + url.search);
    if (state.refuse || route.request().headers().authorization !== `Bearer ${TOKEN}`)
      return route.fulfill({ status: 401, json: { code: "unauthorized", detail: "missing or invalid token" } });
    if (url.pathname === "/api/diff" && state.refuseDiffs) return route.fulfill({ status: 401, json: { code: "unauthorized" } });
    if (url.pathname === "/api/infrastructures") return route.fulfill({ json: recentOnly(state.infrastructures ?? fixture("infrastructures.json"), url) });
    if (url.pathname === "/api/intent/journal") return route.fulfill({ json: journalPage(url) });
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
      state.intent ??= { ...(diagramFixture("intent.json") as IntentDoc), infrastructure };
      return { json: state.intent };
    case "/api/intent/patches": {
      if (method !== "POST") return notFound;
      state.intent ??= { ...(diagramFixture("intent.json") as IntentDoc), infrastructure };
      const write = postData() as { author: string; ops: Record<string, unknown>[] };
      state.ops.push(...write.ops);
      try {
        state.intent = applyOps(state.intent, write.ops, write.author, "2026-01-19T19:31:00Z");
      } catch (error) {
        if (error instanceof Refused) return { status: 422, json: { code: error.message, detail: error.message } };
        throw error;
      }
      return { json: state.intent };
    }
    case "/api/placement": {
      state.placement ??= { ...(diagramFixture("placement.json") as PlacementDoc), infrastructure };
      if (method === "POST") {
        const write = postData() as { base_revision: number; replace: boolean; places: { hostname: string }[] };
        state.placements.push(write);
        if (write.base_revision !== state.placement.revision) return { status: 409, json: state.placement }; // the backend answers the current document itself
        const known = new Set(state.placement.places.map((place) => place.hostname));
        const places = write.replace ? write.places : [...state.placement.places, ...write.places.filter((place) => !known.has(place.hostname))];
        if (!write.replace && places.length === state.placement.places.length) return { json: state.placement };
        state.placement = { ...state.placement, revision: state.placement.revision + 1, updated_at: "2026-01-19T19:30:00Z", places };
        return { json: state.placement };
      }
      return { json: state.placement };
    }
    case "/api/diff": {
      const diff = fullDiffOf(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "");
      return diff ? { json: diff } : null;
    }
    default:
      return null;
  }
}

type JournalRow = { infrastructure: string; revision: number; at: string; author: string; created: string[]; subjects: { id: string; label: string }[]; ops: Record<string, unknown>[] };
const categoryOf = (op: string): string =>
  op === "pin" || op === "unpin" ? "positions" : op.startsWith("color") || op.startsWith("uncolor") ? "colors" : op.startsWith("group_") ? "groups" : op.startsWith("annotation_") ? "annotations" : op.startsWith("connector_") ? "connectors" : "other";
const actionOf = (op: string): string => (op.endsWith("_create") ? "created" : op.endsWith("_delete") || op === "journal_prune" ? "deleted" : "modified");
const refsOf = (row: JournalRow): string[] => [
  ...row.created,
  ...row.ops.flatMap((op) => [op.hostname, op.id, ...(Array.isArray(op.members) ? op.members : [])].filter((v): v is string => typeof v === "string" && v.length > 0)),
];
const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const haystack = (row: JournalRow): string => fold([row.author, ...refsOf(row), ...row.subjects.map((s) => s.label), ...row.ops.map((op) => String(op.op))].join("\n"));
const facetsOf = (all: JournalRow[], kept: JournalRow[], of: (row: JournalRow) => string[]) =>
  [...new Set(all.flatMap(of))].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, count: kept.filter((row) => of(row).includes(value)).length }));

/** `GET /api/intent/journal` as the backend answers it (`journal.py`): the fixture's entries filtered by the query
 *  (infrastructure, authors, categories, actions, the object's history, the words, the period, a link's `start`),
 *  the facets over the whole log with their counts under the filters, the page after the `before` cursor (an index),
 *  the most recent first. */
function journalPage(url: URL): unknown {
  const q = url.searchParams;
  const all = (fixture("journal.json") as { entries: JournalRow[] }).entries;
  const categories = (row: JournalRow) => [...new Set(row.ops.map((op) => categoryOf(String(op.op))))];
  const actions = (row: JournalRow) => [...new Set(row.ops.map((op) => actionOf(String(op.op))))];
  const many = (key: string) => q.getAll(key);
  const infra = q.get("infrastructure"), object = q.get("object"), words = fold(q.get("q") ?? "").split(/\s+/).filter(Boolean);
  const since = q.get("since") ? Date.parse(q.get("since") as string) : null, until = q.get("until") ? Date.parse(q.get("until") as string) : null;
  const start = q.get("start") ? Number(q.get("start")) : null;
  const kept = all.filter(
    (row) =>
      (!infra || row.infrastructure === infra) &&
      (!many("author").length || many("author").includes(row.author)) &&
      (!many("category").length || categories(row).some((c) => many("category").includes(c))) &&
      (!many("action").length || actions(row).some((a) => many("action").includes(a))) &&
      (!object || refsOf(row).includes(object)) &&
      words.every((word) => haystack(row).includes(word)) &&
      (since === null || Date.parse(row.at) >= since) &&
      (until === null || Date.parse(row.at) < until),
  );
  const from = q.get("before") ? Number(q.get("before")) : start !== null ? Math.max(0, kept.findIndex((row) => row.revision <= start)) : 0;
  const limit = Number(q.get("limit") ?? 100);
  const page = kept.slice(from, from + limit);
  return {
    entries: page.map((row) => ({ ...row, categories: categories(row), actions: actions(row) })),
    total: kept.length,
    next: from + limit < kept.length ? String(from + limit) : null,
    authors: facetsOf(all, kept, (row) => [row.author]),
    categories: facetsOf(all, kept, categories),
    infrastructures: facetsOf(all, kept, (row) => [row.infrastructure]),
    actions: facetsOf(all, kept, actions),
    unreadable: 0,
    start_missing: start !== null && !kept.some((row) => row.revision === start),
  };
}

/** The `recent` latest collections of each infrastructure (6 by default), as `GET /api/infrastructures` keeps them. */
function recentOnly(body: unknown, url: URL): unknown {
  const recent = Number(url.searchParams.get("recent") ?? 6);
  const list = body as { infrastructures: { recent_runs?: unknown[] }[] };
  return { ...list, infrastructures: list.infrastructures.map((item) => ({ ...item, recent_runs: (item.recent_runs ?? []).slice(0, recent) })) };
}

/** Opens a page with its preferences stored, collects console errors and CSP refusals. */
export async function open(page: Page, path: string, prefs: Prefs, options: { token?: string; prefs?: Record<string, unknown>; author?: string } = {}) {
  const problems: string[] = [];
  page.on("console", (message) => {
    // a 401 of the API is part of the token flow, not a defect of the page
    if (/status of 401/.test(message.text())) return;
    if (message.type() === "error" || /Content Security Policy/i.test(message.text())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.addInitScript(
    ({ stored, token, author }) => {
      localStorage.setItem("ld-prefs", JSON.stringify(stored));
      if (author) localStorage.setItem("ld-author", author);
      if (token && !sessionStorage.getItem("ld-test-seeded")) {
        sessionStorage.setItem("ld-api-token", token);
        sessionStorage.setItem("ld-test-seeded", "1");
      }
    },
    { stored: { theme: prefs.theme, accent: prefs.accent, language: prefs.lang, ...options.prefs }, token: options.token ?? "", author: options.author ?? "" },
  );
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  // the whole page in the viewport: forced tooltips and lists are placed against the real page, not a 900 px window
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height > 900) await page.setViewportSize({ width: 1440, height });
  await page.waitForTimeout(600); // forced tooltips and popovers finish their fade
  return problems;
}
