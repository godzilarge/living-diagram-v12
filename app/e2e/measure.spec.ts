// The measurement of DESIGN.md on the rendered pages: light and dark, cobalt and ink (and French once, whose words
// run longer). Every bar's controls equal in height (0.5 px), centred (1 px), at most two gaps; every island ≥ 16 px
// from the page's edges and ≥ 12 px from the others; every popover ≥ 16 px from the edges and off its trigger; every
// tooltip one computed style; every text ≥ 4.5:1 against its rendered background; Archivo loaded; no CSP refusal.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { audit } from "./audit";

const LIMITS = { edge: 16, gap: 12, contrast: 4.5 };
const CAPTURES = "e2e/captures";
const VARIANTS = [
  { theme: "light", accent: "cobalt", lang: "en" },
  { theme: "dark", accent: "cobalt", lang: "en" },
  { theme: "light", accent: "ink", lang: "en" },
  { theme: "dark", accent: "ink", lang: "en" },
  { theme: "light", accent: "cobalt", lang: "fr" },
] as const;

/** Opens a page with its preferences stored, collects console errors and CSP refusals. */
async function open(page: Page, path: string, prefs: (typeof VARIANTS)[number]) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || /Content Security Policy/i.test(message.text())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.addInitScript((stored) => localStorage.setItem("ld-prefs", JSON.stringify(stored)), { theme: prefs.theme, accent: prefs.accent, lang: prefs.lang });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  // the whole page in the viewport: forced tooltips and lists are placed against the real page, not a 900 px window
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height > 900) await page.setViewportSize({ width: 1440, height });
  await page.waitForTimeout(600); // forced tooltips and popovers finish their fade
  return problems;
}

function expectClean(report: Awaited<ReturnType<typeof audit>>) {
  expect(report.font.archivo, "Archivo is loaded").toBe(true);
  expect(report.bars.flatMap((bar) => bar.flags), "bars").toEqual([]);
  expect(report.floats.flags, "floating surfaces").toEqual([]);
  expect(report.layers.flags, "popovers and lists").toEqual([]);
  expect(report.tooltips.flags, "tooltips").toEqual([]);
  expect(report.contrast.flags, "text contrast").toEqual([]);
}

for (const variant of VARIANTS) {
  const tag = `${variant.theme}-${variant.accent}-${variant.lang}`;

  test(`primitives page, ${tag}`, async ({ page }) => {
    const problems = await open(page, "/next/primitives.html", variant);
    await expect(page.locator("html")).toHaveAttribute("data-theme", variant.theme);
    await expect(page.locator("html")).toHaveAttribute("data-accent", variant.accent);
    await expect(page.locator("html")).toHaveAttribute("lang", variant.lang);
    const report = await page.evaluate(audit, LIMITS);
    await page.screenshot({ path: `${CAPTURES}/primitives-${tag}.png` });
    expect(problems, "console errors and CSP refusals").toEqual([]);
    expect(report.bars.length, "bars measured").toBeGreaterThanOrEqual(30);
    expect(report.floats.count, "islands measured").toBeGreaterThanOrEqual(30);
    expect(report.layers.count, "the open popover and list").toBe(2);
    expect(report.tooltips.count, "the forced tooltips").toBeGreaterThanOrEqual(5);
    expect(report.contrast.checked, "texts measured").toBeGreaterThanOrEqual(100);
    expectClean(report);
  });

  test(`shell, ${tag}`, async ({ page }) => {
    const problems = await open(page, "/next/", variant);
    await page.getByRole("button", { name: variant.lang === "fr" ? "Réglages" : "Settings" }).click();
    await page.waitForTimeout(400);
    const report = await page.evaluate(audit, LIMITS);
    await page.screenshot({ path: `${CAPTURES}/shell-${tag}.png` });
    expect(problems, "console errors and CSP refusals").toEqual([]);
    expect(report.floats.count, "the logo and tools islands").toBe(2);
    expect(report.layers.count, "the settings popover").toBe(1);
    const report2 = report.tooltips.count === 0 ? { ...report, tooltips: { ...report.tooltips, flags: [] } } : report;
    expectClean(report2);
  });
}

test("a hovered control shows the one tooltip after its delay", async ({ page }) => {
  await open(page, "/next/primitives.html", VARIANTS[0]);
  const forced = await page.evaluate(() => getComputedStyle(document.querySelector('[role="tooltip"]') as Element).backgroundColor);
  const zoom = page.getByRole("button", { name: "Zoom out" });
  await zoom.hover();
  await page.waitForTimeout(150);
  await expect(page.getByRole("tooltip", { name: /Zoom out/ })).toHaveCount(0);
  await expect(page.getByRole("tooltip", { name: /Zoom out/ })).toBeVisible({ timeout: 2000 });
  const report = await page.evaluate(audit, LIMITS);
  expect(report.tooltips.flags).toEqual([]);
  expect(forced).toBe("rgb(0, 0, 0)");
});

test("the settings choices change the theme and the accent of the page", async ({ page }) => {
  await open(page, "/next/primitives.html", VARIANTS[0]);
  await page.getByRole("radiogroup", { name: "Theme" }).first().getByRole("radio", { name: "Dark" }).click();
  await page.getByRole("radiogroup", { name: "Accent" }).first().getByRole("radio", { name: "Ink" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "ink");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") || "{}"));
  expect(stored).toMatchObject({ theme: "dark", accent: "ink" });
});
