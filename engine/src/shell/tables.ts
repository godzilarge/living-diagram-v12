// Les vues en tableaux : contrôles, qualité des données (la boucle de retour vers l'exportateur), sources,
// structures, diff.
import { clear, h } from "../canvas/dom";
import type { Child } from "../canvas/dom";
import { brief, elapsedText, plain, EVENT_LABEL, KIND_LABEL, STATUS_LABEL } from "../canvas/format";
import { aggregateKey, clusterId, endLabel, entityOf, linkId, SEVERITY_RANK } from "../canvas/model";
import type { CheckEntry, Model, Selection } from "../canvas/types";
import type { Diff, EntityChange } from "../contracts/diff";
import type { LinkRef } from "../contracts/snapshot";
import { definition, diffPill, pill, severityPill, sourcePill, statusPill, table } from "./widgets";
import type { TableRow } from "./widgets";

type OnSelect = (selection: Selection | null) => void;
const CHECK_HEADERS = ["sévérité", "code", "vise", "détails", "règle"];
const QUALITY_CODES = ["description_unparseable", "description_ha_unresolved", "description_disagrees_with_observed", "neighbor_unknown",
  "neighbor_name_ambiguous",
  "neighbor_name_case_differs", "neighbor_resolved_by_reported_hostname", "neighbor_resolved_by_address", "remote_port_is_mac",
  "remote_port_is_aggregate", "one_way_observation", "multiple_observed_neighbors", "self_observation"];

export interface Target { label: string; selection: Selection }

// Ce qu'un contrôle vise, sous une forme cliquable : un câble ou un équipement du graphe.
export function targetsOf(model: Model, check: Pick<CheckEntry, "refs">): Target[] {
  return check.refs.map((ref): Target => {
    if (ref.kind === "link") return { label: endLabel(ref.a) + " ↔ " + endLabel(ref.b), selection: { kind: "link", id: linkId(ref) } };
    if (ref.kind === "cluster") return { label: "cluster " + ref.members.join(" + "), selection: { kind: "cluster", id: clusterId(ref.members) } };
    if (ref.kind === "aggregate") return { label: ref.hostname + " · " + ref.name, selection: { kind: "aggregate", id: aggregateKey(ref.hostname, ref.name) } };
    const label = ref.kind === "interface" ? ref.hostname + " · " + ref.name : ref.hostname;
    return { label, selection: { kind: "node", id: ref.hostname } };
  }).filter((target) => entityOf(model, target.selection) !== null);
}

const refHost = (ref: CheckEntry["refs"][number]): string => ("hostname" in ref ? ref.hostname : "");

function targetCell(model: Model, check: CheckEntry, onSelect: OnSelect): Child {
  const targets = targetsOf(model, check);
  if (!targets.length) return plain(check.refs.map(refHost));
  return targets.map((t) => h("button", { class: "linklike", type: "button", onclick: () => onSelect(t.selection) }, t.label));
}

function checkRows(model: Model, checks: CheckEntry[], onSelect: OnSelect): TableRow[] {
  return checks.map((check) => ({ cells: [severityPill(check.severity), h("code", {}, check.code), targetCell(model, check, onSelect),
    Object.keys(check.details).length ? definition(Object.entries(check.details).map(([k, v]) => [k, plain(v)])) : "",
    check.origin === "bundle" ? "contrat d'entrée" : (model.catalogue[check.code] || { rule: "" }).rule || ""] }));
}

const byRank = (x: CheckEntry, y: CheckEntry): number => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || (x.code < y.code ? -1 : x.code > y.code ? 1 : 0) || x.index - y.index;

export interface ChecksHandle { setSeverity: (severity: string) => void }

