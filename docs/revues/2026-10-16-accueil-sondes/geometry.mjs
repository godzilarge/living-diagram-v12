// Probe: the home against the approved mockup, same viewport (1440 × 900), same theme: islands, widget heads, table
// heads and rows, the columns of the Infrastructures table, the type of the title, the name, the head, the feed.
import { mkdirSync } from "node:fs";
import { chromium, openHome, openMockup, OUT } from "./common.mjs";
mkdirSync(OUT, { recursive: true });

const PICK = {
  home: { infra: '[data-float="infrastructures"]', runs: '[data-float="collections"]', changes: '[data-float="modifications"]', slot: '[data-float="slot"]', brand: '[data-float="brand"]', tools: '[data-float="tools"]', head: '[data-float="infrastructures"] .ui-widget-head', title: '[data-float="infrastructures"] h2', count: ".ui-widget-count", infraTh: '[data-float="infrastructures"] thead th', infraTd: '[data-float="infrastructures"] tbody tr:nth-child(1) td', runsTh: '[data-float="collections"] thead th', runsTd: '[data-float="collections"] tbody tr:nth-child(1) td', name: ".home-name", feedLi: ".home-feed-item", feedWhat: ".home-feed-what", feedWhen: ".home-feed-when", slotTitle: ".home-slot h2", avatar: ".home-feed-item .ui-avatar" },
  mock: { infra: '[data-float="infrastructures"]', runs: '[data-float="collectes"]', changes: '[data-float="modifications"]', slot: '[data-float="emplacement"]', brand: '[data-float="marque"]', tools: '[data-float="outils"]', head: '[data-float="infrastructures"] .w-head', title: '[data-float="infrastructures"] h2', count: ".w-head .muted", infraTh: ".infra thead th", infraTd: ".infra tbody tr:nth-child(1) td", runsTh: ".runs-list thead th", runsTd: ".runs-list tbody tr:nth-child(1) td", name: ".infra .name b", feedLi: ".feed li", feedWhat: ".feed .what", feedWhen: ".feed .when", slotTitle: ".slot h2", avatar: ".feed .avatar" },
};
const facts = (pick) => {
  const one = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), font: `${cs.fontSize}/${cs.fontWeight}/${cs.lineHeight}`, color: cs.color }; };
  const all = (sel) => [...document.querySelectorAll(sel)].map((el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.x)}+${Math.round(r.width)}x${Math.round(r.height)}`; });
  const out = {};
  for (const [k, sel] of Object.entries(pick)) out[k] = /Th$|Td$/.test(k) ? all(sel) : one(sel);
  return out;
};
const browser = await chromium.launch();
const home = await openHome(browser, {});
const mock = await openMockup(browser, {});
const a = await home.page.evaluate(facts, PICK.home);
const b = await mock.page.evaluate(facts, PICK.mock);
for (const key of Object.keys(PICK.home)) {
  const same = JSON.stringify(a[key]) === JSON.stringify(b[key]);
  console.log(`${same ? "  " : "≠ "}${key}\n    home:   ${JSON.stringify(a[key])}\n    mockup: ${JSON.stringify(b[key])}`);
}
await home.page.screenshot({ path: `${OUT}/home-fr-light-1440.png` });
await mock.page.screenshot({ path: `${OUT}/mockup-fr-light-1440.png` });
await browser.close();
