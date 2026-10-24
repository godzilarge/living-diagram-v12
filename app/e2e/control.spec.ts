// The Check view (brick 7a, design/comps/shell/control.html; the tiles and the register by rule of the brick
// « grille », 2026-10-24) in Chromium, on the synthetic API of e2e/fixtures/diagram/ (26 checks in 9 groups, 7 devices
// in scope, 22 cables in 5 combinations of sources): the measurement of DESIGN.md (bars, islands, tooltips, contrast)
// in both themes and accents and in French, with its captures; the four widgets and their counts; the register's
// sections by rule; a verdict opened by a click and by the keyboard; a target that opens the Diagram on the element; a
// toggle and the filter; Ctrl+K from Check; the Diagram tab back; `#mode=control` typed by hand; edit mode left on the
// way; the coverage's topic headers that never touch; the tiles: the default geometry, a resize then a move into the
// place it freed, a refused drop (red frame, back in place), a resize stopped by a neighbour, the preference written,
// "Tighten" and "Reset" from Ctrl+K, Enlarge then Escape, a narrow Verdicts, a 13-inch window that scrolls.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { audit } from "./audit";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";
import { boxOf, carry, CHECK, DIAGRAM, grip, handle, shown, stored, tile } from "./tiles";

const LIMITS = { edge: 16, gap: 12, contrast: 4.5, tooltip: 8 };
test.use({ timezoneId: "UTC" });
const CAPTURES = "e2e/captures";
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
/** The first row of a code (documented_not_observed has two: a warning and a note). */
const rowOf = (page: Page, code: string) => rows(page).filter({ has: page.locator('td[data-key="code"] .ui-code', { hasText: new RegExp(`^${code}$`) }) }).first();
const SECTIONS_EN = ["Cables12", "Aggregates, MLAG and HA3", "States2", "Neighbours6", "Remote ports3"];
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
    // one tooltip on screen, from a tile's Enlarge, so the grammar is measured
    await tile(page, "coverage").getByRole("button", { name: fr ? "Agrandir" : "Enlarge" }).hover();
    await expect(page.getByRole("tooltip", { name: fr ? "Agrandir" : "Enlarge" })).toBeVisible({ timeout: 2000 });
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
  // a section per rule, in the order of the rules, its count of checks
  await expect(register(page).locator("tr.ui-register-group")).toHaveText(SECTIONS_EN);
  await expect(register(page).locator("thead th")).toHaveText(["Severity", "Verdict", "Code", "Open"]);
  // inside a section the most severe first, then the largest: one line, the sentence with its number, the code
  const first = rows(page).first();
  await expect(first.locator(".ui-register-title")).toHaveText("4 cables observed on ports that see several neighbours");
  await expect(first.locator(".ui-code")).toHaveText("multiple_observed_neighbors");
  await expect(rows(page).nth(2).locator(".ui-register-title")).toHaveText("7 cables documented but never observed");
  await expect(rows(page).nth(3).locator(".ui-register-title")).toHaveText("1 aggregate without enough active members");
  // a row counts its things: five neighbours, as the delivery's unresolved names (six checks behind them)
  await expect(rowOf(page, "neighbor_unknown").locator(".ui-register-title")).toHaveText("5 neighbours unknown to the inventory");
  const heights = await rows(page).evaluateAll((trs) => trs.map((tr) => Math.round(tr.getBoundingClientRect().height)));
  expect(new Set(heights), "a verdict is a 44 px row").toEqual(new Set([44]));
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
  // each tile ends its header with Enlarge; nothing waits disabled any more
  await expect(page.getByRole("button", { name: "Enlarge" })).toHaveCount(4);
  for (const id of ["verdicts", "coverage", "sources", "delivery"]) await expect(tile(page, id).locator(".ui-widget-head button").last()).toHaveAccessibleName("Enlarge");
  await expect(page.locator('main [aria-disabled="true"]')).toHaveCount(0);
});

