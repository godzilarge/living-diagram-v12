// Le dessin de la bulle au survol : une grammaire de blocs (tip.ts dit quoi, ici on dit où), posée dans un groupe
// SVG en coordonnées d'écran, jamais un style en ligne (la CSP par empreinte n'en admet aucun). Un en-tête (titre en
// Inter, pastilles, sous-titre), de l'air, un tableau « libellé | valeur | valeur » dont les colonnes s'alignent sur
// la largeur estimée des textes (chasse fixe pour les valeurs, classes de caractères pour l'Inter : rien n'est
// mesuré, le faux DOM des tests et le navigateur font la même bulle), des notes, un filet puis le verdict.
// Orhan, 2026-10-09 : « pas moderne, aucun alignement : un mode tableau » ; puis « encore gros bloc, lourd, entassé,
// ça manque de structure, d'aération » : trois rôles de texte (identité 13, donnée 12, méta 11), un rythme (lignes
// de 23, marges de 16 × 14, colonnes à 28), la blancheur sépare l'en-tête du tableau, un filet avant le verdict seul.
// Critique du même jour : la bulle se pose (elle ne suit plus le pointeur tant que l'élément ne change pas), une
// rangée visée par un contrôle porte son point de gravité et ses valeurs teintées, la gravité d'un contrôle s'écrit.
import { monoWidth, textWidth } from "./card";
import { clear, s } from "./dom";
import { SEVERITY_LABEL } from "./format";
import { glyph, SIZE as GLYPH_SIZE } from "./icons";
import { PILL_H, PILL_PAD, pillWidth } from "./pill";

export type Tone = "neutral" | "muted" | "ok" | "danger" | "warning" | "structure" | "accent" | "observed" | "documented" | "added" | "changed" | "removed" | "info";
export type Dot = "ok" | "danger" | "warning" | "muted";
export interface Pill { text: string; tone: Tone; dashed?: boolean }
/** Une valeur de tableau : un texte en chasse fixe, un point d'état devant, un complément discret après ; `tone`
 *  quand un contrôle vise la rangée (les deux valeurs se teintent de sa gravité). */
export interface Value { text: string; dot?: Dot | null; sub?: string | null; muted?: boolean; tone?: "warning" | "error" | null }
/** Un bout en colonne : le nom, le port dessous, et une note sous le port quand le port n'est pas dans `interfaces[]`. */
export interface End { name: string; port: string | null; muted?: boolean; note?: string | null }
/** L'icône d'en-tête : le câble dessiné dont les deux points prennent la teinte des deux équipements, le glyphe de
 *  type d'un équipement à sa teinte, ou un trait (faisceau, cluster, groupe, note, connecteur). */
export type HeadIcon =
  | { kind: "link"; hues: [string, string] }
  | { kind: "type"; type: string | null; hue: string }
  | { kind: "beam" | "cluster" | "group" | "note" | "connector" };
export type Block =
  | { kind: "head"; title: string; pills: Pill[]; sub: string | null; icon: HeadIcon | null }
  | { kind: "ends"; icon: HeadIcon; ends: End[]; pills?: Pill[] }
  | { kind: "row"; label: string; values: Value[]; mono?: boolean; dot?: Dot | null }
  | { kind: "pills"; pills: Pill[]; text: string | null; mono?: boolean }
  | { kind: "note"; text: string; tone?: Tone }
  | { kind: "checks"; items: { severity: string; code: string; count: number }[]; rest: number }
  | { kind: "space" }
  | { kind: "rule" };

