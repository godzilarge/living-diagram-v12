// La bulle au survol : ce qu'un câble, un équipement, un faisceau, un cluster, un groupe, une annotation ou un
// connecteur a à dire en quelques lignes, lu dans le snapshot et mis en blocs (bubble.ts les dessine). Un câble et
// un faisceau se lisent en deux colonnes, un bout par colonne, un fait par ligne ; un équipement en fiche courte.
// Une valeur absente s'écrit « — », jamais une valeur inventée, et jamais une raison que le snapshot ne donne pas
// (`null` = « pas de valeur », pas « non lu »). `control` à faux (vue Diagramme de l'application, 2026-10-09) : la
// bulle ne dit que ce que les équipements disent, jamais un statut, une source, un état de collecte ni un contrôle.
// Les énumérations du snapshot se disent avec les mots de l'inspecteur (format.ts) ; un nom trop long est raccourci au
// milieu, le nom complet reste dans la fiche (critique du 2026-10-09).
import { KIND_LABEL as ANNOTATION_KIND, summary } from "./annotations";
import { create, text } from "./bubble";
import type { Block, Dot, End, HeadIcon, Pill, Tone, Value } from "./bubble";
import { summary as connectorSummary } from "./connectors";
import { COLLECTION_LABEL, HA_MODE_LABEL, speedText, SOURCE_LABEL, STATUS_LABEL, TYPE_SHORT_LABEL } from "./format";
import { defaultHue, hueOfNode } from "./hues";
import { interfaceAt, SEVERITY_RANK } from "./model";
import type { EndLike } from "./model";
import type { Annotation, Beam, Change, CheckEntry, Cluster, Connector, Group, Model, ModelLink, ModelNode } from "./types";
import type { HaClusterMember } from "../contracts/snapshot";

export type { Block, Tip } from "./bubble";
export { create, text };

const DASH = "—";
const SOURCE_ORDER = ["lldp", "cdp", "description"]; // l'observé avant le documenté
const MAX_CHECK_LINES = 6;
/** Au-delà, un nom se raccourcit au milieu et un texte libre à la fin : la bulle est un coup d'œil, la fiche a tout. */
const MAX_NAME = 36, MAX_TEXT = 72;
const STATUS_TONE: Record<string, Tone> = { confirmed: "ok", observed_only: "observed", documented_only: "documented" };
const COLLECTION_DOT: Record<string, Dot> = { success: "ok", partial: "warning", failed: "danger", unreachable: "danger", not_collected: "muted" };
const KIND_PILL: Record<string, string> = { external: "autre infra", stub: "voisin inconnu" };
/** Les contrôles de R5 qui visent une rangée du tableau d'un câble : la rangée porte leur gravité. */
const ROW_OF_CHECK: Record<string, "speed" | "duplex" | "media" | "state"> = { link_speed_mismatch: "speed", link_duplex_mismatch: "duplex", link_oper_mismatch: "state" };
const SEVERITY_DOT: Record<string, Dot> = { error: "danger", warning: "warning", info: "muted" };

const head = (title: string, icon: HeadIcon | null, pills: Pill[] = [], sub: string | null = null): Block => ({ kind: "head", title, icon, pills, sub });
const row = (label: string, ...values: Value[]): Block => ({ kind: "row", label, values });
const val = (text: unknown, extra: Partial<Value> = {}): Value => ({ text: String(text), ...extra });
const note = (text: string, tone?: Tone): Block => ({ kind: "note", text: clipText(text), tone });
const rule: Block = { kind: "rule" }, space: Block = { kind: "space" };
const present = (candidate: Block | null): candidate is Block => candidate !== null;
const portName = (end: EndLike): string => (end.interface === null || end.interface === undefined ? "?" : end.interface);
const plural = (count: number, word: string): string => count + " " + word + (count > 1 ? "s" : "");
/** Un nom raccourci au milieu au-delà de `MAX_NAME` (même règle que la carte, seuil plus large). */
export const clipName = (name: string): string => (name.length <= MAX_NAME ? name : name.slice(0, 18) + "…" + name.slice(-17));
const clipText = (text: string): string => (text.length <= MAX_TEXT ? text : text.slice(0, MAX_TEXT - 1) + "…");
const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// Le point d'un état de port ou de membre : up en vert, down en rouge, le reste sans jugement.
const stateDot = (state: string | null | undefined): Dot | null => (state === "up" ? "ok" : state === "down" ? "danger" : state ? "muted" : null);

