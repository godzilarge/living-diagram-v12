// La barre contextuelle flottante (lot 4 de docs/11), la partie pure : quels boutons pour quelle sélection et quel
// droit, et où la poser. Les réglages fréquents de l'élément sélectionné, à un clic, au-dessus de lui ; tout ce qu'elle
// fait, l'inspecteur le fait (mêmes commandes du store, mêmes écritures, même historique) : ce module ne dit que quoi,
// `components/FloatingBar.tsx` exécute. Rendu validé le 2026-10-14.
// Sans DOM ni React, testé sous Node (`LDApp.floating`).
import { HUE_LABEL, defaultHue, hueOfNode } from "../../canvas/hues";
import type { Point } from "../../canvas/layout";
import type { Annotation, Connector, Group, Model, Selection } from "../../canvas/types";
import { t } from "../../i18n";
import { size } from "./selection";
import type { Multi } from "./selection";
import { codeEntries } from "./code-bar";
import { textEntries } from "./text-bar";
import { carriesText, itemsOf } from "./text-format";
import type { Mixed, PositionKind, TextPosition } from "./text-format";

// ——— Quoi ———

/** Les icônes Lucide de la barre, par nom (le composant les dessine). */
export type IconName = "textSize" | "bold" | "alignLeft" | "alignCenter" | "alignRight" | "layers" | "lock" | "unlock" | "duplicate" | "delete"
  | "addRow" | "addColumn" | "header" | "replace" | "reverse" | "selectMembers" | "paint" | "pin" | "unpin" | "group"
  | "note" | "connect" | "hide" | "isolate" | "align" | "highlighter" | "listOrdered" | "fitHeight"
  | "italic" | "underline" | "strike" | "textColor" | "labelPlace" | "wrap" | "search" | "abandon" | "save";
/** Les glyphes dessinés à la main (ce que Lucide n'a pas) : ils montrent la valeur posée sur le bouton. */
export type GlyphName = "fill" | "border" | "corners" | "heads" | "route" | "widths" | "strokes" | "width" | "stroke" | "shape" | "opacity" | "position" | "plane";
export type Face =
  | { kind: "icon"; icon: IconName }
  | { kind: "glyph"; glyph: GlyphName; value: string }
  /** La teinte : une pastille, ou un disque coupé quand la sélection en mêle plusieurs (les deux premières). */
  | { kind: "hue"; hues: string[] }
  /** Un nom écrit sur le bouton (le langage, la police d'un bloc de code, lot 16) ; `hint` : la détection propose autre chose. */
  | { kind: "text"; text: string; font?: string; hint?: boolean }
  /** Une icône et la valeur posée (« AA 13 », la taille d'un bloc de code : critique du 2026-10-15, comme le prototype). */
  | { kind: "value"; icon: IconName; text: string };
export interface Choice { value: string; label: string; num?: string; glyph?: GlyphName; icon?: IconName }
export type Volet =
  | { kind: "hue"; value: string | null; inherited: string | null; allowDefault: boolean }
  | { kind: "choice"; title: string; value: string; options: Choice[] }
  /** `grid` : « mettre en grille » sous les alignements (lot 8 de docs/11 ; trois éléments au moins, comme répartir). */
  | { kind: "align"; count: number; rows: AlignCell[][]; grid: boolean }
  | { kind: "position"; value: string }
  | { kind: "groups"; hosts: string[]; groups: { id: string; label: string }[] }
  | { kind: "codeLanguage"; value: string; text: string } | { kind: "codeFont"; value: string }
  /** La taille libre (lot 4 bis) : « − n + », puis la police (sans / mono d'un texte, les quatre d'un bloc de code) ;
   *  `null` = mixte. */
  | { kind: "textSize"; value: number | null; font: string | null; fonts: "text" | "code" }
  | { kind: "textColor"; value: string | null }
  | { kind: "textPosition"; position: PositionKind; value: Mixed<TextPosition> };
export interface AlignCell { mode: BarAlign; label: string; keys: string; aria: string; distribute: boolean }
/** Un bouton : `id` dit ce qu'il fait (le composant l'exécute), `keys` son raccourci écrit, `aria` le même pour
 *  `aria-keyshortcuts` ; un bouton à volet propose (il n'agit pas seul). */
export interface BarButton { id: string; label: string; face: Face; keys?: string; aria?: string; pressed?: boolean | "mixed"; danger?: boolean; volet?: Volet }
export type BarEntry = BarButton | { id: "sep" };
const SEP: BarEntry = { id: "sep" };

/** Ce que la barre sert : un élément seul (sa sorte), ou une sélection multiple. */
export type Target =
  | { kind: "annotation"; a: Annotation }
  | { kind: "connector"; c: Connector }
  | { kind: "group"; g: Group }
  | { kind: "device"; host: string }
  | { kind: "multi"; multi: Multi };

