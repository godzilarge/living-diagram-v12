// L'inspecteur : pour un câble, d'où il vient (chaque évidence : qui témoigne, ce qu'il annonce, comment le nom
// a été résolu) ; pour un équipement, sa fiche, sa couverture de collecte, ses ports. Tout est lu, rien n'est calculé.
import { clear, h } from "../canvas/dom";
import type { Child } from "../canvas/dom";
import { brief, plain, speedText, whyText, KIND_LABEL, RESOLUTION_LABEL } from "../canvas/format";
import { beamLabel, clusterLabel } from "../canvas/geometry";
import { aggregateKey, aggregateOf, beamOf, clusterOf, endLabel, entityOf, ifaceKey, interfaceAt, OBSERVED } from "../canvas/model";
import type { Change, Model, ModelInterface, ModelLink, ModelNode, Selection } from "../canvas/types";
import type { Endpoint, LinkEvidence, SnapshotInterface } from "../contracts/snapshot";
import { checkList } from "./checks";
import type { OnSelect } from "./checks";
import { aggregateButton, aggregatePanel, beamButton, beamPanel, clusterPanel, nodeStructures } from "./structures";
import { definition, diffPill, pill, sourcePill, statusPill, table } from "./widgets";

export type { OnSelect };

// Ce que le diff dit de l'élément : ajouté dans cette run ; retiré depuis la run d'avant (la fiche le montre alors
// tel qu'il était) ; ou ses champs changés, avant → après. Rien quand la page n'a pas de diff.
function changeOf(model: Model, kind: "node" | "link", id: string, ghost: boolean | undefined): Change | null {
  if (ghost) return { kind: "removed", fields: [] };
  return model.changeOf ? model.changeOf(kind, id) : null;
}
function diffBlock(model: Model, change: Change | null, what: string): Child {
  if (!change || !model.diff) return null;
  const before = model.diff.before.collector_run_id;
  if (change.kind === "added") return h("p", { class: "diff-note diff-added" }, "Ajouté : ce " + what + " n'était pas dans la run " + before + ".");
  if (change.kind === "removed") return h("p", { class: "diff-note diff-removed" }, "Retiré : ce " + what + " était dans la run " + before + " et n'est plus dans celle-ci ; la fiche le montre tel qu'il était.");
  return [h("h4", { class: "section" }, "Changements depuis la run " + before),
    definition(change.fields.map((f) => [f.path, brief(f.before) + " → " + brief(f.after)]))];
}

function evidenceCard(evidence: LinkEvidence): HTMLElement {
  const observed = OBSERVED[evidence.source];
  const raw = evidence.remote_raw, resolved = evidence.remote_resolved;
  const renamed = raw.port !== null && resolved.interface !== null && raw.port !== resolved.interface;
  return h("li", { class: "evidence " + (observed ? "observed" : "documented") },
    h("div", { class: "evidence-head" }, sourcePill(evidence.source), h("span", { class: "muted" }, observed ? "observé" : "documenté")),
    definition([
      ["témoin", endLabel(evidence.witness)],
      ["il annonce", raw.name + " · " + (raw.port === null ? "sans port" : raw.port)],
      ["résolu en", resolved.hostname + " · " + (resolved.interface === null ? "port non précisé" : resolved.interface)],
      ["résolution du nom", RESOLUTION_LABEL[evidence.resolution] || evidence.resolution],
      renamed ? ["nom de port", "normalisé par B1 (R1) : " + raw.port + " → " + resolved.interface] : null,
    ]));
}

// La carte d'un bout de câble : les faits de cette run ; pour un câble retiré seulement, ceux de la run d'avant quand
// le port n'est plus collecté, en le disant (revue, H1).
function portCard(model: Model, end: Endpoint, aggregate: string | null, removed: boolean): HTMLElement {
  const found = interfaceAt(model, end.hostname, end.interface, removed);
  const title = h("h4", {}, endLabel(end));
  if (!found) return h("div", { class: "port" }, title, h("p", { class: "muted" }, "Port absent de interfaces[] : équipement non collecté, ou nom tel qu'annoncé par le voisin."));
  const itf = found.itf;
  const parsed = itf.description_parsed;
  return h("div", { class: "port" }, title,
    found.ghost ? h("p", { class: "muted diff-removed" }, "Interface retirée depuis la run d'avant : valeurs telles qu'elles étaient.") : null,
    definition([
    ["état", itf.oper_status + " (admin " + itf.admin_status + ")" + (itf.oper_reason ? " · " + itf.oper_reason : "")],
    ["type · vitesse", itf.type + (itf.speed_mbps ? " · " + speedText(itf.speed_mbps) : "") + (itf.duplex ? " · " + itf.duplex : "")],
    ["média", itf.media],
    ["agrégat", aggregate || (itf.aggregate ? itf.aggregate.name + (itf.aggregate.member_status ? " (" + itf.aggregate.member_status + ")" : "") : null)],
    ["rôles", itf.roles.length ? itf.roles.join(", ") : null],
    ["description brute", itf.description === null ? "(aucune)" : h("code", { class: "wrap" }, itf.description)],
    ["description lue", parsed ? "criticité " + parsed.criticality + " · voisin " + parsed.neighbor + " · port " + plain(parsed.port) + (parsed.options ? " · " + parsed.options : "")
      : (itf.description ? "non lue par la grammaire criticité|voisin|port|options" : null)],
    ["mode · VLAN", itf.switchport_mode ? itf.switchport_mode + vlanText(itf) : null],
    ["MAC", itf.mac_address], ["IP", itf.ip_addresses.length ? itf.ip_addresses.map((ip) => ip.address + "/" + ip.prefix).join(", ") : null],
  ]));
}

