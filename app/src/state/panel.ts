// What the panel reads of the selected element, as values, never as words (brick 3, design/comps/shell/index.html):
// every fact of the contract on a device's interfaces (state, speed and duplex, media, mode and VLANs, addresses,
// MAC, last change, aggregate, the neighbour seen by LLDP or CDP, the raw description), the device's alerts (its
// checks grouped by code, in severity order, with the ports, aggregates or cables they name), its aggregates with
// their active members and the device at their other end, its MLAG pairs, its HA clusters. The columns of each
// width, the scope (cabled ports, every port), a text filter and a sort over the rows. Pure, tested under Node; the
// components put the words on these values (`panel/words.ts`).
import { shortPort } from "@engine/canvas/format";
import { ifaceKey, linkId, OBSERVED, SEVERITY_RANK } from "@engine/canvas/model";
import type { Aggregate, CheckEntry, Cluster, HaMembership, MlagDomainEntry, Model, ModelLink, ModelNode } from "@engine/canvas/types";
import type { AdminStatus, Duplex, InterfaceRole, InterfaceType, IpAddress, MemberStatus, OperStatus, ParsedDescription, Severity, VlanRange } from "@engine/contracts/snapshot";
import type { Sort } from "../ui";
import type { Tone } from "../ui";

export type Width = "compact" | "wide" | "focus";
export type Scope = "cabled" | "all";

/** A port's state as one word: what the device says, `adminDown` when the device itself shut it. */
export type StateWord = "up" | "down" | "adminDown" | "testing" | "unknown" | "dormant" | "notPresent" | "lowerLayerDown";
export type Mode =
  | Readonly<{ kind: "access"; vlan: number | null }>
  | Readonly<{ kind: "trunk"; allowed: readonly VlanRange[] | null; native: number | null }>
  | Readonly<{ kind: "routed" }>
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "vlan"; vlan: number }>
  | Readonly<{ kind: "unknown" }>;
export type Neighbour = Readonly<{ hostname: string; port: string | null; sources: readonly string[] }>;
export type InterfaceRow = Readonly<{
  id: string;
  name: string;
  type: InterfaceType;
  cabled: boolean;
  aggregate: Readonly<{ name: string; status: MemberStatus | null }> | null;
  state: StateWord;
  tone: Tone;
  reason: string | null;
  speedMbps: number | null;
  duplex: Duplex | null;
  media: string | null;
  mode: Mode;
  addresses: readonly IpAddress[];
  vrf: string | null;
  mac: string | null;
  lastChange: number | "never" | null;
  neighbours: readonly Neighbour[];
  description: string | null;
  /** The description as B1 read it (R2), null when it does not follow the standard: the Check view's matter. */
  parsed: ParsedDescription | null;
  parent: string | null;
  context: string | null;
  roles: readonly InterfaceRole[];
}>;

export const COLUMNS = ["port", "state", "speed", "media", "mode", "addresses", "mac", "lastChange", "neighbour", "description"] as const;
export type ColumnKey = (typeof COLUMNS)[number];
const BY_WIDTH: Readonly<Record<Width, readonly ColumnKey[]>> = {
  compact: ["port", "state", "speed", "neighbour"],
  wide: ["port", "state", "speed", "mode", "neighbour", "description"],
  focus: COLUMNS,
};
/** The columns a width shows; in focus, less those the reader hid (the port column never hides). */
export function columnsFor(width: Width, hidden: ReadonlySet<ColumnKey> = new Set()): readonly ColumnKey[] {
  return width === "focus" ? COLUMNS.filter((key) => key === "port" || !hidden.has(key)) : BY_WIDTH[width];
}
/** The columns the next width adds, said above the table ("mode and VLANs, description… : widen or focus"). */
export const hiddenColumns = (width: Width): readonly ColumnKey[] => COLUMNS.filter((key) => !BY_WIDTH[width].includes(key));

const STATE_WORD: Readonly<Record<OperStatus, StateWord>> = {
  up: "up", down: "down", testing: "testing", unknown: "unknown", dormant: "dormant", not_present: "notPresent", lower_layer_down: "lowerLayerDown",
};
function stateOf(admin: AdminStatus, oper: OperStatus): Readonly<{ state: StateWord; tone: Tone }> {
  if (admin === "down") return { state: "adminDown", tone: "neutral" };
  const state = STATE_WORD[oper] ?? "unknown";
  return { state, tone: state === "up" ? "ok" : state === "down" || state === "lowerLayerDown" ? "error" : "neutral" };
}

