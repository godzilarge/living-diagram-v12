// Les annotations (docs/10 §6) : ce que seul l'humain sait, posé sur la toile. Une note, une forme, un tableau ou une
// image, avec une boîte et un ancrage (libre dans le plan ; attachée à un équipement, relative au centre de sa carte ;
// attachée à un groupe, relative au coin haut gauche de son cadre). Ici, la partie pure : énumérations, défauts, la
// boîte depuis l'ancre, le retour à la ligne d'un texte (chasse estimée comme la carte, jamais mesurée), la grille
// d'un tableau (table.ts), la ligne de rappel, les orphelines. Les deux faces et les tests sous Node lisent la même
// géométrie. Les lignes et les flèches sont des connecteurs (connectors.ts) depuis Intent 1.4.0.
import { monoWidth, textWidth } from "./card";
import type { Box } from "./card";
import { dashArray as groupDash } from "./groups";
import type { Point } from "./layout";
import type { Annotation, AnnotationStyle, Model } from "./types";

export const KINDS = ["note", "shape", "table", "image"] as const;
export type AnnotationKind = (typeof KINDS)[number];
export const SHAPES = ["rectangle", "ellipse"] as const;
export const ANCHORS = ["free", "device", "group"] as const;
export const PLANES = ["back", "front"] as const;
export const ALIGNS = ["left", "center", "right"] as const;
export const VALIGNS = ["top", "middle", "bottom"] as const;
export const BOUNDS = { size: [20, 4000], fill_opacity: [0, 100], stroke_width: [0, 8], radius: [0, 80], opacity: [10, 100], text_size: [8, 64] } as const;
export const MAX_NOTE = 2000, MAX_CELL = 120, MAX_ROWS = 30, MAX_COLUMNS = 8, MAX_LABEL = 80;
export const KIND_LABEL: Record<string, string> = { note: "note", shape: "forme", table: "tableau", image: "image" };
export const LABEL: Record<string, string> = {
  rectangle: "rectangle", ellipse: "ellipse",
  free: "libre", device: "équipement", group: "groupe", back: "dessous", front: "dessus",
  left: "gauche", center: "centre", right: "droite", top: "haut", middle: "milieu", bottom: "bas",
};
/** Les défauts du contrat, par sorte (`DEFAULT_ANNOTATION_STYLE`) : le document ne porte que ce qui a été décidé. */
export const DEFAULT_STYLE: Record<AnnotationKind, AnnotationStyle> = {
  note: { hue: "amber", fill_opacity: 12, stroke_width: 1, stroke_style: "solid", radius: 8, opacity: 100, text_size: 13, text_weight: "regular", text_font: "sans", text_color: "ink", text_align: "left", text_valign: "top" },
  shape: { hue: "slate", fill_opacity: 8, stroke_width: 2, stroke_style: "solid", radius: 12, opacity: 100, text_size: 12, text_weight: "semibold", text_font: "sans", text_color: "hue", text_align: "center", text_valign: "middle" },
  table: { hue: "slate", fill_opacity: 0, stroke_width: 1, stroke_style: "solid", radius: 6, opacity: 100, text_size: 12, text_weight: "regular", text_font: "mono", text_color: "ink", text_align: "left", text_valign: "top" },
  image: { hue: "slate", fill_opacity: 0, stroke_width: 0, stroke_style: "none", radius: 8, opacity: 100, text_size: 12, text_weight: "regular", text_font: "sans", text_color: "ink", text_align: "left", text_valign: "top" },
};
export const DEFAULT_SIZE: Record<AnnotationKind, Box> = { note: { w: 220, h: 80 }, shape: { w: 200, h: 120 }, table: { w: 160, h: 52 }, image: { w: 320, h: 240 } };
export const TABLE_CELL_W = 80, TABLE_ROW_H = 26, PAD = 8;

export interface Frame { x: number; y: number; w: number; h: number }
/** Où est l'ancre d'une annotation attachée : le centre et la boîte de la carte d'un équipement, ou le cadre d'un groupe. */
export type AnchorPoint = { kind: "device"; center: Point; box: Box } | { kind: "group"; frame: Frame };

