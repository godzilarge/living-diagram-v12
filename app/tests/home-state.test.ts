// The home's rows: sorted, merged, the last good collection shown and opened, a failure after it said in red, late
// after seven days, who answered, the change totals of a diff counted as the engine counts them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDiff } from "../src/api/home";
import type { DiffSummary, Infrastructure, LastRun, RecentRun } from "../src/api/home";
import {
  changeTotal, comparedOf, filterCounts, filterOf, filterRows, INFRA_FILTERS, infraRows, infraStatus, latestRuns, openHref, RUN_FILTERS, runKey,
  runStatus, sortInfraRows, sortRunRows, statusOf, statusRank,
} from "../src/state/home";
import type { InfraRow } from "../src/state/home";

const NOW = Date.parse("2026-01-19T19:30:00Z");
const run = (id: string, start: string, status = "completed", previous: string | null = null, answered: number | null = 30): RecentRun => ({
  run_id: id, run_start: start, run_end: null, run_status: status, devices: 30, answered, previous_run_id: previous,
});
const good = (runs: RecentRun[]): LastRun | null => runs.find((r) => r.run_status === "completed" || r.run_status === "partial") ?? null;
const infra = (name: string, runs: RecentRun[], checks: Infrastructure["checks"] = { error: 1, warning: 2, info: 0 }): Infrastructure => ({
  infrastructure: name, runs: runs.length, last_run: runs[0], last_good_run: good(runs), devices: 30, answered: runs[0].answered, checks, recent_runs: runs,
});
const LIST = [
  infra("site-lyon", [run("l2", "2026-01-19T01:30:00Z", "completed", "l1"), run("l1", "2026-01-18T01:30:00Z")]),
  infra("demo-dc", [run("d3", "2026-01-19T02:00:00Z", "partial", "d2", 28), run("d2", "2026-01-12T02:00:00Z", "completed", "d1"), run("d1", "2026-01-05T02:00:00Z")]),
  infra("lab-sec", [run("s1", "2026-01-12T14:20:00Z", "failed", null, null)], null),
];
const DIFFS = JSON.parse(readFileSync(new URL("../e2e/fixtures/diffs.json", import.meta.url), "utf8")) as Record<string, unknown>;