// Les mesures, en pixels d'écran. Trois tailles de texte : l'identité (13, Inter 600), la donnée (12, chasse fixe),
// la méta (11 : libellés en Inter, port sous un nom en chasse fixe, compléments).
const PAD_X = 16, PAD_Y = 14, RX = 10;
const TITLE_PX = 13, VALUE_PX = 12, META_PX = 11;
const H_TITLE = 22, H_SUB = 18, H_SPACE = 12, H_RULE = 25, H_ENDS = 36, H_END_NOTE = 16, H_ROW = 23, H_NOTE = 20, H_PILLS = 28;
// Les lignes de base, depuis le haut de leur bloc.
const BASE_TITLE = 15, BASE_SUB = H_TITLE + 13, BASE_END_NAME = 14, BASE_END_PORT = 31, BASE_END_NOTE = 46, BASE_ROW = 15, BASE_NOTE = 14, BASE_PILLS = 18, RULE_Y = 12.5, DOT_Y = 11;
const ICON = 18, ICON_GRID = 16, ICON_GAP = 10, PILL_GAP = 6, LABEL_GAP = 20, COL_GAP = 28, DOT_R = 3, DOT_W = 12, SUB_GAP = 8, SEV_GAP = 10;
const OFFSET = 14;
const BOLD = 1.05; // l'Inter 600 est ~5 % plus large que l'estimation de card.ts (faite sur la carte en 400)

const valueWidth = (v: Value): number => (v.dot ? DOT_W : 0) + monoWidth(v.text, VALUE_PX) + (v.sub ? SUB_GAP + textWidth(v.sub, META_PX) : 0);
const titleWidth = (text: string): number => Math.ceil(textWidth(text, TITLE_PX) * BOLD);
const endWidth = (e: End): number => Math.max(titleWidth(e.name), e.port ? monoWidth(e.port, META_PX) : 0, e.note ? textWidth(e.note, META_PX) : 0);
/** Les pastilles d'une rangée, espacées, sans espace de fin. */
const pillsWidth = (pills: Pill[]): number => (pills.length ? pills.reduce((sum, p) => sum + pillWidth(p.text.toUpperCase()), 0) + PILL_GAP * (pills.length - 1) : 0);
const sevLabel = (severity: string): string => SEVERITY_LABEL[severity] || severity;
const hasEndNotes = (b: Extract<Block, { kind: "ends" }>): boolean => b.ends.some((e) => !!e.note);

interface Columns { label: number; values: number[] }

/** Les colonnes du tableau : le libellé (ou l'icône des bouts, ou le point d'une rangée visée), puis une par valeur ;
 *  la plus large de chaque. */
export function columns(blocks: Block[]): Columns {
  const cols: Columns = { label: 0, values: [] };
  const dotted = blocks.some((b) => b.kind === "row" && b.dot);
  for (const b of blocks) {
    if (b.kind === "ends") {
      cols.label = Math.max(cols.label, ICON);
      b.ends.forEach((e, i) => { cols.values[i] = Math.max(cols.values[i] || 0, endWidth(e)); });
      if (b.pills && b.pills.length) { const last = b.ends.length - 1; cols.values[last] = Math.max(cols.values[last] || 0, titleWidth(b.ends[last].name) + PILL_GAP + pillsWidth(b.pills)); }
    } else if (b.kind === "row") {
      cols.label = Math.max(cols.label, (dotted ? DOT_W : 0) + (b.mono ? monoWidth(b.label, VALUE_PX) : textWidth(b.label, VALUE_PX)));
      b.values.forEach((v, i) => { cols.values[i] = Math.max(cols.values[i] || 0, valueWidth(v)); });
    }
  }
  return cols;
}

const tableWidth = (cols: Columns): number => (cols.values.length ? cols.label + LABEL_GAP + cols.values.reduce((sum, w) => sum + w, 0) + COL_GAP * (cols.values.length - 1) : 0);
const checksSevWidth = (items: { severity: string }[]): number => Math.max(0, ...items.map((c) => textWidth(sevLabel(c.severity), META_PX)));