function vlanText(itf: SnapshotInterface): string {
  if (itf.access_vlan) return " · access " + itf.access_vlan;
  if (itf.native_vlan || itf.allowed_vlans) {
    const allowed = itf.allowed_vlans ? itf.allowed_vlans.map((r) => (r.first === r.last ? String(r.first) : r.first + "-" + r.last)).join(",") : "?";
    return " · natif " + plain(itf.native_vlan) + " · autorisés " + (allowed || "aucun");
  }
  return "";
}

// Les agrégats des deux bouts, cliquables quand le snapshot a leur document.
function aggregateEnds(model: Model, link: ModelLink, onSelect: OnSelect): Child {
  const raw = link.raw;
  const ends = ([[raw.a.hostname, raw.aggregate_a], [raw.b.hostname, raw.aggregate_b]] as [string, string | null][]).filter((end): end is [string, string] => end[1] !== null);
  if (!ends.length) return null;
  return h("span", {}, ends.map(([hostname, name], index) => {
    const aggregate = model.aggregateByKey.get(aggregateKey(hostname, name));
    return [index ? " · " : null, aggregate ? aggregateButton(aggregate, onSelect) : hostname + " · " + name];
  }));
}

function linkPanel(model: Model, link: ModelLink, onSelect: OnSelect): Child[] {
  const raw = link.raw;
  const why = whyText(link);
  const change = changeOf(model, "link", link.id, link.ghost);
  return [
    h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "câble"), statusPill(link.status),
      raw.oper === "down" ? pill("oper", "down", "down") : null, change ? diffPill(change.kind) : null),
    h("h3", { class: "ends" },
      h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: raw.a.hostname }) }, raw.a.hostname), " · " + raw.a.interface,
      h("span", { class: "arrow" }, " ↔ "),
      h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: raw.b.hostname }) }, raw.b.hostname), " · " + raw.b.interface),
    h("p", { class: "why" }, why),
    diffBlock(model, change, "câble"),
    definition([["état", raw.oper], ["vitesse commune", raw.speed_mbps ? speedText(raw.speed_mbps) : "différente ou inconnue"],
      ["agrégats", aggregateEnds(model, link, onSelect)], ["faisceau", link.beam ? beamButton(link.beam, onSelect) : null]]),
    h("h4", { class: "section" }, "Sources : " + raw.evidence.length + " évidence" + (raw.evidence.length > 1 ? "s" : "")),
    h("ul", { class: "evidences" }, raw.evidence.map((e) => evidenceCard(e))),
    h("h4", { class: "section" }, "Contrôles liés"), checkList(model, link.checks, onSelect),
    link.portChecks.length ? [h("h4", { class: "section" }, "Contrôles d'un port partagé avec d'autres câbles"),
      h("p", { class: "muted" }, "Ils visent un port qui porte plusieurs câbles, sans dire lequel : ils ne sont pas comptés sur celui-ci."),
      checkList(model, link.portChecks, onSelect)] : null,
    h("h4", { class: "section" }, "Les deux ports"),
    portCard(model, raw.a, raw.aggregate_a, link.ghost), portCard(model, raw.b, raw.aggregate_b, link.ghost),
  ];
}

function coverageRow(model: Model, hostname: string): Child {
  const coverage = model.coverage.find((c) => c.hostname === hostname);
  if (!coverage) return null;
  return h("div", { class: "topic-row" }, Object.entries(coverage.topics).map(([topic, status]) => pill("topic", status, topic + " : " + status)));
}

const facingOf = (model: Model, itf: { hostname: string; name: string }): string => (model.linksByIface.get(ifaceKey(itf.hostname, itf.name)) || [])
  .map((l) => endLabel(l.a.hostname === itf.hostname && l.a.interface === itf.name ? l.b : l.a) + (l.ghost ? " (retiré)" : "")).join(", ");

