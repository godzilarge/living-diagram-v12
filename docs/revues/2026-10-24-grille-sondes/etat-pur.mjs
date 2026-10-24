// Sonde de l'état pur (app/src/state/tiles.ts), depuis la racine du dépôt :
//   app/node_modules/.bin/rolldown docs/revues/2026-10-24-grille-sondes/etat-pur.mjs -f esm -o /tmp/etat-pur.js && node /tmp/etat-pur.js
import { DEFAULT_TILES, judge, parseTiles, tighten, valid } from "../../../app/src/state/tiles.ts";
const D = DEFAULT_TILES;
const w = (patch) => Object.fromEntries(Object.entries(D).map(([k, v]) => [k, { ...v, ...(patch[k] ?? {}) }]));
const show = (label, value) => console.log(label.padEnd(64), JSON.stringify(value));
// corners other than se: never tested in tiles.test.ts
const free = w({ coverage: { x: 0, y: 30 } }); // Coverage moved away: Sources has free cells above it
show("nw : Sources tirée vers le nord-ouest dans Verdicts", judge(free, { ...free, sources: { x: 6, y: 2, w: 6, h: 9 } }, "nw"));
show("ne : Delivery tirée vers le nord-est (déjà au bord)", judge(D, w({ delivery: { y: 9, h: 8 } }), "ne").tiles.delivery);
show("sw : Coverage tirée vers le sud-ouest", judge(D, w({ coverage: { x: 6, w: 6, h: 7 } }), "sw"));
// a preference out of any useful range is read as it is
const far = parseTiles({ ...D, delivery: { x: 8, y: 1e7, w: 4, h: 6 } });
show("parseTiles delivery.y = 1e7", far.delivery);
const tall = parseTiles({ ...D, delivery: { x: 8, y: 17, w: 4, h: 1e6 } });
show("parseTiles delivery.h = 1e6", tall.delivery);
show("parseTiles Number.MAX_SAFE_INTEGER + 2 (non sûr)", parseTiles({ ...D, delivery: { x: 8, y: 2 ** 53 + 2, w: 4, h: 6 } }).delivery);
// tighten is idempotent and keeps validity
const loose = w({ coverage: { y: 3 }, sources: { y: 12 }, delivery: { x: 0, y: 30 } });
show("tighten(tighten(x)) == tighten(x)", JSON.stringify(tighten(tighten(loose))) === JSON.stringify(tighten(loose)));
show("valid(tighten(x))", valid(tighten(loose)));
