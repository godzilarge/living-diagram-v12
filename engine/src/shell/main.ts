// Démarrage : lit les données embarquées, monte l'en-tête, les onglets, la barre d'outils, le graphe.
import { clear, h, s } from "../canvas/dom";
import { elapsedText, STATUS_LABEL } from "../canvas/format";
import { create as createGraph } from "../canvas/graph";
import type { Drawn, Graph } from "../canvas/graph";
import { path as iconPath, LABEL as ICON_LABEL, TYPES as ICON_TYPES } from "../canvas/icons";
import { build, selectionFromToken, tokenOf, SELECTION_KINDS } from "../canvas/model";
import type { Model, PageData, Selection } from "../canvas/types";
import { apps } from "./apps";
import type { App, BootOptions, Placer, Writer } from "./apps";
import { describe, show } from "./inspect";
import { createIntentHost } from "./intent";
import { createPlacementHost } from "./placement";
import type { PlacementHost } from "./placement";
import { tables } from "./tables";
import type { ChecksHandle } from "./tables";
import { confirmable } from "./widgets";

type Tab = [string, string];
const BASE_TABS: Tab[] = [["graph", "Graphe"], ["structures", "Structures"], ["intent", "Intentions"], ["checks", "Contrôles"], ["quality", "Qualité des données"], ["sources", "Sources"]];
const STATUSES = ["confirmed", "observed_only", "documented_only"];
// L'onglet Diff n'existe que si la page embarque un diff (`ld render --from`, ou `/view?…&from=`).
const tabsFor = (model: Model): Tab[] => (model.diff ? [BASE_TABS[0], ["diff", "Diff"], ...BASE_TABS.slice(1)] : BASE_TABS);
type Status = (drawn?: Drawn | null) => void;
const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

// Une toile neuve, aux mêmes attributs : les écouteurs que le graphe d'avant avait posés sur le `svg` partent avec
// lui, rien ne s'accumule quand on passe de run en run.
function renewCanvas(): void {
  const svg = byId("canvas");
  const parent = svg.parentNode;
  if (!parent) return;
  const fresh = s("svg", {});
  svg.getAttributeNames().forEach((name) => fresh.setAttribute(name, svg.getAttribute(name) as string));
  parent.replaceChild(fresh, svg);
}

function toggleStatus(graph: Graph, status: Status, st: string): void {
  const hidden = graph.state.hiddenStatuses;
  if (hidden.has(st)) hidden.delete(st); else hidden.add(st);
  status(graph.render(true));
}

// La pastille de la couche d'intention : ses épingles, et celles qui n'ont plus d'équipement dans cette run.
function intentChipText(model: Model): string {
  const orphans = model.orphanPins.length;
  return model.pinByHost.size + " épingle" + (model.pinByHost.size > 1 ? "s" : "") + (orphans ? " · " + orphans + " orpheline" + (orphans > 1 ? "s" : "") : "");
}

// L'en-tête : l'identité de la run sur une ligne, ses métadonnées sur une seconde ; puis les comptes en trois groupes,
// dont les statuts (bascules, comme la légende) et les sévérités (ouvrent les contrôles filtrés). Rien n'y est inerte.
function header(model: Model, graph: Graph, status: Status, openChecks: (severity: string) => void, openTab: (id: string) => void): void {
  const run = model.source.run, source = model.source;
  const meta = clear(byId("run-meta"));
  meta.appendChild(h("div", { class: "run-line" }, h("strong", {}, source.infrastructure), " · run ", h("code", {}, source.collector_run_id)));
  meta.appendChild(h("div", { class: "run-detail" }, "collecte du " + run.start_datetime + (run.end_datetime ? " au " + run.end_datetime : "") + " (" + run.status + ")",
    " · bundle ", h("code", {}, source.bundle_sha256.slice(0, 12)), " · ", h("span", { class: "file" }, model.origin)));
  if (model.diff) {
    const before = model.diff.before;
    meta.appendChild(h("div", { class: "run-diff" }, "comparée à la run ", h("code", {}, before.collector_run_id), " du " + before.start_datetime
      + " · " + elapsedText(model.diff.elapsed_seconds)));
  }
  const count = (map: Map<string, number>, key: string): number => map.get(key) || 0;
  const statusChip = (st: string): HTMLElement => h("button", { type: "button", id: "c-" + st, class: "chip pill status-" + st, "aria-pressed": "true", title: "afficher ou masquer ces câbles",
    onclick: () => toggleStatus(graph, status, st) }, count(model.statusCounts, st) + " " + STATUS_LABEL[st]);
  const severityChip = (sev: string): HTMLElement => h("button", { type: "button", id: "c-" + sev, class: "chip pill severity-" + sev, title: "ouvrir les contrôles " + sev,
    onclick: () => openChecks(sev) }, count(model.severityCounts, sev) + " " + sev);
  const diffChip = (): HTMLElement | null => {
    if (!model.diff) return null;
    const sum = model.diff.summary.links;
    return h("span", { class: "chip-group" }, h("button", { type: "button", id: "c-diff", class: "chip diff-chip", title: "ouvrir le diff", onclick: () => openTab("diff") },
      "diff · câbles +" + sum.added + " −" + sum.removed + " ~" + sum.changed));
  };
  const intentChip = (): HTMLElement | null => (model.intent
    ? h("span", { class: "chip-group" }, h("button", { type: "button", id: "c-intent", class: "chip intent-chip", title: "ouvrir les intentions", onclick: () => openTab("intent") }, intentChipText(model)))
    : null);
  clear(byId("run-counts")).appendChild(h("div", { class: "chips" },
    h("span", { class: "chip-group" }, h("span", { class: "chip" }, model.nodes.length + " nœuds"), h("span", { class: "chip" }, model.links.length + " câbles")),
    h("span", { class: "chip-group" }, STATUSES.map(statusChip)),
    h("span", { class: "chip-group" }, ["error", "warning", "info"].map(severityChip)),
    diffChip(), intentChip()));
}

