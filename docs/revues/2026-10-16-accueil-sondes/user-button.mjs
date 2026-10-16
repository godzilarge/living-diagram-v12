// Probe: the user button, disabled ("Comptes : en cours"), with a declared author: the colour of its avatar against
// the colour of the other disabled controls of the same island.
import { BASE, chromium } from "./common.mjs";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => { localStorage.setItem("ld-prefs", JSON.stringify({ theme: "light", accent: "cobalt", language: "fr" })); localStorage.setItem("ld-author", "orhan"); });
await page.goto(BASE + "/next/");
await page.waitForTimeout(800);
console.log(JSON.stringify(await page.evaluate(() => {
  const tools = document.querySelector('[data-float="tools"]');
  return [...tools.querySelectorAll("button")].map((b) => ({ name: b.getAttribute("aria-label"), disabled: b.getAttribute("aria-disabled"), color: getComputedStyle(b).color, avatar: b.querySelector(".ui-avatar") ? getComputedStyle(b.querySelector(".ui-avatar")).color : null }));
}), null, 1));
await browser.close();
