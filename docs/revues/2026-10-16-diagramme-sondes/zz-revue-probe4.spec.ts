// TEMPORARY review probe 4 (relecteur-ui, 2026-10-16), deleted after use.
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { mockApi, NOW, open, TOKEN } from "./helpers";
const OUT = process.env.PROBE_OUT ?? "/tmp";
test.use({ timezoneId: "UTC" });
for (const theme of ["light", "dark"]) test(`minimap ${theme}`, async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112", { theme, accent: "cobalt", lang: "en" }, { token: TOKEN, prefs: { minimap: true } });
  await expect(page.locator(".react-flow__minimap")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const m = document.querySelector(".react-flow__minimap")!.getBoundingClientRect();
    const c = document.querySelector("[data-float=canvas-controls]")!.getBoundingClientRect();
    const cs = getComputedStyle(document.querySelector(".react-flow__minimap")!);
    return { mini: [m.left, m.top, m.width, m.height], gapToControls: c.top - m.bottom, left: m.left, bg: cs.backgroundColor, border: cs.borderTopColor, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow };
  });
  writeFileSync(`${OUT}/probe4-${theme}.json`, JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/minimap-${theme}.png` });
});
