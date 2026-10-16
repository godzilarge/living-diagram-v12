const { chromium, openPage, drawn } = require("./common.cjs");
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const m = await ctx.newPage();
  await m.goto("file:///home/otosun/development/applications/demo/living-diagram-v12-biturbo/design/comps/shell/index.html");
  await m.evaluate(() => document.documentElement.setAttribute("data-state", "search"));
  await m.waitForTimeout(600);
  const mock = await m.evaluate(() => {
    const pal = document.querySelector(".palette").getBoundingClientRect();
    const tab = document.querySelector(".pal-scope .btn");
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x - pal.x), w: Math.round(b.width), h: Math.round(b.height) }; };
    const n = document.querySelector(".pal-scope .btn .n");
    const name = document.querySelector(".pal-preview div[style*='font-size']");
    return { input: getComputedStyle(document.querySelector(".pal-input input")).fontSize, icon: r(document.querySelector(".pal-input .ico")), firstTabText: Math.round(document.createRange && (() => { const rg = document.createRange(); rg.selectNodeContents(tab.firstChild); return rg.getBoundingClientRect().x - pal.x; })()), countWeight: getComputedStyle(n).fontWeight, countSize: getComputedStyle(n).fontSize, detailName: getComputedStyle(name).fontSize + "/" + getComputedStyle(name).fontWeight + "/" + getComputedStyle(name).lineHeight, alertColor: getComputedStyle(document.querySelector(".pal-preview .st span:last-child")).color, rowDetail: getComputedStyle(document.querySelector(".pal-row .m")).fontSize };
  });
  console.log("mockup", JSON.stringify(mock));
  const { page } = await openPage(browser, "http://127.0.0.1:8031", "/next/?infrastructure=demo-dc", { theme: "light", accent: "cobalt", language: "fr" }, { locale: "fr-FR" });
  await drawn(page);
  await page.keyboard.press("Control+k");
  await page.locator('[data-layer="palette"] [role=combobox]').fill("core");
  await page.waitForTimeout(400);
  const impl = await page.evaluate(() => {
    const pal = document.querySelector(".ui-palette").getBoundingClientRect();
    const tab = document.querySelector(".ui-palette .ui-tab");
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x - pal.x), w: Math.round(b.width), h: Math.round(b.height) }; };
    const n = tab.querySelector(".ui-count");
    const rg = document.createRange(); rg.selectNodeContents(tab.firstChild);
    return { input: getComputedStyle(document.querySelector(".ui-palette-field")).fontSize, icon: r(document.querySelector(".ui-palette-input .ui-icon svg")), firstTabText: Math.round(rg.getBoundingClientRect().x - pal.x), countWeight: getComputedStyle(n).fontWeight, countSize: getComputedStyle(n).fontSize, detailName: (() => { const s = getComputedStyle(document.querySelector(".ui-palette-heading-name")); return s.fontSize + "/" + s.fontWeight + "/" + s.lineHeight; })(), rowDetail: getComputedStyle(document.querySelector(".ui-palette-detail")).fontSize, tabsRight: Math.round([...document.querySelectorAll(".ui-palette .ui-tab")].pop().getBoundingClientRect().right - pal.x) };
  });
  console.log("impl  ", JSON.stringify(impl));
  await browser.close();
})();