describe("home state", () => {
  it("lists the infrastructures by their last collection, the most recent leading the way", () => {
    const rows = infraRows(LIST, NOW);
    expect(rows.map((r) => r.name)).toEqual(["demo-dc", "site-lyon", "lab-sec"]);
    expect(rows.map((r) => r.recent)).toEqual([true, false, false]);
    expect(rows[0]).toMatchObject({ errors: 1, warnings: 2, status: { key: "partial", tone: "warning" } });
    expect(rows[2]).toMatchObject({ errors: null, warnings: null, status: { key: "stale", tone: "warning", days: 7 } });
    expect(rows[0].href).toBe("/?infrastructure=demo-dc&run_id=d3");
  });

  it("shows and opens the last good collection when the last one failed, and says the failure in red", () => {
    const rennes = infra("campus-rennes", [run("r2", "2026-01-19T04:00:00Z", "failed", "r1", null), run("r1", "2026-01-18T04:00:00Z")]);
    const [row] = infraRows([rennes], NOW);
    expect(row.lastStart).toBe("2026-01-18T04:00:00Z");
    expect(row.status).toEqual({ key: "failedOn", tone: "error", date: "2026-01-19T04:00:00Z" });
    expect(row.href).toBe("/?infrastructure=campus-rennes&run_id=r1");
  });

  it("without any good collection, shows the last one, its status, and opens it", () => {
    const only = infra("lab-new", [run("n1", "2026-01-19T04:00:00Z", "failed", null, null)]);
    const [row] = infraRows([only], NOW);
    expect(row).toMatchObject({ lastStart: "2026-01-19T04:00:00Z", status: { key: "failed", tone: "error" }, href: "/?infrastructure=lab-new&run_id=n1" });
    const old = infra("lab-old", [run("o1", "2026-01-02T04:00:00Z", "failed", null, null)]);
    expect(infraStatus(old, NOW)).toEqual({ key: "stale", tone: "warning", days: 17 });
  });

  it("judges lateness on the last good collection, the last one only when there is none", () => {
    const running = infra("wan", [run("w2", "2026-01-19T04:00:00Z", "running", "w1", null), run("w1", "2026-01-09T04:00:00Z")]);
    expect(infraStatus(running, NOW)).toEqual({ key: "stale", tone: "warning", days: 10 });
    const fresh = infra("wan", [run("w2", "2026-01-19T04:00:00Z", "running", "w1", null)]);
    expect(infraStatus(fresh, NOW).key).toBe("running");
    const failedLate = infra("wan", [run("w3", "2026-01-19T04:00:00Z", "failed", "w1", null), run("w1", "2026-01-09T04:00:00Z")]);
    expect(infraStatus(failedLate, NOW)).toMatchObject({ key: "failedOn", tone: "error" });
  });

  it("says each collection's result, late only after seven days", () => {
    expect(statusOf({ run_status: "failed", run_start: "2026-01-19T00:00:00Z" }, NOW)).toEqual({ key: "failed", tone: "error" });
    expect(statusOf({ run_status: "running", run_start: "2026-01-19T00:00:00Z" }, NOW).key).toBe("running");
    expect(statusOf({ run_status: "odd", run_start: "2026-01-19T00:00:00Z" }, NOW).key).toBe("unknown");
    expect(statusOf({ run_status: "completed", run_start: "2026-01-12T19:30:00Z" }, NOW).key).toBe("completed");
    expect(statusOf({ run_status: "completed", run_start: "2026-01-12T19:29:00Z" }, NOW)).toEqual({ key: "stale", tone: "warning", days: 7 });
    expect(statusOf({ run_status: "completed", run_start: "2020-01-01T00:00:00Z" }).key).toBe("completed");
  });

  it("counts the devices of a partial collection that did not answer, only when both counts are known", () => {
    expect(runStatus(run("p", "2026-01-19T00:00:00Z", "partial", null, 27))).toEqual({ key: "partial", tone: "warning", unreachable: 3 });
    expect(runStatus(run("p", "2026-01-19T00:00:00Z", "partial", null, 30))).toEqual({ key: "partial", tone: "warning" });
    expect(runStatus(run("p", "2026-01-19T00:00:00Z", "partial", null, null))).toEqual({ key: "partial", tone: "warning" });
    expect(runStatus({ ...run("p", "2026-01-19T00:00:00Z", "partial", null, 20), devices: null })).toEqual({ key: "partial", tone: "warning" });
    expect(runStatus(run("c", "2026-01-19T00:00:00Z", "completed", null, 20)).unreachable).toBeUndefined();
  });

  it("merges the latest collections of every infrastructure, the most recent first", () => {
    const runs = latestRuns(LIST, 4);
    expect(runs.map((r) => r.run_id)).toEqual(["d3", "l2", "l1", "s1"]);
    expect(runs[0]).toMatchObject({ infrastructure: "demo-dc", key: runKey("demo-dc", "d3"), answered: 28, status: { key: "partial", unreachable: 2 } });
    expect(latestRuns(LIST)).toHaveLength(6);
  });

  it("counts a diff as the engine does: entities, checks appeared and resolved, coverage, events", () => {
    const total = (to: string) => changeTotal((parseDiff(DIFFS[to]) as { summary: DiffSummary }).summary);
    expect(total("rennes-0119")).toBe(6);
    expect(total("demo-0119")).toBe(20);
    expect(total("wan-0119")).toBe(0);
  });

  it("tells the compared cell what it knows", () => {
    const [d3, , l1] = latestRuns(LIST);
    expect(comparedOf(l1, new Map())).toEqual({ kind: "none" });
    expect(comparedOf(d3, new Map())).toEqual({ kind: "pending" });
    expect(comparedOf(d3, new Map([[d3.key, { kind: "failed" }]]))).toEqual({ kind: "failed" });
    const facts = parseDiff(DIFFS["demo-0119"]);
    if (!facts) throw new Error("fixture");
    expect(comparedOf(d3, new Map([[d3.key, { kind: "ok", facts }]]))).toEqual({ kind: "done", total: 20, since: "2026-01-12T02:00:00Z" });
  });

  it("opens an infrastructure in the v1 with its address escaped", () => {
    expect(openHref("a b&c", "r/1")).toBe("/?infrastructure=a+b%26c&run_id=r%2F1");
  });
});

/** Five infrastructures, one in each state: failed after a good one, late, partial, running, succeeded. */
const FIVE = [
  infra("b-failed", [run("f2", "2026-01-19T05:00:00Z", "failed", "f1", null), run("f1", "2026-01-18T05:00:00Z")], { error: 3, warning: 0, info: 0 }),
  infra("site-10", [run("o1", "2026-01-02T04:00:00Z")], { error: 0, warning: 9, info: 0 }),
  infra("site-9", [run("p1", "2026-01-19T03:00:00Z", "partial", null, 20)], { error: 3, warning: 4, info: 0 }),
  infra("A-running", [run("r1", "2026-01-19T02:00:00Z", "running", null, null)], null),
  { ...infra("c-ok", [run("c1", "2026-01-19T01:00:00Z")], { error: 0, warning: 1, info: 0 }), devices: null },
];

