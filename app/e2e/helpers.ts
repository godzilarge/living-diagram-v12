// Opening a page for a test: its preferences stored before load, console errors and CSP refusals collected, the
// whole page in the viewport (forced tooltips and lists are placed against the real page, not a 900 px window).
// The home reads the API: `mockApi` answers `/api/**` from the fixtures (e2e/fixtures/, synthetic: lab-sec carries a
// hundred collections), refusing any other token than TOKEN with a 401, as the backend does, and keeping the
// `recent` latest collections of each infrastructure as the backend does; `open(…, { token, prefs })` stores the
// token in the tab and more browser preferences (`homeRuns`) first.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

export type Prefs = Readonly<{ theme: string; accent: string; lang: string }>;
export const LIGHT: Prefs = { theme: "light", accent: "cobalt", lang: "en" };
export const TOKEN = "demo-token";
/** The fixtures' "now": an evening after the last collections (2026-01-19). */
export const NOW = new Date("2026-01-19T19:30:00Z");

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));

/** `refuse`: every answer a 401 (a token revoked meanwhile); `refuseDiffs`: only the diffs (revoked after the page
 *  showed); `infrastructures`: another body for the list (many infrastructures, long names). */
export type ApiMock = { calls: string[]; refuse: boolean; refuseDiffs: boolean; infrastructures?: unknown; diffsInFlight: number; mostDiffsInFlight: number };

/** The fixture's list. */
export const infrastructuresFixture = () => fixture("infrastructures.json") as { infrastructures: Record<string, unknown>[]; unreadable: number };

/** Answers the API from the fixtures, refusing what the mock's state says. */
export async function mockApi(page: Page, options: Partial<ApiMock> = {}): Promise<ApiMock> {
  const state: ApiMock = { calls: [], refuse: false, refuseDiffs: false, diffsInFlight: 0, mostDiffsInFlight: 0, ...options };
  const diffs = fixture("diffs.json") as Record<string, unknown>;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    state.calls.push(url.pathname + url.search);
    if (state.refuse || route.request().headers().authorization !== `Bearer ${TOKEN}`)
      return route.fulfill({ status: 401, json: { code: "unauthorized", detail: "missing or invalid token" } });
    if (url.pathname === "/api/diff" && state.refuseDiffs) return route.fulfill({ status: 401, json: { code: "unauthorized" } });
    if (url.pathname === "/api/infrastructures") return route.fulfill({ json: recentOnly(state.infrastructures ?? fixture("infrastructures.json"), url) });
    if (url.pathname === "/api/intent/journal") return route.fulfill({ json: fixture("journal.json") });
    const to = url.searchParams.get("to") ?? "";
    // the hundred collections of lab-sec share one diff: nothing changed
    const diff = url.pathname === "/api/diff" ? (diffs[to] ?? (to.startsWith("lab-") ? diffs["wan-0119"] : undefined)) : undefined;
    if (url.pathname === "/api/diff") {
      // a diff answers after a beat: two asked together would be seen in flight together
      state.diffsInFlight += 1;
      state.mostDiffsInFlight = Math.max(state.mostDiffsInFlight, state.diffsInFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      state.diffsInFlight -= 1;
    }
    return diff ? route.fulfill({ json: diff }) : route.fulfill({ status: 404, json: { code: "not_found" } });
  });
  return state;
}

/** The `recent` latest collections of each infrastructure (6 by default), as `GET /api/infrastructures` keeps them. */
function recentOnly(body: unknown, url: URL): unknown {
  const recent = Number(url.searchParams.get("recent") ?? 6);
  const list = body as { infrastructures: { recent_runs?: unknown[] }[] };
  return { ...list, infrastructures: list.infrastructures.map((item) => ({ ...item, recent_runs: (item.recent_runs ?? []).slice(0, recent) })) };
}

/** Opens a page with its preferences stored, collects console errors and CSP refusals. */
export async function open(page: Page, path: string, prefs: Prefs, options: { token?: string; prefs?: Record<string, unknown> } = {}) {
  const problems: string[] = [];
  page.on("console", (message) => {
    // a 401 of the API is part of the token flow, not a defect of the page
    if (/status of 401/.test(message.text())) return;
    if (message.type() === "error" || /Content Security Policy/i.test(message.text())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.addInitScript(
    ({ stored, token }) => {
      localStorage.setItem("ld-prefs", JSON.stringify(stored));
      if (token && !sessionStorage.getItem("ld-test-seeded")) {
        sessionStorage.setItem("ld-api-token", token);
        sessionStorage.setItem("ld-test-seeded", "1");
      }
    },
    { stored: { theme: prefs.theme, accent: prefs.accent, language: prefs.lang, ...options.prefs }, token: options.token ?? "" },
  );
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  // the whole page in the viewport: forced tooltips and lists are placed against the real page, not a 900 px window
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height > 900) await page.setViewportSize({ width: 1440, height });
  await page.waitForTimeout(600); // forced tooltips and popovers finish their fade
  return problems;
}
