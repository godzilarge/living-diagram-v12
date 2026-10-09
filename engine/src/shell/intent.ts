// L'onglet Intentions (B4, docs/08) et ce qui relie la couche d'intention à la page : ce que l'humain veut en plus de
// ce que la collecte montre. V1 : les épingles, la place voulue d'un équipement, keyée par son nom, qui survit aux
// runs. On y lit qui a épinglé quoi, quand ; une épingle orpheline (équipement absent de cette run) est dite telle,
// jamais effacée en silence ; retirer se fait d'un clic, retirer tout demande une confirmation dans la page (la page
// n'a pas de boîte de dialogue). Les écritures partent par l'écrivain de la page, dans l'ordre (file de la coquille),
// par paquets de 500 opérations au plus (la borne de l'API) ; une réponse plus ancienne que le document déjà lu est
// ignorée (revue B4, H1). Les couleurs (docs/10) passent par le même écrivain : teinte d'un type, teinte d'un
// équipement, dernier écrivain gagne par clé ; l'onglet les liste, orphelines comprises.
import { KIND_LABEL as ANNOTATION_KIND, summary } from "../canvas/annotations";
import { summary as connectorSummary } from "../canvas/connectors";
import { clear, h } from "../canvas/dom";
import { hueLabel } from "../canvas/hues";
import { LABEL as ICON_LABEL } from "../canvas/icons";
import type { Child } from "../canvas/dom";
import type { PinsCause } from "../canvas/graph";
import { applyIntent } from "../canvas/model";
import { STYLE_LABEL } from "../canvas/groups";
import type { Annotation, Connector, DeviceColor, Group, Intent, Model, Pin, Selection, TypeColor } from "../canvas/types";
import type { Op, Writer } from "./apps";
import { confirmable, definition, pill, table } from "./widgets";
import type { TableRow } from "./widgets";

export const OPS_PER_REQUEST = 500; // la borne de `POST /api/intent/patches`
export const AUTHOR_MAX_LENGTH = 80; // celle du contrat

/** Ce que l'hôte demande au graphe (graph.ts dans `/view`, la toile de l'application) : les épingles locales, retirer, se réaligner. */
export interface PinGraph { state: { pinned: Map<string, { x: number; y: number }> }; unpin: (hostnames: string[]) => unknown; syncPins: () => void; resetPins: () => unknown; recolor: () => unknown }

export interface IntentHooks {
  graph: () => PinGraph;
  /** Ouvre un élément dans le graphe (depuis une ligne de l'onglet). */
  openInGraph: (selection: Selection | null) => void;
  /** Redessine la fiche de l'équipement sélectionné, l'en-tête et la ligne d'état. */
  refreshPage: () => void;
  /** Une ligne d'état sous le graphe (« épingle enregistrée », « non enregistrée : … »). */
  note: (text: string) => void;
  /** L'onglet Intentions est-il monté ? (il se redessine alors après chaque écriture) */
  mounted: () => boolean;
  container: () => HTMLElement;
}

export interface IntentHost {
  /** Un équipement relâché après un glissé, à cette position. */
  onPin: (hostname: string, point: { x: number; y: number }) => void;
  /** Des équipements alignés, ou glissés d'un bloc, d'un coup (application, `/view`) : une requête par paquet, dans
   * l'ordre ; sans écrivain nommé, des déplacements locaux, dits tels. */
  onPins: (moves: Map<string, { x: number; y: number }>, cause?: PinsCause) => void;
  /** Retire des épingles enregistrées (application : sans le DOM de l'onglet). */
  unpin: (hostnames: string[]) => void;
  /** La teinte d'un équipement (docs/10), ou `null` pour revenir à celle de son type. */
  onColor: (hostname: string, hue: string | null) => void;
  /** La teinte d'un type pour l'infrastructure, ou `null` pour revenir au défaut du moteur. */
  onTypeColor: (type: string, hue: string | null) => void;
  /** La même teinte sur toute une sélection, en une requête (par paquets de 500 au plus). */
  onColors: (hostnames: string[], hue: string | null) => void;
  /** Des opérations de groupe (docs/10 §5), en une requête ; rend le document accepté, ou `null` sans écrivain nommé. */
  onGroup: (ops: Op[], done: string) => Promise<Intent | null>;
  /** Des opérations d'annotation (docs/10 §6), de même. */
  onAnnotation: (ops: Op[], done: string) => Promise<Intent | null>;
  /** Des opérations de connecteur (docs/10 §6, 1.4.0), de même. */
  onConnector: (ops: Op[], done: string) => Promise<Intent | null>;
  /** Des opérations quelconques (annuler, rétablir : application), en une requête ; la toile se réaligne sur tout
   *  (couleurs, groupes, épingles posées ou retirées). Rend le document accepté, ou `null`. */
  apply: (ops: Op[], done: string) => Promise<Intent | null>;
  /** Peut écrire : un écrivain avec un nom. */
  canWrite: () => boolean;
  /** Monte ou redessine l'onglet. */
  view: () => void;
  /** La ligne « épingle » de la fiche d'un équipement. */
  pinBlock: (hostname: string) => Child;
}

