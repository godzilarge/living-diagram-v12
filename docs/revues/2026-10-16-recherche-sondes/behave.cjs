const { chromium, openPage, drawn } = require("./common.cjs");
const B = "http://127.0.0.1:8031";
const P = '[data-layer="palette"]';
const active = (page) => page.evaluate(() => { const a = document.activeElement; return (a?.getAttribute("aria-label") || a?.textContent || a?.tagName || "").slice(0, 40) + " <" + a?.tagName + ">"; });
(async () => {
  const browser = await chromium.launch();
  // B1 focus panel + palette + Escape
  {
    const { page, context } = await openPage(browser, B, "/next/?infrastructure=demo-dc#node=dc01-core-01", { theme: "light", accent: "cobalt", language: "en" });
    await drawn(page);
    await page.keyboard.press("Shift+F");
    await page.waitForTimeout(400);
    const w0 = await page.evaluate(() => document.querySelector("aside.ui-panel")?.getBoundingClientRect().width);
    await page.keyboard.press("Control+k");
    await page.locator(P).waitFor();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const w1 = await page.evaluate(() => document.querySelector("aside.ui-panel")?.getBoundingClientRect().width);
    console.log("B1 focus width before", w0, "after Esc", w1, "palette", await page.locator(P).count(), "focus on", await active(page));
    await context.close();
  }
  // B2 settings popover then Ctrl+K then Escape
  {
    const { page, context } = await openPage(browser, B, "/next/?infrastructure=demo-dc", { theme: "light", accent: "cobalt", language: "en" });
    await drawn(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(300);
    const before = await page.locator('[data-layer]').count();
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(300);
    const layers = await page.evaluate(() => Array.from(document.querySelectorAll("[data-layer]")).map((e) => e.getAttribute("data-layer")));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => Array.from(document.querySelectorAll("[data-layer]")).map((e) => e.getAttribute("data-layer")));
    console.log("B2 layers before", before, "with palette", layers, "after Esc", after, "focus", await active(page));
    await context.close();
  }
  // B3 reduced motion
  {
    const { page, context } = await openPage(browser, B, "/next/?infrastructure=demo-dc", { theme: "light", accent: "cobalt", language: "en" }, { reducedMotion: "reduce" });
    await drawn(page);
    await page.keyboard.press("Control+k");
    const m = await page.evaluate(() => { const p = document.querySelector(".ui-palette"), s = document.querySelector("[data-layer=palette]")?.previousElementSibling; return { palette: getComputedStyle(p).transitionDuration, scrim: s && getComputedStyle(s).transitionDuration, scrimClass: s?.className }; });
    console.log("B3 reduced motion", JSON.stringify(m));
    await context.close();
  }
  // B4 endpoints in search + B5 compared run ghosts
  {
    const { page, context } = await openPage(browser, B, "/next/?infrastructure=demo-dc&run_id=7e4b07acb39b0809cb6d3376&from=65b810c4a669c5d6a9ce0974", { theme: "light", accent: "cobalt", language: "en" });
    await drawn(page);
    const onCanvas = await page.evaluate(() => Array.from(document.querySelectorAll(".react-flow__node")).map((n) => n.getAttribute("data-id")).filter((id) => /^ap-/.test(id || "")).length);
    await page.keyboard.press("Control+k");
    await page.locator(`${P} [role=combobox]`).fill("ap-dc01");
    await page.waitForTimeout(400);
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll(".ui-palette-row")).slice(0, 6).map((r) => r.textContent));
    const total = await page.locator(".ui-palette-total").textContent().catch(() => null);
    console.log("B4 ap- nodes on canvas", onCanvas, "rows", JSON.stringify(rows), total);
    // choose ap-dc01-07 (removed stub?)
    await page.locator(`${P} [role=combobox]`).fill("ap-dc01-07");
    await page.waitForTimeout(300);
    const r7 = await page.evaluate(() => Array.from(document.querySelectorAll(".ui-palette-row")).map((r) => r.textContent));
    const v0 = await page.evaluate(() => document.querySelector(".react-flow__viewport")?.style.transform);
    console.log("B5 rows ap-dc01-07", JSON.stringify(r7), "detail", (await page.locator(".ui-palette-preview").textContent()).slice(0, 160));
    if (r7.length) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(900);
      const v1 = await page.evaluate(() => document.querySelector(".react-flow__viewport")?.style.transform);
      console.log("B5 after Enter hash", await page.evaluate(() => location.hash), "view moved", v0 !== v1, "panel", await page.locator("aside.ui-panel h2").textContent().catch(() => null));
    }
    await context.close();
  }
  // B6 openRun action, B7 Tab reach, B8 hover on current, B9 centre button
  {
    const { page, context } = await openPage(browser, B, "/next/?infrastructure=demo-dc", { theme: "light", accent: "cobalt", language: "en" });
    await drawn(page);
    await page.keyboard.press("Control+k");
    const f = page.locator(`${P} [role=combobox]`);
    await f.fill("core");
    await page.waitForTimeout(300);
    const seen = [];
    for (let i = 0; i < 9; i++) { await page.keyboard.press("Tab"); seen.push(await active(page)); }
    console.log("B7 Tab x9 focus", JSON.stringify([...new Set(seen)]));
    await page.keyboard.press("Shift+Tab"); // back
    // B8 hover on current row
    const cur = page.locator('.ui-palette-row[aria-selected="true"]');
    await cur.hover();
    await page.waitForTimeout(300);
    console.log("B8 current row bg under pointer", await cur.evaluate((e) => getComputedStyle(e).backgroundColor));
    // B9 centre
    const v0 = await page.evaluate(() => document.querySelector(".react-flow__viewport")?.style.transform);
    const name = await page.locator(".ui-palette-heading-name").textContent();
    await page.getByRole("button", { name: "Centre the view" }).click();
    await page.waitForTimeout(900);
    const v1 = await page.evaluate(() => document.querySelector(".react-flow__viewport")?.style.transform);
    console.log("B9 centre", name, "hash", await page.evaluate(() => location.hash), "moved", v0 !== v1, "focus", await active(page));
    // B6 open a run
    const s0 = await page.evaluate(() => location.search);
    await page.keyboard.press("Control+k");
    await f.fill("open the collection");
    await page.waitForTimeout(300);
    const acts = await page.evaluate(() => Array.from(document.querySelectorAll(".ui-palette-row")).map((r) => r.textContent));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    console.log("B6 actions", JSON.stringify(acts), "search before", s0, "after", await page.evaluate(() => location.search));
    await context.close();
  }
  await browser.close();
})();