test("a verdict opens on its targets by a click and by the keyboard", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  const first = rowOf(page, "aggregate_below_min_links");
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  const targets = page.getByRole("list", { name: "What it concerns" });
  await expect(targets.getByRole("link")).toHaveText(["dc01-core-01 · port-channel101"]);
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await expect(targets).toHaveCount(0);
  // the keyboard: Tab reaches a row, Enter opens it, Space closes it
  const second = rowOf(page, "multiple_observed_neighbors");
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
  await rowOf(page, "aggregate_below_min_links").click();
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
  // the notes' rows leave, and the sections left without a row with them
  await expect(register(page).locator("tr.ui-register-group")).toHaveText(["Cables5", "Aggregates, MLAG and HA3"]);
  await expect(rows(page)).toHaveCount(4);
  await notes.click();
  await expect(rows(page)).toHaveCount(9);
  const filter = page.getByRole("textbox", { name: "Filter the verdicts" });
  await filter.fill("link_down");
  await expect(rows(page)).toHaveCount(1);
  await filter.fill("never observed");
  await expect(rows(page)).toHaveCount(2);
  await filter.fill("Te1/1/1");
  await expect(rowOf(page, "aggregate_member_not_bundled")).toBeVisible();
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

test("the coverage's topic headers never touch at the tile's default width, in both languages", async ({ page }) => {
  for (const lang of ["en", "fr"]) {
    await mockApi(page);
    await open(page, CHECK, { ...LIGHT, lang }, { token: TOKEN });
    await shown(page);
    const widget = page.locator('[data-float="coverage"]');
    expect(Math.abs(((await widget.boundingBox())?.width ?? 0) - 459), "4 columns of 12 at 1440").toBeLessThanOrEqual(1);
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
  await expect(register(page).locator("tr.ui-register-group")).toHaveText(["Câbles12", "Agrégats, MLAG et HA3", "États2", "Voisins6", "Ports distants3"]);
  await rowOf(page, "multiple_observed_neighbors").click();
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
  const first = rowOf(page, "aggregate_below_min_links");
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
      groupLabel: box(document.querySelector("tr.ui-register-group .ui-register-group-label")),
      groupCount: box(document.querySelector("tr.ui-register-group .ui-register-group-count")).left,
      mark: box(open.querySelector('td[data-key="mark"] .ui-mark')).left,
      row: box(open).left,
      code: Math.max(...[...document.querySelectorAll('tr.ui-register-row td[data-key="code"] .ui-code')].map((chip) => box(chip).right)),
      codeLefts: [...new Set([...document.querySelectorAll('tr.ui-register-row td[data-key="code"] .ui-code')].map((chip) => Math.round(box(chip).left)))],
      codeHead: Math.round(box(document.querySelector('table.ui-register thead th[data-key="code"] .ui-th')).left),
      chevron: box(open.querySelector('td[data-key="open"]')).left,
      table: box(document.querySelector('[data-float="verdicts"] table.ui-register')).right,
    };
  });
  // the section's words, then its count 8 px after; the mark 8 px into the row; the code column left-aligned (every chip
  // starts on one line, under its head), the widest chip 12 px before the chevron
  expect(geometry.groupCount - geometry.groupLabel.right, "the count 8 px after the section's words").toBeCloseTo(8, 0);
  expect(geometry.groupLabel.left, "the section starts where the marks do").toBeCloseTo(geometry.mark, 0);
  expect(geometry.mark - geometry.row, "the mark 8 px into the row").toBeCloseTo(8, 0);
  expect(geometry.codeLefts, "the chips start on one line, under the head").toEqual([geometry.codeHead]);
  expect(geometry.chevron - geometry.code, "the widest code 12 px before the chevron").toBeCloseTo(12, 0);
  expect(geometry.icon, "the targets start where the sentence starts").toBeCloseTo(geometry.title, 0);
  // the detail takes its targets' height and 12 px (its hairline, collapsed, adds half a pixel)
  expect(Math.abs(geometry.detail - (geometry.targets + 12)), "the detail's height").toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.below - 12), "12 px under the last target").toBeLessThanOrEqual(1);
  expect(geometry.group, "a section heading is 48 px").toBeCloseTo(48, 0);
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