function blockWidth(b: Block): number {
  switch (b.kind) {
    case "head": return Math.max((b.icon ? ICON + ICON_GAP : 0) + titleWidth(b.title) + (b.pills.length ? PILL_GAP + pillsWidth(b.pills) : 0), b.sub ? textWidth(b.sub, META_PX) : 0);
    case "pills": return pillsWidth(b.pills) + (b.text ? PILL_GAP + (b.mono ? monoWidth(b.text, VALUE_PX) : textWidth(b.text, META_PX)) : 0);
    case "note": return textWidth(b.text, META_PX);
    case "checks": {
      const sev = checksSevWidth(b.items);
      return Math.max(0, ...b.items.map((c) => DOT_W + sev + SEV_GAP + monoWidth(c.code, VALUE_PX) + (c.count > 1 ? SUB_GAP + textWidth("×" + c.count, META_PX) : 0)),
        b.rest ? textWidth(restText(b.rest), META_PX) : 0);
    }
    default: return 0; // les blocs du tableau se mesurent ensemble
  }
}

function blockHeight(b: Block): number {
  switch (b.kind) {
    case "head": return H_TITLE + (b.sub ? H_SUB : 0);
    case "ends": return H_ENDS + (hasEndNotes(b) ? H_END_NOTE : 0);
    case "row": return H_ROW;
    case "pills": return H_PILLS;
    case "note": return H_NOTE;
    case "checks": return H_ROW * b.items.length + (b.rest ? H_NOTE : 0);
    case "space": return H_SPACE;
    case "rule": return H_RULE;
  }
}

const restText = (rest: number): string => "… et " + rest + " autre" + (rest > 1 ? "s" : "") + " contrôle" + (rest > 1 ? "s" : "");

/** La taille de la bulle pour ces blocs. */
export function measure(blocks: Block[]): { width: number; height: number } {
  const width = Math.max(tableWidth(columns(blocks)), ...blocks.map(blockWidth));
  return { width: 2 * PAD_X + Math.ceil(width), height: 2 * PAD_Y + blocks.reduce((sum, b) => sum + blockHeight(b), 0) };
}

// Les icônes d'en-tête, sur une grille de 16, en trait (1,75) : deux câbles côte à côte pour un faisceau, deux
// cadres liés pour un cluster, un cadre pointillé pour un groupe, une note cornée, une courbe à deux bouts pour un
// connecteur ; le câble a ses deux points à la teinte des deux équipements ; l'icône d'un type reprend le glyphe plein
// des cartes (icons.ts), à sa teinte.
const STROKE_ICONS: Record<"beam" | "cluster" | "group" | "note" | "connector", () => SVGElement[]> = {
  beam: () => [s("path", { d: "M2.5 10.5 8.5 4.5" }), s("path", { d: "M7.5 13.5 13.5 7.5" }), s("circle", { cx: 2.5, cy: 10.5, r: 1.3 }), s("circle", { cx: 13.5, cy: 7.5, r: 1.3 })],
  cluster: () => [s("rect", { x: 2.5, y: 5.5, width: 8, height: 8, rx: 1.6 }), s("path", { d: "M5.5 5.5V4a1.5 1.5 0 0 1 1.5-1.5H12A1.5 1.5 0 0 1 13.5 4v5a1.5 1.5 0 0 1-1.5 1.5h-1.5" })],
  group: () => [s("rect", { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, "stroke-dasharray": "2.5 2" })],
  note: () => [s("path", { d: "M3 2.5h10v7l-3 3H3z" }), s("path", { d: "M10 12.5v-3h3" })],
  connector: () => [s("circle", { cx: 3.5, cy: 12.5, r: 2 }), s("circle", { cx: 12.5, cy: 3.5, r: 2 }), s("path", { d: "M3.5 10.5C3.5 6 6 3.5 10.5 3.5" })],
};
function icon(which: HeadIcon, x: number, y: number): SVGGElement {
  const k = ICON / ICON_GRID;
  if (which.kind === "type") {
    const g = glyph(which.type), kk = ICON / GLYPH_SIZE;
    return s("g", { class: "tip-icon type-icon hue-" + which.hue, transform: `translate(${x},${y}) scale(${kk})` },
      s("path", { class: "icon-body", d: g.body }), s("path", { class: "icon-shade", d: g.shade }), s("path", { class: "icon-mark", d: g.mark }));
  }
  if (which.kind === "link") {
    return s("g", { class: "tip-icon tip-icon-link", transform: `translate(${x},${y}) scale(${k})` },
      s("path", { d: "M5.2 10.8 10.8 5.2" }),
      s("circle", { class: "tip-end-dot hue-" + which.hues[0], cx: 3.5, cy: 12.5, r: 2.4 }),
      s("circle", { class: "tip-end-dot hue-" + which.hues[1], cx: 12.5, cy: 3.5, r: 2.4 }));
  }
  return s("g", { class: "tip-icon tip-icon-" + which.kind, transform: `translate(${x},${y}) scale(${k})` }, ...STROKE_ICONS[which.kind]());
}

