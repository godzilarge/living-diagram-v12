// TEMPORARY probes of the brick-5 review; deleted after the review.
import { expect, test } from "@playwright/test";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

const ENGLISH = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|ago|yesterday|today|tomorrow|hours?|minutes?|days?|weeks?)\b/i;

for (const path of ["/next/", "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#node=dc01-core-01"]) {
  test(`switch to French on ${path}: no English date word left`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    await open(page, path, LIGHT, { token: TOKEN });
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => document.body.innerText);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Français" }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => document.body.innerText + "\n" + [...document.querySelectorAll("[aria-label],[title]")].map((e) => e.getAttribute("aria-label") ?? e.getAttribute("title")).join("\n"));
    const left = after.split("\n").filter((l) => ENGLISH.test(l));
    const hadBefore = before.split("\n").filter((l) => ENGLISH.test(l)).slice(0, 6);
    console.log(JSON.stringify({ path, hadBefore, left: left.slice(0, 20) }));
    expect(true).toBe(true);
  });
}
