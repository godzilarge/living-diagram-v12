// The tiles of the Check view (DESIGN.md, Check view; the bench design/rounds/2026-10-24-grille/, direction G3 "free,
// the page scrolls"): four widgets on a grid of 12 columns and rows of 32 px, placed freely, never overlapping, never
// compacted. Pure, tested under Node: the default layout (the approved mockup's), the reading of the stored
// preference (`ld-prefs.checkTiles`), the conversion to and from the layout library's items, the board's rule that
// judges every change a gesture makes (`judge`), and "Tighten the tiles" (`tighten`).

export const TILE_IDS = ["verdicts", "coverage", "sources", "delivery"] as const;
export type TileId = (typeof TILE_IDS)[number];

/** A tile's place in cells: its column, its row, its width and height. */
export type Tile = Readonly<{ x: number; y: number; w: number; h: number }>;
export type Tiles = Readonly<Record<TileId, Tile>>;

/** The grid (DESIGN.md, Check view, Grid): 12 columns, rows of 32 px (`tiles.row-height`), 16 px gutters; a tile is 3 × 3
 *  at least. */
export const COLS = 12;
export const ROW_HEIGHT = 32;
/** The gutter between tiles in pixels (`tiles.gap`); the layout library takes numbers. */
export const GAP = 16;
export const MIN: Readonly<{ w: number; h: number }> = Object.freeze({ w: 3, h: 3 });
/** The deepest row a stored tile may reach (y + h): the grid has no bottom, a preference read back has one (an aberrant
 *  value would draw a space of millions of pixels). */
export const MAX_ROWS = 200;

/** The mockup's layout: Verdicts columns 0–7 over 17 rows (800 px); Coverage, Cables and sources, Delivery stacked on
 *  the four columns of the right. */
export const DEFAULT_TILES: Tiles = Object.freeze({
  verdicts: Object.freeze({ x: 0, y: 0, w: 8, h: 17 }),
  coverage: Object.freeze({ x: 8, y: 0, w: 4, h: 5 }),
  sources: Object.freeze({ x: 8, y: 5, w: 4, h: 6 }),
  delivery: Object.freeze({ x: 8, y: 11, w: 4, h: 6 }),
});

/** The side or corner a resize pulls (the library's handles). */
export type Axis = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const freeze = (tiles: Record<TileId, Tile>): Tiles =>
  Object.freeze(Object.fromEntries(TILE_IDS.map((id) => [id, Object.freeze({ ...tiles[id] })])) as Record<TileId, Tile>);

/** True when two places share a cell. */
export const overlap = (a: Tile, b: Tile): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Inside the 12 columns, under the top (the grid has no bottom), whole cells, 3 × 3 at least. */
const inside = (tile: Tile): boolean =>
  [tile.x, tile.y, tile.w, tile.h].every(Number.isInteger) && tile.x >= 0 && tile.y >= 0 && tile.w >= MIN.w && tile.h >= MIN.h && tile.x + tile.w <= COLS;

/** True when a place is inside the grid and shares no cell with the others. */
export const fits = (tile: Tile, others: readonly Tile[]): boolean => inside(tile) && !others.some((other) => overlap(tile, other));

const othersOf = (tiles: Tiles, id: TileId): Tile[] => TILE_IDS.filter((other) => other !== id).map((other) => tiles[other]);

/** Every tile inside the grid, none over another. */
export const valid = (tiles: Tiles): boolean => TILE_IDS.every((id) => fits(tiles[id], othersOf(tiles, id)));

const same = (a: Tile, b: Tile): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
export const sameTiles = (a: Tiles, b: Tiles): boolean => TILE_IDS.every((id) => same(a[id], b[id]));

/** The stored value read back (DESIGN.md, Check view, Preference): a tile that is not four whole numbers inside the
 *  grid (and above `MAX_ROWS`) takes its default place (an incomplete value gives the default for what is missing); a layout whose tiles
 *  then overlap, or a value that is not an object, gives the whole default layout. */
export function parseTiles(value: unknown): Tiles {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_TILES;
  const data = value as Record<string, unknown>;
  const read = (raw: unknown): Tile | null => {
    if (!raw || typeof raw !== "object") return null;
    const { x, y, w, h } = raw as Record<string, unknown>;
    const tile = { x, y, w, h } as Tile;
    return [x, y, w, h].every((n) => typeof n === "number") && inside(tile) && tile.y + tile.h <= MAX_ROWS ? tile : null;
  };
  const parsed = freeze(Object.fromEntries(TILE_IDS.map((id) => [id, read(data[id]) ?? DEFAULT_TILES[id]])) as Record<TileId, Tile>);
  if (sameTiles(parsed, DEFAULT_TILES)) return DEFAULT_TILES;
  return valid(parsed) ? parsed : DEFAULT_TILES;
}

