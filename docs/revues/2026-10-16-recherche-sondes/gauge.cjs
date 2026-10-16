const { chromium, openPage, drawn } = require("./common.cjs");
(async () => {
  const browser = await chromium.launch();
  const { page, problems } = await openPage(browser, "http://127.0.0.1:8032", "/next/?infrastructure=jauge", { theme: "light", accent: "cobalt", language: "en" });
  await drawn(page);
  await page.keyboard.press("Control+k");
  const field = page.locator('[data-layer="palette"] [role="combobox"]');
  await field.waitFor();
  for (const text of ["core", "e", "port:", "et"]) {
    await field.fill("");
    await page.waitForTimeout(300);
    const t = await page.evaluate(async (text) => {
      const f = document.querySelector(".ui-palette-field");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      const t0 = performance.now();
      setter.call(f, text);
      f.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { ms: Math.round(performance.now() - t0), rows: document.querySelectorAll(".ui-palette-row").length, total: document.querySelector(".ui-palette-total")?.textContent };
    }, text);
    console.log(JSON.stringify(text), JSON.stringify(t));
  }
  // one more key on top of "e": typing a second letter
  const t2 = await page.evaluate(async () => {
    const f = document.querySelector(".ui-palette-field");
    const t0 = performance.now();
    const down = () => document.querySelector(".ui-palette-field").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    down();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Math.round(performance.now() - t0);
  });
  console.log("ArrowDown on", "et", t2, "ms");
  console.log("problems", problems.slice(0, 3));
  await browser.close();
})();