export function checksView(container: HTMLElement, model: Model, onSelect: OnSelect): ChecksHandle {
  const state = { severity: "", code: "", text: "" };
  const codes = Array.from(new Set(model.checks.map((c) => c.code))).sort();
  const body = h("div", {});
  const draw = (): void => {
    const text = state.text.trim().toLowerCase();
    // Les plus graves d'abord, puis par code, puis dans l'ordre du snapshot : les erreurs ne sont jamais enterrées.
    const rows = model.checks.filter((c) => (!state.severity || c.severity === state.severity) && (!state.code || c.code === state.code)
      && (!text || JSON.stringify([c.refs, c.details]).toLowerCase().includes(text))).sort(byRank);
    clear(body).appendChild(h("p", { class: "muted" }, rows.length + " contrôle" + (rows.length > 1 ? "s" : "") + " sur " + model.checks.length));
    body.appendChild(table(CHECK_HEADERS, checkRows(model, rows, onSelect), { empty: "aucun contrôle ne correspond" }));
  };
  const select = (id: string, label: string, values: string[], key: "severity" | "code"): HTMLElement => h("label", { class: "field" }, label,
    h("select", { id, onchange: (e: Event) => { state[key] = (e.target as HTMLSelectElement).value; draw(); } }, h("option", { value: "" }, "tous"), values.map((v) => h("option", { value: v }, v))));
  clear(container).appendChild(h("div", { class: "page" },
    h("h2", {}, "Contrôles"),
    h("p", { class: "lead" }, "Un désaccord n'est jamais résolu en silence : il devient un contrôle. Cliquer une cible l'ouvre dans le graphe."),
    h("div", { class: "filters" }, select("f-severity", "sévérité", ["error", "warning", "info"], "severity"), select("f-code", "code", codes, "code"),
      h("label", { class: "field" }, "contient", h("input", { id: "f-text", type: "search", placeholder: "hostname, port…", oninput: (e: Event) => { state.text = (e.target as HTMLInputElement).value; draw(); } }))),
    glossary(model, codes), body));
  draw();
  // Les pastilles de l'en-tête (« 2 error ») ouvrent cette vue filtrée sur une sévérité : la page garde la poignée.
  return { setSeverity: (severity) => { state.severity = severity; const field = document.getElementById("f-severity") as HTMLSelectElement | null; if (field) field.value = severity; draw(); } };
}

function glossary(model: Model, codes: string[]): Child {
  if (!codes.length) return null;
  return h("details", { class: "glossary" }, h("summary", {}, "Sens des " + codes.length + " codes présents"),
    definition(codes.map((code) => [code, (model.catalogue[code] || { meaning: "" }).meaning || "(constat du contrat d'entrée)"])));
}

function coverageTable(model: Model): HTMLElement {
  const topics = model.coverage.length ? Object.keys(model.coverage[0].topics) : [];
  return table(["équipement", "collecte", ...topics], model.coverage.map((c) => {
    const statuses = c.topics as unknown as Record<string, string>;
    return { cells: [c.hostname, pill("collection", c.status, c.status), ...topics.map((t) => pill("topic", statuses[t], statuses[t]))] as Child[] };
  }), { empty: "aucun équipement dans le périmètre" });
}

function findingsTable(model: Model): HTMLElement {
  if (!model.ingest) return h("p", { class: "muted" }, "Rapport d'ingestion non disponible pour cette page.");
  return table(["code", "équipement", "objet", "détails", "message"], model.ingest.findings.map((f) => ({
    cells: [h("code", {}, f.code), f.hostname || "", f.ref || "", plain(f.details), f.message] as Child[] })), { empty: "aucun constat : la livraison respecte le contrat sans réserve" });
}

function counters(object: Record<string, unknown> | null | undefined, emptyText: string): HTMLElement {
  const entries = Object.entries(object || {});
  if (!entries.length) return h("p", { class: "muted" }, emptyText);
  return definition(entries.map(([k, v]) => [k, String(v)]));
}