function modeOf(itf: Model["interfaces"][number]): Mode {
  switch (itf.switchport_mode) {
    case "access": return { kind: "access", vlan: itf.access_vlan };
    case "trunk": return { kind: "trunk", allowed: itf.allowed_vlans, native: itf.native_vlan };
    case "routed": return { kind: "routed" };
    case "none": return { kind: "none" };
    default: return itf.vlan_id !== null ? { kind: "vlan", vlan: itf.vlan_id } : { kind: "unknown" };
  }
}

/** The whole VLAN range (1 to 4094) as one interval: said "all", never listed. */
export const isEveryVlan = (ranges: readonly VlanRange[]): boolean => ranges.length === 1 && ranges[0].first <= 1 && ranges[0].last >= 4094;
/** "10-20, 100, 200-210": the allowed VLANs of a trunk as the CLI writes them. */
export const vlanRangesText = (ranges: readonly VlanRange[]): string => ranges.map((r) => (r.first === r.last ? String(r.first) : `${r.first}-${r.last}`)).join(", ");

/** The devices at the other end of a port's cables that LLDP or CDP saw (the sources of the link), in the order of
 *  the cables; a cable known by a description only names no neighbour here (DIRECTION.md: Voisin). */
export function neighboursOf(model: Model, hostname: string, port: string): readonly Neighbour[] {
  const links = model.linksByIface.get(ifaceKey(hostname, port)) ?? [];
  return links
    .filter((link) => !link.ghost && link.sources.some((source) => OBSERVED[source]))
    .map((link) => {
      const other = link.a.hostname === hostname && link.a.interface === port ? link.b : link.a;
      return { hostname: other.hostname, port: other.interface, sources: link.sources.filter((source) => OBSERVED[source]) };
    });
}

const hasCable = (model: Model, hostname: string, port: string): boolean => (model.linksByIface.get(ifaceKey(hostname, port)) ?? []).some((link) => !link.ghost);

/** The device's interfaces as rows, in the snapshot's order (natural). */
export function interfaceRows(model: Model, hostname: string): readonly InterfaceRow[] {
  return (model.ifacesByNode.get(hostname) ?? []).map((itf) => {
    const { state, tone } = stateOf(itf.admin_status, itf.oper_status);
    return Object.freeze({
      id: itf.name,
      name: itf.name,
      type: itf.type,
      cabled: hasCable(model, hostname, itf.name),
      aggregate: itf.aggregate ? { name: itf.aggregate.name, status: itf.aggregate.member_status } : null,
      state,
      tone,
      reason: itf.oper_reason,
      speedMbps: itf.speed_mbps,
      duplex: itf.duplex,
      media: itf.media,
      mode: modeOf(itf),
      addresses: itf.ip_addresses,
      vrf: itf.vrf,
      mac: itf.mac_address,
      lastChange: itf.last_change_age_seconds,
      neighbours: neighboursOf(model, hostname, itf.name),
      description: itf.description,
      parsed: itf.description_parsed,
      parent: itf.parent_interface,
      context: itf.virtual_context,
      roles: itf.roles,
    });
  });
}

export const countCabled = (rows: readonly InterfaceRow[]): number => rows.filter((row) => row.cabled).length;

const fold = (text: string): string => text.toLowerCase();
/** The words the page shows for a row and the filter must match too (the state, the duplex, the mode, the last
 *  change, in the page's language): given by the component, which owns the catalogue. */
export type ShownWords = (row: InterfaceRow) => string;
const noWords: ShownWords = () => "";

/** What a text filter reads of a row: the port (long and short), the description, the neighbours, the media, the MAC,
 *  the addresses, the aggregate, the parent, the context, the VLANs as digits, and the words the table shows. */
