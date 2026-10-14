// Ce que le survol montre (lot 1 de docs/11), la partie pure. Les marques de la cible d'un bout de connecteur : quand
// un bout se tire (brouillon de l'outil, bout d'un connecteur existant) ou que l'outil connecteur est armé, l'élément
// visé montre deux cibles distinctes, comme draw.io : son contour en accent = le bout sera `auto` (flottant, il suit
// l'autre bout), ses quatre ancres = un bout fixe, celle à portée grossit. Et la bulle : jamais sur ce qui est
// sélectionné, jamais pendant un geste (glissé, redimensionnement, rectangle, brouillon) ni un éditeur en place ouvert.
// Testé sous Node (`LDApp.hover`).
import type { Anchor, FixedSide } from "../../canvas/connectors";
import type { Candidate, Pick } from "./snap";

/** Les marques d'une cible : l'élément, son contour (`floating` : le bout s'y posera en `auto`), ses ancres, celle à portée. */
export interface Marks { target: Candidate; floating: boolean; anchors: Anchor[]; near: FixedSide | null }

/** Les marques de ce que vise un bout (rien si le bout ne vise aucun élément). */
export function marksOf(pick: Pick | null): Marks | null {
  if (!pick || !pick.target) return null;
  const floating = pick.end.kind !== "free" && pick.end.side === "auto";
  return { target: pick.target, floating, anchors: pick.anchors, near: pick.snapped ? pick.snapped.side : null };
}

/** Deux marques qui se dessinent pareil (la toile ne se redessine pas à chaque pixel du pointeur). */
export const marksKey = (marks: Marks | null): string => (marks ? [marks.target.kind, marks.target.ref, marks.floating ? "auto" : "-", marks.near || "-",
  marks.target.frame.x, marks.target.frame.y, marks.target.frame.w, marks.target.frame.h].join("|") : "");

/** La clé de bulle (`node:…`, `link:…`, `annotation:…`) de chaque élément sélectionné. */
export function selectedTipKeys(selected: { kind: string; id: string }[]): Set<string> {
  return new Set(selected.map((s) => s.kind + ":" + s.id));
}

/** La bulle de cet élément peut-elle se montrer : non s'il est sélectionné, non pendant un geste ou une édition en place. */
export const tipAllowed = (key: string, selected: Set<string>, busy: boolean): boolean => !busy && !selected.has(key);

export const hover = { marksOf, marksKey, selectedTipKeys, tipAllowed };