function toolbar(model: Model, graph: Graph, status: Status, placements: PlacementHost): void {
  const stubs = model.kindCounts.get("stub") || 0;
  // Les stubs changent le placement (recadrer) ; les noms des ports ne demandent qu'un repeint ; les changements
  // ajoutent ou retirent les fantômes sans bouger la vue.
  type Flag = "showStubs" | "showPorts" | "showDiff";
  const redraw: Record<Flag, () => Drawn | null> = { showStubs: () => graph.render(false), showPorts: () => (graph.repaint(), null), showDiff: () => graph.render(true) };
  const toggle = (id: string, label: string, key: Flag): HTMLElement => h("label", { class: "check-field" },
    h("input", { id, type: "checkbox", checked: graph.state[key] || null, onchange: (e: Event) => { graph.state[key] = (e.target as HTMLInputElement).checked; status(redraw[key]()); } }), label);
  clear(byId("graph-toolbar")).appendChild(h("div", { class: "toolbar-row" },
    toggle("t-stubs", "voisins inconnus (" + stubs + ")", "showStubs"), toggle("t-ports", "noms des ports", "showPorts"),
    model.diff ? toggle("t-diff", "changements (" + model.diffCount + ")", "showDiff") : null,
    h("input", { id: "t-search", type: "search", placeholder: "chercher un équipement", "aria-label": "chercher un équipement",
      oninput: (e: Event) => { graph.state.query = (e.target as HTMLInputElement).value; graph.repaint(); } }),
    h("button", { type: "button", onclick: () => graph.fit() }, "recentrer"),
    h("button", { type: "button", id: "t-legend", "aria-pressed": "true", title: "afficher ou masquer la légende", onclick: (e: Event) => {
      const legend = byId("graph-legend");
      legend.hidden = !legend.hidden;
      (e.target as HTMLElement).setAttribute("aria-pressed", legend.hidden ? "false" : "true");
    } }, "légende"),
    // « Replacer » renouvelle le placement mémorisé : dans une page servie, c'est pour tout le monde, donc confirmé.
    placements.needsConfirmation()
      ? confirmable("replacer", () => status(graph.replaceAll()), { title: placements.replaceTitle() })
      : h("button", { type: "button", title: placements.replaceTitle(), onclick: () => status(graph.replaceAll()) }, "replacer"),
    h("span", { class: "muted", id: "graph-status" })));
}