export const kindOf = (a: Annotation): AnnotationKind => a.content.kind;
/** L'équipement qu'une annotation suit, s'il y en a un. */
export const anchorHost = (a: Annotation): string | null => (a.anchor.kind === "device" ? a.anchor.ref : null);
export const anchorGroup = (a: Annotation): string | null => (a.anchor.kind === "group" ? a.anchor.ref : null);

/** Orpheline (A6) : attachée à un équipement absent de la run (ou fantôme), ou à un groupe inconnu ou sans membre présent. */
export function isOrphan(model: Pick<Model, "nodeByHost" | "groupById">, a: Annotation): boolean {
  if (a.anchor.kind === "device") { const node = model.nodeByHost.get(a.anchor.ref || ""); return !node || !!node.ghost; }
  if (a.anchor.kind === "group") {
    const group = model.groupById.get(a.anchor.ref || "");
    return !group || !group.members.some((host) => { const node = model.nodeByHost.get(host); return !!node && !node.ghost; });
  }
  return false;
}

/** La boîte d'une annotation dans le plan (A0) : libre, la sienne ; attachée, relative à son ancre ; sans ancre, rien. */
export function frameOf(a: Annotation, anchor: AnchorPoint | null): Frame | null {
  if (a.anchor.kind === "free") return { x: a.x, y: a.y, w: a.w, h: a.h };
  if (!anchor) return null;
  if (anchor.kind === "device") return { x: Math.round(anchor.center.x + a.x), y: Math.round(anchor.center.y + a.y), w: a.w, h: a.h };
  return { x: anchor.frame.x + a.x, y: anchor.frame.y + a.y, w: a.w, h: a.h };
}
/** L'inverse : la position relative à enregistrer pour une boîte posée là, selon l'ancre. */
export function offsetOf(a: Pick<Annotation, "anchor">, at: Point, anchor: AnchorPoint | null): Point {
  if (a.anchor.kind === "free" || !anchor) return { x: Math.round(at.x), y: Math.round(at.y) };
  if (anchor.kind === "device") return { x: Math.round(at.x - anchor.center.x), y: Math.round(at.y - anchor.center.y) };
  return { x: Math.round(at.x - anchor.frame.x), y: Math.round(at.y - anchor.frame.y) };
}
/** La boîte de l'ancre elle-même (pour la ligne de rappel). */
export const anchorRect = (anchor: AnchorPoint): Frame => (anchor.kind === "group" ? anchor.frame
  : { x: anchor.center.x - anchor.box.w / 2, y: anchor.center.y - anchor.box.h / 2, w: anchor.box.w, h: anchor.box.h });

const widthOf = (text: string, style: Pick<AnnotationStyle, "text_size" | "text_font">): number =>
  (style.text_font === "mono" ? monoWidth(text, style.text_size) : textWidth(text, style.text_size));
/** La hauteur d'une ligne de texte : 1,35 fois la taille. */
export const lineHeight = (size: number): number => Math.round(size * 1.35);

