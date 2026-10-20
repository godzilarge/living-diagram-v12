// The Log view's rows and words from its state, in both languages: a row's sentence for an entry, a fold, a session,
// its tone, a cited object gone, the target of a link, the objects whose history the detail offers; the header's line,
// a facet's accessible name, the filters posed, a day's title in sentence case, the author around the sentence, the
// revision of a row and the tally of a fold, the foot, the export's result.
import { describe, expect, it } from "vitest";
import type { Model } from "@engine/canvas/types";
import type { JournalEntry, JournalPage } from "../src/api/journal";
import { i18n, setLanguage } from "../src/i18n";
import type { Translate } from "../src/i18n";
import { DEFAULT_FILTERS, fold } from "../src/state/journal";
import { goneRef, lineOf, objectName, objectsOf, presenceOf, targetOf, toneOf, wordsOf } from "../src/journal/rows";
import {
  authorSlots, authorWords, causeWords, dayTitle, exportWords, facetSaid, linkWords, posedWords, revisionWords, scopeWords, sessionWords,
  shownWords, subtitleWords, tallyWords, totalWords,
} from "../src/journal/words";

const NOW = Date.parse("2026-01-19T19:30:00Z");
const t: Translate = (key, values) => i18n.t(key, values ?? {}) as string;
const inLanguage = <T,>(language: "en" | "fr", read: () => T): T => {
  setLanguage(language);
  try {
    return read();
  } finally {
    setLanguage("en");
  }
};
const entry = (patch: Partial<JournalEntry>): JournalEntry => ({
  infrastructure: "demo-dc", revision: 1, at: "2026-01-19T12:00:00Z", author: "orhan",
  categories: [], actions: [], created: [], subjects: [], ops: [{ op: "pin", hostname: "a" }], group: null, ...patch,
});
const page = (patch: Partial<JournalPage>): JournalPage => ({
  entries: [], total: 0, next: null, authors: [], categories: [], infrastructures: [], actions: [], unreadable: 0, start_missing: false, ...patch,
});
const model = (hosts: string[], groups: string[] = []): Model =>
  ({ source: { infrastructure: "demo-dc" }, nodeByHost: new Map(hosts.map((h) => [h, {}])), groupById: new Map(groups.map((g) => [g, { label: "Core" }])), annotationById: new Map(), connectorById: new Map() }) as unknown as Model;

describe("journal rows", () => {
  it("says a burst in one sentence, recedes on positions, stands out on a deletion", () => {
    const pins = entry({ ops: [{ op: "pin", hostname: "a" }, { op: "pin", hostname: "b" }, { op: "pin", hostname: "c" }] });
    const [item] = fold([pins]);
    expect(toneOf(lineOf(item).sentence)).toBe("quiet");
    const deleted = entry({ ops: [{ op: "group_delete", id: "g1" }], subjects: [{ id: "g1", kind: "group", label: "Old core", form: "", unnamed: null, parts: null }] });
    expect(toneOf(lineOf(fold([deleted])[0]).sentence)).toBe("destroy");
    const named = entry({ ops: [{ op: "group_update", id: "g1", label: "Core" }], subjects: [{ id: "g1", kind: "group", label: "Core", form: "", unnamed: null, parts: null }] });
    expect(toneOf(lineOf(fold([named])[0]).sentence)).toBe("neutral");
  });

  it("folds a repeated gesture and a session, and tallies them", () => {
    const group = { id: "r1", kind: "repeat" as const, size: 3 };
    const repeats = [3, 2, 1].map((n) => entry({ revision: n, at: `2026-01-19T15:0${n}:00Z`, group, ops: [{ op: "annotation_update", id: "a1", style: { hue: "red" } }] }));
    const [item] = fold(repeats);
    expect(item.kind).toBe("fold");
    if (item.kind !== "fold") return;
    expect(revisionWords(t, item)).toBe("r1–r3");
    expect(tallyWords(t, item).times).toBe("×3");
    const session = { id: "s1", kind: "session" as const, size: 4 };
    const placed = [3, 2, 1].map((n) => entry({ revision: n, at: `2026-01-19T08:4${n}:00Z`, group: session, ops: [{ op: "pin", hostname: `h${n}` }] }));
    const [run] = fold(placed);
    expect(run.kind).toBe("session");
    if (run.kind !== "session") return;
    // a filter hides one request of the four: the row says so
    expect(sessionWords(t, run)).toMatch(/^3 requests since .*3 of 4 requests/);
    expect(inLanguage("fr", () => lineOf(run).sentence.pieces.join(""))).toContain("placé 3 équipements");
  });

  it("knows what became of a cited object for the open infrastructure only", () => {
    const presence = presenceOf(model(["a"]));
    const gone = entry({ ops: [{ op: "color", hostname: "b", hue: "red" }] });
    expect(goneRef(lineOf(fold([gone])[0]).sentence, gone, presence)?.id).toBe("b");
    expect(goneRef(lineOf(fold([entry({})])[0]).sentence, entry({}), presence)).toBeNull();
    const elsewhere = entry({ infrastructure: "site-lyon", ops: [{ op: "color", hostname: "b", hue: "red" }] });
    expect(goneRef(lineOf(fold([elsewhere])[0]).sentence, elsewhere, presence)).toBeNull();
  });

  it("finds the target of a link, never a purge trace nor a missing revision", () => {
    const items = fold([entry({ revision: 7 }), entry({ revision: 6, at: "2026-01-19T11:00:00Z" })]);
    expect(targetOf(items, 6, false)?.key).toBe(items[1].key);
    expect(targetOf(items, 6, true)).toBeNull();
    expect(targetOf(items, null, false)).toBeNull();
    const trace = fold([entry({ revision: 6, ops: [{ op: "journal_prune", removed: 3 }] })]);
    expect(targetOf(trace, 6, false)).toBeNull();
  });

  it("offers the history of the subjects, then of a few devices, named by the log or the run", () => {
    const e = entry({ ops: [{ op: "group_add", id: "g1", members: ["a"] }, { op: "pin", hostname: "a" }], subjects: [{ id: "g1", kind: "group", label: "Core", form: "", unnamed: null, parts: null }] });
    expect(objectsOf(e)).toEqual([{ id: "g1", kind: "group", name: "Core" }, { id: "a", kind: "node", name: "a" }]);
    const burst = entry({ ops: ["a", "b", "c", "d", "e"].map((hostname) => ({ op: "pin", hostname })) });
    expect(objectsOf(burst)).toEqual([]);
    expect(objectName("g1", [e], null), "a named group, quoted as the sentences quote it").toBe("“Core”");
    expect(objectName("g9", [], model([], ["g9"]))).toBe("“Core”");
    expect(objectName("dc01-core-01", [], null)).toBe("dc01-core-01");
    expect(wordsOf("  core   01 ")).toEqual(["core", "01"]);
  });
});

