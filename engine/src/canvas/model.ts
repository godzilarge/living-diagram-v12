// Modèle de lecture : des index sur le snapshot, rien d'inventé. Pur (aucun DOM), testé sous Node.
import type { Diff } from "../contracts/diff";
import { isOrphan } from "./annotations";
import { attachedEnds, hostsOf as connectorHosts, isOrphan as connectorOrphan, key as refKey } from "./connectors";
import { displayName, uniformWidth, width as cardWidthOf } from "./card";
import type { CardExtras } from "./card";
import type { Check, HaMode, HaRole, InterfaceRef, Link, LinkRef, Severity, Snapshot, SnapshotInterface } from "../contracts/snapshot";
import type {
  Aggregate, Annotation, Beam, BeamEnd, Change, CheckEntry, Cluster, ComboRow, Connector, DiffKind, Entity, Group, Intent, Model, ModelInterface, ModelLink, ModelNode,
  PageData, Placement, Selection, SelectionKind,
} from "./types";

const SEP = "\u0000";
export const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };
export const OBSERVED: Record<string, boolean> = { lldp: true, cdp: true };
export const SELECTION_KINDS: SelectionKind[] = ["node", "link", "aggregate", "beam", "cluster"];
export const DIFF_SECTIONS = ["nodes", "interfaces", "links", "aggregates", "mlag_domains", "ha_clusters"] as const;

// Le fond d'un membre HA ne traduit « actif / passif » que là où le snapshot le dit : `active` / `standby` sont des
// états de forwarding (teinté / grisé en tout mode) ; `primary` / `secondary` ne le sont qu'en `active_passive` (en
// `active_active`, le secondary forwarde aussi) ; ailleurs le rôle s'écrit tel quel, sans fond (revue, M1).
export function haRoleGroup(mode: HaMode | string, role: HaRole | string): "lead" | "follow" | "plain" {
  if (role === "active" || (mode === "active_passive" && role === "primary")) return "lead";
  if (role === "standby" || (mode === "active_passive" && role === "secondary")) return "follow";
  return "plain";
}

/** Le badge d'un membre HA sur la carte (Orhan, 2026-10-07) : « A » quand le snapshot dit qu'il transmet, « P » quand
 *  il dit qu'il attend, rien sinon. On ne traduit que ce qui est écrit (revue M1 du 2026-10-02) : `active` / `standby`,
 *  ou `primary` / `secondary` en `active_passive` ; en `active_active` tous les membres transmettent, donc « A » ; un
 *  `member`, ou un mode `other`, n'en a pas. */
export function haBadge(mode: HaMode | string, role: HaRole | string): "A" | "P" | null {
  if (role === "member") return null;
  if (role === "standby") return "P";
  if (role === "active" || mode === "active_active") return "A";
  const group = haRoleGroup(mode, role);
  return group === "lead" ? "A" : group === "follow" ? "P" : null;
}

/** Un bout de câble, tel qu'on le trouve dans un lien, une clé de lien ou une référence de contrôle. */
export interface EndLike { hostname: string; interface?: string | null }
export interface LinkLike { a: EndLike; b: EndLike }

export const ifaceKey = (hostname: string, name: string | null | undefined): string => hostname + SEP + name;
export const linkId = (link: LinkLike): string => [link.a.hostname, link.a.interface, link.b.hostname, link.b.interface].join(SEP);
const pairKey = (link: LinkLike): string => link.a.hostname + SEP + link.b.hostname;
export const endLabel = (end: EndLike): string => end.hostname + " · " + (end.interface === null || end.interface === undefined ? "?" : end.interface);
export const aggregateKey = (hostname: string, name: string): string => hostname + SEP + name;
export const clusterId = (members: string[]): string => members.join(SEP);

export function worst(checks: Pick<CheckEntry, "severity">[]): Severity | null {
  let best: Severity | null = null;
  for (const check of checks) {
    if (best === null || SEVERITY_RANK[check.severity] < SEVERITY_RANK[best]) best = check.severity;
  }
  return best;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const found = map.get(key);
  if (found) found.push(value);
  else map.set(key, [value]);
}

// Un contrôle vise des nœuds, des interfaces, des liens, des agrégats, des clusters : il est accroché à chaque
// équipement concerné, et à la structure qu'il nomme (la répartition sur les câbles est faite par distributeChecks).
function attachChecks(model: Model, checks: Check[]): void {
  checks.forEach((check, index) => {
    const entry: CheckEntry = { index, code: check.code, severity: check.severity, origin: check.origin, refs: check.refs, details: check.details };
    model.checks.push(entry);
    const hosts = new Set<string>();
    for (const ref of check.refs) {
      if (ref.kind === "link") {
        hosts.add(ref.a.hostname);
        hosts.add(ref.b.hostname);
      } else if (ref.kind === "aggregate") {
        hosts.add(ref.hostname);
        pushTo(model.checksByAggregate, aggregateKey(ref.hostname, ref.name), entry);
      } else if (ref.kind === "interface") {
        hosts.add(ref.hostname);
      } else if (ref.kind === "cluster") {
        ref.members.forEach((member) => hosts.add(member));
        pushTo(model.checksByCluster, clusterId(ref.members), entry);
      } else if (ref.hostname) {
        hosts.add(ref.hostname);
      }
    }
    hosts.forEach((host) => pushTo(model.checksByNode, host, entry));
  });
}