function pill(p: Pill, x: number, y: number): SVGGElement {
  const label = p.text.toUpperCase(), w = pillWidth(label);
  return s("g", { class: "pill-svg tone-" + p.tone + (p.dashed ? " dashed" : "") },
    s("rect", { class: "pill-box", x: x + 0.5, y: y + 0.5, width: w - 1, height: PILL_H - 1, rx: (PILL_H - 1) / 2 }),
    s("text", { x: x + PILL_PAD, y: y + 14 }, label));
}
function pillRow(pills: Pill[], x: number, y: number, into: SVGGElement): number {
  pills.forEach((p, i) => { into.appendChild(pill(p, x, y)); x += pillWidth(p.text.toUpperCase()) + (i < pills.length - 1 ? PILL_GAP : 0); });
  return x;
}
const dot = (cls: string, x: number, y: number): SVGCircleElement => s("circle", { class: "tip-dot " + cls, cx: x + DOT_R + 1, cy: y + DOT_Y, r: DOT_R });
function value(v: Value, x: number, y: number, into: SVGGElement): void {
  if (v.dot) { into.appendChild(dot("dot-" + v.dot, x, y)); x += DOT_W; }
  into.appendChild(s("text", { class: "tip-value" + (v.muted ? " tip-muted" : "") + (v.tone ? " sev-" + v.tone : ""), x, y: y + BASE_ROW }, v.text));
  if (v.sub) into.appendChild(s("text", { class: "tip-sub", x: x + monoWidth(v.text, VALUE_PX) + SUB_GAP, y: y + BASE_ROW }, v.sub));
}

function drawEnds(b: Extract<Block, { kind: "ends" }>, cols: Columns, valueX: (i: number) => number, y: number, body: SVGGElement): void {
  body.appendChild(icon(b.icon, PAD_X + (cols.label - ICON) / 2, y + (H_ENDS - ICON) / 2 - 1));
  b.ends.forEach((e, i) => {
    body.appendChild(s("text", { class: "tip-title" + (e.muted ? " tip-muted" : ""), x: valueX(i), y: y + BASE_END_NAME }, e.name));
    if (e.port) body.appendChild(s("text", { class: "tip-port", x: valueX(i), y: y + BASE_END_PORT }, e.port));
    if (e.note) body.appendChild(s("text", { class: "tip-end-note", x: valueX(i), y: y + BASE_END_NOTE }, e.note));
  });
  if (b.pills && b.pills.length) { const last = b.ends.length - 1; pillRow(b.pills, valueX(last) + titleWidth(b.ends[last].name) + PILL_GAP, y + BASE_END_NAME - PILL_H + 5, body); }
}

