// A log entry in words: the sentence of an operation, the line of an entry (bursts, majority, the rest counted), the
// detail by verb, the facts, the subjects' names, the search's fold and highlight; in both languages.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { JournalEntry, JournalOp } from "../src/api/journal";
import { setLanguage } from "../src/i18n";
import { auxiliary, categoryOf, changedFields, detailGroups, factsOf, firstRef, foldText, headline, hiddenHit, majority, marks, sentenceOf, sessionSentence, subjectLabel, textOf, utcDay, visibleMatch } from "../src/state/journal-text";
import { cell, csvHeader, csvName, csvOf, rowOf, separator } from "../src/state/journal-csv";

const entry = (ops: readonly JournalOp[], more: Partial<JournalEntry> = {}): JournalEntry => ({
  infrastructure: "lab", revision: 7, at: "2026-10-09T10:00:00Z", author: "orhan", categories: [], actions: [], created: [], subjects: [], group: null, ops, ...more,
});
const say = (e: JournalEntry): string => textOf(headline(e));
const group = (id: string, label: string) => ({ id, kind: "group" as const, label, form: "", unnamed: null, parts: null });

beforeAll(() => setLanguage("en"));
afterEach(() => setLanguage("en"));

describe("the sentences", () => {
  it("say one operation, a burst, the majority and the rest, in English and in French", () => {
    expect(say(entry([{ op: "pin", hostname: "dc01-core-01", x: 1, y: 2 }]))).toBe("placed dc01-core-01");
    expect(say(entry([{ op: "pin", hostname: "a" }, { op: "pin", hostname: "b" }, { op: "pin", hostname: "c" }]))).toBe("placed 3 devices");
    const mixed = entry([{ op: "pin", hostname: "a" }, { op: "pin", hostname: "b" }, { op: "color", hostname: "a", hue: "red" }]);
    expect(say(mixed)).toBe("placed 2 devices and 1 other change");
    expect(headline(mixed).category, "the majority category").toBe("positions");
    expect(majority(entry([{ op: "color", hostname: "a", hue: "red" }, { op: "group_delete", id: "g1" }]))).toBe("colors");
    expect(say(entry([{ op: "color", hostname: "a", hue: "red" }, { op: "color", hostname: "b", hue: "red" }]))).toBe("coloured 2 devices red");
    expect(say(entry([{ op: "teleport" }]))).toBe("unknown operation “teleport”");
    expect(say(entry([]))).toBe("request without operation");
    expect(categoryOf("teleport")).toBe("other");
    expect(auxiliary()).toBe("");
    setLanguage("fr");
    expect(say(entry([{ op: "pin", hostname: "dc01-core-01" }]))).toBe("a placé dc01-core-01");
    expect(say(entry([{ op: "unpin", hostname: "a" }, { op: "unpin", hostname: "b" }]))).toBe("a désépinglé 2 équipements");
    expect(auxiliary()).toBe("a ");
  });

  it("cite a subject by its name of then, else by its kind, and mark what removes", () => {
    const created = entry([{ op: "group_create", label: "Core", members: ["a", "b"] }], { revision: 12, created: ["g12-1"], subjects: [group("g12-1", "Core")] });
    const piece = headline(created).pieces[1];
    expect(piece, "a named group is quoted by the engine, once for every surface").toEqual({ ref: "group", id: "g12-1", text: "“Core”" });
    expect(say(created)).toBe("created the group “Core” (2 members)");
    const unnamed = entry([{ op: "annotation_create", content: { kind: "shape", shape: "rectangle" } }], { created: ["a7-1"] });
    expect(say(unnamed)).toBe("added a shape (untitled)");
    const deleted = headline(entry([{ op: "group_delete", id: "g1" }], { subjects: [group("g1", "Edge")] }));
    expect(deleted.destroy).toBe(true);
    expect(textOf(deleted)).toBe("deleted the group “Edge”");
    const update = headline(entry([{ op: "annotation_update", id: "a1", x: 3, y: 4, style: { hue: "red" }, content: null }]));
    expect(textOf(update)).toBe("modified the annotation (untitled): position, style");
    expect(say(entry([{ op: "pin", hostname: "dc01" }])), "a device is never quoted").toBe("placed dc01");
    expect(changedFields({ op: "group_update", id: "g", label: "x", members: [], description: null })).toEqual(["name", "members"]);
    expect(subjectLabel({ label: "", parts: [{ text: "dc01", unnamed: null }, { text: null, unnamed: "free" }] })).toBe("dc01 → free point");
    expect(firstRef(entry([{ op: "pin", hostname: "a" }]))).toEqual({ ref: "node", id: "a", text: "a" });
    expect(firstRef(entry([{ op: "color_type", type: "switch", hue: "red" }]))).toBeNull();
    expect(say(entry([{ op: "journal_prune", removed: 12, before: "2026-09-01T00:00:00Z", categories: ["positions"] }]))).toBe("purged the log: 12 entries before 1 September 2026 (positions)");
    expect(utcDay("2026-09-01T10:30:00Z")).toBe("1 September 2026, 10:30 UTC");
    expect(utcDay("nope")).toBe("nope");
  });

  it("detail by verb, with the devices once each, and say a session", () => {
    const e = entry([{ op: "pin", hostname: "a" }, { op: "pin", hostname: "b" }, { op: "pin", hostname: "a" }, { op: "group_delete", id: "g1" }]);
    const groups = detailGroups(e);
    expect(groups).toHaveLength(2);
    expect(textOf(groups[0].sentence)).toBe("placed 3 devices");
    expect(groups[0].hosts).toEqual(["a", "b"]);
    expect(groups[1].hosts).toEqual([]);
    expect(detailGroups(e, 1)).toHaveLength(1);
    expect(textOf(sessionSentence(48, 3))).toBe("placed 48 devices and unpinned 3");
    expect(textOf(sessionSentence(0, 3))).toBe("unpinned 3 devices");
  });

  it("say the facts of an operation in words, never a null key, never a code block's text", () => {
    const facts = factsOf({ op: "annotation_create", x: 10, y: -5, w: 200, h: 100, content: { kind: "code", title: "conf", language: "cisco_ios", text: "a\nb\nc" }, anchor: { kind: "device", ref: "dc01" }, z: "back", locked: true, leader: null, style: { hue: "red", fill_opacity: 12, text_align: "center" } });
    const by = Object.fromEntries(facts.map((f) => [f.label, f.value]));
    expect(by.position).toBe("10, −5");
    expect(by.size).toBe("200 × 100");
    expect(by.content).toMatch(/^code block “conf” \(.*3 lines\)$/);
    expect(by.content).not.toContain("\na");
    expect(by.anchor).toBe("dc01");
    expect(by.lock).toBe("locked");
    expect(by.style).toBe("hue red, fill 12%, alignment centre");
    expect(facts.some((f) => f.label === "leader line")).toBe(false);
    const members = factsOf({ op: "group_create", label: "", members: ["a", "b"] });
    expect(members[0]).toEqual({ label: "name", value: "(empty)", list: undefined });
    expect(members[1].list).toEqual(["a", "b"]);
    const prune = factsOf({ op: "journal_prune", removed: 3, first_revision: 1, last_revision: 3, before: "2026-09-01T00:00:00Z", archive: "x.jsonl", sha256: "abc" });
    expect(prune.map((f) => f.value)).toEqual(["3", "r1 to r3", "1 September 2026", "all", "x.jsonl", "sha256 abc"]);
    const ends = factsOf({ op: "connector_create", start: { kind: "device", ref: "dc01", side: "n" }, end: { kind: "free", x: 1, y: 2 }, heads: { start: "none", end: "arrow" }, route: "elbow", bend: 0 });
    expect(ends.map((f) => f.value)).toEqual(["dc01, top side", "point (1, 2)", "none → arrow", "elbow", "0"]);
  });

  it("fold the search as the server, keep the length, highlight, and say where a hidden match is", () => {
    expect(foldText("Cœur Édition")).toBe("cœur edition".replace("œ", "œ"));
    expect(foldText("Édition")).toHaveLength("Édition".length);
    expect(marks("Core dc01-CORE-02", ["core"])).toEqual([{ text: "Core", hit: true }, { text: " dc01-", hit: false }, { text: "CORE", hit: true }, { text: "-02", hit: false }]);
    expect(marks("abc", [])).toEqual([{ text: "abc", hit: false }]);
    const s = headline(entry([{ op: "pin", hostname: "a" }, { op: "pin", hostname: "dc02-core" }]));
    expect(visibleMatch(s, "orhan", ["placed", "orhan"])).toBe(true);
    expect(visibleMatch(s, "orhan", ["dc02"])).toBe(false);
    expect(hiddenHit(entry([{ op: "pin", hostname: "a" }, { op: "pin", hostname: "dc02-core" }]), ["dc02"])).toBe("dc02-core");
    expect(hiddenHit(entry([{ op: "pin", hostname: "a" }]), ["zzz"])).toBeNull();
  });
});