/** La sélection qui a une barre : une annotation, un connecteur, un groupe, un équipement de la run (ni voisin inconnu,
 *  ni fantôme du diff), ou plusieurs éléments ; jamais un câble, un faisceau, un cluster, un agrégat (ils viennent de la
 *  donnée et ne s'éditent pas). */
export function targetOf(model: Model, selection: Selection | null, multi: Multi): Target | null {
  if (size(multi) >= 2) return { kind: "multi", multi };
  const one = selection;
  if (!one) return null;
  if (one.kind === "annotation") { const a = model.annotationById.get(one.id); return a ? { kind: "annotation", a } : null; }
  if (one.kind === "connector") { const c = model.connectorById.get(one.id); return c ? { kind: "connector", c } : null; }
  if (one.kind === "group") { const g = model.groupById.get(one.id); return g ? { kind: "group", g } : null; }
  if (one.kind === "node") { const n = model.nodeByHost.get(one.id); return n && n.kind !== "stub" && !n.ghost ? { kind: "device", host: one.id } : null; }
  return null;
}

/** La page : la vue (la barre ne vit qu'en Diagramme), le droit d'écrire (un nom, une intention lue), l'outil armé
 *  (qui prend les appuis de la toile), la préférence et le rappel par Alt+T. */
export interface BarContext { editable: boolean; control: boolean; tool: boolean; preferred: boolean; summoned: boolean }
/** La barre se montre-t-elle ? En Contrôle et sans nom : jamais (la fiche dit déjà pourquoi) ; masquée par préférence,
 *  seulement rappelée (Alt+T) pour la sélection en cours. */
export const shows = (ctx: BarContext): boolean => ctx.editable && !ctx.control && !ctx.tool && (ctx.preferred || ctx.summoned);

const L = (key: string, values?: Record<string, unknown>): string => t(("shell:fbar." + key) as never, values as never) as unknown as string;
const icon = (name: IconName): Face => ({ kind: "icon", icon: name });
const glyph = (name: GlyphName, value: string | number): Face => ({ kind: "glyph", glyph: name, value: String(value) });
const button = (id: string, label: string, face: Face, extra: Partial<BarButton> = {}): BarButton => ({ id, label, face, ...extra });
/** Le raccourci écrit et celui d'`aria-keyshortcuts` (« Ctrl+D », « Control+D »). */
const keys = (written: string): Partial<BarButton> => ({ keys: written, aria: ariaKeys(written) });
export const ariaKeys = (written: string): string => written.replace(/Ctrl/g, "Control").replace(/Maj|Shift/g, "Shift").replace(/Suppr|Del/g, "Delete").replace(/Entrée|Enter/g, "Enter");
/** Le bouton teinte, qui dit sa valeur (« teinte : ambre », « teinte : mixte »), comme la taille du texte. */
function hueButton(hues: string[], volet: Extract<Volet, { kind: "hue" }>): BarButton {
  const word = hues.length === 1 ? HUE_LABEL[hues[0] as keyof typeof HUE_LABEL] || hues[0] : L("hueMixed");
  return button("hue", L("hueOf", { value: word }), { kind: "hue", hues }, { volet });
}
const choice = (id: string, label: string, title: string, value: string | number, options: Choice[], face: Face): BarButton =>
  button(id, label, face, { volet: { kind: "choice", title, value: String(value), options } });

// Les valeurs proposées : un petit nombre de crans, la fiche garde le réglage fin (curseurs, valeurs libres). La taille
// du texte est libre (lot 4 bis) : son volet a un champ.
export const FILLS = [0, 25, 50, 100];
export const RADII = [0, 6, 12, 24];
export const OPACITIES = [25, 50, 75, 100];
export const WIDTHS = [1, 2, 3, 4];
const HEAD_CYCLE = ["none/none", "none/arrow", "arrow/none", "arrow/arrow"] as const;
const HEAD_WORD: Record<string, string> = { "none/none": "none", "none/arrow": "end", "arrow/none": "start", "arrow/arrow": "both" };

/** Les annotations : la teinte, puis ce que la sorte a de fréquent, puis son texte (lot 4 bis) ; le plan seulement
 *  quand il dit vrai (une annotation attachée se dessine au-dessus de son ancre, lot 1) ; dupliquer et supprimer au
 *  bout. « Modifier l'étiquette » d'une forme n'est plus dans la barre (double-clic, Entrée, F2). */
