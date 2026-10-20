import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LOG, OUT, open, TOKEN, withJournal } from "./common";
for (const motion of ["no-preference", "reduce"] as const) test(`motion ${motion}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: motion });
  await withJournal(page);
  await open(page, LOG, { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
  await expect(page.locator("[data-feed-row]").first()).toBeVisible({ timeout: 15_000 });
  const r = await page.evaluate(() => {
    const d = (el: Element | null, pseudo?: string) => el ? `${getComputedStyle(el, pseudo).transitionDuration} ${getComputedStyle(el, pseudo).animationDuration}` : "absent";
    return { facet: d(document.querySelector(".ui-facet")), rail: d(document.querySelector(".ui-facet[role=radio]"), "::before"), head: d(document.querySelector("button.ui-feed-head")), segment: d(document.querySelector(".ui-segment")), scrollBehavior: getComputedStyle(document.querySelector(".journal-body")!).scrollBehavior };
  });
  writeFileSync(`${OUT}/motion-${motion}.json`, JSON.stringify(r));
});
