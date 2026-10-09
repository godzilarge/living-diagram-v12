// Le placement mémorisé (docs/09), côté page : ce que le graphe vient de placer sans mémoire part vers l'API par
// l'écrivain de placement (`Placer`, coquille servie), dans l'ordre, avec la révision du document que la page a lu
// (`base_revision`). Trois réponses : acceptée, la page se réaligne sur le document (la première place enregistrée
// gagne, une autre page a pu dessiner le même équipement avant) ; périmée (409 : le document a changé), la page
// adopte le document courant, replace ses nouveaux venus autour de lui et renvoie, trois fois au plus (revue, H1) ;
// échouée, la page garde ce qu'elle a placé et le renvoie au prochain dessin (revue, M1). Sans écrivain (page
// autonome), la mémoire ne vit que dans la page et la ligne d'état le dit. « Replacer » remplace tout le document :
// dans une page servie, il demande confirmation, parce que tout le monde voit le même dessin.
import { applyPlacement } from "../canvas/model";
import type { Model, Place, Placement } from "../canvas/types";
import type { Placer } from "./apps";

/** Ce que l'hôte demande au graphe : se réaligner sur le document mémorisé. */
export interface PlaceGraph { syncPlaces: () => void }

export interface PlacementHooks {
  graph: () => PlaceGraph;
  /** Une ligne d'état sous le graphe (« 3 équipements placés et mémorisés »). */
  note: (text: string) => void;
}

export interface PlacementHost {
  /** Le graphe vient de placer ces équipements sans place mémorisée (`replace` : tout a été replacé). */
  onPlaced: (fresh: Map<string, { x: number; y: number }>, replace: boolean) => void;
  /** Ce que « replacer » fait dans cette page, pour son infobulle. */
  replaceTitle: () => string;
  /** « Replacer » demande confirmation ici ? (page servie : le placement mémorisé est partagé) */
  needsConfirmation: () => boolean;
}

export const MAX_RETRIES = 3; // envois d'affilée sans que le document retienne ce qui est envoyé : au-delà, on s'arrête et on le dit

const plural = (count: number, word: string): string => count + " " + word + (count > 1 ? "s" : "");
const placed = (count: number): string => plural(count, "équipement") + " placé" + (count > 1 ? "s" : "");
const byHostname = (a: Place, b: Place): number => (a.hostname < b.hostname ? -1 : 1);

export function createPlacementHost(model: Model, placer: Placer | null, hooks: PlacementHooks): PlacementHost {
  const pending = new Map<string, Place>(); // placé par cette page, pas encore accepté par l'API
  let queue: Promise<void> = Promise.resolve();
  let replacing = false; // un « replacer » attend sa réponse : les réponses des envois d'avant ne réalignent pas la page (revue, B2)
  let retries = 0;

  // Une réponse réaligne le modèle sur le document que l'API renvoie, sauf si la page en a déjà lu un plus récent (les
  // envois sont ordonnés, une réponse en retard n'écrase jamais une plus neuve) ; puis le graphe, qui replace ce qui
  // n'est pas à sa place et redit ce qu'il place (`onPlaced`).
  const accept = (placement: Placement, realign: boolean): void => {
    if (model.placement && placement.revision < model.placement.revision) return;
    applyPlacement(model, placement);
    if (realign) hooks.graph().syncPlaces();
  };

  async function send(replace: boolean, what: string): Promise<void> {
    if (!placer) return;
    const places = Array.from(pending.values()).sort(byHostname);
    if (!replace && !places.length) return;
    hooks.note(what + ", mémorisation…");
    const outcome = await placer.save({ base_revision: model.placement ? model.placement.revision : 0, replace, places });
    if (replace) replacing = false;
    if (outcome.ok) {
      pending.clear();
      // Un document qui ne retient pas ce qui lui a été envoyé (serveur incohérent) ne fait pas tourner la page en rond :
      // trois réalignements, puis la mémoire de la page reste la sienne.
      const kept = new Set(outcome.placement.places.map((place) => place.hostname));
      const missing = places.filter((place) => !kept.has(place.hostname)).length;
      retries = missing ? retries + 1 : 0;
      const stopped = retries > MAX_RETRIES;
      if (stopped) retries = 0;
      accept(outcome.placement, replace || (!replacing && !stopped));
      hooks.note(replace ? "placement recalculé et mémorisé pour tout le monde"
        : stopped ? what + ", non mémorisé" + (places.length > 1 ? "s" : "") + " : l'API ne retient pas " + plural(missing, "équipement")
        : what + " et mémorisé" + (places.length > 1 ? "s" : ""));
    } else if (outcome.stale) {
      pending.clear();
      retries = replace ? 0 : retries + 1;
      const stopped = retries > MAX_RETRIES;
      if (stopped) retries = 0;
      hooks.note(replace ? "placement recalculé, non mémorisé : le placement mémorisé a changé entre-temps ; replacer à nouveau si besoin"
        : stopped ? what + ", non mémorisé" + (places.length > 1 ? "s" : "") + " : le placement mémorisé a changé " + MAX_RETRIES + " fois de suite"
        : what + " sur un placement qui a changé entre-temps : replacé autour du nouveau…");
      accept(outcome.placement, replace || (!stopped && !replacing)); // réaligné, le graphe replace ce qui n'a plus de place et le renvoie
    } else {
      hooks.note(what + ", non mémorisé" + (places.length > 1 && !replace ? "s" : "") + " : " + outcome.message + " (renvoyé au prochain dessin)");
    }
  }

  function onPlaced(fresh: Map<string, { x: number; y: number }>, replace: boolean): void {
    if (replace) { pending.clear(); replacing = true; }
    fresh.forEach((point, hostname) => pending.set(hostname, { hostname, x: point.x, y: point.y }));
    const what = replace ? "placement recalculé" : placed(fresh.size);
    if (!placer) {
      if (model.placement) hooks.note(what + " ici, non mémorisé" + (fresh.size > 1 && !replace ? "s" : "") + " (page sans serveur)");
      return;
    }
    queue = queue.then(() => send(replace, what)).catch(() => undefined);
  }

  const replaceTitle = (): string => "recalcule tout le placement autour des épingles enregistrées ; les déplacements non enregistrés sont oubliés"
    + (placer ? ", et le nouveau placement remplace celui mémorisé, pour tout le monde" : "");

  return { onPlaced, replaceTitle, needsConfirmation: () => !!placer };
}

export const placement = { createPlacementHost, MAX_RETRIES };
