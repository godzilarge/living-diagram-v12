// Les deux écrivains de l'application, mêmes règles que la coquille `/view` : l'écrivain de la couche d'intention
// (opérations sous un nom, envois sérialisés : deux glissés rapprochés partent l'un après l'autre et leurs réponses
// arrivent dans l'ordre ; revue B4, H1) et l'écrivain du placement mémorisé (ce que la page vient de placer, sans nom,
// l'ordre tenu par l'hôte de placement ; un 409 rend le document courant).
import type { Intent, Placement } from "../../canvas/types";
import type { Op, Placer, PlacementWrite, PlaceResult, SaveResult, Writer } from "../../shell/apps";
import { call, explain, isRecord, ROUTES } from "../../shell/http";
import type { Session } from "./client";

/** Ce qui observe les écritures acceptées (la pile d'annulation) : le document avant la requête, puis celui rendu. */
export interface WriteObserver { before: () => Intent | null; after: (ops: Op[], before: Intent | null, intent: Intent) => void }
/** `locked` : l'intention n'a pas pu être lue avec la run ; l'écrivain se tait (son nom se lit vide, `canWrite` est
 *  faux) et refuse d'envoyer, pour ne rien écrire sur un document qu'on n'a pas vu. Le nom est gardé pour la suite. */
export type AppWriter = Writer & { observer: WriteObserver | null; locked: boolean };

export function makeWriter(session: () => Session, author: string, onAuthor: (name: string) => void): AppWriter {
  let queue: Promise<unknown> = Promise.resolve();
  const send = async (ops: Op[]): Promise<SaveResult> => {
    if (me.locked) return { ok: false, message: "intention illisible : modifications coupées" };
    if (!me.author) return { ok: false, message: "donnez votre nom (en haut à droite)" };
    const current = session();
    const observer = me.observer, before = observer ? observer.before() : null; // lu au départ de la requête, dans la file
    try {
      const done = await call(ROUTES.patches, { infrastructure: current.infrastructure }, current.token, { author: me.author, ops });
      if (done.status === 200 && isRecord(done.body)) {
        const intent = done.body as unknown as Intent;
        if (observer) observer.after(ops, before, intent);
        return { ok: true, intent };
      }
      return { ok: false, message: explain(done.status, done.body) };
    } catch (error) { return { ok: false, message: "l'API ne répond pas" }; }
  };
  let name = author;
  const me: AppWriter = {
    get author() { return me.locked ? "" : name; },
    set author(next: string) { name = next; },
    observer: null, locked: false,
    setAuthor: (next) => { name = next; onAuthor(next); },
    save: (ops) => {
      const turn = queue.then(() => send(ops));
      queue = turn.catch(() => undefined);
      return turn;
    },
  };
  return me;
}

export function makePlacer(session: () => Session): Placer {
  const send = async (write: PlacementWrite): Promise<PlaceResult> => {
    const current = session();
    try {
      const done = await call(ROUTES.placement, { infrastructure: current.infrastructure }, current.token, write);
      if (done.status === 200 && isRecord(done.body)) return { ok: true, placement: done.body as unknown as Placement };
      if (done.status === 409 && isRecord(done.body)) return { ok: false, stale: true, placement: done.body as unknown as Placement };
      return { ok: false, message: explain(done.status, done.body) };
    } catch (error) { return { ok: false, message: "l'API ne répond pas" }; }
  };
  return { save: send };
}