// Les câbles du snapshot, puis les câbles retirés que le diff rapporte : des fantômes (`ghost`), qui gardent leur
// identité, suivent leurs équipements, se sélectionnent et se lisent tels qu'ils étaient, mais ne comptent dans
// aucun total et ne portent aucun contrôle de cette run. Les paires se comptent sur les deux listes : un câble
// retiré et son remplaçant entre les mêmes équipements restent deux tracés.
function buildLinks(model: Model, links: Link[], ghosts: Link[]): void {
  const groups = new Map<string, ModelLink[]>();
  const add = (raw: Link, ghost: boolean): void => {
    const sources = Array.from(new Set(raw.evidence.map((e) => e.source as string))).sort();
    const link: ModelLink = { index: model.links.length + model.ghostLinks.length, id: linkId(raw), pair: pairKey(raw), raw, a: raw.a, b: raw.b, status: raw.status, sources,
      combo: sources.join(" + "), beam: null, heartbeat: false, ghost, checks: [], portChecks: [], worst: null, indexInPair: 0, pairCount: 1 };
    (ghost ? model.ghostLinks : model.links).push(link);
    model.linkById.set(link.id, link);
    pushTo(groups, link.pair, link);
    pushTo(model.linksByIface, ifaceKey(raw.a.hostname, raw.a.interface), link);
    pushTo(model.linksByIface, ifaceKey(raw.b.hostname, raw.b.interface), link);
    pushTo(model.linksByNode, raw.a.hostname, link);
    if (raw.b.hostname !== raw.a.hostname) pushTo(model.linksByNode, raw.b.hostname, link);
  };
  links.forEach((raw) => add(raw, false));
  ghosts.forEach((raw) => { if (!model.linkById.has(linkId(raw))) add(raw, true); });
  // Dans l'éventail d'une paire, les câbles d'un même faisceau sont contigus : deux faisceaux entre les mêmes
  // équipements se dessinent côte à côte, jamais entrelacés (bug du 2026-10-06, un firewall en deux port-channels
  // vers le même switch). Les câbles hors faisceau d'abord, puis faisceau par faisceau ; l'ordre du snapshot au sein
  // de chaque groupe.
  groups.forEach((members) => {
    const ranked = members.map((link, rank) => ({ link, rank, beam: beamIdOf(link.raw) || "" }));
    ranked.sort((x, y) => (x.beam < y.beam ? -1 : x.beam > y.beam ? 1 : x.rank - y.rank));
    ranked.forEach(({ link }, index) => {
      link.indexInPair = index;
      link.pairCount = members.length;
    });
  });
}

// Ce que la run d'avant avait et que celle-ci n'a plus, lu dans le diff : des nœuds et des interfaces fantômes,
// que le graphe dessine en pointillé et que la fiche lit tels qu'ils étaient. Un nom déjà présent n'est jamais doublé.
// Les interfaces fantômes ont leurs propres index : `ifaceByKey` / `ifacesByNode` ne disent que cette run, sinon la
// bulle et la fiche d'un équipement injoignable montreraient les faits de la run d'avant comme actuels (revue, H1).
function addGhosts(model: Model, diff: Diff): void {
  diff.nodes.removed.forEach((node) => {
    if (model.nodeByHost.has(node.hostname)) return;
    const ghost: ModelNode = { ...node, ghost: true };
    model.ghostNodes.push(ghost);
    model.nodeByHost.set(node.hostname, ghost);
  });
  diff.interfaces.removed.forEach((itf) => {
    const key = ifaceKey(itf.hostname, itf.name);
    if (model.ifaceByKey.has(key)) return;
    const ghost: ModelInterface = { ...itf, ghost: true };
    model.ghostIfaceByKey.set(key, ghost);
    pushTo(model.ghostIfacesByNode, itf.hostname, ghost);
  });
}

export interface InterfaceFound { itf: SnapshotInterface; ghost: boolean }

