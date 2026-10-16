// What the diagram shell reads of a run, against a simulated API: the snapshot decides, every other part may be missing
// and is said so; a 401 anywhere refuses the run; the placement writer reads the three answers of the API.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Fetch } from "../src/api/http";
import { makePlacer } from "../src/api/placement";
import { loadRun, loadRuns, parseRuns, parseSnapshot } from "../src/api/run";

const FIXTURES = new URL("../../contracts/fixtures/", import.meta.url);
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));
const SNAPSHOT = read("snapshot-minimal.json") as Record<string, unknown>;
const DIFF = read("diff-skeleton.json");
const RUNS = { runs: [{ run_id: "r1", run_start: "2026-01-01T00:00:00Z", run_end: null, run_status: "completed", produced_at: "x", stored_at: "y", sha256: "z" }, { run_id: 7 }] };
const SESSION = { token: "tok", infrastructure: "demo" };

type Route = (url: URL) => { status: number; body?: unknown };
const api = (routes: Record<string, Route>, calls: string[] = []): Fetch => async (input, init) => {
  const url = new URL(input, "http://x");
  calls.push(url.pathname + url.search);
  const auth = (init.headers as Record<string, string>).Authorization;
  const answer = auth === "Bearer tok" ? (routes[url.pathname] ?? (() => ({ status: 404 })))(url) : { status: 401 };
  return { status: answer.status, ok: answer.status >= 200 && answer.status < 300, json: async () => answer.body };
};
const ok = (body: unknown): Route => () => ({ status: 200, body });
const FULL: Record<string, Route> = {
  "/api/snapshot": ok(SNAPSHOT),
  "/api/ingest/report": ok({ summary: { devices: 1 }, findings: [] }),
  "/api/diff": ok(DIFF),
  "/api/intent": ok({ intent_version: "1.6.0", revision: 3, pins: [] }),
  "/api/placement": ok({ infrastructure: "demo", revision: 1, updated_at: null, places: [] }),
  "/api/ingest/bundles": ok(RUNS),
};

describe("the runs of an infrastructure", () => {
  it("are read in the API's order, an entry outside the shape dropped", async () => {
    const answer = await loadRuns(SESSION, api(FULL));
    expect(answer.kind).toBe("ok");
    if (answer.kind === "ok") expect(answer.data.map((run) => run.run_id)).toEqual(["r1"]);
    expect(parseRuns({ runs: "no" })).toBeNull();
    expect(await loadRuns({ ...SESSION, token: "bad" }, api(FULL))).toEqual({ kind: "unauthorized" });
  });
});

describe("a run", () => {
  it("opens with every part, compared with `from`, and lists what the API asked", async () => {
    const calls: string[] = [];
    const answer = await loadRun(SESSION, "r2", "r1", api(FULL, calls));
    expect(answer.kind).toBe("ok");
    if (answer.kind !== "ok") return;
    expect(answer.data.missing).toEqual([]);
    expect(answer.data.remembered).toBe(true);
    expect(answer.data.data.diff).toBeDefined();
    expect(answer.data.data.intent).toBeDefined();
    expect(answer.data.runs?.length).toBe(1);
    expect(calls).toContain("/api/diff?infrastructure=demo&from=r1&to=r2");
    expect(calls).toContain("/api/snapshot?infrastructure=demo&run_id=r2");
  });

  it("opens without its optional parts and says which are missing; without `from`, no diff is asked", async () => {
    const calls: string[] = [];
    const answer = await loadRun(SESSION, "r2", "", api({ "/api/snapshot": ok(SNAPSHOT), "/api/intent": ok({ oops: true }) }, calls));
    expect(answer.kind).toBe("ok");
    if (answer.kind !== "ok") return;
    expect(answer.data.missing).toEqual(["report", "intent", "placement", "runs"]);
    expect(answer.data.remembered).toBe(false);
    expect(answer.data.data.ingest).toBeNull();
    expect(answer.data.runs).toBeNull();
    expect(calls.some((call) => call.startsWith("/api/diff"))).toBe(false);
  });

  it("is refused by its snapshot alone, and by a 401 anywhere", async () => {
    expect(await loadRun(SESSION, "r2", "r1", api({ ...FULL, "/api/snapshot": () => ({ status: 404 }) }))).toEqual({ kind: "failed", status: 404 });
    expect(await loadRun(SESSION, "r2", "r1", api({ ...FULL, "/api/snapshot": ok({ nodes: [] }) }))).toEqual({ kind: "invalid" });
    expect(await loadRun(SESSION, "r2", "r1", api({ ...FULL, "/api/intent": () => ({ status: 401 }) }))).toEqual({ kind: "unauthorized" });
    expect(parseSnapshot({ ...SNAPSHOT, links: "no" })).toBeNull();
  });
});

describe("the placement writer", () => {
  const say = (key: string, status?: number) => `${key}:${status ?? ""}`;
  const post = (status: number, body?: unknown) => async () => ({ status, json: async () => body });
  const write = { base_revision: 1, replace: false, places: [{ hostname: "a", x: 1, y: 2 }] };
  const doc = { infrastructure: "demo", revision: 2, updated_at: "now", places: [{ hostname: "a", x: 1, y: 2 }] };

  it("reads the document, the stale document, or says why not", async () => {
    expect(await makePlacer(() => SESSION, say, post(200, doc)).save(write)).toEqual({ ok: true, placement: doc });
    expect(await makePlacer(() => SESSION, say, post(409, doc)).save(write)).toEqual({ ok: false, stale: true, placement: doc });
    expect(await makePlacer(() => SESSION, say, post(500, { detail: "x" })).save(write)).toEqual({ ok: false, message: "refused:500" });
    expect(await makePlacer(() => SESSION, say, async () => { throw new Error("down"); }).save(write)).toEqual({ ok: false, message: "unreachable:" });
  });

  it("posts the write under the token, to the infrastructure of the session", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const placer = makePlacer(() => SESSION, say, async (url, init) => { seen.push({ url, init }); return { status: 200, json: async () => doc }; });
    await placer.save(write);
    expect(seen[0].url).toBe("/api/placement?infrastructure=demo");
    expect(seen[0].init.method).toBe("POST");
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(seen[0].init.body))).toEqual(write);
  });
});
