import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LOG, OUT, open, TOKEN, withJournal } from "./common";

const measure = () => {
  const r = (el: Element | null) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }; };
  const q = (s: string) => document.querySelector(s);
  const qa = (s: string) => [...document.querySelectorAll(s)];
  const cs = (el: Element | null, ...p: string[]) => el ? Object.fromEntries(p.map((k) => [k, getComputedStyle(el).getPropertyValue(k)])) : null;
  // the gap between the end of each sentence's text and the time column
  const gaps = qa(".ui-feed-head").map((head) => {
    const s = head.querySelector(".ui-feed-sentence")!;
    const range = document.createRange(); range.selectNodeContents(s);
    const rects = [...range.getClientRects()]; const end = Math.max(...rects.map((x) => x.right));
    const when = head.querySelector(".ui-feed-when")!.getBoundingClientRect();
    return Math.round(when.left - end);
  });
  const firstHead = q(".ui-feed-head");
  return {
    viewport: innerWidth,
    facets: r(q('[data-float="facets"]')),
    journal: r(q('[data-float="journal"]')),
    topRow: qa("[data-float]").filter((e) => e.getBoundingClientRect().top < 70).map((e) => [e.getAttribute("data-float"), r(e)]),
    journalHead: r(q('[data-bar="journal-head"]')),
    facetsHead: r(q('[data-bar="facets-head"]')),
    title: r(q("#journal-title")), subtitle: r(q(".journal-subtitle")), subtitleText: q(".journal-subtitle")?.textContent,
    subtitleCut: (() => { const e = q(".journal-subtitle") as HTMLElement; return e ? e.scrollWidth > e.clientWidth : null; })(),
    search: r(q(".journal-search")),
    facetRows: [...new Set(qa(".ui-facet").map((e) => Math.round(e.getBoundingClientRect().height)))],
    facetRowGap: (() => { const a = qa(".ui-facets-list")[1]?.children; if (!a || a.length < 2) return null; return Math.round(a[1].getBoundingClientRect().top - a[0].getBoundingClientRect().bottom); })(),
    facetTitle: r(q(".ui-facets-head")),
    count: r(q(".ui-facet-count")), countStyle: cs(q(".ui-facet-count"), "font-size", "color"),
    rail: (() => { const e = q('.ui-facet[aria-checked="true"]'); if (!e) return null; const s = getComputedStyle(e, "::before"); return { h: s.height, w: s.width, left: s.left, bg: s.backgroundColor, word: getComputedStyle(e).fontWeight }; })(),
    head: r(firstHead), headPad: cs(firstHead, "padding-top", "padding-bottom", "padding-left", "padding-right", "margin-left"),
    avatar: r(q(".ui-feed-head .ui-avatar, .ui-feed-head [class*=avatar]")),
    when: cs(q(".ui-feed-when"), "font-size", "line-height", "color"), sub: r(q(".ui-feed-sub")), time: r(q(".ui-feed-when time")),
    subStyle: cs(q(".ui-feed-sub"), "color", "font-size"),
    dayTitle: cs(q(".ui-feed-day-title"), "padding-top", "padding-bottom", "font-size", "color", "position", "background-color"),
    tally: r(q(".ui-feed-tally")), tallyStyle: cs(q(".ui-feed-tally"), "font-size", "color", "border-top-color", "border-radius", "height"),
    feedBody: cs(q(".journal-body"), "padding-top", "padding-left", "padding-right", "mask-image", "-webkit-mask-image"),
    gaps,
    inlineStyles: qa("[data-journal] [style], [data-float=journal] [style], [data-float=facets] [style]").map((e) => e.outerHTML.slice(0, 120)),
  };
};

for (const width of [1024, 1280, 1440, 1920, 2560]) {
  test(`geometry at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await withJournal(page);
    await open(page, LOG, { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
    await expect(page.locator("[data-feed-row]").first()).toBeVisible({ timeout: 15_000 });
    await page.mouse.move(1, 899);
    await page.waitForTimeout(400);
    const m = await page.evaluate(measure);
    writeFileSync(`${OUT}/geometry-${width}.json`, JSON.stringify(m, null, 1));
    await page.screenshot({ path: `${OUT}/journal-${width}.png` });
  });
}

test("mockup geometry", async ({ page }) => {
  await page.goto("file:///tmp/claude-0/-home-user-living-diagram-v12/957076b1-e595-56de-aba6-b1bd4895fc10/scratchpad/j1.html");
  const gaps = await page.evaluate(() => [...document.querySelectorAll(".feed li")].map((li) => {
    const s = li.querySelector(".what")!; const range = document.createRange(); range.selectNodeContents(s);
    const end = Math.max(...[...range.getClientRects()].map((x) => x.right)); return Math.round(li.querySelector(".when")!.getBoundingClientRect().left - end);
  }));
  writeFileSync(`${OUT}/mockup-gaps.json`, JSON.stringify(gaps));
});
