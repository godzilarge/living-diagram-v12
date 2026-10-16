// Probe: the home's edges (a 200 off contract: collapse.mjs). (b) twenty infrastructures with long
// names and five-digit counts at 1280 × 720 (DESIGN.md: 1280 to 2560; the 13-inch laptop of PRODUCT.md); (c) no token,
// dark; (d) a 401 on a diff, after the page showed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, openHome, OUT, ROOT } from "./common.mjs";
const base = JSON.parse(readFileSync(join(ROOT, "app/e2e/fixtures/infrastructures.json"), "utf8"));
const browser = await chromium.launch();

// (b)
{
  const many = { unreadable: 0, infrastructures: Array.from({ length: 20 }, (_, i) => ({ ...base.infrastructures[i % 6], infrastructure: `campus-${String(i).padStart(2, "0")}-batiment-administratif-et-datacenter-secondaire`, devices: 12345, checks: { error: 1234, warning: 56789, info: 0 } })) };
  const { context, page } = await openHome(browser, { override: many, width: 1280, height: 720 }).catch((e) => { console.log("(b) open failed", e.message); return {}; });
  if (page) {
    const m = await page.evaluate(() => {
      const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; };
      const body = document.querySelector('[data-float="infrastructures"] .ui-widget-body');
      const name = document.querySelector('[data-float="infrastructures"] tbody td');
      return { infra: box('[data-float="infrastructures"]'), runs: box('[data-float="collections"]'), changes: box('[data-float="modifications"]'), slot: box('[data-float="slot"]'),
        infraScrolls: body.scrollHeight > body.clientHeight, infraOverflowX: body.scrollWidth > body.clientWidth, nameCell: `${Math.round(name.getBoundingClientRect().width)} px, ellipsis ${name.scrollWidth > name.clientWidth}`,
        docScroll: `${document.querySelector(".home").scrollWidth}x${document.querySelector(".home").scrollHeight} in ${innerWidth}x${innerHeight}` };
    });
    console.log("(b) 20 long infrastructures at 1280 × 720:", JSON.stringify(m));
    await page.screenshot({ path: `${OUT}/many-long-1280x720.png` });
    await context.close();
  }
}
// (c)
{
  const { context, page } = await openHome(browser, { theme: "dark", token: "" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/no-token-dark.png` });
  const field = page.getByRole("textbox");
  console.log("(c) no token: field", JSON.stringify(await field.evaluate((el) => ({ label: el.labels?.[0]?.textContent, placeholder: el.placeholder, type: el.type }))),
    "notes", JSON.stringify(await page.locator(".home-note").allTextContents()));
  await context.close();
}
// (d)
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "UTC" });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-01-19T19:30:00Z"));
  const { mockApi, BASE, TOKEN } = await import("./common.mjs");
  await mockApi(page);
  await page.route("**/api/diff**", (route) => route.fulfill({ status: 401, json: { code: "unauthorized" } }));
  await page.addInitScript((t) => sessionStorage.getItem("seeded") || (sessionStorage.setItem("ld-api-token", t), sessionStorage.setItem("seeded", "1")), TOKEN);
  await page.goto(BASE + "/next/");
  await page.waitForTimeout(1200);
  console.log("(d) 401 on a diff: token", JSON.stringify(await page.evaluate(() => sessionStorage.getItem("ld-api-token"))), "field shown", await page.getByRole("textbox").count(), "notes", JSON.stringify(await page.locator(".home-note").allTextContents()));
  await context.close();
}
await browser.close();