// L'interface d'un bout : celle de cette run (`ghost: false`) ; pour un élément lui-même retiré, celle de la run d'avant
// quand cette run ne l'a plus (`ghost: true`) ; null sinon. Un élément vivant ne lit jamais une interface fantôme.
export function interfaceAt(model: Model, hostname: string, name: string | null | undefined, removed: boolean): InterfaceFound | null {
  const key = ifaceKey(hostname, name);
  const live = model.ifaceByKey.get(key);
  if (live) return { itf: live, ghost: false };
  const gone = removed ? model.ghostIfaceByKey.get(key) : null;
  return gone ? { itf: gone, ghost: true } : null;
}

const emptyDiffIndex = (): Record<DiffKind, Map<string, Change>> =>
  ({ node: new Map(), interface: new Map(), link: new Map(), aggregate: new Map(), cluster: new Map(), mlag_domain: new Map() });

// Le diff indexé par identité d'élément : `changeOf("link", id)` rend { kind: added | removed | changed, fields }.
function indexDiff(diff: Diff | null): Record<DiffKind, Map<string, Change>> {
  const of = emptyDiffIndex();
  if (!diff) return of;
  const mark = (map: Map<string, Change>, key: string, kind: Change["kind"], fields?: Change["fields"]): void => { map.set(key, { kind, fields: fields || [] }); };
  const mlagKey = (id: number, members: { hostname: string; aggregate: string }[]): string => id + SEP + members.map((m) => aggregateKey(m.hostname, m.aggregate)).join(SEP);
  diff.nodes.added.forEach((n) => mark(of.node, n.hostname, "added"));
  diff.nodes.removed.forEach((n) => mark(of.node, n.hostname, "removed"));
  // Le contrat publie une seule forme `EntityChange` dont `ref` est une union : la section dit la sorte attendue, et
  // une référence d'une autre sorte est ignorée plutôt que recadrée par un cast (revue de la toile, M3).
  diff.nodes.changed.forEach((c) => { if (c.ref.kind === "node") mark(of.node, c.ref.hostname, "changed", c.fields); });
  diff.interfaces.added.forEach((i) => mark(of.interface, ifaceKey(i.hostname, i.name), "added"));
  diff.interfaces.removed.forEach((i) => mark(of.interface, ifaceKey(i.hostname, i.name), "removed"));
  diff.interfaces.changed.forEach((c) => { if (c.ref.kind === "interface") mark(of.interface, ifaceKey(c.ref.hostname, c.ref.name), "changed", c.fields); });
  diff.links.added.forEach((l) => mark(of.link, linkId(l), "added"));
  diff.links.removed.forEach((l) => mark(of.link, linkId(l), "removed"));
  diff.links.changed.forEach((c) => { if (c.ref.kind === "link") mark(of.link, linkId(c.ref), "changed", c.fields); });
  diff.aggregates.added.forEach((a) => mark(of.aggregate, aggregateKey(a.hostname, a.name), "added"));
  diff.aggregates.removed.forEach((a) => mark(of.aggregate, aggregateKey(a.hostname, a.name), "removed"));
  diff.aggregates.changed.forEach((c) => { if (c.ref.kind === "aggregate") mark(of.aggregate, aggregateKey(c.ref.hostname, c.ref.name), "changed", c.fields); });
  diff.ha_clusters.added.forEach((c) => mark(of.cluster, clusterId(c.members.map((m) => m.hostname)), "added"));
  diff.ha_clusters.removed.forEach((c) => mark(of.cluster, clusterId(c.members.map((m) => m.hostname)), "removed"));
  diff.ha_clusters.changed.forEach((c) => { if (c.ref.kind === "cluster") mark(of.cluster, clusterId(c.ref.members), "changed", c.fields); });
  diff.mlag_domains.added.forEach((d) => mark(of.mlag_domain, mlagKey(d.mlag_id, d.members), "added"));
  diff.mlag_domains.removed.forEach((d) => mark(of.mlag_domain, mlagKey(d.mlag_id, d.members), "removed"));
  diff.mlag_domains.changed.forEach((c) => { if (c.ref.kind === "mlag_domain") mark(of.mlag_domain, mlagKey(c.ref.mlag_id, c.ref.members), "changed", c.fields); });
  return of;
}

// Ce que l'onglet Diff compte : tout ce qui est listé, sections, contrôles apparus ou résolus, couverture, événements.
function diffCount(diff: Diff | null): number {
  if (!diff) return 0;
  const s = diff.summary;
  const sections = DIFF_SECTIONS.reduce((sum, name) => sum + s[name].added + s[name].removed + s[name].changed, 0);
  return sections + s.checks.appeared + s.checks.resolved + s.coverage.changed + s.events.rebooted + s.events.flapped;
}

