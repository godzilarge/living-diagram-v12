import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LOG, OUT, open, TOKEN, withJournal } from "./common";

const who = () => { const e = document.activeElement as HTMLElement | null; if (!e) return "none"; return `${e.tagName.toLowerCase()}${e.getAttribute("role") ? "[" + e.getAttribute("role") + "]" : ""} ${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 50)} ${e.closest("[data-float]")?.getAttribute("data-float") ?? ""}`; };

test("tab order in the Log", async ({ page }) => {
  await withJournal(page);
  await open(page, LOG, { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
  await expect(page.locator("[data-feed-row]").first()).toBeVisible({ timeout: 15_000 });
  await page.mouse.click(5, 890);
  const seq: string[] = [];
  for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); seq.push(await page.evaluate(who)); }
  writeFileSync(`${OUT}/tab-order.txt`, seq.join("\n"));
});

test("feed keys: arrows, Home, End, Enter, o, slash, Escape", async ({ page }) => {
  await withJournal(page);
  await open(page, LOG, { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
  const rows = page.locator("[data-feed-row]");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const log: string[] = [];
  await rows.first().focus();
  await page.keyboard.press("End"); log.push("End -> " + await page.evaluate(who));
  await page.keyboard.press("Home"); log.push("Home -> " + await page.evaluate(who));
  await page.keyboard.press("ArrowDown"); log.push("Down -> " + await page.evaluate(who));
  await page.keyboard.press("Enter"); log.push("Enter -> expanded=" + await rows.nth(1).getAttribute("aria-expanded"));
  await page.keyboard.press("Tab"); log.push("Tab after unfold -> " + await page.evaluate(who));
  await rows.nth(1).focus();
  await page.keyboard.press("Space"); log.push("Space -> expanded=" + await rows.nth(1).getAttribute("aria-expanded"));
  // focus visible on the row
  const ring = await rows.nth(1).evaluate((e) => getComputedStyle(e).outlineStyle + " " + getComputedStyle(e).outlineWidth);
  log.push("ring " + ring);
  await page.keyboard.press("/"); log.push("/ -> " + await page.evaluate(who));
  await page.keyboard.type("camille");
  await page.waitForTimeout(600);
  log.push("hash after typing " + await page.evaluate(() => location.hash));
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  log.push("Escape -> value='" + await page.locator(".journal-search input").inputValue() + "' hash " + await page.evaluate(() => location.hash));
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  log.push("Escape again -> " + await page.evaluate(who) + " hash " + await page.evaluate(() => location.hash));
  // "o" on the row of a group present? first row: three pins (dc01-acc-01 exists in demo-dc?)
  await rows.first().focus();
  await page.keyboard.press("o"); await page.waitForTimeout(500);
  log.push("o on row 1 -> hash " + await page.evaluate(() => location.hash) + " status=" + (await page.locator(".journal-body .ui-visually-hidden").textContent().catch(() => "gone")));
  writeFileSync(`${OUT}/feed-keys.txt`, log.join("\n"));
  
  await page.goBack(); await page.waitForTimeout(500);
  writeFileSync(`${OUT}/feed-keys.txt`, log.join("\n") + "\nBack -> " + await page.evaluate(() => location.hash) + " journal visible " + await page.locator('[data-float="journal"]').count());
});

test("facets keys", async ({ page }) => {
  await withJournal(page);
  await open(page, LOG, { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
  await expect(page.locator("[data-feed-row]").first()).toBeVisible({ timeout: 15_000 });
  const log: string[] = [];
  await page.locator('[data-facet="infrastructure:demo-dc"]').focus();
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(300);
  log.push("Down -> " + await page.evaluate(who) + " hash " + await page.evaluate(() => location.hash));
  await page.keyboard.press("Home"); await page.waitForTimeout(300);
  log.push("Home -> " + await page.evaluate(who) + " hash " + await page.evaluate(() => location.hash));
  const ring = await page.evaluate(() => { const e = document.activeElement!; const s = getComputedStyle(e); return `${s.outlineStyle} ${s.outlineWidth} offset ${s.outlineOffset}`; });
  log.push("ring " + ring);
  // the period: arrows to Range do not choose it; Enter opens the popover
  await page.getByRole("radio", { name: "Tout", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  log.push("period Right -> " + await page.evaluate(who) + " expanded=" + await page.evaluate(() => document.activeElement!.getAttribute("aria-expanded")) + " haspopup=" + await page.evaluate(() => document.activeElement!.getAttribute("aria-haspopup")));
  await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  log.push("Enter -> " + await page.evaluate(who));
  await page.screenshot({ path: `${OUT}/range-open.png` });
  await page.keyboard.type("2026-01-20"); await page.keyboard.press("Tab"); await page.keyboard.type("2026-01-10");
  await page.waitForTimeout(200);
  log.push("bad range note: " + await page.locator(".journal-range-note").textContent());
  await page.screenshot({ path: `${OUT}/range-bad.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  log.push("Escape -> " + await page.evaluate(who));
  writeFileSync(`${OUT}/facets-keys.txt`, log.join("\n"));
});
