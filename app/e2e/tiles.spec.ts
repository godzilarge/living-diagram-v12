// The tiles of the Check view in motion (DESIGN.md, Check view, Move, Resize, Enlarge; review 2026-10-24 « grille »),
// in Chromium on the built sheet (its tokens minified: `240ms` is `.24s`): nothing else moves nor animates during a
// carry and no handle shows; a refused drop goes back in 240 ms, 1 ms under reduced motion; Enlarge and Reduce travel
// 240 ms, 1 ms under reduced motion; the other tiles are inert while one is enlarged; a tile dropped under the lowest
// one (the grid grows during the carry); the corner's L.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { LIGHT, mockApi, open, TOKEN } from "./helpers";
import { boxOf, carry, CHECK, grip, handle, shown, stored, tile, TILE_IDS } from "./tiles";

type Rect = Readonly<{ x: number; y: number }>;
const apart = (a: Rect, b: Rect) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

async function check(page: Page, reduced = false): Promise<void> {
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
}

/** The tile's box `ms` after the release of the pointer (measured in the page, not across the wire; headless Chromium
 *  draws its first frame some 50 ms after an input, hence 110 ms for "still travelling" and 150 for "arrived"). */
async function releasedAt(page: Page, id: string, ms: number): Promise<Rect> {
  await page.mouse.up();
  return page.evaluate(
    ([tileId, wait]) =>
      new Promise<Rect>((done) =>
        setTimeout(() => {
          const r = document.querySelector(`[data-float="${tileId}"]`)!.getBoundingClientRect();
          done({ x: r.x, y: r.y });
        }, wait as number),
      ),
    [id, ms] as const,
  );
}

/** The tile's box `ms` after a click on one of its buttons (clicked and measured in the page). */
async function clickedAt(page: Page, id: string, name: string, ms: number): Promise<Rect> {
  return page.evaluate(
    ([tileId, label, wait]) =>
      new Promise<Rect>((done) => {
        const island = document.querySelector(`[data-float="${tileId}"]`)!;
        (island.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click();
        setTimeout(() => {
          const r = island.getBoundingClientRect();
          done({ x: r.x, y: r.y });
        }, wait as number);
      }),
    [id, name, ms] as const,
  );
}

/** Sources carried onto Verdicts (a refused drop), the button still down. */
async function carryOntoVerdicts(page: Page) {
  const verdicts = await boxOf(page, "verdicts");
  await carry(page, await grip(page, "sources"), { x: verdicts.x + 200, y: verdicts.y + 240 });
  await expect(page.locator(".ui-tiles[data-refused]")).toHaveCount(1);
}

test("during a carry nothing else animates and no handle shows; a refused drop goes back in 240 ms", async ({ page }) => {
  await check(page);
  const home = await boxOf(page, "sources");
  await carryOntoVerdicts(page);
  const during = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".ui-tiles-item")].map((el) => ({
      id: el.dataset.tile,
      durations: getComputedStyle(el).transitionDuration,
      handles: [...el.querySelectorAll(":scope > .react-resizable-handle")].map((h) => getComputedStyle(h).opacity),
    })),
  );
  for (const item of during.filter((one) => one.id !== "sources"))
    expect(item.durations.split(",").every((d) => Number.parseFloat(d) === 0), `${item.id} carries no transition: ${item.durations}`).toBe(true);
  expect(new Set(during.flatMap((item) => item.handles)), "no handle on any tile").toEqual(new Set(["0"]));
  const mid = await releasedAt(page, "sources", 110);
  expect(apart(mid, home), "still travelling ~110 ms after the release").toBeGreaterThan(2);
  await page.waitForTimeout(300);
  expect(apart(await boxOf(page, "sources"), home), "back in its place").toBeLessThanOrEqual(1);
});

test("under reduced motion a refused drop is back at once", async ({ page }) => {
  await check(page, true);
  const home = await boxOf(page, "sources");
  await carryOntoVerdicts(page);
  expect(apart(await releasedAt(page, "sources", 150), home), "back within 150 ms (240 ms would still travel)").toBeLessThanOrEqual(1);
});