// Les structures de R4. Un agrégat porte ses câbles (ceux de ses membres) ; un faisceau est l'ensemble des câbles
// dont les deux bouts sont membres d'un agrégat, une paire d'agrégats donc ; un domaine MLAG relie deux agrégats
// de deux équipements ; un cluster HA relie ses membres. Rien ici n'est déduit : tout est lu dans le snapshot.
function buildAggregates(model: Model, snapshot: Snapshot): void {
  snapshot.aggregates.forEach((raw, index) => {
    const key = aggregateKey(raw.hostname, raw.name);
    const entry: Aggregate = { index, key, raw, hostname: raw.hostname, name: raw.name, cables: [], mlag: null, beams: [], checks: [], worst: null };
    entry.cables = raw.cables.map((cable) => model.linkById.get(linkId(cable))).filter((link): link is ModelLink => !!link);
    model.aggregates.push(entry);
    model.aggregateByKey.set(key, entry);
    pushTo(model.aggregatesByNode, raw.hostname, entry);
  });
  snapshot.mlag_domains.forEach((raw, index) => {
    const members = raw.members.map((m) => model.aggregateByKey.get(aggregateKey(m.hostname, m.aggregate))).filter((a): a is Aggregate => !!a);
    const domain = { index, raw, id: String(raw.mlag_id) + SEP + raw.members.map((m) => aggregateKey(m.hostname, m.aggregate)).join(SEP), members,
      peerLink: raw.peer_link ? model.aggregateByKey.get(aggregateKey(raw.peer_link.hostname, raw.peer_link.aggregate)) || null : null };
    model.mlagDomains.push(domain);
    members.forEach((aggregate) => { aggregate.mlag = domain; });
  });
}

// Les deux bouts du faisceau qu'un câble rejoint, dans l'ordre de leurs clés, ou `null` : un faisceau relie deux
// équipements distincts, une boucle entre deux agrégats du même équipement reste un câble (ses deux agrégats se
// lisent sur sa fiche), elle ne fabrique pas de faisceau fantôme (revue, 7).
function beamEndsOf(raw: Link): [BeamEnd, BeamEnd] | null {
  if (raw.aggregate_a === null || raw.aggregate_b === null || raw.a.hostname === raw.b.hostname) return null;
  const ends = [{ hostname: raw.a.hostname, aggregate: raw.aggregate_a }, { hostname: raw.b.hostname, aggregate: raw.aggregate_b }]
    .map((end) => ({ ...end, key: aggregateKey(end.hostname, end.aggregate) }))
    .sort((x, y) => (x.key < y.key ? -1 : 1));
  return [ends[0], ends[1]];
}

const beamIdOf = (raw: Link): string | null => {
  const ends = beamEndsOf(raw);
  return ends ? ends[0].key + SEP + ends[1].key : null;
};

function buildBeams(model: Model): void {
  for (const link of model.links) {
    const ends = beamEndsOf(link.raw);
    if (!ends) continue;
    const id = ends[0].key + SEP + ends[1].key;
    if (!model.beamById.has(id)) {
      const aggregates = ends.map((end) => model.aggregateByKey.get(end.key) || null);
      const known = aggregates.filter((agg): agg is Aggregate => !!agg);
      // Les domaines MLAG des deux agrégats, dédoublonnés : un vPC dos à dos en a deux (revue, 3).
      const mlags = Array.from(new Set(known.map((agg) => agg.mlag).filter((d): d is NonNullable<typeof d> => !!d)));
      const beam: Beam = { index: model.beams.length, id, a: ends[0], b: ends[1], aggregates, known, links: [],
        peerLink: known.length > 0 && known.every((agg) => agg.raw.mlag_peer_link),
        degraded: known.some((agg) => agg.raw.degraded), mlags, checks: [], worst: null };
      model.beams.push(beam);
      model.beamById.set(id, beam);
      aggregates.forEach((agg) => { if (agg) agg.beams.push(beam); });
      ends.forEach((end) => pushTo(model.beamsByNode, end.hostname, beam));
    }
    const beam = model.beamById.get(id) as Beam;
    beam.links.push(link);
    link.beam = beam;
  }
}

function buildClusters(model: Model, snapshot: Snapshot): void {
  snapshot.ha_clusters.forEach((raw, index) => {
    const hosts = raw.members.map((m) => m.hostname);
    const cluster: Cluster = { index, raw, id: clusterId(hosts), hosts, checks: [], worst: null,
      heartbeats: raw.heartbeat_interfaces.map((hb) => ({ ...hb, link: hb.cable ? model.linkById.get(linkId(hb.cable)) || null : null })) };
    model.clusters.push(cluster);
    model.clusterById.set(cluster.id, cluster);
    hosts.forEach((host) => pushTo(model.clustersByHost, host, cluster)); // un équipement peut être décrit dans deux clusters
    // Toutes les appartenances d'un équipement, dans l'ordre canonique des clusters : le nœud porte le rôle de la
    // première, l'état down de n'importe laquelle, la bulle les liste toutes (revue, B4).
    raw.members.forEach((member) => pushTo(model.haMembershipsByHost, member.hostname, { cluster, member }));
    cluster.heartbeats.forEach((hb) => { if (hb.link) hb.link.heartbeat = true; });
  });
}

