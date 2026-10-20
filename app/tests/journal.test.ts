// The Log view's pure rules: the filters in the address (round trip, tolerance), the query they make, the folds, the
// days, the time words, the link to an entry, what the context menu's History row opens.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { JournalEntry, JournalOp } from "../src/api/journal";
import { setLanguage } from "../src/i18n";
import { DEFAULT_VIEW, formatHash, parseHash } from "../src/state/address";
import {
  byDay, dayLabel, DEFAULT_FILTERS, entriesOf, entryLink, filtered, firstEntry, fold, formatFilters, historyObjectOf, isTrace, keyOf, localDay, mergedOp,
  newer, parseFilters, queryOf, rangeLabel, sameFilters, sessionHosts, timeLabel, zoneLabel,
} from "../src/state/journal";
import { merged, reloadLimit } from "../src/state/journal-load";

const NOW = Date.parse("2026-10-09T12:00:00Z");
export const entry = (ops: readonly JournalOp[], more: Partial<JournalEntry> = {}): JournalEntry => ({
  infrastructure: "lab", revision: 7, at: "2026-10-09T10:00:00Z", author: "orhan", categories: [], actions: [], created: [], subjects: [], group: null, ops, ...more,
});

beforeAll(() => setLanguage("en"));
afterEach(() => setLanguage("en"));

describe("the log's filters", () => {
  it("round trip through the address, the defaults unwritten", () => {
    const f = { ...DEFAULT_FILTERS, q: "cœur dc02", authors: ["Orhan TOSUN", "alice"], categories: ["groups", "positions"] as const, infrastructure: "*", period: "7d" as const };
    const written = formatFilters(f);
    expect(written.join("&")).toBe("jq=c%C5%93ur%20dc02&jau=Orhan%20TOSUN&jau=alice&jcat=groups,positions&jinfra=*&jp=7d");
    const pairs = written.map((part) => part.split("=").map(decodeURIComponent) as [string, string]);
    expect(parseFilters(pairs)).toEqual(f);
    expect(formatFilters(DEFAULT_FILTERS)).toEqual([]);
    expect(filtered(DEFAULT_FILTERS)).toBe(false);
    expect(filtered({ ...DEFAULT_FILTERS, rev: 3 }), "a link to an entry narrows nothing").toBe(false);
    expect(filtered({ ...DEFAULT_FILTERS, object: "x" })).toBe(true);
  });

  it("tolerates what it does not know and drops what cannot hold", () => {
    const f = parseFilters([["jcat", "groups,teleport"], ["jp", "1y"], ["jau", ""], ["jau", "bob"], ["jau", "bob"], ["jrev", "12"], ["jobj", "g1-1"]]);
    expect(f.categories).toEqual(["groups"]);
    expect(f.period).toBe("all");
    expect(f.authors).toEqual(["bob"]);
    expect(f.rev).toBe(12);
    expect(f.object).toBe("g1-1");
    // "all infrastructures": neither an object's history nor a link (unique in their infrastructure only)
    const all = parseFilters([["jinfra", "*"], ["jrev", "12"], ["jobj", "g1-1"]]);
    expect(all.object).toBe("");
    expect(all.rev).toBeNull();
    // a range without a bound is no range
    expect(parseFilters([["jp", "range"]]).period).toBe("all");
    expect(parseFilters([["jp", "range"], ["jfrom", "2026-09-01"]])).toMatchObject({ period: "range", from: "2026-09-01", to: "" });
    expect(parseFilters([["jp", "range"], ["jfrom", "2026-02-30"]]).period, "an impossible day does not read").toBe("all");
    expect(localDay("2026-02-30")).toBeNull();
    expect(localDay("2026-10-09")?.getDate()).toBe(9);
  });

  it("live in the view, written in the address in Log mode only", () => {
    const view = parseHash("#mode=journal&jq=core&jp=24h&node=x").view;
    expect(view.mode).toBe("journal");
    expect(view.journal).toMatchObject({ q: "core", period: "24h" });
    expect(formatHash(view, null)).toBe("#mode=journal&jq=core&jp=24h");
    expect(formatHash(view, { kind: "node", token: "x" }), "the Log names no selection").toBe("#mode=journal&jq=core&jp=24h");
    expect(formatHash({ ...view, mode: "diagram" }, null), "the Diagram keeps them unwritten").toBe("");
    expect(parseHash("#jq=core").view.journal.q, "read whatever the mode").toBe("core");
    expect(DEFAULT_VIEW.journal).toBe(DEFAULT_FILTERS);
    expect(sameFilters(view.journal, { ...view.journal, authors: [] })).toBe(true);
    expect(sameFilters(view.journal, { ...view.journal, q: "x" })).toBe(false);
  });

  it("make the query: the infrastructure open by default, the period since now, a link's start without a cursor", () => {
    const f = { ...DEFAULT_FILTERS, q: " cœur ", authors: ["a", "b"], categories: ["groups"] as const, actions: ["deleted"] as const, period: "24h" as const, object: "g1", rev: 9 };
    expect(queryOf(f, "lab", NOW, "CUR")).toEqual([
      ["infrastructure", "lab"], ["author", "a"], ["author", "b"], ["category", "groups"], ["action", "deleted"], ["object", "g1"], ["q", "cœur"], ["since", "2026-10-08T12:00:00Z"], ["before", "CUR"],
    ]);
    expect(queryOf(f, "lab", NOW, null, 200).slice(-2)).toEqual([["start", "9"], ["limit", "200"]]);
    expect(queryOf({ ...DEFAULT_FILTERS, infrastructure: "*", object: "g1", rev: 9 }, "lab", NOW), "all infrastructures: no parameter, no object, no start").toEqual([]);
    expect(queryOf({ ...DEFAULT_FILTERS, infrastructure: "other" }, "lab", NOW)).toEqual([["infrastructure", "other"]]);
    const range = queryOf({ ...DEFAULT_FILTERS, period: "range", from: "2026-09-01", to: "2026-09-15" }, "", NOW);
    expect(range[0][0]).toBe("since");
    expect(range[1][0]).toBe("until");
    expect(new Date(range[1][1]).getTime() - new Date(range[0][1]).getTime(), "the last day included").toBe(15 * 864e5);
  });
});

