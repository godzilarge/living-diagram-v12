// The Check view's pure logic on the synthetic eight-device series (e2e/fixtures/diagram/: 26 checks in 9 groups, 7
// devices in scope, 22 cables): the verdicts grouped by severity and code in their order, the toggles and the filter,
// the targets (each thing once, in the snapshot's order) and their addresses in the Diagram view, the coverage's band
// and rows with every collection status and its sort, the combinations of sources, the facts of the delivery with and
// without the ingestion report and the archive's date.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "@engine/canvas/model";
import type { PageData } from "@engine/canvas/types";
import type { Coverage } from "@engine/contracts/snapshot";
import { parseSnapshot } from "../src/api/run";
import { DEFAULT_VIEW, parseHash } from "../src/state/address";
import {
  ALL_SHOWN, coverageFacts, coverageRows, deliveryOf, familyOf, matches, sections, severityTotals, sortCoverage, sourceRows, targetHref,
  toggleOpen, toggleSeverity, verdictGroups,
} from "../src/state/control";
import type { VerdictGroup } from "../src/state/control";

const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../e2e/fixtures/diagram/${name}`, import.meta.url), "utf8"));
const snapshot = parseSnapshot(read("snapshot-demo-0119.json"));
if (!snapshot) throw new Error("the e2e snapshot fixture does not parse");
const data: PageData = { snapshot, ingest: { summary: null, findings: [] }, origin: "test", catalogue: {} };
const model = build(data);
const groups = verdictGroups(model);
const ADDRESS = { infrastructure: "demo-dc", runId: "demo-0119", from: "demo-0112" };
const words = (group: VerdictGroup) => `${group.count} sentence of ${group.code.replace(/_/g, " ")}`;

describe("the verdicts", () => {
  it("group the checks by severity and code: the most severe first, then the largest, then the code", () => {
    // [severity, code, things named, checks behind them]
    expect(groups.map((g) => [g.severity, g.code, g.count, g.checks])).toEqual([
      ["error", "aggregate_below_min_links", 1, 1],
      ["warning", "multiple_observed_neighbors", 4, 4],
      ["warning", "aggregate_member_not_bundled", 2, 2],
      ["warning", "documented_not_observed", 1, 1],
      ["info", "documented_not_observed", 7, 7],
      ["info", "neighbor_unknown", 5, 6],
      ["info", "remote_port_is_mac", 3, 3],
      ["info", "device_partial_collection", 1, 1],
      ["info", "link_down", 1, 1],
    ]);
    expect(groups.reduce((sum, g) => sum + g.checks, 0), "the header's total stays the checks").toBe(model.checks.length);
    expect(groups[0]).toMatchObject({ tone: "error", family: "aggregates" });
    expect(groups[4]).toMatchObject({ tone: "neutral", family: "cables" });
    expect(Object.isFrozen(groups[0])).toBe(true);
    expect(severityTotals(groups)).toEqual({ error: 1, warning: 7, info: 18 });
  });

  it("count, code by code, the distinct things they name: what the open row lists, never the checks", () => {
    const raw = snapshot.checks;
    const distinct = (code: string, severity: string, keyOf: (c: (typeof raw)[number]) => string) => new Set(raw.filter((c) => c.code === code && c.severity === severity).map(keyOf)).size;
    const ref = (c: (typeof raw)[number], kind: string) => JSON.stringify(c.refs.filter((r) => r.kind === kind));
    const things: Record<string, (c: (typeof raw)[number]) => string> = {
      aggregate_below_min_links: (c) => ref(c, "aggregate"),
      multiple_observed_neighbors: (c) => ref(c, "link"),
      aggregate_member_not_bundled: (c) => ref(c, "interface"),
      documented_not_observed: (c) => ref(c, "link"),
      neighbor_unknown: (c) => String(c.details.neighbor).toLowerCase(),
      remote_port_is_mac: (c) => ref(c, "interface"),
      device_partial_collection: (c) => ref(c, "node"),
      link_down: (c) => ref(c, "link"),
    };
    for (const group of groups) {
      expect(group.count, group.code).toBe(distinct(group.code, group.severity, things[group.code]));
      expect(group.count, `${group.code}: the count is what the open row lists`).toBe(group.targets.length);
      expect(new Set(group.targets.map((t) => t.key)).size).toBe(group.targets.length);
    }
    // the register and the delivery agree: the neighbours unknown are the unresolved names
    expect(groups.find((g) => g.code === "neighbor_unknown")?.count).toBe(model.report.unresolved_names.length);
  });

  it("count one thing when B1 writes several checks for it (per source, per member, per announcement)", () => {
    const link = { kind: "link" as const, a: { hostname: "dc01-acc-01", interface: "TenGigabitEthernet1/1/1" }, b: { hostname: "dc01-core-01", interface: "Ethernet1/1" } };
    const port = { kind: "interface" as const, hostname: "dc01-core-01", name: "Ethernet1/5" };
    const cluster = { kind: "cluster" as const, members: ["dc01-fw-01", "dc01-fw-02"] as [string, ...string[]] };
    const check = (code: string, severity: "warning" | "info", refs: unknown[], details: Record<string, unknown>) => ({ code, severity, origin: "correlation", refs, details });
    const extra = [
      check("one_way_observation", "warning", [link, { kind: "interface", hostname: "dc01-acc-01", name: "TenGigabitEthernet1/1/1" }], { source: "lldp" }),
      check("one_way_observation", "warning", [link, { kind: "interface", hostname: "dc01-acc-01", name: "TenGigabitEthernet1/1/1" }], { source: "cdp" }),
      check("self_observation", "warning", [port], { source: "lldp" }),
      check("self_observation", "warning", [port], { source: "cdp" }),
      check("ha_view_mismatch", "warning", [cluster], { field: "mode" }),
      check("ha_view_mismatch", "warning", [cluster], { field: "member", member: "dc01-fw-01" }),
      check("ha_view_mismatch", "warning", [cluster, { kind: "node", hostname: "dc01-fw-02" }], { field: "members", member: "dc01-fw-02" }),
      check("neighbor_unknown", "info", [port], { neighbor: "ghost-01", resolved: null }),
      check("neighbor_unknown", "info", [{ ...port, name: "Ethernet1/3" }], { neighbor: "GHOST-01", resolved: null }),
    ];
    const grown = build({ ...data, snapshot: { ...snapshot, checks: [...snapshot.checks, ...extra] as typeof snapshot.checks } });
    const by = (code: string) => verdictGroups(grown).find((g) => g.code === code);
    expect([by("one_way_observation")?.count, by("one_way_observation")?.checks]).toEqual([1, 2]);
    expect([by("self_observation")?.count, by("self_observation")?.checks]).toEqual([1, 2]);
    expect([by("ha_view_mismatch")?.count, by("ha_view_mismatch")?.checks]).toEqual([1, 3]);
    expect(by("ha_view_mismatch")?.targets[0]).toMatchObject({ kind: "cluster", selection: { kind: "cluster" } });
    expect([by("neighbor_unknown")?.count, by("neighbor_unknown")?.checks]).toEqual([6, 8]);
  });

  it("name what they concern, each thing once, in the snapshot's order, with what shows it", () => {
    const neighbours = groups[1];
    expect(neighbours.targets.map((t) => t.kind)).toEqual(["link", "link", "link", "link"]);
    expect(neighbours.targets[0]).toMatchObject({ kind: "link", hostname: "dc01-acc-01", name: "GigabitEthernet1/0/1", remote: { hostname: "sep93bb92c0ad60", name: "93:bb:92:c0:ad:60" } });
    expect(neighbours.targets[0].selection?.kind).toBe("link");
    const unknown = groups.find((g) => g.code === "neighbor_unknown");
    expect(unknown?.targets.map((t) => [t.kind, t.hostname, t.selection?.token])).toEqual([
      ["neighbor", "SEP93BB92C0AD60", "sep93bb92c0ad60"], ["neighbor", "ap-dc01-05", "ap-dc01-05"], ["neighbor", "srv-dc01-06", "srv-dc01-06"],
      ["neighbor", "SEP45871C511CD3", "sep45871c511cd3"], ["neighbor", "dc01-acc-02", "dc01-acc-02"],
    ]);
    expect(groups[2].targets.map((t) => [t.kind, t.hostname, t.name])).toEqual([["interface", "dc01-acc-01", "TenGigabitEthernet1/1/1"], ["interface", "dc01-core-01", "Ethernet1/1"]]);
    expect(groups[0].targets).toEqual([expect.objectContaining({ kind: "aggregate", hostname: "dc01-core-01", name: "port-channel101", selection: { kind: "aggregate", token: '["dc01-core-01","port-channel101"]' } })]);
    expect(groups.find((g) => g.code === "device_partial_collection")?.targets).toEqual([expect.objectContaining({ kind: "node", selection: { kind: "node", token: "dc01-core-02" } })]);
  });

  it("give each target an address of the Diagram view: the run as it is, no mode, the element selected", () => {
    const target = groups[0].targets[0];
    const href = targetHref(ADDRESS, { ...DEFAULT_VIEW, mode: "control", showStubs: true }, target.selection!);
    expect(href).toBe(`?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#stubs=1&aggregate=${encodeURIComponent('["dc01-core-01","port-channel101"]')}`);
    const parsed = parseHash(href.slice(href.indexOf("#")));
    expect(parsed.view.mode).toBe("diagram");
    expect(parsed.selection).toEqual({ kind: "aggregate", token: '["dc01-core-01","port-channel101"]' });
  });

  it("select the device of a cable, an aggregate or a cluster the run does not hold, and nothing without a device", () => {
    const lone = build({ ...data, snapshot: { ...snapshot, links: [], aggregates: [] } });
    const again = verdictGroups(lone);
    expect(again[0].targets[0].selection).toEqual({ kind: "node", token: "dc01-core-01" });
    expect(again.find((g) => g.code === "link_down")?.targets[0].selection).toEqual({ kind: "node", token: "dc01-acc-01" });
    // a neighbour the run never drew and a device the run does not hold: words, no address
    const ghost = { code: "neighbor_unknown", severity: "info", origin: "correlation", refs: [{ kind: "interface", hostname: "dc01-core-01", name: "Ethernet1/9" }], details: { neighbor: "nowhere-01", resolved: null } };
    const away = { code: "device_unreachable", severity: "error", origin: "correlation", refs: [{ kind: "node", hostname: "not-in-this-run" }], details: {} };
    const odd = build({ ...data, snapshot: { ...snapshot, checks: [ghost, away] as unknown as typeof snapshot.checks } });
    const said = verdictGroups(odd).map((g) => [g.code, g.targets[0].selection]);
    expect(said).toEqual([["device_unreachable", null], ["neighbor_unknown", null]]);
  });

  it("show the severities toggled on, each with the groups the filter keeps and the checks they count", () => {
    expect(sections(groups, ALL_SHOWN, "", words).map((s) => [s.severity, s.count, s.groups.length])).toEqual([["error", 1, 1], ["warning", 7, 3], ["info", 18, 5]]);
    const noNotes = toggleSeverity(ALL_SHOWN, "info");
    expect(noNotes).toEqual({ error: true, warning: true, info: false });
    expect(sections(groups, noNotes, "", words).map((s) => s.severity)).toEqual(["error", "warning"]);
    expect(sections(groups, { error: false, warning: false, info: false }, "", words)).toEqual([]);
    expect(sections(groups, ALL_SHOWN, "link_down", words).flatMap((s) => s.groups.map((g) => g.code))).toEqual(["link_down"]);
    expect(sections(groups, ALL_SHOWN, "nothing like this", words)).toEqual([]);
  });

  it("filter on the sentence, the code and the targets' names, whole or short, every word typed", () => {
    expect(matches(groups[0], "", words)).toBe(true);
    expect(matches(groups[0], "SENTENCE of aggregate", words)).toBe(true);
    expect(matches(groups[0], "below_min", words)).toBe(true);
    expect(matches(groups[0], "core-01 port-channel101", words)).toBe(true);
    expect(matches(groups[0], "core-02", words)).toBe(false);
    const bundled = groups[2];
    expect(matches(bundled, "Te1/1/1", words)).toBe(true);
    expect(matches(bundled, "TenGigabitEthernet1/1/1", words)).toBe(true);
    expect(matches(groups[1], "sep93bb92c0ad60", words), "a cable's other end").toBe(true);
    expect(matches(groups[2], "Port-channel1", words), "an aggregate its checks name, not counted").toBe(true);
    expect(matches(groups.find((g) => g.code === "neighbor_unknown")!, "ap-dc01-05", words), "an announced neighbour").toBe(true);
  });

  it("open and close a row, transiently", () => {
    const open = toggleOpen(new Set(), "a");
    expect([...open]).toEqual(["a"]);
    expect([...toggleOpen(open, "a")]).toEqual([]);
  });

  it("know the rule of each code, the input contract's for an unknown code from the bundle", () => {
    expect(familyOf("neighbor_unknown", "correlation")).toBe("neighbors");
    expect(familyOf("vrf_default_case", "bundle")).toBe("contract");
    expect(familyOf("a_brand_new_code", "bundle")).toBe("contract");
    expect(familyOf("a_brand_new_code", "correlation")).toBe("other");
  });
});