export function qualityView(container: HTMLElement, model: Model, onSelect: OnSelect): void {
  const summary = model.ingest && model.ingest.summary;
  const dataChecks = model.checks.filter((c) => QUALITY_CODES.includes(c.code));
  const described = model.interfaces.filter((i) => i.description !== null && i.description !== "");
  clear(container).appendChild(h("div", { class: "page" },
    h("h2", {}, "Qualité des données"),
    h("p", { class: "lead" }, "Ce que la livraison dit d'elle-même et ce que B1 n'a pas su lire : de quoi corriger l'exportateur ou les descriptions d'interface."),
    h("h3", {}, "Couverture de la collecte, par équipement et par topic"), coverageTable(model),
    h("h3", {}, "La livraison"),
    summary ? definition(Object.entries(summary).filter(([k]) => k !== "residual_normalizations").map(([k, v]) => [k, String(v)])) : null,
    h("h3", {}, "Constats du contrat d'entrée"),
    h("p", { class: "muted" }, "Clés nullables oubliées (nullable_key_absent), interface locale inconnue, membre d'agrégat inconnu… Tout doit tendre vers zéro."),
    findingsTable(model),
    h("h3", {}, "Noms et descriptions que B1 a dû interpréter"),
    definition([["interfaces avec une description", described.length + " sur " + model.interfaces.length],
      ["descriptions non lues par la grammaire", String(model.report.unparseable_descriptions)],
      ["voisins finis en « inconnu »", model.report.unresolved_names.length ? model.report.unresolved_names.join(", ") : "aucun"]]),
    table(["sévérité", "code", "vise", "détails", "règle"], checkRows(model, dataChecks, onSelect), { empty: "aucun contrôle de nom ni de description" }),
    h("h3", {}, "Normalisations"),
    h("p", { class: "muted" }, "Résiduelles : ce que l'exportateur a dû normaliser lui-même (doit tendre vers zéro). Appliquées : ce que B1 a normalisé."),
    h("div", { class: "two" }, h("div", {}, h("h4", {}, "résiduelles (exportateur)"), counters(model.report.residual_normalizations, "aucune")),
      h("div", {}, h("h4", {}, "appliquées (B1)"), counters(model.report.applied_normalizations, "aucune")))));
}

export function sourcesView(container: HTMLElement, model: Model, onSelect: OnSelect): void {
  const state: { combo: { combo: string; status: string } | null; text: string } = { combo: null, text: "" };
  const body = h("div", {});
  const draw = (): void => {
    const text = state.text.trim().toLowerCase();
    const combo = state.combo;
    const rows = model.links.filter((l) => (combo === null || (l.combo === combo.combo && l.status === combo.status))
      && (!text || (endLabel(l.a) + " " + endLabel(l.b)).toLowerCase().includes(text)));
    clear(body).appendChild(h("p", { class: "muted" }, rows.length + " câble" + (rows.length > 1 ? "s" : "") + (combo ? " · " + combo.combo + " · " : "")
      , combo ? h("button", { class: "linklike", type: "button", onclick: () => { state.combo = null; draw(); } }, "tout afficher") : null));
    body.appendChild(table(["bout a", "bout b", "statut", "sources", "état", "contrôles"], rows.map((link) => ({
      onclick: () => onSelect({ kind: "link", id: link.id }),
      cells: [endLabel(link.a), endLabel(link.b), statusPill(link.status), link.sources.map(sourcePill), link.raw.oper, link.checks.length ? String(link.checks.length) : ""] as Child[] })), { empty: "aucun câble" }));
  };
  clear(container).appendChild(h("div", { class: "page" },
    h("h2", {}, "Sources des câbles"),
    h("p", { class: "lead" }, "Chaque câble est tracé par une ou plusieurs sources. LLDP et CDP observent, une description documente : l'observé dessine le lien, le documenté le commente."),
    table(["sources", "statut", "câbles"], model.combos.map((combo) => ({ onclick: () => { state.combo = combo; draw(); },
      cells: [combo.combo.split(" + ").map(sourcePill), statusPill(combo.status), String(combo.count)] as Child[] })), { empty: "aucun câble" }),
    h("h3", {}, "Tous les câbles"),
    h("div", { class: "filters" }, h("label", { class: "field" }, "équipement ou port",
      h("input", { id: "s-text", type: "search", placeholder: "hostname, port…", oninput: (e: Event) => { state.text = (e.target as HTMLInputElement).value; draw(); } }))),
    body));
  draw();
}

