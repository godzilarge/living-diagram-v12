// The Check view (brick 7a, design/comps/shell/control.html) in Chromium, on the synthetic API of
// e2e/fixtures/diagram/ (26 checks in 9 groups, 7 devices in scope, 22 cables in 5 combinations of sources): the
// measurement of DESIGN.md (bars, islands, tooltips, contrast) in both themes and accents and in French, with its
// captures; the four widgets and their counts; a verdict opened by a click and by the keyboard; a target that opens
// the Diagram on the element; a toggle that hides its group; the filter; Ctrl+K from Check; the Diagram tab back;
// `#mode=control` typed by hand; edit mode left on the way; the coverage's topic headers that never touch at 480 px.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { audit } from "./audit";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

const LIMITS = { edge: 16, gap: 12, contrast: 4.5, tooltip: 8 };
test.use({ timezoneId: "UTC" });
const CAPTURES = "e2e/captures";
const DIAGRAM = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const CHECK = `${DIAGRAM}#mode=control`;
const VARIANTS = [
  { theme: "light", accent: "cobalt", lang: "en" },
  { theme: "dark", accent: "cobalt", lang: "en" },
  { theme: "light", accent: "ink", lang: "en" },
  { theme: "dark", accent: "ink", lang: "en" },
  { theme: "light", accent: "cobalt", lang: "fr" },
] as const;

const address = (page: Page) => page.evaluate(() => location.search + location.hash);
const register = (page: Page) => page.locator("table.ui-register");
const rows = (page: Page) => register(page).locator("tr.ui-register-row");

