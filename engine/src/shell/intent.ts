// Ce qui relie la couche d'intention à la page (B4, docs/08 ; l'onglet Intentions de `/view` vit dans `intent-tab.ts`) : ce que l'humain veut en plus de
// ce que la collecte montre. V1 : les épingles, la place voulue d'un équipement, keyée par son nom, qui survit aux
// runs. On y lit qui a épinglé quoi, quand ; une épingle orpheline (équipement absent de cette run) est dite telle,
// jamais effacée en silence ; retirer se fait d'un clic, retirer tout demande une confirmation dans la page (la page
// n'a pas de boîte de dialogue). Les écritures partent par l'écrivain de la page, dans l'ordre (file de la coquille),
// par paquets de 500 opérations au plus (la borne de l'API) ; une réponse plus ancienne que le document déjà lu est
// ignorée (revue B4, H1). Les couleurs (docs/10) passent par le même écrivain : teinte d'un type, teinte d'un
// équipement, dernier écrivain gagne par clé ; l'onglet les liste, orphelines comprises.
import type { Child } from "../canvas/dom";
import type { PinsCause } from "../canvas/graph";
import { hueLabel } from "../canvas/hues";
import { LABEL as ICON_LABEL } from "../canvas/icons";
import { applyIntent } from "../canvas/model";
import { t } from "../i18n/core";
import type { Intent, Model, Selection } from "../canvas/types";
import type { Op, Writer } from "./apps";

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
  /** Un envoi découpé en plusieurs requêtes (plus de `OPS_PER_REQUEST` opérations) : `chain` relie les suivantes à la
   *  première (une seule entrée d'annulation pour le geste), `revert` défait ce que les premières ont écrit quand une
   *  suivante est refusée (le geste ne reste jamais à moitié écrit). L'application les prend dans sa pile d'annulation
   *  (revue de session, M2) ; `/view`, sans pile, ne les donne pas, ni une annulation (rien de ce qu'elle écrit
   *  n'entre dans la pile). */
  parts?: (ops: Op[]) => { chain: (next: Op[], first: Op[]) => void; revert: (first: Op[]) => Promise<{ ok: true } | { ok: false; message: string }> } | null;
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

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}

/** Ce que l'hôte prête à l'onglet de `/view` pour écrire et se redessiner. */
export interface TabContext {
  model: Model;
  writer: Writer | null;
  hooks: IntentHooks;
  canWrite: () => boolean;
  send: (ops: Op[], removed: string[], done: string, colour?: boolean, all?: boolean) => Promise<boolean>;
  removeOne: (hostname: string, button: HTMLButtonElement) => void;
  unpinOps: (hosts: string[]) => Op[];
  refresh: () => void;
}
export type IntentTab = (context: TabContext) => { view: () => void; pinBlock: (hostname: string) => Child };