interface EndFacts { present: boolean; ghost: boolean; speed: string | null; duplex: string | null; media: string | null; state: string | null; reason: string | null }

// Les faits d'un bout : ce que `interfaces[]` dit du port ; `present: false` s'il n'y figure pas (voisin inconnu,
// autre infra, port tel qu'annoncé par le voisin, device non collecté à cette run) : alors aucune valeur, et la bulle
// le dit sous le port. Seul un câble lui-même retiré lit une interface retirée (`ghost: true`, dit aussi).
function endFacts(model: Model, end: EndLike, removed: boolean): EndFacts {
  const found = interfaceAt(model, end.hostname, end.interface, removed);
  if (!found) return { present: false, ghost: false, speed: null, duplex: null, media: null, state: null, reason: null };
  const itf = found.itf;
  return { present: true, ghost: found.ghost, speed: speedText(itf.speed_mbps), duplex: itf.duplex, media: itf.media, state: itf.oper_status, reason: itf.oper_reason };
}
const endNote = (f: EndFacts): string | null => (!f.present ? "absent de interfaces[]" : f.ghost ? "interface retirée, valeurs de la run d'avant" : null);

// Les contrôles, une ligne par (sévérité, code) avec son nombre d'occurrences, les plus graves d'abord ; au-delà de
// six lignes, le reste est compté en contrôles, pas en codes (revue, M3).
function checkBlocks(checks: Pick<CheckEntry, "severity" | "code">[]): Block[] {
  if (!checks.length) return [];
  const counts = new Map<string, number>();
  checks.forEach((c) => { const key = c.severity + " " + c.code; counts.set(key, (counts.get(key) || 0) + 1); });
  const rank = (key: string): number => SEVERITY_RANK[key.split(" ")[0]];
  const keys = Array.from(counts.keys()).sort((x, y) => rank(x) - rank(y) || (x < y ? -1 : x > y ? 1 : 0));
  const items = keys.slice(0, MAX_CHECK_LINES).map((key) => ({ severity: key.split(" ")[0], code: key.split(" ")[1], count: counts.get(key) as number }));
  const rest = keys.slice(MAX_CHECK_LINES).reduce((sum, key) => sum + (counts.get(key) as number), 0);
  return [{ kind: "checks", items, rest }];
}

// Ce que le diff dit de l'élément, en une pastille : ajouté, retiré, ou changé avec ses chemins (quatre au plus).
const DIFF_WORD: Record<string, string> = { added: "ajouté", removed: "retiré", changed: "changé" };
const DIFF_TEXT: Record<string, string> = { added: "dans cette run", removed: "depuis la run d'avant", changed: "" };
function diffBlock(change: Pick<Change, "kind"> & Partial<Change> | null): Block | null {
  if (!change) return null;
  const fields = change.fields || [];
  const paths = change.kind === "changed" ? fields.slice(0, 4).map((f) => f.path).join(", ") + (fields.length > 4 ? "…" : "") : DIFF_TEXT[change.kind];
  return { kind: "pills", pills: [{ text: DIFF_WORD[change.kind], tone: change.kind }], text: paths ? clipText(paths) : null, mono: change.kind === "changed" };
}

function sourcesText(sources: string[]): string {
  const ordered = SOURCE_ORDER.filter((src) => sources.includes(src)).concat(sources.filter((src) => !SOURCE_ORDER.includes(src)));
  return ordered.map((src) => SOURCE_LABEL[src] || src).join(" + ");
}

export interface TipOptions { control?: boolean }
const ALL: TipOptions = { control: true };

