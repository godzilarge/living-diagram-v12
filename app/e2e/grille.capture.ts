// The planche of the brick « grille » (DESIGN.md, Check view: the tiles and the register by rule), in French, written
// to .impeccable/planche-grille-brique/: the default layout at 1440 × 900 in light and dark, a tile in the middle of
// a move with its frame, a refused drop in red, a tile enlarged, a 13-inch window, a narrow Verdicts, a row open, a
// tile's corner under the pointer at × 4.
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

const OUT = "../.impeccable/planche-grille-brique";
const CHECK = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#mode=control";
const FR = { ...LIGHT, lang: "fr" };
mkdirSync(OUT, { recursive: true });

async function shown(page: Page) {
  await expect(page.locator("tr.ui-register-row").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}
const box = async (page: Page, id: string) => (await page.locator(`[data-float="${id}"]`).boundingBox())!;
const header = async (page: Page, id: string) => (await page.locator(`[data-float="${id}"] .ui-widget-head h2`).boundingBox())!;

async function lift(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.waitForTimeout(250);
}

for (const theme of ["light", "dark"] as const) {
  test(`the default layout, ${theme}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    await open(page, CHECK, { ...FR, theme }, { token: TOKEN });
    await shown(page);
    await page.locator("tr.ui-register-row").nth(3).click();
    await page.mouse.move(720, 890);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/defaut-${theme}-1440.png` });
  });
}

test("a move, a refused drop, a tile enlarged", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, CHECK, FR, { token: TOKEN });
  await shown(page);
  // Verdicts narrowed by its east edge, then Coverage carried into the place it freed
  const verdicts = await box(page, "verdicts");
  await page.mouse.move(verdicts.x + 200, verdicts.y + 200);
  const east = (await page.locator('[data-tile="verdicts"] > .react-resizable-handle-e').boundingBox())!;
  await lift(page, { x: east.x + 4, y: east.y + 200 }, { x: east.x + 4 - 356, y: east.y + 200 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const coverage = await header(page, "coverage");
  const narrowed = await box(page, "verdicts");
  await lift(page, { x: coverage.x + 40, y: coverage.y + 8 }, { x: narrowed.x + narrowed.width + 16 + 40, y: coverage.y + 8 });
  await page.screenshot({ path: `${OUT}/pendant-glisse.png` });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.mouse.move(720, 890);
  await page.screenshot({ path: `${OUT}/apres-glisse.png` });
  // Sources carried over Verdicts: the frame turns red, the tile comes back
  const sources = await header(page, "sources");
  await lift(page, { x: sources.x + 40, y: sources.y + 8 }, { x: 200, y: 300 });
  await page.screenshot({ path: `${OUT}/depot-refuse.png` });
  await page.mouse.up();
  await page.waitForTimeout(400);
  // Verdicts enlarged over the space
  await page.locator('[data-float="verdicts"]').getByRole("button", { name: "Agrandir" }).click();
  await page.waitForTimeout(400);
  await page.mouse.move(720, 60);
  await page.screenshot({ path: `${OUT}/agrandi.png` });
});

test("a 13-inch window and a narrow Verdicts", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  const narrow = { verdicts: { x: 0, y: 0, w: 5, h: 17 }, coverage: { x: 5, y: 0, w: 7, h: 6 }, sources: { x: 5, y: 6, w: 7, h: 5 }, delivery: { x: 5, y: 11, w: 7, h: 6 } };
  await page.addInitScript(() => sessionStorage.setItem("ld-api-token", "demo-token"));
  await page.addInitScript(() => {
    if (!localStorage.getItem("ld-prefs")) localStorage.setItem("ld-prefs", JSON.stringify({ theme: "light", accent: "cobalt", language: "fr" }));
  });
  await page.goto(CHECK);
  await shown(page);
  await page.mouse.move(683, 760);
  await page.screenshot({ path: `${OUT}/1366.png` });
  await page.evaluate((tiles) => localStorage.setItem("ld-prefs", JSON.stringify({ theme: "light", accent: "cobalt", language: "fr", checkTiles: tiles })), narrow);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await shown(page);
  await page.locator("tr.ui-register-row").nth(3).click();
  await page.mouse.move(720, 890);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/verdicts-etroite.png` });
});

test("the living page's Check section", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ld-prefs", JSON.stringify({ theme: "light", accent: "cobalt", language: "fr" })));
  await page.goto("/next/primitives.html");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const section = page.locator("#check");
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: `${OUT}/page-vivante-controle.png` });
});

test("a tile's corner under the pointer, × 4", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4, timezoneId: "UTC", locale: "en-GB" });
  const page = await context.newPage();
  await mockApi(page);
  await open(page, CHECK, FR, { token: TOKEN });
  await shown(page);
  const coverage = await box(page, "coverage");
  await page.mouse.move(coverage.x + coverage.width - 40, coverage.y + coverage.height - 40);
  await page.waitForTimeout(300);
  const right = coverage.x + coverage.width;
  const bottom = coverage.y + coverage.height;
  await page.screenshot({ path: `${OUT}/coin-x4.png`, clip: { x: right - 48, y: bottom - 48, width: 64, height: 64 } });
  await context.close();
});
