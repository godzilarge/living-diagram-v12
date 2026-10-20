import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LOG, OUT, open, TOKEN, withJournal } from "./common";
test("focus after a trip to the Diagram", async ({ page }) => {
  await withJournal(page);
  await open(page, LOG, { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
  const rows = page.locator("[data-feed-row]");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  await rows.nth(3).focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("tab", { name: "Diagramme" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("tab", { name: "Journal" }).click();
  await page.waitForTimeout(800);
  const a = await page.evaluate(() => ({ active: document.activeElement?.tagName + " " + (document.activeElement?.textContent ?? "").slice(0, 50), tabbable: [...document.querySelectorAll("[data-feed-row]")].findIndex((e) => e.getAttribute("tabindex") === "0") }));
  writeFileSync(`${OUT}/return.json`, JSON.stringify(a));
});