/** Le retour à la ligne d'un texte dans une largeur : par mots, un mot trop long coupé ; les retours écrits sont gardés. */
export function wrapText(text: string, width: number, style: Pick<AnnotationStyle, "text_size" | "text_font">): string[] {
  const out: string[] = [];
  const fits = (s: string): boolean => widthOf(s, style) <= width;
  text.split("\n").forEach((paragraph) => {
    let line = "";
    paragraph.split(" ").forEach((word) => {
      const candidate = line ? line + " " + word : word;
      if (fits(candidate)) { line = candidate; return; }
      if (line) out.push(line);
      line = "";
      let rest = word;
      while (rest && !fits(rest)) { // un mot plus large que la boîte : coupé caractère par caractère
        let cut = 1;
        while (cut < rest.length && fits(rest.slice(0, cut + 1))) cut += 1;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    });
    out.push(line);
  });
  return out;
}

export interface TextLine { text: string; x: number; y: number }
/** Les lignes d'une note ou l'étiquette d'une forme, placées dans la boîte selon l'alignement ; ce qui dépasse en bas
 *  est coupé (le reste se lit dans la fiche). */
export function layoutText(text: string, frame: Frame, style: AnnotationStyle, pad = PAD): { lines: TextLine[]; anchor: "start" | "middle" | "end"; clipped: boolean } {
  const inner = Math.max(10, frame.w - 2 * pad);
  const all = wrapText(text, inner, style);
  const lh = lineHeight(style.text_size);
  const max = Math.max(1, Math.floor((frame.h - 2 * pad) / lh));
  const kept = all.slice(0, max);
  const block = kept.length * lh;
  const top = style.text_valign === "top" ? pad : style.text_valign === "bottom" ? frame.h - pad - block : (frame.h - block) / 2;
  const x = style.text_align === "left" ? pad : style.text_align === "right" ? frame.w - pad : frame.w / 2;
  const anchor = style.text_align === "left" ? "start" : style.text_align === "right" ? "end" : "middle";
  return { lines: kept.map((line, i) => ({ text: line, x: Math.round(x), y: Math.round(top + i * lh + style.text_size) })), anchor, clipped: all.length > kept.length };
}

/** Une cellule tronquée à sa colonne, avec une ellipse. */
export function fitCell(text: string, width: number, style: Pick<AnnotationStyle, "text_size" | "text_font">): string {
  if (widthOf(text, style) <= width) return text;
  let cut = text.length;
  while (cut > 0 && widthOf(text.slice(0, cut) + "…", style) > width) cut -= 1;
  return cut ? text.slice(0, cut) + "…" : "";
}

export interface Segment { x1: number; y1: number; x2: number; y2: number }

/** Le point du bord d'une boîte sur la droite de son centre vers `toward`. */
export function borderPoint(rect: Frame, toward: Point): Point {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, dx = toward.x - cx, dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const t = Math.min(dx ? rect.w / 2 / Math.abs(dx) : Infinity, dy ? rect.h / 2 / Math.abs(dy) : Infinity);
  return { x: Math.round(cx + dx * t), y: Math.round(cy + dy * t) };
}
/** La ligne de rappel (A5) : du bord de la boîte au bord de l'ancre, en coordonnées du plan ; rien si elles se touchent. */
export function leaderOf(frame: Frame, anchor: Frame): Segment | null {
  const from = borderPoint(frame, { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 });
  const to = borderPoint(anchor, { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 });
  const overlap = frame.x < anchor.x + anchor.w && anchor.x < frame.x + frame.w && frame.y < anchor.y + anchor.h && anchor.y < frame.y + frame.h;
  if (overlap || Math.hypot(to.x - from.x, to.y - from.y) < 6) return null;
  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
}

export const dashArray = (style: Pick<AnnotationStyle, "stroke_style" | "stroke_width">): string | null => groupDash(style);
/** Une annotation attachée se dessine quand son ancre est dessinée (A1) ; libre, toujours. */
export function shownWith(a: Annotation, shownHosts: Set<string>, drawnGroups: Set<string>): boolean {
  if (a.anchor.kind === "device") return shownHosts.has(a.anchor.ref || "");
  if (a.anchor.kind === "group") return drawnGroups.has(a.anchor.ref || "");
  return true;
}
/** Un résumé d'une ligne pour une liste ou une bulle. */
export function summary(a: Annotation): string {
  const c = a.content;
  if (c.kind === "note") return c.text.split("\n")[0].slice(0, 60);
  if (c.kind === "shape") return (LABEL[c.shape] || c.shape) + (c.label ? " · " + c.label : "");
  if (c.kind === "table") return c.rows.length + " × " + (c.rows[0] ? c.rows[0].length : 0) + (c.header && c.rows[0] ? " · " + c.rows[0].join(" | ").slice(0, 40) : "");
  return c.alt || "image";
}
/** La version du dessin d'une annotation pour une clé (contenu, boîte, style, ancre) : change quand elle change. */
export const signature = (a: Annotation): string => JSON.stringify([a.anchor, a.x, a.y, a.w, a.h, a.z, a.locked, a.leader, a.content, a.style]);

export const annotations = { KINDS, SHAPES, ANCHORS, PLANES, ALIGNS, VALIGNS, BOUNDS, KIND_LABEL, LABEL, DEFAULT_STYLE, DEFAULT_SIZE, TABLE_CELL_W, TABLE_ROW_H, kindOf, anchorHost, anchorGroup, isOrphan, frameOf, offsetOf, anchorRect, borderPoint, wrapText, layoutText, lineHeight, fitCell, leaderOf, dashArray, shownWith, summary, signature };
