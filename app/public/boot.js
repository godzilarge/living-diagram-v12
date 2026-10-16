// The first script of both pages, served as it is (public/, no bundling: it must not wait for the application's
// chunk): the stored theme and accent go on <html> before the first paint, so that a dark theme chosen never shows a
// white page first. Reads `ld-prefs` alone, tolerantly: a value outside the choices is the default, as `src/prefs.ts`
// reads it. The language follows with the application (it is not a colour). Tested under Node (tests/boot.test.ts).

/** @typedef {{ theme: "light" | "dark", accent: "cobalt" | "ink" }} EarlyPrefs */

/** @type {EarlyPrefs} */
export const EARLY_DEFAULTS = Object.freeze({ theme: "light", accent: "cobalt" });

/**
 * The theme and accent of a stored `ld-prefs` text; the defaults for anything unreadable. Pure.
 * @param {string | null} raw
 * @returns {EarlyPrefs}
 */
export function earlyPrefs(raw) {
  try {
    const data = raw ? JSON.parse(raw) : null;
    const record = data && typeof data === "object" && !Array.isArray(data) ? data : {};
    return Object.freeze({
      theme: record.theme === "dark" ? "dark" : EARLY_DEFAULTS.theme,
      accent: record.accent === "ink" ? "ink" : EARLY_DEFAULTS.accent,
    });
  } catch {
    return EARLY_DEFAULTS;
  }
}

if (typeof document !== "undefined") {
  let raw = null;
  try {
    raw = localStorage.getItem("ld-prefs");
  } catch {
    raw = null;
  }
  const early = earlyPrefs(raw);
  document.documentElement.dataset.theme = early.theme;
  document.documentElement.dataset.accent = early.accent;
}
