// Sonde : la géométrie des primitives (page vivante et coquille) contre la maquette approuvée, mesurée dans Chromium.
// Lancer : cd app && npm run build && npx vite preview --host 127.0.0.1 --port 4318 &
//          node ../docs/revues/2026-10-16-squelette-app-sondes/geometrie.mjs
import { chromium } from "../../../app/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://127.0.0.1:4318";
const COMP = new URL("../../../design/comps/shell/index.html", import.meta.url).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const probe = () => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const cs = (el, pseudo) => getComputedStyle(el, pseudo);
  const out = {};
  // tooltip
  const tip = document.querySelector('[role="tooltip"]');
  if (tip) { const s = cs(tip); out.tooltip = { h: r(tip).h, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, padding: s.padding }; }
  // shortcut chip
  const kbd = document.querySelector(".ui-shortcut, .kbd");
  if (kbd) { const s = cs(kbd); out.shortcut = { h: r(kbd).h, fontSize: s.fontSize, borderBottom: s.borderBottomWidth, borderTop: s.borderTopWidth }; }
  // tab rail against the island's bottom hairline
  const tab = document.querySelector('[role="tab"][aria-selected="true"]');
  if (tab) {
    const island = tab.closest("[data-float]") ?? tab.closest(".surf");
    const after = cs(tab, "::after");
    const t = r(tab), i = r(island);
    out.tab = { h: t.h, railBottomFromTab: after.bottom, railRadius: after.borderRadius, tabBottom: t.b, islandOuterBottom: i.b, islandInnerBottom: i.b - 1 };
  }
  // panel section heading
  const h3 = document.querySelector(".ui-panel-section h3, .sec h3");
  if (h3) out.sectionHeading = { fontSize: cs(h3).fontSize, fontWeight: cs(h3).fontWeight };
  const h2 = document.querySelector(".ui-panel-title h2, .p-title h2");
  if (h2) out.panelTitle = { fontSize: cs(h2).fontSize, fontWeight: cs(h2).fontWeight };
  // settings popover rows
  const pop = document.querySelector('[data-layer="settings"], [data-layer="settings-popover"], .popover.settings');
  if (pop) out.settings = { radiogroups: pop.querySelectorAll('[role="radiogroup"]').length, rails: pop.querySelectorAll(".rail, .ui-rail").length, swatches: pop.querySelectorAll(".sw").length, right: r(pop).r, top: r(pop).y };
  // a bar
  const bar = document.querySelector('[data-float="tools"], .tools');
  if (bar) out.toolsIsland = r(bar);
  return out;
};

await page.goto(COMP);
await page.evaluate(() => document.fonts.ready);
const comp = await page.evaluate(probe);
await page.evaluate(() => document.documentElement.setAttribute("data-state", "settings"));
await page.waitForTimeout(400);
comp.settings = (await page.evaluate(probe)).settings;

await page.goto(`${BASE}/next/primitives.html`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
const prim = await page.evaluate(probe);

await page.goto(`${BASE}/next/`);
await page.evaluate(() => document.fonts.ready);
await page.getByRole("button", { name: "Settings" }).click();
await page.waitForTimeout(400);
const shell = await page.evaluate(probe);

console.log(JSON.stringify({ maquette: comp, primitives: prim, coquille: shell }, null, 2));
await browser.close();
