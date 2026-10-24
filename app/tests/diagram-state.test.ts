// The diagram shell's reducer: the selection crosses runs by identity, the address token, the runs kept on a run
// that could not list them. The model comes from the engine over the minimal synthetic snapshot.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "@engine/canvas/model";
import type { PageData } from "@engine/canvas/types";
import { DEFAULT_VIEW } from "../src/state/address";
import { initialState, reducer, selectionTokenOf, shownView } from "../src/state/diagram";
import { diffFactsOf } from "../src/state/diff-facts";
import { parseFullDiff, parseSnapshot } from "../src/api/run";

const FIXTURES = new URL("../../contracts/fixtures/", import.meta.url);
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));
const snapshot = parseSnapshot(read("snapshot-minimal.json"));
if (!snapshot) throw new Error("the minimal snapshot fixture does not parse");
const data: PageData = { snapshot, ingest: null, origin: "test", catalogue: {} };
const model = build(data);
const host = model.nodes[0].hostname;
const ADDRESS = { infrastructure: snapshot.source.infrastructure, runId: "r2", from: "r1" };

describe("the diagram state", () => {
  it("starts idle with what the address says", () => {
    const state = initialState("present", ADDRESS, DEFAULT_VIEW, { kind: "node", token: host });
    expect(state.run.kind).toBe("idle");
    expect(state.wanted).toEqual({ kind: "node", token: host });
    expect(selectionTokenOf(state)).toEqual({ kind: "node", token: host });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("names the selected element by identity once the run is shown, and carries it to the next run", () => {
    let state = initialState("present", ADDRESS);
    state = reducer(state, { type: "ready", model, data, missing: [], remembered: false, runs: null });
    state = reducer(state, { type: "select", selection: { kind: "node", id: host }, hosts: [host] });
    expect(selectionTokenOf(state)).toEqual({ kind: "node", token: host });
    state = reducer(state, { type: "loading", infrastructure: ADDRESS.infrastructure, runId: "r3" });
    expect(state.selection).toBeNull();
    expect(state.wanted).toEqual({ kind: "node", token: host });
    expect(state.run).toEqual({ kind: "loading", infrastructure: ADDRESS.infrastructure, runId: "r3" });
  });

  it("forgets a wanted selection when the canvas answers, even with the same selection", () => {
    let state = initialState("present", ADDRESS, DEFAULT_VIEW, { kind: "node", token: host });
    state = reducer(state, { type: "ready", model, data, missing: [], remembered: true, runs: [] });
    const answered = reducer(state, { type: "select", selection: null, hosts: [] });
    expect(answered.wanted).toBeNull();
    expect(reducer(answered, { type: "select", selection: null, hosts: [] })).toBe(answered);
  });

  it("keeps the runs it has when a run could not list them, and the zoom when unchanged", () => {
    const runs = [{ run_id: "r1", run_start: "2026-01-01T00:00:00Z", run_end: null, run_status: "completed", stored_at: "" }];
    let state = reducer(initialState("present", ADDRESS), { type: "runs", runs, cause: null });
    state = reducer(state, { type: "ready", model, data, missing: ["runs"], remembered: false, runs: null });
    expect(state.runs).toBe(runs);
    expect(reducer(state, { type: "zoom", zoom: 1 })).toBe(state);
    expect(reducer(state, { type: "zoom", zoom: 0.5 }).zoom).toBe(0.5);
    expect(reducer(state, { type: "failed", cause: 500 }).run).toEqual({ kind: "failed", cause: 500 });
    expect(reducer(state, { type: "view", patch: { showPorts: true } }).view.showPorts).toBe(true);
  });
});

describe("the views", () => {
  it("show the Diagram, Check and the Log; leaving the Diagram closes edit mode with what it opened", () => {
    expect(shownView({ ...DEFAULT_VIEW, mode: "journal" }).mode).toBe("journal");
    expect(shownView({ ...DEFAULT_VIEW, mode: "control" }).mode).toBe("control");
    let state = initialState("present", ADDRESS);
    state = reducer(state, { type: "edit", editing: true });
    state = reducer(state, { type: "tool", tool: "connector" });
    state = reducer(state, { type: "view", patch: { mode: "journal" } });
    expect(state.editing).toBe(false);
    expect(state.tool).toBeNull();
    expect(state.view.mode).toBe("journal");
    state = reducer(state, { type: "view", patch: { mode: "diagram" } });
    expect(state.editing, "coming back does not reopen it").toBe(false);
  });

  it("keep the selection in the Log, whose canvas stays mounted under it", () => {
    let state = initialState("present", ADDRESS);
    state = reducer(state, { type: "ready", model, data, missing: [], remembered: false, runs: null });
    state = reducer(state, { type: "select", selection: { kind: "node", id: host }, hosts: [host] });
    state = reducer(state, { type: "view", patch: { mode: "journal" } });
    expect(state).toMatchObject({ view: { mode: "journal" }, selection: { kind: "node", id: host }, hosts: [host], wanted: null });
  });
});

describe("the Check mode", () => {
  const ready = () => {
    let state = initialState("present", ADDRESS);
    state = reducer(state, { type: "ready", model, data, missing: [], remembered: false, runs: null });
    return reducer(state, { type: "select", selection: { kind: "node", id: host }, hosts: [host] });
  };

  it("leaves edit mode and keeps the selection aside, awaited by the canvas that comes back", () => {
    let state = reducer(ready(), { type: "edit", editing: true });
    state = reducer(state, { type: "tool", tool: "connector" });
    state = reducer(state, { type: "view", patch: { mode: "control" } });
    expect(state).toMatchObject({ editing: false, tool: null, context: null, selection: null, hosts: [], wanted: { kind: "node", token: host } });
    expect(selectionTokenOf(state), "the address keeps the selection").toEqual({ kind: "node", token: host });
    state = reducer(state, { type: "view", patch: { mode: "diagram" } });
    expect(state.view.mode).toBe("diagram");
    expect(state.wanted).toEqual({ kind: "node", token: host });
  });

  it("goes back to the Diagram when edit mode is asked from Check; a toggle of the view keeps the mode", () => {
    let state = reducer(ready(), { type: "view", patch: { mode: "control" } });
    state = reducer(state, { type: "view", patch: { showStubs: true } });
    expect(state.view).toMatchObject({ mode: "control", showStubs: true });
    state = reducer(state, { type: "edit", editing: true });
    expect(state).toMatchObject({ editing: true, view: { mode: "diagram" } });
  });
});

describe("the diff facts", () => {
  it("say nothing without a diff, else the engine's total, every part of it that is not zero, and since when", () => {
    expect(diffFactsOf({ diff: null })).toBeNull();
    for (const name of ["diff-skeleton.json", "../../app/e2e/fixtures/diagram/diff-demo-0112-demo-0119.json"]) {
      const diff = parseFullDiff(read(name));
      if (!diff) throw new Error(`the diff fixture ${name} does not parse`);
      const facts = diffFactsOf({ diff });
      if (!facts) throw new Error("no facts");
      expect(facts.since).toBe(diff.before.start_datetime);
      // the parts account for the total: no number shown without its reasons
      expect(facts.parts.reduce((sum, { count }) => sum + count, 0)).toBe(facts.total);
      expect(facts.parts.every(({ count }) => count > 0)).toBe(true);
      expect(facts.parts.find((p) => p.part === "links")?.count).toBe(diff.summary.links.added + diff.summary.links.removed + diff.summary.links.changed);
    }
  });
});