// La légende, en groupes nommés : chaque entrée a son nuancier, rien n'y est de la prose (l'aide est dans la vue d'ensemble).
function legend(model: Model, graph: Graph, status: Status): void {
  const item = (st: string): HTMLElement => h("button", { type: "button", id: "l-" + st, class: "legend-item status-" + st, "aria-pressed": "true", title: "afficher ou masquer ces câbles",
    onclick: () => toggleStatus(graph, status, st) }, h("span", { class: "swatch" }), STATUS_LABEL[st]);
  const span = (cls: string): HTMLElement => h("span", { class: cls });
  const note = (swatch: Element, text: string, title?: string): HTMLElement => h("span", { class: "legend-note", title: title || null }, swatch, text);
  const group = (name: string, ...items: (Element | Element[])[]): HTMLElement => h("span", { class: "legend-group" }, h("span", { class: "group-name" }, name), items);
  const icon = (type: string): SVGElement => s("svg", { class: "legend-icon", viewBox: "0 0 16 16", "aria-hidden": "true" }, s("path", { d: iconPath(type) }));
  clear(byId("graph-legend")).appendChild(h("div", { class: "legend-row" },
    group("câbles", STATUSES.map(item), note(span("swatch down"), "down (estompé)")),
    group("contrôles", note(span("dot severity-warning"), "warning"), note(span("dot severity-error"), "error")),
    group("structures", note(span("band"), "faisceau"), note(span("band degraded"), "dégradé"), note(span("frame"), "cluster HA"),
      note(span("halo"), "heartbeat"), note(span("role-swatch lead"), "forwarde", "rôle HA active, ou primary en active_passive"),
      note(span("role-swatch follow"), "en attente", "rôle HA standby, ou secondary en active_passive")),
    group("équipements", note(span("box external"), "autre infra"), note(span("box unreachable"), "injoignable"),
      note(span("box partial"), "collecte partielle"), note(span("box not_collected"), "non collecté"), note(span("box stub"), "voisin inconnu")),
    group("types", ICON_TYPES.map((type) => note(icon(type), ICON_LABEL[type]))),
    model.diff ? group("changements", note(span("swatch diff-added"), "ajouté"), note(span("swatch diff-changed"), "changé"),
      note(span("swatch diff-removed"), "retiré (fantôme)", "tel qu'il était dans la run d'avant")) : null));
}

// Les onglets portent leurs comptes : on sait ce qu'il y a derrière sans les ouvrir.
function mountTabs(list: Tab[], activate: (id: string) => void, model: Model): void {
  const counts: Record<string, number> = { diff: model.diffCount, structures: model.aggregates.length, intent: model.pinByHost.size, checks: model.checks.length, sources: model.links.length };
  const bar = clear(byId("tabs"));
  list.forEach(([id, label]) => bar.appendChild(h("button", { type: "button", role: "tab", id: "tab-" + id, "aria-selected": "false", "aria-controls": "view-" + id,
    onclick: () => activate(id) }, label, id in counts ? h("span", { class: "tab-count", id: "count-" + id }, " · " + counts[id]) : null)));
}

// L'état de vue vit dans le fragment d'URL (#view=checks&node=sw-core-01) : une page ouverte sur un élément
// se partage par son adresse. Principe du projet : l'URL est l'état de vue.
// Le fragment est une entrée non fiable (un lien recopié, tronqué au milieu d'un %XX) : un paramètre illisible est
// ignoré, il ne doit jamais empêcher la page de s'afficher.
function readHash(): Map<string, string> {
  const wanted = new Map<string, string>();
  if (typeof location === "undefined" || !location.hash) return wanted;
  for (const part of location.hash.slice(1).split("&")) {
    const cut = part.indexOf("=");
    if (cut <= 0) continue;
    try {
      wanted.set(part.slice(0, cut), decodeURIComponent(part.slice(cut + 1)));
    } catch (error) {
      continue;
    }
  }
  return wanted;
}

function writeHash(view: string, graph: Graph, model: Model): void {
  if (typeof history === "undefined" || typeof location === "undefined") return;
  const parts = ["view=" + view];
  if (graph.state.showStubs) parts.push("stubs=1");
  if (graph.state.showPorts) parts.push("ports=1");
  if (model.diff && !graph.state.showDiff) parts.push("diff=0");
  const token = tokenOf(model, graph.state.selection);
  if (token) parts.push(token[0] + "=" + encodeURIComponent(token[1]));
  history.replaceState(null, "", "#" + parts.join("&"));
}

const VIEWS: Record<string, (container: HTMLElement, model: Model, onSelect: (selection: Selection | null) => void) => void> = {
  diff: tables.diffView, structures: tables.structuresView, quality: tables.qualityView, sources: tables.sourcesView,
};