// Les structures de R4 en tableaux : ce que B1 a reconstruit, cliquable vers le graphe.
export function structuresView(container: HTMLElement, model: Model, onSelect: OnSelect): void {
  const memberText = (aggregate: Model["aggregates"][number]): string => aggregate.raw.members.map((m) => m.name + " (" + m.status + ")").join(", ");
  const mlagText = (aggregate: Model["aggregates"][number]): string => {
    const raw = aggregate.raw;
    if (raw.mlag_peer_link) return "peer-link";
    const id = raw.mlag_id !== null ? String(raw.mlag_id) : "";
    return raw.mlag_peer_link === null ? (id ? id + " · peer-link non lu" : "peer-link non lu") : id;
  };
  const aggregateRows: TableRow[] = model.aggregates.map((aggregate) => ({ onclick: () => onSelect({ kind: "aggregate", id: aggregate.key }),
    cells: [aggregate.hostname, aggregate.name, aggregate.raw.protocol + (aggregate.raw.lacp_mode ? " " + aggregate.raw.lacp_mode : ""), memberText(aggregate),
      String(aggregate.cables.length), pill("degraded", String(aggregate.raw.degraded), aggregate.raw.degraded ? "dégradé" : "complet"), mlagText(aggregate)] }));
  const domainRows: TableRow[] = model.mlagDomains.map((domain) => ({ onclick: () => onSelect(domain.members.length ? { kind: "aggregate", id: domain.members[0].key } : null),
    cells: [String(domain.raw.mlag_id), domain.raw.members.map((m) => m.hostname + " · " + m.aggregate).join(" + "),
      domain.raw.peer_link ? domain.raw.peer_link.hostname + " · " + domain.raw.peer_link.aggregate : "—", plain(domain.raw.downstream)] }));
  const clusterRows: TableRow[] = model.clusters.map((cluster) => ({ onclick: () => onSelect({ kind: "cluster", id: cluster.id }),
    cells: [plain(cluster.raw.cluster_name), pill("mode", cluster.raw.mode, cluster.raw.mode), cluster.raw.members.map((m) => m.hostname + " (" + m.role + ", " + m.state + ")").join(", "),
      cluster.heartbeats.map((hb) => hb.hostname + " · " + hb.interface + (hb.link ? "" : " (sans câble)")).join(", ") || "—"] }));
  clear(container).appendChild(h("div", { class: "page" },
    h("h2", {}, "Structures"),
    h("p", { class: "lead" }, "Ce que B1 a reconstruit au-dessus des câbles : agrégats (document aggregates de chaque équipement), domaines MLAG (deux agrégats de même identifiant, appariés par leur peer-link) et clusters HA (documents ha de leurs membres). Cliquer une ligne l'ouvre dans le graphe."),
    h("h3", {}, "Agrégats : " + model.aggregates.length),
    table(["équipement", "agrégat", "protocole", "membres", "câbles", "état", "MLAG"], aggregateRows, { empty: "aucun agrégat : aucun document aggregates dans le bundle" }),
    h("h3", {}, "Domaines MLAG : " + model.mlagDomains.length),
    table(["identifiant", "agrégats", "peer-link", "équipement aval"], domainRows, { empty: "aucun domaine MLAG" }),
    h("h3", {}, "Clusters HA : " + model.clusters.length),
    table(["cluster", "mode", "membres", "heartbeat"], clusterRows, { empty: "aucun cluster : aucun document ha dans le bundle" })));
}

// Le diff (B3) : ce qui a changé depuis la run d'avant, section par section, dans les mots du snapshot. Chaque ligne
// s'ouvre dans le graphe, les éléments retirés compris (fantômes). Le résumé vient du diff, rien n'est recompté ici.
const SECTION_LABEL = { nodes: "équipements", interfaces: "interfaces", links: "câbles", aggregates: "agrégats", mlag_domains: "domaines MLAG", ha_clusters: "clusters HA" } as const;
const total = (part: { added: number; removed: number; changed: number }): number => part.added + part.removed + part.changed;
const fieldsCell = (change: EntityChange): HTMLElement => definition(change.fields.map((f) => [f.path, brief(f.before) + " → " + brief(f.after)]));
const byHost = (items: { hostname: string }[]): string => {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(item.hostname, (counts.get(item.hostname) || 0) + 1));
  return Array.from(counts, ([host, n]) => host + " (" + n + ")").join(", ");
};
const mlagText = (domain: { mlag_id: number; members: { hostname: string; aggregate: string }[] }): string => "MLAG " + domain.mlag_id + " · " + domain.members.map((m) => m.hostname + " · " + m.aggregate).join(" + ");