function drawChecks(b: Extract<Block, { kind: "checks" }>, y: number, body: SVGGElement): void {
  const sev = checksSevWidth(b.items);
  b.items.forEach((c, i) => {
    const top = y + H_ROW * i, codeX = PAD_X + DOT_W + sev + SEV_GAP;
    body.appendChild(dot("severity-" + c.severity, PAD_X, top));
    body.appendChild(s("text", { class: "tip-sev severity-" + c.severity, x: PAD_X + DOT_W, y: top + BASE_ROW }, sevLabel(c.severity)));
    body.appendChild(s("text", { class: "tip-code", x: codeX, y: top + BASE_ROW }, c.code));
    if (c.count > 1) body.appendChild(s("text", { class: "tip-sub", x: codeX + monoWidth(c.code, VALUE_PX) + SUB_GAP, y: top + BASE_ROW }, "×" + c.count));
  });
  if (b.rest) body.appendChild(s("text", { class: "tip-note", x: PAD_X, y: y + H_ROW * b.items.length + BASE_NOTE }, restText(b.rest)));
}

/** Dessine les blocs dans `body` (vidé d'abord, la boîte remise), et rend la taille de la bulle. */
export function draw(body: SVGGElement, box: SVGRectElement, blocks: Block[]): { width: number; height: number } {
  clear(body).appendChild(box);
  const size = measure(blocks), cols = columns(blocks);
  const dotted = blocks.some((b) => b.kind === "row" && b.dot);
  const valueX = (i: number): number => PAD_X + cols.label + LABEL_GAP + cols.values.slice(0, i).reduce((sum, w) => sum + w + COL_GAP, 0);
  let y = PAD_Y;
  for (const b of blocks) {
    if (b.kind === "head") {
      let x = PAD_X;
      if (b.icon) { body.appendChild(icon(b.icon, x, y + (H_TITLE - ICON) / 2)); x += ICON + ICON_GAP; }
      body.appendChild(s("text", { class: "tip-title", x, y: y + BASE_TITLE }, b.title));
      if (b.pills.length) pillRow(b.pills, x + titleWidth(b.title) + PILL_GAP, y + (H_TITLE - PILL_H) / 2, body);
      if (b.sub) body.appendChild(s("text", { class: "tip-subtitle", x: PAD_X, y: y + BASE_SUB }, b.sub));
    } else if (b.kind === "ends") {
      drawEnds(b, cols, valueX, y, body);
    } else if (b.kind === "row") {
      if (b.dot) body.appendChild(dot("dot-" + b.dot, PAD_X, y));
      body.appendChild(s("text", { class: b.mono ? "tip-value" : "tip-label", x: PAD_X + (dotted ? DOT_W : 0), y: y + BASE_ROW }, b.label));
      b.values.forEach((v, i) => value(v, valueX(i), y, body));
    } else if (b.kind === "pills") {
      const after = pillRow(b.pills, PAD_X, y + (H_PILLS - PILL_H) / 2, body);
      if (b.text) body.appendChild(s("text", { class: b.mono ? "tip-value" : "tip-subtitle", x: after + PILL_GAP, y: y + BASE_PILLS }, b.text));
    } else if (b.kind === "note") {
      body.appendChild(s("text", { class: "tip-note" + (b.tone ? " tone-" + b.tone : ""), x: PAD_X, y: y + BASE_NOTE }, b.text));
    } else if (b.kind === "checks") {
      drawChecks(b, y, body);
    } else if (b.kind === "rule") {
      body.appendChild(s("line", { class: "tip-rule", x1: PAD_X, x2: size.width - PAD_X, y1: y + RULE_Y, y2: y + RULE_Y }));
    }
    y += blockHeight(b);
  }
  box.setAttribute("width", String(size.width));
  box.setAttribute("height", String(size.height));
  return size;
}