function annotationEntries(a: Annotation): BarEntry[] {
  const s = a.style, c = a.content;
  const hue = hueButton([s.hue], { kind: "hue", value: s.hue, inherited: null, allowDefault: false });
  const plane = a.anchor.kind === "free" || a.z === "back"
    ? [choice("plane", L("plane"), L("plane"), a.z, [{ value: "back", label: L("back"), glyph: "plane" }, { value: "front", label: L("front"), glyph: "plane" }], icon("layers"))] : [];
  const lock = button("lock", a.locked ? L("unlock") : L("lock"), icon(a.locked ? "lock" : "unlock"), { pressed: a.locked });
  const dup = button("duplicate", L("duplicate"), icon("duplicate"), keys("Ctrl+D"));
  const del = button("delete", L("delete"), icon("delete"), { ...keys(L("keyDelete")), danger: true });
  if (c.kind === "code") return codeEntries(a, c, { hue, plane, lock, dup, del, sep: SEP }); // lot 16 : code-bar.ts
  const text = carriesText(a) ? [SEP, ...textEntries([{ kind: "annotation", a }])] : [];
  if (c.kind === "note") return [hue, ...text, SEP, ...plane, lock, SEP, dup, del];
  if (c.kind === "shape") {
    const corners = c.shape === "ellipse" ? [] : [choice("radius", L("corners"), L("corners"), s.radius, RADII.map((r) => ({ value: String(r), label: r ? String(r) : L("square"), glyph: "corners" as const })), glyph("corners", s.radius))];
    return [hue,
      choice("fill_opacity", L("fill"), L("fill"), s.fill_opacity, FILLS.map((f) => ({ value: String(f), label: f === 0 ? L("fillNone") : f === 100 ? L("fillFull") : f + " %", glyph: "fill" as const })), glyph("fill", s.fill_opacity)),
      choice("stroke_style", L("border"), L("border"), s.stroke_style, ["solid", "dashed", "dotted", "none"].map((v) => ({ value: v, label: L("stroke." + v), glyph: "border" as const })), glyph("border", s.stroke_style)),
      ...corners, ...text, SEP, ...plane, lock, SEP, dup, del];
  }
  if (c.kind === "table") {
    return [button("add_row", L("addRow"), icon("addRow")), button("add_column", L("addColumn"), icon("addColumn")),
      button("header", L("header"), icon("header"), { pressed: c.header }), SEP, hue, ...text, SEP, ...plane, SEP, del];
  }
  return [button("replace", L("replace"), icon("replace")),
    choice("opacity", L("opacity"), L("opacity"), s.opacity, OPACITIES.map((o) => ({ value: String(o), label: o + " %", glyph: "opacity" as const })), glyph("opacity", s.opacity)),
    SEP, ...plane, lock, SEP, del];
}

/** Le connecteur : pointes (un cycle des quatre), tracé | teinte, épaisseur, style | son étiquette (lot 4 bis) |
 *  inverser, verrou | supprimer. */
function connectorEntries(c: Connector): BarEntry[] {
  const heads = c.heads.start + "/" + c.heads.end, s = c.style;
  return [
    button("heads", L("heads." + (HEAD_WORD[heads] || "none")), glyph("heads", HEAD_WORD[heads] || "none")),
    choice("route", L("route"), L("route"), c.route, ["straight", "elbow", "curve"].map((v) => ({ value: v, label: L("routes." + v), glyph: "route" as const })), glyph("route", c.route)),
    SEP, hueButton([s.hue], { kind: "hue", value: s.hue, inherited: null, allowDefault: false }),
    choice("stroke_width", L("width"), L("width"), s.stroke_width, WIDTHS.map((w) => ({ value: String(w), label: String(w), glyph: "width" as const })), glyph("widths", s.stroke_width)),
    choice("line_style", L("lineStyle"), L("lineStyle"), s.stroke_style, ["solid", "dashed", "dotted"].map((v) => ({ value: v, label: L("stroke." + v), glyph: "stroke" as const })), glyph("strokes", s.stroke_style)),
    SEP, ...textEntries([{ kind: "connector", c }]),
    SEP, button("reverse", L("reverse"), icon("reverse")),
    button("lock", c.locked ? L("unlock") : L("lock"), icon(c.locked ? "lock" : "unlock"), { pressed: c.locked }),
    SEP, button("delete", L("delete"), icon("delete"), { ...keys(L("keyDelete")), danger: true }),
  ];
}

/** Le groupe : teinte, forme | son étiquette (lot 4 bis : la position en fait partie, neuf places dedans ou dehors) |
 *  sélectionner les membres, leur appliquer la teinte | supprimer. */
