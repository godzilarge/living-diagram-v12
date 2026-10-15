// ---------- le vocabulaire (celui des catalogues de l'application, engine/src/i18n/locales/fr) ----------
const HUES = ["blue", "sky", "indigo", "violet", "pink", "red", "orange", "amber", "lime", "green", "teal", "slate"];
const HUE_FR = { blue: "bleu", sky: "ciel", indigo: "indigo", violet: "violet", pink: "rose", red: "rouge", orange: "orange", amber: "ambre", lime: "citron", green: "vert", teal: "turquoise", slate: "ardoise" };
const TYPE_HUE = { switch: "blue", router: "orange", firewall: "violet" };
const TYPE_FR = { switch: "switch", router: "routeur", firewall: "firewall" };
const FONT_FR = { sans: "Inter", mono: "Mono" };
const FONT_LONG = { sans: "Inter, sans empattement", mono: "JetBrains Mono, chasse fixe" };
const WEIGHT_FR = { regular: "normal", semibold: "demi-gras", bold: "gras" };
const WEIGHT_CSS = { regular: 400, semibold: 600, bold: 700 };
const ALIGN_FR = { left: "gauche", center: "centre", right: "droite" };
const VALIGN_FR = { top: "haut", middle: "milieu", bottom: "bas" };
const POS9 = [["top", "left"], ["top", "center"], ["top", "right"], ["middle", "left"], ["middle", "center"], ["middle", "right"], ["bottom", "left"], ["bottom", "center"], ["bottom", "right"]];
const posFR = (v, h) => (v === "middle" && h === "center" ? "centre" : h === "center" ? `${VALIGN_FR[v]} centre` : `${VALIGN_FR[v]} ${ALIGN_FR[h]}`);
const colorFR = (c) => (c === "ink" ? "encre" : c === "hue" ? "teinte de l'objet" : HUE_FR[c]);
// la taille du texte : libre de 8 à 64 (le contrat) ; les valeurs proposées, celles des éditeurs de texte
const SIZE_MIN = 8, SIZE_MAX = 64;
const SIZE_PRESETS = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];
const SIDE_FR = { above: "au-dessus", on: "sur le trait", below: "au-dessous" };

