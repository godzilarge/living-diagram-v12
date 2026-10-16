const { chromium, openPage, drawn, CONTRAST } = require("./common.cjs");
(async () => {
  const browser = await chromium.launch();
  for (const theme of ["light", "dark"]) for (const accent of ["cobalt", "ink"]) {
    const { page, context, problems } = await openPage(browser, "http://127.0.0.1:8031", "/next/?infrastructure=demo-dc", { theme, accent, language: "fr" }, { locale: "fr-FR" });
    await drawn(page);
    await page.keyboard.press("Control+k");
    await page.locator('[data-layer="palette"] [role="combobox"]').fill("core");
    await page.waitForTimeout(400);
    // hover the second row
    await page.locator(".ui-palette-row").nth(1).hover();
    await page.waitForTimeout(300);
    await page.evaluate(CONTRAST);
    const out = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const c = (el, p) => (el ? window.__contrast(el, p) : null);
      const cur = q('.ui-palette-row[aria-selected="true"]');
      const hov = document.querySelectorAll(".ui-palette-row")[1];
      const pal = q(".ui-palette");
      const field = q(".ui-palette-field");
      return {
        rowDetailOnHover: c(hov.querySelector(".ui-palette-detail")),
        hoverBg: getComputedStyle(hov).backgroundColor,
        currentName: c(cur.querySelector(".ui-palette-name")),
        currentIcon: c(cur.querySelector(".ui-icon")),
        currentEnterChip: c(cur.querySelector(".ui-shortcut")),
        currentEnterChipBorder: c(cur.querySelector(".ui-shortcut"), "borderTopColor"),
        group: c(q(".ui-palette-group")),
        tabCount: c(q(".ui-tab .ui-count")),
        tabCountWeight: getComputedStyle(q(".ui-tab .ui-count")).fontWeight,
        foot: c(q(".ui-palette-hint")),
        total: c(q(".ui-palette-total")),
        detailSub: c(q(".ui-palette-heading-sub")),
        detailLabel: c(q(".ui-palette-preview .ui-facts dt")),
        alert: c(q(".ui-palette-preview > .ui-state")),
        muted: c(q(".ui-palette-preview .search-muted")),
        primary: c(q(".ui-palette-actions .ui-button, .ui-palette-actions button")),
        lineBtnBorder: c(q('.ui-palette-actions button[aria-label]'), "borderTopColor"),
        escChip: c(q(".ui-palette-input .ui-shortcut")),
        fieldSize: getComputedStyle(field).fontSize + "/" + getComputedStyle(field).fontWeight,
        headingName: (() => { const s = getComputedStyle(q(".ui-palette-heading-name")); return s.fontSize + "/" + s.fontWeight + "/" + s.lineHeight; })(),
        searchIcon: q(".ui-palette-input .ui-icon svg").getBoundingClientRect().width,
        trigger: (() => { const b = document.querySelector('.shell-search'); const s = getComputedStyle(b); return { expanded: b.getAttribute("aria-expanded"), bg: s.backgroundColor, color: s.color }; })(),
        alertText: q(".ui-palette-preview > .ui-state")?.textContent,
      };
    });
    console.log(theme, accent, JSON.stringify(out, null, 0));
    // placeholder
    await page.locator('[data-layer="palette"] [role="combobox"]').fill("");
    const ph = await page.evaluate(() => { const f = document.querySelector(".ui-palette-field"); return getComputedStyle(f, "::placeholder").color; });
    console.log("  placeholder", ph, "problems", problems.length);
    if (theme === "light" && accent === "cobalt") await page.screenshot({ path: __dirname + "/hover-light.png" });
    await context.close();
  }
  await browser.close();
})();
