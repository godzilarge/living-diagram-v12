// Sonde : aligner à gauche (puis mettre en grille) une carte, sa note attachée et une autre carte : l'écart de la note
// à son ancre est déplacé comme si elle était libre, alors que son ancre bouge aussi.
const { createToile } = require("./sonde-bundle.cjs");
const note = { id: "a1-1", x: 60, y: -120, w: 160, h: 60, anchor: { kind: "device", ref: "sw-b" }, locked: false, content: { kind: "note", text: "n" } };
const node = (h) => ({ hostname: h, kind: "device", ghost: false });
const model = { pinByHost: new Map(), nodeByHost: new Map([["sw-a", node("sw-a")], ["sw-b", node("sw-b")], ["sw-c", node("sw-c")]]), placeByHost: new Map(), annotationById: new Map([[note.id, note]]), connectorById: new Map(), groupById: new Map() };
for (const mode of ["left", "grid"]) {
  const blocks = [];
  const toile = createToile(model, { onSelect() {}, canWrite: () => true, onBlock: (pins, ops) => blocks.push({ pins: Object.fromEntries(pins), ops }), onPin() {}, onPins() {} });
  toile.state.positions = new Map([["sw-a", { x: 0, y: 0 }], ["sw-b", { x: 400, y: 0 }], ["sw-c", { x: 800, y: 300 }]]);
  ["sw-a", "sw-b", "sw-c"].forEach((h) => toile.boxes.set(h, { w: 200, h: 80 }));
  toile.frames.set(note.id, { x: 400 + 60 - 80, y: -120 - 30, w: 160, h: 60 }); // boîte dans le plan : centre de sw-b + écart
  toile.selectItems([{ kind: "node", id: "sw-a" }, { kind: "node", id: "sw-b" }, { kind: "node", id: "sw-c" }, { kind: "annotation", id: note.id }]);
  if (mode === "left") toile.alignSelected("left"); else toile.gridSelected({ cols: 2, order: "name", snap: null });
  const b = blocks[0], pinB = b.pins["sw-b"] || { x: 400, y: 0 }, op = b.ops.find((o) => o.id === note.id);
  const planX = pinB.x + op.x - 80; // ce que la toile dessinera : centre de l'ancre + écart - demi-largeur
  console.log(mode, "| épingle sw-b:", JSON.stringify(pinB), "| écart écrit:", op.x, op.y, "| bord gauche de la note dans le plan:", planX, "(visé :", mode === "left" ? "-100, le bord gauche commun)" : "sa case de grille)");
}