describe("home sorting and filtering", () => {
  const rows = infraRows(FIVE, NOW);
  const names = (list: readonly InfraRow[]) => list.map((r) => r.name);

  it("keeps the default order without a column, and never touches its input", () => {
    const copy = [...rows];
    expect(names(sortInfraRows(rows))).toEqual(["b-failed", "site-9", "A-running", "c-ok", "site-10"]);
    sortInfraRows(rows, { key: "name", direction: "descending" });
    expect(rows).toEqual(copy);
  });

  it("orders names as identifiers: case aside, numbers by value", () => {
    expect(names(sortInfraRows(rows, { key: "name", direction: "ascending" }))).toEqual(["A-running", "b-failed", "c-ok", "site-9", "site-10"]);
    expect(names(sortInfraRows(rows, { key: "name", direction: "descending" }))).toEqual(["site-10", "site-9", "c-ok", "b-failed", "A-running"]);
  });

  it("orders a state by severity: failed, late, partial, running, succeeded", () => {
    expect(names(sortInfraRows(rows, { key: "status", direction: "ascending" }))).toEqual(["b-failed", "site-10", "site-9", "A-running", "c-ok"]);
    expect(names(sortInfraRows(rows, { key: "status", direction: "descending" }))).toEqual(["c-ok", "A-running", "site-9", "site-10", "b-failed"]);
    expect(statusRank({ key: "unknown", tone: "neutral" })).toBeNull();
  });

  it("orders the checks by errors then warnings, and puts a missing value last in both directions", () => {
    expect(names(sortInfraRows(rows, { key: "check", direction: "descending" }))).toEqual(["site-9", "b-failed", "site-10", "c-ok", "A-running"]);
    expect(names(sortInfraRows(rows, { key: "check", direction: "ascending" }))).toEqual(["c-ok", "site-10", "b-failed", "site-9", "A-running"]);
    expect(names(sortInfraRows(rows, { key: "devices", direction: "ascending" })).at(-1)).toBe("c-ok");
    expect(names(sortInfraRows(rows, { key: "devices", direction: "descending" })).at(-1)).toBe("c-ok");
  });

  it("is stable: rows that tie keep the default order, in both directions", () => {
    // four infrastructures have 30 devices: they keep the most recent collection first
    const tied = ["b-failed", "site-9", "A-running", "site-10"];
    expect(names(sortInfraRows(rows, { key: "devices", direction: "ascending" })).slice(0, 4)).toEqual(tied);
    expect(names(sortInfraRows(rows, { key: "devices", direction: "descending" })).slice(0, 4)).toEqual(tied);
  });

  it("orders by the date the row shows: the last good collection", () => {
    expect(names(sortInfraRows(rows, { key: "last", direction: "descending" }))).toEqual(["site-9", "A-running", "c-ok", "b-failed", "site-10"]);
  });

  it("sorts the latest collections by date, infrastructure, result and who answered", () => {
    const runs = latestRuns(FIVE, 10);
    const ids = (sort: Parameters<typeof sortRunRows>[1]) => sortRunRows(runs, sort).map((r) => r.run_id);
    expect(ids(undefined)).toEqual(["f2", "p1", "r1", "c1", "f1", "o1"]);
    expect(ids({ key: "date", direction: "ascending" })).toEqual(["o1", "f1", "c1", "r1", "p1", "f2"]);
    expect(ids({ key: "infrastructure", direction: "ascending" })).toEqual(["r1", "f2", "f1", "c1", "p1", "o1"]);
    expect(ids({ key: "result", direction: "ascending" })).toEqual(["f2", "p1", "r1", "c1", "f1", "o1"]);
    expect(ids({ key: "devices", direction: "descending" })).toEqual(["c1", "f1", "o1", "p1", "f2", "r1"]);
    expect(ids({ key: "devices", direction: "ascending" })).toEqual(["p1", "c1", "f1", "o1", "f2", "r1"]);
  });

  it("filters by what the row says: a failure after a good collection is failed, late is its own; running only in all", () => {
    expect(names(filterRows(rows, "failed"))).toEqual(["b-failed"]);
    expect(names(filterRows(rows, "stale"))).toEqual(["site-10"]);
    expect(names(filterRows(rows, "all"))).toHaveLength(5);
    expect(filterOf({ key: "running", tone: "neutral" })).toBeNull();
    expect(filterCounts(rows, INFRA_FILTERS)).toEqual({ all: 5, completed: 1, partial: 1, failed: 1, stale: 1 });
    expect(filterCounts(latestRuns(FIVE, 10), RUN_FILTERS)).toEqual({ all: 6, completed: 3, partial: 1, failed: 1 });
    expect(filterCounts([], RUN_FILTERS)).toEqual({ all: 0, completed: 0, partial: 0, failed: 0 });
  });
});
