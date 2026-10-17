// Revue brique 6 (édition) : sondes Node, à copier dans app/tests/ puis lancer `npx vitest run tests/sondes-node.test.ts`.
// Chaque `it` reproduit un constat du rapport docs/revues/2026-10-16-edition.md ; il ÉCHOUE tant que le défaut existe.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "@engine/canvas/model";
import type { Intent, PageData } from "@engine/canvas/types";
import { targetOf } from "@engine/app/state/floating";
import { multiOf } from "@engine/app/state/selection";
import type { Translate } from "../src/i18n";
import { entriesOf } from "../src/state/bars";
import type { BarButton } from "../src/state/bars";
import { runBar } from "../src/state/bar-actions";
import type { EditCommands } from "../src/state/edit-commands";
import { editKeyOf } from "../src/state/edit-keys";
import { placeBar, zoneOf } from "../src/state/bar-place";
import { parseSnapshot } from "../src/api/run";

const FIXTURES = new URL("../../contracts/fixtures/", import.meta.url);
const snapshot = parseSnapshot(JSON.parse(readFileSync(new URL("snapshot-minimal.json", FIXTURES), "utf8")));
if (!snapshot) throw new Error("fixture");
const hosts = snapshot.nodes.map((n) => n.hostname);
const at = "2026-10-16T10:00:00Z";
// un groupe qui ne contient PAS hosts[0] : la barre de hosts[0] propose « Ajouter à Core »
const intent = {
  intent_version: "1.6.0", infrastructure: snapshot.source.infrastructure, revision: 3, updated_at: at,
  pins: [], device_colors: [], type_colors: [], annotations: [], connectors: [],
  groups: [{ id: "g1-1", label: "Core", description: "", members: [hosts[1]], style: { hue: "blue", shape: "rectangle", radius: 16, fill_opacity: 8, stroke_width: 2, stroke_style: "dashed", padding: 24, label_position: "top_left", label_placement: "inside", label_size: 13, label_weight: "semibold", label_font: "sans", label_color: "hue" }, author: "o", at }],
} as unknown as Intent;
const model = build({ snapshot, ingest: null, origin: "t", catalogue: {}, intent } as PageData);
const t: Translate = (key) => key;

describe("sondes revue brique 6", () => {
  it("H1 : « Ajouter à <groupe> » écrit group_add sur l'id du groupe (pas sur l'id de la ligne du menu)", () => {
    const target = targetOf(model, { kind: "node", id: hosts[0] }, multiOf([{ kind: "node", id: hosts[0] }]));
    if (!target) throw new Error("no target");
    const group = entriesOf(t, model, target).find((e) => e.id === "group") as BarButton;
    const volet = group.volet;
    if (volet?.kind !== "menu") throw new Error("le bouton grouper devrait ouvrir un menu");
    const addRow = volet.items[1];
    const calls: unknown[][] = [];
    const commands = new Proxy({}, { get: (_o, name) => (...args: unknown[]) => { calls.push([name, ...args]); } }) as unknown as EditCommands;
    runBar("group", addRow.id, target, { commands, model, toile: {} as never, pickFile: () => undefined });
    expect(calls[0][0]).toBe("groupAdd");
    expect(calls[0][1], "l'id envoyé au backend").toBe("g1-1"); // reçu : "add:g1-1" → refusé `unknown_group`
  });

  it("M : le raccourci Ctrl+B affiché sur « Gras » est pris par le clavier du mode", () => {
    const key = editKeyOf({ key: "b", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, { editing: true, editable: false, onCanvas: true, hasSelection: true });
    expect(key).not.toBeNull(); // reçu : null, rien ne bascule le gras
  });

  it("M : Ctrl+Maj+V affiché dans le menu contextuel (« coller comme bloc de code ») est pris par le clavier du mode", () => {
    const key = editKeyOf({ key: "V", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }, { editing: true, editable: false, onCanvas: true, hasSelection: false });
    expect(key).not.toBeNull(); // reçu : null ; la v1 armait le collage suivant comme bloc de code (Shell.tsx)
  });

  it("B : la barre n'est jamais posée sur son élément, même grand (DESIGN.md : never over the element)", () => {
    const zone = zoneOf(1440, 900);
    const element = { x: 500, y: 100, w: 300, h: 700 }; // haut près des îlots, bas sous la zone libre
    const spot = placeBar(element, 392, zone);
    if (!spot) throw new Error("pas de barre");
    const overlaps = spot.y < element.y + element.h && spot.y + 48 > element.y;
    expect(overlaps, `barre en y=${spot.y}..${spot.y + 48}, élément ${element.y}..${element.y + element.h}`).toBe(false);
  });
});
