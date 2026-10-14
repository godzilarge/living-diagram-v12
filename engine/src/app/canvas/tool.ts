// L'outil connecteur (lot 1 de docs/11, décision D3), la partie pure : ce que fait chaque appui, mouvement et relâche
// quand l'outil est armé. Tirer depuis un élément (une ancre à portée : bout fixe ; l'intérieur : bout `auto`) ou depuis
// le fond (bout libre) dessine un connecteur, la relâche le crée ; un clic sans glisser pose le premier bout, le clic
// suivant finit. Ce que vise le pointeur vient de snap.ts (`Pick`) ; rien ici ne touche le DOM ni l'API. Testé sous
// Node (`LDApp.tool`).
import type { End, EndPlace } from "../../canvas/connectors";
import type { Point } from "../../canvas/layout";
import type { EndKind, Pick } from "./snap";

/** À l'écran : au-delà de cette distance, un appui devient un glissé. */
export const DRAG_PX = 4;
/** Dans le plan : deux bouts libres plus proches ne font pas un connecteur (un double clic au même endroit). */
export const MIN_LENGTH = 6;

/** Le départ posé : le bout tel qu'il s'écrira, sa place pour dessiner le brouillon, le point du plan où il a été posé. */
interface Started { start: End; place: EndPlace; from: Point }
export type Phase =
  | { kind: "idle" }
  | ({ kind: "press"; screen: Point } & Started) // bouton enfoncé, pas encore glissé
  | ({ kind: "drag" } & Started) // glissé depuis l'appui : la relâche crée
  | ({ kind: "pending" } & Started); // premier clic posé : le clic suivant crée
/** Un pas de l'outil : la phase suivante, et le connecteur à créer s'il y en a un. */
export interface Step { phase: Phase; create: { start: End; end: End } | null }

export const IDLE: Phase = { kind: "idle" };
const stay = (phase: Phase): Step => ({ phase, create: null });
const attached = (end: End): end is Exclude<End, { kind: "free" }> => end.kind !== "free";

/** Ce que la cible d'un bout d'arrivée ne peut pas être : l'élément du départ (un connecteur ne relie pas un élément à lui-même). */
export function excludeStart(phase: Phase): (kind: EndKind, ref: string) => boolean {
  if (phase.kind === "idle" || !attached(phase.start)) return () => false;
  const { kind, ref } = phase.start;
  return (k, r) => k === kind && r === ref;
}

// Le bout d'arrivée choisi : un connecteur, sauf deux bouts libres presque confondus (on attend un vrai second point).
function finish(phase: Started, pick: Pick, at: Point, next: Phase): Step {
  if (!attached(phase.start) && !attached(pick.end) && Math.hypot(at.x - phase.from.x, at.y - phase.from.y) < MIN_LENGTH) return stay(next);
  return { phase: IDLE, create: { start: phase.start, end: pick.end } };
}

/** Un appui (bouton principal) : le départ est ce que vise le pointeur ; en attente d'un second clic, il finit. */
export function down(phase: Phase, pick: Pick, at: Point, screen: Point): Step {
  if (phase.kind === "idle") return stay({ kind: "press", start: pick.end, place: pick.place, from: at, screen });
  if (phase.kind === "pending") return finish(phase, pick, at, phase);
  return stay(phase);
}

/** Un mouvement : un appui qui s'éloigne de plus de `DRAG_PX` à l'écran devient un glissé. */
export function move(phase: Phase, screen: Point): Phase {
  if (phase.kind !== "press" || Math.hypot(screen.x - phase.screen.x, screen.y - phase.screen.y) <= DRAG_PX) return phase;
  return { kind: "drag", start: phase.start, place: phase.place, from: phase.from };
}

/** Une relâche : un appui sans glissé pose le départ (on attend le second clic), un glissé crée. */
export function up(phase: Phase, pick: Pick, at: Point): Step {
  if (phase.kind === "press") return stay({ kind: "pending", start: phase.start, place: phase.place, from: phase.from });
  if (phase.kind === "drag") return finish(phase, pick, at, IDLE);
  return stay(phase);
}

/** Le brouillon à dessiner : le départ et sa place, pendant un glissé ou en attente du second clic. */
export const draftOf = (phase: Phase): Started | null => (phase.kind === "drag" || phase.kind === "pending" ? { start: phase.start, place: phase.place, from: phase.from } : null);

export const tool = { DRAG_PX, MIN_LENGTH, IDLE, down, move, up, draftOf, excludeStart };
