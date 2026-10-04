// La bulle au survol : ce qu'un câble, un équipement, un faisceau ou un cluster a à dire en quelques lignes, lu dans
// le snapshot. Un groupe SVG posé dans le canevas en coordonnées d'écran, jamais un style en ligne (la CSP par
// empreinte n'en admet aucun) ; des cellules alignées en colonnes par leur largeur en caractères (police à chasse
// fixe), jamais par des espaces. Une valeur absente s'écrit « — », jamais une valeur inventée, et jamais une raison
// que le snapshot ne donne pas (`null` = « pas de valeur », pas « non lu »).
import { clear, s } from "./dom";
import { speedText, KIND_LABEL, SOURCE_LABEL, STATUS_LABEL } from "./format";
import { beamLabel, clusterLabel } from "./geometry";
import { endLabel, interfaceAt, SEVERITY_RANK } from "./model";
import type { EndLike } from "./model";
import type { Beam, Change, CheckEntry, Cluster, Model, ModelLink, ModelNode } from "./types";
import type { HaClusterMember } from "../contracts/snapshot";

const CHAR_W = 7.4, LINE_H = 16, PAD_X = 10, PAD_Y = 7, GAP = 2 * CHAR_W, OFFSET = 14; // mono 12 px
const DASH = "—";
const SOURCE_ORDER = ["lldp", "cdp", "description"]; // l'observé avant le documenté
const MAX_CHECK_LINES = 6;

export interface Cell { text: string; cls: string | null }
export type Line = Cell[];
const cell = (text: unknown, cls?: string | null): Cell => ({ text: String(text), cls: cls || null });
const line = (...cells: Cell[]): Line => cells;
const plural = (count: number, word: string): string => count + " " + word + (count > 1 ? "s" : "");

interface EndFacts { present: boolean; ghost: boolean; speed: string | null; duplex: string | null; media: string | null; state: string | null }

// Les faits d'un bout : ce que `interfaces[]` dit du port ; `present: false` s'il n'y figure pas (voisin inconnu,
// autre infra, port tel qu'annoncé par le voisin, device non collecté à cette run) : alors aucune valeur, et la bulle
// le dit en toutes lettres. Seul un câble lui-même retiré lit une interface retirée (`ghost: true`, dit aussi).
function endFacts(model: Model, end: EndLike, removed: boolean): EndFacts {
  const found = interfaceAt(model, end.hostname, end.interface, removed);
  if (!found) return { present: false, ghost: false, speed: null, duplex: null, media: null, state: null };
  const itf = found.itf;
  return { present: true, ghost: found.ghost, speed: speedText(itf.speed_mbps), duplex: itf.duplex, media: itf.media,
    state: itf.oper_status + (itf.oper_reason ? " · " + itf.oper_reason : "") };
}

// Les contrôles, une ligne par (sévérité, code) avec son nombre d'occurrences, les plus graves d'abord ; au-delà de
// six lignes, le reste est compté en contrôles, pas en codes (revue, M3).
function checkLines(checks: Pick<CheckEntry, "severity" | "code">[]): Line[] {
  const counts = new Map<string, number>();
  checks.forEach((c) => { const key = c.severity + " · " + c.code; counts.set(key, (counts.get(key) || 0) + 1); });
  const rank = (key: string): number => SEVERITY_RANK[key.split(" · ")[0]];
  const rows = Array.from(counts.keys()).sort((x, y) => rank(x) - rank(y) || (x < y ? -1 : x > y ? 1 : 0));
  const lines = rows.slice(0, MAX_CHECK_LINES).map((key) =>
    line(cell(key + ((counts.get(key) as number) > 1 ? " ×" + counts.get(key) : ""), "severity-" + key.split(" · ")[0])));
  const rest = rows.slice(MAX_CHECK_LINES).reduce((sum, key) => sum + (counts.get(key) as number), 0);
  if (rest) lines.push(line(cell("… et " + rest + " autre" + (rest > 1 ? "s" : "") + " contrôle" + (rest > 1 ? "s" : ""), "tip-muted")));
  return lines;
}

