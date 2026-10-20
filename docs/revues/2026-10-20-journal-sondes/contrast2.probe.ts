import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { CONTRAST, LOG, OUT, open, TOKEN, withJournal } from "./common";

for (const theme of ["light", "dark"]) for (const accent of ["cobalt", "ink"]) {
  test(`contrast2 ${theme} ${accent}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await withJournal(page);
    await open(page, LOG, { theme, accent, lang: "fr" }, { token: TOKEN });
    await expect(page.locator("[data-feed-row]").first()).toBeVisible({ timeout: 15_000 });
    await page.mouse.move(1, 899);
    const out: Record<string, unknown> = {};
    const m = (sel: string) => page.evaluate(({ sel, CONTRAST }) => { const C = eval(CONTRAST); const el = document.querySelector(sel); if (!el) return "absent"; return Math.round(C.ratio(C.parse(getComputedStyle(el).color), C.bgOf(el)) * 100) / 100; }, { sel, CONTRAST });
    out["destroy verb"] = await m('.ui-feed-item[data-tone="destroy"] .ui-feed-verb');
    out["quiet sentence"] = await m('.ui-feed-item[data-tone="quiet"] .ui-feed-sentence');
    out["tally border vs paper"] = await page.evaluate((CONTRAST) => { const C = eval(CONTRAST); const el = document.querySelector(".ui-feed-tally")!; return Math.round(C.ratio(C.parse(getComputedStyle(el).borderTopColor), C.bgOf(el)) * 100) / 100; }, CONTRAST);
    out["search border"] = await page.evaluate((CONTRAST) => { const C = eval(CONTRAST); const els = [...document.querySelectorAll(".journal-search *")].filter((e) => getComputedStyle(e).borderTopWidth !== "0px"); return els.map((el) => `${el.className}:${Math.round(C.ratio(C.parse(getComputedStyle(el).borderTopColor), C.bgOf(el.parentElement!)) * 100) / 100}`); }, CONTRAST);
    for (const [fill, attr] of [["target", "data-target"], ["hover", "data-force"]]) {
      await page.evaluate(({ attr }) => { const h = document.querySelectorAll("[data-feed-row]")[1] as HTMLElement; if (attr === "data-target") h.parentElement!.setAttribute(attr, ""); else h.setAttribute(attr, "hover"); }, { attr });
      await page.waitForTimeout(200);
      for (const sel of [".ui-feed-sub", ".ui-feed-when time", ".ui-feed-note", "b"]) out[`${sel} on ${fill}`] = await page.evaluate(({ sel, CONTRAST }) => { const C = eval(CONTRAST); const h = document.querySelectorAll("[data-feed-row]")[1]; const el = h.querySelector(sel); if (!el) return "absent"; const bg = C.bgOf(el); return `${Math.round(C.ratio(C.parse(getComputedStyle(el).color), bg) * 100) / 100} bg ${bg.r},${bg.g},${bg.b}`; }, { sel, CONTRAST });
      // focus ring against the fill
      out[`focus ring on ${fill}`] = await page.evaluate((CONTRAST) => { const C = eval(CONTRAST); const h = document.querySelectorAll("[data-feed-row]")[1] as HTMLElement; h.focus(); return Math.round(C.ratio(C.parse(getComputedStyle(h).outlineColor), C.bgOf(h)) * 100) / 100; }, CONTRAST);
      await page.evaluate(({ attr }) => { const h = document.querySelectorAll("[data-feed-row]")[1] as HTMLElement; h.parentElement!.removeAttribute(attr); h.removeAttribute(attr); }, { attr });
    }
    writeFileSync(`${OUT}/contrast2-${theme}-${accent}.json`, JSON.stringify(out, null, 1));
  });
}
