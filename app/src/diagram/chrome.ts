// What the shell lays over the canvas, in screen pixels: the top row of islands and the bottom row (16 px from the
// edge, a 48 px island, 12 px to the next island). Fitting and centring frame inside what stays visible. The panel
// (brick 3) will add its width on the right.
import type { Insets } from "../state/zoom";

const EDGE = 16;
const ISLAND = 48;
const GAP = 12;

export const CHROME: Insets = Object.freeze({ top: EDGE + ISLAND + GAP, right: 0, bottom: EDGE + ISLAND + GAP, left: 0 });
