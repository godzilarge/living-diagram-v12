// Probe: the home on the real backend (archive filled by the generator, intents written through the API: a colour,
// then two colours removed, a pin, then the same pin released), light and dark, fr, at 1440 × 900; the feed's words.
import { BASE, chromium, OUT } from "./common.mjs";
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((theme) => { localStorage.setItem("ld-prefs", JSON.stringify({ theme, accent: "cobalt", language: "fr" })); sessionStorage.setItem("ld-api-token", "x"); localStorage.setItem("ld-author", "orhan"); }, theme);
  await page.goto(BASE + "/next/");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/real-${theme}-1440.png` });
  if (theme === "light") {
    console.log("feed:", JSON.stringify(await page.locator(".home-feed-what").allTextContents()));
    console.log("infrastructures:", JSON.stringify(await page.locator('[data-float="infrastructures"] tbody tr').evaluateAll((rows) => rows.map((r) => [...r.cells].slice(0, 4).map((c) => c.textContent).join(" | ")))));
    console.log("collections:", JSON.stringify(await page.locator('[data-float="collections"] tbody tr').evaluateAll((rows) => rows.map((r) => [...r.cells].map((c) => c.textContent).join(" | ")))));
  }
  await context.close();
}
await browser.close();
