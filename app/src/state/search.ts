// The search (brick 4, design/comps/shell/index.html at `data-state="search"`), the pure part: what a text finds, as
// values the palette puts words on. Moved from the v1 (`engine/src/app/state/search.ts`), extended with the
// infrastructures the page knows and the actions the shell can run. One word per term, every term must match, case
// insensitive, unanchored; `field:regex` aims a field of a device (`type:`, `site:`…), `port:` a port's name,
// `desc:` its description. Without a field, a word aims a device's name, a port's name or description, a group's or
// cluster's name, a note's text, an infrastructure's name, an action's words: "dc01-core-01 eth1/1" finds that port.
// Searching never filters the map: opening a result selects it (the page's business). Pure, tested under Node.
import { shortPort } from "@engine/canvas/format";
import { ifaceKey } from "@engine/canvas/model";
import { FIELDS, valueOf } from "@engine/canvas/query";
import type { Field } from "@engine/canvas/query";
import type { Cluster, Group, Model, ModelLink, ModelNode, Selection } from "@engine/canvas/types";
import type { SnapshotInterface } from "@engine/contracts/snapshot";
import { alertsOf, interfaceRows, liveCables, mlagPairs, mlagPeers, removedCables, severityCountsOf } from "./panel";
import type { AlertGroup, InterfaceRow, SeverityCounts } from "./panel";

/** The fields a term may aim: those of a device, plus a port's name and description. */
export const SEARCH_FIELDS: readonly string[] = [...FIELDS, "port", "desc"];
type SearchField = Field | "port" | "desc";
export type Term = Readonly<{ field: SearchField; regex: RegExp; explicit: boolean }>;

export const SCOPES = ["all", "devices", "ports", "groups", "notes", "infrastructures", "actions"] as const;
export type Scope = (typeof SCOPES)[number];
export type Group_ = Exclude<Scope, "all">;

export type DeviceHit = Readonly<{ kind: "device"; key: string; hostname: string; type: ModelNode["type"]; site: string | null; model: string | null; nodeKind: ModelNode["kind"]; removed: boolean; selection: Selection }>;
export type PortHit = Readonly<{ kind: "port"; key: string; hostname: string; name: string; description: string | null; ifaceType: string; byName: boolean; neighbour: string | null; selection: Selection }>;
export type GroupHit = Readonly<{ kind: "group"; key: string; id: string; label: string; members: number; selection: Selection }>;
export type ClusterHit = Readonly<{ kind: "cluster"; key: string; id: string; name: string | null; hosts: readonly string[]; mode: string; selection: Selection }>;
export type NoteHit = Readonly<{ kind: "note"; key: string; id: string; noteKind: "note" | "code"; title: string; line: number; text: string; selection: Selection }>;
export type InfrastructureHit = Readonly<{ kind: "infrastructure"; key: string; name: string; current: boolean; devices: number | null }>;
/** The actions the shell can run from the palette; `openRun` and `compareRun` name a collection. */
export type ActionId = "fit" | "center" | "zoomReset" | "grid" | "minimap" | "edit" | "openRun" | "compareRun";
export type ActionHit = Readonly<{ kind: "action"; key: string; id: ActionId; runId: string | null; words: string }>;
export type Hit = DeviceHit | PortHit | GroupHit | ClusterHit | NoteHit | InfrastructureHit | ActionHit;

/** An infrastructure the page knows (the context island's list, the home's widget). */
export type InfrastructureSource = Readonly<{ name: string; devices: number | null }>;
/** An action with the words the page gives it (from the catalogue), matched as a result's name. */
export type ActionSource = Readonly<{ id: ActionId; words: string; runId?: string }>;
export type Sources = Readonly<{ model: Model | null; infrastructures: readonly InfrastructureSource[]; current: string; actions: readonly ActionSource[] }>;

export type Results = Readonly<{
  text: string;
  terms: readonly Term[];
  /** The engine's message when a regex cannot be read (never shown as is: the page says "unreadable"). */
  error: string | null;
  empty: boolean;
  devices: readonly DeviceHit[];
  ports: readonly PortHit[];
  groups: readonly (GroupHit | ClusterHit)[];
  notes: readonly NoteHit[];
  infrastructures: readonly InfrastructureHit[];
  actions: readonly ActionHit[];
  total: number;
}>;

