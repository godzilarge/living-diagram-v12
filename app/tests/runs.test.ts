// The band's rules: what a step, a click and "compare with" open, and what the band shows.
import { describe, expect, it } from "vitest";
import type { RunEntry } from "../src/api/run";
import { bandOf, compareChoices, latestTarget, nextOf, openTarget, previousOf, stepTarget } from "../src/state/runs";

const run = (id: string): RunEntry => ({ run_id: id, run_start: `2026-01-0${id.slice(1)}T02:00:00Z`, run_end: null, run_status: "completed", stored_at: "" });
const RUNS = [run("r1"), run("r2"), run("r3")];

describe("the archived runs", () => {
  it("know their neighbours", () => {
    expect(previousOf(RUNS, "r2")?.run_id).toBe("r1");
    expect(previousOf(RUNS, "r1")).toBeNull();
    expect(nextOf(RUNS, "r2")?.run_id).toBe("r3");
    expect(nextOf(RUNS, "r3")).toBeNull();
    expect(nextOf(RUNS, "zz")).toBeNull();
  });

  it("open the latest compared with the one before it; a click compares to the run before the target", () => {
    expect(latestTarget(RUNS)).toEqual({ runId: "r3", from: "r2" });
    expect(latestTarget([run("r1")])).toEqual({ runId: "r1", from: "" });
    expect(latestTarget([])).toBeNull();
    expect(openTarget(RUNS, "r2")).toEqual({ runId: "r2", from: "r1" });
    expect(openTarget(RUNS, "r1")).toEqual({ runId: "r1", from: "" });
    expect(openTarget(RUNS, "zz")).toBeNull();
  });

  it("step right comparing to the run one leaves, left to the run before the target", () => {
    expect(stepTarget(RUNS, "r2", 1)).toEqual({ runId: "r3", from: "r2" });
    expect(stepTarget(RUNS, "r3", -1)).toEqual({ runId: "r2", from: "r1" });
    expect(stepTarget(RUNS, "r2", -1)).toEqual({ runId: "r1", from: "" });
    expect(stepTarget(RUNS, "r3", 1)).toBeNull();
    expect(stepTarget(RUNS, "zz", 1)).toBeNull();
  });

  it("show the band with two runs at least, the current and the compared one marked", () => {
    expect(bandOf([run("r1")], "r1", "")).toEqual([]);
    expect(bandOf(RUNS, "r3", "r2").map((item) => [item.run.run_id, item.current, item.compared])).toEqual([["r1", false, false], ["r2", false, true], ["r3", true, false]]);
  });

  it("offer every earlier run to compare with, the latest first", () => {
    expect(compareChoices(RUNS, "r3").map((item) => item.run_id)).toEqual(["r2", "r1"]);
    expect(compareChoices(RUNS, "r1")).toEqual([]);
    expect(compareChoices(RUNS, "zz")).toEqual([]);
  });
});
