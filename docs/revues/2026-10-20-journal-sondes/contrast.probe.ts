import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { CONTRAST, LOG, OUT, open, TOKEN, withJournal } from "./common";

const TEXT = [
  [".journal-subtitle", "subtitle"], [".ui-feed-sub", "revision"], [".ui-feed-when time", "time"], [".ui-facet-count:not([data-zero])", "count"],
  [".ui-facet-count[data-zero]", "count zero"], [".ui-facet-note", "facet note"], [".ui-facets-head h3", "section title"], [".ui-feed-times", "tally times"],
  [".ui-feed-span", "tally span"], [".ui-feed-note", "feed note"], ['.ui-feed-item[data-tone="quiet"] .ui-feed-sentence', "quiet sentence"],
  ['.ui-feed-item[data-tone="quiet"] .ui-feed-sentence b', "quiet author"], [".ui-feed-verb", "destroy verb"], [".ui-feed-day-title", "day"],
  [".journal-foot", "foot"], [".journal-foot-note", "foot note"], [".ui-facet:not([aria-checked=true]):not([aria-pressed=true]) .ui-facet-label", "facet word"],
  [".ui-facets-clear", "clear word"], ["[data-item] .ui-feed-caption", "caption"],
];

for (const theme of ["light", "dark"]) for (const accent of ["cobalt", "ink"]) {
  test(`contrast ${theme} ${accent}`, async ({ page }) => {
    await withJournal(page);
    // a category on (the clear word), all infrastructures (captions)
    await open(page, LOG.replace("#mode=journal", "#mode=journal&jcat=annotations&jinfra=*"), { theme, accent, lang: "fr" }, { token: TOKEN });
    await expect(page.locator("[data-feed-row]").first()).toBeVisible({ timeout: 15_000 });
    await page.mouse.move(1, 899);
    await page.waitForTimeout(300);
    const res = await page.evaluate(({ TEXT, CONTRAST }) => {
      const C = eval(CONTRAST);
      const out: Record<string, unknown> = {};
      for (const [sel, name] of TEXT) {
        const el = document.querySelector(sel);
        if (!el) { out[name] = "absent"; continue; }
        const fg = C.parse(getComputedStyle(el).color), bg = C.bgOf(el);
        out[name] = Math.round(C.ratio(fg, bg) * 100) / 100;
      }
      // the same texts on the target fill (accent-weak) and on the hover fill (ground)
      const head = document.querySelector("[data-feed-row]") as HTMLElement;
      for (const [fill, apply] of [["accent-weak", () => head.parentElement!.setAttribute("data-target", "")], ["hover", () => { head.parentElement!.removeAttribute("data-target"); head.setAttribute("data-force", "hover"); }]] as const) {
        apply();
        for (const sel of [".ui-feed-sub", ".ui-feed-when time", ".ui-feed-sentence"]) {
          const el = head.querySelector(sel)!; out[`${sel} on ${fill}`] = Math.round(C.ratio(C.parse(getComputedStyle(el).color), C.bgOf(el)) * 100) / 100;
        }
      }
      head.removeAttribute("data-force");
      // non-text: the rail, the check, the focus ring, the tally border, the search border, against paper
      const paper = C.bgOf(document.querySelector('[data-float="journal"]'));
      const rail = document.querySelector('.ui-facet[aria-checked="true"]')!;
      out["rail vs paper"] = Math.round(C.ratio(C.parse(getComputedStyle(rail, "::before").backgroundColor), paper) * 100) / 100;
      const check = document.querySelector(".ui-facet-slot svg");
      out["check vs paper"] = check ? Math.round(C.ratio(C.parse(getComputedStyle(check).color), paper) * 100) / 100 : "absent";
      head.focus();
      out["focus ring vs paper"] = Math.round(C.ratio(C.parse(getComputedStyle(head).outlineColor), paper) * 100) / 100;
      out["focus ring style"] = `${getComputedStyle(head).outlineStyle} ${getComputedStyle(head).outlineWidth} ${getComputedStyle(head).outlineOffset}`;
      const box = document.querySelector(".journal-search .ui-field-box") ?? document.querySelector(".journal-search");
      out["search border vs paper"] = box ? Math.round(C.ratio(C.parse(getComputedStyle(box).borderTopColor), paper) * 100) / 100 : "absent";
      const input = document.querySelector(".journal-search input")!;
      out["placeholder"] = Math.round(C.ratio(C.parse(getComputedStyle(input, "::placeholder").color), C.bgOf(input)) * 100) / 100;
      return out;
    }, { TEXT, CONTRAST });
    writeFileSync(`${OUT}/contrast-${theme}-${accent}.json`, JSON.stringify(res, null, 1));
    await page.screenshot({ path: `${OUT}/contrast-${theme}-${accent}.png` });
  });
}