function groupEntries(model: Model, g: Group): BarEntry[] {
  const s = g.style, present = g.members.some((host) => model.nodeByHost.has(host));
  return [
    hueButton([s.hue], { kind: "hue", value: s.hue, inherited: null, allowDefault: false }),
    choice("shape", L("shape"), L("shape"), s.shape, ["rectangle", "ellipse"].map((v) => ({ value: v, label: L("shapes." + v), glyph: "shape" as const })), glyph("shape", s.shape)),
    SEP, ...textEntries([{ kind: "group", g }]),
    SEP, ...(present ? [button("select_members", L("selectMembers"), icon("selectMembers")), button("paint_members", L("paintMembers"), icon("paint"))] : []),
    ...(present ? [SEP] : []), button("delete", L("deleteGroup"), icon("delete"), { ...keys(L("keyDelete")), danger: true }),
  ];
}

const groupsOf = (model: Model, exclude: string[] = []): { id: string; label: string }[] =>
  Array.from(model.groupById.values()).filter((g) => !exclude.includes(g.id)).sort((a, b) => a.label.localeCompare(b.label)).map((g) => ({ id: g.id, label: g.label }));

/** L'équipement : teinte (défaut du type) | épingle, grouper | note attachée, connecteur | masquer, isoler. */
function deviceEntries(model: Model, host: string): BarEntry[] {
  const node = model.nodeByHost.get(host);
  const own = model.colorByHost.get(host), typed = node && node.type ? model.colorByType.get(node.type) : undefined;
  const effective = node ? hueOfNode(model, node) : "slate";
  const pinned = model.pinByHost.has(host);
  const mine = (model.groupsByHost.get(host) || []).map((g) => g.id);
  return [
    hueButton([effective], { kind: "hue", value: own ? own.hue : null, inherited: typed ? typed.hue : defaultHue(node ? node.type : null), allowDefault: true }),
    SEP, button("pin", pinned ? L("unpin") : L("pin"), icon(pinned ? "unpin" : "pin"), { pressed: pinned }),
    button("group", L("group"), icon("group"), { volet: { kind: "groups", hosts: [host], groups: groupsOf(model, mine) } }),
    SEP, button("note", L("note"), icon("note")), button("connect", L("connect"), icon("connect")),
    SEP, button("hide", L("hide"), icon("hide")), button("isolate", L("isolate"), icon("isolate")),
  ];
}

// ——— La sélection multiple : aligner et répartir, grouper, teinte, puis ce qui s'efface ———

/** Mettre en grille demande trois éléments (deux sont déjà une rangée), comme répartir ; Alt+G (lot 8 de docs/11). */
export const GRID_MIN = 3;
/** Alt+G : la lettre lue sur la touche, sinon sa place sur le clavier (comme les alignements). */
export const isGridKey = (key: string, code: string): boolean => key.toLowerCase() === "g" || code === "KeyG";
/** Les alignements de la barre : les boîtes (bords, milieux, répartir), les raccourcis du prototype validé. */
export type BarAlign = "left" | "center" | "right" | "top" | "middle" | "bottom" | "distribute-horizontal" | "distribute-vertical";
/** Les raccourcis : Alt + lettre, Alt + Maj + lettre pour répartir. */
export const ALIGN_KEYS: { mode: BarAlign; key: string; shift: boolean }[] = [
  { mode: "left", key: "a", shift: false }, { mode: "center", key: "h", shift: false }, { mode: "right", key: "d", shift: false },
  { mode: "top", key: "w", shift: false }, { mode: "middle", key: "v", shift: false }, { mode: "bottom", key: "s", shift: false },
  { mode: "distribute-horizontal", key: "h", shift: true }, { mode: "distribute-vertical", key: "v", shift: true },
];
const ALIGN_ROWS: BarAlign[][] = [["left", "center", "right", "distribute-horizontal"], ["top", "middle", "bottom", "distribute-vertical"]];
const writtenKeys = (k: { key: string; shift: boolean }): string => "Alt+" + (k.shift ? L("shift") + "+" : "") + k.key.toUpperCase();
/** L'alignement visé par une touche (Alt tenu) : la lettre lue sur la touche, sinon sa place sur le clavier (une
 *  lettre accentuée par Option sous macOS). */
export function alignFromKey(key: string, code: string, shift: boolean): BarAlign | null {
  const letter = /^[a-z]$/i.test(key) ? key.toLowerCase() : /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : "";
  const found = ALIGN_KEYS.find((k) => k.key === letter && k.shift === shift);
  return found ? found.mode : null;
}
/** Ce que la toile reçoit : une sélection de cartes seules garde la règle des centres (lot 2 : « centrer » = même x,
 *  « milieu » = même y, par la moyenne), le reste s'aligne par les boîtes. */
export const alignCommand = (mode: BarAlign, cardsOnly: boolean): string =>
  (cardsOnly && mode === "center" ? "vertical" : cardsOnly && mode === "middle" ? "horizontal" : mode);