function diffNodeRows(model: Model, d: Diff, onSelect: OnSelect): TableRow[] {
  const row = (kind: string, hostname: string, node: { kind: string; type: string | null } | undefined, change: EntityChange | null): TableRow => ({ onclick: () => onSelect({ kind: "node", id: hostname }),
    cells: [diffPill(kind), hostname, node ? KIND_LABEL[node.kind] : "", node ? plain(node.type) : "", change ? fieldsCell(change) : ""] });
  return [
    ...d.nodes.added.map((n) => row("added", n.hostname, n, null)),
    ...d.nodes.removed.map((n) => row("removed", n.hostname, n, null)),
    ...d.nodes.changed.flatMap((c) => (c.ref.kind === "node" ? [row("changed", c.ref.hostname, model.nodeByHost.get(c.ref.hostname), c)] : [])),
  ];
}

function diffLinkRows(model: Model, d: Diff, onSelect: OnSelect): TableRow[] {
  const row = (kind: string, ref: LinkRef | Diff["links"]["added"][number], change: EntityChange | null): TableRow => {
    const id = linkId(ref), live = model.linkById.get(id);
    return { onclick: () => onSelect({ kind: "link", id }),
      cells: [diffPill(kind), endLabel(ref.a), endLabel(ref.b),
        !live ? "" : live.ghost ? h("span", { class: "muted" }, "était " + STATUS_LABEL[live.status]) : statusPill(live.status), change ? fieldsCell(change) : ""] };
  };
  return [...d.links.added.map((l) => row("added", l, null)), ...d.links.removed.map((l) => row("removed", l, null)),
    ...d.links.changed.flatMap((c) => (c.ref.kind === "link" ? [row("changed", c.ref, c)] : []))];
}

function diffStructureRows(d: Diff, onSelect: OnSelect): TableRow[] {
  const aggregate = (kind: string, hostname: string, name: string, change: EntityChange | null): TableRow => ({ onclick: () => onSelect({ kind: "aggregate", id: aggregateKey(hostname, name) }),
    cells: [diffPill(kind), "agrégat", hostname + " · " + name, change ? fieldsCell(change) : ""] });
  const domain = (kind: string, ref: { mlag_id: number; members: { hostname: string; aggregate: string }[] }, change: EntityChange | null): TableRow => ({ cells: [diffPill(kind), "domaine MLAG", mlagText(ref), change ? fieldsCell(change) : ""] });
  const cluster = (kind: string, hosts: string[], change: EntityChange | null): TableRow => ({ onclick: () => onSelect({ kind: "cluster", id: clusterId(hosts) }),
    cells: [diffPill(kind), "cluster HA", hosts.join(" + "), change ? fieldsCell(change) : ""] });
  return [
    ...d.aggregates.added.map((a) => aggregate("added", a.hostname, a.name, null)),
    ...d.aggregates.removed.map((a): TableRow => ({ cells: [diffPill("removed"), "agrégat", a.hostname + " · " + a.name, ""] })),
    ...d.aggregates.changed.flatMap((c) => (c.ref.kind === "aggregate" ? [aggregate("changed", c.ref.hostname, c.ref.name, c)] : [])),
    ...d.mlag_domains.added.map((m) => domain("added", m, null)),
    ...d.mlag_domains.removed.map((m) => domain("removed", m, null)),
    ...d.mlag_domains.changed.flatMap((c) => (c.ref.kind === "mlag_domain" ? [domain("changed", c.ref, c)] : [])),
    ...d.ha_clusters.added.map((c) => cluster("added", c.members.map((m) => m.hostname), null)),
    ...d.ha_clusters.removed.map((c): TableRow => ({ cells: [diffPill("removed"), "cluster HA", c.members.map((m) => m.hostname).join(" + "), ""] })),
    ...d.ha_clusters.changed.flatMap((c) => (c.ref.kind === "cluster" ? [cluster("changed", c.ref.members, c)] : [])),
  ];
}

