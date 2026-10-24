// The search palette's words (brick 4) on the synthetic eight-device series (e2e/fixtures/diagram/), in both
// languages: a row's name and detail by kind, the kind line of the detail, the folded ports, what the list says
// without a row, the total, the actions the diagram offers, Tab over the tabs a page offers.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "@engine/canvas/model";
import type { PageData } from "@engine/canvas/types";
import type { RunEntry } from "../src/api/run";
import { parseIntent, parseSnapshot } from "../src/api/run";
import { i18n, setLanguage } from "../src/i18n";
import type { Translate } from "../src/i18n";
import { stepIn } from "../src/search/SearchPalette";
import { actionSources, deviceSubWords, foldPorts, hostsWords, messageWords, rowDetail, rowName, totalWords } from "../src/search/words";
import { compareChoices } from "../src/state/runs";
import { search } from "../src/state/search";
import type { Hit, Sources } from "../src/state/search";

process.env.TZ = "UTC";
const NOW = Date.parse("2026-01-19T19:30:00Z");
const t: Translate = (key, values) => i18n.t(key, values ?? {}) as string;
const inFrench = <T,>(read: () => T): T => {
  setLanguage("fr");
  try {
    return read();
  } finally {
    setLanguage("en");
  }
};
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../e2e/fixtures/diagram/${name}`, import.meta.url), "utf8"));
const snapshot = parseSnapshot(read("snapshot-demo-0119.json"));
const intent = parseIntent(read("intent.json"));
if (!snapshot || !intent) throw new Error("the e2e fixtures do not parse");
const model = build({ snapshot, ingest: null, origin: "test", catalogue: {}, intent } as PageData);
const sources: Sources = { model, infrastructures: [{ name: "demo-dc", devices: null }, { name: "wan-core", devices: 14 }], current: "demo-dc", actions: [] };
const run = (id: string, start: string): RunEntry => ({ run_id: id, run_start: start, run_end: null, run_status: "completed", stored_at: "" });
const RUNS = [run("r1", "2026-01-05T02:00:00Z"), run("r2", "2026-01-12T02:00:00Z"), run("r3", "2026-01-19T02:00:00Z")];

const first = <K extends Hit["kind"]>(text: string, kind: K): Extract<Hit, { kind: K }> => {
  const results = search(sources, text);
  const all: Hit[] = [...results.devices, ...results.ports, ...results.groups, ...results.notes, ...results.infrastructures, ...results.actions];
  const hit = all.find((h) => h.kind === kind);
  if (!hit) throw new Error(`no ${kind} for ${text}`);
  return hit as Extract<Hit, { kind: K }>;
};

describe("search words", () => {
  it("names a row by kind and puts its detail on the right", () => {
    const device = first("dc01-core-01", "device");
    expect(rowName(t, device)).toBe("dc01-core-01");
    expect(rowDetail(t, device)).toBe("Switch, dc01");
    expect(inFrench(() => rowDetail(t, device))).toBe("Commutateur, dc01");
    const port = first("dc01-core-01 eth1/43", "port");
    expect(rowName(t, port)).toBe("Ethernet1/43 of dc01-core-01");
    expect(inFrench(() => rowName(t, port))).toBe("Ethernet1/43 de dc01-core-01");
    expect(rowDetail(t, port)).toBe("to dc01-rt-01");
    const cluster = first("edge", "cluster");
    expect(rowName(t, cluster)).toBe("DC01-EDGE");
    expect(rowDetail(t, cluster)).toBe("active-passive");
    expect(rowDetail(t, first("wan", "infrastructure"))).toBe("14 devices");
    expect(rowDetail(t, first("demo", "infrastructure"))).toBe("current infrastructure");
    const note = first("baie", "note");
    expect(rowName(t, note)).toBe("Baie 12, rangée B");
    expect(inFrench(() => rowDetail(t, note))).toBe("Note");
  });

  it("names a removed device, a cluster without a name, and a list of hosts", () => {
    const removed = { ...first("dc01-core-01", "device"), removed: true };
    expect(rowDetail(t, removed)).toBe("Switch, removed");
    const unnamed = { ...first("edge", "cluster"), name: null };
    expect(rowName(t, unnamed)).toBe("HA cluster of dc01-fw-01 and dc01-fw-02");
    expect(inFrench(() => hostsWords(t, ["a", "b", "c"]))).toBe("a, b et c");
    expect(hostsWords(t, ["a"])).toBe("a");
  });

  it("says a device's kind with its vendor and site when known", () => {
    const node = { kind: "device" as const, type: "switch" as const, vendor: "Cisco", site: "dc01" };
    expect(inFrench(() => deviceSubWords(t, node))).toBe("Commutateur Cisco, site dc01");
    expect(deviceSubWords(t, node)).toBe("Switch, Cisco, site dc01");
    expect(deviceSubWords(t, { ...node, vendor: null })).toBe("Switch, site dc01");
    expect(deviceSubWords(t, { ...node, site: null })).toBe("Switch, Cisco");
    expect(deviceSubWords(t, { ...node, kind: "stub", vendor: null, site: null })).toBe(t("panel:kind.stub"));
  });

  it("folds a device's ports toward one neighbour", () => {
    expect(foldPorts(t, ["Eth1/49", "Eth1/50"])).toBe("Eth1/49, 1/50");
    expect(foldPorts(t, ["Eth1/49", "Po10"])).toBe("Eth1/49, Po10");
    expect(foldPorts(t, ["port1"])).toBe("port1");
  });

  it("says what the list shows without a row, and the total", () => {
    const empty = search(sources, "");
    expect(messageWords(t, empty, "all", 0, false)?.text).toMatch(/^Type a device's name/);
    expect(messageWords(t, empty, "all", 0, true)?.text).toBe("Type the name of an infrastructure.");
    expect(totalWords(t, empty)).toBeNull();
    const none = search(sources, "zzz");
    expect(inFrench(() => messageWords(t, none, "all", 0, false)?.text)).toBe("Rien ne correspond");
    expect(messageWords(t, none, "ports", 0, false)?.text).toBe("No port matches");
    const broken = search(sources, "(");
    expect(inFrench(() => messageWords(t, broken, "all", 0, false))).toEqual({ text: "Expression illisible", hint: expect.stringMatching(/parenthèses/) });
    expect(totalWords(t, broken)).toBeNull();
    const core = search(sources, "core");
    expect(messageWords(t, core, "all", core.total, false)).toBeNull();
    expect(inFrench(() => totalWords(t, core))).toBe(`${core.total} résultats`);
  });

  it("offers the diagram's actions with their words, each run but the current one", () => {
    const actions = actionSources(t, { selected: "dc01-core-01", grid: true, minimap: false, runs: RUNS, current: "r3", compare: compareChoices(RUNS, "r3"), now: NOW });
    expect(actions.map((a) => a.words)).toEqual([
      "Show everything",
      "Centre the view on dc01-core-01",
      "Back to 100%",
      "Hide the grid",
      "Show the overview",
      "Open the collection of 12 Jan",
      "Open the collection of 5 Jan",
      "Compare with the collection of 12 Jan",
      "Compare with the collection of 5 Jan",
    ]);
    expect(actions.filter((a) => a.runId).map((a) => a.runId)).toEqual(["r2", "r1", "r2", "r1"]);
    const bare = inFrench(() => actionSources(t, { selected: null, grid: false, minimap: true, runs: [], current: "", compare: [], now: NOW }));
    expect(bare.map((a) => a.words)).toEqual(["Tout afficher", "Revenir à 100 %", "Afficher la grille", "Masquer la vue d'ensemble"]);
  });

  it("offers to show the run's unknown neighbours, or to hide them once drawn, in the edit palette's words", () => {
    const base = { selected: null, grid: false, minimap: false, editing: false, runs: [], current: "", compare: [], now: NOW };
    const stubs = (context: Partial<Parameters<typeof actionSources>[1]>) => actionSources(t, { ...base, ...context }).filter((a) => a.id === "toggleStubs").map((a) => a.words);
    expect(stubs({ stubs: 5, showStubs: false })).toEqual(["Show the 5 unknown neighbours"]);
    expect(stubs({ stubs: 5, showStubs: true })).toEqual(["Hide the 5 unknown neighbours"]);
    expect(stubs({ stubs: 0 })).toEqual([]);
    expect(stubs({})).toEqual([]);
    expect(inFrench(() => stubs({ stubs: 1, showStubs: false }))).toEqual(["Afficher le voisin inconnu"]);
    const offered: Sources = { ...sources, actions: actionSources(t, { ...base, stubs: 5 }) };
    expect(search(offered, "unknown").actions.map((h) => h.id)).toEqual(["toggleStubs"]);
  });

  it("offers Check's two actions on the tiles in Check only, found by their words", () => {
    const base = { selected: null, grid: true, minimap: false, editing: false, runs: [], current: "", compare: [], now: NOW };
    const tiles = (inCheck?: boolean) => actionSources(t, { ...base, inCheck }).filter((a) => a.id === "tilesTighten" || a.id === "tilesReset").map((a) => a.words);
    expect(tiles(true)).toEqual(["Tighten the tiles", "Reset the tiles' layout"]);
    expect(tiles(false)).toEqual([]);
    expect(tiles()).toEqual([]);
    expect(inFrench(() => tiles(true))).toEqual(["Resserrer les tuiles", "Réinitialiser la disposition des tuiles"]);
    const offered: Sources = { ...sources, actions: actionSources(t, { ...base, inCheck: true }) };
    expect(search(offered, "tiles").actions.map((h) => h.id)).toEqual(["tilesTighten", "tilesReset"]);
    expect(inFrench(() => search({ ...sources, actions: actionSources(t, { ...base, inCheck: true }) }, "resserrer").actions.map((h) => h.id))).toEqual(["tilesTighten"]);
  });

  it("steps over the tabs a page offers, wrapping around", () => {
    expect(stepIn(["all", "infrastructures"], "all", 1)).toBe("infrastructures");
    expect(stepIn(["all", "infrastructures"], "infrastructures", 1)).toBe("all");
    expect(stepIn(["all", "infrastructures"], "all", -1)).toBe("infrastructures");
    expect(stepIn(["all", "infrastructures"], "ports", 1)).toBe("infrastructures");
  });
});