/** Les blocs en texte, une ligne par ligne dessinée : ce que les tests lisent, et ce que la bulle dit en mots. */
export function text(blocks: Block[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.kind === "head") { lines.push([b.title, ...b.pills.map((p) => p.text)].join(" · ")); if (b.sub) lines.push(b.sub); }
    else if (b.kind === "ends") {
      lines.push(b.ends.map((e) => e.name + " · " + (e.port === null ? "?" : e.port)).join(" | ") + (b.pills && b.pills.length ? " · " + b.pills.map((p) => p.text).join(" · ") : ""));
      b.ends.filter((e) => e.note).forEach((e) => lines.push(e.name + " · " + (e.port === null ? "?" : e.port) + " : " + e.note));
    }
    else if (b.kind === "row") lines.push([b.label, ...b.values.map((v) => v.text + (v.sub ? " · " + v.sub : ""))].join(" "));
    else if (b.kind === "pills") lines.push([...b.pills.map((p) => p.text), b.text].filter(Boolean).join(" · "));
    else if (b.kind === "note") lines.push(b.text);
    else if (b.kind === "checks") { b.items.forEach((c) => lines.push(c.severity + " · " + c.code + (c.count > 1 ? " ×" + c.count : ""))); if (b.rest) lines.push(restText(b.rest)); }
  }
  return lines.join("\n");
}

/** La zone où la bulle peut se poser : le canevas, moins ce qui flotte dessus (barres, panneau) quand la page le dit. */
export interface Area { x?: number; y?: number; width: number; height: number }
export interface Tip {
  group: SVGGElement; id: string;
  show: (key: string, blocksOf: () => Block[], x: number, y: number, area: Area) => void;
  hide: () => void;
  /** Retire la bulle du document (une toile qui lâche la page). */
  dispose: () => void;
}

// La bulle elle-même. `show` reçoit une clé (l'élément survolé) et une fabrique de blocs : les blocs ne sont
// reconstruits que quand l'élément change, pas à chaque mouvement du pointeur, et la bulle reste posée là où elle est
// apparue tant que la clé ne change pas (critique du 2026-10-09 : « on a le sentiment de pousser un panneau »). Le
// groupe extérieur porte la place (attribut `transform`), le corps l'arrivée (classe `on`, animée par la feuille de
// style : un attribut et une propriété CSS `transform` ne cohabitent pas sur un même élément).
export function create(svg: SVGSVGElement): Tip {
  const box = s("rect", { class: "tip-box", rx: RX });
  const body = s("g", { class: "tip-body" }, box);
  const group = s("g", { class: "tip", visibility: "hidden", role: "tooltip", id: "ld-tip" }, body);
  svg.appendChild(group);
  let shownFor: string | null = null, size = { width: 0, height: 0 };

  // Près du pointeur, du côté où il reste de la place, et jamais hors de la zone visible, d'aucun côté (revue, B2 ;
  // critique du 2026-10-09 : la zone exclut les barres et le panneau quand la page les déclare).
  function place(x: number, y: number, area: Area): void {
    const x0 = area.x || 0, y0 = area.y || 0, right = x0 + area.width, bottom = y0 + area.height;
    const wanted = { x: x + OFFSET + size.width > right ? x - OFFSET - size.width : x + OFFSET,
      y: y + OFFSET + size.height > bottom ? y - OFFSET - size.height : y + OFFSET };
    const left = Math.max(x0, Math.min(wanted.x, right - size.width));
    const top = Math.max(y0, Math.min(wanted.y, bottom - size.height));
    group.setAttribute("transform", `translate(${Math.round(left)},${Math.round(top)})`);
  }

  function show(key: string, blocksOf: () => Block[], x: number, y: number, area: Area): void {
    const visible = group.getAttribute("visibility") === "visible";
    const fresh = key !== shownFor;
    if (fresh) {
      shownFor = key;
      size = draw(body, box, blocksOf());
    }
    if (fresh || !visible) place(x, y, area);
    if (!visible) group.setAttribute("class", "tip on");
    group.setAttribute("visibility", "visible");
  }

  function hide(): void {
    shownFor = null;
    group.setAttribute("class", "tip");
    group.setAttribute("visibility", "hidden");
  }

  function dispose(): void {
    hide();
    if (group.parentNode) group.parentNode.removeChild(group);
  }

  return { group, id: "ld-tip", show, hide, dispose };
}
