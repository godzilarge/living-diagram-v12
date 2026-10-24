// What the Check view reads of a collection (brick 7a, design/comps/shell/control.html, direction A "the register"),
// as values, never as words: the verdicts (B1's checks grouped by severity and code, the most severe first, then by
// count and code; each group's targets, every thing once in the snapshot's order, with the selection that shows it in
// the Diagram view), their sections by rule (DESIGN.md, Register, V3), the severity toggles and the filter over them, the coverage of the collection (its band of facts
// and one row per device in scope), the source combinations of the cables, and the facts of the delivery. Everything
// comes from the run's model (`Model`) and the archived runs; nothing is invented. Pure, tested under Node; the
// components put the words on these values (`control/words.ts`).
import { shortPort } from "@engine/canvas/format";
import { aggregateKey, clusterId, linkId, linkToken, selectionFromToken, SEVERITY_RANK } from "@engine/canvas/model";
import type { CheckEntry, ComboRow, Model } from "@engine/canvas/types";
import type { CheckCode, Coverage, Severity } from "@engine/contracts/snapshot";
import type { RunEntry } from "../api/run";
import type { Tone } from "../ui";
import type { MarkTone } from "../ui";
import { formatHash, formatSearch } from "./address";
import type { Address, SelectionToken, ViewState } from "./address";

// ——— The rule of each code (contracts/src/ld_contracts/snapshot/codes.py: R0…R5, the input contract) ———

export type Family = "neighbors" | "remotePorts" | "descriptions" | "cables" | "aggregates" | "states" | "contract" | "other";

const R: Readonly<Record<string, Family>> = { R0: "neighbors", R1: "remotePorts", R2: "descriptions", R3: "cables", R4: "aggregates", R5: "states", contract: "contract" };

/** Every code of the contract and its rule, copied from `codes.py` (a test holds them to the catalogue). */
export const RULE_OF: Readonly<Record<CheckCode, Family>> = {
  neighbor_name_case_differs: R.R0, neighbor_resolved_by_reported_hostname: R.R0, neighbor_resolved_by_address: R.R0,
  neighbor_name_ambiguous: R.R0, neighbor_unknown: R.R0,
  remote_port_is_mac: R.R1, remote_port_is_aggregate: R.R1,
  description_unparseable: R.R2, description_ha_unresolved: R.R2,
  description_disagrees_with_observed: R.R3, multiple_observed_neighbors: R.R3, self_observation: R.R3, one_way_observation: R.R3,
  documented_not_observed: R.R3,
  aggregate_member_not_bundled: R.R4, aggregate_below_min_links: R.R4, aggregate_protocol_mismatch: R.R4, mlag_downstream_inconsistent: R.R4,
  mlag_pair_direct_link: R.R4, ha_member_down: R.R4, ha_view_mismatch: R.R4, heartbeat_link_not_observed: R.R4,
  link_oper_mismatch: R.R5, link_speed_mismatch: R.R5, native_vlan_mismatch: R.R5, link_down: R.R5, documented_port_without_transceiver: R.R5,
  device_unreachable: R.R5, device_partial_collection: R.R5,
  parent_interface_unknown: R.contract, interface_member_unknown: R.contract, aggregate_interface_unknown: R.contract,
  aggregate_member_unknown: R.contract, local_interface_unknown: R.contract, ha_member_unknown: R.contract, heartbeat_interface_unknown: R.contract,
  vrf_default_case: R.contract, reported_hostname_differs: R.contract, device_without_task: R.contract, documents_without_task: R.contract,
};
export const KNOWN_CODES: ReadonlySet<string> = new Set(Object.keys(RULE_OF));

/** A code's rule; a code the page does not know (a newer server) is the input contract's when it says it comes from
 *  the bundle, else "another rule". */
export const familyOf = (code: string, origin: CheckEntry["origin"]): Family =>
  KNOWN_CODES.has(code) ? RULE_OF[code as CheckCode] : origin === "bundle" ? "contract" : "other";

// ——— Verdicts: the checks grouped by severity and code, counted by the things they name ———

/** What a verdict counts and lists (review 2026-10-21, H1: the count of a verdict is the number of things it names,
 *  each thing once, never the number of checks: B1 writes several checks for one thing). */
