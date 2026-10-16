// The panel (brick 3) in Chromium, on the synthetic API of e2e/fixtures/diagram/: a device selected shows its panel
// at the three widths (compact, wide with W, focus with Shift+F over the scrim), measured (bars, islands, tooltips,
// contrast) in both themes and in French, with its captures; the alerts in words (never a check code); the
// interface table sorted, filtered, scoped; a neighbour link selects its device; the width stored in `ld-prefs`;
// the column chooser of focus; Escape leaves focus, then closes; a cable's panel from the address.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { audit } from "./audit";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

const LIMITS = { edge: 16, gap: 12, contrast: 4.5, tooltip: 8 };
test.use({ timezoneId: "UTC" });
const CAPTURES = "e2e/captures";
const CORE = "dc01-core-01";
const AT_REST = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const WITH_CORE = `${AT_REST}#node=${CORE}`;
const CABLE = `${AT_REST}#link=${encodeURIComponent(JSON.stringify(["dc01-core-01", "Ethernet1/43", "dc01-rt-01", "GigabitEthernet0/0/0"]))}`;
const VARIANTS = [
  { theme: "light", accent: "cobalt", lang: "en" },
  { theme: "dark", accent: "cobalt", lang: "en" },
  { theme: "light", accent: "cobalt", lang: "fr" },
] as const;
/** A check code as the contract writes it: never shown in the Diagram view. */
const CODE = /\b[a-z]+(?:_[a-z]+){2,}\b/;

