// Review probe (brick 3, the panel): measures only, prints JSON. Temporary.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

test.use({ timezoneId: "UTC" });
const BASE = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const OUT = "e2e/captures/zz-sonde";
const log = (label: string, value: unknown) => console.log(`SONDE ${label} ${JSON.stringify(value)}`);

async function ready(page: Page, hash: string, prefs = LIGHT) {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, BASE + hash, prefs, { token: TOKEN });
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  const toast = page.getByRole("status").filter({ has: page.getByRole("button") });
  if (await toast.count()) await toast.getByRole("button").last().click();
}

const rowHeights = (page: Page) => page.evaluate(() => {
  const t = document.querySelector('aside.ui-panel table[aria-label="Interfaces"]');
  if (!t) return null;
  const hs = [...t.querySelectorAll("tbody tr")].map((r) => Math.round(r.getBoundingClientRect().height));
  const head = Math.round(t.querySelector("thead th")!.getBoundingClientRect().height);
  return { head, rows: hs };
});

test("probe: compact, wide, focus measures; header clipping; filter words; keyboard", async ({ page }) => {
  await ready(page, "#node=dc01-core-01");
  const aside = page.locator("aside.ui-panel");
  log("aside-name", await aside.getAttribute("aria-label"));
  log("compact-rows", await rowHeights(page));
  log("compact-panel", await aside.evaluate((e) => e.getBoundingClientRect().toJSON()));
  // filter by the words the table shows
  const filter = aside.getByRole("textbox", { name: "Filter the ports" });
  await aside.getByRole("button", { name: /^All/ }).click();
  const rows = aside.locator('table[aria-label="Interfaces"] tbody tr');
  for (const word of ["Up", "Down", "trunk", "Access", "10 G", "never", "full", "eth1/43"]) {
    await filter.fill(word);
    await page.waitForTimeout(50);
    log(`filter:${word}`, await rows.count());
  }
  await filter.fill("");
  await aside.getByRole("button", { name: /^Cabled/ }).click();
  // keyboard: tab to the first neighbour link, measure its focus ring against its cell
  await filter.focus();
  let found = null;
  for (let i = 0; i < 15 && !found; i++) {
    await page.keyboard.press("Tab");
    found = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a.tagName !== "A" || !a.closest('table[aria-label="Interfaces"]')) return null;
      const td = a.closest("td")!.getBoundingClientRect();
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      return { text: a.textContent, link: r.toJSON(), td: td.toJSON(), outline: cs.outlineWidth + " " + cs.outlineOffset, tdOverflow: getComputedStyle(a.closest("td")!).overflow,
        clippedLeft: r.left - parseFloat(cs.outlineWidth) - parseFloat(cs.outlineOffset) < td.left };
    });
  }
  log("neighbour-link-focus", found);
  if (found) await page.screenshot({ path: `${OUT}-link-focus.png`, clip: { x: found.td.x - 20, y: found.td.y - 10, width: 220, height: found.td.height + 20 } });
  // the sort header focus ring
  // focus: rows, header clipping, the Interfaces heading
  await page.keyboard.press("Shift+F");
  await expect(aside).toHaveAttribute("data-width", "focus");
  await page.waitForTimeout(400);
  log("focus-rows", await rowHeights(page));
  log("focus-headers", await page.evaluate(() => [...document.querySelectorAll('aside.ui-panel table[aria-label="Interfaces"] thead th')].map((th) => {
    const b = th.querySelector("button")!;
    const icon = b.querySelector(".ui-sort")!.getBoundingClientRect();
    const r = th.getBoundingClientRect();
    return { key: th.getAttribute("data-key"), text: b.textContent, th: Math.round(r.width), button: Math.round(b.scrollWidth), iconRight: Math.round(icon.right), thRight: Math.round(r.right), nextLeft: th.nextElementSibling ? Math.round(th.nextElementSibling.getBoundingClientRect().left) : null };
  })));
  log("focus-col-widths", await page.evaluate(() => [...document.querySelectorAll('aside.ui-panel table[aria-label="Interfaces"] thead th')].map((th) => [th.getAttribute("data-key"), Math.round(th.getBoundingClientRect().width)])));
  log("focus-interfaces-heading", await aside.getByRole("heading", { level: 3, name: /Interfaces/ }).isVisible());
  await page.screenshot({ path: `${OUT}-focus-head.png`, clip: { x: 16, y: 290, width: 1408, height: 200 } });
  // close with the keyboard: where does the focus go
  await page.keyboard.press("Escape");
  const close = aside.getByRole("button", { name: "Close" });
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("aside.ui-panel")).toHaveCount(0);
  log("focus-after-close", await page.evaluate(() => ({ tag: document.activeElement?.tagName, cls: (document.activeElement as HTMLElement | null)?.className ?? null })));
});

test("probe: the changes section of dc01-core-02 (collection changed) in French", async ({ page }) => {
  await ready(page, "#node=dc01-core-02", { ...LIGHT, lang: "fr" });
  const aside = page.locator("aside.ui-panel");
  const section = aside.locator("section", { has: page.getByRole("heading", { level: 3, name: /Changements|depuis/ }) });
  log("changes-fr", (await section.count()) ? await section.innerText() : await aside.innerText());
  if (await section.count()) {
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: `${OUT}-changes-fr.png` });
  }
});

test("probe: the colour ok outside a port (HA member, cable) and the stub's sources, measured", async ({ page }) => {
  await ready(page, "#node=dc01-fw-01");
  const aside = page.locator("aside.ui-panel");
  log("green-words", await aside.evaluate((root) => [...root.querySelectorAll('.ui-state[data-tone="ok"]')].map((e) => ({ text: e.textContent, table: e.closest("table")?.getAttribute("aria-label") ?? null, color: getComputedStyle(e).color }))));
});

test("probe: dark, focus: contrast of second lines and descriptions", async ({ page }) => {
  await ready(page, "#node=dc01-core-01", { theme: "dark", accent: "cobalt", lang: "en" });
  await page.keyboard.press("Shift+F");
  await page.waitForTimeout(400);
  log("dark-second-lines", await page.evaluate(() => {
    const lum = (c: string) => { const m = c.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
    const bg = getComputedStyle(document.querySelector("aside.ui-panel")!).backgroundColor;
    const ratio = (fg: string) => { const a = lum(fg), b = lum(bg); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100; };
    const pick = (sel: string) => { const e = document.querySelector(sel); return e ? { sel, color: getComputedStyle(e).color, ratio: ratio(getComputedStyle(e).color) } : { sel, missing: true }; };
    return [pick(".panel-line"), pick(".panel-description"), pick(".panel-muted"), pick('.panel-line .ui-state[data-tone="error"]'), pick(".ui-facts dt"), { bg }];
  }));
});
