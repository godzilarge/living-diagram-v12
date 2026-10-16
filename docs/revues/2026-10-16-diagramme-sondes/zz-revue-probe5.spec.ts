// TEMPORARY review probe 5 (relecteur-ui, 2026-10-16), deleted after use.
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";
const OUT = process.env.PROBE_OUT ?? "/tmp";
test.use({ timezoneId: "UTC" });
test("mode=control and compare disabled", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#mode=control", LIGHT, { token: TOKEN });
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  const out: Record<string, unknown> = { hash: await page.evaluate(() => location.hash), selected: await page.getByRole("tab", { selected: true }).textContent() };
  await open(page, "/next/?infrastructure=demo-dc&run_id=demo-0105", LIGHT, { token: TOKEN });
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  const compare = page.getByRole("combobox", { name: "Compare with an earlier collection" });
  out.compareDisabled = await compare.getAttribute("aria-disabled");
  await compare.hover();
  await page.waitForTimeout(900);
  out.compareTips = await page.getByRole("tooltip").allTextContents();
  writeFileSync(`${OUT}/probe5.json`, JSON.stringify(out));
});