test("the tiles' default geometry at 1440 × 900: the mockup's layout, 16 px apart", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  const [verdicts, coverage, sources, delivery] = await Promise.all(["verdicts", "coverage", "sources", "delivery"].map((id) => boxOf(page, id)));
  const near = (value: number, target: number, what: string) => expect(Math.abs(value - target), `${what}: ${value}`).toBeLessThanOrEqual(1);
  near(verdicts.x, 16, "Verdicts from the left");
  near(verdicts.y, 80, "Verdicts under the top row");
  near(verdicts.width, 933, "Verdicts' width (8 columns of 12)");
  near(verdicts.height, 800, "Verdicts' height (17 rows)");
  near(coverage.x, 965, "Coverage's column");
  near(coverage.width, 459, "Coverage's width (4 columns)");
  near(coverage.x - (verdicts.x + verdicts.width), 16, "Verdicts to Coverage");
  near(sources.y - (coverage.y + coverage.height), 16, "Coverage to Sources");
  near(delivery.y - (sources.y + sources.height), 16, "Sources to Delivery");
  near(1440 - (coverage.x + coverage.width), 16, "Coverage from the right");
  near(delivery.y + delivery.height, verdicts.y + verdicts.height, "the two columns end together");
  // the space scrolls inside, under a fixed top row; nothing under the lowest tile: at 1440 × 900 it does not scroll
  const space = await page.locator("main.control-space").evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, overflow: getComputedStyle(el).overflowY }));
  expect(space.overflow).toBe("auto");
  expect(space.scroll, "the default layout does not scroll").toBeLessThanOrEqual(space.client);
});

test("a tile resized by its edge, another moved into the place it freed; the layout is stored", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  expect(await stored(page), "nothing stored before a gesture").toBeNull();
  // Verdicts narrowed by its east edge: three columns freed, its height kept
  const east = await handle(page, "verdicts", "e");
  await carry(page, { x: east.x + 4, y: east.y + 200 }, { x: east.x + 4 - 356, y: east.y + 200 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const narrowed = await boxOf(page, "verdicts");
  expect(Math.abs(narrowed.width - 577), "five columns").toBeLessThanOrEqual(1);
  expect(Math.abs(narrowed.height - 800), "a side changes one dimension").toBeLessThanOrEqual(1);
  expect((await stored(page))?.verdicts).toEqual({ x: 0, y: 0, w: 5, h: 17 });
  // Coverage carried by its header into the freed columns
  const from = await grip(page, "coverage");
  await carry(page, from, { x: narrowed.x + narrowed.width + 16 + 20, y: from.y });
  await expect(page.locator(".ui-tiles .react-grid-placeholder")).toHaveCSS("border-top-style", "dashed");
  await expect(page.locator(".ui-tiles[data-refused]")).toHaveCount(0);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const coverage = await boxOf(page, "coverage");
  expect(Math.abs(coverage.x - (narrowed.x + narrowed.width + 16)), "Coverage next to Verdicts").toBeLessThanOrEqual(1);
  expect((await stored(page))?.coverage).toEqual({ x: 5, y: 0, w: 4, h: 5 });
  // the layout survives a reload (the stored preference, never the address)
  expect(await address(page)).not.toContain("tiles");
});

test("a drop on a taken place: the frame turns red during the move, the tile comes back", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  const before = await boxOf(page, "sources");
  const verdicts = await boxOf(page, "verdicts");
  await carry(page, await grip(page, "sources"), { x: verdicts.x + 200, y: verdicts.y + 240 });
  await expect(page.locator(".ui-tiles[data-refused]")).toHaveCount(1);
  const frame = page.locator(".ui-tiles .react-grid-placeholder");
  await expect(frame).toHaveCSS("border-top-style", "solid");
  const red = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-error").trim());
  const rgb = await page.evaluate((hex) => {
    const probe = document.createElement("i");
    probe.style.color = hex;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, red);
  await expect(frame).toHaveCSS("border-top-color", rgb);
  // the tile in hand rises with the layer shadow
  const shadow = await tile(page, "sources").evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).toContain("64px");
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(page.locator(".ui-tiles[data-refused]")).toHaveCount(0);
  const after = await boxOf(page, "sources");
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y), "back in its place").toBeLessThanOrEqual(1);
  expect(await stored(page), "a refused drop writes nothing").toBeNull();
});

