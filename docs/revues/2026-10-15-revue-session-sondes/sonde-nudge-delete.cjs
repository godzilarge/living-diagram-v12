// Sonde : flèches sur une annotation, puis suppression acceptée avant la fin de la rafale (NUDGE_MS = 400 ms).
const { createToile } = require("./sonde-bundle.cjs");
const a = { id: "a1-1", x: 100, y: 100, w: 120, h: 60, anchor: { kind: "free", ref: null }, locked: false, content: { kind: "note", text: "n" } };
const model = { pinByHost: new Map(), nodeByHost: new Map(), placeByHost: new Map(), annotationById: new Map([[a.id, a]]), connectorById: new Map(), groupById: new Map() };
let timer = null; const blocks = [];
const toile = createToile(model, { onSelect() {}, canWrite: () => true, later: (run) => { timer = run; return () => { timer = null; }; },
  onBlock: (pins, ops) => blocks.push(ops), onPin() {}, onPins() {} });
toile.frames.set(a.id, { x: 100, y: 100, w: 120, h: 60 });
toile.selectItems([{ kind: "annotation", id: a.id }]);
console.log("nudge:", toile.nudge(20, 0));
// Suppr : la requête part (deleteSelection n'appelle pas flush) ; la réponse retire l'annotation du modèle (applyIntent)
model.annotationById.delete(a.id);
// et le dessin suivant (Flow.tsx, useMemo de build) oublie la boîte posée localement
toile.pending.forEach((_, id) => { if (!model.annotationById.has(id)) toile.pending.delete(id); });
try { timer(); console.log("flush ok, ops:", JSON.stringify(blocks)); } catch (e) { console.log("flush a levé :", e.constructor.name, e.message); }
