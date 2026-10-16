// The boot script reads the theme and accent exactly as prefs.ts does, from the same stored text.
import { describe, expect, it } from "vitest";
import { EARLY_DEFAULTS, earlyPrefs } from "../public/boot.js";
import { DEFAULT_PREFS, parsePrefs } from "../src/prefs";

describe("boot", () => {
  it("reads the theme and the accent as prefs.ts does, the defaults for anything unreadable", () => {
    for (const raw of [null, "", "{oops", "[1]", '{"theme":"sepia","accent":"violet"}', '{"theme":"dark"}', '{"accent":"ink"}', '{"theme":"dark","accent":"ink","language":"fr"}']) {
      const prefs = parsePrefs(raw);
      expect(earlyPrefs(raw), raw ?? "null").toEqual({ theme: prefs.theme, accent: prefs.accent });
    }
    expect(EARLY_DEFAULTS).toEqual({ theme: DEFAULT_PREFS.theme, accent: DEFAULT_PREFS.accent });
    expect(Object.isFrozen(earlyPrefs('{"theme":"dark"}'))).toBe(true);
  });
});