/** The Check view has read its collection: the register and its rows. */
async function shown(page: Page): Promise<void> {
  await expect(rows(page).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
}

/** The canvas has drawn the collection's devices. */
async function drawn(page: Page): Promise<void> {
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
}

function expectClean(report: Awaited<ReturnType<typeof audit>>) {
  expect(report.font.archivo, "Archivo is loaded").toBe(true);
  expect(report.bars.flatMap((bar) => bar.flags), "bars").toEqual([]);
  expect(report.floats.flags, "floating surfaces").toEqual([]);
  expect(report.layers.flags, "popovers and lists").toEqual([]);
  expect(report.tooltips.flags, "tooltips").toEqual([]);
  expect(report.contrast.flags, "text contrast").toEqual([]);
  expect(report.opacity.flags, "text opacity").toEqual([]);
}

for (const variant of VARIANTS) {
  const tag = `${variant.theme}-${variant.accent}-${variant.lang}`;
  const fr = variant.lang === "fr";

  test(`check view, ${tag}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    const problems = await open(page, CHECK, variant, { token: TOKEN });
    await shown(page);
    await expect(page).toHaveTitle(fr ? "Contrôle de demo-dc" : "Check of demo-dc");
    await expect(page.getByRole("tab", { name: fr ? /Contrôle/ : /Check/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".react-flow"), "no canvas in Check").toHaveCount(0);
    // the first verdict open, as the planche shows it
    await rows(page).first().click();
    await page.mouse.move(700, 880);
    await page.screenshot({ path: `${CAPTURES}/control-${tag}.png` });
    // one tooltip on screen, from a widget's disabled button, so the grammar is measured
    await page.getByRole("button", { name: fr ? "Ouvrir en grand" : "Open large" }).hover();
    await expect(page.getByRole("tooltip", { name: fr ? /en cours/ : /in progress/ })).toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(200);
    const report = await page.evaluate(audit, LIMITS);
    expect(problems, "console errors and CSP refusals").toEqual([]);
    expect(report.floats.count, "brand, context, views, tools, the four widgets").toBe(8);
    expect(report.bars.map((bar) => bar.bar).sort()).toEqual(["brand", "context", "coverage-head", "delivery-head", "layers", "severities", "sources-head", "tools", "verdicts-head", "view"]);
    expect(report.tooltips.count).toBe(1);
    expect(report.contrast.checked, "texts measured").toBeGreaterThanOrEqual(80);
    expectClean(report);
  });
}

test("the four widgets and their counts, from the run's model", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  const verdicts = page.locator('[data-float="verdicts"]');
  await expect(verdicts.locator(".ui-widget-count")).toHaveText("26");
  const toggles = page.getByRole("group", { name: "Severities" });
  await expect(toggles.getByRole("button")).toHaveText(["Errors1", "Warnings7", "Notes18"]);
  await expect(toggles.getByRole("button", { pressed: true })).toHaveCount(3);
  await expect(rows(page)).toHaveCount(9);
  await expect(register(page).locator("tr.ui-register-group")).toHaveText(["Errors1", "Warnings7", "Notes18"]);
  // the most severe first, then the largest: the sentence, the code and the rule on two lines, the count
  const first = rows(page).first();
  await expect(first.locator(".ui-register-title")).toHaveText("1 aggregate without enough active members");
  await expect(first.locator(".ui-code")).toHaveText("aggregate_below_min_links");
  await expect(first.locator(".ui-register-meta")).toContainText("aggregates, MLAG and HA");
  await expect(rows(page).nth(1).locator(".ui-register-title")).toHaveText("4 cables observed on ports that see several neighbours");
  await expect(rows(page).nth(4).locator(".ui-register-title")).toHaveText("7 cables documented but never observed");
  // a row counts its things: five neighbours, as the delivery's unresolved names (six checks behind them)
  await expect(rows(page).nth(5).locator(".ui-register-title")).toHaveText("5 neighbours unknown to the inventory");
  const height = await first.evaluate((row) => row.getBoundingClientRect().height);
  expect(height, "a verdict is a 56 px row").toBeCloseTo(56, 0);
  // coverage: the devices in scope, the band, a row per device, a hollow mark for a topic not asked
  const coverage = page.locator('[data-float="coverage"]');
  await expect(coverage.locator(".ui-widget-count")).toHaveText("7");
  await expect(coverage.locator(".ui-facts dt")).toHaveText(["In scope", "Answered", "Partial", "Unreachable"]);
  await expect(coverage.locator(".ui-facts dd").first()).toHaveText("7 devices");
  await expect(coverage.locator("tbody tr")).toHaveCount(7);
  await expect(coverage.getByRole("row", { name: /dc01-core-02/ })).toContainText("partial");
  await expect(coverage.getByRole("img", { name: "CDP: failed" })).toHaveCount(1);
  await expect(coverage.locator('.ui-mark[data-tone="off"]').first()).toHaveAttribute("aria-label", /not asked/);
  // cables and sources: the cables, a row per combination, the stroke before the words
  const sources = page.locator('[data-float="sources"]');
  await expect(sources.locator(".ui-widget-count")).toHaveText("22");
  await expect(sources.locator("tbody tr")).toHaveCount(5);
  await expect(sources.locator("tbody tr").first()).toHaveText(/LLDP, CDP and description\s*observed and documented\s*9/);
  await expect(sources.locator('.ui-source-line[data-line="dotted"]')).toHaveCount(1);
  // delivery: the day, the facts the data says
  const delivery = page.locator('[data-float="delivery"]');
  await expect(delivery.locator(".ui-widget-count")).toHaveText("19 Jan");
  await expect(delivery.locator("dt")).toHaveText(["Exporter", "Contract", "Received", "Devices", "Findings", "Normalizations", "Unread", "Unresolved"]);
  await expect(delivery.locator("dd")).toHaveText(["ld-contracts-synth 1.0.0", "RunBundle 1.0.0", "19 Jan 2026, 02:15", "7 in scope, 7 answered", "none", "no residual, 5 by B1", "none", "5 neighbours"]);
  // the three buttons that wait for the bench: present, disabled
  for (const name of ["Open large", "All cables", "Ingestion report"]) await expect(page.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
});

test("a verdict opens on its targets by a click and by the keyboard", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  const first = rows(page).first();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  const targets = page.getByRole("list", { name: "What it concerns" });
  await expect(targets.getByRole("link")).toHaveText(["dc01-core-01 · port-channel101"]);
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await expect(targets).toHaveCount(0);
  // the keyboard: Tab reaches a row, Enter opens it, Space closes it
  const second = rows(page).nth(1);
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-expanded", "true");
  // each thing once: the four cables the sentence counts
  await expect(page.getByRole("list", { name: "What it concerns" }).getByRole("link")).toHaveCount(4);
  await page.keyboard.press(" ");
  await expect(second).toHaveAttribute("aria-expanded", "false");
});

test("a target opens the Diagram on the element; the Diagram tab comes back to the canvas", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  await rows(page).first().click();
  const link = page.getByRole("link", { name: "dc01-core-01 · port-channel101" });
  await expect(link).toHaveAttribute("href", `?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#aggregate=${encodeURIComponent(JSON.stringify(["dc01-core-01", "port-channel101"]))}`);
  await link.click();
  await drawn(page);
  await expect.poll(() => address(page)).toBe(`?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#aggregate=${encodeURIComponent(JSON.stringify(["dc01-core-01", "port-channel101"]))}`);
  await expect(page.getByRole("tab", { name: "Diagram" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-float="panel"]')).toContainText("port-channel101");
  // the browser's Back goes to Check again, with the selection kept aside
  await page.goBack();
  await shown(page);
  await expect(page.locator(".react-flow")).toHaveCount(0);
  await page.getByRole("tab", { name: "Diagram" }).click();
  await drawn(page);
  await expect.poll(() => address(page)).not.toContain("mode=");
});

test("a toggle hides its group; the filter keeps the verdicts it names", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  const notes = page.getByRole("group", { name: "Severities" }).getByRole("button", { name: /Notes/ });
  await notes.click();
  await expect(notes).toHaveAttribute("aria-pressed", "false");
  await expect(register(page).locator("tr.ui-register-group")).toHaveText(["Errors1", "Warnings7"]);
  await expect(rows(page)).toHaveCount(4);
  await notes.click();
  await expect(rows(page)).toHaveCount(9);
  const filter = page.getByRole("textbox", { name: "Filter the verdicts" });
  await filter.fill("link_down");
  await expect(rows(page)).toHaveCount(1);
  await filter.fill("never observed");
  await expect(rows(page)).toHaveCount(2);
  await filter.fill("Te1/1/1");
  await expect(rows(page).first().locator(".ui-code")).toHaveText("aggregate_member_not_bundled");
  await filter.fill("nothing like this");
  await expect(register(page)).toHaveCount(0);
  await expect(page.getByText("No verdict matches.")).toBeVisible();
  // the address never carries the toggles nor the filter
  expect(await address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#mode=control");
});

test("Ctrl+K from Check opens the Diagram on the result; #mode=control typed by hand opens Check", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  await page.keyboard.press("Control+k");
  const field = page.getByRole("combobox", { name: "Search everywhere" });
  await expect(field).toBeFocused();
  await field.fill("dc01-core-02");
  await page.keyboard.press("Enter");
  await drawn(page);
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#node=dc01-core-02");
  await page.evaluate(() => {
    location.hash = "#mode=control";
  });
  await shown(page);
  await expect(page.locator(".react-flow")).toHaveCount(0);
  await expect(page.locator('[data-float="canvas-controls"], [data-float="runs"]')).toHaveCount(0);
  // the canvas's keys do nothing in Check
  await page.keyboard.press("g");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") || "{}"));
  expect(stored.grid).not.toBe(false);
});

test("going to Check leaves edit mode", async ({ page }) => {
  await mockApi(page);
  await open(page, DIAGRAM, LIGHT, { token: TOKEN, author: "orhan" });
  await drawn(page);
  await page.keyboard.press("m");
  await expect(page.locator('[data-float="edit-tools"]')).toBeVisible();
  await page.getByRole("tab", { name: /Check/ }).click();
  await shown(page);
  await expect(page.locator('[data-float="edit-tools"]')).toHaveCount(0);
  await page.keyboard.press("m");
  await expect(page.locator(".react-flow")).toHaveCount(0);
  await page.getByRole("tab", { name: "Diagram" }).click();
  await drawn(page);
  await expect(page.locator('[data-float="edit-tools"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit: editing tools/ })).toHaveAttribute("aria-pressed", "false");
});

test("the coverage's topic headers never touch at 480 px, in both languages", async ({ page }) => {
  for (const lang of ["en", "fr"]) {
    await mockApi(page);
    await open(page, CHECK, { ...LIGHT, lang }, { token: TOKEN });
    await shown(page);
    const widget = page.locator('[data-float="coverage"]');
    expect((await widget.boundingBox())?.width).toBeCloseTo(480, 0);
    const heads = await widget.locator("thead .ui-th").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, w: el.scrollWidth, cw: el.clientWidth }; }));
    for (let i = 1; i < heads.length; i++) expect(heads[i].l - heads[i - 1].r, `${lang}: header ${i} keeps its distance`).toBeGreaterThanOrEqual(4);
    for (const head of heads) expect(head.w, `${lang}: a header is whole`).toBeLessThanOrEqual(head.cw + 0.5);
  }
});

