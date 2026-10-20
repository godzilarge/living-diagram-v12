import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LOG, OUT, open, TOKEN, withJournal } from "./common";
test("subtitle cut with a filter", async ({ page }) => {
  const out: string[] = [];
  for (const [lang, hash] of [["fr", "&jau=orhan"], ["fr", "&jinfra=*"], ["fr", "&jinfra=*&jau=orhan"], ["en", "&jau=orhan"], ["fr", "&jp=range&jfrom=2026-01-01&jto=2026-01-15"]]) {
    await withJournal(page);
    await open(page, LOG + hash, { theme: "light", accent: "cobalt", lang }, { token: TOKEN });
    await expect(page.locator("[data-feed-row]").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
    out.push(lang + hash + " -> " + await page.evaluate(() => { const e = document.querySelector(".journal-subtitle") as HTMLElement; return `${e.textContent} | shown ${e.clientWidth}/${e.scrollWidth} cut=${e.scrollWidth > e.clientWidth} | search ${Math.round(document.querySelector(".journal-search")!.getBoundingClientRect().width)}`; }));
    await page.screenshot({ path: `${OUT}/subtitle-${lang}${hash.replace(/[^a-z]/g, "")}.png`, clip: { x: 424, y: 80, width: 896, height: 60 } });
  }
  writeFileSync(`${OUT}/subtitle.txt`, out.join("\n"));
});
