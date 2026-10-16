// TEMPORARY review probe 3 (relecteur-ui, 2026-10-16), deleted after use.
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";
const OUT = process.env.PROBE_OUT ?? "/tmp";
const AT_REST = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
test.use({ timezoneId: "UTC" });
test("aria and tooltips", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const out: Record<string, unknown> = {};
  for (const f of ["brand", "context", "views", "tools", "canvas-controls", "runs"]) out[f] = await page.locator(`[data-float="${f}"]`).ariaSnapshot();
  const tips: Record<string, string> = {};
  for (const name of ["Edit: editing tools", "Export as PNG or SVG", "Search", "Account", "Show everything"]) {
    await page.mouse.move(700, 500);
    await page.waitForTimeout(300);
    await page.getByRole("button", { name, exact: true }).hover();
    await page.waitForTimeout(800);
    tips[name] = (await page.getByRole("tooltip").allTextContents()).join(" / ");
  }
  out.tips = tips;
  // the infrastructure choice
  await page.getByRole("combobox", { name: "Infrastructure" }).click();
  out.infraOptions = await page.getByRole("listbox").getByRole("option").allTextContents();
  writeFileSync(`${OUT}/probe3.json`, JSON.stringify(out, null, 1));
});