export type Subject = "neighbor" | "interface" | "link" | "aggregate" | "pair" | "node" | "cluster" | "finding" | "refs";

/** The thing of each code, from what B1 emits (backend/src/ld_backend/correlate/, checkbuild.py, claims.py, merge.py,
 *  structures.py, ha.py, state.py, assemble.py): one line per code. */
export const SUBJECT_OF: Readonly<Record<CheckCode, Subject>> = {
  neighbor_name_case_differs: "neighbor", // one check per announcement (port × source), `details.neighbor`: the neighbour
  neighbor_resolved_by_reported_hostname: "neighbor", // idem: a neighbour seen on two ports is one neighbour
  neighbor_resolved_by_address: "neighbor", // idem
  neighbor_name_ambiguous: "neighbor", // idem: the announced name
  neighbor_unknown: "neighbor", // idem: agrees with the delivery's unresolved names
  remote_port_is_mac: "interface", // one per announcement on the local port: the local port
  remote_port_is_aggregate: "interface", // one per claim on the local port: the local port
  description_unparseable: "interface", // one per port whose description R2 cannot read
  description_ha_unresolved: "interface", // one per port whose HA-form description has no member pair
  description_disagrees_with_observed: "interface", // one per port whose description names another neighbour
  multiple_observed_neighbors: "link", // one per observed cable of a port that sees several (refs: cable + port)
  one_way_observation: "link", // one per source (LLDP, CDP) on a cable: the cable
  self_observation: "interface", // one per source on a port that names itself: the port
  documented_not_observed: "link", // one per cable documented only
  aggregate_member_not_bundled: "interface", // one per member not bundled (refs: aggregate + member): the member port
  aggregate_below_min_links: "aggregate", // one per aggregate
  aggregate_protocol_mismatch: "pair", // one per bundle (refs: its two aggregates): the bundle
  mlag_downstream_inconsistent: "pair", // one per MLAG domain (refs: its two aggregates): the domain
  mlag_pair_direct_link: "pair", // one per MLAG pair joined by its own aggregates: the pair
  ha_member_down: "node", // one per member said down (refs: cluster + member): the member
  ha_view_mismatch: "cluster", // one per field and member in disagreement: the cluster
  heartbeat_link_not_observed: "interface", // one per heartbeat port without a cable (refs: cluster + port): the port
  link_oper_mismatch: "link", // one per cable
  link_speed_mismatch: "link", // one per cable
  native_vlan_mismatch: "link", // one per cable
  link_down: "link", // one per cable
  documented_port_without_transceiver: "interface", // one per port
  device_unreachable: "node", // one per device
  device_partial_collection: "node", // one per device
  parent_interface_unknown: "finding", // input contract: one finding per element, on its device (`details.ref`)
  interface_member_unknown: "finding", // idem
  aggregate_interface_unknown: "finding", // idem
  aggregate_member_unknown: "finding", // idem
  local_interface_unknown: "finding", // idem
  ha_member_unknown: "finding", // idem
  heartbeat_interface_unknown: "finding", // idem
  vrf_default_case: "finding", // idem
  reported_hostname_differs: "finding", // idem (one per device)
  device_without_task: "finding", // idem (one per device)
  documents_without_task: "finding", // idem (one per device and topic)
};
const subjectOf = (code: string): Subject => (KNOWN_CODES.has(code) ? SUBJECT_OF[code as CheckCode] : "refs");

export type TargetKind = "node" | "interface" | "aggregate" | "link" | "cluster" | "neighbor" | "pair" | "finding";
export type Target = Readonly<{
  key: string;
  kind: TargetKind;
  /** The device (a node, a port's, an aggregate's, a finding's), a cable's or a pair's first end, a cluster's first
   *  member, a neighbour's announced name. */
  hostname: string;
  /** A port's or an aggregate's name, a cable's first port, a pair's first aggregate, a finding's element; empty for a
   *  device, a cluster or a neighbour. */
  name: string;
  /** A cable's or a pair's other end. */
  remote: Readonly<{ hostname: string; name: string }> | null;
  /** A cluster's members. */
  members: readonly string[];
  /** What shows it in the Diagram view (a port shows its device); null when the run cannot select it. */
  selection: SelectionToken | null;
}>;
/** `count`: the things it names (its targets); `checks`: B1's checks behind them. */
export type VerdictGroup = Readonly<{
  id: string; code: string; severity: Severity; tone: Tone; family: Family; count: number; checks: number; targets: readonly Target[];
  /** Every name its checks carry (refs and announced neighbours), for the filter. */
  words: readonly string[];
}>;