// Ce que le diff dit de l'élément, en une ligne : ajouté, retiré, ou les chemins changés (quatre au plus).
const DIFF_WORD: Record<string, string> = { added: "ajouté dans cette run", removed: "retiré depuis la run d'avant", changed: "changé" };
function diffLine(change: Pick<Change, "kind"> & Partial<Change> | null): Line | null {
  if (!change) return null;
  const fields = change.fields || [];
  const paths = change.kind === "changed" ? " : " + fields.slice(0, 4).map((f) => f.path).join(", ") + (fields.length > 4 ? "…" : "") : "";
  return line(cell(DIFF_WORD[change.kind] + paths, "tip-diff-" + change.kind));
}

function sourcesText(sources: string[]): string {
  const ordered = SOURCE_ORDER.filter((src) => sources.includes(src)).concat(sources.filter((src) => !SOURCE_ORDER.includes(src)));
  return ordered.map((src) => SOURCE_LABEL[src] || src).join(" + ");
}

const present = (candidate: Line | null): candidate is Line => candidate !== null;

// Une ligne par caractéristique, seulement si au moins un bout l'a ; l'état à part, connu de tout bout présent.
export function linkLines(model: Model, link: ModelLink): Line[] {
  const ends = [link.a, link.b];
  const facts = ends.map((end) => endFacts(model, end, link.ghost));
  const row = (label: string, key: "speed" | "duplex" | "media" | "state"): Line | null => (facts.some((f) => f[key] !== null)
    ? line(cell(label, "tip-muted"), ...facts.map((f) => cell(f[key] === null ? DASH : f[key]))) : null);
  const traits = [row("vitesse", "speed"), row("duplex", "duplex"), row("média", "media")].filter(present);
  return [
    line(cell(endLabel(link.a) + " ↔ " + endLabel(link.b), "tip-title")),
    line(cell(STATUS_LABEL[link.status] + " · " + sourcesText(link.sources) + " · " + link.raw.oper, "tip-muted")),
    diffLine(link.ghost ? { kind: "removed" } : model.changeOf("link", link.id)),
    ...ends.filter((end, index) => !facts[index].present).map((end) => line(cell(endLabel(end) + " : absent de interfaces[]", "tip-muted"))),
    ...ends.filter((end, index) => facts[index].ghost).map((end) => line(cell(endLabel(end) + " : interface retirée, valeurs de la run d'avant", "tip-muted"))),
    line(cell(""), cell(link.a.interface, "tip-muted"), cell(link.b.interface, "tip-muted")),
    ...(traits.length ? traits : [line(cell("vitesse, duplex, média : aucune valeur", "tip-muted"))]),
    row("état", "state"),
    ...checkLines(link.checks),
  ].filter(present);
}

const memberText = (member: HaClusterMember): string => member.role + " · " + member.state
  + (member.priority !== null && member.priority !== undefined ? " · priorité " + member.priority : "");

export function nodeLines(model: Model, node: ModelNode): Line[] {
  const memberships = model.haMembershipsByHost.get(node.hostname) || [];
  const links = (model.linksByNode.get(node.hostname) || []).filter((l) => !l.ghost);
  const ghosts = (model.linksByNode.get(node.hostname) || []).length - links.length;
  const hardware = [node.vendor, node.model].filter(Boolean).join(" · ");
  const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
  const facts = [node.collection ? "collecte : " + node.collection : null, plural(links.length, "câble") + (ghosts ? " · " + plural(ghosts, "câble retiré") : ""),
    node.stack ? "stack ×" + node.stack.member_count : null,
    node.evidence && node.evidence.capabilities.length ? "capacités : " + node.evidence.capabilities.join(", ") : null].filter(Boolean);
  return [
    line(cell(node.hostname + " · " + KIND_LABEL[node.kind] + (node.type ? " · " + node.type : ""), "tip-title")),
    diffLine(node.ghost ? { kind: "removed" } : model.changeOf("node", node.hostname)),
    hardware || system ? line(cell([hardware, system].filter(Boolean).join(" · "), "tip-muted")) : null,
    line(cell(facts.join(" · "), "tip-muted")),
    ...memberships.map((ha) => line(cell(clusterLabel(ha.cluster) + " · " + memberText(ha.member)))), // tous ses clusters (revue, B4)
    ...checkLines(model.checksByNode.get(node.hostname) || []),
  ].filter(present);
}