const dateText = (iso: string): string => iso.replace("T", " ").replace(/:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/, " $2").replace(" Z", " UTC");

// Les déplacements faits à la main dans cette page et non enregistrés : sans écrivain (page autonome, nom absent),
// ou en attendant la réponse de l'API.
function localMoves(model: Model, graph: PinGraph): string[] {
  return Array.from(graph.state.pinned.keys()).filter((host) => !model.pinByHost.has(host)).sort();
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}

export function createIntentHost(model: Model, writer: Writer | null, hooks: IntentHooks): IntentHost {
  const canWrite = (): boolean => !!(writer && writer.author);

  // Une réponse acceptée réaligne le modèle sur le document que l'API renvoie, sauf si la page en a déjà lu un plus
  // récent (les envois sont ordonnés par la coquille, mais une réponse en retard n'écrase jamais une plus neuve).
  const accept = (intent: Intent): boolean => {
    if (model.intent && intent.revision < model.intent.revision) return false;
    applyIntent(model, intent);
    return true;
  };

  const refresh = (): void => {
    if (hooks.mounted()) view();
    hooks.refreshPage();
  };

  // Envoie des opérations par paquets, dans l'ordre, puis réaligne le modèle, le graphe et l'onglet.
  async function send(ops: Op[], removed: string[], done: string, colour = false, all = false): Promise<boolean> {
    if (!writer) return false;
    hooks.note("enregistrement…");
    let failure: string | null = null;
    for (const part of chunks(ops, OPS_PER_REQUEST)) {
      const outcome = await writer.save(part);
      if (!outcome.ok) { failure = outcome.message; break; }
      accept(outcome.intent);
    }
    const graph = hooks.graph();
    if (colour || all) graph.recolor();
    if (removed.length) graph.unpin(removed.filter((host) => model.pinByHost.has(host) === false));
    if (all || (!colour && !removed.length)) graph.syncPins();
    hooks.note(failure ? "non enregistré : " + failure : done);
    refresh();
    return failure === null;
  }

  function onPin(hostname: string, point: { x: number; y: number }): void {
    if (!writer) { hooks.note("déplacement local de " + hostname + ", non enregistré (page sans serveur)"); return; }
    if (!writer.author) { hooks.note("déplacement local de " + hostname + " : donnez votre nom (onglet Intentions) pour l'enregistrer"); return; }
    hooks.note("enregistrement de l'épingle de " + hostname + "…");
    writer.save([{ op: "pin", hostname, x: Math.round(point.x), y: Math.round(point.y) }]).then((outcome) => {
      if (outcome.ok) { accept(outcome.intent); hooks.graph().syncPins(); hooks.note("épingle de " + hostname + " enregistrée (" + writer.author + ")"); }
      else hooks.note("épingle de " + hostname + " non enregistrée : " + outcome.message);
      refresh();
    });
  }

  // Un alignement, ou la sélection glissée d'un bloc : toutes les épingles d'un coup, une ligne d'état pour l'ensemble.
  function onPins(moves: Map<string, { x: number; y: number }>, cause: PinsCause = "aligned"): void {
    const hosts = Array.from(moves.keys()).sort();
    const plural = hosts.length > 1 ? "s" : "";
    const what = hosts.length + " équipement" + plural + (cause === "dragged" ? " déplacé" : " aligné") + plural;
    if (!writer) { hooks.note(what + " ici, non enregistré" + (hosts.length > 1 ? "s" : "") + " (page sans serveur)"); return; }
    if (!writer.author) { hooks.note(what + " ici : donnez votre nom pour enregistrer les épingles"); return; }
    const ops: Op[] = hosts.map((hostname) => { const point = moves.get(hostname) as { x: number; y: number }; return { op: "pin", hostname, x: Math.round(point.x), y: Math.round(point.y) }; });
    void send(ops, [], what + ", épingles enregistrées (" + writer.author + ")");
  }

  // Une couleur (docs/10) : une opération, une ligne d'état ; sans écrivain nommé, rien ne part et la page le dit.
  function colourOps(ops: Op[], done: string): void {
    if (!writer) { hooks.note("couleur non enregistrée (page sans serveur)"); return; }
    if (!writer.author) { hooks.note("donnez votre nom pour enregistrer une couleur"); return; }
    void send(ops, [], done + " (" + writer.author + ")", true);
  }
  const onColor = (hostname: string, hue: string | null): void => colourOps(hue ? [{ op: "color", hostname, hue }] : [{ op: "uncolor", hostname }],
    hue ? "couleur de " + hostname + " : " + hueLabel(hue) : "couleur de " + hostname + " retirée");
  const onColors = (hostnames: string[], hue: string | null): void => {
    const hosts = hostnames.slice().sort();
    if (!hosts.length) return;
    const what = hosts.length === 1 ? hosts[0] : hosts.length + " équipements";
    colourOps(hosts.map((hostname): Op => (hue ? { op: "color", hostname, hue } : { op: "uncolor", hostname })),
      hue ? "couleur de " + what + " : " + hueLabel(hue) : "couleur de " + what + " retirée");
  };
  const onTypeColor = (type: string, hue: string | null): void => colourOps(hue ? [{ op: "color_type", type, hue }] : [{ op: "uncolor_type", type }],
    hue ? "couleur des " + (ICON_LABEL[type] || type) + " : " + hueLabel(hue) : "couleur des " + (ICON_LABEL[type] || type) + " retirée");

  async function onOps(ops: Op[], done: string, what: string): Promise<Intent | null> {
    if (!writer) { hooks.note(what + " non enregistré (page sans serveur)"); return null; }
    if (!writer.author) { hooks.note("donnez votre nom pour enregistrer " + what); return null; }
    await send(ops, [], done + " (" + writer.author + ")", true);
    return model.intent;
  }
  const onGroup = (ops: Op[], done: string): Promise<Intent | null> => onOps(ops, done, "un groupe");
  const onAnnotation = (ops: Op[], done: string): Promise<Intent | null> => onOps(ops, done, "une annotation");
  const onConnector = (ops: Op[], done: string): Promise<Intent | null> => onOps(ops, done, "un connecteur");

  async function apply(ops: Op[], done: string): Promise<Intent | null> {
    if (!writer || !writer.author) { hooks.note("donnez votre nom pour annuler ou rétablir"); return null; }
    const removed = ops.flatMap((op) => (op.op === "unpin" ? [op.hostname] : []));
    return (await send(ops, removed, done, false, true)) ? model.intent : null;
  }

  const unpinOps = (hosts: string[]): Op[] => hosts.map((hostname) => ({ op: "unpin", hostname }));
  const unpin = (hosts: string[]): void => { if (hosts.length) void send(unpinOps(hosts), hosts, hosts.length + " épingle" + (hosts.length > 1 ? "s retirées" : " retirée")); };
  const removeOne = (hostname: string, button: HTMLButtonElement): void => {
    button.setAttribute("disabled", ""); // un second clic avant la réponse n'envoie pas une seconde requête (revue B4, B3)
    void send(unpinOps([hostname]), [hostname], "épingle de " + hostname + " retirée");
  };

  function writerNote(): Child {
    if (!writer) {
      const why = model.intent ? "cette page a été générée sans serveur (ld render)" : "cette page vient d'un fichier, sans archive ni serveur";
      return h("p", { class: "intent-note warn" }, "Lecture seule : " + why + ". Glisser un équipement le déplace ici seulement ; rien n'est enregistré.");
    }
    const field = h("input", { id: "i-author", type: "text", value: writer.author, placeholder: "votre nom", maxlength: AUTHOR_MAX_LENGTH,
      "aria-label": "votre nom, écrit sur chaque épingle", spellcheck: "false",
      onchange: (e: Event) => { writer.setAuthor((e.target as HTMLInputElement).value.trim().slice(0, AUTHOR_MAX_LENGTH)); refresh(); } });
    const text = writer.author
      ? "Vos épingles s'enregistrent sous le nom « " + writer.author + " » : glisser un équipement l'épingle pour tout le monde. Dernier écrivain gagne, par épingle ; chaque écriture est journalisée."
      : "Sans nom, vos déplacements restent locaux. Donnez votre nom pour que vos épingles s'enregistrent :";
    return h("p", { class: "intent-note" + (writer.author ? "" : " warn") }, text, " ", h("label", { class: "check-field" }, "nom ", field));
  }

  function pinRow(pin: Pin, orphan: boolean): TableRow {
    const target: Child = orphan ? pin.hostname
      : h("button", { class: "linklike", type: "button", onclick: () => hooks.openInGraph({ kind: "node", id: pin.hostname }) }, pin.hostname);
    const state = orphan ? pill("pin", "orphan", "orpheline : équipement absent de cette run") : pill("pin", "present", "présente");
    const remove: Child = canWrite() ? h("button", { type: "button", onclick: (e: Event) => removeOne(pin.hostname, e.target as HTMLButtonElement) }, "retirer") : "";
    return { cells: [target, String(pin.x), String(pin.y), pin.author, dateText(pin.at), state, remove] };
  }

  // Les couleurs de l'onglet : une ligne par type coloré, une par équipement coloré (orpheline si absent de la run).
  function colourRow(target: Child, hue: string, author: string, at: string, orphan: boolean | null, remove: () => Op[]): TableRow {
    const state = orphan === null ? "" : orphan ? pill("pin", "orphan", "orpheline : équipement absent de cette run") : pill("pin", "present", "présente");
    const button: Child = canWrite() ? h("button", { type: "button", onclick: (e: Event) => { (e.target as HTMLButtonElement).setAttribute("disabled", ""); void send(remove(), [], "couleur retirée", true); } }, "retirer la couleur") : "";
    return { cells: [target, h("span", { class: "hue-dot hue-" + hue }, hueLabel(hue)), author, dateText(at), state, button] };
  }
  function coloursBlock(): Child {
    const types: TypeColor[] = model.intent && model.intent.type_colors ? model.intent.type_colors : [];
    const devices: DeviceColor[] = model.intent && model.intent.device_colors ? model.intent.device_colors : [];
    const orphans = new Set(model.orphanColors.map((c) => c.hostname));
    const rows = types.map((c) => colourRow("type · " + (ICON_LABEL[c.type] || c.type), c.hue, c.author, c.at, null, () => [{ op: "uncolor_type", type: c.type }]))
      .concat(devices.map((c) => colourRow(orphans.has(c.hostname) ? c.hostname : h("button", { class: "linklike", type: "button", onclick: () => hooks.openInGraph({ kind: "node", id: c.hostname }) }, c.hostname),
        c.hue, c.author, c.at, orphans.has(c.hostname), () => [{ op: "uncolor", hostname: c.hostname }])));
    const orphanOps = (): Op[] => model.orphanColors.map((c) => ({ op: "uncolor", hostname: c.hostname }));
    return [h("h3", {}, "Couleurs enregistrées : " + rows.length + (orphans.size ? " · " + orphans.size + " orpheline" + (orphans.size > 1 ? "s" : "") : "")),
      h("p", { class: "muted" }, "La teinte d'un type vaut pour toute l'infrastructure ; celle d'un équipement l'emporte. Douze teintes nommées, jamais une valeur libre (docs/10)."),
      table(["cible", "teinte", "auteur", "date", "état", ""], rows, { empty: "aucune couleur : la palette des types et la fiche d'un équipement, dans l'application" }),
      canWrite() && orphans.size ? h("div", { class: "toolbar-row" }, confirmable("retirer les couleurs orphelines", () => { void send(orphanOps(), [], "couleurs orphelines retirées", true); }, { count: orphans.size })) : null];
  }

  // Les groupes de l'onglet : une ligne par groupe, ses membres présents et orphelins ; supprimer demande confirmation.
  function groupsBlock(): Child {
    const list: Group[] = model.intent && model.intent.groups ? model.intent.groups : [];
    const rows = list.map((group): TableRow => {
      const orphans = group.members.filter((host) => { const node = model.nodeByHost.get(host); return !node || !!node.ghost; });
      const present = group.members.length - orphans.length;
      const state = present === 0 ? pill("pin", "orphan", "orphelin : aucun membre dans cette run") : orphans.length ? pill("pin", "orphan", orphans.length + " membre(s) absent(s)") : pill("pin", "present", "présent");
      const remove: Child = canWrite() ? confirmable("supprimer", () => { void send([{ op: "group_delete", id: group.id }], [], "groupe " + group.label + " supprimé", true); }, { count: group.members.length }) : "";
      return { cells: [h("span", {}, h("b", {}, group.label), " ", h("code", { class: "muted" }, group.id)), h("span", { class: "hue-dot hue-" + group.style.hue }, STYLE_LABEL[group.style.shape] || group.style.shape),
        present + " / " + group.members.length + (orphans.length ? " · absents : " + orphans.join(", ") : ""), group.author, dateText(group.at), state, remove] };
    });
    return [h("h3", {}, "Groupes enregistrés : " + rows.length + (model.orphanGroups.length ? " · " + model.orphanGroups.length + " orphelin" + (model.orphanGroups.length > 1 ? "s" : "") : "")),
      h("p", { class: "muted" }, "Un groupe = des membres + un style ; son cadre se calcule depuis ses membres (docs/10 §5). Il se crée, se modifie et se glisse dans l'application ; ici, la comptabilité."),
      table(["groupe", "forme", "membres", "auteur", "date", "état", ""], rows, { empty: "aucun groupe : depuis la fiche d'une sélection multiple, dans l'application" })];
  }

  // Les annotations de l'onglet (docs/10 §6) : une ligne par annotation, son ancre, orpheline si l'ancre est absente.
  function annotationsBlock(): Child {
    const list: Annotation[] = model.intent && model.intent.annotations ? model.intent.annotations : [];
    const orphans = new Set(model.orphanAnnotations.map((a) => a.id));
    const rows = list.map((a): TableRow => {
      const where = a.anchor.kind === "free" ? "libre" : a.anchor.kind + " · " + a.anchor.ref;
      const state = orphans.has(a.id) ? pill("pin", "orphan", "orpheline : ancre absente de cette run") : pill("pin", "present", "présente");
      const remove: Child = canWrite() ? confirmable("supprimer", () => { void send([{ op: "annotation_delete", id: a.id }], [], "annotation supprimée", true); }, { count: 1 }) : "";
      return { cells: [h("span", {}, h("b", {}, ANNOTATION_KIND[a.content.kind] || a.content.kind), " ", h("code", { class: "muted" }, a.id)), summary(a), where, a.x + ", " + a.y + " · " + a.w + " × " + a.h, a.author, dateText(a.at), state, remove] };
    });
    return [h("h3", {}, "Annotations enregistrées : " + rows.length + (orphans.size ? " · " + orphans.size + " orpheline" + (orphans.size > 1 ? "s" : "") : "")),
      h("p", { class: "muted" }, "Une annotation dit ce que la donnée ignore : note, forme, tableau, image, libre ou attachée à un équipement ou à un groupe (docs/10 §6). Elle se crée et se règle dans l'application ; ici, la comptabilité."),
      table(["sorte", "contenu", "ancrage", "boîte", "auteur", "date", "état", ""], rows, { empty: "aucune annotation : la barre d'outils de l'application, « insérer »" })];
  }

  // Les connecteurs de l'onglet (docs/10 §6, 1.4.0) : une ligne par connecteur, ses bouts, orphelin si un bout est absent.
  function connectorsBlock(): Child {
    const list: Connector[] = model.intent && model.intent.connectors ? model.intent.connectors : [];
    const orphans = new Set(model.orphanConnectors.map((c) => c.id));
    const rows = list.map((c): TableRow => {
      const state = orphans.has(c.id) ? pill("pin", "orphan", "orphelin : un bout vise un élément absent de cette run") : pill("pin", "present", "présent");
      const remove: Child = canWrite() ? confirmable("supprimer", () => { void send([{ op: "connector_delete", id: c.id }], [], "connecteur supprimé", true); }, { count: 1 }) : "";
      return { cells: [h("code", { class: "muted" }, c.id), connectorSummary(c), c.route, c.author, dateText(c.at), state, remove] };
    });
    return [h("h3", {}, "Connecteurs enregistrés : " + rows.length + (orphans.size ? " · " + orphans.size + " orphelin" + (orphans.size > 1 ? "s" : "") : "")),
      h("p", { class: "muted" }, "Un connecteur relie deux bouts, libres ou attachés à un équipement, un groupe ou une annotation : une ligne ou une flèche de contexte, jamais un câble (docs/10 §6). Il se trace dans l'application ; ici, la comptabilité."),
      table(["id", "connecteur", "tracé", "auteur", "date", "état", ""], rows, { empty: "aucun connecteur : la barre d'outils de l'application, « insérer »" })];
  }

  // Retirer plusieurs épingles demande une confirmation, dans la page.
  const removeMany = (label: string, hosts: string[]): Child => (hosts.length
    ? confirmable(label, () => { void send(unpinOps(hosts), hosts, hosts.length + " épingle" + (hosts.length > 1 ? "s retirées" : " retirée")); }, { count: hosts.length })
    : null);

  function view(): void {
    const container = hooks.container();
    const graph = hooks.graph();
    const pins = model.intent ? model.intent.pins : [];
    const orphans = new Set(model.orphanPins.map((p) => p.hostname));
    const local = localMoves(model, graph);
    const headers = ["équipement", "x", "y", "auteur", "date", "état", ""];
    const rows = pins.map((pin) => pinRow(pin, orphans.has(pin.hostname)));
    const orphanHosts = model.orphanPins.map((p) => p.hostname);
    const allHosts = pins.map((p) => p.hostname);
    clear(container).appendChild(h("div", { class: "page" },
      h("h2", {}, "Intentions"),
      h("p", { class: "lead" }, "La couche d'intention est ce que vous voulez en plus de ce que la collecte montre. Première intention : l'épingle, la place voulue d'un équipement, "
        + "keyée par son nom, qui survit aux runs. Glisser un équipement sur le graphe l'épingle ; « replacer » recalcule le placement autour des épingles. Le diff ne lit jamais l'intention. "
        + "Les équipements non épinglés gardent aussi leur place d'une run à l'autre : c'est le placement mémorisé, une donnée calculée que « replacer » renouvelle."),
      writerNote(),
      model.intent ? definition([["infrastructure", model.intent.infrastructure], ["révision", String(model.intent.revision)],
        ["dernière écriture", model.intent.updated_at ? dateText(model.intent.updated_at) : "jamais"]]) : null,
      h("h3", {}, "Épingles enregistrées : " + pins.length + (orphans.size ? " · " + orphans.size + " orpheline" + (orphans.size > 1 ? "s" : "") : "")),
      orphans.size ? h("p", { class: "muted" }, "Une épingle orpheline vise un équipement qui n'est pas dans cette run (retiré, renommé, ou pas encore collecté). Elle n'est pas dessinée, elle n'est pas effacée : si l'équipement revient, elle s'applique à nouveau.") : null,
      table(headers, rows, { empty: model.intent ? "aucune épingle : glisser un équipement sur le graphe" : "pas de couche d'intention dans cette page" }),
      canWrite() ? h("div", { class: "toolbar-row" }, removeMany("retirer les épingles orphelines", orphanHosts), removeMany("retirer toutes les épingles", allHosts)) : null,
      coloursBlock(),
      groupsBlock(),
      annotationsBlock(),
      connectorsBlock(),
      h("h3", {}, "Déplacements locaux non enregistrés : " + local.length),
      local.length ? [h("p", { class: "muted" }, local.join(", ")),
        h("button", { type: "button", title: "chaque équipement retrouve sa place mémorisée ou son épingle", onclick: () => { graph.resetPins(); refresh(); } }, "oublier les déplacements locaux")]
        : h("p", { class: "muted" }, "aucun")));
  }

  // La ligne « épingle » de la fiche d'un équipement, avec son action.
  function pinBlock(hostname: string): Child {
    const pin = model.pinByHost.get(hostname);
    const local = !pin && hooks.graph().state.pinned.has(hostname);
    if (!pin && !local) return null;
    return [h("h4", { class: "section" }, "Épingle"),
      pin ? definition([["place voulue", pin.x + ", " + pin.y], ["par", pin.author], ["le", dateText(pin.at)]]) : h("p", { class: "muted" }, "déplacé dans cette page, non enregistré"),
      pin && canWrite() ? h("button", { type: "button", onclick: (e: Event) => removeOne(hostname, e.target as HTMLButtonElement) }, "retirer l'épingle") : null];
  }

  return { onPin, onPins, unpin, onColor, onTypeColor, onColors, onGroup, onAnnotation, onConnector, apply, canWrite, view, pinBlock };
}

export const intent = { createIntentHost, OPS_PER_REQUEST, AUTHOR_MAX_LENGTH };