interface Mentions { ends: Set<string>; names: Set<string> }

// Ce que les détails d'un contrôle désignent : des bouts de câble {hostname, interface} et des noms bruts. Les clés
// qui nomment le port local du contrôle (`member`, `interface`) ne désignent pas l'autre bout (revue, 6).
// Les clés qui nomment les membres d'un cluster (`description_ha_unresolved`) ne désignent pas l'autre bout non plus
// (revue du 2026-10-02, B7).
const LOCAL_PORT_KEYS = new Set(["member", "interface", "members", "priorities", "disputed", "clusters"]);
function mentioned(value: unknown, found: Mentions): Mentions {
  if (Array.isArray(value)) value.forEach((item) => mentioned(item, found));
  else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("hostname" in record && "interface" in record) found.ends.add(ifaceKey(String(record.hostname), record.interface as string | null));
    else Object.entries(record).forEach(([key, item]) => { if (!LOCAL_PORT_KEYS.has(key)) mentioned(item, found); });
  } else if (typeof value === "string") found.names.add(value);
  return found;
}

// Un contrôle posé sur un port qui porte plusieurs câbles ne concerne que ceux dont l'autre bout est désigné par
// ses détails (le voisin inconnu, le port observé…), par son nom résolu ou par ce que le témoin a annoncé.
function concerns(check: CheckEntry, link: ModelLink, portKey: string): boolean {
  const found = mentioned(check.details, { ends: new Set(), names: new Set() });
  const other = ifaceKey(link.a.hostname, link.a.interface) === portKey ? link.b : link.a;
  if (found.ends.has(ifaceKey(other.hostname, other.interface)) || found.names.has(other.hostname) || found.names.has(other.interface)) return true;
  return link.raw.evidence.some((e) => ifaceKey(e.witness.hostname, e.witness.interface) === portKey
    && (found.names.has(e.remote_raw.name) || (e.remote_raw.port !== null && found.names.has(e.remote_raw.port))));
}

// Trois cas, du plus sûr au moins sûr : le contrôle nomme son câble ; il vise un port qui n'en porte qu'un ; il vise
// un port qui en porte plusieurs, et ses détails disent lequel. Sinon il reste un contrôle du port, montré à part
// sur chacun de ses câbles et compté sur aucun.
function distributeChecks(model: Model): void {
  const byRank = (x: CheckEntry, y: CheckEntry): number => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || x.index - y.index;
  model.links.forEach((link) => { link.checks = []; link.portChecks = []; });
  for (const check of model.checks) {
    const named = check.refs.filter((ref): ref is LinkRef => ref.kind === "link").map((ref) => model.linkById.get(linkId(ref))).filter((l): l is ModelLink => !!l);
    if (named.length) { named.forEach((link) => link.checks.push(check)); continue; }
    for (const ref of check.refs.filter((r): r is InterfaceRef => r.kind === "interface")) {
      const portKey = ifaceKey(ref.hostname, ref.name);
      const carried = (model.linksByIface.get(portKey) || []).filter((link) => !link.ghost); // un fantôme ne porte rien de cette run
      const chosen = carried.length === 1 ? carried : carried.filter((link) => concerns(check, link, portKey));
      (chosen.length ? chosen : carried).forEach((link) => (chosen.length ? link.checks : link.portChecks).push(check));
    }
  }
  model.links.forEach((link) => {
    link.checks = Array.from(new Set(link.checks)).sort(byRank);
    link.portChecks = Array.from(new Set(link.portChecks)).filter((c) => !link.checks.includes(c)).sort(byRank);
    link.worst = worst(link.checks);
  });
  model.aggregates.forEach((agg) => { agg.checks = (model.checksByAggregate.get(agg.key) || []).slice().sort(byRank); agg.worst = worst(agg.checks); });
  model.clusters.forEach((cluster) => { cluster.checks = (model.checksByCluster.get(cluster.id) || []).slice().sort(byRank); cluster.worst = worst(cluster.checks); });
  model.beams.forEach((beam) => {
    const own = beam.aggregates.flatMap((agg) => (agg ? agg.checks : []));
    beam.checks = Array.from(new Set(own)).sort(byRank);
    beam.worst = worst(beam.checks);
  });
}

function sourceCombos(links: ModelLink[]): ComboRow[] {
  const rows = new Map<string, ComboRow>();
  for (const link of links) {
    const key = link.combo + SEP + link.status;
    let row = rows.get(key);
    if (!row) { row = { combo: link.combo, status: link.status, observed: link.sources.some((s) => OBSERVED[s]), count: 0 }; rows.set(key, row); }
    row.count += 1;
  }
  return Array.from(rows.values()).sort((x, y) => y.count - x.count || (x.combo < y.combo ? -1 : 1));
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) || 0) + 1);
  return counts;
}

