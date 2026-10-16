// TEMPORARY probe of the brick-5 review; deleted after the review.
import { test } from "@playwright/test";
test("duplicate ids on the primitives page", async ({ page }) => {
  await page.goto("/next/primitives.html");
  await page.waitForTimeout(800);
  console.log(JSON.stringify(await page.evaluate(() => { const ids = [...document.querySelectorAll("[id^=prefs-]")].map((e) => e.id); return ids.filter((id, i) => ids.indexOf(id) !== i); })));
});
