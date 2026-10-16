import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, mergePrefs, parsePrefs } from "../src/prefs";

describe("browser preferences", () => {
  it("read tolerantly: anything unknown falls back to the default", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{oops")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("[1]")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"theme":"sepia","accent":"violet","language":"de"}')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"theme":"dark","accent":"ink","language":"fr"}')).toEqual({ theme: "dark", accent: "ink", language: "fr" });
  });

  it("share the v1's field names: a language chosen in the v1 is the v2's, an object written whole by the v1 loses only the accent", () => {
    const fromV1 = '{"theme":"light","language":"fr","grid":false,"snap":false,"minimap":true,"panelWidth":348}';
    expect(parsePrefs(fromV1)).toEqual({ theme: "light", accent: "cobalt", language: "fr" });
  });

  it("keep the v1's own fields on write, without touching the stored text", () => {
    const stored = '{"grid":true,"theme":"light"}';
    const merged = JSON.parse(mergePrefs(stored, { theme: "dark", accent: "cobalt", language: null }));
    expect(merged).toEqual({ grid: true, theme: "dark", accent: "cobalt", language: null });
    expect(stored).toBe('{"grid":true,"theme":"light"}');
    expect(Object.isFrozen(parsePrefs(stored))).toBe(true);
  });
});