// La couche d'intention, indexée : une épingle par hostname ; orpheline si son hostname n'est pas un nœud de cette
// run (un fantôme du diff n'est pas un nœud de la run). Rappelé après chaque écriture acceptée par l'API.
export function applyIntent(model: Model, intent: Intent | null): void {
  model.intent = intent;
  const absent = (hostname: string): boolean => { const node = model.nodeByHost.get(hostname); return !node || !!node.ghost; };
  model.pinByHost = new Map((intent ? intent.pins : []).map((pin) => [pin.hostname, pin]));
  model.orphanPins = (intent ? intent.pins : []).filter((pin) => absent(pin.hostname));
  // Les couleurs (docs/10) : un document d'avant la mineure 1.1.0 n'en a pas, les listes sont alors vides.
  model.colorByType = new Map((intent && intent.type_colors ? intent.type_colors : []).map((color) => [color.type, color]));
  model.colorByHost = new Map((intent && intent.device_colors ? intent.device_colors : []).map((color) => [color.hostname, color]));
  model.orphanColors = (intent && intent.device_colors ? intent.device_colors : []).filter((color) => absent(color.hostname));
  // Les groupes (docs/10 §5) : un document d'avant 1.2.0 n'en a pas.
  const groups = intent && intent.groups ? intent.groups : [];
  model.groupById = new Map(groups.map((group) => [group.id, group]));
  model.groupsByHost = new Map();
  groups.forEach((group) => group.members.forEach((host) => { const list = model.groupsByHost.get(host) || []; list.push(group); model.groupsByHost.set(host, list); }));
  model.orphanGroups = groups.filter((group) => group.members.every(absent));
  // Les annotations (docs/10 §6) : un document d'avant 1.3.0 n'en a pas.
  const notes: Annotation[] = intent && intent.annotations ? intent.annotations : [];
  model.annotationById = new Map(notes.map((a) => [a.id, a]));
  model.annotationsByHost = new Map();
  model.annotationsByGroup = new Map();
  notes.forEach((a) => {
    const index = a.anchor.kind === "device" ? model.annotationsByHost : a.anchor.kind === "group" ? model.annotationsByGroup : null;
    if (!index || !a.anchor.ref) return;
    const list = index.get(a.anchor.ref) || []; list.push(a); index.set(a.anchor.ref, list);
  });
  model.orphanAnnotations = notes.filter((a) => isOrphan(model, a));
  // Les connecteurs (docs/10 §6) : un document d'avant 1.4.0 n'en a pas.
  const lines: Connector[] = intent && intent.connectors ? intent.connectors : [];
  model.connectorById = new Map(lines.map((c) => [c.id, c]));
  model.connectorsByRef = new Map();
  lines.forEach((c) => attachedEnds(c).forEach((e) => { const k = refKey(e.kind, e.ref), list = model.connectorsByRef.get(k) || []; list.push(c); model.connectorsByRef.set(k, list); }));
  model.orphanConnectors = lines.filter((c) => connectorOrphan(model, c));
}

// Le placement mémorisé, indexé : une place par hostname. Rappelé après chaque écriture acceptée par l'API.
export function applyPlacement(model: Model, placement: Placement | null): void {
  model.placement = placement;
  model.placeByHost = new Map((placement ? placement.places : []).map((place) => [place.hostname, place]));
}