// Un bout par colonne ; une ligne par caractéristique, seulement si au moins un bout l'a ; l'état à part, connu de
// tout bout présent, avec sa raison en complément. En Contrôle, une rangée visée par un contrôle (vitesses différentes,
// état en désaccord) porte son point de gravité et ses deux valeurs teintées : la comparaison se lit sans chercher.
export function linkLines(model: Model, link: ModelLink, opts: TipOptions = ALL): Block[] {
  const control = opts.control !== false;
  const ends = [link.a, link.b];
  const facts = ends.map((end) => endFacts(model, end, link.ghost));
  const flagged = new Map<string, "error" | "warning">();
  if (control) link.checks.forEach((c) => { const key = ROW_OF_CHECK[c.code]; if (key && c.severity !== "info" && flagged.get(key) !== "error") flagged.set(key, c.severity); });
  const tone = (key: string): "error" | "warning" | null => flagged.get(key) || null;
  const rowDot = (key: string): Dot | null => (flagged.has(key) ? SEVERITY_DOT[flagged.get(key) as string] : null);
  const trait = (label: string, key: "speed" | "duplex" | "media"): Block | null => (facts.some((f) => f[key] !== null)
    ? { kind: "row", label, dot: rowDot(key), values: facts.map((f) => (f[key] === null ? val(DASH, { muted: true }) : val(f[key], { tone: tone(key) }))) } : null);
  const traits = [trait("vitesse", "speed"), trait("duplex", "duplex"), trait("média", "media")].filter(present);
  const state: Block | null = facts.some((f) => f.state !== null)
    ? { kind: "row", label: "état", dot: rowDot("state"),
      values: facts.map((f) => (f.state === null ? val(DASH, { muted: true }) : val(f.state, { dot: stateDot(f.state), sub: f.reason, tone: tone("state") }))) } : null;
  const verdict: Block | null = control ? { kind: "pills", text: sourcesText(link.sources),
    pills: [{ text: STATUS_LABEL[link.status], tone: STATUS_TONE[link.status] || "neutral" }, ...(link.raw.oper === "down" ? [{ text: "down", tone: "danger" as Tone }] : [])] } : null;
  const footer = [verdict, diffBlock(link.ghost ? { kind: "removed" } : model.changeOf("link", link.id)), ...(control ? checkBlocks(link.checks) : [])].filter(present);
  const hueOf = (hostname: string): string => { const node = model.nodeByHost.get(hostname); return node ? hueOfNode(model, node) : defaultHue(null); };
  const heads: Block = { kind: "ends", icon: { kind: "link", hues: [hueOf(link.a.hostname), hueOf(link.b.hostname)] },
    ends: ends.map((end, index): End => ({ name: clipName(end.hostname), port: portName(end), muted: !facts[index].present, note: endNote(facts[index]) })) };
  const blocks: (Block | null)[] = [
    heads,
    space,
    ...(traits.length ? traits : [note("vitesse, duplex, média : aucune valeur")]),
    state,
    ...(footer.length ? [rule, ...footer] : []),
  ];
  return blocks.filter(present);
}

const priorityText = (member: HaClusterMember): string | null => (member.priority !== null && member.priority !== undefined ? "priorité " + member.priority : null);
const modeLabel = (mode: string): string => HA_MODE_LABEL[mode] || mode;

export function nodeLines(model: Model, node: ModelNode, opts: TipOptions = ALL): Block[] {
  const control = opts.control !== false;
  const memberships = model.haMembershipsByHost.get(node.hostname) || [];
  const links = (model.linksByNode.get(node.hostname) || []).filter((l) => !l.ghost);
  const ghosts = (model.linksByNode.get(node.hostname) || []).length - links.length;
  const hardware = [node.vendor ? capitalized(node.vendor) : null, node.model].filter(Boolean).join(" ");
  const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
  const pills: Pill[] = [
    ...(node.type ? [{ text: TYPE_SHORT_LABEL[node.type] || node.type, tone: "neutral" as Tone }] : []),
    ...(KIND_PILL[node.kind] ? [{ text: KIND_PILL[node.kind], tone: "muted" as Tone, dashed: true }] : []),
  ];
  const facts: Block[] = [
    row("câbles", val(links.length, { sub: ghosts ? plural(ghosts, "retiré") : null })),
    node.stack ? row("stack", val(plural(node.stack.member_count, "membre"))) : null,
    node.evidence && node.evidence.capabilities.length ? row("capacités", val(clipText(node.evidence.capabilities.join(", ")))) : null,
    ...memberships.flatMap((ha) => [ // tous ses clusters (revue, B4)
      row("cluster HA", val(clipName(ha.cluster.raw.cluster_name || ha.cluster.hosts.join(" + ")), { sub: modeLabel(ha.cluster.raw.mode) })),
      row("rôle", val(ha.member.role, { sub: priorityText(ha.member) })),
      row("état", val(ha.member.state, { dot: stateDot(ha.member.state) })),
    ]),
  ].filter(present);
  const footer = [
    diffBlock(node.ghost ? { kind: "removed" } : model.changeOf("node", node.hostname)),
    control && node.collection ? row("collecte", val(COLLECTION_LABEL[node.collection] || node.collection, { dot: COLLECTION_DOT[node.collection] || "muted" })) : null,
    ...(control ? checkBlocks(model.checksByNode.get(node.hostname) || []) : []),
  ].filter(present);
  return [
    head(clipName(node.hostname), { kind: "type", type: node.type, hue: hueOfNode(model, node) }, pills, clipText([hardware, system].filter(Boolean).join(" · ")) || null),
    space,
    ...facts,
    ...(footer.length ? [rule, ...footer] : []),
  ];
}

