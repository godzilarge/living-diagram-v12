// The panel's pure logic on the synthetic eight-device series (e2e/fixtures/diagram/): the interface rows and their
// facts, the neighbour seen by LLDP or CDP only, the scope and the filter, the sort with missing values last, the
// alerts grouped by code in severity order with what they name, the aggregates and their other end, the MLAG pairs,
// the HA clusters, a cable's two ends; the columns of each width; the chrome insets with a panel.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "@engine/canvas/model";
import type { PageData } from "@engine/canvas/types";
import { parseSnapshot } from "../src/api/run";
import { chromeWith, CHROME } from "../src/diagram/chrome";
import {
  aggregateRows, alertsOf, cableFacts, columnsFor, countCabled, countDown, filterRows, haClusters, hiddenColumns, interfaceRows, isEveryVlan,
  mlagPairs, mlagPeers, neighboursOf, severityCountsOf, sortRows, vlanRangesText,
} from "../src/state/panel";

const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../e2e/fixtures/diagram/${name}`, import.meta.url), "utf8"));
const snapshot = parseSnapshot(read("snapshot-demo-0119.json"));
if (!snapshot) throw new Error("the e2e snapshot fixture does not parse");
const data: PageData = { snapshot, ingest: null, origin: "test", catalogue: {} };
const model = build(data);
const CORE = "dc01-core-01";

describe("the interface rows", () => {
  const rows = interfaceRows(model, CORE);

  it("carry every fact of the contract, in the snapshot's order, frozen", () => {
    expect(rows.length).toBe(model.ifacesByNode.get(CORE)?.length);
    const first = rows[0];
    expect(first.name).toBe("Ethernet1/1");
    expect(first).toMatchObject({ state: "down", tone: "error", reason: "Link not connected", media: "10Gbase-SR", lastChange: "never", cabled: true });
    expect(first.aggregate).toEqual({ name: "port-channel101", status: "down" });
    expect(first.mode).toEqual({ kind: "trunk", allowed: [{ first: 10, last: 20 }, { first: 100, last: 100 }, { first: 200, last: 210 }], native: 1 });
    expect(Object.isFrozen(first)).toBe(true);
    const up = rows.find((row) => row.name === "Ethernet1/3");
    expect(up).toMatchObject({ state: "up", tone: "ok", speedMbps: 10000, duplex: "full", lastChange: 611700 });
    expect(rows.find((row) => row.name === "Ethernet1/2")?.mode).toEqual({ kind: "access", vlan: 1 });
  });

  it("say a port shut by the device as admin down, neutral", () => {
    const itf = { ...model.interfaces[0], admin_status: "down" as const, oper_status: "down" as const };
    const alone = build({ ...data, snapshot: { ...snapshot, interfaces: [itf] } });
    expect(interfaceRows(alone, itf.hostname)[0]).toMatchObject({ state: "adminDown", tone: "neutral" });
  });

  it("name as neighbour only what LLDP or CDP saw, with the other end's port", () => {
    const seen = rows.filter((row) => row.neighbours.length > 0);
    expect(seen.length).toBeGreaterThan(0);
    for (const row of seen) for (const neighbour of row.neighbours) expect(neighbour.sources.every((s) => s === "lldp" || s === "cdp")).toBe(true);
    // Ethernet1/2 has a cable known by its description only (documented, never observed): no neighbour named
    expect(neighboursOf(model, CORE, "Ethernet1/2")).toEqual([]);
    expect(rows.find((row) => row.name === "Ethernet1/2")?.cabled).toBe(true);
  });

  it("scope and filter: cabled ports by default, every word typed must match somewhere", () => {
    const cabled = filterRows(rows, "cabled", "");
    expect(cabled.length).toBe(countCabled(rows));
    expect(cabled.length).toBeLessThan(rows.length);
    expect(filterRows(rows, "all", "").length).toBe(rows.length);
    expect(filterRows(rows, "all", "eth1/3").map((row) => row.name)).toContain("Ethernet1/3");
    expect(filterRows(rows, "all", "ETHERNET1/3 sr").map((row) => row.name)).toEqual(["Ethernet1/3"]);
    expect(filterRows(rows, "all", "nowhere-at-all")).toEqual([]);
    expect(filterRows(rows, "all", "acc-03").every((row) => row.neighbours.some((n) => n.hostname.includes("acc-03")) || row.description?.includes("acc-03"))).toBe(true);
  });

  it("sort: by a column either way, a missing value last whatever the direction, the snapshot's order between equals", () => {
    const bySpeed = sortRows(rows, { key: "speed", direction: "descending" });
    expect(bySpeed[0].speedMbps).not.toBeNull();
    expect(bySpeed[bySpeed.length - 1].speedMbps).toBeNull();
    const asc = sortRows(rows, { key: "speed", direction: "ascending" });
    expect(asc[asc.length - 1].speedMbps).toBeNull();
    const byPort = sortRows(rows, { key: "port", direction: "descending" });
    expect(byPort[0].name > byPort[byPort.length - 1].name || /^mgmt|^port/.test(byPort[0].name)).toBe(true);
    const byState = sortRows(rows, { key: "state", direction: "ascending" });
    expect(byState[0].state).toBe("up");
    expect(sortRows(rows, null)).toBe(rows);
    const byAge = sortRows(rows, { key: "lastChange", direction: "ascending" });
    expect(byAge[0].lastChange).not.toBe("never");
    expect(byAge.filter((row) => row.lastChange === "never").length).toBeGreaterThan(0);
  });

  it("writes VLAN ranges as the CLI does, and knows the whole range", () => {
    expect(vlanRangesText([{ first: 10, last: 20 }, { first: 100, last: 100 }])).toBe("10-20, 100");
    expect(isEveryVlan([{ first: 1, last: 4094 }])).toBe(true);
    expect(isEveryVlan([{ first: 1, last: 4000 }])).toBe(false);
  });
});

describe("the columns", () => {
  it("follow the width; focus shows everything but what the reader hid, never hiding the port", () => {
    expect(columnsFor("compact")).toEqual(["port", "state", "speed", "neighbour"]);
    expect(columnsFor("wide")).toEqual(["port", "state", "speed", "mode", "neighbour", "description"]);
    expect(columnsFor("focus").length).toBe(10);
    expect(columnsFor("focus", new Set(["port", "mac"]))).not.toContain("mac");
    expect(columnsFor("focus", new Set(["port", "mac"]))).toContain("port");
    expect(hiddenColumns("compact")).toEqual(["media", "mode", "addresses", "mac", "lastChange", "description"]);
    expect(hiddenColumns("wide")).toEqual(["media", "addresses", "mac", "lastChange"]);
    expect(hiddenColumns("focus")).toEqual([]);
  });
});

describe("the alerts", () => {
  it("group the device's checks by code, the most severe first, each naming what it concerns once", () => {
    const alerts = alertsOf(model, CORE);
    expect(alerts.length).toBeGreaterThan(2);
    const ranks = alerts.map((a) => ({ error: 0, warning: 1, info: 2 })[a.severity]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(alerts[0]).toMatchObject({ code: "aggregate_below_min_links", severity: "error", tone: "error", count: 1 });
    expect(alerts[0].refs).toEqual([{ kind: "aggregate", hostname: CORE, name: "port-channel101", remote: null }]);
    const documented = alerts.find((a) => a.code === "documented_not_observed" && a.severity === "info");
    expect(documented?.count).toBe(3);
    expect(documented?.refs.map((r) => r.remote?.hostname)).toEqual(["dc01-acc-02", "dc01-fw-01", "dc01-fw-02"]);
    const counts = severityCountsOf(alerts);
    expect(counts.error + counts.warning + counts.info).toBe(model.checksByNode.get(CORE)?.length);
    expect(alertsOf(model, "nowhere")).toEqual([]);
  });
});

describe("the structures", () => {
  it("aggregates: active members, the device at the other end, the peer link, out of service counted", () => {
    const rows = aggregateRows(model, CORE);
    expect(rows.map((row) => row.name)).toEqual(["port-channel10", "port-channel20", "port-channel21", "port-channel101", "port-channel103"]);
    const peer = rows[0];
    expect(peer).toMatchObject({ peerLink: true, to: ["dc01-core-02"], bundled: 2, total: 2, up: true, tone: "neutral" });
    const down = rows.find((row) => row.name === "port-channel101");
    expect(down).toMatchObject({ bundled: 0, total: 1, up: false, tone: "error", to: ["dc01-acc-01"], mlagId: 101 });
    expect(countDown(rows)).toBe(1);
  });

  it("MLAG pairs: the peer, the two aggregates, the downstream device, the peer link", () => {
    const pairs = mlagPairs(model, CORE);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0]).toMatchObject({ mlagId: 20, peer: "dc01-core-02", ownAggregate: "port-channel20", peerAggregate: "port-channel20", downstream: "dc01-fw-01" });
    expect(pairs[0].peerLink?.name).toBe("port-channel10");
    expect(mlagPeers(pairs)).toEqual(["dc01-core-02"]);
    expect(mlagPairs(model, "dc01-rt-01")).toEqual([]);
  });

  it("HA clusters: the cluster, its members, the heartbeats and whether their cable is known", () => {
    const clusters = haClusters(model, "dc01-fw-01");
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ name: "DC01-EDGE", mode: "active_passive", hosts: ["dc01-fw-01", "dc01-fw-02"] });
    expect(clusters[0].own.hostname).toBe("dc01-fw-01");
    expect(clusters[0].heartbeats[0]).toEqual({ hostname: "dc01-fw-01", port: "ha1", cabled: true });
    expect(haClusters(model, CORE)).toEqual([]);
  });

  it("a cable: both ends with their interfaces as the devices describe them", () => {
    const link = model.links.find((l) => l.a.hostname === "dc01-acc-01" && l.b.hostname === CORE);
    if (!link) throw new Error("no cable between the access and the core in the fixture");
    const facts = cableFacts(model, link);
    expect(facts.a.hostname).toBe("dc01-acc-01");
    expect(facts.a.row?.name).toBe(link.a.interface);
    expect(facts.b.row?.name).toBe(link.b.interface);
    expect(facts.a.known && facts.b.known).toBe(true);
    expect(facts.removed).toBe(false);
  });
});

describe("the chrome insets", () => {
  it("give the panel its width and 12 px on the right; nothing in focus or without a panel", () => {
    expect(chromeWith(null)).toBe(CHROME);
    expect(chromeWith("focus")).toBe(CHROME);
    expect(chromeWith("compact").right).toBe(452);
    expect(chromeWith("wide").right).toBe(876);
    expect(chromeWith("compact").top).toBe(CHROME.top);
  });
});