export function diffView(container: HTMLElement, model: Model, onSelect: OnSelect): void {
  const d = model.diff as Diff, s = d.summary;
  const openNode = (hostname: string) => () => onSelect({ kind: "node", id: hostname });
  const summaryRows: TableRow[] = (Object.entries(SECTION_LABEL) as [keyof typeof SECTION_LABEL, string][]).map(([name, label]) => ({ cells: [label, String(s[name].added), String(s[name].removed), String(s[name].changed)] }));
  const interfaceRows: TableRow[] = d.interfaces.changed.flatMap((c) => (c.ref.kind === "interface"
    ? [{ onclick: openNode(c.ref.hostname), cells: [diffPill("changed"), c.ref.hostname + " · " + c.ref.name, fieldsCell(c)] as Child[] }] : []));
  const coverageRows: TableRow[] = d.coverage.changed.flatMap((c) => (c.ref.kind === "node" ? [{ onclick: openNode(c.ref.hostname), cells: [c.ref.hostname, fieldsCell(c)] as Child[] }] : []));
  const eventRows: TableRow[] = d.events.flatMap((e) => {
    const ref = e.ref;
    if (ref.kind !== "node" && ref.kind !== "interface") return [];
    return [{ onclick: openNode(ref.hostname),
      cells: [pill("event", e.kind, EVENT_LABEL[e.kind] || e.kind), ref.kind === "node" ? ref.hostname : ref.hostname + " · " + ref.name, plain(e.details)] as Child[] }];
  });
  clear(container).appendChild(h("div", { class: "page" },
    h("h2", {}, "Diff"),
    h("p", { class: "lead" }, "De la run " + d.before.collector_run_id + " (" + d.before.start_datetime + ") à la run " + d.after.collector_run_id + " (" + d.after.start_datetime + "), "
      + elapsedText(d.elapsed_seconds) + ". Les équipements et câbles ajoutés, retirés ou changés sont peints dans le graphe ; cliquer une ligne l'y ouvre, un élément retiré compris."
      + " Les champs volatils (uptime, âge du dernier changement) ne comptent pas : " + s.volatile_changes + " différence" + (s.volatile_changes > 1 ? "s" : "") + " ignorée" + (s.volatile_changes > 1 ? "s" : "") + "."),
    table(["section", "ajoutés", "retirés", "changés"], summaryRows),
    h("h3", {}, "Équipements : " + total(s.nodes)),
    table(["changement", "équipement", "sorte", "type", "changements"], diffNodeRows(model, d, onSelect), { empty: "aucun équipement ajouté, retiré ni changé" }),
    h("h3", {}, "Câbles : " + total(s.links)),
    table(["changement", "bout a", "bout b", "statut", "changements"], diffLinkRows(model, d, onSelect), { empty: "aucun câble ajouté, retiré ni changé" }),
    h("h3", {}, "Interfaces : " + total(s.interfaces)),
    definition([["ajoutées", d.interfaces.added.length ? byHost(d.interfaces.added) : null], ["retirées", d.interfaces.removed.length ? byHost(d.interfaces.removed) : null]]),
    table(["changement", "interface", "changements"], interfaceRows, { empty: "aucune interface changée" }),
    h("h3", {}, "Structures : " + (total(s.aggregates) + total(s.mlag_domains) + total(s.ha_clusters))),
    table(["changement", "sorte", "élément", "changements"], diffStructureRows(d, onSelect), { empty: "aucune structure ajoutée, retirée ni changée" }),
    h("h3", {}, "Contrôles apparus : " + s.checks.appeared),
    table(CHECK_HEADERS, checkRows(model, d.checks.appeared.map(asEntry), onSelect), { empty: "aucun contrôle apparu" }),
    h("h3", {}, "Contrôles résolus : " + s.checks.resolved + " · persistants : " + s.checks.persisted),
    table(CHECK_HEADERS, checkRows(model, d.checks.resolved.map(asEntry), onSelect), { empty: "aucun contrôle résolu" }),
    h("h3", {}, "Couverture changée : " + s.coverage.changed),
    table(["équipement", "changements"], coverageRows, { empty: "aucun changement de couverture" }),
    h("h3", {}, "Événements : " + (s.events.rebooted + s.events.flapped)),
    h("p", { class: "muted" }, "Lus dans les champs volatils : un uptime plus court que l'écart entre les runs, c'est un redémarrage ; un âge de dernier changement plus court, à état égal, c'est un flap (le port a bougé puis est revenu au même état), sauf sur un équipement redémarré, dont le redémarrage explique les ports."),
    table(["sorte", "élément", "détails"], eventRows, { empty: "aucun redémarrage, aucun flap" })));
}

// Un contrôle du diff (apparu, résolu) lu comme une entrée du modèle : il n'a pas de rang dans cette run.
const asEntry = (check: Diff["checks"]["appeared"][number], index: number): CheckEntry => ({ index, ...check } as CheckEntry);

export const tables = { checksView, qualityView, sourcesView, structuresView, diffView, targetsOf };
