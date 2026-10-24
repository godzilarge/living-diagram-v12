// The Check view's tiles in a test: its address, a tile and its box, the stored layout, a carry by the pointer, a
// tile's grip (its header's title) and handles, the register read. Shared by control.spec.ts and tiles.spec.ts.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export const DIAGRAM = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
export const CHECK = `${DIAGRAM}#mode=control`;
export const TILE_IDS = ["verdicts", "coverage", "sources", "delivery"] as const;

/** A tile's island and its box on screen. */
export const tile = (page: Page, id: string) => page.locator(`[data-float="${id}"]`);
export const boxOf = async (page: Page, id: string) => (await tile(page, id).boundingBox())!;
/** The stored layout of the tiles. */
export const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") || "{}").checkTiles ?? null);

/** Presses, carries in steps and keeps the button down (the caller releases). */
export async function carry(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.waitForTimeout(200);
}

/** A tile's header, where it is grabbed (its title, never a control). */
export const grip = async (page: Page, id: string) => {
  const title = (await tile(page, id).locator(".ui-widget-head h2").boundingBox())!;
  return { x: title.x + 20, y: title.y + title.height / 2 };
};

/** A handle of a tile (shown under the pointer). */
export async function handle(page: Page, id: string, axis: string) {
  const island = await boxOf(page, id);
  await page.mouse.move(island.x + island.width / 2, island.y + island.height / 2);
  await page.waitForTimeout(250);
  return (await page.locator(`[data-tile="${id}"] > .react-resizable-handle-${axis}`).boundingBox())!;
}

/** The Check view has read its collection: the register and its rows. */
export async function shown(page: Page): Promise<void> {
  await expect(page.locator("table.ui-register tr.ui-register-row").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
}
