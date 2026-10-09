// Les icônes d'équipement, une par `type` du contrat (switch, router, firewall, load_balancer, wireless_controller,
// server, other) : des glyphes pleins sur une grille de 32 × 32, dessinés ici, sans aucune ressource externe. Le
// vocabulaire est celui des schémas réseau que tout le monde lit (routeur = disque aux quatre flèches, switch = boîte
// aux flèches croisées, firewall = mur de briques, répartiteur = une entrée vers trois sorties, contrôleur Wi-Fi =
// antenne et ondes, serveur = tour à trois unités) ; le dessin est à nous, à plat, en trois couches : la silhouette
// (`body`, la couleur du type), un bandeau d'épaisseur au bas (`shade`, assombri) et le symbole en réserve (`mark`,
// la couleur du fond). Tout est en aplat : net à toute échelle, sans trait qui s'affine quand on dézoome. Le type
// vient du snapshot ; l'icône n'ajoute rien, elle le montre. (Les stencils Visio de Cisco restent la propriété de Cisco
// et ne se modifient pas : ni recolorables au thème, ni à embarquer dans un bundle ; le vocabulaire est commun, pas le dessin.)

export interface Glyph { body: string; shade: string; mark: string }

export const SIZE = 32;
const FOOT = 4; // l'épaisseur du bandeau du bas, en unités de la grille
const n = (v: number): string => String(Math.round(v * 100) / 100);

// Les formes de base : rectangle arrondi, disque, leurs bandeaux du bas, barre, point, flèche pleine, arc épais.
function rrect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${r} ${r} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(y + h)}` +
    `H${n(x + r)}A${r} ${r} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${r} ${r} 0 0 1 ${n(x + r)} ${n(y)}Z`;
}
function rrectFoot(x: number, y: number, w: number, h: number, r: number, foot: number): string {
  const top = y + h - foot, bottom = y + h;
  if (foot >= r) return `M${n(x)} ${n(top)}H${n(x + w)}V${n(bottom - r)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(bottom)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x)} ${n(bottom - r)}Z`;
  const inset = r - Math.sqrt(r * r - (r - foot) * (r - foot)); // le bord du bandeau rencontre l'arc du coin
  return `M${n(x + inset)} ${n(top)}H${n(x + w - inset)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(bottom)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x + inset)} ${n(top)}Z`;
}
const circle = (cx: number, cy: number, r: number): string => `M${n(cx - r)} ${n(cy)}A${r} ${r} 0 1 0 ${n(cx + r)} ${n(cy)}A${r} ${r} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
function circleFoot(cx: number, cy: number, r: number, foot: number): string {
  const dy = r - foot, half = Math.sqrt(r * r - dy * dy);
  return `M${n(cx - half)} ${n(cy + dy)}A${r} ${r} 0 0 0 ${n(cx + half)} ${n(cy + dy)}Z`;
}
const bar = (x: number, y: number, w: number, h: number): string => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
const dot = (cx: number, cy: number, r: number): string => circle(cx, cy, r);
type Pt = [number, number];
const poly = (pts: Pt[]): string => "M" + pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L") + "Z";
// Une flèche pleine de (x1, y1) à sa pointe (x2, y2) : demi-largeur du fût `s`, longueur `hl` et demi-largeur `hw` de la pointe.
function arrow(x1: number, y1: number, x2: number, y2: number, s = 1.3, hl = 5, hw = 3.4): string {
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, px = -uy, py = ux;
  const bx = x2 - ux * hl, by = y2 - uy * hl;
  return poly([[x1 + px * s, y1 + py * s], [bx + px * s, by + py * s], [bx + px * hw, by + py * hw], [x2, y2], [bx - px * hw, by - py * hw], [bx - px * s, by - py * s], [x1 - px * s, y1 - py * s]]);
}
function twoWay(x1: number, y1: number, x2: number, y2: number, s = 1.3, hl = 5, hw = 3.4): string {
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, px = -uy, py = ux;
  const ax = x1 + ux * hl, ay = y1 + uy * hl, bx = x2 - ux * hl, by = y2 - uy * hl;
  return poly([[x1, y1], [ax + px * hw, ay + py * hw], [ax + px * s, ay + py * s], [bx + px * s, by + py * s], [bx + px * hw, by + py * hw], [x2, y2],
    [bx - px * hw, by - py * hw], [bx - px * s, by - py * s], [ax - px * s, ay - py * s], [ax - px * hw, ay - py * hw]]);
}
// Un arc épais (couronne) de `a0` à `a1` degrés, dans le sens des aiguilles d'une montre à l'écran.
function arc(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number): string {
  const p = (r: number, a: number): string => `${n(cx + r * Math.cos((a * Math.PI) / 180))} ${n(cy + r * Math.sin((a * Math.PI) / 180))}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(ro, a0)}A${ro} ${ro} 0 ${large} 1 ${p(ro, a1)}L${p(ri, a1)}A${ri} ${ri} 0 ${large} 0 ${p(ri, a0)}Z`;
}
// Un mur : `rows` rangées de briques, joints de `mortar`, deux joints sur les rangées paires, trois sur les impaires.
function bricks(x: number, y: number, w: number, h: number, rows: number, mortar: number): string {
  const rowH = (h - mortar * (rows - 1)) / rows;
  let d = "";
  for (let r = 1; r < rows; r++) d += bar(x, y + r * rowH + (r - 1) * mortar, w, mortar);
  for (let r = 0; r < rows; r++) {
    const top = y + r * (rowH + mortar), count = r % 2 === 0 ? 2 : 3;
    for (let k = 1; k <= count; k++) d += bar(x + (w * k) / (count + 1) - mortar / 2, top, mortar, rowH);
  }
  return d;
}
// Une tour : `count` unités séparées de `sep`, chacune avec sa diode à gauche et sa fente à droite.
function units(x: number, y: number, w: number, h: number, count: number, sep: number): string {
  const unitH = (h - sep * (count - 1)) / count;
  let d = "";
  for (let u = 0; u < count; u++) {
    const mid = y + u * (unitH + sep) + unitH / 2;
    if (u > 0) d += bar(x, y + u * unitH + (u - 1) * sep, w, sep);
    d += dot(x + 4.5, mid, 1.7) + bar(x + 8, mid - 0.8, w - 12, 1.6);
  }
  return d;
}

