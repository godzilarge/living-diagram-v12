// L'onglet Intentions (B4, docs/08) et ce qui relie la couche d'intention à la page : ce que l'humain veut en plus de
// ce que la collecte montre. V1 : les épingles, la place voulue d'un équipement, keyée par son nom, qui survit aux
// runs. On y lit qui a épinglé quoi, quand ; une épingle orpheline (équipement absent de cette run) est dite telle,
// jamais effacée en silence ; retirer se fait d'un clic, retirer tout demande une confirmation dans la page (la page
// n'a pas de boîte de dialogue). Les écritures partent par l'écrivain de la page, dans l'ordre (file de la coquille),
// par paquets de 500 opérations au plus (la borne de l'API) ; une réponse plus ancienne que le document déjà lu est
// ignorée (revue B4, H1).
import { clear, h } from "../canvas/dom";
import type { Child } from "../canvas/dom";
import type { Graph } from "../canvas/graph";
import { applyIntent } from "../canvas/model";
import type { Intent, Model, Pin, Selection } from "../canvas/types";
import type { Op, Writer } from "./apps";
import { confirmable, definition, pill, table } from "./widgets";
import type { TableRow } from "./widgets";

export const OPS_PER_REQUEST = 500; // la borne de `POST /api/intent/patches`
export const AUTHOR_MAX_LENGTH = 80; // celle du contrat

export interface IntentHooks {
  graph: () => Graph;
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
  /** Monte ou redessine l'onglet. */
  view: () => void;
  /** La ligne « épingle » de la fiche d'un équipement. */
  pinBlock: (hostname: string) => Child;
}

const dateText = (iso: string): string => iso.replace("T", " ").replace(/:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/, " $2").replace(" Z", " UTC");

// Les déplacements faits à la main dans cette page et non enregistrés : sans écrivain (page autonome, nom absent),
// ou en attendant la réponse de l'API.
function localMoves(model: Model, graph: Graph): string[] {
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
  async function send(ops: Op[], removed: string[], done: string): Promise<void> {
    if (!writer) return;
    hooks.note("enregistrement…");
    let failure: string | null = null;
    for (const part of chunks(ops, OPS_PER_REQUEST)) {
      const outcome = await writer.save(part);
      if (!outcome.ok) { failure = outcome.message; break; }
      accept(outcome.intent);
    }
    if (removed.length) hooks.graph().unpin(removed.filter((host) => model.pinByHost.has(host) === false));
    else hooks.graph().syncPins();
    hooks.note(failure ? "non enregistré : " + failure : done);
    refresh();
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

  const unpinOps = (hosts: string[]): Op[] => hosts.map((hostname) => ({ op: "unpin", hostname }));
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

  return { onPin, view, pinBlock };
}

export const intent = { createIntentHost, OPS_PER_REQUEST, AUTHOR_MAX_LENGTH };