// « Pourquoi ce port up n'a-t-il rien en face ? » : la question de qui met au point un exportateur. La colonne
// câble est une jointure sur le snapshot ; le filtre ne garde que les ports physiques up sans câble.
function interfaceTable(model: Model, ifaces: SnapshotInterface[]): Child[] {
  const holder = h("div", {});
  const cabled = (itf: SnapshotInterface): ModelLink[] => model.linksByIface.get(ifaceKey(itf.hostname, itf.name)) || [];
  const lonely = ifaces.filter((itf) => (itf.type === "physical" || itf.type === "management") && itf.oper_status === "up" && !cabled(itf).some((l) => !l.ghost));
  const draw = (only: boolean): void => {
    const rows = (only ? lonely : ifaces).map((itf) => {
      const facing = facingOf(model, itf);
      return { cells: [itf.name, itf.type, itf.oper_status, facing || "—", itf.description === null ? "" : h("code", { class: "wrap" }, itf.description)] };
    });
    clear(holder).appendChild(table(["nom", "type", "état", "câble vers", "description"], rows, { empty: only ? "aucun port physique up sans câble" : "aucune interface collectée" }));
  };
  draw(false);
  return [h("label", { class: "check-field" }, h("input", { type: "checkbox", onchange: (e: Event) => draw((e.target as HTMLInputElement).checked) }),
    "seulement les ports physiques up sans câble (" + lonely.length + ")"), holder];
}

// Les interfaces retirées depuis la run d'avant (ou toutes celles d'un équipement lui-même retiré), telles qu'elles
// étaient : marquées, hors du compte « Interfaces : N » et du filtre « up sans câble » (revue, H1).
function ghostInterfaceTable(model: Model, gone: ModelInterface[]): HTMLElement {
  const rows = gone.map((itf) => ({ cells: [diffPill("removed"), itf.name, itf.type, itf.oper_status, facingOf(model, itf) || "—"] as Child[] }));
  return table(["changement", "nom", "type", "état (run d'avant)", "câble vers"], rows, { empty: "aucune" });
}

function nodePanel(model: Model, node: ModelNode, onSelect: OnSelect, extra: Child): Child[] {
  const links = model.linksByNode.get(node.hostname) || [];
  const gone = links.filter((l) => l.ghost).length; // les câbles retirés sont listés, marqués, hors du compte (revue, M4)
  const ifaces = model.ifacesByNode.get(node.hostname) || [];
  const ghostIfaces = model.ghostIfacesByNode.get(node.hostname) || [];
  const seen = node.evidence ? node.evidence.seen_by : [];
  const change = changeOf(model, "node", node.hostname, node.ghost);
  return [
    h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, KIND_LABEL[node.kind]),
      node.collection ? pill("collection", node.collection, "collecte : " + node.collection) : null, change ? diffPill(change.kind) : null),
    h("h3", {}, node.hostname),
    diffBlock(model, change, "équipement"),
    definition([
      ["type", node.type], ["constructeur · modèle", [node.vendor, node.model].filter(Boolean).join(" · ") || null],
      ["système", [node.os_name, node.os_version].filter(Boolean).join(" ") || null], ["série", node.serial_number], ["site", node.site],
      ["nom annoncé", node.reported_hostname], ["contextes virtuels", node.virtual_contexts.length ? node.virtual_contexts.join(", ") : null],
      ["stack", node.stack ? node.stack.member_count + " membres : " + node.stack.members.map((m) => m.slot + " " + m.role).join(", ") : null],
      ["capacités annoncées", node.evidence && node.evidence.capabilities.length ? node.evidence.capabilities.join(", ") : null],
    ]),
    node.kind === "device" ? [h("h4", { class: "section" }, "Couverture de la collecte"), coverageRow(model, node.hostname)] : null,
    seen.length ? [h("h4", { class: "section" }, "Vu par"), h("ul", { class: "plain" }, seen.map((w) => h("li", {}, sourcePill(w.source), " ", endLabel(w))))] : null,
    h("h4", { class: "section" }, "Câbles : " + (links.length - gone) + (gone ? " · " + gone + " retiré" + (gone > 1 ? "s" : "") : "")),
    table(["port local", "en face"], links.map((link) => {
      const local = link.a.hostname === node.hostname ? link.a : link.b, remote = local === link.a ? link.b : link.a;
      return { onclick: () => onSelect({ kind: "link", id: link.id }), cells: [local.interface, [h("div", {}, endLabel(remote)), h("div", {}, link.ghost ? diffPill("removed") : null, statusPill(link.status), link.sources.map(sourcePill))]] as Child[] };
    }), { empty: "aucun câble" }),
    nodeStructures(model, node.hostname, onSelect),
    extra,
    h("h4", { class: "section" }, "Contrôles"), checkList(model, model.checksByNode.get(node.hostname) || [], onSelect),
    node.ghost ? null : [h("h4", { class: "section" }, "Interfaces : " + ifaces.length), interfaceTable(model, ifaces)],
    ghostIfaces.length ? [h("h4", { class: "section" }, (node.ghost ? "Interfaces telles qu'elles étaient : " : "Interfaces retirées depuis la run d'avant : ") + ghostIfaces.length),
      ghostInterfaceTable(model, ghostIfaces)] : null,
  ];
}