export function parse(text: string): Readonly<{ terms: readonly Term[]; error: string | null }> {
  const words = text.trim().split(/\s+/).filter(Boolean);
  try {
    return {
      error: null,
      terms: words.map((word) => {
        const cut = word.indexOf(":");
        const prefix = cut > 0 ? word.slice(0, cut) : "";
        const explicit = SEARCH_FIELDS.includes(prefix);
        return Object.freeze({ field: (explicit ? prefix : "hostname") as SearchField, regex: new RegExp(explicit ? word.slice(cut + 1) : word, "i"), explicit });
      }),
    };
  } catch (error) {
    return { terms: [], error: (error as Error).message };
  }
}

const isDeviceField = (field: SearchField): field is Field => field !== "port" && field !== "desc";
const plain = (terms: readonly Term[]): boolean => terms.every((t) => !t.explicit);
const matchesAll = (terms: readonly Term[], text: string): boolean => terms.every((t) => t.regex.test(text));

const deviceHit = (node: ModelNode): DeviceHit =>
  Object.freeze({ kind: "device", key: `d:${node.hostname}`, hostname: node.hostname, type: node.type, site: node.site, model: node.model, nodeKind: node.kind, removed: !!node.ghost, selection: { kind: "node" as const, id: node.hostname } });

function devices(model: Model, terms: readonly Term[]): readonly DeviceHit[] {
  if (!terms.every((t) => isDeviceField(t.field))) return [];
  return model.nodes.concat(model.ghostNodes).filter((node) => terms.every((t) => t.regex.test(valueOf(node, t.field as Field)))).map(deviceHit);
}

/** A port's name and its abbreviations ("Ethernet1/1" → "Et1/1", "Eth1/1"…; "port-channel10" → "Po10"): one types the
 *  short name, the device wrote the long one. No table per vendor: every cut of the prefix. */
export function portNames(name: string): string {
  const parts = /^([A-Za-z][A-Za-z-]*)(.*)$/.exec(name);
  if (!parts) return name;
  const letters = parts[1].replace(/-/g, ""), rest = parts[2];
  const short: string[] = [];
  for (let k = 2; k < letters.length; k += 1) short.push(letters.slice(0, k) + rest);
  return [name].concat(short).join(" ");
}

// The names and abbreviations of a run's ports, computed once per model (21 000 interfaces at the gauge).
const namesByModel = new WeakMap<Model, readonly string[]>();
function portNamesOf(model: Model): readonly string[] {
  let names = namesByModel.get(model);
  if (!names) {
    names = model.interfaces.map((itf) => portNames(itf.name));
    namesByModel.set(model, names);
  }
  return names;
}

/** The device at the other end of a port's only cable, else null. */
function otherEnd(links: readonly ModelLink[], hostname: string): string | null {
  if (links.length !== 1) return null;
  const link = links[0];
  return link.a.hostname === hostname ? link.b.hostname : link.a.hostname;
}

// A port: every term matches (a word without a field may aim its device, its name or its description), and one of
// them at least speaks of the port itself; else "type:firewall" would list every port of every firewall. The ports
// found by their name first, then those only their description names.
function ports(model: Model, terms: readonly Term[]): readonly PortHit[] {
  if (!terms.some((t) => !isDeviceField(t.field) || !t.explicit)) return [];
  const named: PortHit[] = [], described: PortHit[] = [];
  const allNames = portNamesOf(model);
  model.interfaces.forEach((itf: SnapshotInterface, at: number) => {
    const node = model.nodeByHost.get(itf.hostname);
    if (!node) return;
    const desc = itf.description || "", names = allNames[at];
    let aboutPort = false, byName = false;
    const ok = terms.every((t) => {
      if (t.field === "port") { aboutPort = true; byName = true; return t.regex.test(names); }
      if (t.field === "desc") { aboutPort = true; return t.regex.test(desc); }
      if (!t.explicit) {
        const inName = t.regex.test(names), own = inName || t.regex.test(desc);
        if (own) aboutPort = true;
        if (inName) byName = true;
        return own || t.regex.test(itf.hostname);
      }
      return t.regex.test(valueOf(node, t.field as Field));
    });
    if (!ok || !aboutPort) return;
    const links = (model.linksByIface.get(ifaceKey(itf.hostname, itf.name)) ?? []).filter((link) => !link.ghost);
    const hit: PortHit = Object.freeze({
      kind: "port", key: `p:${itf.hostname}\u0000${itf.name}`, hostname: itf.hostname, name: itf.name, description: itf.description, ifaceType: itf.type, byName,
      neighbour: otherEnd(links, itf.hostname), selection: links.length === 1 ? { kind: "link" as const, id: links[0].id } : { kind: "node" as const, id: itf.hostname },
    });
    (byName ? named : described).push(hit);
  });
  return named.concat(described);
}