async function drawn(page: Page): Promise<void> {
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

async function dismissToast(page: Page): Promise<void> {
  const toast = page.getByRole("status").filter({ has: page.getByRole("button") });
  if (await toast.count()) await toast.getByRole("button").last().click();
  await expect(page.getByRole("status")).toHaveCount(0);
}

const address = (page: Page) => page.evaluate(() => location.search + location.hash);
const panel = (page: Page) => page.locator("aside.ui-panel");

/** The tooltip grammar is measured once per variant (a tooltip hovered open); later audits have none on screen. */
function expectClean(report: Awaited<ReturnType<typeof audit>>, tooltip = true) {
  expect(report.font.archivo, "Archivo is loaded").toBe(true);
  expect(report.bars.flatMap((bar) => bar.flags), "bars").toEqual([]);
  expect(report.floats.flags, "floating surfaces").toEqual([]);
  expect(report.layers.flags, "popovers and lists").toEqual([]);
  expect(report.tooltips.flags.filter((flag) => tooltip || !/no \[role=tooltip\]/.test(flag)), "tooltips").toEqual([]);
  expect(report.contrast.flags, "text contrast").toEqual([]);
  expect(report.opacity.flags, "text opacity").toEqual([]);
}

for (const variant of VARIANTS) {
  const tag = `${variant.theme}-${variant.accent}-${variant.lang}`;
  const fr = variant.lang === "fr";

  test(`the panel at its three widths, ${tag}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    const problems = await open(page, WITH_CORE, variant, { token: TOKEN });
    await drawn(page);
    await dismissToast(page);
    const aside = panel(page);
    await expect(aside).toBeVisible();
    await expect(aside.getByRole("heading", { level: 2 })).toHaveText(CORE);
    // alerts in words, never a code
    const toCheck = aside.getByRole("list", { name: fr ? "À vérifier" : "To check" });
    await expect(toCheck.getByRole("listitem").first()).toBeVisible();
    expect((await aside.innerText()).match(CODE), "no check code in the Diagram view").toBeNull();
    await expect(aside).toHaveAttribute("data-width", "compact");
    await page.screenshot({ path: `${CAPTURES}/panel-compact-${tag}.png` });
    // the widen button carries its tooltip: measured with the panel
    await aside.getByRole("button", { name: fr ? "Élargir la fiche" : "Widen the panel" }).hover();
    await expect(page.getByRole("tooltip", { name: fr ? /Élargir/ : /Widen/ })).toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(200);
    let report = await page.evaluate(audit, LIMITS);
    expect(problems, "console errors and CSP refusals").toEqual([]);
    expect(report.floats.count, "brand, context, views, tools, panel, canvas controls, the band").toBe(7);
    expect(report.bars.map((bar) => bar.bar).sort()).toEqual(["brand", "canvas-controls", "context", "layers", "panel-actions", "panel-ports", "runs", "tools", "view"]);
    expectClean(report);
    // W: wide, stored
    await page.mouse.move(600, 500);
    await page.keyboard.press("w");
    await expect(aside).toHaveAttribute("data-width", "wide");
    await page.waitForTimeout(400);
    await expect(aside.getByRole("columnheader", { name: fr ? /Description/ : /Description/ })).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/panel-wide-${tag}.png` });
    report = await page.evaluate(audit, LIMITS);
    expectClean(report, false);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") || "{}"))).toMatchObject({ panel: "wide" });
    // Shift+F: focus over the scrim, every column, the canvas controls gone
    await page.keyboard.press("Shift+F");
    await expect(aside).toHaveAttribute("data-width", "focus");
    await page.waitForTimeout(400);
    await expect(page.locator(".ui-scrim[data-open]")).toBeVisible();
    await expect(page.getByRole("toolbar", { name: fr ? "Commandes de la toile" : "Canvas controls" })).toHaveCount(0);
    await expect(aside.getByRole("columnheader", { name: /MAC/ })).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/panel-focus-${tag}.png` });
    report = await page.evaluate(audit, LIMITS);
    expectClean(report, false);
    expect(report.contrast.checked).toBeGreaterThan(60);
    // Escape leaves focus; Escape closes
    await page.keyboard.press("Escape");
    await expect(aside).toHaveAttribute("data-width", "wide");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112");
  });
}

test("the interface table sorts, filters and scopes; a neighbour link selects its device; the columns of focus are chosen", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, WITH_CORE, LIGHT, { token: TOKEN });
  await drawn(page);
  await dismissToast(page);
  const aside = panel(page);
  const table = aside.getByRole("table", { name: "Interfaces" });
  const rows = table.locator("tbody tr");
  const cabled = await rows.count();
  expect(cabled).toBeGreaterThan(3);
  // every port: more rows; the counts said by the scope buttons
  await aside.getByRole("button", { name: /^All/ }).click();
  await expect.poll(() => rows.count()).toBeGreaterThan(cabled);
  const all = await rows.count();
  expect(await aside.getByRole("button", { name: /^All/ }).textContent()).toContain(String(all));
  // sort by speed: the ports with a speed first, descending; none-speed last
  await table.getByRole("button", { name: "Speed" }).click();
  await expect(table.getByRole("columnheader", { name: /Speed/ })).toHaveAttribute("aria-sort", "ascending");
  await table.getByRole("button", { name: "Speed" }).click();
  await expect(table.getByRole("columnheader", { name: /Speed/ })).toHaveAttribute("aria-sort", "descending");
  await expect(rows.first().locator("td").nth(2)).toContainText(/G$/);
  await expect(rows.last().locator("td").nth(2)).toHaveText("—");
  // the filter: the short name of a port
  await aside.getByRole("textbox", { name: "Filter the ports" }).fill("eth1/43");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Ethernet1/43");
  await aside.getByRole("textbox", { name: "Filter the ports" }).fill("");
  // a neighbour link: the address names that device, the panel follows
  const neighbour = table.getByRole("link", { name: "dc01-acc-03" }).first();
  await expect(neighbour).toBeVisible();
  await neighbour.click();
  await expect.poll(() => address(page)).toContain("#node=dc01-acc-03");
  await expect(aside.getByRole("heading", { level: 2 })).toHaveText("dc01-acc-03");
  await expect(aside.getByRole("textbox", { name: "Filter the ports" })).toHaveValue("");
  // focus: the column chooser hides MAC, the port column never hides
  await page.keyboard.press("Shift+F");
  await expect(aside).toHaveAttribute("data-width", "focus");
  await aside.getByRole("button", { name: "Choose the columns" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose the columns" });
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("checkbox", { name: /Port/ })).toHaveCount(0);
  await expect(chooser.getByRole("checkbox", { name: "MAC" })).toHaveAttribute("aria-checked", "true");
  await chooser.getByRole("checkbox", { name: "MAC" }).click();
  await expect(chooser.getByRole("checkbox", { name: "MAC" })).toHaveAttribute("aria-checked", "false");
  await expect(aside.getByRole("columnheader", { name: /MAC/ })).toHaveCount(0);
  await expect(aside.getByRole("columnheader", { name: /Port and aggregate/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chooser).toBeHidden();
  await expect(aside).toHaveAttribute("data-width", "focus");
  // a click on the scrim leaves focus
  await page.mouse.click(400, 850);
  await expect(aside).toHaveAttribute("data-width", "compact");
});

test("a cable's panel from the address: both ends and their two ports; the centre action is reached", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, CABLE, LIGHT, { token: TOKEN });
  await drawn(page);
  await dismissToast(page);
  const aside = panel(page);
  await expect(aside).toBeVisible();
  await expect(aside.getByRole("heading", { level: 2 })).toHaveText("dc01-core-01 and dc01-rt-01");
  const ports = aside.getByRole("table", { name: "The two ports" });
  await expect(ports.locator("tbody tr")).toHaveCount(2);
  await expect(ports).toContainText("Ethernet1/43");
  await expect(ports).toContainText("GigabitEthernet0/0/0");
  expect((await aside.innerText()).match(CODE)).toBeNull();
  await aside.getByRole("button", { name: "Centre the view" }).click();
  await expect(aside).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/panel-cable-light-cobalt-en.png` });
  const report = await page.evaluate(audit, LIMITS);
  expect(report.bars.flatMap((bar) => bar.flags)).toEqual([]);
  expect(report.floats.flags).toEqual([]);
  expect(report.contrast.flags).toEqual([]);
});