describe("the CSV export", () => {
  it("writes one line per entry, defused, in the language's dialect", () => {
    expect(separator()).toBe(",");
    expect(cell("=SUM(1)", ",")).toBe("'=SUM(1)");
    expect(cell('say "hi"', ",")).toBe('"say ""hi"""');
    expect(cell("a,b", ",")).toBe('"a,b"');
    expect(cell("plain", ",")).toBe("plain");
    const e = entry([{ op: "group_create", label: "Core", members: ["a"], description: null }], { created: ["g7-1"], subjects: [group("g7-1", "Core")] });
    const row = rowOf(e);
    expect(row.slice(0, 6)).toEqual(["2026-10-09T10:00:00Z", "lab", "7", "orhan", "Groups", "created the group “Core” (1 member)"]);
    expect(rowOf({ ...e, at: "2026-10-09T12:00:00+02:00" })[0], "the date column is UTC whatever the offset written").toBe("2026-10-09T10:00:00Z");
    expect(row[6], "the subjects, then the devices the operations name").toBe("Core (g7-1)");
    expect(row[7]).toBe('[{"op":"group_create","label":"Core","members":["a"]}]');
    const csv = csvOf([e]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")[0]).toBe(csvHeader().join(","));
    expect(csvName("demo dc", new Date(2026, 9, 9, 8, 5))).toBe("log-demo_dc-20261009-0805.csv");
    setLanguage("fr");
    expect(separator()).toBe(";");
    expect(rowOf(e)[5]).toBe("créé le groupe «\u00a0Core\u00a0» (1 membre)");
    expect(csvName("", new Date(2026, 9, 9, 8, 5))).toBe("journal-toutes-20261009-0805.csv");
  });
});