const groupHit = (group: Group): GroupHit => Object.freeze({ kind: "group", key: `g:${group.id}`, id: group.id, label: group.label, members: group.members.length, selection: { kind: "group" as const, id: group.id } });
const clusterHit = (cluster: Cluster): ClusterHit =>
  Object.freeze({ kind: "cluster", key: `c:${cluster.id}`, id: cluster.id, name: cluster.raw.cluster_name || null, hosts: cluster.hosts.slice(), mode: cluster.raw.mode, selection: { kind: "cluster" as const, id: cluster.id } });

/** Groups by their label or description, HA clusters by their name, their members or their mode as the contract
 *  writes it ("active_passive"): the mode in words is the page's, not matched here. */
function groups(model: Model, terms: readonly Term[]): readonly (GroupHit | ClusterHit)[] {
  if (!plain(terms)) return [];
  const own = Array.from(model.groupById.values()).filter((g) => matchesAll(terms, `${g.label} ${g.description}`)).map(groupHit);
  const ha = model.clusters.filter((c) => matchesAll(terms, [c.raw.cluster_name || "", ...c.hosts, c.raw.mode].join(" "))).map(clusterHit);
  return [...own, ...ha];
}

// A note or a code block: every word (without a field) in its text or its title; a block opens at the first line
// that carries every word (else at the first that carries one).
function notes(model: Model, terms: readonly Term[]): readonly NoteHit[] {
  if (!plain(terms)) return [];
  const out: NoteHit[] = [];
  (model.annotationById ?? new Map()).forEach((a) => {
    const c = a.content;
    if (c.kind !== "note" && c.kind !== "code") return;
    const title = c.kind === "code" ? c.title : "";
    if (!terms.every((t) => t.regex.test(c.text) || t.regex.test(title))) return;
    const lines = c.text.split("\n");
    let at = lines.findIndex((l) => matchesAll(terms, l));
    if (at < 0) at = Math.max(0, lines.findIndex((l) => terms.some((t) => t.regex.test(l))));
    const first = lines[0]?.trim() ?? "";
    out.push(Object.freeze({ kind: "note", key: `a:${a.id}`, id: a.id, noteKind: c.kind, title: c.kind === "code" ? title : first, line: at, text: (lines[at] ?? "").trim(), selection: { kind: "annotation" as const, id: a.id } }));
  });
  return out.sort((x, y) => x.title.localeCompare(y.title));
}

function infrastructures(list: readonly InfrastructureSource[], current: string, terms: readonly Term[]): readonly InfrastructureHit[] {
  if (!plain(terms)) return [];
  return list.filter((item) => matchesAll(terms, item.name)).map((item) => Object.freeze({ kind: "infrastructure" as const, key: `i:${item.name}`, name: item.name, current: item.name === current, devices: item.devices }));
}

function actions(list: readonly ActionSource[], terms: readonly Term[]): readonly ActionHit[] {
  if (!plain(terms)) return [];
  return list.filter((item) => matchesAll(terms, item.words)).map((item) => Object.freeze({ kind: "action" as const, key: `x:${item.id}:${item.runId ?? ""}`, id: item.id, runId: item.runId ?? null, words: item.words }));
}

export function search(sources: Sources, text: string): Results {
  const { terms, error } = parse(text);
  const none = terms.length === 0;
  const model = sources.model;
  const found = {
    devices: none || !model ? [] : devices(model, terms),
    ports: none || !model ? [] : ports(model, terms),
    groups: none || !model ? [] : groups(model, terms),
    notes: none || !model ? [] : notes(model, terms),
    infrastructures: none ? [] : infrastructures(sources.infrastructures, sources.current, terms),
    actions: none ? [] : actions(sources.actions, terms),
  };
  const total = found.devices.length + found.ports.length + found.groups.length + found.notes.length + found.infrastructures.length + found.actions.length;
  return Object.freeze({ text, terms, error, empty: none, ...found, total });
}

// ——— Scopes: the palette's tabs ———

