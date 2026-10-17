// Where a contextual bar sits (DESIGN.md, Contextual bars: Placement; the approved mockup's rule): 12 px above its
// element, centred on it, never over it; when it would come within 12 px of the top islands it flips 12 px below the
// element, and its volets then open downward (the Popover flips with it). It never leaves the zone the shell leaves
// free: right of the edit palette, under the top islands, above the canvas controls, 16 px from the right edge. An
// element outside the zone has no bar (it waits for the view to come back); an element taller than the zone gets the
// bar at the top of the zone (the only place left). Screen pixels, relative to the map.
// Pure, tested under Node.

export type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;
/** The free zone: where a bar's box may lie. */
export type Zone = Readonly<{ left: number; top: number; right: number; bottom: number }>;
export type BarPlace = Readonly<{ x: number; y: number; below: boolean }>;

/** Between the bar and its element, and between the bar and its volet (DESIGN.md: 12 px). */
export const BAR_GAP = 12;
/** A bar island: a 32 px control and 8 px around it. */
export const BAR_H = 48;
const EDGE = 16;
const ISLAND = 48;

/** The zone of a map `width` × `height` px: the top row of islands and the canvas controls take 16 + 48 + 12 at the
 *  top and the bottom, the edit palette the same on the left, 16 px stays on the right. */
export function zoneOf(width: number, height: number): Zone {
  const band = EDGE + ISLAND + BAR_GAP;
  return { left: band, top: band, right: width - EDGE, bottom: height - band };
}

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/** The bar's top left corner for an element at `anchor`, a bar `width` px wide. */
export function placeBar(anchor: Rect, width: number, zone: Zone): BarPlace | null {
  const outside = anchor.x + anchor.w < zone.left || anchor.x > zone.right || anchor.y + anchor.h < zone.top || anchor.y > zone.bottom;
  if (outside) return null;
  const x = Math.round(clamp(anchor.x + anchor.w / 2 - width / 2, zone.left, Math.max(zone.left, zone.right - width)));
  const above = anchor.y - BAR_GAP - BAR_H;
  if (above >= zone.top) return { x, y: Math.round(above), below: false };
  const below = anchor.y + anchor.h + BAR_GAP;
  if (below + BAR_H <= zone.bottom) return { x, y: Math.round(below), below: true };
  // neither side has room (an element taller than the zone): at the top of the zone, over the element, as the v1 did
  return { x, y: Math.round(zone.top), below: false };
}

/** The rect of a plan box on the screen, for a view `{ x, y, zoom }`. */
export const toScreen = (box: Rect, view: Readonly<{ x: number; y: number; zoom: number }>): Rect =>
  ({ x: view.x + box.x * view.zoom, y: view.y + box.y * view.zoom, w: box.w * view.zoom, h: box.h * view.zoom });
