// Les groupes (docs/10 §5), la partie pure : un groupe est une liste de membres et un style ; son cadre se calcule
// depuis les cartes de ses membres présents (jamais stocké, jamais une forme libre), son étiquette s'ancre sur le cadre
// selon le style. Les énumérations et leurs libellés sont ceux du contrat Intent 1.2.0 ; les défauts sont ceux que le
// serveur applique à la création (`DEFAULT_GROUP_STYLE` côté contrat).
import type { Box } from "./card";
import type { Point } from "./layout";
import type { Group, GroupStyle, Model } from "./types";

export const SHAPES = ["rectangle", "ellipse"] as const;
export const STROKES = ["solid", "dashed", "dotted", "none"] as const;
export const POSITIONS = ["top_left", "top", "top_right", "left", "center", "right", "bottom_left", "bottom", "bottom_right"] as const;
export const PLACEMENTS = ["inside", "outside"] as const;
export const WEIGHTS = ["regular", "semibold", "bold"] as const;
export const FONTS = ["sans", "mono"] as const;
export const LABEL_COLORS = ["hue", "ink"] as const;
export const BOUNDS = { radius: [0, 80], fill_opacity: [0, 100], stroke_width: [0, 8], padding: [0, 300], label_size: [8, 64] } as const;
export const DEFAULT_STYLE: GroupStyle = {
  shape: "rectangle", radius: 16, hue: "slate", fill_opacity: 8, stroke_width: 2, stroke_style: "dashed", padding: 24,
  label_position: "top_left", label_placement: "inside", label_size: 12, label_weight: "semibold", label_font: "sans", label_color: "hue",
};
export const STYLE_LABEL: Record<string, string> = {
  rectangle: "rectangle", ellipse: "ellipse", solid: "plein", dashed: "tirets", dotted: "pointillés", none: "sans bordure",
  top_left: "haut gauche", top: "haut", top_right: "haut droite", left: "gauche", center: "centre", right: "droite",
  bottom_left: "bas gauche", bottom: "bas", bottom_right: "bas droite", inside: "dedans", outside: "dehors",
  regular: "normal", semibold: "demi-gras", bold: "gras", sans: "sans", mono: "mono", hue: "teinte", ink: "encre",
};
export const WEIGHT_VALUE: Record<string, number> = { regular: 450, semibold: 600, bold: 750 };

export interface Frame { x: number; y: number; w: number; h: number }

/** Les membres d'un groupe présents dans la run (un fantôme ou un absent est orphelin). */
export const presentMembers = (model: Pick<Model, "nodeByHost">, group: Group): string[] =>
  group.members.filter((host) => { const node = model.nodeByHost.get(host); return !!node && !node.ghost; });
export const orphanMembers = (model: Pick<Model, "nodeByHost">, group: Group): string[] =>
  group.members.filter((host) => { const node = model.nodeByHost.get(host); return !node || !!node.ghost; });

/** L'enveloppe d'un groupe (G0) : la boîte des cartes de ses membres présents, élargie de la marge ; pour une ellipse, la
 *  boîte de l'ellipse circonscrite à cette boîte (demi-axes × √2). Entière, comme tout ce qui est dessiné. */
export function frameOf(centers: Point[], boxes: Box[], style: Pick<GroupStyle, "shape" | "padding">): Frame | null {
  if (!centers.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  centers.forEach((center, i) => {
    const box = boxes[i] || { w: 0, h: 0 };
    x0 = Math.min(x0, center.x - box.w / 2); x1 = Math.max(x1, center.x + box.w / 2);
    y0 = Math.min(y0, center.y - box.h / 2); y1 = Math.max(y1, center.y + box.h / 2);
  });
  let x = x0 - style.padding, y = y0 - style.padding, w = x1 - x0 + 2 * style.padding, h = y1 - y0 + 2 * style.padding;
  if (style.shape === "ellipse") {
    const cx = x + w / 2, cy = y + h / 2;
    w *= Math.SQRT2; h *= Math.SQRT2; x = cx - w / 2; y = cy - h / 2;
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

export interface LabelSlot { x: number; y: number; anchor: "start" | "middle" | "end"; baseline: "hanging" | "middle" | "alphabetic" }
/** Où l'étiquette s'écrit, dans le repère du cadre (0, 0 = coin haut gauche) : neuf positions, dedans ou dehors ; dans
 *  une ellipse, un coin intérieur rentre jusqu'à la courbe. */
export function labelSlot(frame: Frame, style: Pick<GroupStyle, "shape" | "label_position" | "label_placement" | "label_size">): LabelSlot {
  const m = Math.max(8, Math.round(style.label_size * 0.6));
  const inside = style.label_placement === "inside";
  const pos = style.label_position;
  const col = pos === "left" || pos.endsWith("_left") ? "left" : pos === "right" || pos.endsWith("_right") ? "right" : "center";
  const row = pos.startsWith("top") ? "top" : pos.startsWith("bottom") ? "bottom" : "middle";
  const corner = style.shape === "ellipse" && inside && col !== "center" && row !== "middle";
  const ix = m + (corner ? frame.w * 0.146 : 0), iy = m + (corner ? frame.h * 0.146 : 0);
  let x = col === "left" ? (inside ? ix : -m) : col === "right" ? (inside ? frame.w - ix : frame.w + m) : frame.w / 2;
  let anchor: LabelSlot["anchor"] = col === "left" ? "start" : col === "right" ? "end" : "middle";
  if (!inside && row !== "middle" && col !== "center") { x = col === "left" ? 0 : frame.w; } // dehors, en haut ou en bas : aligné sur le bord
  if (!inside && row === "middle" && col !== "center") anchor = col === "left" ? "end" : "start"; // dehors, à gauche ou à droite du cadre
  const y = row === "top" ? (inside ? iy : -m) : row === "bottom" ? (inside ? frame.h - iy : frame.h + m) : frame.h / 2;
  const baseline: LabelSlot["baseline"] = row === "middle" ? "middle" : row === "top" ? (inside ? "hanging" : "alphabetic") : inside ? "alphabetic" : "hanging";
  return { x: Math.round(x), y: Math.round(y), anchor, baseline };
}

/** Le motif de la bordure : tirets et pointillés proportionnés à l'épaisseur ; `null` = plein. */
export const dashArray = (style: Pick<GroupStyle, "stroke_style" | "stroke_width">): string | null => {
  const k = Math.max(1, style.stroke_width);
  if (style.stroke_style === "dashed") return `${4 * k} ${2.5 * k}`;
  if (style.stroke_style === "dotted") return `${0.1 * k} ${2.2 * k}`;
  return null;
};

export const groups = { SHAPES, STROKES, POSITIONS, PLACEMENTS, WEIGHTS, FONTS, LABEL_COLORS, BOUNDS, DEFAULT_STYLE, STYLE_LABEL, WEIGHT_VALUE, presentMembers, orphanMembers, frameOf, labelSlot, dashArray };
