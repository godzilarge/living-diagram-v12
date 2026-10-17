// The search palette (brick 4) in Chromium, on the synthetic API of e2e/fixtures/diagram/: Ctrl+K opens it with the
// focus in its field, the results come grouped with their counts, measured (bars, layers, tooltips, contrast) in both
// themes and in French with its captures; ↓ ↓ Enter opens a device (the address names it, its panel opens, the palette
// closes, the focus comes back to the search button); Tab changes the tab; Escape closes and keeps the text, and never
// closes the panel behind; nothing found and an unreadable expression are said; the home lists its infrastructures.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { audit } from "./audit";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

const LIMITS = { edge: 16, gap: 12, contrast: 4.5, tooltip: 8 };
test.use({ timezoneId: "UTC" });
const CAPTURES = "e2e/captures";
const AT_REST = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const VARIANTS = [
  { theme: "light", accent: "cobalt", lang: "en" },
  { theme: "dark", accent: "cobalt", lang: "en" },
  { theme: "light", accent: "cobalt", lang: "fr" },
] as const;

async function drawn(page: Page): Promise<void> {
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

async function dismissToast(page: Page): Promise<void> {
  const toast = page.getByRole("status").filter({ has: page.getByRole("button") });
  if (await toast.count()) await toast.getByRole("button").last().click();
  await expect(page.getByRole("status")).toHaveCount(0);
}

const palette = (page: Page) => page.locator('[data-layer="palette"]');
const field = (page: Page) => palette(page).getByRole("combobox");
const address = (page: Page) => page.evaluate(() => location.search + location.hash);
const focusedName = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? "");
/** The name of the current option (the one the field names). */
const currentRow = (page: Page) =>
  page.evaluate(() => {
    const id = document.querySelector('[data-layer="palette"] [role="combobox"]')?.getAttribute("aria-activedescendant");
    const row = id ? document.getElementById(id) : null;
    return { name: row?.querySelector(".ui-palette-name")?.textContent ?? "", group: row?.parentElement?.querySelector(".ui-palette-group span")?.textContent ?? "" };
  });

function expectClean(report: Awaited<ReturnType<typeof audit>>, tooltip = true) {
  expect(report.font.archivo, "Archivo is loaded").toBe(true);
  expect(report.bars.flatMap((bar) => bar.flags), "bars").toEqual([]);
  expect(report.floats.flags, "floating surfaces").toEqual([]);
  expect(report.layers.flags, "popovers and lists").toEqual([]);
  expect(report.tooltips.flags.filter((flag) => tooltip || !/no \[role=tooltip\]/.test(flag)), "tooltips").toEqual([]);
  expect(report.contrast.flags, "text contrast").toEqual([]);
  expect(report.opacity.flags, "text opacity").toEqual([]);
}

async function openDiagram(page: Page, variant: (typeof VARIANTS)[number] | typeof LIGHT, path = AT_REST): Promise<string[]> {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  const problems = await open(page, path, variant, { token: TOKEN });
  await drawn(page);
  await dismissToast(page);
  return problems;
}

