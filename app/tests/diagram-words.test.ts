// The diagram shell's words from its state, in both languages: a collection in full and as a word, its status, the
// band's runs and tooltips, "compare with", the changes button, the Check count, the missing parts, why there is no
// diagram; and the infrastructure choice that always holds the current one.
import { describe, expect, it } from "vitest";
import type { RunEntry } from "../src/api/run";
import { i18n, setLanguage } from "../src/i18n";
import type { Translate } from "../src/i18n";
import { bandItems, blockedOf, causeWords, changesWords, checkCount, compareOptions, missingWords, runOptions, runWords, statusWords } from "../src/diagram/words";
import { bandOf, compareChoices } from "../src/state/runs";
import { withCurrent } from "../src/state/useInfrastructures";

// the words take the page's time zone (the browser's): the tests pin it, as the e2e config does
process.env.TZ = "UTC";
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
const run = (id: string, start: string, status = "completed"): RunEntry => ({ run_id: id, run_start: start, run_end: null, run_status: status, stored_at: "" });
const RUNS = [run("r1", "2026-01-05T02:00:00Z"), run("r2", "2026-01-12T02:00:00Z", "partial"), run("r3", "2026-01-19T02:00:00Z")];
const ready = { kind: "ready" } as never;

describe("diagram words", () => {
  it("says a collection in full, its status, and lists the runs latest first", () => {
    expect(runWords(t, "2026-01-19T02:00:00Z")).toBe("19 Jan 2026, 02:00");
    expect(inLanguage("fr", () => runWords(t, "2026-01-19T02:00:00Z"))).toBe("19 janv. 2026, 02:00");
    expect(runWords(t, "nope")).toBe("nope");
    expect(statusWords(t, "partial")).toBe("partial");
    expect(inLanguage("fr", () => statusWords(t, "weird"))).toBe("inconnue");
    expect(runOptions(t, RUNS).map((option) => option.value)).toEqual(["r3", "r2", "r1"]);
  });

  it("gives the band its words, the current and compared marks, and their tooltips", () => {
    const items = bandItems(t, bandOf(RUNS, "r3", "r2"), NOW);
    expect(items.map((item) => item.label)).toEqual(["5 Jan", "12 Jan", "19 Jan"]);
    expect(items[2]).toMatchObject({ current: true, compared: false, tooltip: "Collection of 19 Jan 2026, 02:00, completed" });
    expect(items[1]).toMatchObject({ compared: true, tooltip: "Collection of 12 Jan 2026, 02:00, partial, compared" });
    expect(inLanguage("fr", () => bandItems(t, bandOf(RUNS, "r3", ""), NOW)[0].tooltip)).toBe("Collecte du 5 janv. 2026, 02:00, terminée");
    expect(compareOptions(t, compareChoices(RUNS, "r3"), NOW)).toEqual([
      { value: "", label: "None" },
      { value: "r2", label: "12 Jan" },
      { value: "r1", label: "5 Jan" },
    ]);
  });

  it("counts the changes, accounts for every one of them in the tooltip, and says when nothing changed", () => {
    const parts = [{ part: "nodes", count: 1 }, { part: "links", count: 5 }, { part: "ha_clusters", count: 1 }, { part: "checksAppeared", count: 1 }, { part: "coverage", count: 1 }, { part: "rebooted", count: 1 }] as const;
    const words = changesWords(t, { total: 10, parts, since: "2026-01-12T02:00:00Z" }, NOW);
    expect(words).toEqual({ label: "10 changes", tooltip: "1 device, 5 cables, 1 HA cluster, 1 check appeared, 1 coverage change, 1 reboot since 12 Jan" });
    expect(inLanguage("fr", () => changesWords(t, { total: 2, parts: [{ part: "links", count: 2 }], since: "2026-01-12T02:00:00Z" }, NOW))).toEqual({
      label: "2 changements",
      tooltip: "2 câbles depuis le 12 janv.",
    });
    expect(changesWords(t, { total: 0, parts: [], since: "2026-01-12T02:00:00Z" }, NOW).tooltip).toBe("No change since 12 Jan");
  });

  it("counts the open errors next to Check, else the warnings, else nothing", () => {
    expect(checkCount(t, { severityCounts: new Map([["error", 2], ["warning", 3]]) })).toEqual({ count: 2, tone: "error", label: "2 open errors" });
    expect(checkCount(t, { severityCounts: new Map([["warning", 1]]) })).toEqual({ count: 1, tone: "warning", label: "1 open warning" });
    expect(checkCount(t, { severityCounts: new Map([["info", 4]]) })).toBeNull();
    expect(checkCount(t, null)).toBeNull();
  });

  it("names the parts a run opened without, and why there is no diagram", () => {
    expect(missingWords(t, ["report", "placement"])).toBe("Not read with this collection: the ingestion report, the memorized placement.");
    expect(causeWords(t, 503)).toContain("error 503");
    expect(causeWords(t, "invalid")).toContain("outside its contract");
    const base = { token: "present", run: { kind: "idle" }, runs: RUNS, runsCause: null } as const;
    expect(blockedOf(t, { ...base, token: "missing" })).toEqual({ kind: "token", refused: false });
    expect(blockedOf(t, { ...base, token: "refused" })).toEqual({ kind: "token", refused: true });
    expect(blockedOf(t, { ...base, run: { kind: "failed", cause: "unreachable" } })).toEqual({ kind: "sentence", text: causeWords(t, "unreachable") });
    expect(blockedOf(t, { ...base, runs: null, runsCause: 500 })).toEqual({ kind: "sentence", text: causeWords(t, 500) });
    expect(blockedOf(t, { ...base, runs: [] })).toEqual({ kind: "sentence", text: t("diagram:state.noRuns") });
    expect(blockedOf(t, { ...base, run: ready })).toBeNull();
  });

  it("always offers the current infrastructure", () => {
    const a = { name: "a", devices: 3 }, b = { name: "b", devices: null };
    expect(withCurrent([a, b], "b")).toEqual([a, b]);
    expect(withCurrent([a], "c")).toEqual([{ name: "c", devices: null }, a]);
    expect(withCurrent([], "c")).toEqual([{ name: "c", devices: null }]);
    expect(withCurrent([a], "")).toEqual([a]);
  });
});
