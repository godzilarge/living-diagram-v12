import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, HOME_CHANGES, HOME_RUNS, mergePrefs, parsePrefs } from "../src/prefs";

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

  it("keep the v1's own fields on write, without touching the stored text", () => {
    const stored = '{"grid":true,"theme":"light"}';
    const merged = JSON.parse(mergePrefs(stored, { ...DEFAULT_PREFS, theme: "dark", homeRuns: 25 }));
    expect(merged).toEqual({ grid: true, theme: "dark", accent: "cobalt", language: null, homeRuns: 25, homeChanges: 10, minimap: false, panel: "compact" });
    expect(stored).toBe('{"grid":true,"theme":"light"}');
    expect(Object.isFrozen(parsePrefs(stored))).toBe(true);
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
});