/** Combien d'éléments un alignement déplace : les équipements (pas un fantôme) et les annotations non verrouillées. */
export function movableCount(model: Model, multi: Multi): { count: number; cardsOnly: boolean } {
  const hosts = multi.hosts.filter((host) => { const n = model.nodeByHost.get(host); return !!n && !n.ghost; }).length;
  const notes = multi.annotations.filter((id) => { const a = model.annotationById.get(id); return !!a && !a.locked; }).length;
  return { count: hosts + notes, cardsOnly: notes === 0 };
}
export function alignRows(count: number): AlignCell[][] {
  return ALIGN_ROWS.map((row) => row.filter((mode) => count >= 3 || !mode.startsWith("distribute")).map((mode) => {
    const k = ALIGN_KEYS.find((entry) => entry.mode === mode) as { key: string; shift: boolean };
    const written = writtenKeys(k);
    return { mode, label: L("box." + mode), keys: written, aria: ariaKeys(written), distribute: mode.startsWith("distribute") };
  }));
}

/** La teinte d'une sélection multiple (lot 4, prototype validé) : celle de tout ce qui en a une (équipements, annotations,
 *  connecteurs, groupes). `value` : la teinte posée commune, `inherited` : la teinte en vigueur si une seule ; « défaut »
 *  (rendre au type) n'a de sens que pour des équipements seuls. `null` : rien qui se colore. */
export function multiHues(model: Model, multi: Multi, devices: string[]): { effective: string[]; value: string | null; inherited: string | null; devicesOnly: boolean } | null {
  const posed: (string | null)[] = devices.map((host) => { const c = model.colorByHost.get(host); return c ? c.hue : null; });
  const effective: string[] = devices.map((host) => hueOfNode(model, model.nodeByHost.get(host) || { hostname: host, type: null }));
  const styled = ([] as ({ style: { hue: string } } | undefined)[]).concat(multi.annotations.map((id) => model.annotationById.get(id)),
    multi.connectors.map((id) => model.connectorById.get(id)), multi.groups.map((id) => model.groupById.get(id)));
  styled.forEach((x) => { if (x) { posed.push(x.style.hue); effective.push(x.style.hue); } });
  if (!effective.length) return null;
  const distinct = Array.from(new Set(effective)), common = new Set(posed);
  return { effective: distinct, value: common.size === 1 ? Array.from(common)[0] : null, inherited: distinct.length === 1 ? distinct[0] : null, devicesOnly: posed.length === devices.length };
}

function multiEntries(model: Model, multi: Multi): BarEntry[] {
  const out: BarEntry[] = [];
  const { count } = movableCount(model, multi);
  if (count >= 2) out.push(button("align", L("align"), icon("align"), { volet: { kind: "align", count, rows: alignRows(count), grid: count >= GRID_MIN } }), SEP);
  const devices = multi.hosts.filter((host) => { const n = model.nodeByHost.get(host); return !!n && n.kind !== "stub" && !n.ghost; });
  if (devices.length) out.push(button("group", L("group"), icon("group"), { volet: { kind: "groups", hosts: devices, groups: groupsOf(model) } }));
  const hues = multiHues(model, multi, devices);
  if (hues) out.push(hueButton(hues.effective.slice(0, 2), { kind: "hue", value: hues.value, inherited: hues.inherited, allowDefault: hues.devicesOnly }));
  // le texte de toute une sélection (lot 4 bis) : une valeur commune, ou « — »
  const text = textEntries(itemsOf(model, multi));
  if (text.length) { if (out.length && out[out.length - 1].id !== "sep") out.push(SEP); out.push(...text); }
  const editables = multi.annotations.length + multi.connectors.length;
  if (editables + multi.groups.length) {
    const flags = multi.annotations.map((id) => model.annotationById.get(id)).concat(multi.connectors.map((id) => model.connectorById.get(id)) as never[])
      .filter((x): x is Annotation => !!x).map((x) => x.locked);
    const locked = flags.length > 0 && flags.every(Boolean);
    if (out.length && out[out.length - 1].id !== "sep") out.push(SEP);
    if (editables) out.push(button("duplicate", L("duplicate"), icon("duplicate"), keys("Ctrl+D")));
    out.push(button("delete", multi.hosts.length ? L("deleteKeepDevices") : L("delete"), icon("delete"), { ...keys(L("keyDelete")), danger: true }));
    if (editables) out.push(button("lock", locked ? L("unlock") : L("lock"), icon(locked ? "lock" : "unlock"), { pressed: locked }));
  } else if (multi.hosts.length) {
    if (out.length && out[out.length - 1].id !== "sep") out.push(SEP);
    out.push(button("hide", L("hideSelection"), icon("hide")), button("isolate", L("isolateSelection"), icon("isolate")));
  }
  while (out.length && out[out.length - 1].id === "sep") out.pop();
  return out;
}

