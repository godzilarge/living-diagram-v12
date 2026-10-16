// TEMPORARY review probe (relecteur-ui, 2026-10-16), deleted after use.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { mockApi, NOW, open, TOKEN } from "./helpers";

const OUT = process.env.PROBE_OUT ?? "/tmp";
const AT_REST = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const COMP = "file:///home/otosun/development/applications/demo/living-diagram-v12-biturbo/design/comps/shell/index.html";
test.use({ timezoneId: "UTC" });

async function drawn(page: Page) {
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

// generic measure: rect + computed style of a selector list
const measure = (sels: Record<string, string>) => {
  const out: Record<string, unknown> = {};
  for (const [k, sel] of Object.entries(sels)) {
    const els = [...document.querySelectorAll(sel)] as HTMLElement[];
    out[k] = els.map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40), x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
        color: cs.color, bg: cs.backgroundColor, fw: cs.fontWeight, fs: cs.fontSize, pad: cs.padding, border: cs.borderTopColor + " " + cs.borderTopWidth, gap: cs.gap };
    });
  }
  return out;
};

const APP_SELS = {
  floats: "[data-float]",
  tabs: "[role=tab]",
  count: "[role=tab] .ui-count",
  layers: ".diagram-layers .ui-control",
  runLabel: ".ui-runs-label",
  runs: ".ui-run",
  compared: ".ui-run small",
  wire: ".ui-run-wire",
  changes: ".diagram-diff .ui-control",
  zoom: ".diagram-zoom",
  search: ".shell-search",
  searchIcon: ".shell-search .ui-icon",
  chip: ".shell-search .ui-shortcut",
  seps: ".ui-separator",
  ctxChoices: "[data-float=context] .ui-select-trigger",
  compare: "[data-float=runs] .ui-select-trigger",
  canvas: ".diagram",
  rf: ".react-flow",
};
const COMP_SELS = {
  floats: "[data-float]",
  tabs: "[role=tab]",
  count: ".tab .n",
  layers: ".layers .btn",
  runLabel: ".runs .lbl",
  runs: ".runs .run",
  compared: ".runs .run small",
  wire: ".runs .wire",
  changes: ".ctx .diff",
  zoom: ".ctl .pct",
  search: ".search-trigger",
  searchIcon: ".search-trigger .ico",
  chip: ".search-trigger .kbd",
  seps: ".sep",
  ctxChoices: ".ctx .btn.choice",
  compare: ".runs .btn.choice",
  canvas: ".canvas",
  rf: ".canvas",
};

for (const theme of ["light", "dark"] as const) {
  test(`probe app ${theme}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    await open(page, AT_REST, { theme, accent: "cobalt", lang: "fr" }, { token: TOKEN });
    await drawn(page);
    const m = await page.evaluate(measure, APP_SELS);
    const grid = await page.evaluate(() => {
      const pat = document.querySelector(".react-flow__background pattern");
      const c = pat?.querySelector("circle");
      return { pattern: pat ? { w: pat.getAttribute("width"), h: pat.getAttribute("height") } : null, circle: c ? { r: c.getAttribute("r"), fill: getComputedStyle(c).fill } : null,
        zoom: document.querySelector(".diagram-zoom")?.textContent, scheme: getComputedStyle(document.documentElement).colorScheme };
    });
    // the diff tooltip text
    await page.locator(".diagram-diff .ui-control").hover();
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeVisible({ timeout: 2000 });
    const diffTip = await tip.textContent();
    writeFileSync(`${OUT}/app-${theme}.json`, JSON.stringify({ m, grid, diffTip }, null, 1));
  });
  test(`probe comp ${theme}`, async ({ page }) => {
    await page.goto(COMP);
    await page.evaluate((t) => { if (t === "dark") document.documentElement.setAttribute("data-theme", "dark"); }, theme);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const m = await page.evaluate(measure, COMP_SELS);
    writeFileSync(`${OUT}/comp-${theme}.json`, JSON.stringify({ m }, null, 1));
  });
}