export const countOf = (results: Results, scope: Scope): number => (scope === "all" ? results.total : results[scope].length);

/** How many rows a group shows before "N more": a few in All (the mockup's four per kind), a page in a kind's own
 *  tab; "more" adds a page. A default, never a ceiling: the reader asks for more, row by page. At the gauge (500
 *  devices, 21 000 interfaces) a letter finds twenty thousand ports: the list must never mount them all. */
export const SHOWN_IN_ALL = 8;
export const SHOWN_IN_KIND = 100;
export const SHOWN_STEP = 100;
/** The rows the reader asked for beyond the default, per group. */
export type Shown = Readonly<Partial<Record<Group_, number>>>;
export const shownOf = (scope: Scope, shown: Shown, group: Group_): number => shown[group] ?? (scope === "all" ? SHOWN_IN_ALL : SHOWN_IN_KIND);
/** `shown` with one more page for a group. */
export const showMore = (scope: Scope, shown: Shown, group: Group_): Shown => ({ ...shown, [group]: shownOf(scope, shown, group) + SHOWN_STEP });

export type HitGroup = Readonly<{ scope: Group_; hits: readonly Hit[]; /** The rows beyond the window, said as "N more". */ more: number }>;

/** The results a scope shows, grouped by kind in the tabs' order, each group cut to its window, empty groups left
 *  out. Without a window, everything (the pure tests). */
export function groupsIn(results: Results, scope: Scope, shown?: Shown): readonly HitGroup[] {
  return SCOPES.filter((s): s is Group_ => s !== "all" && (scope === "all" || s === scope))
    .map((s) => {
      const all = results[s];
      const limit = shown ? shownOf(scope, shown, s) : all.length;
      return { scope: s, hits: all.slice(0, limit), more: Math.max(0, all.length - limit) };
    })
    .filter((group) => group.hits.length > 0);
}

/** A row that stands for the rows beyond a group's window; choosing it shows one more page. */
export type MoreRow = Readonly<{ kind: "more"; key: string; scope: Group_; count: number }>;
export type Row = Hit | MoreRow;

/** The rows the arrows walk, flat and in the list's order: the shown hits, and after a cut group its "more" row. */
export const rowsIn = (results: Results, scope: Scope, shown?: Shown): readonly Row[] =>
  groupsIn(results, scope, shown).flatMap((group): Row[] => [...group.hits, ...(group.more ? [{ kind: "more" as const, key: `more:${group.scope}`, scope: group.scope, count: group.more }] : [])]);

/** The same hits flat, without the "more" rows. */
export const hitsIn = (results: Results, scope: Scope, shown?: Shown): readonly Hit[] => groupsIn(results, scope, shown).flatMap((group) => group.hits);

/** Tab and Shift+Tab: the next or previous tab, every tab a choice whatever its count. */
export function stepScope(scope: Scope, direction: 1 | -1): Scope {
  const at = SCOPES.indexOf(scope);
  return SCOPES[(at + direction + SCOPES.length) % SCOPES.length];
}

/** The active row after a step with the arrows: wraps around; nothing when the list is empty. */
export const stepActive = (active: number, count: number, direction: 1 | -1): number => (count === 0 ? 0 : (active + direction + count) % count);

// ——— The matched part of a name, for the row ———

export type Segment = Readonly<{ text: string; hit: boolean }>;

/** A name cut where the terms match it (the terms without a field, `hostname:` and `port:` ones), to set the matched
 *  parts strong: "dc01-core-01" with "core" gives "dc01-", "core" (hit), "-01". A zero-width match marks nothing and
 *  stops nothing; a `port:` term that matched an abbreviation only ("eth1/1" for "TenGigabitEthernet1/1/1") marks
 *  nothing: the name shown is the long one. */
export function segmentsOf(text: string, terms: readonly Term[]): readonly Segment[] {
  const marks = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    if (term.explicit && term.field !== "port" && term.field !== "hostname") continue;
    const global = new RegExp(term.regex.source, "gi");
    for (const match of text.matchAll(global)) {
      if (!match[0].length) continue;
      for (let i = match.index; i < match.index + match[0].length; i += 1) marks[i] = true;
    }
  }
  const out: Segment[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) out[out.length - 1] = { text: last.text + text[i], hit: last.hit };
    else out.push({ text: text[i], hit: marks[i] });
  }
  return out;
}

// ——— The detail column ———