/** Les boutons de la barre pour une cible, de gauche à droite ; `sep` = un filet. */
export function entriesOf(model: Model, target: Target): BarEntry[] {
  if (target.kind === "annotation") return annotationEntries(target.a);
  if (target.kind === "connector") return connectorEntries(target.c);
  if (target.kind === "group") return groupEntries(model, target.g);
  if (target.kind === "device") return deviceEntries(model, target.host);
  return multiEntries(model, target.multi);
}
/** Le nom de la barre pour un lecteur d'écran : « actions rapides : note », « … : 3 éléments ». */
export function barLabel(target: Target): string {
  const what = target.kind === "multi" ? L("items", { count: size(target.multi) })
    : target.kind === "annotation" ? L("kinds." + target.a.content.kind) : target.kind === "device" ? target.host : L("kinds." + target.kind);
  return L("label", { what });
}
/** Le cycle des pointes : la valeur qui suit celle d'un connecteur. */
export function nextHeads(c: Pick<Connector, "heads">): { start: "none" | "arrow"; end: "none" | "arrow" } {
  const at = HEAD_CYCLE.indexOf((c.heads.start + "/" + c.heads.end) as typeof HEAD_CYCLE[number]);
  const [start, end] = HEAD_CYCLE[(at + 1) % HEAD_CYCLE.length].split("/") as ["none" | "arrow", "none" | "arrow"];
  return { start, end };
}
/** La clé d'une sélection : la barre rappelée par Alt+T vaut pour elle seule. */
export const selectionKey = (selection: Selection | null, multi: Multi): string => (size(multi) >= 2 ? JSON.stringify(multi) : selection ? selection.kind + ":" + selection.id : "");

// ——— Où ———

export interface Rect { x: number; y: number; w: number; h: number }
/** La zone où la barre et ses volets peuvent se poser, à l'écran : la toile moins la barre du haut, la recherche, la
 *  barre d'outils, la bande des runs et le panneau. */
export interface Zone { left: number; top: number; right: number; bottom: number }
export interface Obstacle { box: Rect; weight: number }
export interface View { x: number; y: number; zoom: number }
export const BAR_H = 36, GAP = 8, VOLET_GAP = 6, CARET_MIN = 14, HOLD = 16;
/** Pénalités : passer dessous coûte, se décaler un peu aussi ; couvrir une annotation coûte sa surface, une carte la moitié. */
const BELOW_COST = 400, SHIFT_COST = 1.5, BESIDE_COST = 300;

export const toScreen = (r: Rect, view: View): Rect => ({ x: view.x + r.x * view.zoom, y: view.y + r.y * view.zoom, w: r.w * view.zoom, h: r.h * view.zoom });
const overlap = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const union = (rects: Rect[]): Rect | null => {
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** Ce que la toile sait de la place des éléments (dans le plan). */
export interface Geometry {
  node: (host: string) => Rect | null;
  annotation: (id: string) => Rect | null;
  connector: (id: string) => { a: Point; b: Point; mid?: Point } | null;
  group: (id: string) => Rect | null;
}
/** La boîte de la sélection, dans le plan ; un connecteur seul s'ancre au milieu de son tracé (sa boîte englobante peut
 *  être grande et vide) : une boîte de 2 × 22 autour de ce point. */
export function anchorOf(multi: Multi, geo: Geometry): Rect | null {
  if (size(multi) === 1 && multi.connectors.length === 1) {
    const e = geo.connector(multi.connectors[0]);
    if (!e) return null;
    const m = e.mid || { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    return { x: m.x - 1, y: m.y - 11, w: 2, h: 22 };
  }
  const rects: (Rect | null)[] = [];
  multi.hosts.forEach((host) => rects.push(geo.node(host)));
  multi.annotations.forEach((id) => rects.push(geo.annotation(id)));
  multi.connectors.forEach((id) => { const e = geo.connector(id); rects.push(e ? union([e.a, e.b].concat(e.mid ? [e.mid] : []).map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }))) : null); });
  multi.groups.forEach((id) => rects.push(geo.group(id)));
  return union(rects.filter((r): r is Rect => !!r));
}

export type BarSide = "above" | "below" | "left" | "right";
export interface BarPlace { x: number; y: number; below: boolean; side: BarSide; covers: number; caret: number; caretY: number }
/** Où poser la barre (largeur `width`) pour une ancre à l'écran : au-dessus, centrée, 8 px plus haut ; dessous quand le
 *  haut manque ; jamais hors de la zone. Elle évite de couvrir une annotation (puis une carte, moins pénalisée) : dessus
 *  d'abord, puis dessous, centrée, sinon décalée juste assez, sans lâcher l'ancre (16 px de barre au moins de part et
 *  d'autre de son centre). `beside` (un connecteur : son tracé est un obstacle) : la barre peut aussi se poser à gauche
 *  ou à droite de l'ancre, centrée sur elle (un tracé vertical n'est jamais couvert). Rien ne tient : en haut de la
 *  zone. `null` : l'ancre est hors de la zone (la barre attend qu'on revienne). L'ergot pointe l'ancre même quand la
 *  barre s'est décalée. `height` : la barre de recherche d'un bloc qu'on écrit a deux rangées (lot 16 bis). */
