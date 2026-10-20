// The token in the tab's storage, the call with its outcomes, the bodies validated at the boundary.
import { describe, expect, it } from "vitest";
import { loadDiff, loadInfrastructures, loadJournal, parseDiff, parseInfrastructures, parseJournal } from "../src/api/home";
import { loadJournalPage, parseEntry, parseJournalPage } from "../src/api/journal";
import { getJson, readAuthor, readToken, TOKEN_KEY, withParams, writeToken } from "../src/api/http";
import type { Fetch, KeyStore } from "../src/api/http";

function memory(initial: Record<string, string> = {}): KeyStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
}
const answer = (status: number, body: unknown, calls: string[] = []): Fetch => async (input, init) => {
  calls.push(`${input} ${(init.headers as Record<string, string>).Authorization}`);
  return { status, ok: status >= 200 && status < 300, json: async () => body };
};

describe("http", () => {
  it("reads and writes the token under the v1's key; a blank token is removed", () => {
    const store = memory();
    expect(readToken(store)).toBe("");
    writeToken(" demo ", store);
    expect(store.data[TOKEN_KEY]).toBe("demo");
    expect(readToken(store)).toBe("demo");
    writeToken("", store);
    expect(TOKEN_KEY in store.data).toBe(false);
    expect(readToken(null)).toBe("");
    expect(readAuthor(memory({ "ld-author": "camille.r" }))).toBe("camille.r");
    const broken: KeyStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => undefined };
    expect(readToken(broken)).toBe("");
    expect(() => writeToken("x", broken)).not.toThrow();
  });

  it("calls with the bearer token and says why a call gave nothing", async () => {
    const calls: string[] = [];
    expect(await getJson("/api/x", { a: "b c", n: 2 }, "t", (b) => b, answer(200, { ok: 1 }, calls))).toEqual({ kind: "ok", data: { ok: 1 } });
    expect(calls).toEqual(["/api/x?a=b+c&n=2 Bearer t"]);
    expect(await getJson("/api/x", {}, "t", (b) => b, answer(401, {}))).toEqual({ kind: "unauthorized" });
    expect(await getJson("/api/x", {}, "t", (b) => b, answer(500, {}))).toEqual({ kind: "failed", status: 500 });
    expect(await getJson("/api/x", {}, "t", () => null, answer(200, {}))).toEqual({ kind: "invalid" });
    const down: Fetch = async () => { throw new TypeError("network"); };
    expect(await getJson("/api/x", {}, "t", (b) => b, down)).toEqual({ kind: "unreachable" });
    const notJson: Fetch = async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("x"); } });
    expect(await getJson("/api/x", {}, "t", (b) => b, notJson)).toEqual({ kind: "invalid" });
    expect(withParams("/api/y", {})).toBe("/api/y");
    expect(withParams("/api/y", [["author", "a"], ["author", "b c"]]), "pairs keep a repeated key").toBe("/api/y?author=a&author=b+c");
  });

  it("reads a page of the log with its facets, refuses one without its total, drops an unknown subject kind", async () => {
    const calls: string[] = [];
    await loadJournalPage("t", [["infrastructure", "lab"], ["author", "a"], ["limit", "200"]], answer(200, { entries: [], total: 0 }, calls));
    expect(calls).toEqual(["/api/intent/journal?infrastructure=lab&author=a&limit=200 Bearer t"]);
    const page = parseJournalPage({
      entries: [{ infrastructure: "a", revision: 1, at: "2026-01-19T00:00:00Z", author: "x", ops: [{ op: "pin" }], subjects: [{ id: "g", kind: "group", label: "G", form: "" }, { id: "z", kind: "zone" }], group: { id: "s1", kind: "session", size: 3 } }],
      total: 12, next: "cur", authors: [{ value: "x", count: 1 }, { value: 3 }], categories: [], infrastructures: [{ value: "a", count: 1 }], actions: [{ value: "modified", count: 1 }], unreadable: 1, start_missing: true,
    });
    expect(page?.entries[0].subjects.map((s) => s.id)).toEqual(["g"]);
    expect(page?.entries[0].group).toEqual({ id: "s1", kind: "session", size: 3 });
    expect(page?.authors).toEqual([{ value: "x", count: 1 }]);
    expect(page).toMatchObject({ total: 12, next: "cur", unreadable: 1, start_missing: true });
    expect(parseJournalPage({ entries: [], total: 0 })).toMatchObject({ next: null, authors: [], start_missing: false });
    expect(parseJournalPage({ entries: [] })).toBeNull();
    expect(parseEntry({ infrastructure: "a", revision: 1, at: "x", author: "", ops: [], group: { id: "s", kind: "other", size: 1 } })?.group, "an unknown group kind is no group").toBeNull();
  });

  it("asks the three routes of the home", async () => {
    const calls: string[] = [];
    await loadInfrastructures("t", undefined, answer(200, { infrastructures: [] }, calls));
    await loadJournal("t", undefined, answer(200, { entries: [] }, calls));
    await loadDiff("t", "demo-dc", "r1", "r2", answer(200, {}, calls));
    await loadInfrastructures("t", 100, answer(200, { infrastructures: [] }, calls));
    await loadJournal("t", 50, answer(200, { entries: [] }, calls));
    expect(calls).toEqual([
      "/api/infrastructures?recent=6 Bearer t",
      "/api/intent/journal?limit=10 Bearer t",
      "/api/diff?infrastructure=demo-dc&from=r1&to=r2 Bearer t",
      "/api/infrastructures?recent=100 Bearer t",
      "/api/intent/journal?limit=50 Bearer t",
    ]);
  });

  it("keeps what follows the contract and drops a malformed item, never guesses it", () => {
    const good = {
      infrastructure: "demo-dc", runs: 3, devices: 30, answered: 28, checks: { error: 6, warning: 21, info: 2 },
      last_run: { run_id: "r3", run_start: "2026-01-19T02:00:00Z", run_end: null, run_status: "failed" },
      last_good_run: { run_id: "r2", run_start: "2026-01-18T02:00:00Z", run_end: null, run_status: "partial" },
      recent_runs: [
        { run_id: "r3", run_start: "2026-01-19T02:00:00Z", run_end: "x", run_status: "completed", devices: null, answered: 4, previous_run_id: "r2" },
        { run_id: "" },
      ],
    };
    const parsed = parseInfrastructures({ infrastructures: [good, { infrastructure: "no-run", runs: 1 }, 4], unreadable: 1 });
    expect(parsed?.infrastructures).toHaveLength(1);
    expect(parsed?.infrastructures[0]).toMatchObject({ answered: 28, last_good_run: { run_id: "r2", run_status: "partial" } });
    expect(parsed?.infrastructures[0].recent_runs).toEqual([
      { run_id: "r3", run_start: "2026-01-19T02:00:00Z", run_end: "x", run_status: "completed", devices: null, answered: 4, previous_run_id: "r2" },
    ]);
    expect(parsed?.unreadable).toBe(1);
    const bare = parseInfrastructures({ infrastructures: [{ ...good, checks: null, devices: null, answered: null, last_good_run: null }] })?.infrastructures[0];
    expect(bare).toMatchObject({ checks: null, devices: null, answered: null, last_good_run: null });
    expect(parseInfrastructures([])).toBeNull();
  });

  it("says nothing of checks when a severity is missing, and refuses an entry without its count of runs", () => {
    const base = {
      infrastructure: "demo-dc", runs: 1, devices: 3, answered: 3,
      last_run: { run_id: "r1", run_start: "2026-01-19T02:00:00Z", run_end: null, run_status: "completed" },
      last_good_run: null, recent_runs: [],
    };
    const checksOf = (checks: unknown) => parseInfrastructures({ infrastructures: [{ ...base, checks }] })?.infrastructures[0].checks;
    expect(checksOf({})).toBeNull();
    expect(checksOf({ error: 1, warning: 2 })).toBeNull();
    expect(checksOf({ error: 1, warning: 2, info: -1 })).toBeNull();
    expect(checksOf({ error: 0, warning: 0, info: 0 })).toEqual({ error: 0, warning: 0, info: 0 });
    const { runs: _runs, ...withoutRuns } = base;
    expect(parseInfrastructures({ infrastructures: [{ ...withoutRuns, checks: null }] })).toBeNull();
    expect(parseInfrastructures({ infrastructures: [{ ...base, runs: "3", checks: null }] })).toBeNull();
  });

  it("reads the journal and its unreadable lines; a blank author is kept, said later as unknown", () => {
    const journal = parseJournal({
      entries: [
        { infrastructure: "a", revision: 1, at: "2026-01-19T00:00:00Z", author: "", ops: [{ op: "pin" }, { x: 1 }], subjects: [{ id: "g", kind: "group" }, {}] },
        { revision: -1 },
      ],
      unreadable: 2,
    });
    expect(journal?.entries).toHaveLength(1);
    expect(journal?.entries[0].ops).toEqual([{ op: "pin" }]);
    expect(journal?.entries[0].subjects).toEqual([{ id: "g", kind: "group", label: "", form: "", unnamed: null, parts: null }]);
    expect(journal?.entries[0].author).toBe("");
    expect(journal?.unreadable).toBe(2);
    expect(parseJournal({ entries: [] })?.unreadable).toBe(0);
    expect(parseJournal({})).toBeNull();
  });

  it("refuses a diff whose summary misses a count the total needs", () => {
    const summary = {
      nodes: { added: 1, removed: 0, changed: 0 }, interfaces: { added: 0, removed: 0, changed: 0 }, links: { added: 0, removed: 0, changed: 0 },
      aggregates: { added: 0, removed: 0, changed: 0 }, mlag_domains: { added: 0, removed: 0, changed: 0 }, ha_clusters: { added: 0, removed: 0, changed: 0 },
      checks: { appeared: 0, resolved: 0, persisted: 0 }, coverage: { changed: 0 }, events: { rebooted: 0, flapped: 0 }, volatile_changes: 0,
    };
    const before = { start_datetime: "2026-01-12T02:00:00Z" };
    expect(parseDiff({ summary, before })).toEqual({ summary, beforeStart: "2026-01-12T02:00:00Z" });
    expect(parseDiff({ summary: { ...summary, coverage: {} }, before })).toBeNull();
    expect(parseDiff({ summary: { ...summary, links: { added: 1 } }, before })).toBeNull();
    expect(parseDiff({ summary, before: {} })).toBeNull();
  });
});