const box = (x: number, y: number, w: number, h: number, r: number): Pick<Glyph, "body" | "shade"> => ({ body: rrect(x, y, w, h, r), shade: rrectFoot(x, y, w, h, r, FOOT) });

const GLYPHS: Record<string, Glyph> = {
  switch: { ...box(2, 6, 28, 20, 4), mark: twoWay(6, 10.5, 26, 21.5, 1.2, 4.6, 3.1) + twoWay(6, 21.5, 26, 10.5, 1.2, 4.6, 3.1) },
  // le routeur : deux flèches sortantes à l'horizontale, deux entrantes à la verticale
  router: { body: circle(16, 16, 14), shade: circleFoot(16, 16, 14, FOOT),
    mark: twoWay(4.5, 16, 27.5, 16, 1.3, 4.5, 3.2) + arrow(16, 4.5, 16, 11.5, 1.3, 4.5, 3.2) + arrow(16, 27.5, 16, 20.5, 1.3, 4.5, 3.2) },
  firewall: { ...box(2, 5, 28, 22, 3), mark: bricks(2, 5, 28, 22, 3, 1.8) },
  load_balancer: { ...box(2, 4, 28, 24, 5),
    mark: bar(5, 14.8, 6, 2.4) + dot(12, 16, 2.8) + arrow(12, 16, 25.5, 8.5, 1.2, 4.5, 3) + arrow(12, 16, 26.5, 16, 1.2, 4.5, 3) + arrow(12, 16, 25.5, 23.5, 1.2, 4.5, 3) },
  wireless_controller: { ...box(2, 4, 28, 24, 5), mark: arc(16, 17, 12, 9.6, -140, -40) + arc(16, 17, 7.6, 5.2, -140, -40) + dot(16, 17, 2.5) + bar(14.9, 18, 2.2, 7) },
  server: { ...box(5, 2, 22, 28, 4), mark: units(5, 2, 22, 28, 3, 1.6) },
  other: { ...box(3, 3, 26, 26, 6), mark: dot(9.5, 16, 2.3) + dot(16, 16, 2.3) + dot(22.5, 16, 2.3) },
};
export const LABEL: Record<string, string> = {
  switch: "switch", router: "routeur", firewall: "firewall", load_balancer: "répartiteur", wireless_controller: "contrôleur Wi-Fi", server: "serveur", other: "autre",
};
/** Le glyphe d'épingle, dans le coin haut gauche d'un équipement épinglé (tracé 16 × 16, au trait). */
export const PIN = "M8 1.5a4 4 0 0 1 4 4c0 2.8-4 7.5-4 7.5S4 8.3 4 5.5a4 4 0 0 1 4-4z M8 4a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z";
export const TYPES: string[] = Object.keys(GLYPHS);

// Le glyphe du type demandé, ou celui d'« autre » pour un type inconnu ou absent (un voisin inconnu n'a pas de type).
export const glyph = (type: string | null | undefined): Glyph => (type !== null && type !== undefined && GLYPHS[type]) || GLYPHS.other;
export const known = (type: string): boolean => Object.prototype.hasOwnProperty.call(GLYPHS, type);

export const icons = { glyph, known, LABEL, SIZE, TYPES };