test("a resize stops at its neighbour", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  const before = await boxOf(page, "verdicts");
  const east = await handle(page, "verdicts", "e");
  await carry(page, { x: east.x + 4, y: east.y + 200 }, { x: east.x + 4 + 240, y: east.y + 200 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await boxOf(page, "verdicts");
  expect(Math.abs(after.width - before.width), "Coverage holds Verdicts' east side").toBeLessThanOrEqual(1);
  // Coverage pulled down by its south-east corner: Sources under it holds its height, the window's edge its width
  const coverage = await boxOf(page, "coverage");
  const corner = await handle(page, "coverage", "se");
  await carry(page, { x: corner.x + 8, y: corner.y + 8 }, { x: corner.x + 8 + 200, y: corner.y + 8 + 200 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const pulled = await boxOf(page, "coverage");
  expect(Math.abs(pulled.height - coverage.height) + Math.abs(pulled.width - coverage.width), "Coverage unchanged").toBeLessThanOrEqual(1);
  // no overlap anywhere
  const boxes = await Promise.all(["verdicts", "coverage", "sources", "delivery"].map((id) => boxOf(page, id)));
  for (const a of boxes) for (const b of boxes) if (a !== b) expect(a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5).toBe(true);
});

test("Tighten and Reset the tiles from Ctrl+K, in Check only", async ({ page }) => {
  await mockApi(page);
  const loose = { verdicts: { x: 0, y: 0, w: 8, h: 17 }, coverage: { x: 8, y: 3, w: 4, h: 5 }, sources: { x: 8, y: 12, w: 4, h: 6 }, delivery: { x: 0, y: 20, w: 4, h: 6 } };
  await open(page, CHECK, LIGHT, { token: TOKEN, prefs: { checkTiles: loose } });
  await shown(page);
  expect(Math.round((await boxOf(page, "coverage")).y)).toBe(80 + 3 * 48);
  await page.keyboard.press("Control+k");
  const field = page.getByRole("combobox", { name: "Search everywhere" });
  await field.fill("tighten");
  await expect(page.getByRole("option", { name: /Tighten the tiles/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  expect(await stored(page)).toEqual({ ...loose, coverage: { x: 8, y: 0, w: 4, h: 5 }, sources: { x: 8, y: 5, w: 4, h: 6 }, delivery: { x: 0, y: 17, w: 4, h: 6 } });
  expect(Math.round((await boxOf(page, "coverage")).y)).toBe(80);
  await page.keyboard.press("Control+k");
  await field.fill("reset the tiles");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  expect(await stored(page)).toEqual({ verdicts: { x: 0, y: 0, w: 8, h: 17 }, coverage: { x: 8, y: 0, w: 4, h: 5 }, sources: { x: 8, y: 5, w: 4, h: 6 }, delivery: { x: 8, y: 11, w: 4, h: 6 } });
  expect(Math.round((await boxOf(page, "delivery")).x)).toBe(965);
  // the Diagram view does not offer them
  await page.getByRole("tab", { name: "Diagram" }).click();
  await drawn(page);
  await page.keyboard.press("Control+k");
  await field.fill("tiles");
  await expect(page.getByRole("option", { name: /Tighten the tiles/ })).toHaveCount(0);
});

test("Enlarge puts a tile over the space; Reduce and Escape put it back", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  const home = await boxOf(page, "coverage");
  await tile(page, "coverage").getByRole("button", { name: "Enlarge" }).click();
  await page.waitForTimeout(400);
  const big = await boxOf(page, "coverage");
  expect([Math.round(big.x), Math.round(big.y), Math.round(big.width), Math.round(big.height)], "16 px from the sides and the bottom, 80 from the top").toEqual([16, 80, 1408, 804]);
  await expect(page.locator("main.control-space > .ui-scrim")).toHaveAttribute("data-open", "");
  // the gestures are off: no handle, no grab
  await expect(page.locator(".ui-tiles[data-enabled]")).toHaveCount(0);
  const handles = await page.locator(".ui-tiles .react-resizable-handle").evaluateAll((els) => els.map((el) => getComputedStyle(el).display));
  expect(new Set(handles)).toEqual(new Set(["none"]));
  const reduce = tile(page, "coverage").getByRole("button", { name: "Reduce" });
  await expect(reduce).not.toHaveAttribute("aria-pressed", /.*/);
  await reduce.click();
  await page.waitForTimeout(400);
  const back = await boxOf(page, "coverage");
  expect(Math.abs(back.x - home.x) + Math.abs(back.y - home.y) + Math.abs(back.width - home.width), "back in its place").toBeLessThanOrEqual(1);
  // Escape reduces too; the enlarged tile is never stored
  await tile(page, "verdicts").getByRole("button", { name: "Enlarge" }).click();
  await page.waitForTimeout(400);
  expect(Math.round((await boxOf(page, "verdicts")).width)).toBe(1408);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  expect(Math.round((await boxOf(page, "verdicts")).width)).toBe(933);
  await expect(page.locator(".ui-tiles[data-enabled]")).toHaveCount(1);
  expect(await stored(page)).toBeNull();
});

test("a narrow Verdicts: its header on two lines, the code column given way to the detail", async ({ page }) => {
  await mockApi(page);
  const narrow = { verdicts: { x: 0, y: 0, w: 5, h: 17 }, coverage: { x: 5, y: 0, w: 7, h: 6 }, sources: { x: 5, y: 6, w: 7, h: 5 }, delivery: { x: 5, y: 11, w: 7, h: 6 } };
  await open(page, CHECK, LIGHT, { token: TOKEN, prefs: { checkTiles: narrow } });
  await shown(page);
  expect((await boxOf(page, "verdicts")).width).toBeLessThan(640);
  const head = tile(page, "verdicts").locator(".ui-widget-head");
  const title = (await head.locator("h2").boundingBox())!;
  const toggles = (await head.locator(".ui-widget-toggles").boundingBox())!;
  expect(toggles.y, "the toggles under the title").toBeGreaterThan(title.y + title.height);
  // their words start where the title starts (the button's padding taken back)
  const word = await head.locator(".ui-widget-toggles button").first().evaluate((button) => {
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode() as Text;
    const range = document.createRange();
    range.selectNodeContents(text);
    return range.getBoundingClientRect().left;
  });
  const titleText = await head.locator("h2").evaluate((h2) => {
    const range = document.createRange();
    range.selectNodeContents(h2);
    return range.getBoundingClientRect().left;
  });
  expect(Math.abs(word - titleText), `the toggles' first word at the title's start: ${word} / ${titleText}`).toBeLessThanOrEqual(1);
  const field = (await head.locator(".ui-field").boundingBox())!;
  expect(Math.abs(field.y + field.height / 2 - (title.y + title.height / 2)), "the filter on the title's line").toBeLessThanOrEqual(1);
  await expect(register(page).locator('thead th[data-key="code"]')).toBeHidden();
  await expect(rows(page).first().locator('td[data-key="code"]')).toBeHidden();
  const open_ = rowOf(page, "aggregate_below_min_links");
  await open_.click();
  await expect(page.locator(".ui-register-detail .ui-register-detail-code .ui-code")).toBeVisible();
  await expect(page.locator(".ui-register-detail .ui-register-detail-code .ui-code")).toHaveText("aggregate_below_min_links");
  // the wide Coverage: its topic columns take 72 px
  const topic = await tile(page, "coverage").locator('thead th[data-align="center"]').first().boundingBox();
  expect(Math.round(topic?.width ?? 0)).toBe(72);
});

test("a 13-inch window: the same layout, the space scrolls under a fixed top row", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockApi(page);
  await page.addInitScript((token) => sessionStorage.setItem("ld-api-token", token), TOKEN);
  await page.addInitScript(() => localStorage.setItem("ld-prefs", JSON.stringify({ theme: "light", accent: "cobalt", language: "en" })));
  await page.goto(CHECK);
  await shown(page);
  const space = page.locator("main.control-space");
  const sizes = await space.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(sizes.scroll).toBeGreaterThan(sizes.client);
  expect(Math.round((await boxOf(page, "verdicts")).height), "the rows stay in pixels").toBe(800);
  const top = (await page.locator('[data-float="context"]').boundingBox())!;
  await space.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(200);
  expect((await page.locator('[data-float="context"]').boundingBox())!.y, "the top row never moves").toBe(top.y);
  const delivery = (await boxOf(page, "delivery"));
  // nothing under the lowest tile but the outer half of its south handle (8 px astride the hairline)
  expect(Math.round(768 - (delivery.y + delivery.height)), "nothing under the lowest tile").toBe(4);
});