// Le titre nomme les deux équipements : deux faisceaux d'un même agrégat vers deux voisins ne se confondent pas (revue, M2).
export function beamLines(beam: Pick<Beam, "a" | "b" | "known" | "links" | "degraded" | "peerLink" | "mlags" | "checks">): Line[] {
  const nature = beamLabel(beam, false);
  const protocols = Array.from(new Set(beam.known.map((agg) => agg.raw.protocol + (agg.raw.lacp_mode ? " " + agg.raw.lacp_mode : ""))));
  return [
    line(cell("faisceau " + endLabel({ hostname: beam.a.hostname, interface: beam.a.aggregate }) + " ⇄ "
      + endLabel({ hostname: beam.b.hostname, interface: beam.b.aggregate }) + (nature ? " · " + nature : ""), "tip-title")),
    line(cell(plural(beam.links.length, "câble") + (protocols.length ? " · " + protocols.join(" / ") : "") + (beam.degraded ? " · un agrégat dégradé" : ""), "tip-muted")),
    ...checkLines(beam.checks),
  ];
}

export function clusterLines(cluster: Cluster): Line[] {
  return [
    line(cell(clusterLabel(cluster), "tip-title")),
    ...cluster.raw.members.map((m) => line(cell(m.hostname), cell(memberText(m), "tip-muted"))),
    ...checkLines(cluster.checks),
  ];
}

export interface Tip { group: SVGGElement; id: string; show: (key: string, linesOf: () => Line[], x: number, y: number, rect: { width: number; height: number }) => void; hide: () => void }

// La bulle elle-même. `show` reçoit une clé (l'élément survolé) et une fabrique de lignes : les lignes ne sont
// reconstruites que quand l'élément change, pas à chaque mouvement du pointeur.
export function create(svg: SVGSVGElement): Tip {
  const box = s("rect", { class: "tip-box", rx: 5 });
  const group = s("g", { class: "tip", visibility: "hidden", role: "tooltip", id: "ld-tip" }, box);
  svg.appendChild(group);
  let shownFor: string | null = null, size = { width: 0, height: 0 };

  // Les colonnes se mesurent sur les lignes à plusieurs cellules ; une ligne à une cellule s'étend sur toute la
  // largeur sans peser sur les colonnes (un titre long n'écarte pas le tableau).
  function fill(lines: Line[]): void {
    clear(group).appendChild(box);
    const widths: number[] = [0];
    lines.filter((cells) => cells.length > 1).forEach((cells) => cells.forEach((c, col) => { widths[col] = Math.max(widths[col] || 0, c.text.length); }));
    const offsets = widths.map((_, col) => widths.slice(0, col).reduce((sum, w) => sum + w * CHAR_W + GAP, 0));
    lines.forEach((cells, row) => cells.forEach((c, col) => {
      if (c.text === "") return;
      group.appendChild(s("text", { class: "tip-line" + (c.cls ? " " + c.cls : ""), x: PAD_X + offsets[col], y: PAD_Y + LINE_H * (row + 1) - 4 }, c.text));
    }));
    const last = widths.length - 1;
    const spanning = Math.max(0, ...lines.filter((cells) => cells.length === 1).map((cells) => cells[0].text.length));
    size = { width: 2 * PAD_X + Math.max(offsets[last] + widths[last] * CHAR_W, spanning * CHAR_W), height: 2 * PAD_Y + LINE_H * lines.length };
    box.setAttribute("width", String(size.width));
    box.setAttribute("height", String(size.height));
  }

  // Près du pointeur, du côté où il reste de la place, et jamais hors du canevas, d'aucun côté (revue, B2).
  function place(x: number, y: number, rect: { width: number; height: number }): void {
    const wanted = { x: x + OFFSET + size.width > rect.width ? x - OFFSET - size.width : x + OFFSET,
      y: y + OFFSET + size.height > rect.height ? y - OFFSET - size.height : y + OFFSET };
    const left = Math.max(0, Math.min(wanted.x, rect.width - size.width));
    const top = Math.max(0, Math.min(wanted.y, rect.height - size.height));
    group.setAttribute("transform", `translate(${Math.round(left)},${Math.round(top)})`);
  }

  function show(key: string, linesOf: () => Line[], x: number, y: number, rect: { width: number; height: number }): void {
    if (key !== shownFor) {
      shownFor = key;
      fill(linesOf());
    }
    place(x, y, rect);
    group.setAttribute("visibility", "visible");
  }

  function hide(): void {
    shownFor = null;
    group.setAttribute("visibility", "hidden");
  }

  return { group, id: "ld-tip", show, hide };
}

export const tip = { create, linkLines, nodeLines, beamLines, clusterLines };
