import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { OUT, open, TOKEN, withJournal } from "./common";
for (const theme of ["light", "dark"]) for (const [tag, base] of [["new", "http://127.0.0.1:4391"], ["old", "http://127.0.0.1:4392"]]) {
  test(`home ${tag} ${theme}`, async ({ page }) => {
    await withJournal(page, () => ({ entries: [], total: 0, next: null, authors: [], categories: [], infrastructures: [], actions: [], unreadable: 0, start_missing: false }));
    await page.unroute("**/api/intent/journal**");
    await open(page, `${base}/next/`, { theme, accent: "cobalt", lang: "fr" }, { token: TOKEN });
    const w = page.locator('[data-float="modifications"], [data-widget="modifications"]').first();
    await expect(page.locator(".ui-feed-item, .home-feed-item").first()).toBeVisible({ timeout: 15_000 });
    await page.mouse.move(1, 899); await page.waitForTimeout(500);
    const box = await page.evaluate(() => { const li = document.querySelector(".ui-feed-item, .home-feed-item")!; const list = li.parentElement!; const wd = list.closest("section, [data-float]")!; const b = wd.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, rows: [...list.children].map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.y), Math.round(r.height)]; }), texts: [...list.children].map((c) => (c as HTMLElement).innerText.replace(/\n/g, " | ")).slice(0, 10) }; });
    writeFileSync(`${OUT}/home-${tag}-${theme}.json`, JSON.stringify(box, null, 1));
    await page.screenshot({ path: `${OUT}/home-${tag}-${theme}.png`, clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
  });
}