// ---------- la scène (données factices, positions entières, grille de 20) ----------
// Le style de texte de chaque objet (`t`) : les clés du contrat (taille, graisse, police, couleur, alignements) et les
// clés proposées par ce lot (italique, souligné, barré, marge, interligne). Voir le README, tableau contrat / interface.
const TEXT = (over = {}) => ({ size: 13, weight: "regular", font: "sans", color: "ink", italic: false, underline: false, strike: false, align: "left", valign: "top", pad: 8, lh: 135, ...over });
const CARD_W = 240, CARD_H = 80;
// un bloc de code : le texte, le langage, trois bascules (coloration, numéros, repli) et le nombre de lignes repliées
// `h` : la hauteur de la boîte, libre (sinon ajustée au contenu, `lines` lignes au plus) ; `scroll` : la première ligne
// montrée, un état de vue
function code(id, x, y, w, text, lang, extra = {}) {
  const { lines = 24, ...rest } = extra;
  const it = { id, kind: "code", x, y, w, h: 0, scroll: 0, text, lang, cfont: "jetbrains", highlight: true, numbers: true,
    title: "", anchor: null, hue: "slate", t: TEXT({ size: 13, font: "mono" }), layer: "dessus", locked: false, ...rest };
  if (!it.h) it.h = fitHeight(it, lines);
  return it;
}
const dev = (id, name, type, x, y, extra = {}) => ({ id, kind: "device", name, type, x, y, w: CARD_W, h: CARD_H, hue: null, pinned: false, ...extra });
const INITIAL = [
  dev("rt1", "dc01-rt-01", "router", 400, 100),
  dev("core1", "dc01-core-01", "switch", 140, 300, { pinned: true }),
  dev("core2", "dc01-core-02", "switch", 560, 300, { pinned: true }),
  dev("fw1", "dc01-fw-01", "firewall", 140, 480, { role: "actif" }),
  dev("fw2", "dc01-fw-02", "firewall", 440, 480, { role: "passif" }),
  dev("acc1", "dc01-acc-01", "switch", 120, 700),
  dev("acc2", "dc01-acc-02", "switch", 400, 700),
  { id: "note1", kind: "note", x: 860, y: -110, w: 260, h: 84, hue: "amber", fill: 14, text: "Optiques Eth1/49-50 du routeur : à surveiller jusqu'au remplacement du 18/10.", t: TEXT(), layer: "dessus", locked: false },
  // les blocs de code : `anchor` = l'équipement suivi (null : libre) ; `h` se déduit des lignes montrées (codeBox)
  code("py1", 860, 20, 600, SAMPLE_PYTHON, "python", { anchor: "rt1", title: "optiques_faibles.py", hue: "blue" }),
  code("sh1", 860, 420, 600, SAMPLE_BASH, "bash", { title: "sauvegarde-configs.sh", highlight: true, hue: "slate" }),
  code("yaml1", 860, 730, 330, SAMPLE_YAML, "yaml", { anchor: "core2", title: "host_vars/dc01-core-02.yml", hue: "teal" }),
  code("json1", 1220, 730, 420, SAMPLE_JSON, "json", { anchor: "fw1", title: "état HA lu par l'API", hue: "violet" }),
  code("cisco1", 60, 900, 560, SAMPLE_CISCO, "cisco_ios", { anchor: "acc1", title: "running-config", hue: "blue", lines: 25 }),
  code("forti1", -560, 400, 480, SAMPLE_FORTIOS, "fortios", { anchor: "fw1", title: "HA et agrégat", hue: "violet" }),
];
const LINKS = [["core1", "core2"], ["core1", "rt1"], ["core2", "rt1"], ["core1", "fw1"], ["core2", "fw2"], ["core1", "fw2"], ["core2", "fw1"], ["core1", "acc1"], ["core1", "acc2"], ["core2", "acc1"], ["core2", "acc2"]];
const CLUSTER = { id: "ha1", label: "HA · DC01-EDGE · actif-passif", members: ["fw1", "fw2"] };

const S = {
  items: new Map(INITIAL.map((it) => [it.id, structuredClone(it)])),
  sel: [], special: null, view: { x: 0, y: 0, z: 1 },
  readonly: false, wide: false, ficheOpen: new Set(), copied: null, warn: null, pointer: null, draftSnap: null, barSide: null, gesture: false, shift: false, editing: null, volet: null, padGuide: false,
  past: [], future: [], seq: 1,
};
const item = (id) => S.items.get(id);
const isAnno = (it) => it && ["note", "shape", "table", "image", "code"].includes(it.kind);
const hasText = (it) => it && ["note", "shape", "table", "connector", "group"].includes(it.kind);
const effHue = (it) => it.hue || TYPE_HUE[it.type] || "slate";

// ---------- l'historique (Ctrl+Z, une entrée par geste : un glissé de taille entier ne compte qu'une fois) ----------
function snapshot() { return JSON.stringify({ items: [...S.items.values()], sel: S.sel }); }
function remember() { S.past.push(snapshot()); if (S.past.length > 100) S.past.shift(); S.future = []; }
function restore(json) { const s = JSON.parse(json); S.items = new Map(s.items.map((it) => [it.id, it])); S.sel = s.sel.filter((id) => S.items.has(id)); }
function undo() { if (!S.past.length) return; S.future.push(snapshot()); restore(S.past.pop()); say("annulé"); refresh(); }
function redo() { if (!S.future.length) return; S.past.push(snapshot()); restore(S.future.pop()); say("rétabli"); refresh(); }

