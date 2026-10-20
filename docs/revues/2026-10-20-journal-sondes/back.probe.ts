import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LOG, OUT, open, TOKEN, withJournal } from "./common";

test("o then Back; History then Back; accessible names", async ({ page }) => {
  await withJournal(page);
  await open(page, LOG + "&jau=orhan", { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
  const rows = page.locator("[data-feed-row]");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const log: string[] = [];
  log.push("history.length " + await page.evaluate(() => history.length));
  log.push((await page.locator('[data-float="journal"] .ui-feed').ariaSnapshot()).split("\n").slice(0, 14).join("\n"));
  log.push((await page.locator('[data-float="facets"]').ariaSnapshot()).split("\n").slice(0, 14).join("\n"));
  log.push((await page.locator('[data-bar="journal-head"]').ariaSnapshot()));
  await rows.first().focus();
  await page.keyboard.press("o");
  await page.waitForTimeout(800);
  log.push("after o: " + await page.evaluate(() => location.hash) + " history.length " + await page.evaluate(() => history.length));
  await page.evaluate(() => history.back());
  await page.waitForTimeout(1500);
  log.push("after back: " + await page.evaluate(() => location.hash) + " journal shown " + await page.locator('[data-float="journal"]').count());
  writeFileSync(`${OUT}/back.txt`, log.join("\n"));
});