export function build(data: PageData): Model {
  const snapshot = data.snapshot;
  const diff = data.diff || null;
  const model: Model = {
    source: snapshot.source, report: snapshot.report, coverage: snapshot.coverage, ingest: data.ingest || null,
    origin: data.origin, catalogue: data.catalogue || {}, snapshotVersion: snapshot.snapshot_version, diff,
    nodes: snapshot.nodes, ghostNodes: [], nodeByHost: new Map(), interfaces: snapshot.interfaces, ifaceByKey: new Map(),
    ifacesByNode: new Map(), ghostIfaceByKey: new Map(), ghostIfacesByNode: new Map(),
    links: [], ghostLinks: [], linkById: new Map(), linksByNode: new Map(), linksByIface: new Map(), checks: [],
    checksByNode: new Map(), checksByAggregate: new Map(), checksByCluster: new Map(),
    aggregates: [], aggregateByKey: new Map(), aggregatesByNode: new Map(), mlagDomains: [],
    beams: [], beamById: new Map(), beamsByNode: new Map(), clusters: [], clusterById: new Map(), clustersByHost: new Map(),
    haMembershipsByHost: new Map(),
    combos: [], severityCounts: new Map(), statusCounts: new Map(), kindCounts: new Map(),
    diffOf: emptyDiffIndex(), changeOf: () => null, diffCount: 0,
    intent: null, pinByHost: new Map(), orphanPins: [], colorByType: new Map(), colorByHost: new Map(), orphanColors: [], groupById: new Map(), groupsByHost: new Map(), orphanGroups: [],
    annotationById: new Map(), annotationsByHost: new Map(), annotationsByGroup: new Map(), orphanAnnotations: [],
    connectorById: new Map(), connectorsByRef: new Map(), orphanConnectors: [], placement: null, placeByHost: new Map(),
    cardWidth: 0,
  };
  snapshot.nodes.forEach((node) => model.nodeByHost.set(node.hostname, node));
  snapshot.interfaces.forEach((itf) => {
    model.ifaceByKey.set(ifaceKey(itf.hostname, itf.name), itf);
    pushTo(model.ifacesByNode, itf.hostname, itf);
  });
  if (diff) addGhosts(model, diff);
  buildLinks(model, snapshot.links, diff ? diff.links.removed : []);
  buildAggregates(model, snapshot);
  buildBeams(model);
  buildClusters(model, snapshot);
  attachChecks(model, snapshot.checks);
  distributeChecks(model);
  model.combos = sourceCombos(model.links);
  model.severityCounts = countBy(model.checks, (c) => c.severity);
  model.statusCounts = countBy(model.links, (l) => l.status);
  model.kindCounts = countBy(model.nodes, (n) => n.kind);
  model.diffOf = indexDiff(diff);
  model.changeOf = (kind, id) => model.diffOf[kind].get(id) || null;
  model.diffCount = diffCount(diff);
  model.cardWidth = commonCardWidth(model);
  applyIntent(model, data.intent || null);
  applyPlacement(model, data.placement || null);
  return model;
}

// Une sélection s'adresse par l'identité de l'élément (ses bouts, ses membres), jamais par son rang : le rang change
// dès qu'un export corrigé ajoute un voisin, et la même adresse montrerait un autre élément.
export const linkToken = (link: LinkLike): string => JSON.stringify([link.a.hostname, link.a.interface, link.b.hostname, link.b.interface]);
function parseToken(token: string, length: number | null): string[] | null {
  try {
    const parts: unknown = JSON.parse(token);
    return Array.isArray(parts) && (length === null || parts.length === length) && parts.every((p) => typeof p === "string") ? (parts as string[]) : null;
  } catch (error) {
    return null;
  }
}
export function linkFromToken(model: Model, token: string): ModelLink | null {
  const parts = parseToken(token, 4);
  return parts ? model.linkById.get(parts.join(SEP)) || null : null;
}

// L'entité désignée par une sélection, ou null si elle n'existe pas dans ce snapshot.
export function entityOf(model: Model, selection: Selection | null): Entity | null {
  if (!selection) return null;
  const maps: Record<SelectionKind, Map<string, Entity>> = { node: model.nodeByHost, link: model.linkById, aggregate: model.aggregateByKey, beam: model.beamById, cluster: model.clusterById, group: model.groupById, annotation: model.annotationById, connector: model.connectorById };
  return maps[selection.kind] ? maps[selection.kind].get(selection.id) || null : null;
}
export const nodeOf = (model: Model, selection: Selection | null): ModelNode | null => (selection && selection.kind === "node" ? (entityOf(model, selection) as ModelNode | null) : null);
export const linkOf = (model: Model, selection: Selection | null): ModelLink | null => (selection && selection.kind === "link" ? (entityOf(model, selection) as ModelLink | null) : null);
export const aggregateOf = (model: Model, selection: Selection | null): Aggregate | null => (selection && selection.kind === "aggregate" ? (entityOf(model, selection) as Aggregate | null) : null);
export const beamOf = (model: Model, selection: Selection | null): Beam | null => (selection && selection.kind === "beam" ? (entityOf(model, selection) as Beam | null) : null);
export const clusterOf = (model: Model, selection: Selection | null): Cluster | null => (selection && selection.kind === "cluster" ? (entityOf(model, selection) as Cluster | null) : null);
export const groupOf = (model: Model, selection: Selection | null): Group | null => (selection && selection.kind === "group" ? (entityOf(model, selection) as Group | null) : null);
/** Les membres d'un groupe présents dans la run (ni absents, ni fantômes). */
export const presentOf = (model: Model, group: Group): string[] => group.members.filter((host) => { const node = model.nodeByHost.get(host); return !!node && !node.ghost; });