describe("journal words", () => {
  it("says how many, where and the zone of the clocks", () => {
    expect(totalWords(t, 412, false)).toBe("412 changes");
    expect(totalWords(t, 0, true)).toBe("no change matches");
    expect(scopeWords(t, DEFAULT_FILTERS, "demo-dc")).toBe("demo-dc");
    expect(scopeWords(t, { ...DEFAULT_FILTERS, infrastructure: "*" }, "demo-dc")).toBe("all infrastructures");
    expect(subtitleWords(t, "412 changes", "demo-dc", NOW)).toMatch(/^412 changes · demo-dc · times UTC/);
    expect(inLanguage("fr", () => totalWords(t, 1, true))).toBe("1 modification correspond");
  });

  it("names a facet with its note and its count, the count only once read", () => {
    expect(facetSaid(t, "demo-dc", 236, "open")).toBe("demo-dc, open, 236");
    expect(facetSaid(t, "All", null)).toBe("All");
    expect(inLanguage("fr", () => facetSaid(t, "Positions", 1200))).toBe("Positions, 1 200");
  });

  it("recalls the filters posed, in words", () => {
    expect(posedWords(t, DEFAULT_FILTERS, NOW)).toBe("");
    const f = { ...DEFAULT_FILTERS, q: "core", categories: ["groups" as const], authors: ["orhan"], period: "7d" as const };
    expect(posedWords(t, f, NOW)).toBe("Active filters: “core”; Groups; orhan; 7 days");
  });

  it("titles a day in sentence case and sets the author before the sentence", () => {
    expect(dayTitle("2026-01-19T12:00:00Z", NOW)).toBe("Today");
    expect(inLanguage("fr", () => dayTitle("2026-01-18T12:00:00Z", NOW))).toBe("Hier");
    expect(inLanguage("fr", () => dayTitle("2026-01-17T12:00:00Z", NOW))).toMatch(/^Samedi 17 janvier 2026$/);
    expect(authorSlots(t).map((s) => s.kind)).toEqual(["author", "text", "phrase"]);
    expect(authorWords(t, "  ")).toBe("unknown");
  });

  it("says the link, the foot, a failure and the export's result", () => {
    expect(linkWords(t, 986, page({}))).toBe("Link to revision r986.");
    expect(linkWords(t, 986, page({ start_missing: true, entries: [entry({ ops: [{ op: "journal_prune" }] })] }))).toMatch(/was purged/);
    expect(shownWords(t, page({ entries: [entry({})], total: 412 }), null)).toBe("1 of 412");
    expect(causeWords(t, 503)).toBe("error 503");
    expect(causeWords(t, "unreachable")).toBe("the API does not answer");
    expect(exportWords(t, { ok: true, count: 2, truncated: false })).toBe("2 entries exported");
    expect(exportWords(t, { ok: true, count: 1, truncated: true })).toMatch(/limit reached/);
    expect(exportWords(t, { ok: false, cause: 500 })).toBe("Export failed: error 500");
  });
});