/** Where a device's live cables lead: one line per device at the other end, in the order of its cables, with the
 *  local ports (short names); a neighbour never collected (stub) is named like the others. */
export type Destination = Readonly<{ hostname: string; ports: readonly string[]; known: boolean }>;
export function destinationsOf(model: Model, hostname: string): readonly Destination[] {
  const byHost = new Map<string, string[]>();
  for (const link of liveCables(model, hostname)) {
    const local = link.a.hostname === hostname ? link.a : link.b;
    const other = local === link.a ? link.b : link.a;
    const ports = byHost.get(other.hostname) ?? [];
    byHost.set(other.hostname, [...ports, shortPort(local.interface)]);
  }
  return Array.from(byHost, ([host, ports]) => Object.freeze({ hostname: host, ports: Object.freeze(ports), known: (model.nodeByHost.get(host)?.kind ?? "stub") !== "stub" }));
}

export type DeviceDetail = Readonly<{ kind: "device"; node: ModelNode; cables: number; removedCables: number; mlagPeers: readonly string[]; alert: AlertGroup | null; severity: SeverityCounts; destinations: readonly Destination[] }>;
export type PortDetail = Readonly<{ kind: "port"; hostname: string; row: InterfaceRow }>;
export type GroupDetail = Readonly<{ kind: "group"; label: string; description: string; members: readonly string[]; present: readonly string[] }>;
export type ClusterDetail = Readonly<{ kind: "cluster"; name: string | null; mode: string; members: Cluster["raw"]["members"] }>;
export type NoteDetail = Readonly<{ kind: "note"; noteKind: "note" | "code"; title: string; line: number; lines: readonly string[]; anchor: string | null }>;
export type InfrastructureDetail = Readonly<{ kind: "infrastructure"; name: string; current: boolean; devices: number | null }>;
export type ActionDetail = Readonly<{ kind: "action"; id: ActionId; runId: string | null }>;
export type Detail = DeviceDetail | PortDetail | GroupDetail | ClusterDetail | NoteDetail | InfrastructureDetail | ActionDetail;

/** How many lines of a note the detail shows around the matched one. */
export const NOTE_CONTEXT = 3;

/** What the detail column reads of a result, as values; null when the model no longer holds it. */
export function detailOf(model: Model | null, hit: Hit): Detail | null {
  switch (hit.kind) {
    case "device": {
      const node = model?.nodeByHost.get(hit.hostname) ?? model?.ghostNodes.find((n) => n.hostname === hit.hostname);
      if (!model || !node) return null;
      const alerts = alertsOf(model, hit.hostname);
      return { kind: "device", node, cables: liveCables(model, hit.hostname).length, removedCables: removedCables(model, hit.hostname).length, mlagPeers: mlagPeers(mlagPairs(model, hit.hostname)), alert: alerts[0] ?? null, severity: severityCountsOf(alerts), destinations: destinationsOf(model, hit.hostname) };
    }
    case "port": {
      const row = model ? interfaceRows(model, hit.hostname).find((candidate) => candidate.name === hit.name) : undefined;
      return row ? { kind: "port", hostname: hit.hostname, row } : null;
    }
    case "group": {
      const group = model?.groupById.get(hit.id);
      if (!model || !group) return null;
      return { kind: "group", label: group.label, description: group.description, members: group.members, present: group.members.filter((host) => !!model.nodeByHost.get(host) && !model.nodeByHost.get(host)?.ghost) };
    }
    case "cluster": {
      const cluster = model?.clusterById.get(hit.id);
      return cluster ? { kind: "cluster", name: cluster.raw.cluster_name || null, mode: cluster.raw.mode, members: cluster.raw.members } : null;
    }
    case "note": {
      const annotation = model?.annotationById.get(hit.id);
      if (!annotation || (annotation.content.kind !== "note" && annotation.content.kind !== "code")) return null;
      const lines = annotation.content.text.split("\n");
      const start = Math.max(0, hit.line - 1);
      return { kind: "note", noteKind: annotation.content.kind, title: hit.title, line: hit.line, lines: lines.slice(start, start + NOTE_CONTEXT), anchor: annotation.anchor.kind === "device" ? annotation.anchor.ref : null };
    }
    case "infrastructure":
      return { kind: "infrastructure", name: hit.name, current: hit.current, devices: hit.devices };
    case "action":
      return { kind: "action", id: hit.id, runId: hit.runId };
  }
}