test("Enlarge and Reduce travel 240 ms; the other tiles are inert meanwhile", async ({ page }) => {
  await check(page);
  const home = await boxOf(page, "coverage");
  const big = { x: 16, y: 80 };
  const going = await clickedAt(page, "coverage", "Enlarge", 110);
  expect(apart(going, big), "on its way ~110 ms after the click").toBeGreaterThan(4);
  expect(apart(going, home), "left its place").toBeGreaterThan(4);
  await page.waitForTimeout(300);
  expect(apart(await boxOf(page, "coverage"), big), "over the space").toBeLessThanOrEqual(1);
  // Tab and Shift+Tab from Reduce never reach a tile it covers
  const inert = await page.locator(".ui-tiles-item[inert]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.tile));
  expect(inert).toEqual(TILE_IDS.filter((id) => id !== "coverage"));
  for (const key of ["Tab", "Shift+Tab"]) {
    await tile(page, "coverage").getByRole("button", { name: "Reduce" }).focus();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(key);
      const where = await page.evaluate(() => (document.activeElement?.closest("[data-tile]") as HTMLElement | null)?.dataset.tile ?? null);
      expect([null, "coverage"], `${key} ${i + 1}: focus in ${where}`).toContain(where);
    }
  }
  const coming = await clickedAt(page, "coverage", "Reduce", 110);
  expect(apart(coming, home), "on its way back ~110 ms after the click").toBeGreaterThan(4);
  await page.waitForTimeout(300);
  expect(apart(await boxOf(page, "coverage"), home), "back in its place").toBeLessThanOrEqual(1);
  await expect(page.locator(".ui-tiles-item[inert]")).toHaveCount(0);
});

test("under reduced motion Enlarge and Reduce are at once", async ({ page }) => {
  await check(page, true);
  const home = await boxOf(page, "coverage");
  expect(apart(await clickedAt(page, "coverage", "Enlarge", 150), { x: 16, y: 80 }), "enlarged within 150 ms").toBeLessThanOrEqual(1);
  expect(apart(await clickedAt(page, "coverage", "Reduce", 150), home), "reduced within 150 ms").toBeLessThanOrEqual(1);
});

test("a tile dropped under the lowest one: the grid grows during the carry, the space then scrolls", async ({ page }) => {
  await check(page);
  const space = page.locator("main.control-space");
  const from = await grip(page, "coverage");
  // down to the last rows (refused over Delivery): the grid grows under the tile in hand
  await carry(page, from, { x: from.x, y: from.y + 16 * 48 });
  const grown = await space.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(grown.scroll, "the grid grew during the carry").toBeGreaterThan(grown.client);
  // the space scrolled while the button is down, the tile follows the pointer under Delivery
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(200);
  await page.mouse.move(from.x, from.y + 16 * 48 + 8, { steps: 4 });
  await page.waitForTimeout(200);
  await expect(page.locator(".ui-tiles[data-refused]")).toHaveCount(0);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const coverage = (await stored(page))?.coverage;
  expect(coverage?.x).toBe(8);
  expect(coverage?.y, "under Delivery").toBeGreaterThanOrEqual(17);
  const after = await space.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(after.scroll, "the space scrolls to the tile").toBeGreaterThan(after.client);
});

test("a corner's L: straight legs of 7 px, a 2 px stroke, rounded 3 px, 5 px inside the tile's corner", async ({ page }) => {
  await check(page);
  const corner = await handle(page, "coverage", "se");
  const island = await boxOf(page, "coverage");
  const mark = await page.locator('[data-tile="coverage"] > .react-resizable-handle-se').evaluate((el) => {
    const style = getComputedStyle(el, "::before");
    return { w: style.width, h: style.height, right: style.borderRightWidth, bottom: style.borderBottomWidth, radius: style.borderBottomRightRadius, at: [style.right, style.bottom] };
  });
  expect(mark).toEqual({ w: "7px", h: "7px", right: "2px", bottom: "2px", radius: "3px", at: ["5px", "5px"] });
  expect(Math.round(island.x + island.width - (corner.x + corner.width)), "the handle in the tile's corner").toBe(0);
});
