// TEMPORARY probes of the brick-5 review; deleted after the review.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { LIGHT, mockApi, NOW, TOKEN } from "./helpers";

const AT_REST = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";

async function tab(page: Page, stored?: object) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(({ token, stored }) => {
    sessionStorage.setItem("ld-api-token", token);
    if (stored && !sessionStorage.getItem("seeded")) { localStorage.setItem("ld-prefs", JSON.stringify(stored)); sessionStorage.setItem("seeded", "1"); }
  }, { token: TOKEN, stored });
  await mockApi(page);
  await page.goto(AT_REST);
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
}

test("two tabs: a language chosen in one is undone by a grid toggled in the other", async ({ context }) => {
  const a = await context.newPage();
  await tab(a, { theme: "light", accent: "cobalt", language: "en" });
  const b = await context.newPage();
  await tab(b);
  await a.bringToFront();
  await a.getByRole("button", { name: "Settings", exact: true }).click();
  await a.getByRole("button", { name: "Français" }).click();
  const afterA = await a.evaluate(() => localStorage.getItem("ld-prefs"));
  await b.bringToFront();
  await b.locator(".react-flow__pane").click({ position: { x: 700, y: 700 } });
  await b.keyboard.press("g");
  await b.waitForTimeout(200);
  const afterB = await b.evaluate(() => localStorage.getItem("ld-prefs"));
  const c = await context.newPage();
  await tab(c);
  console.log(JSON.stringify({ afterA, afterB, reopenedLang: await c.evaluate(() => document.documentElement.lang), langB: await b.evaluate(() => document.documentElement.lang) }));
});

test("a click outside: where the focus goes, and whether a tooltip opens", async ({ page }) => {
  await tab(page, { theme: "light", accent: "cobalt", language: "en" });
  const gear = page.getByRole("button", { name: "Settings", exact: true });
  await gear.click();
  await page.getByRole("button", { name: "Dark" }).click();
  await page.mouse.click(700, 700);
  await page.waitForTimeout(700);
  console.log(JSON.stringify({ open: await page.locator('[data-layer="settings"]').count(), focus: await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName), tooltips: await page.getByRole("tooltip").allTextContents() }));
});