function searchable(row: InterfaceRow, shown: ShownWords): string {
  const mode = row.mode.kind === "access" ? String(row.mode.vlan ?? "") : row.mode.kind === "trunk" ? `${row.mode.allowed ? vlanRangesText(row.mode.allowed) : ""} ${row.mode.native ?? ""}` : row.mode.kind === "vlan" ? String(row.mode.vlan) : "";
  const parts = [row.name, shortPort(row.name), row.description ?? "", row.media ?? "", row.mac ?? "", row.vrf ?? "", row.aggregate?.name ?? "", mode,
    row.parent ?? "", row.context ?? "", ...row.neighbours.flatMap((n) => [n.hostname, n.port ?? "", shortPort(n.port)]), ...row.addresses.map((a) => `${a.address}/${a.prefix}`), shown(row)];
  return fold(parts.join("\n"));
}

/** The rows of a scope that match a filter (every word typed must appear somewhere in the row, shown words included). */
export function filterRows(rows: readonly InterfaceRow[], scope: Scope, query: string, shown: ShownWords = noWords): readonly InterfaceRow[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return rows.filter((row) => (scope === "all" || row.cabled) && (words.length === 0 || words.every((word) => searchable(row, shown).includes(word))));
}

const compare = new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare;
const STATE_RANK: Readonly<Record<StateWord, number>> = { up: 0, dormant: 1, testing: 2, lowerLayerDown: 3, down: 4, adminDown: 5, notPresent: 6, unknown: 7 };
const ageOf = (row: InterfaceRow): number | null => (row.lastChange === "never" ? Number.MAX_SAFE_INTEGER : row.lastChange);
const modeText = (row: InterfaceRow): string => (row.mode.kind === "unknown" ? "" : row.mode.kind + (row.mode.kind === "access" ? String(row.mode.vlan ?? "") : row.mode.kind === "trunk" && row.mode.allowed ? vlanRangesText(row.mode.allowed) : ""));
const textOf: Readonly<Record<Exclude<ColumnKey, "speed" | "lastChange" | "state">, (row: InterfaceRow) => string>> = {
  port: (row) => row.name,
  media: (row) => row.media ?? "",
  mode: modeText,
  addresses: (row) => row.addresses.map((a) => `${a.address}/${a.prefix}`).join(" "),
  mac: (row) => row.mac ?? "",
  neighbour: (row) => row.neighbours.map((n) => `${n.hostname} ${n.port ?? ""}`).join(" "),
  description: (row) => row.description ?? "",
};

