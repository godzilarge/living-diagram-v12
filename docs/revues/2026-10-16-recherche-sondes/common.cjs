const { chromium } = require("/home/otosun/development/applications/demo/living-diagram-v12-biturbo/app/node_modules/playwright");
async function openPage(browser, base, path, prefs = {}, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: opts.locale || "en-GB", timezoneId: "UTC", reducedMotion: opts.reducedMotion || "no-preference" });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.addInitScript(({ prefs }) => {
    localStorage.setItem("ld-prefs", JSON.stringify(prefs));
    sessionStorage.setItem("ld-api-token", "demo");
  }, { prefs });
  await page.goto(base + path);
  await page.evaluate(() => document.fonts.ready);
  return { page, context, problems };
}
async function drawn(page) {
  await page.locator(".react-flow__node").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  const toast = page.getByRole("status").filter({ has: page.getByRole("button") });
  if (await toast.count()) await toast.getByRole("button").last().click().catch(() => {});
}
// contrast of a text node's colour on its effective background (walks up to the first opaque fill)
const CONTRAST = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.99) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  window.__contrast = (el, prop = "color") => { const fg = parse(getComputedStyle(el)[prop]); const bg = bgOf(el); return { fg: getComputedStyle(el)[prop], bg: \`rgb(\${bg.r}, \${bg.g}, \${bg.b})\`, ratio: Math.round(ratio(fg, bg) * 100) / 100 }; };
})()`;
module.exports = { chromium, openPage, drawn, CONTRAST };