// Les deux équipements en colonnes : deux faisceaux d'un même agrégat vers deux voisins ne se confondent pas (revue, M2) ;
// la nature du faisceau (peer-link, MLAG n) en pastilles sur la ligne des noms.
export function beamLines(beam: Pick<Beam, "a" | "b" | "known" | "links" | "degraded" | "peerLink" | "mlags" | "checks">, opts: TipOptions = ALL): Block[] {
  const protocols = Array.from(new Set(beam.known.map((agg) => agg.raw.protocol + (agg.raw.lacp_mode ? " " + agg.raw.lacp_mode : ""))));
  const nature: Pill[] = [...(beam.peerLink ? [{ text: "peer-link", tone: "structure" as Tone }] : []), ...beam.mlags.map((d): Pill => ({ text: "MLAG " + d.raw.mlag_id, tone: "structure" }))];
  const checks = opts.control !== false ? checkBlocks(beam.checks) : [];
  return [
    { kind: "ends", icon: { kind: "beam" }, ends: [{ name: clipName(beam.a.hostname), port: beam.a.aggregate }, { name: clipName(beam.b.hostname), port: beam.b.aggregate }], pills: nature },
    space,
    row("câbles", val(beam.links.length)),
    ...(protocols.length ? [row("protocole", val(protocols.join(" / ")))] : []),
    ...(beam.degraded ? [note("un agrégat dégradé", "warning")] : []),
    ...(checks.length ? [rule, ...checks] : []),
  ];
}

/** La bulle d'un cadre de groupe (docs/10 §5) : son nom, ses membres présents sur ses membres, qui, sa description. */
export function groupLines(group: Group, shown: number): Block[] {
  const first = group.description.split("\n").find((text) => text.trim()) || "";
  return [
    head(clipText(group.label), { kind: "group" }, [], shown + " / " + plural(group.members.length, "membre") + " · " + group.author),
    ...(first ? [note(first)] : []),
  ];
}

/** La bulle d'une annotation (docs/10 §6) : sa sorte, un résumé, qui, quand : reconnaissable comme une intention. */
export function annotationLines(a: Annotation): Block[] {
  const where = a.anchor.kind === "free" ? "libre" : "attachée à " + a.anchor.ref;
  return [
    head(ANNOTATION_KIND[a.content.kind] || a.content.kind, { kind: "note" }, [{ text: where, tone: "muted" }]),
    note(summary(a)),
    note("annotation de " + a.author + ", le " + a.at.slice(0, 10)),
  ];
}

// Un membre par ligne : son rôle, son état avec son point, sa priorité ; le mode du cluster en sous-titre.
export function clusterLines(cluster: Cluster, opts: TipOptions = ALL): Block[] {
  const checks = opts.control !== false ? checkBlocks(cluster.checks) : [];
  return [
    head(clipName(cluster.raw.cluster_name || cluster.hosts.join(" + ")), { kind: "cluster" }, [{ text: "HA", tone: "structure" }], modeLabel(cluster.raw.mode)),
    space,
    ...cluster.raw.members.map((m): Block => ({ kind: "row", mono: true, label: clipName(m.hostname),
      values: [val(m.role), val(m.state, { dot: stateDot(m.state) }), ...(priorityText(m) ? [val(priorityText(m), { muted: true })] : [])] })),
    ...(checks.length ? [rule, ...checks] : []),
  ];
}

/** La bulle d'un connecteur (docs/10 §6, 1.4.0) : ses bouts, son étiquette, qui, quand. */
export function connectorLines(c: Connector): Block[] {
  return [
    head(clipText(connectorSummary(c)), { kind: "connector" }, [{ text: c.route === "elbow" ? "coudé" : c.route === "curve" ? "courbe" : "droit", tone: "muted" }, { text: c.locked ? "verrouillé" : "glissable", tone: "muted" }]),
    note("connecteur de " + c.author + ", le " + c.at.slice(0, 10)),
  ];
}
export const tip = { groupLines, annotationLines, connectorLines, create, text, clipName, linkLines, nodeLines, beamLines, clusterLines };
