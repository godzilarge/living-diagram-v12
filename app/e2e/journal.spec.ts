// The Log view (brick 7, direction J1) in Chromium, on the synthetic journal of e2e/fixtures/journal.json served
// with its filters and facets by `mockApi`: the measurement of DESIGN.md in both themes, the feed by day, the facets
// (an exclusive infrastructure, cumulative authors), the search, the period, a row unfolded with its facts, the
// address kept in step (`#mode=journal&j…`), the context menu's History row from the Diagram in read mode and the
// browser's Back, the home's link to the log.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { audit } from "./audit";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

const LIMITS = { edge: 16, gap: 12, contrast: 4.5, tooltip: 8 };
test.use({ timezoneId: "UTC" });
const CAPTURES = "e2e/captures";
const DIAGRAM = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const LOG = `${DIAGRAM}#mode=journal`;
const CORE = "dc01-core-01";

const address = (page: Page) => page.evaluate(() => location.hash);
const rows = (page: Page) => page.locator("[data-feed-row]");
const journal = (page: Page) => page.locator('[data-float="journal"]');

/** The feed has drawn its rows for the current filters. */
async function shown(page: Page, count: number): Promise<void> {
  await expect(rows(page)).toHaveCount(count, { timeout: 15_000 });
}

/** The placement host says what it memorized at the first opening (the canvas lives under the Log too): closed before
 *  the page is measured. */
async function dismissToast(page: Page): Promise<void> {
  const toast = page.getByRole("status").filter({ has: page.getByRole("button") });
  if (await toast.count()) await toast.getByRole("button").last().click();
  await expect(page.getByRole("status").filter({ has: page.getByRole("button") })).toHaveCount(0);
}

function expectClean(report: Awaited<ReturnType<typeof audit>>) {
  expect(report.bars.flatMap((bar) => bar.flags), "bars").toEqual([]);
  expect(report.floats.flags, "floating surfaces").toEqual([]);
  expect(report.layers.flags, "popovers and lists").toEqual([]);
  expect(report.contrast.flags, "text contrast").toEqual([]);
  expect(report.opacity.flags, "text opacity").toEqual([]);
}