export const SEVERITIES: readonly Severity[] = ["error", "warning", "info"];
const TONE_OF: Readonly<Record<Severity, Tone>> = { error: "error", warning: "warning", info: "neutral" };
export const toneOfSeverity = (severity: Severity): Tone => TONE_OF[severity] ?? "neutral";

type Ref = CheckEntry["refs"][number];
type AggregateRef = Extract<Ref, { kind: "aggregate" }>;
const nodeToken = (model: Model, hostname: string): SelectionToken | null => (model.nodeByHost.has(hostname) ? { kind: "node", token: hostname } : null);
const asToken = (model: Model, kind: string, token: string): SelectionToken | null => (selectionFromToken(model, kind, token) ? { kind, token } : null);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** One reference of a check as a target, with the selection that shows it (the element itself when the run holds it,
 *  else its device, else nothing). */
function refTarget(model: Model, ref: Ref): Target {
  const base = { remote: null, members: [] as readonly string[] };
  switch (ref.kind) {
    case "node":
      return { ...base, key: `node\u0000${ref.hostname}`, kind: "node", hostname: ref.hostname, name: "", selection: nodeToken(model, ref.hostname) };
    case "interface":
      return { ...base, key: `interface\u0000${ref.hostname}\u0000${ref.name}`, kind: "interface", hostname: ref.hostname, name: ref.name, selection: nodeToken(model, ref.hostname) };
    case "aggregate": {
      const selection = asToken(model, "aggregate", JSON.stringify([ref.hostname, ref.name])) ?? nodeToken(model, ref.hostname);
      return { ...base, key: `aggregate\u0000${ref.hostname}\u0000${ref.name}`, kind: "aggregate", hostname: ref.hostname, name: ref.name, selection };
    }
    case "link": {
      const selection = (model.linkById.has(linkId(ref)) ? { kind: "link", token: linkToken(ref) } : null) ?? nodeToken(model, ref.a.hostname);
      return { ...base, key: `link\u0000${linkId(ref)}`, kind: "link", hostname: ref.a.hostname, name: ref.a.interface ?? "", remote: { hostname: ref.b.hostname, name: ref.b.interface ?? "" }, selection };
    }
    case "cluster": {
      const selection = (model.clusterById.has(clusterId(ref.members)) ? { kind: "cluster", token: JSON.stringify(ref.members) } : null) ?? nodeToken(model, ref.members[0]);
      return { ...base, key: `cluster\u0000${ref.members.join("\u0000")}`, kind: "cluster", hostname: ref.members[0], name: "", members: ref.members, selection };
    }
  }
}

/** The neighbour a check announces: its name as announced, shown by the device it resolved to, else its stub. */
function neighborTarget(model: Model, check: CheckEntry): Target | null {
  const name = text(check.details.neighbor);
  if (!name) return null;
  const node = [text(check.details.resolved), name, name.toLowerCase()].find((host) => host && model.nodeByHost.has(host));
  return { key: `neighbor\u0000${name.toLowerCase()}`, kind: "neighbor", hostname: name, name: "", remote: null, members: [], selection: node ? nodeToken(model, node) : null };
}

/** Two aggregates as one thing (a bundle, an MLAG domain): the bundle between them when the run holds one, else the
 *  first aggregate. */
function pairTarget(model: Model, a: AggregateRef, b: AggregateRef): Target {
  const selection = asToken(model, "beam", JSON.stringify([a.hostname, a.name, b.hostname, b.name])) ?? refTarget(model, a).selection;
  return { key: `pair\u0000${aggregateKey(a.hostname, a.name)}\u0000${aggregateKey(b.hostname, b.name)}`, kind: "pair", hostname: a.hostname, name: a.name, remote: { hostname: b.hostname, name: b.name }, members: [], selection };
}