export function createIntentHost(model: Model, writer: Writer | null, hooks: IntentHooks, tab?: IntentTab): IntentHost {
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
    hooks.note(t("common:host.saving"));
    let failure: string | null = null;
    const parts = chunks(ops, OPS_PER_REQUEST);
    const joined = parts.length > 1 && hooks.parts ? hooks.parts(ops) : null;
    if (joined) parts.slice(1).forEach((part) => joined.chain(part, parts[0]));
    for (let i = 0; i < parts.length; i += 1) {
      const outcome = await writer.save(parts[i]);
      if (!outcome.ok) {
        failure = outcome.message;
        if (i > 0 && joined) { // une suite refusée : le geste entier est défait, ou la page dit ce qui reste
          const back = await joined.revert(parts[0]);
          hooks.note(back.ok ? t("common:host.partsUndone", { reason: failure }) : t("common:host.partsKept", { reason: failure, undo: back.message }));
          refresh();
          return false;
        }
        break;
      }
      accept(outcome.intent);
    }
    const graph = hooks.graph();
    if (colour || all) graph.recolor();
    if (removed.length) graph.unpin(removed.filter((host) => model.pinByHost.has(host) === false));
    if (all || (!colour && !removed.length)) graph.syncPins();
    hooks.note(failure ? t("common:host.notSaved", { reason: failure }) : done);
    refresh();
    return failure === null;
  }

  function onPin(hostname: string, point: { x: number; y: number }): void {
    if (!writer) { hooks.note(t("common:host.pinLocalNoServer", { host: hostname })); return; }
    if (!writer.author) { hooks.note(t("common:host.pinLocalNoName", { host: hostname })); return; }
    hooks.note(t("common:host.pinSaving", { host: hostname }));
    writer.save([{ op: "pin", hostname, x: Math.round(point.x), y: Math.round(point.y) }]).then((outcome) => {
      if (outcome.ok) { accept(outcome.intent); hooks.graph().syncPins(); hooks.note(t("common:host.pinSaved", { host: hostname, author: writer.author })); }
      else hooks.note(t("common:host.pinNotSaved", { host: hostname, reason: outcome.message }));
      refresh();
    });
  }

  // Un alignement, ou la sélection glissée d'un bloc : toutes les épingles d'un coup, une ligne d'état pour l'ensemble.
  function onPins(moves: Map<string, { x: number; y: number }>, cause: PinsCause = "aligned"): void {
    const hosts = Array.from(moves.keys()).sort();
    const what = t(cause === "dragged" ? "common:host.dragged" : "common:host.aligned", { count: hosts.length });
    if (!writer) { hooks.note(t("common:host.movedNoServer", { what, count: hosts.length })); return; }
    if (!writer.author) { hooks.note(t("common:host.movedNoName", { what })); return; }
    const ops: Op[] = hosts.map((hostname) => { const point = moves.get(hostname) as { x: number; y: number }; return { op: "pin", hostname, x: Math.round(point.x), y: Math.round(point.y) }; });
    void send(ops, [], t("common:host.movedSaved", { what, author: writer.author }));
  }

  // Une couleur (docs/10) : une opération, une ligne d'état ; sans écrivain nommé, rien ne part et la page le dit.
  function colourOps(ops: Op[], done: string): void {
    if (!writer) { hooks.note(t("common:host.colorNoServer")); return; }
    if (!writer.author) { hooks.note(t("common:host.colorNoName")); return; }
    void send(ops, [], t("common:host.by", { done, author: writer.author }), true);
  }
  const onColor = (hostname: string, hue: string | null): void => colourOps(hue ? [{ op: "color", hostname, hue }] : [{ op: "uncolor", hostname }],
    hue ? t("common:host.colorOf", { who: hostname, hue: hueLabel(hue) }) : t("common:host.colorRemoved", { who: hostname }));
  const onColors = (hostnames: string[], hue: string | null): void => {
    const hosts = hostnames.slice().sort();
    if (!hosts.length) return;
    const what = hosts.length === 1 ? hosts[0] : t("common:devices", { count: hosts.length });
    colourOps(hosts.map((hostname): Op => (hue ? { op: "color", hostname, hue } : { op: "uncolor", hostname })),
      hue ? t("common:host.colorOf", { who: what, hue: hueLabel(hue) }) : t("common:host.colorRemoved", { who: what }));
  };
  const onTypeColor = (type: string, hue: string | null): void => colourOps(hue ? [{ op: "color_type", type, hue }] : [{ op: "uncolor_type", type }],
    hue ? t("common:host.typeColorOf", { type: ICON_LABEL[type] || type, hue: hueLabel(hue) }) : t("common:host.typeColorRemoved", { type: ICON_LABEL[type] || type }));

  async function onOps(ops: Op[], done: string, what: string): Promise<Intent | null> {
    if (!writer) { hooks.note(t("common:host.opsNoServer", { what })); return null; }
    if (!writer.author) { hooks.note(t("common:host.opsNoName", { what })); return null; }
    await send(ops, [], t("common:host.by", { done, author: writer.author }), true);
    return model.intent;
  }
  const onGroup = (ops: Op[], done: string): Promise<Intent | null> => onOps(ops, done, t("common:host.aGroup"));
  const onAnnotation = (ops: Op[], done: string): Promise<Intent | null> => onOps(ops, done, t("common:host.anAnnotation"));
  const onConnector = (ops: Op[], done: string): Promise<Intent | null> => onOps(ops, done, t("common:host.aConnector"));

  async function apply(ops: Op[], done: string): Promise<Intent | null> {
    if (!writer || !writer.author) { hooks.note(t("common:host.undoNoName")); return null; }
    const removed = ops.flatMap((op) => (op.op === "unpin" ? [op.hostname] : []));
    return (await send(ops, removed, done, false, true)) ? model.intent : null;
  }

  const unpinOps = (hosts: string[]): Op[] => hosts.map((hostname) => ({ op: "unpin", hostname }));
  const unpin = (hosts: string[]): void => { if (hosts.length) void send(unpinOps(hosts), hosts, t("common:host.pinsRemoved", { count: hosts.length })); };
  const removeOne = (hostname: string, button: HTMLButtonElement): void => {
    button.setAttribute("disabled", ""); // un second clic avant la réponse n'envoie pas une seconde requête (revue B4, B3)
    void send(unpinOps([hostname]), [hostname], t("common:host.pinRemoved", { host: hostname }));
  };

  // L'onglet de `/view` et la ligne « épingle » de sa fiche, si la page en a un (l'application n'en a pas, et n'embarque
  // pas son code : `intent-tab.ts`, importé par `/view` seulement).
  const page = tab ? tab({ model, writer, hooks, canWrite, send, removeOne, unpinOps, refresh }) : null;
  const view = (): void => { if (page) page.view(); };
  const pinBlock = (hostname: string): Child => (page ? page.pinBlock(hostname) : null);

  return { onPin, onPins, unpin, onColor, onTypeColor, onColors, onGroup, onAnnotation, onConnector, apply, canWrite, view, pinBlock };
}

export const intent = { createIntentHost, OPS_PER_REQUEST, AUTHOR_MAX_LENGTH };
