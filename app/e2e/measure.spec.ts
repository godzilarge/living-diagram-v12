// The measurement of DESIGN.md on the rendered pages: light and dark, cobalt and ink (and French once, whose words
// run longer). Every bar's controls equal in height (0.5 px), centred (1 px), at most two gaps; every island ≥ 16 px
// from the page's edges and ≥ 12 px from the others; every popover ≥ 16 px from the edges and off its trigger; every
// tooltip one computed style, 8 px from its control; every text ≥ 4.5:1 against its rendered background and fully
// opaque; Archivo loaded; no CSP refusal. The home is measured on the synthetic API of e2e/fixtures/. Keyboard,
// toasts and reduced motion: interaction.spec.ts.
import { expect, test } from "@playwright/test";
import { audit } from "./audit";
import { mockApi, NOW, open, TOKEN } from "./helpers";

const LIMITS = { edge: 16, gap: 12, contrast: 4.5, tooltip: 8 };
test.use({ timezoneId: "UTC" });
const CAPTURES = "e2e/captures";
const VARIANTS = [
  { theme: "light", accent: "cobalt", lang: "en" },
  { theme: "dark", accent: "cobalt", lang: "en" },
  { theme: "light", accent: "ink", lang: "en" },
  { theme: "dark", accent: "ink", lang: "en" },
  { theme: "light", accent: "cobalt", lang: "fr" },
] as const;

function expectClean(report: Awaited<ReturnType<typeof audit>>) {
  expect(report.font.archivo, "Archivo is loaded").toBe(true);
  expect(report.bars.flatMap((bar) => bar.flags), "bars").toEqual([]);
  expect(report.floats.flags, "floating surfaces").toEqual([]);
  expect(report.layers.flags, "popovers and lists").toEqual([]);
  expect(report.tooltips.flags, "tooltips").toEqual([]);
  expect(report.contrast.flags, "text contrast").toEqual([]);
  expect(report.opacity.flags, "text opacity").toEqual([]);
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
    expect(report.layers.count, "the open list, the two popovers, the search palette and the two open volets of edit mode").toBe(6);
    expect(report.tooltips.count, "the forced tooltips").toBeGreaterThanOrEqual(5);
    expect(report.contrast.checked, "texts measured").toBeGreaterThanOrEqual(100);
    expectClean(report);
  });

  test(`home, ${tag}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    const problems = await open(page, "/next/", variant, { token: TOKEN });
    const infrastructures = page.getByRole("table", { name: "Infrastructures" });
    await expect(infrastructures.locator("tbody tr")).toHaveCount(6);
    await expect(page.locator(".ui-feed-item")).toHaveCount(10);
    // the diffs fill their cells after the page shows: wait for the last one
    await expect(page.getByText(variant.lang === "fr" ? "aucun changement" : "no change").first()).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/home-${tag}.png` });
    await page.getByRole("button", { name: variant.lang === "fr" ? "Réglages" : "Settings", exact: true }).click();
    await page.waitForTimeout(400);
    const report = await page.evaluate(audit, LIMITS);
    expect(problems, "console errors and CSP refusals").toEqual([]);
    expect(report.floats.count, "logo, tools, three widgets and the free slot").toBe(6);
    expect(report.layers.count, "the settings popover").toBe(1);
    expect(report.contrast.checked, "texts measured").toBeGreaterThanOrEqual(120);
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
  await page.waitForTimeout(200); // its 150 ms fade-in ends before it is measured
  const report = await page.evaluate(audit, LIMITS);
  expect(report.tooltips.flags).toEqual([]);
  expect(forced).toBe("rgb(0, 0, 0)");
});

test("the settings choices change the theme and the accent of the page", async ({ page }) => {
  await open(page, "/next/primitives.html", VARIANTS[0]);
  await page.getByRole("group", { name: "Theme" }).first().getByRole("button", { name: "Dark" }).click();
  await page.getByRole("group", { name: "Accent" }).first().getByRole("button", { name: "ink" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "ink");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") || "{}"));
  expect(stored).toMatchObject({ theme: "dark", accent: "ink" });
  await expect(page.getByRole("group", { name: "Theme" }).first().getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
});