/** An item of the layout library (react-grid-layout's `LayoutItem`), as far as the grid needs it. */
export type LayoutTile = Readonly<{ i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number; maxW?: number }>;

/** The library's layout, in the tiles' order, with the minimum size; `mark` adds a neutral field (`maxW` at the
 *  grid's width, which bounds nothing) so the library takes back a layout equal to the one it was last given (after
 *  a refused drop it keeps the tile where the pointer left it unless its layout changes). */
export const toLayout = (tiles: Tiles, mark = false): LayoutTile[] =>
  TILE_IDS.map((id) => ({ i: id, ...tiles[id], minW: MIN.w, minH: MIN.h, ...(mark ? { maxW: COLS } : {}) }));

/** The tiles a layout of the library says; a tile it does not hold keeps its place in `base`. */
export function fromLayout(layout: readonly LayoutTile[], base: Tiles = DEFAULT_TILES): Tiles {
  const by = new Map(layout.map((item) => [item.i, item]));
  return freeze(Object.fromEntries(TILE_IDS.map((id) => {
    const item = by.get(id);
    return [id, item ? { x: item.x, y: item.y, w: item.w, h: item.h } : base[id]];
  })) as Record<TileId, Tile>);
}

export type Judged = Readonly<{ tiles: Tiles; refused: boolean }>;

/** A resize of one tile made to fit: a pull on a side changes one dimension only (the library rounds the other from
 *  the pixels it measured) and only that one gives way; from a corner, the height gives way first (down to where it
 *  was), then the width, then the height again, never under 3 × 3; a pull on the west or the north keeps the
 *  opposite edge in place. */
function resized(before: Tile, after: Tile, others: readonly Tile[], axis: Axis | null): Tile {
  const north = !!axis && axis.includes("n");
  const west = !!axis && axis.includes("w");
  let tile = { ...after };
  if (axis === "e" || axis === "w") tile = { ...tile, y: before.y, h: before.h };
  if (axis === "n" || axis === "s") tile = { ...tile, x: before.x, w: before.w };
  const side = axis === "e" || axis === "w" ? "width" : axis === "n" || axis === "s" ? "height" : null;
  while (side !== "width" && tile.h > before.h && tile.h > MIN.h && !fits(tile, others)) tile = { ...tile, h: tile.h - 1, y: north ? tile.y + 1 : tile.y };
  while (side !== "height" && tile.w > MIN.w && !fits(tile, others)) tile = { ...tile, w: tile.w - 1, x: west ? tile.x + 1 : tile.x };
  while (side !== "width" && tile.h > MIN.h && !fits(tile, others)) tile = { ...tile, h: tile.h - 1, y: north ? tile.y + 1 : tile.y };
  return tile;
}

/** The board's rule (the bench's `board`, without a bottom): never outside the 12 columns nor above the top, never an
 *  overlap. One tile changed: its size changed, it was resized (made to fit, `resized`); only its place changed, it
 *  was moved and lands only on free cells, else the change is refused and `prev` comes back. Several changed: kept
 *  only when everything is valid. */
export function judge(prev: Tiles, next: Tiles, axis: Axis | null = null): Judged {
  const changed = TILE_IDS.filter((id) => !same(prev[id], next[id]));
  if (changed.length === 0) return { tiles: prev, refused: false };
  if (changed.length === 1) {
    const id = changed[0];
    const before = prev[id];
    const others = othersOf(next, id);
    const after = before.w !== next[id].w || before.h !== next[id].h ? resized(before, next[id], others, axis) : next[id];
    return fits(after, others) ? { tiles: freeze({ ...next, [id]: after }), refused: false } : { tiles: prev, refused: true };
  }
  return valid(next) ? { tiles: freeze({ ...next }), refused: false } : { tiles: prev, refused: true };
}

/** "Tighten the tiles": every tile moved up as far as it goes, in reading order (row, then column), without overlap;
 *  gaps close once, on demand, never on their own. */
export function tighten(tiles: Tiles): Tiles {
  const order = [...TILE_IDS].sort((a, b) => tiles[a].y - tiles[b].y || tiles[a].x - tiles[b].x);
  const placed: Partial<Record<TileId, Tile>> = {};
  for (const id of order) {
    let tile = tiles[id];
    const above = Object.values(placed) as Tile[];
    while (tile.y > 0 && !above.some((other) => overlap({ ...tile, y: tile.y - 1 }, other))) tile = { ...tile, y: tile.y - 1 };
    placed[id] = tile;
  }
  return freeze(placed as Record<TileId, Tile>);
}