// Les équipements qu'une sélection concerne : ceux à centrer, à garder visibles.
export function hostsOf(model: Model, selection: Selection | null): string[] {
  if (!selection || !entityOf(model, selection)) return [];
  switch (selection.kind) {
    case "node": return [(nodeOf(model, selection) as ModelNode).hostname];
    case "link": { const link = linkOf(model, selection) as ModelLink; return [link.a.hostname, link.b.hostname]; }
    case "aggregate": return [(aggregateOf(model, selection) as Aggregate).hostname];
    case "beam": { const beam = beamOf(model, selection) as Beam; return [beam.a.hostname, beam.b.hostname]; }
    case "group": return presentOf(model, groupOf(model, selection) as Group);
    case "annotation": { const a = model.annotationById.get(selection.id) as Annotation; return a.anchor.kind === "device" && a.anchor.ref && model.nodeByHost.has(a.anchor.ref) ? [a.anchor.ref] : a.anchor.kind === "group" ? presentOf(model, model.groupById.get(a.anchor.ref || "") || { members: [] } as unknown as Group) : []; }
    case "connector": return connectorHosts(model.connectorById.get(selection.id) as Connector).filter((host) => model.nodeByHost.has(host));
    default: return (clusterOf(model, selection) as Cluster).hosts;
  }
}

// Le paramètre d'adresse d'une sélection (`link=`, `aggregate=`…) et sa valeur, et l'inverse.
export function tokenOf(model: Model, selection: Selection | null): [string, string] | null {
  if (!selection || !entityOf(model, selection)) return null;
  switch (selection.kind) {
    case "node": return ["node", (nodeOf(model, selection) as ModelNode).hostname];
    case "link": return ["link", linkToken(linkOf(model, selection) as ModelLink)];
    case "aggregate": { const agg = aggregateOf(model, selection) as Aggregate; return ["aggregate", JSON.stringify([agg.hostname, agg.name])]; }
    case "beam": { const beam = beamOf(model, selection) as Beam; return ["beam", JSON.stringify([beam.a.hostname, beam.a.aggregate, beam.b.hostname, beam.b.aggregate])]; }
    case "group": return ["group", (groupOf(model, selection) as Group).id];
    case "annotation": return ["annotation", selection.id];
    case "connector": return ["connector", selection.id];
    default: return ["cluster", JSON.stringify((clusterOf(model, selection) as Cluster).hosts)];
  }
}
// Une adresse écrite avec les bouts dans l'autre ordre désigne le même élément (revue, 8).
export function selectionFromToken(model: Model, kind: string, token: string): Selection | null {
  if (kind === "node") return model.nodeByHost.has(token) ? { kind, id: token } : null;
  if (kind === "group") return model.groupById.has(token) ? { kind, id: token } : null;
  if (kind === "annotation") return model.annotationById.has(token) ? { kind, id: token } : null;
  if (kind === "connector") return model.connectorById.has(token) ? { kind, id: token } : null;
  const lengths: Record<string, number | null> = { link: 4, aggregate: 2, beam: 4, cluster: null };
  if (!(kind in lengths)) return null;
  const parts = parseToken(token, lengths[kind]);
  if (!parts) return null;
  const swapped = kind === "link" || kind === "beam" ? [parts[2], parts[3], parts[0], parts[1]] : null;
  const candidates = kind === "cluster" ? [parts.slice().sort()] : swapped ? [parts, swapped] : [parts];
  for (const order of candidates) {
    const id = kind === "beam" ? aggregateKey(order[0], order[1]) + SEP + aggregateKey(order[2], order[3]) : order.join(SEP);
    const selection: Selection = { kind: kind as SelectionKind, id };
    if (entityOf(model, selection)) return selection;
  }
  return null;
}

// Ce que la carte d'un équipement porte sous son nom : le rôle HA de son premier cluster, le compte de son stack.
export function cardExtrasOf(model: Model, node: ModelNode): CardExtras {
  const ha = (model.haMembershipsByHost.get(node.hostname) || [])[0];
  return { role: ha ? ha.member.role : null, stack: node.stack ? node.stack.member_count : null };
}
// La largeur commune des cartes de la run, fantômes compris (ils se dessinent aussi) ; un voisin inconnu reste un disque.
function commonCardWidth(model: Model): number {
  const cards = model.nodes.concat(model.ghostNodes).filter((node) => node.kind !== "stub");
  return uniformWidth(cards.map((node) => cardWidthOf(displayName(node.hostname), cardExtrasOf(model, node))));
}

export const model = {
  build, cardExtrasOf, haBadge, applyIntent, applyPlacement, ifaceKey, interfaceAt, linkId, endLabel, worst, linkToken, linkFromToken, aggregateKey, clusterId, entityOf, hostsOf, tokenOf, selectionFromToken, groupOf, presentOf,
  SEVERITY_RANK, OBSERVED, haRoleGroup, DIFF_SECTIONS, SELECTION_KINDS,
};