describe("the log's time", () => {
  it("says today, yesterday, else the day in words, in the page's language", () => {
    expect(dayLabel("2026-10-09T08:00:00Z", NOW)).toBe("today");
    expect(dayLabel("2026-10-08T08:00:00Z", NOW)).toBe("yesterday");
    expect(dayLabel("2026-10-01T08:00:00Z", NOW)).toMatch(/^Thursday,? 1 October 2026$/);
    setLanguage("fr");
    expect(dayLabel("2026-10-09T08:00:00Z", NOW)).toBe("aujourd'hui");
    expect(dayLabel("2026-10-01T08:00:00Z", NOW)).toBe("jeudi 1er octobre 2026");
    expect(timeLabel("2026-10-09T08:05:00Z")).toMatch(/^\d{2}:\d{2}$/);
    expect(zoneLabel(NOW)).toMatch(/^UTC/);
    expect(rangeLabel("2026-09-01", "2026-09-15", NOW)).toMatch(/sept/);
    expect(rangeLabel("2026-09-01", "", NOW)).toMatch(/^depuis/);
    expect(rangeLabel("", "2025-09-15", NOW), "another year is said").toMatch(/2025/);
  });
});

describe("the feed", () => {
  const r = (id: string, size: number, kind: "repeat" | "session" = "repeat") => ({ group: { id, kind, size } });
  it("folds the neighbouring entries of one group, never two groups, and reads an entry alone otherwise", () => {
    const list = [
      entry([{ op: "annotation_update", id: "a1", style: {} }], { revision: 9, ...r("f1", 3) }),
      entry([{ op: "annotation_update", id: "a1", x: 1 }], { revision: 8, ...r("f1", 3) }),
      entry([{ op: "group_delete", id: "g1" }], { revision: 7 }),
      entry([{ op: "pin", hostname: "a" }], { revision: 6, ...r("s1", 312, "session") }),
      entry([{ op: "unpin", hostname: "b" }], { revision: 5, ...r("s1", 312, "session") }),
      entry([{ op: "pin", hostname: "c" }], { revision: 4, ...r("s1", 312, "session"), infrastructure: "other" }),
    ];
    const items = fold(list);
    expect(items.map((i) => i.kind)).toEqual(["fold", "entry", "session", "entry"]);
    expect(items[0].kind === "fold" && items[0].size).toBe(3);
    expect(entriesOf(items[2]).map((e) => e.revision)).toEqual([6, 5]);
    expect(firstEntry(items[3]).infrastructure, "another infrastructure never joins a group").toBe("other");
    expect(mergedOp(entriesOf(items[0]))).toEqual({ op: "annotation_update", id: "a1", style: {}, x: 1 });
    expect(sessionHosts(entriesOf(items[2]))).toEqual({ placed: ["a"], unpinned: ["b"] });
    const days = byDay(items, NOW);
    expect(days).toHaveLength(1);
    expect(days[0].day).toBe("today");
    const two = byDay(fold([entry([], { at: "2026-10-09T10:00:00Z" }), entry([], { at: "2026-10-01T10:00:00Z", revision: 2 })]), NOW).map((d) => d.day);
    expect(two[0]).toBe("today");
    expect(two[1]).toMatch(/1 October 2026$/);
  });

  it("orders as the server, keys an entry by its date too, links to an entry, never to a purge trace", () => {
    const a = entry([], { at: "2026-10-09T10:00:00Z" }), b = entry([], { at: "2026-10-09T09:00:00Z" });
    expect(newer(a, b)).toBe(true);
    expect(newer({ ...a, infrastructure: "b" }, { ...a, infrastructure: "a" })).toBe(true);
    expect(newer({ ...a, revision: 2 }, { ...a, revision: 1 })).toBe(true);
    expect(keyOf(a)).not.toBe(keyOf(b));
    expect(entryLink("https://ld.example/next/", entry([], { infrastructure: "demo dc", revision: 41 }))).toBe("https://ld.example/next/?infrastructure=demo%20dc#mode=journal&jinfra=demo%20dc&jrev=41");
    expect(isTrace(entry([{ op: "journal_prune" }]))).toBe(true);
    expect(isTrace(a)).toBe(false);
  });

  it("opens the history of a device, a group, an annotation or a connector, nothing for the map", () => {
    expect(historyObjectOf({ kind: "node", id: "dc01-core-01" })).toBe("dc01-core-01");
    expect(historyObjectOf({ kind: "group", id: "g1-1" })).toBe("g1-1");
    expect(historyObjectOf({ kind: "pane" })).toBeNull();
  });

  it("reads as long as what was shown, and keeps the tail of an older read", () => {
    expect(reloadLimit(null)).toBe(200);
    expect(reloadLimit(50)).toBe(200);
    expect(reloadLimit(450)).toBe(450);
    expect(reloadLimit(900)).toBe(500);
    const page = (revisions: number[], next: string | null) => ({
      entries: revisions.map((revision) => entry([], { revision, at: `2026-10-0${revision}T10:00:00Z` })), total: 9, next, authors: [], categories: [], infrastructures: [], actions: [], unreadable: 0, start_missing: false,
    });
    const cached = page([9, 8, 7, 6], "c6");
    expect(merged(page([5, 4], null), cached, true).entries.map((e) => e.revision), "the next page appended").toEqual([9, 8, 7, 6, 5, 4]);
    expect(merged(page([9, 8], "c8"), cached, false).entries.map((e) => e.revision), "a shorter re-read keeps the older tail").toEqual([9, 8, 7, 6]);
    expect(merged(page([9, 8], "c8"), cached, false).next).toBe("c6");
    expect(merged(page([9, 8, 7, 6, 5], "c5"), cached, false).entries).toHaveLength(5);
    expect(merged(page([9], null), null, false).entries).toHaveLength(1);
  });
});