describe("the coverage", () => {
  it("has a row per device in scope, its collection and a mark per topic", () => {
    const rows = coverageRows(model.coverage);
    expect(rows.map((r) => r.hostname)).toEqual(model.coverage.map((c) => c.hostname));
    const partial = rows.find((r) => r.hostname === "dc01-core-02");
    expect(partial).toMatchObject({ status: "partial", tone: "warning", topics: { cdp: "failed", lldp: "success", ha: "absent" } });
    expect(rows[0]).toMatchObject({ status: "success", tone: "neutral" });
    expect(coverageFacts(model.coverage)).toEqual({ scope: 7, answered: 7, partial: 1, unreachable: 0, failed: 0 });
  });

  it("says every collection status, counts the unreachable with the never collected, and sorts the unreachable first", () => {
    const topics = { interfaces: "absent", aggregates: "absent", lldp: "absent", cdp: "absent", system: "absent", ha: "absent" } as const;
    const entry = (hostname: string, status: string): Coverage => ({ hostname, status, topics }) as Coverage;
    const coverage = [entry("a", "success"), entry("b", "unreachable"), entry("c", "partial"), entry("d", "not_collected"), entry("e", "failed"), entry("f", "brand_new")];
    const rows = coverageRows(coverage);
    expect(rows.map((r) => [r.status, r.tone])).toEqual([["success", "neutral"], ["unreachable", "error"], ["partial", "warning"], ["not_collected", "error"], ["failed", "error"], ["unknown", "neutral"]]);
    expect(coverageFacts(coverage)).toEqual({ scope: 6, answered: 2, partial: 1, unreachable: 2, failed: 1 });
    expect(sortCoverage(rows, null)).toBe(rows);
    expect(sortCoverage(rows, { key: "collection", direction: "ascending" }).map((r) => r.hostname)).toEqual(["b", "d", "e", "c", "f", "a"]);
    expect(sortCoverage(rows, { key: "device", direction: "descending" }).map((r) => r.hostname)).toEqual(["f", "e", "d", "c", "b", "a"]);
  });
});