export function placeBar(anchor: Rect, width: number, zone: Zone, obstacles: Obstacle[], beside = false, height: number = BAR_H): BarPlace | null {
  if (anchor.x + anchor.w < zone.left || anchor.x > zone.right || anchor.y + anchor.h < zone.top || anchor.y > zone.bottom) return null;
  const cx = anchor.x + anchor.w / 2, cy = anchor.y + anchor.h / 2, center = clamp(cx - width / 2, zone.left, zone.right - width);
  const lo = Math.max(zone.left, cx + HOLD - width), hi = Math.min(zone.right - width, cx - HOLD);
  const rows = [{ below: false, y: anchor.y - GAP - height }, { below: true, y: anchor.y + anchor.h + GAP }].filter((r) => r.y >= zone.top && r.y + height <= zone.bottom);
  const caretOf = (x: number): number => Math.round(clamp(cx - x, CARET_MIN, width - CARET_MIN));
  const coverOf = (bar: Rect): number => obstacles.reduce((sum, o) => (o.box.y < bar.y + bar.h && o.box.y + o.box.h > bar.y ? sum + overlap(bar, o.box) * o.weight : sum), 0);
  let best: (BarPlace & { cost: number }) | null = null;
  const consider = (x: number, y: number, side: BarSide, penalty: number): void => {
    const covers = coverOf({ x, y, w: width, h: height }), cost = covers + penalty;
    if (!best || cost < best.cost) best = { x, y, below: side === "below", side, covers, cost, caret: 0, caretY: 0 };
  };
  for (const row of rows) {
    // seuls les obstacles de cette rangée donnent des places (une toile de 500 cartes n'en a que quelques-unes à cette hauteur)
    const xs = [center];
    obstacles.forEach((o) => { if (o.box.y < row.y + height && o.box.y + o.box.h > row.y) xs.push(o.box.x - GAP - width, o.box.x + o.box.w + GAP); });
    for (const x0 of xs) {
      const x = lo <= hi ? clamp(x0, lo, hi) : center;
      consider(x, row.y, row.below ? "below" : "above", (row.below ? BELOW_COST : 0) + Math.abs(x - center) * SHIFT_COST);
    }
  }
  if (beside) {
    const y = clamp(cy - height / 2, zone.top, zone.bottom - height);
    if (anchor.x - GAP - width >= zone.left) consider(anchor.x - GAP - width, y, "left", BESIDE_COST);
    if (anchor.x + anchor.w + GAP + width <= zone.right) consider(anchor.x + anchor.w + GAP, y, "right", BESIDE_COST);
  }
  const found = best as (BarPlace & { cost: number }) | null;
  if (!found) { const x = Math.round(center), y = Math.round(zone.top); return { x, y, below: false, side: "above", covers: 0, caret: caretOf(x), caretY: 0 }; }
  const x = Math.round(found.x), y = Math.round(found.y);
  return { x, y, below: found.below, side: found.side, covers: Math.round(found.covers), caret: caretOf(x), caretY: Math.round(clamp(cy - y, 10, height - 10)) };
}

/** La place d'un volet : son coin haut gauche, `up` (au-dessus de ce qu'il ouvre), `maxH` (raccourci : sa liste défile ;
 *  `null` : sa hauteur), `side` (où il est par rapport à la barre) et `caret` (sa flèche : au-dessus ou dessous, l'abscisse
 *  du bouton depuis son bord gauche ; à côté, l'ordonnée de la rangée de la barre depuis son haut). */
export interface VoletPlace { x: number; y: number; up: boolean; maxH: number | null; side: "above" | "below" | "left" | "right"; caret: number }
/** Un volet raccourci garde au moins cette hauteur (sinon il se pose à côté de la barre). */
export const VOLET_MIN_H = 160;
/** Où ouvrir un volet (taille `w` × `h`) : du côté de la barre opposé à la sélection (l'objet reste visible pendant
 *  qu'on choisit) ; s'il manque la place, de l'autre côté de la sélection ; sinon du premier côté, raccourci (sa liste
 *  défile) s'il garde `VOLET_MIN_H` ; sinon à côté de la barre, à droite puis à gauche, le long de sa rangée (vers le
 *  haut, puis vers le bas) ; jamais sur l'objet ni sur la barre. Toujours avec sa flèche : au-dessus ou dessous, aligné
 *  sur son bouton ; à côté, vers la rangée de la barre (critique du 2026-10-15 : le volet du langage s'ouvrait loin de
 *  son bouton, sans rien qui l'y relie). Dans la zone. Si rien ne tient, la place qui couvre le moins. */