// ---------- la géométrie ----------
function groupBox(g) {
  const ms = g.members.map(item).filter(Boolean);
  if (!ms.length) return { x: 0, y: 0, w: 0, h: 0 };
  const pad = 28, top = 40;
  const x0 = Math.min(...ms.map((m) => m.x)) - pad, y0 = Math.min(...ms.map((m) => m.y)) - top;
  const x1 = Math.max(...ms.map((m) => m.x + m.w)) + pad, y1 = Math.max(...ms.map((m) => m.y + m.h)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function sidePoint(b, side) {
  return { n: { x: b.x + b.w / 2, y: b.y }, s: { x: b.x + b.w / 2, y: b.y + b.h }, w: { x: b.x, y: b.y + b.h / 2 }, e: { x: b.x + b.w, y: b.y + b.h / 2 } }[side];
}
function connPoints(c) {
  const a = boxOf(item(c.from.id)), b = boxOf(item(c.to.id));
  const p = sidePoint(a, c.from.side), q = sidePoint(b, c.to.side);
  if (c.route === "straight") return { d: `M${p.x} ${p.y}L${q.x} ${q.y}`, pts: [p, q], tail: [q, p], head: [p, q] };
  if (c.route === "curve") {
    const h1 = ["w", "e"].includes(c.from.side), h2 = ["w", "e"].includes(c.to.side);
    const c1 = h1 ? { x: (p.x + q.x) / 2, y: p.y } : { x: p.x, y: (p.y + q.y) / 2 };
    const c2 = h2 ? { x: (p.x + q.x) / 2, y: q.y } : { x: q.x, y: (p.y + q.y) / 2 };
    return { d: `M${p.x} ${p.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${q.x} ${q.y}`, pts: [p, c1, c2, q], tail: [c1, p], head: [c2, q] };
  }
  const m = ["w", "e"].includes(c.from.side) ? { x: q.x, y: p.y } : { x: p.x, y: q.y };
  return { d: `M${p.x} ${p.y}L${m.x} ${m.y}L${q.x} ${q.y}`, pts: [p, m, q], tail: [m, p], head: [m, q] };
}
function boxOf(it) {
  if (!it) return { x: 0, y: 0, w: 0, h: 0 };
  if (it.kind === "group") return groupBox(it);
  if (it.kind === "connector") {
    const { pts } = connPoints(it);
    const x0 = Math.min(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y));
    return { x: x0, y: y0, w: Math.max(...pts.map((p) => p.x)) - x0, h: Math.max(...pts.map((p) => p.y)) - y0 };
  }
  if (it.kind === "code") return { x: it.x, y: it.y, w: it.w, h: codeBox(it).h };
  return { x: it.x, y: it.y, w: it.w, h: it.h };
}
function union(boxes) {
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x + b.w)) - x0, h: Math.max(...boxes.map((b) => b.y + b.h)) - y0 };
}
const toScreen = (b) => ({ x: S.view.x + b.x * S.view.z, y: S.view.y + b.y * S.view.z, w: b.w * S.view.z, h: b.h * S.view.z });

// un point du tracé d'un connecteur à `at` % de sa longueur, et la direction du tracé à cet endroit (l'étiquette s'y pose)
let probe = null;
function alongPath(c, at) {
  if (!probe) probe = svg("path", {}, svg("svg", { width: 0, height: 0, style: "position:absolute" }, document.body));
  probe.setAttribute("d", connPoints(c).d);
  const len = probe.getTotalLength(), l = clamp(len * at / 100, 1, len - 1);
  const p = probe.getPointAtLength(l), q = probe.getPointAtLength(Math.min(len, l + 1)), r = probe.getPointAtLength(Math.max(0, l - 1));
  const dx = q.x - r.x, dy = q.y - r.y, d = Math.hypot(dx, dy) || 1;
  return { x: p.x, y: p.y, nx: -dy / d, ny: dx / d };
}