/** A finding of the input contract: its device and the element it names (`details.ref`). */
function findingTarget(model: Model, check: CheckEntry): Target {
  const host = check.refs[0].kind === "node" ? check.refs[0].hostname : refTarget(model, check.refs[0]).hostname;
  const ref = text(check.details.ref);
  return { key: `finding\u0000${host}\u0000${ref}\u0000${text(check.details.message)}`, kind: "finding", hostname: host, name: ref, remote: null, members: [], selection: nodeToken(model, host) };
}

/** The things a check names, as its code counts them; a check without the expected reference falls back to its refs. */
export function thingsOf(model: Model, check: CheckEntry): readonly Target[] {
  const subject = subjectOf(check.code);
  const all = () => check.refs.map((ref) => refTarget(model, ref));
  switch (subject) {
    case "neighbor": {
      const target = neighborTarget(model, check);
      return target ? [target] : all();
    }
    case "pair": {
      const aggregates = check.refs.filter((ref): ref is AggregateRef => ref.kind === "aggregate");
      return aggregates.length === 2 ? [pairTarget(model, aggregates[0], aggregates[1])] : all();
    }
    case "finding": return [findingTarget(model, check)];
    case "refs": return all();
    default: {
      const kept = check.refs.filter((ref) => ref.kind === subject).map((ref) => refTarget(model, ref));
      return kept.length ? kept : all();
    }
  }
}

/** Every name a check carries, for the filter: its refs whole and short, the neighbour it announces. */
const checkWords = (check: CheckEntry): readonly string[] =>
  check.refs.flatMap((ref) => {
    if (ref.kind === "link") return [ref.a.hostname, ref.a.interface ?? "", shortPort(ref.a.interface), ref.b.hostname, ref.b.interface ?? "", shortPort(ref.b.interface)];
    if (ref.kind === "cluster") return ref.members;
    if (ref.kind === "node") return [ref.hostname];
    return [ref.hostname, ref.name, shortPort(ref.name)];
  }).concat(text(check.details.neighbor), text(check.details.ref));

type Building = { code: string; severity: Severity; family: Family; checks: number; targets: Map<string, Target>; words: Set<string> };

/** The verdicts: one group per (severity, code), naming its things once each in the snapshot's order and counting
 *  them; the most severe group first, then the largest, then by code. */