/** The rows sorted by a column (a missing value last whatever the direction), the snapshot's order between equals. */
export function sortRows(rows: readonly InterfaceRow[], sort: Sort | null): readonly InterfaceRow[] {
  if (!sort) return rows;
  const sign = sort.direction === "ascending" ? 1 : -1;
  const numeric = (of: (row: InterfaceRow) => number | null) => (a: InterfaceRow, b: InterfaceRow): number => {
    const x = of(a), y = of(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return sign * (x - y);
  };
  const textual = (of: (row: InterfaceRow) => string) => (a: InterfaceRow, b: InterfaceRow): number => {
    const x = of(a), y = of(b);
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return sign * compare(x, y);
  };
  const key = sort.key as ColumnKey;
  const by = key === "speed" ? numeric((row) => row.speedMbps) : key === "lastChange" ? numeric(ageOf) : key === "state" ? numeric((row) => STATE_RANK[row.state]) : textual(textOf[key as keyof typeof textOf] ?? (() => ""));
  return rows.map((row, index) => ({ row, index })).sort((a, b) => by(a.row, b.row) || a.index - b.index).map(({ row }) => row);
}

// ——— Alerts: the device's checks, grouped by code ———

export type RefName = Readonly<{ kind: "port" | "aggregate" | "cable" | "device"; hostname: string; name: string; remote: Readonly<{ hostname: string; port: string }> | null }>;
export type AlertGroup = Readonly<{ code: string; severity: Severity; tone: Tone; count: number; refs: readonly RefName[] }>;
const TONE_OF: Readonly<Record<Severity, Tone>> = { error: "error", warning: "warning", info: "neutral" };

/** What a check names on this device, as data: a port or an aggregate (its device when it is another one), a cable
 *  by its local port and its other end, another device, the other members of a cluster; never the device itself. */
function refNames(check: CheckEntry, hostname: string): readonly RefName[] {
  const names: RefName[] = [];
  for (const ref of check.refs) {
    if (ref.kind === "interface") names.push({ kind: "port", hostname: ref.hostname, name: ref.name, remote: null });
    else if (ref.kind === "aggregate") names.push({ kind: "aggregate", hostname: ref.hostname, name: ref.name, remote: null });
    else if (ref.kind === "link") {
      const local = ref.a.hostname === hostname ? ref.a : ref.b;
      const other = local === ref.a ? ref.b : ref.a;
      names.push({ kind: "cable", hostname: local.hostname, name: local.interface, remote: { hostname: other.hostname, port: other.interface } });
    } else if (ref.kind === "cluster") ref.members.filter((member) => member !== hostname).forEach((member) => names.push({ kind: "device", hostname: member, name: "", remote: null }));
    else if (ref.kind === "node" && ref.hostname !== hostname) names.push({ kind: "device", hostname: ref.hostname, name: "", remote: null });
  }
  return names;
}
const refKey = (ref: RefName): string => [ref.hostname, ref.name, ref.remote?.hostname ?? "", ref.remote?.port ?? ""].join("\u0000");

/** Checks grouped into alerts: one line per code and severity, the most severe first, then the snapshot's order;
 *  each counts its checks and names what they concern (seen from `hostname`), each thing once. */
export function alertGroupsOf(checks: readonly CheckEntry[], hostname: string): readonly AlertGroup[] {
  const groups = new Map<string, { code: string; severity: Severity; count: number; refs: Map<string, RefName> }>();
  for (const check of checks) {
    const key = `${check.severity}\u0000${check.code}`;
    const group = groups.get(key) ?? { code: check.code, severity: check.severity, count: 0, refs: new Map<string, RefName>() };
    const refs = new Map(group.refs);
    refNames(check, hostname).forEach((ref) => refs.set(refKey(ref), ref));
    groups.set(key, { ...group, count: group.count + 1, refs });
  }
  return Array.from(groups.values())
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
    .map((group) => Object.freeze({ code: group.code, severity: group.severity, count: group.count, tone: TONE_OF[group.severity] ?? "neutral", refs: Object.freeze(Array.from(group.refs.values())) }));
}

/** The device's alerts: its checks, grouped. */
export const alertsOf = (model: Model, hostname: string): readonly AlertGroup[] => alertGroupsOf(model.checksByNode.get(hostname) ?? [], hostname);

export type SeverityCounts = Readonly<{ error: number; warning: number; info: number }>;
export const severityCountsOf = (groups: readonly AlertGroup[]): SeverityCounts =>
  groups.reduce((acc, group) => ({ ...acc, [group.severity]: acc[group.severity] + group.count }), { error: 0, warning: 0, info: 0 } as SeverityCounts);

// ——— Aggregates, MLAG, HA ———

export type AggregateRow = Readonly<{
  id: string;
  name: string;
  /** The device(s) at the other end of its cables; a peer link names its MLAG peer. */
  to: readonly string[];
  peerLink: boolean;
  mlagId: number | null;
  bundled: number;
  total: number;
  up: boolean;
  tone: Tone;
  protocol: string;
  lacpMode: string | null;
  minLinks: number | null;
}>;

const otherEnds = (aggregate: Aggregate): readonly string[] =>
  Array.from(new Set(aggregate.cables.filter((link) => !link.ghost).map((link) => (link.a.hostname === aggregate.hostname ? link.b.hostname : link.a.hostname))));

export function aggregateRow(aggregate: Aggregate): AggregateRow {
  const raw = aggregate.raw;
  const bundled = raw.members.filter((member) => member.status === "bundled").length;
  const total = raw.members.length;
  const up = raw.oper_status === "up";
  return Object.freeze({
    id: aggregate.key, name: aggregate.name, to: otherEnds(aggregate), peerLink: raw.mlag_peer_link === true, mlagId: raw.mlag_id, bundled, total, up,
    tone: !up || bundled === 0 ? "error" : raw.degraded ? "warning" : "neutral", protocol: raw.protocol, lacpMode: raw.lacp_mode, minLinks: raw.min_links,
  });
}

/** The device's aggregates in the snapshot's order; `down` counts those out of service. */
export function aggregateRows(model: Model, hostname: string): readonly AggregateRow[] {
  return (model.aggregatesByNode.get(hostname) ?? []).map(aggregateRow);
}
export const countDown = (rows: readonly AggregateRow[]): number => rows.filter((row) => !row.up || row.bundled === 0).length;

export type MlagPair = Readonly<{ id: string; mlagId: number; peer: string | null; ownAggregate: string; peerAggregate: string | null; downstream: string | null; peerLink: AggregateRow | null }>;

/** The MLAG domains this device takes part in: the peer device, the two aggregates, the device downstream, the peer
 *  link (when this device carries it, or its peer). */
export function mlagPairs(model: Model, hostname: string): readonly MlagPair[] {
  const seen = new Set<string>();
  return model.mlagDomains
    .filter((domain) => domain.raw.members.some((member) => member.hostname === hostname))
    .map((domain: MlagDomainEntry): MlagPair => {
      const own = domain.raw.members.find((member) => member.hostname === hostname);
      const peer = domain.raw.members.find((member) => member.hostname !== hostname) ?? null;
      return Object.freeze({
        id: domain.id, mlagId: domain.raw.mlag_id, peer: peer?.hostname ?? null, ownAggregate: own?.aggregate ?? "", peerAggregate: peer?.aggregate ?? null,
        downstream: domain.raw.downstream, peerLink: domain.peerLink ? aggregateRow(domain.peerLink) : null,
      });
    })
    .filter((pair) => (seen.has(pair.id) ? false : (seen.add(pair.id), true)));
}

/** The peer devices of this device's MLAG domains, each once. */
export const mlagPeers = (pairs: readonly MlagPair[]): readonly string[] => Array.from(new Set(pairs.map((pair) => pair.peer).filter((peer): peer is string => !!peer)));

export type HaFacts = Readonly<{ id: string; name: string | null; mode: string; hosts: readonly string[]; members: Cluster["raw"]["members"]; own: HaMembership["member"]; heartbeats: readonly Readonly<{ hostname: string; port: string; cabled: boolean }>[] }>;

export function haClusters(model: Model, hostname: string): readonly HaFacts[] {
  return (model.haMembershipsByHost.get(hostname) ?? []).map(({ cluster, member }) => Object.freeze({
    id: cluster.id, name: cluster.raw.cluster_name, mode: cluster.raw.mode, hosts: cluster.hosts, members: cluster.raw.members, own: member,
    heartbeats: cluster.raw.heartbeat_interfaces.map((hb) => ({ hostname: hb.hostname, port: hb.interface, cabled: hb.cable !== null })),
  }));
}

// ——— A cable ———

export type CableEnd = Readonly<{ hostname: string; port: string; row: InterfaceRow | null; known: boolean }>;
export type CableFacts = Readonly<{ id: string; a: CableEnd; b: CableEnd; speedMbps: number | null; oper: ModelLink["raw"]["oper"]; aggregates: readonly string[]; beam: Readonly<{ a: string; b: string }> | null; removed: boolean; checks: readonly CheckEntry[] }>;

function cableEnd(model: Model, hostname: string, port: string): CableEnd {
  const row = interfaceRows(model, hostname).find((candidate) => candidate.name === port) ?? null;
  return Object.freeze({ hostname, port, row, known: model.nodeByHost.get(hostname)?.kind === "device" });
}

/** A cable's facts: its two ends with their interfaces as the devices describe them, what the link shares. */
export function cableFacts(model: Model, link: ModelLink): CableFacts {
  const raw = link.raw;
  return Object.freeze({
    id: link.id,
    a: cableEnd(model, raw.a.hostname, raw.a.interface),
    b: cableEnd(model, raw.b.hostname, raw.b.interface),
    speedMbps: raw.speed_mbps,
    oper: raw.oper,
    aggregates: [raw.aggregate_a, raw.aggregate_b].filter((name): name is string => !!name),
    beam: link.beam ? { a: link.beam.a.aggregate, b: link.beam.b.aggregate } : null,
    removed: link.ghost,
    checks: link.checks,
  });
}

/** The cables of a node that the diff removed (ghosts), by their id. */
export const removedCables = (model: Model, hostname: string): readonly ModelLink[] => (model.linksByNode.get(hostname) ?? []).filter((link) => link.ghost);
export const liveCables = (model: Model, hostname: string): readonly ModelLink[] => (model.linksByNode.get(hostname) ?? []).filter((link) => !link.ghost);

/** The address token of a cable, as the address names it (`#link=`). */
export const cableToken = (link: ModelLink): string => JSON.stringify([link.a.hostname, link.a.interface, link.b.hostname, link.b.interface]);
export const cableId = linkId;

export type { ModelNode };
