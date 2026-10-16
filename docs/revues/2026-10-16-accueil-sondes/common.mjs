// Shared by the probes of the home review (2026-10-16): Chromium from app/, the API answered from app/e2e/fixtures/,
// the home served by the backend at BASE (`LD_API_TOKEN=x LD_ARCHIVE_DIR=<archive> uv run uvicorn
// ld_backend.api:app_from_env --factory --port 8018`, after `cd app && npm run build`).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "../../..");
export const { chromium } = await import(join(ROOT, "app/node_modules/playwright/index.mjs"));
export const BASE = process.env.BASE ?? "http://127.0.0.1:8018";
export const MOCKUP = "file://" + join(ROOT, "design/comps/shell/home.html");
export const OUT = process.env.OUT ?? join(HERE, "captures");
export const TOKEN = "demo-token";
export const NOW = new Date("2026-01-19T19:30:00Z");
const fixture = (name) => JSON.parse(readFileSync(join(ROOT, "app/e2e/fixtures", name), "utf8"));

/** Answers /api/** from the fixtures (`override` replaces the infrastructures body). */
export async function mockApi(page, override) {
  const diffs = fixture("diffs.json");
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().headers().authorization !== `Bearer ${TOKEN}`) return route.fulfill({ status: 401, json: { code: "unauthorized" } });
    if (url.pathname === "/api/infrastructures") return route.fulfill({ json: override ?? fixture("infrastructures.json") });
    if (url.pathname === "/api/intent/journal") return route.fulfill({ json: fixture("journal.json") });
    const diff = url.pathname === "/api/diff" ? diffs[url.searchParams.get("to") ?? ""] : undefined;
    return diff ? route.fulfill({ json: diff }) : route.fulfill({ status: 404, json: { code: "not_found" } });
  });
}

export async function openHome(browser, { theme = "light", accent = "cobalt", lang = "fr", width = 1440, height = 900, reduced = false, override, token = TOKEN } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: "UTC", reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await mockApi(page, override);
  await page.addInitScript(({ prefs, token }) => {
    localStorage.setItem("ld-prefs", JSON.stringify(prefs));
    if (token) sessionStorage.setItem("ld-api-token", token);
  }, { prefs: { theme, accent, language: lang }, token });
  await page.goto(BASE + "/next/");
  await page.evaluate(() => document.fonts.ready);
  if (token) await page.getByText(lang === "fr" ? "aucun changement" : "no change").first().waitFor();
  await page.waitForTimeout(400);
  return { context, page };
}

export async function openMockup(browser, { theme = "light", accent = "a", width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto(MOCKUP);
  await page.evaluate(({ theme, accent }) => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = accent;
    document.querySelector(".bench")?.remove();
  }, { theme, accent });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { context, page };
}

/** WCAG ratio of an element's text colour against the background it is painted on (ancestors composited). */
export const CONTRAST_JS = `(el) => {
  const parse = (v) => { const m = /^rgba?\\(([^)]+)\\)$/.exec(v); if (!m) return null; const p = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
  const layers = []; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
  let bg = [255, 255, 255, 1]; for (const l of layers.reverse()) bg = over(l, bg);
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const fg = over(parse(getComputedStyle(el).color), bg);
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return { ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, fg: getComputedStyle(el).color, bg: 'rgb(' + bg.slice(0, 3).map(Math.round).join(', ') + ')' };
}`;
