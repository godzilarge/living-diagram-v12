// The tiles of the Check view (state/tiles.ts): the default layout, the stored value read back, the library's layout,
// the board's rule a gesture is judged by, and "Tighten the tiles".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COLS, DEFAULT_TILES, fits, GAP, fromLayout, judge, MAX_ROWS, MIN, overlap, parseTiles, ROW_HEIGHT, tighten, TILE_IDS, toLayout, valid } from "../src/state/tiles";
import type { Tiles } from "../src/state/tiles";

const with_ = (tiles: Tiles, patch: Partial<Record<keyof Tiles, Partial<Tiles[keyof Tiles]>>>): Tiles =>
  Object.fromEntries(TILE_IDS.map((id) => [id, { ...tiles[id], ...patch[id] }])) as unknown as Tiles;

describe("the default layout", () => {
  it("is the mockup's: Verdicts on 8 columns and 17 rows, the three others stacked on the right", () => {
    expect(DEFAULT_TILES).toEqual({
      verdicts: { x: 0, y: 0, w: 8, h: 17 },
      coverage: { x: 8, y: 0, w: 4, h: 5 },
      sources: { x: 8, y: 5, w: 4, h: 6 },
      delivery: { x: 8, y: 11, w: 4, h: 6 },
    });
    expect(valid(DEFAULT_TILES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_TILES) && Object.isFrozen(DEFAULT_TILES.verdicts)).toBe(true);
    expect([COLS, MIN.w, MIN.h]).toEqual([12, 3, 3]);
  });

  it("holds the row height and the gutter to the tokens tiles.row-height and tiles.gap", () => {
    const css = readFileSync(resolve(__dirname, "../src/styles/tokens.css"), "utf8");
    expect(css).toContain(`--tiles-row-height: ${ROW_HEIGHT}px;`);
    expect(css).toContain(`--tiles-gap: ${GAP}px;`);
  });
});

describe("the stored value", () => {
  it("reads a valid layout as it is", () => {
    const moved = with_(DEFAULT_TILES, { coverage: { x: 0, y: 17 } });
    expect(parseTiles(JSON.parse(JSON.stringify(moved)))).toEqual(moved);
    expect(Object.isFrozen(parseTiles(moved))).toBe(true);
  });

  it("gives the default for anything unreadable, overlapping, or out of the grid", () => {
    for (const value of [null, undefined, "x", 3, [], { verdicts: [] }]) expect(parseTiles(value)).toBe(DEFAULT_TILES);
    // Coverage over Verdicts: the whole default
    expect(parseTiles(with_(DEFAULT_TILES, { coverage: { x: 2 } }))).toBe(DEFAULT_TILES);
  });

  it("gives a tile that is missing or unreadable its default place, when it then fits", () => {
    const { coverage: _dropped, ...rest } = with_(DEFAULT_TILES, { verdicts: { h: 20 } });
    expect(parseTiles(rest)).toEqual(with_(DEFAULT_TILES, { verdicts: { h: 20 } }));
    // out of the 12 columns, under 3 × 3, a fraction, a text: each its default place
    for (const bad of [{ x: 10, w: 4 }, { w: 2 }, { h: 2.5 }, { x: "8" }, { y: -1 }])
      expect(parseTiles(with_(DEFAULT_TILES, { coverage: bad as never }))).toEqual(DEFAULT_TILES);
  });

  it("bounds a stored tile at 200 rows: a value past it takes its default place", () => {
    expect(MAX_ROWS).toBe(200);
    const deep = with_(DEFAULT_TILES, { coverage: { x: 0, y: 194, w: 4, h: 6 } });
    expect(parseTiles(deep)).toEqual(deep);
    for (const bad of [{ x: 0, y: 195, h: 6 }, { x: 0, y: 1e7 }, { x: 0, y: 17, h: 1e6 }, { x: 0, y: Number.MAX_SAFE_INTEGER + 2 }])
      expect(parseTiles(with_(DEFAULT_TILES, { coverage: bad }))).toEqual(DEFAULT_TILES);
    // the columns too: x + w past 12
    expect(parseTiles(with_(DEFAULT_TILES, { coverage: { x: 9, w: 4 } }))).toEqual(DEFAULT_TILES);
  });
});

