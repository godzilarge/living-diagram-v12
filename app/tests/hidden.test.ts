// The hidden devices of a view, by rule, and how a rule is lifted.
import { describe, expect, it } from "vitest";
import type { ModelLink, ModelNode } from "@engine/canvas/types";
import { exactRule } from "@engine/canvas/query";
import { DEFAULT_VIEW } from "../src/state/address";
import { dropping, exactHosts, hiddenOf, hiddenRules, showingAll } from "../src/state/hidden";

const node = (hostname: string, kind = "card", ghost = false): ModelNode => ({ hostname, kind, ghost } as unknown as ModelNode);
const link = (a: string, b: string): ModelLink => ({ a: { hostname: a }, b: { hostname: b } } as unknown as ModelLink);
const nodes = [node("core-01"), node("acc-01"), node("acc-02"), node("ph.1", "stub"), node("old-01", "card", true)];
const links = [link("core-01", "acc-01"), link("core-01", "acc-02"), link("acc-02", "ph.1")];
const view = (hide: string[], only = "") => ({ ...DEFAULT_VIEW, hide, only });

describe("exact rules", () => {
  it("reads back the hostnames an exact rule names, escapes included", () => {
    expect(exactHosts(exactRule(["ph.1", "acc-01"]))).toEqual(["acc-01", "ph.1"]);
    expect(exactHosts("kind:phone")).toBeNull();
    expect(exactHosts("^(a|b.*)$")).toBeNull();
    expect(exactHosts("")).toBeNull();
  });
});

describe("hidden devices", () => {
  it("lists nothing without a rule", () => {
    expect(hiddenOf(nodes, links, DEFAULT_VIEW)).toEqual([]);
    expect(hiddenRules(nodes, links, DEFAULT_VIEW)).toEqual([]);
  });

  it("lists what the hide rules take out, in the run's order, ghosts aside", () => {
    expect(hiddenOf(nodes, links, view([exactRule(["acc-02", "old-01"]), "kind:stub"]))).toEqual(["acc-02", "ph.1"]);
  });

  it("lists what an isolation leaves out: everything but the isolated and their neighbours", () => {
    expect(hiddenOf(nodes, links, view([], exactRule(["acc-02"])))).toEqual(["acc-01"]);
  });

  it("gives one row per rule, with the devices each keeps out: a selection by name, an expression, the isolation last", () => {
    const rules = hiddenRules(nodes, links, view([exactRule(["acc-02", "old-01"]), "acc"], exactRule(["core-01"])));
    expect(rules).toEqual([
      { rule: exactRule(["acc-02", "old-01"]), kind: "hide", named: ["acc-02", "old-01"], hosts: ["acc-02"] },
      { rule: "acc", kind: "hide", named: null, hosts: ["acc-01", "acc-02"] },
      { rule: exactRule(["core-01"]), kind: "only", named: ["core-01"], hosts: ["ph.1"] },
    ]);
  });
});

describe("lifting a rule", () => {
  it("drops the one rule, the isolation when it is the one, and leaves a view that has no such rule", () => {
    const before = view([exactRule(["acc-01"]), "acc"], "core");
    expect(dropping(before, "acc").hide).toEqual([exactRule(["acc-01"])]);
    expect(dropping(before, "core")).toEqual({ ...before, only: "" });
    expect(dropping(before, "nothing")).toBe(before);
  });

  it("lifts every rule with show all, and keeps a view that has none", () => {
    expect(showingAll(view(["kind:stub"], "core"))).toEqual({ ...DEFAULT_VIEW, hide: [], only: "" });
    expect(showingAll(DEFAULT_VIEW)).toBe(DEFAULT_VIEW);
  });
});
