import { describe, expect, it } from "vitest";
import { changedPrefs, DEFAULT_PREFS, HOME_CHANGES, HOME_RUNS, mergePrefs, parsePrefs } from "../src/prefs";
import { DEFAULT_TILES, tighten } from "../src/state/tiles";

describe("browser preferences", () => {
  it("read tolerantly: anything unknown falls back to the default", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{oops")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("[1]")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"theme":"sepia","accent":"violet","language":"de"}')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"theme":"dark","accent":"ink","language":"fr"}')).toEqual({ ...DEFAULT_PREFS, theme: "dark", accent: "ink", language: "fr" });
  });

  it("share the v1's field names: a language chosen in the v1 is the v2's, an object written whole by the v1 loses only the accent", () => {
    const fromV1 = '{"theme":"light","language":"fr","grid":false,"snap":false,"minimap":true,"panelWidth":348}';
    expect(parsePrefs(fromV1)).toEqual({ ...DEFAULT_PREFS, language: "fr", grid: false, minimap: true });
  });

  it("write only what changed: the v1's own fields and every field nobody chose are kept, the stored text untouched", () => {
    const stored = '{"grid":true,"theme":"light","snap":false}';
    const changes = changedPrefs(parsePrefs(stored), { ...parsePrefs(stored), theme: "dark", homeRuns: 25 });
    expect(changes).toEqual({ theme: "dark", homeRuns: 25 });
    expect(JSON.parse(mergePrefs(stored, changes))).toEqual({ grid: true, theme: "dark", snap: false, homeRuns: 25 });
    expect(stored).toBe('{"grid":true,"theme":"light","snap":false}');
    expect(Object.isFrozen(parsePrefs(stored))).toBe(true);
    expect(Object.isFrozen(changes)).toBe(true);
    expect(changedPrefs(DEFAULT_PREFS, DEFAULT_PREFS)).toEqual({});
  });

  it("a language chosen alone never writes the v2's defaults over the v1's (its theme is dark, its grid off, its minimap on)", () => {
    const stored = null;
    const changes = changedPrefs(parsePrefs(stored), { ...parsePrefs(stored), language: "fr" });
    expect(JSON.parse(mergePrefs(stored, changes))).toEqual({ language: "fr" });
  });

  it("read the rows of two home widgets tolerantly: a value outside the choices, a text or a fraction gives the default", () => {
    expect(parsePrefs('{"homeRuns":50,"homeChanges":100}')).toMatchObject({ homeRuns: 50, homeChanges: 100 });
    expect(parsePrefs('{"homeRuns":7,"homeChanges":6}')).toMatchObject({ homeRuns: 6, homeChanges: 10 });
    expect(parsePrefs('{"homeRuns":"50","homeChanges":null}')).toMatchObject({ homeRuns: 6, homeChanges: 10 });
    expect(parsePrefs('{"homeRuns":12.5,"homeChanges":-1}')).toMatchObject({ homeRuns: 6, homeChanges: 10 });
    expect(HOME_RUNS[0]).toBe(DEFAULT_PREFS.homeRuns);
    expect(HOME_CHANGES[0]).toBe(DEFAULT_PREFS.homeChanges);
  });

  it("read the panel's width under its own name: compact or wide, never the v1's pixels", () => {
    expect(parsePrefs('{"panel":"wide","panelWidth":348}')).toMatchObject({ panel: "wide" });
    expect(parsePrefs('{"panel":"focus"}')).toMatchObject({ panel: "compact" });
    expect(parsePrefs('{"panelWidth":864}')).toMatchObject({ panel: "compact" });
  });

  it("read the canvas controls under the v1's names, a non-boolean giving the mockup's default", () => {
    expect(parsePrefs('{"grid":false,"minimap":true}')).toMatchObject({ grid: false, minimap: true });
    expect(parsePrefs('{"grid":"yes","minimap":1}')).toMatchObject({ grid: true, minimap: false });
  });

  it("read the Check view's tiles: a valid layout as stored, anything else the default layout", () => {
    expect(DEFAULT_PREFS.checkTiles).toBe(DEFAULT_TILES);
    const moved = { ...DEFAULT_TILES, coverage: { x: 0, y: 17, w: 4, h: 5 } };
    expect(parsePrefs(JSON.stringify({ checkTiles: moved })).checkTiles).toEqual(moved);
    expect(parsePrefs('{"checkTiles":"wide"}').checkTiles).toBe(DEFAULT_TILES);
    expect(parsePrefs('{"checkTiles":{"verdicts":{"x":0,"y":0,"w":12,"h":17}}}').checkTiles).toBe(DEFAULT_TILES);
  });

  it("write the tiles alone after a gesture, every other field kept", () => {
    const stored = '{"theme":"dark","snap":false}';
    const before = parsePrefs(stored);
    const moved = { ...DEFAULT_TILES, coverage: { x: 0, y: 17, w: 4, h: 5 } };
    const changes = changedPrefs(before, { ...before, checkTiles: moved });
    expect(changes).toEqual({ checkTiles: moved });
    expect(JSON.parse(mergePrefs(stored, changes))).toEqual({ theme: "dark", snap: false, checkTiles: moved });
    // tightened back to the default: a new object, written all the same (compared by reference)
    expect(changedPrefs(parsePrefs(mergePrefs(stored, changes)), { ...before, checkTiles: tighten(moved) })).toHaveProperty("checkTiles");
  });
});
