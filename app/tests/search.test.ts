// The search's pure logic (brick 4): the v1's cases (devices, ports by name and description, groups and clusters, a
// removed device, fields, an unreadable regex, port abbreviations) on a hand-made model, then the synthetic
// eight-device series (e2e/fixtures/diagram/): notes, infrastructures, actions, the scopes and their counts, the
// arrows and Tab, the matched segments of a name, the detail of each kind of result.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "@engine/canvas/model";
import type { Model, PageData } from "@engine/canvas/types";
import { parseSnapshot } from "../src/api/run";
import { parseIntent } from "../src/api/run";
import { countOf, destinationsOf, detailOf, groupsIn, hitsIn, parse, portNames, rowsIn, SCOPES, search, segmentsOf, SHOWN_IN_ALL, SHOWN_IN_KIND, SHOWN_STEP, showMore, stepActive, stepScope } from "../src/state/search";
import type { ActionSource, Sources } from "../src/state/search";

const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../e2e/fixtures/diagram/${name}`, import.meta.url), "utf8"));
const snapshot = parseSnapshot(read("snapshot-demo-0119.json"));
const intent = parseIntent(read("intent.json"));
if (!snapshot || !intent) throw new Error("the e2e fixtures do not parse");
const data: PageData = { snapshot, ingest: null, origin: "test", catalogue: {}, intent };
const model = build(data);

const ACTIONS: readonly ActionSource[] = [
  { id: "fit", words: "Show everything" },
  { id: "grid", words: "Grid" },
  { id: "compareRun", words: "Compare with the collection of 12 Jan", runId: "demo-0112" },
];
const sources: Sources = { model, infrastructures: [{ name: "demo-dc", devices: 13 }, { name: "wan-core", devices: 14 }], current: "demo-dc", actions: ACTIONS };
const bare = (m: Model | null): Sources => ({ model: m, infrastructures: [], current: "", actions: [] });

/** The v1's hand-made model: three devices, a removed one, three ports, a group, an HA cluster. */
function tiny(): Model {
  const node = (hostname: string, type: string, extra: Record<string, unknown> = {}) => ({ hostname, type, kind: "device", site: "dc1", vendor: null, model: null, os_name: null, os_version: null, serial_number: null, collection: "success", ...extra });
  const nodes = [node("sw-core-01", "switch"), node("sw-core-02", "switch"), node("fw-01", "firewall")];
  const itf = (hostname: string, name: string, description: string | null) => ({ hostname, name, description, type: "physical" });
  const interfaces = [itf("sw-core-01", "Ethernet1/1", "C1|fw-01|port1|"), itf("sw-core-01", "Ethernet1/2", null), itf("fw-01", "port1", "uplink core")];
  const link = { id: "L1", a: { hostname: "sw-core-01", interface: "Ethernet1/1" }, b: { hostname: "fw-01", interface: "port1" }, ghost: false };
  return {
    nodes, ghostNodes: [node("sw-old", "switch", { ghost: true })], interfaces, nodeByHost: new Map(nodes.map((n) => [n.hostname, n])),
    linksByIface: new Map([["sw-core-01\u0000Ethernet1/1", [link]]]),
    groupById: new Map([["g1-1", { id: "g1-1", label: "Cœur DC1", description: "", members: ["sw-core-01", "sw-core-02"] }]]),
    clusters: [{ id: "fw-01", hosts: ["fw-01"], raw: { cluster_name: "EDGE", mode: "active_passive" } }],
    annotationById: new Map(),
  } as unknown as Model;
}

describe("the v1's cases", () => {
  const m = tiny();
  const find = (text: string) => search(bare(m), text);

  it("finds devices by name, ports by description, never a group by another spelling", () => {
    const core = find("core");
    expect(core.devices.map((h) => h.hostname)).toEqual(["sw-core-01", "sw-core-02"]);
    expect(core.ports.map((h) => [h.hostname, h.name])).toEqual([["fw-01", "port1"]]);
    expect(core.groups).toEqual([]);
    expect(core.total).toBe(3);
  });

  it("finds a port by its device and its short name; a port with one cable opens the cable, else its device", () => {
    const port = find("sw-core-01 eth1/1");
    expect(port.ports.map((h) => [h.name, h.selection, h.neighbour])).toEqual([["Ethernet1/1", { kind: "link", id: "L1" }, "fw-01"]]);
    expect(port.devices).toEqual([]);
    expect(find("port:eth1/2").ports.map((h) => h.selection)).toEqual([{ kind: "node", id: "sw-core-01" }]);
  });

  it("aims a device field alone at devices, never at their ports; desc: aims descriptions", () => {
    expect(find("type:firewall").ports).toEqual([]);
    expect(find("type:firewall").devices.map((h) => h.hostname)).toEqual(["fw-01"]);
    expect(find("desc:uplink").ports.map((h) => h.name)).toEqual(["port1"]);
    expect(find("desc:uplink").devices).toEqual([]);
  });

  it("finds an HA cluster by its name and a group by its label", () => {
    expect(find("edge").groups.map((h) => [h.kind, h.selection])).toEqual([["cluster", { kind: "cluster", id: "fw-01" }]]);
    expect(find("dc1").groups.map((h) => h.selection)).toEqual([{ kind: "group", id: "g1-1" }]);
  });

  it("marks a device the diff removed, lists ports found by name before those found by description", () => {
    expect(find("old").devices[0]).toMatchObject({ hostname: "sw-old", removed: true });
    expect(find("port1").ports.map((h) => [h.hostname, h.byName])).toEqual([["fw-01", true], ["sw-core-01", false]]);
  });

  it("says an unreadable regex and an empty text", () => {
    expect(find("(").error).not.toBeNull();
    expect(find("(").total).toBe(0);
    expect(find("").empty).toBe(true);
    expect(find("   ").empty).toBe(true);
    expect(parse("type:sw core").terms.map((t) => [t.field, t.explicit])).toEqual([["type", true], ["hostname", false]]);
  });

  it("abbreviates port names", () => {
    expect(portNames("port-channel10").split(" ")).toContain("po10");
    expect(portNames("GigabitEthernet1/0/1").split(" ")).toContain("Gi1/0/1");
    expect(portNames("1/1")).toBe("1/1");
  });

  it("searches nothing of a model that is not there, infrastructures and actions still", () => {
    const none = search({ ...sources, model: null }, "core");
    expect(none.devices).toEqual([]);
    expect(none.infrastructures.map((h) => h.name)).toEqual(["wan-core"]);
  });
});

describe("on the synthetic series", () => {
  it("finds the note by a word of its text, with the line that carries it", () => {
    const found = search(sources, "contact");
    expect(found.notes).toHaveLength(1);
    expect(found.notes[0]).toMatchObject({ noteKind: "note", line: 1, selection: { kind: "annotation" } });
    expect(found.notes[0].text.toLowerCase()).toContain("contact");
    expect(found.notes[0].title).toBe("Baie 12, rangée B");
  });

  it("finds infrastructures and actions by their words, the current infrastructure marked", () => {
    const found = search(sources, "dc");
    expect(found.infrastructures.map((h) => [h.name, h.current, h.devices])).toEqual([["demo-dc", true, 13]]);
    expect(search(sources, "12 jan").actions.map((h) => [h.id, h.runId])).toEqual([["compareRun", "demo-0112"]]);
    expect(search(sources, "grid").actions).toHaveLength(1);
    expect(search(sources, "type:switch").actions).toEqual([]);
    expect(search(sources, "type:switch").infrastructures).toEqual([]);
  });

  it("counts each scope and groups the results in the tabs' order", () => {
    const found = search(sources, "core");
    expect(countOf(found, "all")).toBe(found.total);
    expect(countOf(found, "devices")).toBe(2);
    expect(countOf(found, "infrastructures")).toBe(1);
    const groups = groupsIn(found, "all");
    expect(groups.map((g) => g.scope)).toEqual(["devices", "ports", "infrastructures"]);
    expect(groupsIn(found, "ports").map((g) => g.scope)).toEqual(["ports"]);
    expect(hitsIn(found, "all")).toHaveLength(found.total);
    expect(hitsIn(found, "actions")).toEqual([]);
  });

  it("finds the group and the cluster of the series", () => {
    expect(search(sources, "cœur").groups.map((h) => h.kind)).toEqual(["group"]);
    expect(search(sources, "active_passive").groups.map((h) => h.kind)).toEqual(["cluster"]);
  });

  it("walks the tabs with Tab, and the rows with the arrows, wrapping", () => {
    expect(stepScope("all", 1)).toBe("devices");
    expect(stepScope("all", -1)).toBe("actions");
    expect(stepScope("actions", 1)).toBe("all");
    expect(SCOPES).toHaveLength(7);
    expect(stepActive(0, 3, -1)).toBe(2);
    expect(stepActive(2, 3, 1)).toBe(0);
    expect(stepActive(0, 0, 1)).toBe(0);
  });

  it("cuts a name where the terms match, port: included, device fields excluded", () => {
    const { terms } = parse("core");
    expect(segmentsOf("dc01-core-01", terms)).toEqual([{ text: "dc01-", hit: false }, { text: "core", hit: true }, { text: "-01", hit: false }]);
    expect(segmentsOf("dc01-core-01", parse("type:switch").terms)).toEqual([{ text: "dc01-core-01", hit: false }]);
    expect(segmentsOf("Ethernet1/1", parse("port:eth").terms)[0]).toEqual({ text: "Eth", hit: true });
    expect(segmentsOf("abc", parse("x*").terms)).toEqual([{ text: "abc", hit: false }]);
    // a zero-width match stops nothing: the "o"s are marked (review B1)
    expect(segmentsOf("dc01-core-01", parse("o*").terms).filter((s) => s.hit).map((s) => s.text)).toEqual(["o"]);
    // `hostname:` aims the name shown: marked (review B2)
    expect(segmentsOf("dc01-core-01", parse("hostname:core").terms)[1]).toEqual({ text: "core", hit: true });
    expect(segmentsOf("", terms)).toEqual([]);
  });

  it("details a device: its cables grouped by destination, its first alert, its MLAG peers", () => {
    const [hit] = search(sources, "dc01-core-01").devices;
    const detail = detailOf(model, hit);
    expect(detail?.kind).toBe("device");
    if (detail?.kind !== "device") return;
    expect(detail.node.hostname).toBe("dc01-core-01");
    expect(detail.cables).toBeGreaterThan(0);
    expect(detail.destinations.length).toBeGreaterThan(0);
    expect(detail.destinations.reduce((n, d) => n + d.ports.length, 0)).toBe(detail.cables);
    expect(detail.mlagPeers).toEqual(["dc01-core-02"]);
    expect(detail.alert?.severity).toBe("error");
    expect(destinationsOf(model, "nobody")).toEqual([]);
  });

  it("details a port, a group, a cluster, a note, an infrastructure, an action; null when the model lost it", () => {
    const port = search(sources, "dc01-core-01 eth1/1").ports.find((h) => h.hostname === "dc01-core-01" && h.name === "Ethernet1/1");
    if (!port) throw new Error("the port is not found");
    const detail = detailOf(model, port);
    expect(detail?.kind === "port" && detail.row?.name).toBe("Ethernet1/1");
    const group = search(sources, "cœur").groups[0];
    // the fixture's group names devices the series does not hold: members listed, none present
    expect(detailOf(model, group)).toMatchObject({ kind: "group", label: "Cœur", members: ["sw-core-01", "sw-core-02"], present: [] });
    const cluster = search(sources, "active_passive").groups[0];
    expect(detailOf(model, cluster)).toMatchObject({ kind: "cluster", mode: "active_passive" });
    const note = search(sources, "contact").notes[0];
    const noteDetail = detailOf(model, note);
    expect(noteDetail?.kind === "note" && noteDetail.lines.length).toBeGreaterThan(0);
    expect(detailOf(model, search(sources, "wan").infrastructures[0])).toEqual({ kind: "infrastructure", name: "wan-core", current: false, devices: 14 });
    expect(detailOf(model, search(sources, "grid").actions[0])).toEqual({ kind: "action", id: "grid", runId: null });
    expect(detailOf(null, port)).toBeNull();
    expect(detailOf(model, { ...port, name: "Ethernet9/99" })).toBeNull();
    expect(detailOf(model, { ...group, id: "gone" })).toBeNull();
    expect(detailOf(model, { ...cluster, id: "gone" })).toBeNull();
    expect(detailOf(model, { ...note, id: "gone" })).toBeNull();
  });

  it("freezes what it returns", () => {
    const found = search(sources, "core");
    expect(Object.isFrozen(found)).toBe(true);
    expect(Object.isFrozen(found.devices[0])).toBe(true);
  });

  it("windows each group: a few rows in All, a page in a kind's tab, a 'more' row after a cut group, a page more on ask", () => {
    const found = search(sources, "e");
    expect(found.ports.length).toBeGreaterThan(SHOWN_IN_ALL);
    const all = groupsIn(found, "all", {});
    const ports = all.find((group) => group.scope === "ports");
    expect(ports?.hits).toHaveLength(SHOWN_IN_ALL);
    expect(ports?.more).toBe(found.ports.length - SHOWN_IN_ALL);
    const rows = rowsIn(found, "all", {});
    expect(rows.filter((row) => row.kind === "more").map((row) => row.kind === "more" && row.scope)).toContain("ports");
    expect(rows.findIndex((row) => row.kind === "more" && row.scope === "ports")).toBe(rows.findIndex((row) => row.kind === "port") + SHOWN_IN_ALL);
    expect(hitsIn(found, "all", {}).every((hit) => hit.kind !== ("more" as string))).toBe(true);
    // the kind's own tab shows a page; "more" adds a page
    const inKind = groupsIn(found, "ports", {})[0];
    expect(inKind.hits.length).toBe(Math.min(SHOWN_IN_KIND, found.ports.length));
    const asked = showMore("ports", {}, "ports");
    expect(asked.ports).toBe(SHOWN_IN_KIND + SHOWN_STEP);
    expect(groupsIn(found, "ports", asked)[0].hits.length).toBe(Math.min(SHOWN_IN_KIND + SHOWN_STEP, found.ports.length));
    // without a window, everything (the pure tests above)
    expect(groupsIn(found, "all").every((group) => group.more === 0)).toBe(true);
  });

  it("stays fast and bounded at the gauge: 500 devices, 24 000 ports, one character", () => {
    const nodes = Array.from({ length: 500 }, (_, i) => ({ hostname: `dc${String(i % 4).padStart(2, "0")}-sw-${String(i).padStart(3, "0")}`, type: "switch", kind: "device", site: `dc${i % 4}`, vendor: "cisco", model: "C9300", os_name: "IOS-XE", os_version: "17.9", serial_number: `S${i}`, collection: "success" }));
    const interfaces = nodes.flatMap((node) => Array.from({ length: 48 }, (_, k) => ({ hostname: node.hostname, name: `GigabitEthernet1/0/${k + 1}`, description: k % 2 ? `edge port ${k}` : null, type: "physical" })));
    const big = {
      nodes, ghostNodes: [], interfaces, nodeByHost: new Map(nodes.map((n) => [n.hostname, n])), linksByIface: new Map(), groupById: new Map(), clusters: [], annotationById: new Map(),
    } as unknown as Model;
    const started = performance.now();
    const found = search(bare(big), "0");
    const rows = rowsIn(found, "all", {});
    const elapsed = performance.now() - started;
    expect(found.ports.length).toBe(24_000);
    expect(found.devices.length).toBe(500);
    expect(rows.length).toBeLessThanOrEqual(SHOWN_IN_ALL * 2 + 2);
    expect(elapsed, "one character at the gauge, in ms").toBeLessThan(1500);
  });
});
