const { chromium, openPage, drawn } = require("./common.cjs");
const P = '[data-layer="palette"]';
(async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, "http://127.0.0.1:8031", "/next/?infrastructure=demo-dc#node=dc01-core-01", { theme: "light", accent: "cobalt", language: "en" });
  await drawn(page);
  const filter = page.locator("aside.ui-panel input").first();
  await filter.click();
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  console.log("F1 Ctrl+K from the panel's field: palette", await page.locator(P).count());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  console.log("F1 focus after Esc", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")));
  // Ctrl+K with the run list open
  await page.locator(".ui-select-trigger, [aria-haspopup=listbox]").first().click().catch(() => {});
  await page.waitForTimeout(300);
  const l0 = await page.evaluate(() => Array.from(document.querySelectorAll("[data-layer]")).map((e) => e.getAttribute("data-layer")));
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  const l1 = await page.evaluate(() => Array.from(document.querySelectorAll("[data-layer]")).map((e) => e.getAttribute("data-layer")));
  console.log("F2 list open", JSON.stringify(l0), "after Ctrl+K", JSON.stringify(l1), "focus", await page.evaluate(() => document.activeElement?.className));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const l2 = await page.evaluate(() => Array.from(document.querySelectorAll("[data-layer]")).map((e) => e.getAttribute("data-layer")));
  console.log("F2 after Esc", JSON.stringify(l2), "focus", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.className));
  await page.screenshot({ path: __dirname + "/f2.png" });
  await browser.close();
})();