test("a verdict opened on its cables and ports, in French (the planche)", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, CHECK, { ...LIGHT, lang: "fr" }, { token: TOKEN });
  await shown(page);
  await rows(page).nth(1).click();
  const targets = page.getByRole("list", { name: "Ce qui est concerné" });
  await expect(targets.getByRole("link")).toHaveCount(4);
  await expect(targets.getByRole("link").first()).toHaveText("dc01-acc-01 · Gi1/0/1 vers sep93bb92c0ad60 · 93:bb:92:c0:ad:60");
  await page.mouse.move(700, 880);
  await page.screenshot({ path: `${CAPTURES}/control-open-light-cobalt-fr.png` });
});

test("the register's geometry and the right column at 1440 × 900 (review 2026-10-21, M1, M2, B1, B3)", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, { ...LIGHT, lang: "fr" }, { token: TOKEN });
  await shown(page);
  const first = rows(page).first();
  await first.click();
  const geometry = await page.evaluate(() => {
    const box = (el: Element | null) => (el as Element).getBoundingClientRect();
    const open = document.querySelector("tr.ui-register-row[data-open]") as HTMLElement;
    const detail = document.querySelector("tr.ui-register-detail") as HTMLElement;
    const targets = detail.querySelector(".ui-register-targets");
    const icon = detail.querySelector(".ui-register-target-icon");
    return {
      title: box(open.querySelector(".ui-register-title")).left,
      icon: box(icon).left,
      detail: box(detail).height,
      targets: box(targets).height,
      below: box(detail).bottom - box(targets).bottom,
      group: box(document.querySelector("tr.ui-register-group")).height,
    };
  });
  expect(geometry.icon, "the targets start where the sentence starts").toBeCloseTo(geometry.title, 0);
  // the detail takes its targets' height and 12 px (its hairline, collapsed, adds half a pixel)
  expect(Math.abs(geometry.detail - (geometry.targets + 12)), "the detail's height").toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.below - 12), "12 px under the last target").toBeLessThanOrEqual(1);
  expect(geometry.group, "a group heading is 36 px").toBeCloseTo(36, 0);
  // an open row and its detail are one thing: no hover fill on either
  await first.hover();
  expect(await first.locator("td").first().evaluate((td) => getComputedStyle(td).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  // the coverage and the sources at 32 px (the mockup's `.mini`), the delivery's eight facts whole at 900 px
  const heights = await page.locator('[data-float="coverage"] tbody tr, [data-float="sources"] tbody tr').evaluateAll((trs) => trs.map((tr) => tr.getBoundingClientRect().height));
  expect(new Set(heights.map(Math.round))).toEqual(new Set([32]));
  const delivery = page.locator('[data-float="delivery"]');
  const whole = await delivery.evaluate((widget) => {
    const body = (widget.querySelector(".ui-widget-body") as Element).getBoundingClientRect();
    return [...widget.querySelectorAll("dd")].every((dd) => dd.getBoundingClientRect().bottom <= body.bottom + 0.5);
  });
  expect(whole, "every fact of the delivery shows").toBe(true);
  await expect(delivery.locator("dt")).toHaveCount(8);
});

test("under 1280 px the filter gives way and never covers the coverage (review 2026-10-21, B5)", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockApi(page);
  await page.addInitScript(() => localStorage.setItem("ld-prefs", JSON.stringify({ theme: "light", accent: "cobalt", language: "fr" })));
  await page.addInitScript((token) => sessionStorage.setItem("ld-api-token", token), TOKEN);
  await page.goto(CHECK);
  await shown(page);
  const verdicts = await page.locator('[data-float="verdicts"]').boundingBox();
  const field = await page.getByRole("textbox", { name: "Filtrer les verdicts" }).boundingBox();
  expect((field?.x ?? 0) + (field?.width ?? 0)).toBeLessThanOrEqual((verdicts?.x ?? 0) + (verdicts?.width ?? 0));
  expect(field?.width ?? 0).toBeGreaterThanOrEqual(64);
});