export function verdictGroups(model: Model): readonly VerdictGroup[] {
  const groups = new Map<string, Building>();
  for (const check of model.checks) {
    const id = `${check.severity}\u0000${check.code}`;
    const group = groups.get(id) ?? { code: check.code, severity: check.severity, family: familyOf(check.code, check.origin), checks: 0, targets: new Map<string, Target>(), words: new Set<string>() };
    const targets = new Map(group.targets);
    thingsOf(model, check).forEach((target) => (targets.has(target.key) ? undefined : targets.set(target.key, target)));
    groups.set(id, { ...group, checks: group.checks + 1, targets, words: new Set([...group.words, ...checkWords(check).filter(Boolean)]) });
  }
  return Array.from(groups, ([id, group]) => {
    const targets = Object.freeze(Array.from(group.targets.values()));
    return Object.freeze({ id, code: group.code, severity: group.severity, tone: toneOfSeverity(group.severity), family: group.family, count: targets.length, checks: group.checks, targets, words: Object.freeze([...group.words]) });
  }).sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || b.count - a.count || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

export type SeverityCounts = Readonly<Record<Severity, number>>;
/** The checks of each severity (never the things): the toggles' counts, as the Check tab's and the panel's, whatever
 *  is shown. */
export const severityTotals = (groups: readonly VerdictGroup[]): SeverityCounts =>
  groups.reduce((acc, group) => ({ ...acc, [group.severity]: (acc[group.severity] ?? 0) + group.checks }), { error: 0, warning: 0, info: 0 } as SeverityCounts);

/** The severities shown (each toggle on or off; all on at first). */
export type Shown = Readonly<Record<Severity, boolean>>;
export const ALL_SHOWN: Shown = Object.freeze({ error: true, warning: true, info: true });
export const toggleSeverity = (shown: Shown, severity: Severity): Shown => ({ ...shown, [severity]: !shown[severity] });

/** The sentence the page says for a group (the filter matches it in the page's language). */
export type SentenceOf = (group: VerdictGroup) => string;

/** True when every word typed is found in the group's sentence, its code or the names its checks carry. */
export function matches(group: VerdictGroup, query: string, sentenceOf: SentenceOf): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = [sentenceOf(group), group.code, ...group.words].join("\n").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** The rule families in the order of the rules (DESIGN.md, Register): Cables (R3), Aggregates, MLAG and HA (R4), States
 *  (R5), Neighbours (R0), Remote ports (R1), Descriptions (R2), the input contract, then another rule. */
export const FAMILIES: readonly Family[] = ["cables", "aggregates", "states", "neighbors", "remotePorts", "descriptions", "contract", "other"];

export type Section = Readonly<{ family: Family; count: number; groups: readonly VerdictGroup[] }>;

/** The register's sections (V3, by rule): one per family, in the order of the rules, each with the groups the
 *  severity toggles and the filter keep (the most severe first, then the largest, then by code: `verdictGroups`' order)
 *  and their checks (a heading counts checks, as the toggles; a row counts its things); a family left without a group
 *  has no section. */
export function sectionsByRule(groups: readonly VerdictGroup[], shown: Shown, query: string, sentenceOf: SentenceOf): readonly Section[] {
  const kept = groups.filter((group) => shown[group.severity] && matches(group, query, sentenceOf));
  return FAMILIES.map((family) => {
    const own = kept.filter((group) => group.family === family);
    return Object.freeze({ family, count: own.reduce((sum, group) => sum + group.checks, 0), groups: Object.freeze(own) });
  }).filter((section) => section.groups.length > 0);
}

/** The opened rows (transient): one more, one less. */
export const toggleOpen = (open: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const next = new Set(open);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/** The address that shows a target in the Diagram view: the run as it is, the view without its mode, the element. */
export const targetHref = (address: Address, view: ViewState, selection: SelectionToken): string =>
  formatSearch(address) + formatHash({ ...view, mode: "diagram" }, selection);

// ——— Coverage: a device in scope per row, a band of facts ———

export const TOPICS = ["interfaces", "aggregates", "lldp", "cdp", "system", "ha"] as const;
export type Topic = (typeof TOPICS)[number];
export type CollectionWord = "success" | "partial" | "failed" | "unreachable" | "not_collected" | "unknown";
export type TopicWord = "success" | "failed" | "absent" | "unknown";
export type CoverageRow = Readonly<{ hostname: string; index: number; status: CollectionWord; tone: Tone; topics: Readonly<Record<Topic, TopicWord>> }>;

const COLLECTION_TONE: Readonly<Record<CollectionWord, Tone>> = { success: "neutral", partial: "warning", failed: "error", unreachable: "error", not_collected: "error", unknown: "neutral" };
const COLLECTION_RANK: Readonly<Record<CollectionWord, number>> = { unreachable: 0, not_collected: 1, failed: 2, partial: 3, unknown: 4, success: 5 };
/** A topic's mark: grey when collected, the warning mark when it failed, hollow when it was not asked. */
export const TOPIC_TONE: Readonly<Record<TopicWord, MarkTone>> = { success: "neutral", failed: "warning", absent: "off", unknown: "off" };

const collectionWord = (status: string): CollectionWord => (status in COLLECTION_TONE ? (status as CollectionWord) : "unknown");
const topicWord = (status: string | undefined): TopicWord => (status === "success" || status === "failed" || status === "absent" ? status : "unknown");

export function coverageRows(coverage: readonly Coverage[]): readonly CoverageRow[] {
  return coverage.map((entry, index) => {
    const status = collectionWord(entry.status);
    const topics = Object.fromEntries(TOPICS.map((topic) => [topic, topicWord(entry.topics?.[topic])])) as Record<Topic, TopicWord>;
    return Object.freeze({ hostname: entry.hostname, index, status, tone: COLLECTION_TONE[status], topics });
  });
}

export type CoverageFacts = Readonly<{ scope: number; answered: number; partial: number; unreachable: number; failed: number }>;
/** In scope, answered (succeeded or partial), partial, unreachable (unreachable or never collected), failed. */
export function coverageFacts(coverage: readonly Coverage[]): CoverageFacts {
  const count = (...statuses: string[]) => coverage.filter((entry) => statuses.includes(entry.status)).length;
  return { scope: coverage.length, answered: count("success", "partial"), partial: count("partial"), unreachable: count("unreachable", "not_collected"), failed: count("failed") };
}

export type CoverageSortKey = "device" | "collection";
export type CoverageSort = Readonly<{ key: CoverageSortKey; direction: "ascending" | "descending" }>;
/** The snapshot's order by default; by device name, or by collection (the unreachable first), the snapshot's order
 *  between equals. */
export function sortCoverage(rows: readonly CoverageRow[], sort: CoverageSort | null): readonly CoverageRow[] {
  if (!sort) return rows;
  const sign = sort.direction === "ascending" ? 1 : -1;
  const by = sort.key === "device"
    ? (a: CoverageRow, b: CoverageRow) => a.hostname.localeCompare(b.hostname)
    : (a: CoverageRow, b: CoverageRow) => COLLECTION_RANK[a.status] - COLLECTION_RANK[b.status];
  return [...rows].sort((a, b) => sign * by(a, b) || a.index - b.index);
}

// ——— Cables and sources: one row per combination of sources the run knows ———

export type ComboKey = "lldpCdpDescription" | "lldpDescription" | "cdpDescription" | "description" | "lldpCdp" | "lldp" | "cdp" | "other";
export type LinkStatusWord = "confirmed" | "documented_only" | "observed_only" | "other";
export type SourceRow = Readonly<{ id: string; combo: ComboKey; status: LinkStatusWord; line: "solid" | "dotted" | "dashed"; count: number }>;

const COMBOS: Readonly<Record<string, ComboKey>> = {
  "cdp + description + lldp": "lldpCdpDescription", "description + lldp": "lldpDescription", "cdp + description": "cdpDescription",
  description: "description", "cdp + lldp": "lldpCdp", lldp: "lldp", cdp: "cdp",
};
const STATUS_ORDER: readonly LinkStatusWord[] = ["confirmed", "documented_only", "observed_only", "other"];
const LINE_OF: Readonly<Record<LinkStatusWord, SourceRow["line"]>> = { confirmed: "solid", documented_only: "dotted", observed_only: "dashed", other: "solid" };
const statusWord = (status: string): LinkStatusWord => (STATUS_ORDER.includes(status as LinkStatusWord) ? (status as LinkStatusWord) : "other");

/** The model's combinations (`combo` is the sources sorted and joined by " + "), by status (confirmed, documented
 *  only, observed only), then as the model counts them (the largest first). */
export function sourceRows(combos: readonly ComboRow[]): readonly SourceRow[] {
  return combos
    .map((row, index) => ({ row, index, status: statusWord(row.status) }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.index - b.index)
    .map(({ row, status }) => Object.freeze({ id: `${row.combo}\u0000${row.status}`, combo: COMBOS[row.combo] ?? "other", status, line: LINE_OF[status], count: row.count }));
}

// ——— Delivery: where the collection comes from and what B1 made of it ———

export type Delivery = Readonly<{
  runStart: string;
  exporter: string;
  contract: string;
  /** When the archive received the bundle; null when the list of runs does not say. */
  storedAt: string | null;
  scope: number;
  answered: number;
  /** The findings of the input contract; null without the ingestion report. */
  findings: number | null;
  residual: number;
  applied: number;
  unread: number;
  unresolved: number;
}>;

const sum = (counts: Readonly<Record<string, number | undefined>>): number => Object.values(counts).reduce<number>((total, value) => total + (value ?? 0), 0);

export function deliveryOf(model: Pick<Model, "source" | "report" | "coverage" | "ingest">, runs: readonly RunEntry[] | null, runId: string): Delivery {
  const entry = runs?.find((run) => run.run_id === runId);
  const facts = coverageFacts(model.coverage);
  return {
    runStart: model.source.run.start_datetime,
    exporter: model.source.exporter_version,
    contract: model.source.contract_version,
    storedAt: entry?.stored_at ? entry.stored_at : null,
    scope: facts.scope,
    answered: facts.answered,
    findings: model.ingest ? model.ingest.findings.length : null,
    residual: sum(model.report.residual_normalizations),
    applied: sum(model.report.applied_normalizations),
    unread: model.report.unparseable_descriptions,
    unresolved: model.report.unresolved_names.length,
  };
}