describe("the library's layout", () => {
  it("goes there with the minimum size, and back", () => {
    const layout = toLayout(DEFAULT_TILES);
    expect(layout.map((item) => item.i)).toEqual(["verdicts", "coverage", "sources", "delivery"]);
    expect(layout[0]).toEqual({ i: "verdicts", x: 0, y: 0, w: 8, h: 17, minW: 3, minH: 3 });
    expect(fromLayout(layout)).toEqual(DEFAULT_TILES);
  });

  it("marks a layout with a neutral field the library sees as different", () => {
    expect(toLayout(DEFAULT_TILES, true)[0]).toEqual({ i: "verdicts", x: 0, y: 0, w: 8, h: 17, minW: 3, minH: 3, maxW: 12 });
    expect(fromLayout(toLayout(DEFAULT_TILES, true))).toEqual(DEFAULT_TILES);
  });

  it("keeps the base's place for a tile the layout does not hold, and ignores an unknown one", () => {
    const layout = [{ i: "coverage", x: 0, y: 20, w: 4, h: 5 }, { i: "elsewhere", x: 0, y: 0, w: 1, h: 1 }];
    expect(fromLayout(layout)).toEqual(with_(DEFAULT_TILES, { coverage: { x: 0, y: 20 } }));
  });
});

describe("overlap and fits", () => {
  it("say whether two places share a cell and whether a place is free", () => {
    expect(overlap({ x: 0, y: 0, w: 3, h: 3 }, { x: 3, y: 0, w: 3, h: 3 })).toBe(false);
    expect(overlap({ x: 0, y: 0, w: 3, h: 3 }, { x: 2, y: 2, w: 3, h: 3 })).toBe(true);
    expect(fits({ x: 10, y: 0, w: 3, h: 3 }, [])).toBe(false);
    expect(fits({ x: 0, y: -1, w: 3, h: 3 }, [])).toBe(false);
    expect(fits({ x: 0, y: 100, w: 3, h: 3 }, [])).toBe(true);
  });
});

