// Probe: how many infrastructures it takes for Latest collections to vanish, at 1440 × 900 and at 1280 × 720, with the
// fixtures' short names; and what a 200 whose body is off contract makes the widget say.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BASE, chromium, mockApi, NOW, OUT, ROOT, TOKEN } from "./common.mjs";
const base = JSON.parse(readFileSync(join(ROOT, "app/e2e/fixtures/infrastructures.json"), "utf8"));
const browser = await chromium.launch();
async function open(width, height, body) {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: "UTC" });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await mockApi(page, body);
  await page.addInitScript((t) => sessionStorage.setItem("ld-api-token", t), TOKEN);
  await page.goto(BASE + "/next/");
  await page.waitForTimeout(900);
  return { context, page };
}
for (const [w, h] of [[1440, 900], [1280, 720]]) for (const n of [6, 8, 10, 12, 14]) {
  const body = { unreadable: 0, infrastructures: Array.from({ length: n }, (_, i) => ({ ...base.infrastructures[i % 6], infrastructure: `site-${String(i).padStart(2, "0")}` })) };
  const { context, page } = await open(w, h, body);
  const runs = await page.locator('[data-float="collections"]').evaluate((el) => { const r = el.getBoundingClientRect(); const b = el.querySelector(".ui-widget-body"); return `${Math.round(r.height)} px high, body ${Math.round(b.clientHeight)} px, rows visible ${[...el.querySelectorAll("tbody tr")].filter((tr) => { const t = tr.getBoundingClientRect(); return t.bottom <= b.getBoundingClientRect().bottom && t.top >= b.getBoundingClientRect().top; }).length}`; });
  console.log(`${w}×${h}, ${n} infrastructures: Latest collections ${runs}`);
  if (n === 14 && w === 1440) await page.screenshot({ path: `${OUT}/fourteen-1440x900.png` });
  await context.close();
}
const { context, page } = await open(1440, 900, { unexpected: true });
console.log("a 200 off contract says:", JSON.stringify(await page.locator('[data-float="infrastructures"] .home-note').textContent()));
await context.close();
await browser.close();