// La vue d'ensemble ne répète pas les comptes de l'en-tête : elle dit ce qu'il ne dit pas, et comment lire la page.
function overview(model: Model): Child[] {
  return [
    h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "vue d'ensemble")),
    h("p", { class: "why" }, "Cliquer un câble montre ses sources ; cliquer un équipement montre sa fiche. Survoler un câble donne vitesse, duplex, média et état "
      + "des deux bouts. Glisser un équipement le déplace, la molette zoome, Tab parcourt les éléments."),
    definition([
      ["voisins inconnus", (model.kindCounts.get("stub") || 0) + " (masqués par défaut)"],
      ["agrégats", String(model.aggregates.length)], ["faisceaux", model.beams.length + " (bandes sous les câbles)"],
      ["domaines MLAG", String(model.mlagDomains.length)], ["clusters HA", model.clusters.length + " (cadres autour des membres)"],
    ]),
  ];
}

// Une ligne pour la zone live : ce qui vient d'être sélectionné, pour un lecteur d'écran, sans lui lire tout le panneau.
const KIND_WORD: Record<string, string> = { link: "câble", node: "équipement", aggregate: "agrégat", beam: "faisceau", cluster: "cluster HA", group: "groupe", annotation: "annotation", connector: "connecteur" };
export function describe(model: Model, selection: Selection | null): string {
  if (!selection || !entityOf(model, selection)) return "";
  const label = ((): string => {
    switch (selection.kind) {
      case "link": { const link = model.linkById.get(selection.id) as ModelLink; return endLabel(link.a) + " ↔ " + endLabel(link.b); }
      case "node": return (model.nodeByHost.get(selection.id) as ModelNode).hostname;
      case "aggregate": { const agg = aggregateOf(model, selection); return agg ? agg.hostname + " · " + agg.name : ""; }
      case "beam": { const beam = beamOf(model, selection); return beam ? beamLabel(beam, true) : ""; }
      case "group": { const group = model.groupById.get(selection.id); return group ? group.label : ""; }
      case "annotation": { const a = model.annotationById.get(selection.id); return a ? a.content.kind : ""; }
      case "connector": { const c = model.connectorById.get(selection.id); return c ? c.label || c.id : ""; }
      default: { const cluster = clusterOf(model, selection); return cluster ? clusterLabel(cluster) : ""; }
    }
  })();
  return KIND_WORD[selection.kind] + " " + label + " sélectionné";
}

/** `nodeExtra` : ce que la page ajoute à la fiche d'un équipement (son épingle, couche d'intention). */
export function show(container: HTMLElement, model: Model, selection: Selection | null, onSelect: OnSelect, nodeExtra?: (hostname: string) => Child): void {
  clear(container);
  let content: Child[] = overview(model);
  if (selection && selection.kind === "link" && model.linkById.has(selection.id)) content = linkPanel(model, model.linkById.get(selection.id) as ModelLink, onSelect);
  if (selection && selection.kind === "node" && model.nodeByHost.has(selection.id)) {
    content = nodePanel(model, model.nodeByHost.get(selection.id) as ModelNode, onSelect, nodeExtra ? nodeExtra(selection.id) : null);
  }
  const aggregate = aggregateOf(model, selection), beam = beamOf(model, selection), cluster = clusterOf(model, selection);
  if (aggregate) content = aggregatePanel(model, aggregate, onSelect);
  if (beam) content = beamPanel(model, beam, onSelect);
  if (cluster) content = clusterPanel(model, cluster, onSelect);
  container.appendChild(h("div", { class: "panel" }, content));
  container.scrollTop = 0;
  // Sous 900 px l'inspecteur est sous la toile : un panneau rempli hors écran ferait croire que le clic n'a rien fait.
  if (selection && typeof matchMedia === "function" && matchMedia("(max-width: 900px)").matches && container.scrollIntoView) container.scrollIntoView({ block: "start" });
}

export const inspect = { show, checkList, describe };