describe("the cables and their sources", () => {
  it("have a row per combination the model knows, by status, the stroke of the status, never a cable invented", () => {
    const rows = sourceRows(model.combos);
    expect(rows.map((r) => [r.combo, r.status, r.line, r.count])).toEqual([
      ["lldpCdpDescription", "confirmed", "solid", 9],
      ["lldpDescription", "confirmed", "solid", 1],
      ["description", "documented_only", "dotted", 8],
      ["cdp", "observed_only", "dashed", 2],
      ["lldp", "observed_only", "dashed", 2],
    ]);
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(model.links.length);
    expect(sourceRows([{ combo: "lldp + snmp", status: "odd", observed: true, count: 1 }])[0]).toMatchObject({ combo: "other", status: "other", line: "solid" });
  });
});

describe("the delivery", () => {
  const runs = [{ run_id: "demo-0119", run_start: "2026-01-19T02:00:00Z", run_end: null, run_status: "completed", stored_at: "2026-01-19T02:15:00Z" }];

  it("says the exporter, the contract, the archive's date, the devices, the findings, the normalizations, what was left", () => {
    expect(deliveryOf(model, runs, "demo-0119")).toEqual({
      runStart: "2026-01-19T02:00:00Z", exporter: "ld-contracts-synth 1.0.0", contract: "1.0.0", storedAt: "2026-01-19T02:15:00Z",
      scope: 7, answered: 7, findings: 0, residual: 0, applied: 5, unread: 0, unresolved: 5,
    });
  });

  it("leaves out what it does not know: no report, no date from the archive", () => {
    const bare = deliveryOf({ ...model, ingest: null }, [{ ...runs[0], stored_at: "" }], "demo-0119");
    expect(bare.findings).toBeNull();
    expect(bare.storedAt).toBeNull();
    expect(deliveryOf(model, null, "demo-0119").storedAt).toBeNull();
  });
});