for (const variant of [LIGHT, { theme: "dark", accent: "cobalt", lang: "en" }, { theme: "light", accent: "ink", lang: "fr" }] as const) {
  const tag = `${variant.theme}-${variant.accent}-${variant.lang}`;
  test(`log at rest, ${tag}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    const problems = await open(page, LOG, variant, { token: TOKEN });
    // demo-dc alone: seven entries over five days, two of them folded into one row
    await shown(page, 6);
    await expect(page.locator("[data-day]")).toHaveCount(5);
    await expect(page.locator("[data-day]").first()).toHaveText(variant.lang === "fr" ? /aujourd/i : /today/i);
    await expect(page.getByRole("tab", { name: variant.lang === "fr" ? "Journal" : "Log" })).toHaveAttribute("aria-selected", "true");
    await expect(journal(page)).toBeVisible();
    await expect(page.locator('[data-float="facets"]')).toBeVisible();
    // the reading column is centred and bounded: 1280 px at 1440, both islands 16 px apart
    const facets = await page.locator('[data-float="facets"]').boundingBox();
    const log = await journal(page).boundingBox();
    expect(facets && log && Math.round(log.x + log.width - facets.x), "the column's width").toBe(1280);
    expect(facets && Math.round(facets.x), "centred: 80 px of ground on the left").toBe(80);
    // the tones and the tally: positions recede, a deletion's verb is red, a repeated gesture is folded
    await expect(page.locator('[data-tone="quiet"]')).toHaveCount(2);
    await expect(page.locator('[data-tone="destroy"]')).toHaveCount(1);
    await expect(page.locator(".ui-feed-times")).toHaveText("×2");
    // the Log island comes first in the DOM: Tab reaches its search before the facets
    const order = await page.evaluate(() => Array.from(document.querySelectorAll('[data-float="journal"], [data-float="facets"]')).map((el) => el.getAttribute("data-float")));
    expect(order).toEqual(["journal", "facets"]);
    expect(facets && log && Math.round(log.x - (facets.x + facets.width)), "16 px between the islands").toBe(16);
    await dismissToast(page);
    await page.screenshot({ path: `${CAPTURES}/journal-${tag}.png` });
    const report = await page.evaluate(audit, LIMITS);
    expectClean(report);
    expect(problems).toEqual([]);
  });
}

test("the facets narrow the log and write the address; the infrastructure is exclusive, the authors add up", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, LOG, LIGHT, { token: TOKEN });
  await shown(page, 6);
  await page.locator('[data-facet="infrastructure:*"]').click();
  await shown(page, 12);
  expect(await address(page)).toContain("jinfra=*");
  await page.locator('[data-facet="author:camille.r"]').click();
  await shown(page, 3);
  expect(await address(page)).toContain("jau=camille.r");
  await page.locator('[data-facet="author:orhan"]').click();
  await shown(page, 7);
  // nothing matches: the state says the filters posed and clears them
  await page.locator('[data-facet="category:connectors"]').click();
  await expect(page.locator("[data-journal-empty]")).toBeVisible();
  await page.locator("[data-journal-empty]").getByRole("button", { name: /clear the filters/i }).click();
  await shown(page, 12);
  await page.locator('[data-facet="author:camille.r"]').click();
  await page.locator('[data-facet="author:orhan"]').click();
  await shown(page, 7);
  await expect(page.locator('[data-facet="author:orhan"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-facet="category:groups"]').click();
  await shown(page, 1);
  expect(await address(page)).toContain("jcat=groups");
  // the counts follow the filters, the values never move
  await expect(page.locator('[data-facet="author:t.martin"]')).toBeVisible();
});

test("the search, the period and a row unfolded with its facts", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, LOG, LIGHT, { token: TOKEN });
  await shown(page, 6);
  await page.getByRole("searchbox").fill("camille");
  await shown(page, 2);
  expect(await address(page)).toContain("jq=camille");
  await page.keyboard.press("Escape");
  await shown(page, 6);
  await page.getByRole("radio", { name: "24 h" }).click();
  await shown(page, 2);
  expect(await address(page)).toContain("jp=24h");
  await page.getByRole("radio", { name: "All", exact: true }).click();
  await shown(page, 6);
  // the range is a button of the group: it opens two dates, an impossible day is refused in words
  const range = page.getByRole("button", { name: "Range" });
  await expect(range).toHaveAttribute("aria-haspopup", "dialog");
  await range.click();
  const dialog = page.getByRole("dialog", { name: /range/i });
  await dialog.getByRole("textbox").first().fill("2026-13-40");
  await expect(dialog.getByRole("alert")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // the first row (three pins) unfolds on its detail: the devices placed, the raw operations, the actions
  await rows(page).first().click();
  const detail = page.locator("[data-journal-detail]");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("dc01-acc-01");
  await expect(detail.getByRole("button", { name: /copy link/i })).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/journal-unfolded.png` });
  await rows(page).first().press("Enter");
  await expect(detail).toHaveCount(0);
  // the keyboard walks the rows: ↑ ↓ Home End, "o" shows the cited device in the Diagram, Back comes back clean
  await rows(page).first().press("ArrowDown");
  await expect(rows(page).nth(1)).toBeFocused();
  await rows(page).nth(1).press("End");
  await expect(rows(page).last()).toBeFocused();
  await rows(page).last().press("Home");
  await expect(rows(page).first()).toBeFocused();
  await rows(page).first().press("o");
  await expect(journal(page)).toHaveCount(0);
  expect(await address(page)).toContain("node=dc01-acc-01");
  await page.goBack();
  await expect(journal(page)).toBeVisible();
  expect(await address(page)).not.toContain("node=");
  // the CSV export says its result in a toast
  await journal(page).getByRole("button", { name: /export/i }).click();
  await expect(page.getByRole("status").filter({ hasText: /exported/ })).toBeVisible();
});

test("the History row of the context menu opens the device's history in read mode, and Back comes back", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, DIAGRAM, LIGHT, { token: TOKEN });
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.locator(".react-flow__node-card", { hasText: CORE }).click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /delete|group|note/i }), "read mode: nothing that writes").toHaveCount(0);
  await page.screenshot({ path: `${CAPTURES}/journal-context-menu.png` });
  await menu.getByRole("menuitem", { name: "History" }).click();
  await expect(journal(page)).toBeVisible();
  expect(await address(page)).toContain(`jobj=${CORE}`);
  await expect(journal(page)).toContainText(CORE);
  await page.goBack();
  await expect(journal(page)).toHaveCount(0);
  expect(await address(page)).not.toContain("mode=journal");
  // the panel offers the same from the keyboard: its History button opens the device's history
  await page.goto(`${DIAGRAM}#node=${CORE}`);
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(journal(page)).toBeVisible();
  expect(await address(page)).toContain(`jobj=${CORE}`);
});

test("the home's modifications widget links to the log of every infrastructure", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, "/next/", LIGHT, { token: TOKEN });
  const link = page.getByRole("link", { name: "Open the log" });
  await expect(link).toHaveAttribute("href", /infrastructure=demo-dc#mode=journal&jinfra=%2A|infrastructure=demo-dc#mode=journal&jinfra=\*/);
});
