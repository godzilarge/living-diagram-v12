import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LOG, DIAGRAM, NOW, OUT, open, TOKEN, mockApi } from "./common";
import { journalPage } from "./common";
test("canvas notes while the Log shows", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const api = await mockApi(page);
  await page.route("**/api/intent/journal**", (route) => route.fulfill({ json: journalPage() }));
  await open(page, LOG, { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
  await expect(page.locator("[data-feed-row]").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2500);
  const inLog = { placements: api.placements.length, toasts: await page.locator("[data-toast], .ui-toast").allInnerTexts() };
  await page.getByRole("tab", { name: "Diagramme" }).click();
  await page.waitForTimeout(1500);
  const inDiagram = { placements: api.placements.length, toasts: await page.locator("[data-toast], .ui-toast").allInnerTexts() };
  // and the same run opened on the Diagram directly
  const api2 = await mockApi(page);
  await open(page, DIAGRAM, { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
  await page.waitForTimeout(2500);
  const direct = { placements: api2.placements.length, toasts: await page.locator("[data-toast], .ui-toast").allInnerTexts() };
  writeFileSync(`${OUT}/notes.json`, JSON.stringify({ inLog, inDiagram, direct }, null, 1));
});
