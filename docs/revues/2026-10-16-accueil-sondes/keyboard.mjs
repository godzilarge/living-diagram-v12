// Probe: the keyboard on the home (fr, light): every Tab stop in order with its name, its disabled state, the tooltip
// it opens and whether the focus ring shows; Escape on the settings popover; reduced motion on the row's transitions.
import { chromium, openHome, OUT } from "./common.mjs";
const browser = await chromium.launch();
const { context, page } = await openHome(browser, {});
const stops = [];
for (let i = 0; i < 16; i++) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(450);
  stops.push(await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    const tip = document.querySelector('[role="tooltip"]');
    return `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}" disabled=${el.getAttribute("aria-disabled") ?? el.disabled} ring=${cs.outlineStyle !== "none" && cs.outlineWidth !== "0px" ? cs.outlineWidth + " " + cs.outlineColor : cs.boxShadow !== "none" ? "shadow" : "none"} tip=${tip ? JSON.stringify(tip.textContent) : "-"}`;
  }));
}
console.log(stops.map((s, i) => `${i + 1}. ${s}`).join("\n"));
// the logo: what Enter does on the home
await page.getByRole("button", { name: "Accueil" }).focus();
const before = page.url();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
console.log(`logo Enter: url ${page.url() === before ? "unchanged" : page.url()}`);
// settings: Escape closes and gives the focus back
await page.getByRole("button", { name: "Réglages" }).click();
await page.waitForTimeout(300);
const open = await page.getByRole("dialog").count();
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
console.log(`settings: open=${open} after Escape=${await page.getByRole("dialog").count()} focus=${await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))}`);
await context.close();
// reduced motion
const reduced = await openHome(browser, { reduced: true });
console.log("reduced motion:", JSON.stringify(await reduced.page.evaluate(() => ({
  go: getComputedStyle(document.querySelector(".home-go")).transitionDuration,
  td: getComputedStyle(document.querySelector('[data-float="infrastructures"] tbody td')).transitionDuration,
  tipDelay: getComputedStyle(document.querySelector(".home-go")).transitionDelay,
}))));
await reduced.context.close();
await browser.close();