export function placeVolet(bar: Rect, below: boolean, opener: Rect, w: number, h: number, zone: Zone, selection: Rect): VoletPlace {
  const x = Math.round(clamp(opener.x - GAP, zone.left, Math.max(zone.left, zone.right - w)));
  const caret = Math.round(clamp(opener.x + opener.w / 2 - x, CARET_MIN, Math.max(CARET_MIN, w - CARET_MIN)));
  const vertical = (y: number, up: boolean, maxH: number | null = null): VoletPlace => ({ x, y, up, maxH, side: up ? "above" : "below", caret });
  const near = below ? vertical(bar.y + bar.h + VOLET_GAP, false) : vertical(bar.y - VOLET_GAP - h, true);
  const far = below ? vertical(selection.y - VOLET_GAP - h, true) : vertical(selection.y + selection.h + VOLET_GAP, false);
  // raccourci du premier côté : du bord de la zone jusqu'à la barre
  const room = below ? zone.bottom - (bar.y + bar.h + VOLET_GAP) : bar.y - VOLET_GAP - zone.top;
  const short = room >= VOLET_MIN_H && room < h ? [below ? vertical(bar.y + bar.h + VOLET_GAP, false, Math.floor(room)) : vertical(zone.top, true, Math.floor(room))] : [];
  // à côté de la barre : le long de sa rangée, vers le haut (son bas sur celui de la barre) puis vers le bas (son haut
  // sur celui de la barre) ; la flèche vise la rangée
  const row = bar.y + bar.h / 2;
  const besides: VoletPlace[] = ([[bar.x + bar.w + VOLET_GAP, "right"], [bar.x - VOLET_GAP - w, "left"]] as const)
    .filter(([sx]) => sx >= zone.left && sx + w <= zone.right)
    .flatMap(([sx, side]) => [bar.y + bar.h - h, bar.y].map((y): VoletPlace => ({ x: sx, y, up: y < bar.y, maxH: null, side, caret: Math.round(clamp(row - y, CARET_MIN, Math.max(CARET_MIN, h - CARET_MIN))) })));
  const candidates: VoletPlace[] = [near, far, ...short, ...besides];
  const height = (c: VoletPlace): number => (c.maxH === null ? h : c.maxH);
  const fits = (c: VoletPlace): boolean => c.y >= zone.top && c.y + height(c) <= zone.bottom;
  const covers = (c: VoletPlace): number => overlap({ x: c.x, y: c.y, w, h: height(c) }, selection) + overlap({ x: c.x, y: c.y, w, h: height(c) }, bar);
  const clean = candidates.find((c) => fits(c) && covers(c) === 0);
  if (clean) return { ...clean, y: Math.round(clean.y) };
  const kept = candidates.map((c) => {
    const y = clamp(c.y, zone.top, Math.max(zone.top, zone.bottom - height(c)));
    const caretOf = c.side === "left" || c.side === "right" ? Math.round(clamp(row - y, CARET_MIN, Math.max(CARET_MIN, h - CARET_MIN))) : c.caret;
    return { ...c, y, caret: caretOf };
  });
  kept.sort((p, q) => covers(p) - covers(q));
  return { ...kept[0], y: Math.round(kept[0].y) };
}

/** Le clavier d'un volet (audit du 2026-10-15, P1) : un volet est fait de groupes (une grille d'alignement, un pas à pas,
 *  une liste de choix, une action seule) ; Tab va au groupe suivant, Maj+Tab au précédent, en boucle (le volet garde le
 *  focus, comme un menu ; Échap le ferme), les flèches parcourent un groupe. `at` : le groupe qui a le focus (-1 :
 *  aucun, on entre par le premier ou le dernier). */
export function nextGroup(count: number, at: number, back: boolean): number {
  if (count <= 0) return -1;
  if (at < 0) return back ? count - 1 : 0;
  return (at + (back ? count - 1 : 1)) % count;
}
/** Le groupe où le focus entre à l'ouverture : le premier groupe de choix (une liste, une grille, un menu ; l'élément
 *  coché y prend le focus), avant une action seule (« appliquer » la suggestion d'un langage) ; sinon le premier. */
export const startGroup = (units: { grouped: boolean }[]): number => Math.max(0, units.findIndex((u) => u.grouped));

export const floating = { GRID_MIN, isGridKey, multiHues, targetOf, shows, entriesOf, barLabel, nextHeads, selectionKey, alignFromKey, alignCommand, movableCount, alignRows, anchorOf, placeBar, placeVolet, toScreen, ariaKeys, BAR_H, GAP, VOLET_MIN_H, nextGroup, startGroup };
