// What the shell lays over the canvas, in screen pixels: the top row of islands and the bottom row (16 px from the
// edge, a 48 px island, 12 px to the next island), and on the right the panel when one is shown (its width and 12 px
// to the canvas). Fitting and centring frame inside what stays visible. In focus the panel covers the map over the
// scrim: nothing is framed around it, the insets are those of a page without a panel.
import type { Insets } from "../state/zoom";
import type { Width } from "../state/panel";

const EDGE = 16;
const ISLAND = 48;
const GAP = 12;
/** The panel's widths (DESIGN.md `panel.width`, Layout): what the canvas gives up on the right. */
export const PANEL_PX: Readonly<Record<Exclude<Width, "focus">, number>> = Object.freeze({ compact: 440, wide: 864 });

export const CHROME: Insets = Object.freeze({ top: EDGE + ISLAND + GAP, right: 0, bottom: EDGE + ISLAND + GAP, left: 0 });

/** The insets with a panel of `width` shown on the right, or without one. */
export function chromeWith(width: Width | null): Insets {
  if (!width || width === "focus") return CHROME;
  return Object.freeze({ ...CHROME, right: PANEL_PX[width] + GAP });
}