export function boot(data: PageData, options: BootOptions = {}): App {
  const model = build(data);
  const tabs = tabsFor(model);
  const inspector = byId("inspector");
  const writer: Writer | null = options.writer || null;
  const placer: Placer | null = options.placer || null;
  let graph: Graph | null = null;
  let view = "graph";
  let note = ""; // ce que la couche d'intention ou le placement vient de faire (« épingle enregistrée »), sous le graphe
  let checks: ChecksHandle | null = null;
  let disposed = false; // une autre run a pris la page : ce visualiseur ne touche plus au document
  const built = new Set<string>();
  const g = (): Graph => graph as Graph;

  const openChecks = (severity: string): void => { activate("checks"); if (checks) checks.setSeverity(severity); };
  const activate = (id: string): void => {
    view = id;
    if (graph) writeHash(view, g(), model);
    tabs.forEach(([tab]) => {
      byId("view-" + tab).hidden = tab !== id;
      byId("tab-" + tab).setAttribute("aria-selected", tab === id ? "true" : "false");
    });
    if (id !== "graph" && !built.has(id)) {
      built.add(id);
      if (id === "intent") intents.view();
      else if (id === "checks") checks = tables.checksView(byId("view-checks"), model, openInGraph);
      else VIEWS[id](byId("view-" + id), model, openInGraph);
    }
  };
  const openInGraph = (selection: Selection | null): void => { activate("graph"); g().reveal(selection); status(); };
  const onSelect = (selection: Selection | null): void => {
    show(inspector, model, selection, (next) => { g().reveal(next); status(); }, (hostname) => intents.pinBlock(hostname));
    const live = document.getElementById("live");
    if (live) live.textContent = describe(model, selection);
    if (graph) writeHash(view, g(), model);
  };
  // Après une écriture de la couche d'intention : la pastille d'en-tête, le compte de l'onglet, la fiche ouverte, la
  // ligne d'état. L'en-tête n'est pas reconstruit, les bascules de statut gardent leur état (revue B4, B3).
  const refreshPage = (): void => {
    if (disposed) return;
    const count = document.getElementById("count-intent");
    if (count) count.textContent = " · " + model.pinByHost.size;
    const chip = document.getElementById("c-intent");
    if (chip) chip.textContent = intentChipText(model);
    else if (model.intent) header(model, g(), status, openChecks, activate);
    if (g().state.selection && g().state.selection?.kind === "node") onSelect(g().state.selection);
    status();
  };
  const intents = createIntentHost(model, writer, {
    graph: g, openInGraph, refreshPage, note: (text) => { note = text; status(); },
    mounted: () => built.has("intent"), container: () => byId("view-intent"),
  });
  // Ce que le graphe affiche, lu dans ce qu'il a dessiné : les éléments de la run d'un côté (le même total que
  // l'en-tête), les fantômes du diff de l'autre, jamais mêlés ni comptés comme « masqués » (revue, M4).
  const drawn = (): { nodes: number; links: number; ghosts: number } => {
    const nodes = Array.from(g().state.nodeEls.keys(), (host) => model.nodeByHost.get(host)).filter((n): n is NonNullable<typeof n> => !!n);
    const links = Array.from(g().state.linkEls.keys(), (id) => model.linkById.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
    return { nodes: nodes.filter((n) => !n.ghost).length, links: links.filter((l) => !l.ghost).length,
      ghosts: nodes.filter((n) => n.ghost).length + links.filter((l) => l.ghost).length };
  };
  const ghostText = (shownGhosts: number): string => {
    const parts = [model.ghostNodes.length ? model.ghostNodes.length + " équipement" + (model.ghostNodes.length > 1 ? "s" : "") : null,
      model.ghostLinks.length ? model.ghostLinks.length + " câble" + (model.ghostLinks.length > 1 ? "s" : "") : null].filter(Boolean);
    const masked = model.ghostNodes.length + model.ghostLinks.length - shownGhosts;
    return "retirés depuis la run d'avant : " + parts.join(" et ") + " en fantômes"
      + (masked ? ", dont " + masked + " masqué" + (masked > 1 ? "s" : "") + " par le filtre des voisins inconnus" : "");
  };
  const status: Status = () => {
    if (disposed) return; // une réponse tardive (épingle, placement) de l'ancienne run n'écrit pas sous la nouvelle
    const shown = drawn();
    const total = { nodes: model.nodes.length, links: model.links.length };
    const hidden: string[] = []; // dire ce qui est masqué et pourquoi : l'en-tête annonce le total, le graphe peut en montrer moins
    const stubs = total.nodes - shown.nodes;
    if (stubs > 0) hidden.push(stubs + (stubs > 1 ? " voisins inconnus masqués" : " voisin inconnu masqué"));
    if (g().state.hiddenStatuses.size) hidden.push("statuts masqués : " + Array.from(g().state.hiddenStatuses).map((st) => STATUS_LABEL[st]).join(", "));
    if (model.diff && !g().state.showDiff) hidden.push("changements masqués");
    if (g().state.showDiff && model.ghostNodes.length + model.ghostLinks.length) hidden.push(ghostText(shown.ghosts));
    byId("graph-status").textContent = shown.nodes + " nœuds sur " + total.nodes + " et " + shown.links + " câbles sur "
      + total.links + " affichés" + (hidden.length ? " · " + hidden.join(" · ") : "") + (note ? " · " + note : "");
    const box = document.getElementById("t-stubs") as HTMLInputElement | null;
    if (box) box.checked = g().state.showStubs; // un élément ouvert depuis une table peut avoir rallumé un filtre
    const diffBox = document.getElementById("t-diff") as HTMLInputElement | null;
    if (diffBox) diffBox.checked = g().state.showDiff; // un fantôme ouvert depuis l'onglet Diff rallume les changements
    STATUSES.forEach((st) => ["l-", "c-"].forEach((prefix) => {
      const el = document.getElementById(prefix + st);
      if (el) el.setAttribute("aria-pressed", g().state.hiddenStatuses.has(st) ? "false" : "true");
    }));
    const ports = document.getElementById("t-ports") as HTMLInputElement | null;
    if (ports) ports.checked = g().state.showPorts;
    writeHash(view, g(), model);
  };

  const placements = createPlacementHost(model, placer, { graph: g, note: (text) => { note = text; status(); } });
  graph = createGraph(byId("canvas") as unknown as SVGSVGElement, model, onSelect, { onPin: intents.onPin, onPlaced: placements.onPlaced });
  header(model, graph, status, openChecks, activate);
  mountTabs(tabs, activate, model);
  toolbar(model, graph, status, placements);
  legend(model, graph, status);
  // Sur une toile étroite, la carte de légende recouvrirait le graphe : masquée par défaut, le bouton la rappelle.
  if (typeof matchMedia === "function" && matchMedia("(max-width: 1199px)").matches) {
    byId("graph-legend").hidden = true;
    byId("t-legend").setAttribute("aria-pressed", "false");
  }
  // Applique l'adresse : au démarrage, puis chaque fois qu'elle est modifiée à la main dans une page ouverte.
  const applyHash = (first: boolean): void => {
    const wanted = readHash();
    const stubs = wanted.get("stubs") === "1";
    const diffShown = wanted.get("diff") !== "0";
    const redraw = first || stubs !== g().state.showStubs || diffShown !== g().state.showDiff;
    g().state.showStubs = stubs;
    g().state.showDiff = diffShown;
    g().state.showPorts = wanted.get("ports") === "1";
    if (redraw) g().render(!first);
    const kind = SELECTION_KINDS.find((name) => wanted.has(name) && selectionFromToken(model, name, wanted.get(name) as string));
    if (kind) g().reveal(selectionFromToken(model, kind, wanted.get(kind) as string));
    else g().select(null);
    const wantedView = wanted.get("view");
    activate(wantedView !== undefined && tabs.some(([id]) => id === wantedView) ? wantedView : "graph");
    g().repaint();
    status();
  };
  applyHash(true); // avant toute réécriture de l'adresse : `activate` et `select` la réécrivent
  const onHashChange = (): void => { if (!disposed) applyHash(false); };
  if (typeof window !== "undefined") window.addEventListener("hashchange", onHashChange);
  // Une autre run s'ouvre dans la même page (bande des runs) : ce visualiseur lâche l'adresse et la toile. Le fragment
  // reste tel quel, le suivant le lit : la sélection par identité, l'onglet et les bascules traversent les runs.
  const dispose = (): void => {
    disposed = true;
    if (typeof window !== "undefined") window.removeEventListener("hashchange", onHashChange);
    renewCanvas();
  };
  return { model, graph, activate, applyHash, writer, placer, dispose };
}

// La page autonome démarre sur ses données embarquées (index.ts a déjà lu le bloc de données).
export function startPage(data: PageData): void {
  if (typeof document === "undefined") return;
  try {
    apps.app = boot(data);
  } catch (error) {
    document.body.appendChild(h("p", { class: "fatal" }, "La page n'a pas pu s'afficher : " + (error as Error).message));
    throw error;
  }
}
