import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, mergePrefs, parsePrefs } from "../src/prefs";

describe("browser preferences", () => {
  it("read tolerantly: anything unknown falls back to the default", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{oops")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("[1]")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"theme":"sepia","accent":"violet","lang":"de"}')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"theme":"dark","accent":"ink","lang":"fr"}')).toEqual({ theme: "dark", accent: "ink", language: "fr" });
  });

  it("keep the v1's own fields on write, without touching the stored text", () => {
    const stored = '{"grid":true,"theme":"light"}';
    const merged = JSON.parse(mergePrefs(stored, { theme: "dark", accent: "cobalt", language: null }));
    expect(merged).toEqual({ grid: true, theme: "dark", accent: "cobalt", lang: null });
    expect(stored).toBe('{"grid":true,"theme":"light"}');
    expect(Object.isFrozen(parsePrefs(stored))).toBe(true);
  });
});
