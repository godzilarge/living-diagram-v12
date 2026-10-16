// Opening a page for a test: its preferences stored before load, console errors and CSP refusals collected, the
// whole page in the viewport (forced tooltips and lists are placed against the real page, not a 900 px window).
import type { Page } from "@playwright/test";

export type Prefs = Readonly<{ theme: string; accent: string; lang: string }>;
export const LIGHT: Prefs = { theme: "light", accent: "cobalt", lang: "en" };

/** Opens a page with its preferences stored, collects console errors and CSP refusals. */
export async function open(page: Page, path: string, prefs: Prefs) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || /Content Security Policy/i.test(message.text())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.addInitScript((stored) => localStorage.setItem("ld-prefs", JSON.stringify(stored)), { theme: prefs.theme, accent: prefs.accent, language: prefs.lang });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  // the whole page in the viewport: forced tooltips and lists are placed against the real page, not a 900 px window
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height > 900) await page.setViewportSize({ width: 1440, height });
  await page.waitForTimeout(600); // forced tooltips and popovers finish their fade
  return problems;
}