for (const variant of VARIANTS) {
  const tag = `${variant.theme}-${variant.accent}-${variant.lang}`;
  const fr = variant.lang === "fr";

  test(`the palette opens on Ctrl+K, finds and measures, ${tag}`, async ({ page }) => {
    const problems = await openDiagram(page, variant);
    // the search button: its tooltip measured before the palette opens
    const button = page.getByRole("button", { name: fr ? "Rechercher" : "Search", exact: true });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.hover();
    await expect(page.getByRole("tooltip", { name: fr ? /Rechercher partout/ : /Search everywhere/ })).toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(200);
    expectClean(await page.evaluate(audit, LIMITS));
    await page.mouse.move(700, 600);
    await page.waitForTimeout(200);
    // Ctrl+K: the palette, the focus in its field, the button says it is open
    await page.keyboard.press("Control+k");
    await expect(palette(page)).toBeVisible();
    await expect(field(page)).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(palette(page)).toContainText(fr ? "Tapez le nom d'un équipement" : "Type a device's name");
    await field(page).fill("core");
    const tabs = palette(page).getByRole("tab");
    await expect(tabs).toHaveCount(7);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(palette(page).locator(".ui-palette-group").first()).toContainText(fr ? "Équipements" : "Devices");
    await expect(palette(page).getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    await expect(palette(page).locator(".ui-palette-preview")).toContainText("dc01-core-01");
    await expect(palette(page).getByRole("button", { name: fr ? "Ouvrir la fiche" : "Open the panel" })).toBeVisible();
    const total = await palette(page).locator(".ui-palette-total").textContent();
    expect(total).toMatch(fr ? /^\d+ résultats$/ : /^\d+ results$/);
    expect(await tabs.first().textContent()).toContain(total?.split(" ")[0] ?? "");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${CAPTURES}/search-${tag}.png` });
    const report = await page.evaluate(audit, LIMITS);
    expect(problems, "console errors and CSP refusals").toEqual([]);
    expect(report.layers.count, "the palette").toBe(1);
    expect(report.bars.map((bar) => bar.bar)).toEqual(expect.arrayContaining(["palette-scopes", "palette-actions"]));
    expectClean(report, false);
    // the palette's measures (DESIGN.md, Search palette)
    const box = await palette(page).boundingBox();
    expect(box?.width).toBe(752);
    expect(box?.y).toBe(104);
    expect(await palette(page).locator(".ui-palette-row").first().evaluate((el) => el.getBoundingClientRect().height)).toBe(36);
    expect(await palette(page).locator(".ui-palette-preview").evaluate((el) => el.getBoundingClientRect().width)).toBe(288);
  });
}

test("↓ ↓ Enter opens a device: the address names it, its panel opens, the palette closes, the focus comes back", async ({ page }) => {
  await openDiagram(page, LIGHT);
  await page.keyboard.press("Control+k");
  await field(page).fill("dc01");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const row = await currentRow(page);
  expect(row.group).toBe("Devices");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toHaveCount(0);
  await expect.poll(() => address(page)).toContain(`#node=${row.name}`);
  await expect(page.locator("aside.ui-panel").getByRole("heading", { level: 2 })).toHaveText(row.name);
  expect(await focusedName(page)).toBe("Search");
  // a new text puts the current row back on the first
  await page.keyboard.press("Control+k");
  await expect(field(page)).toHaveValue("dc01");
  await page.keyboard.press("ArrowDown");
  await field(page).fill("dc01-");
  await expect(palette(page).getByRole("option").first()).toHaveAttribute("aria-selected", "true");
});

test("Tab changes the tab; Escape closes, keeps the text, back on All; it never closes the panel behind", async ({ page }) => {
  await openDiagram(page, LIGHT, `${AT_REST}#node=dc01-core-01`);
  const aside = page.locator("aside.ui-panel");
  await expect(aside).toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(field(page)).toBeFocused();
  await field(page).fill("core");
  await page.keyboard.press("Tab");
  const tabs = palette(page).getByRole("tab");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(field(page)).toBeFocused();
  await expect(palette(page).locator(".ui-palette-group")).toHaveCount(1);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(tabs.nth(6)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(palette(page)).toHaveCount(0);
  await expect(aside).toBeVisible();
  await expect.poll(() => address(page)).toContain("#node=dc01-core-01");
  expect(await focusedName(page)).toBe("Search");
  await page.keyboard.press("Control+k");
  await expect(field(page)).toHaveValue("core");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  // a click on the scrim closes too
  await page.mouse.click(40, 860);
  await expect(palette(page)).toHaveCount(0);
  await expect(aside).toBeVisible();
});

test("nothing found and an unreadable expression are said, never the engine's message", async ({ page }) => {
  await openDiagram(page, LIGHT);
  await page.keyboard.press("Control+k");
  await field(page).fill("zzz");
  await expect(palette(page).locator(".ui-palette-message")).toHaveText("Nothing matches");
  await expect(palette(page).getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(palette(page).locator(".ui-palette-message")).toHaveText("No device matches");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${CAPTURES}/search-nothing-light-cobalt-en.png` });
  await field(page).fill("(");
  await expect(palette(page).locator(".ui-palette-message")).toContainText("Unreadable expression");
  await expect(palette(page).locator(".ui-palette-message")).not.toContainText(/Invalid regular expression|Unterminated/);
  await expect(palette(page).locator(".ui-palette-total")).toHaveCount(0);
  await page.screenshot({ path: `${CAPTURES}/search-unreadable-light-cobalt-en.png` });
  const report = await page.evaluate(audit, LIMITS);
  expectClean(report, false);
});

test("an action runs from the palette: the grid toggles, stored in the browser", async ({ page }) => {
  await openDiagram(page, LIGHT);
  await page.keyboard.press("Control+k");
  await field(page).fill("grid");
  await expect(palette(page).getByRole("option").first()).toContainText("Hide the grid");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") || "{}").grid)).toBe(false);
});

test("an expression hides every device it designates, from the palette; the palette then offers to show them", async ({ page }) => {
  await openDiagram(page, LIGHT);
  await page.keyboard.press("Control+k");
  await field(page).fill("acc");
  // three devices (two cards and a stub), their ports, and, last, the query's own action
  await expect(palette(page).getByRole("option").first()).toContainText("dc01-acc-01");
  const hide = palette(page).getByRole("option", { name: /^Hide these 3 devices/ });
  await expect(hide).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/search-hide-light-cobalt-en.png` });
  await hide.click();
  await expect(palette(page)).toHaveCount(0);
  await expect(page.locator(".react-flow__node-card", { hasText: "dc01-acc-01" })).toHaveCount(0);
  await expect(page.locator(".react-flow__node-card", { hasText: "dc01-acc-03" })).toHaveCount(0);
  expect(await address(page)).toMatch(/hide=acc/);
  // the expression hides what it says: a device that does not contain it stays
  await expect(page.locator(".react-flow__node-card", { hasText: "dc01-core-01" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await field(page).fill("hidden");
  await palette(page).getByRole("option", { name: /^Show the 3 hidden devices/ }).click();
  await expect(palette(page)).toHaveCount(0);
  await expect(page.locator(".react-flow__node-card", { hasText: "dc01-acc-01" })).toBeVisible();
  expect(await address(page)).not.toMatch(/hide=/);
});

test("the home: Ctrl+K lists the infrastructures, Enter opens the first", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  const problems = await open(page, "/next/", LIGHT, { token: TOKEN });
  await expect(page.getByRole("table", { name: "Infrastructures" }).locator("tbody tr")).toHaveCount(6);
  await page.keyboard.press("Control+k");
  await expect(field(page)).toBeFocused();
  await expect(palette(page).getByRole("tab")).toHaveCount(2);
  await expect(palette(page)).toContainText("Type the name of an infrastructure.");
  await field(page).fill("-");
  await expect(palette(page).getByRole("option")).toHaveCount(6);
  await expect(palette(page).locator(".ui-palette-preview")).toContainText("devices");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${CAPTURES}/search-home-light-cobalt-en.png` });
  const report = await page.evaluate(audit, LIMITS);
  expect(problems, "console errors and CSP refusals").toEqual([]);
  expect(report.layers.count).toBe(1);
  expectClean(report, false);
  const first = (await currentRow(page)).name;
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.searchParams.get("infrastructure") === first);
});

const viewport = (page: Page) => page.evaluate(() => (document.querySelector(".react-flow__viewport") as HTMLElement | null)?.style.transform ?? "");
const activeVariant = (page: Page) =>
  page.evaluate(() => {
    const id = document.querySelector('[data-layer="palette"] [role="combobox"]')?.getAttribute("aria-activedescendant");
    const row = id ? document.getElementById(id) : null;
    return { id: id ?? "", more: row?.getAttribute("data-variant") === "more" };
  });

test("a frequent letter: each group shows its window, the 'more' row is reached by ↓ and Enter shows the next page", async ({ page }) => {
  await openDiagram(page, LIGHT);
  await page.keyboard.press("Control+k");
  await field(page).fill("e");
  const more = palette(page).locator('[data-variant="more"]');
  await expect(more.first()).toContainText(/^… and \d+ more$/);
  const before = await palette(page).getByRole("option").count();
  // the live region says the total
  await expect(palette(page).locator('[aria-live="polite"]')).toHaveText(/^\d+ results$/);
  let look = await activeVariant(page);
  for (let i = 0; i < 60 && !look.more; i++) {
    await page.keyboard.press("ArrowDown");
    look = await activeVariant(page);
  }
  expect(look.more, "the arrows reach the 'more' row").toBe(true);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${CAPTURES}/search-more-light-cobalt-en.png` });
  expect((await page.evaluate(audit, LIMITS)).contrast.flags, "the 'more' row on accent-weak").toEqual([]);
  await page.keyboard.press("Enter");
  await expect(palette(page)).toBeVisible();
  await expect.poll(() => palette(page).getByRole("option").count()).toBeGreaterThan(before);
  const after = await activeVariant(page);
  expect(after.id, "the current row stays on the first row added").toBe(look.id);
  expect(after.more).toBe(false);
  // a "more" row has no detail; a hit has one
  await expect(palette(page).locator(".ui-palette-preview .ui-palette-heading")).toHaveCount(1);
});

test("a neighbour never collected opens centred; Shift+Enter and 'Centre the view' move the view", async ({ page }) => {
  await openDiagram(page, LIGHT);
  let view = await viewport(page);
  await page.keyboard.press("Control+k");
  await field(page).fill("ap-dc01");
  await expect(palette(page).getByRole("option").first()).toContainText("ap-dc01-05");
  await page.keyboard.press("Enter");
  await expect.poll(() => address(page)).toContain("#node=ap-dc01-05");
  await expect.poll(() => viewport(page)).not.toBe(view);
  await expect(page.locator('.react-flow__node[data-id="ap-dc01-05"]')).toBeVisible();
  // Shift+Enter centres
  view = await viewport(page);
  await page.keyboard.press("Control+k");
  await field(page).fill("dc01-pe-01");
  await page.keyboard.press("Shift+Enter");
  await expect(palette(page)).toHaveCount(0);
  await expect.poll(() => address(page)).toContain("#node=dc01-pe-01");
  await expect.poll(() => viewport(page)).not.toBe(view);
  // the detail's "Centre the view"
  view = await viewport(page);
  await page.keyboard.press("Control+k");
  await field(page).fill("dc01-acc-01");
  await palette(page).getByRole("button", { name: "Centre the view" }).click();
  await expect(palette(page)).toHaveCount(0);
  await expect.poll(() => address(page)).toContain("#node=dc01-acc-01");
  await expect.poll(() => viewport(page)).not.toBe(view);
});

test("the collection actions: compare with 5 Jan changes `from`, open 12 Jan changes `run_id`", async ({ page }) => {
  await openDiagram(page, LIGHT);
  await page.keyboard.press("Control+k");
  await field(page).fill("compare 5 jan");
  await expect(palette(page).getByRole("option").first()).toHaveText(/Compare with the collection of 5 Jan/);
  await page.keyboard.press("Enter");
  await expect.poll(() => address(page)).toContain("from=demo-0105");
  expect(await address(page)).toContain("run_id=demo-0119");
  await page.keyboard.press("Control+k");
  await field(page).fill("open 12 jan");
  await page.keyboard.press("Enter");
  await expect.poll(() => address(page)).toContain("run_id=demo-0112");
});

test("the open button takes the hover fill; an open list closes before the palette; the focus comes back without a tooltip", async ({ page }) => {
  await openDiagram(page, LIGHT);
  const button = page.getByRole("button", { name: "Search", exact: true });
  expect(await button.getAttribute("aria-controls"), "no aria-controls while closed").toBeNull();
  await page.getByRole("combobox", { name: "Infrastructure" }).click();
  const layers = () => page.evaluate(() => Array.from(document.querySelectorAll("[data-layer]")).map((e) => e.getAttribute("data-layer")));
  await expect.poll(layers).toEqual(["infrastructures"]);
  await page.keyboard.press("Control+k");
  await expect.poll(layers).toEqual(["palette"]);
  await expect(field(page)).toBeFocused();
  await expect(button).toHaveAttribute("aria-controls", "search-palette");
  const fill = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fill).not.toBe("rgba(0, 0, 0, 0)");
  await page.keyboard.press("Escape");
  await expect.poll(layers).toEqual([]);
  expect(await focusedName(page)).toBe("Search");
  await page.waitForTimeout(700);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.screenshot({ path: `${CAPTURES}/search-closed-light-cobalt-en.png` });
});