describe("the board's rule", () => {
  it("lets a tile move onto free cells, below the others too (the grid has no bottom)", () => {
    const next = with_(DEFAULT_TILES, { coverage: { x: 0, y: 17 } });
    expect(judge(DEFAULT_TILES, next)).toEqual({ tiles: next, refused: false });
  });

  it("refuses a move onto occupied cells or out of the columns: the previous layout comes back", () => {
    expect(judge(DEFAULT_TILES, with_(DEFAULT_TILES, { coverage: { x: 4 } }))).toEqual({ tiles: DEFAULT_TILES, refused: true });
    expect(judge(DEFAULT_TILES, with_(DEFAULT_TILES, { coverage: { x: 9 } }))).toEqual({ tiles: DEFAULT_TILES, refused: true });
  });

  it("stops a resize at its neighbour: the height gives way first, then the width", () => {
    // Coverage pulled by its south-east corner, two columns wider and four rows taller: blocked by Sources under it
    const pulled = with_(DEFAULT_TILES, { coverage: { w: 4, h: 9 } });
    expect(judge(DEFAULT_TILES, pulled, "se").tiles.coverage).toEqual({ x: 8, y: 0, w: 4, h: 5 });
    // Sources moved away: the same pull takes its rows
    const free = with_(DEFAULT_TILES, { sources: { x: 0, y: 17 } });
    expect(judge(free, with_(free, { coverage: { h: 9 } }), "s").tiles.coverage).toEqual({ x: 8, y: 0, w: 4, h: 9 });
    // Verdicts pulled east into Coverage: its width gives way back to 8
    expect(judge(DEFAULT_TILES, with_(DEFAULT_TILES, { verdicts: { w: 10 } }), "e")).toEqual({ tiles: DEFAULT_TILES, refused: false });
  });

  it("changes one dimension only on a side, and keeps the opposite edge on a pull from the west or the north", () => {
    const narrowed = with_(DEFAULT_TILES, { verdicts: { w: 6, h: 18 } });
    expect(judge(DEFAULT_TILES, narrowed, "e").tiles.verdicts).toEqual({ x: 0, y: 0, w: 6, h: 17 });
    // Delivery pulled north into Sources: it gives way from the north, its bottom stays
    const north = with_(DEFAULT_TILES, { delivery: { y: 9, h: 8 } });
    expect(judge(DEFAULT_TILES, north, "n").tiles.delivery).toEqual({ x: 8, y: 11, w: 4, h: 6 });
    // Coverage pulled west into Verdicts: its east edge stays
    const west = with_(DEFAULT_TILES, { coverage: { x: 6, w: 6 } });
    expect(judge(DEFAULT_TILES, west, "w").tiles.coverage).toEqual({ x: 8, y: 0, w: 4, h: 5 });
  });

  it("pulls from the north-west, the north-east and the south-west: the height gives way first, then the width, the opposite corner kept", () => {
    const away = with_(DEFAULT_TILES, { coverage: { x: 0, y: 30 } });
    // Sources pulled north-west into Verdicts: down to its height, then its width, from the north and the west
    expect(judge(away, with_(away, { sources: { x: 6, y: 2, w: 6, h: 9 } }), "nw").tiles.sources).toEqual({ x: 8, y: 5, w: 4, h: 6 });
    // the same pull on free cells: taken as it is, the south-east corner in place
    expect(judge(away, with_(away, { sources: { y: 2, h: 9 } }), "nw").tiles.sources).toEqual({ x: 8, y: 2, w: 4, h: 9 });
    // Delivery pulled north-east past the window's edge and into Sources: back to its place, its south-west corner kept
    expect(judge(DEFAULT_TILES, with_(DEFAULT_TILES, { delivery: { y: 9, w: 5, h: 8 } }), "ne").tiles.delivery).toEqual({ x: 8, y: 11, w: 4, h: 6 });
    const free = with_(DEFAULT_TILES, { sources: { x: 0, y: 17 } });
    expect(judge(free, with_(free, { delivery: { y: 7, h: 10 } }), "ne").tiles.delivery).toEqual({ x: 8, y: 7, w: 4, h: 10 });
    // Coverage pulled south-west into Verdicts and Sources: its north-east corner kept
    expect(judge(DEFAULT_TILES, with_(DEFAULT_TILES, { coverage: { x: 6, w: 6, h: 7 } }), "sw").tiles.coverage).toEqual({ x: 8, y: 0, w: 4, h: 5 });
  });

  it("gives way in height again, under where it was, when the width alone does not make it fit", () => {
    // a corner pull the library also shifted down: Delivery over Sources moved under it; the height back to 6, the
    // width down to 3, then the height again to 5
    const below = with_(DEFAULT_TILES, { sources: { y: 17 } });
    const shifted = with_(below, { delivery: { y: 12, h: 7 } });
    expect(judge(below, shifted, "se")).toEqual({ tiles: with_(below, { delivery: { x: 8, y: 12, w: 3, h: 5 } }), refused: false });
    // never under 3 × 3: nothing fits, the previous layout comes back
    const tight = with_(DEFAULT_TILES, { sources: { y: 14 } , delivery: { y: 11, h: 3 } });
    expect(judge(tight, with_(tight, { delivery: { y: 12, h: 4 } }), "se").refused).toBe(true);
  });

  it("never goes under 3 × 3: a size the library would give under it is refused", () => {
    expect(judge(DEFAULT_TILES, with_(DEFAULT_TILES, { coverage: { w: 2 } }), "e")).toEqual({ tiles: DEFAULT_TILES, refused: true });
    expect(judge(DEFAULT_TILES, with_(DEFAULT_TILES, { verdicts: { h: 2 } }), "s").refused).toBe(true);
  });

  it("accepts several changes only when the whole is valid, and nothing changed as it is", () => {
    const swapped = with_(DEFAULT_TILES, { sources: { y: 11 }, delivery: { y: 5 } });
    expect(judge(DEFAULT_TILES, swapped)).toEqual({ tiles: swapped, refused: false });
    expect(judge(DEFAULT_TILES, with_(DEFAULT_TILES, { sources: { y: 0 }, delivery: { y: 0 } })).refused).toBe(true);
    expect(judge(DEFAULT_TILES, DEFAULT_TILES)).toEqual({ tiles: DEFAULT_TILES, refused: false });
  });

  it("never touches its inputs", () => {
    const before = JSON.stringify(DEFAULT_TILES);
    judge(DEFAULT_TILES, with_(DEFAULT_TILES, { coverage: { w: 6 } }), "e");
    expect(JSON.stringify(DEFAULT_TILES)).toBe(before);
  });
});

describe("tighten", () => {
  it("moves every tile up as far as it goes, in reading order, without overlap", () => {
    const loose = with_(DEFAULT_TILES, { coverage: { y: 3 }, sources: { y: 12 }, delivery: { x: 0, y: 30 } });
    expect(tighten(loose)).toEqual(with_(DEFAULT_TILES, { coverage: { y: 0 }, sources: { y: 5 }, delivery: { x: 0, y: 17 } }));
    expect(tighten(DEFAULT_TILES)).toEqual(DEFAULT_TILES);
    expect(valid(tighten(loose))).toBe(true);
  });
});
