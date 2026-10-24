// The diagram shell (brick 2) in Chromium, on the synthetic API of e2e/fixtures/diagram/: the measurement of
// DESIGN.md (bars, islands, tooltips, contrast) in both themes and accents and in French, with its captures; the band
// (a click, the arrows, "compare with"), the canvas controls (the zoom as a word, the grid and the overview stored
// in `ld-prefs`, the keys), the address kept in step (run, compared run, the selected device), what the page shows
// without a token, on a refusal, without a collection, with a single one.
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
  { theme: "light", accent: "ink", lang: "en" },
  { theme: "dark", accent: "ink", lang: "en" },
  { theme: "light", accent: "cobalt", lang: "fr" },
] as const;

/** The canvas has drawn the collection's devices. */
async function drawn(page: Page): Promise<void> {
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400); // the opening view settles
}

const address = (page: Page) => page.evaluate(() => location.search + location.hash);

/** The placement host says what it memorized on the first opening: closed before the page is measured. */
async function dismissToast(page: Page): Promise<void> {
  const toast = page.getByRole("status").filter({ has: page.getByRole("button") });
  if (await toast.count()) await toast.getByRole("button").last().click();
  await expect(page.getByRole("status")).toHaveCount(0);
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

  test(`diagram at rest, ${tag}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    const problems = await open(page, AT_REST, variant, { token: TOKEN });
    await drawn(page);
    await expect(page.getByRole("button", { name: fr ? /changements/ : /changes/ })).toBeVisible();
    await expect(page.getByRole("group", { name: fr ? "Collectes" : "Collections" }).getByRole("button")).toHaveCount(3);
    await dismissToast(page);
    await page.screenshot({ path: `${CAPTURES}/diagram-${tag}.png` });
    // one tooltip on screen, from the canvas controls, so the grammar is measured
    await page.getByRole("button", { name: fr ? "Dézoomer" : "Zoom out" }).hover();
    await expect(page.getByRole("tooltip", { name: fr ? /Dézoomer/ : /Zoom out/ })).toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(200);
    const report = await page.evaluate(audit, LIMITS);
    expect(problems, "console errors and CSP refusals").toEqual([]);
    expect(report.floats.count, "brand, context, views, tools, canvas controls, the band").toBe(6);
    expect(report.bars.map((bar) => bar.bar).sort()).toEqual(["brand", "canvas-controls", "context", "layers", "runs", "tools", "view"]);
    expect(report.tooltips.count).toBe(1);
    expect(report.contrast.checked, "texts measured").toBeGreaterThanOrEqual(12);
    expectClean(report);
  });
}

test("the band opens a collection compared with the one before it; the arrows walk it; compare with picks any earlier one", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  const band = page.getByRole("group", { name: "Collections" });
  await expect(band.getByRole("button", { name: /19 Jan/ })).toHaveAttribute("aria-current", "true");
  await expect(band.getByRole("button", { name: /12 Jan/ })).toContainText("compared");
  await band.getByRole("button", { name: /12 Jan/ }).click();
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0112&from=demo-0105");
  await expect(band.getByRole("button", { name: /12 Jan/ })).toHaveAttribute("aria-current", "true");
  await expect(band.getByRole("button", { name: /5 Jan/ })).toContainText("compared");
  await expect(page.getByRole("button", { name: /changes/ })).toBeVisible();
  // the arrows: one tab stop, Left and Right move the focus, Enter opens
  await band.getByRole("button", { name: /12 Jan/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(band.getByRole("button", { name: /19 Jan/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112");
  // compare with: the earlier runs, none first
  await page.getByRole("combobox", { name: "Compare with an earlier collection" }).click();
  const list = page.getByRole("listbox", { name: "Compare with an earlier collection" });
  await expect(list.getByRole("option")).toHaveText(["None", "12 Jan", "5 Jan"]);
  await list.getByRole("option", { name: "5 Jan" }).click();
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0105");
  await expect(band.getByRole("button", { name: /5 Jan/ })).toContainText("compared");
  await page.getByRole("combobox", { name: "Compare with an earlier collection" }).click();
  await list.getByRole("option", { name: "None" }).click();
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119");
  await expect(page.getByRole("button", { name: /changes/ })).toHaveCount(0);
  // the collection choice in the context island opens a run too
  await page.getByRole("combobox", { name: "Collection", exact: true }).click();
  await page.getByRole("option", { name: "5 Jan 2026, 02:00" }).click();
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0105");
});

test("the canvas controls: the zoom as a word, back to 100%, the grid and the overview stored, the keys", async ({ page }) => {
  await mockApi(page);
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  const percent = page.getByRole("button", { name: /\d+%$/ });
  const before = Number.parseInt((await percent.textContent()) ?? "0", 10);
  expect(before).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => Number.parseInt((await percent.textContent()) ?? "0", 10)).toBeGreaterThan(before);
  await percent.click();
  await expect(percent).toHaveText("100%");
  await page.keyboard.press("-");
  await expect.poll(async () => Number.parseInt((await percent.textContent()) ?? "0", 10)).toBeLessThan(100);
  await page.keyboard.press("0");
  await expect(percent).toHaveText("100%");
  const grid = page.getByRole("button", { name: "Grid" });
  const overview = page.getByRole("button", { name: "Overview" });
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await expect(overview).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".diagram-canvas[data-grid]")).toHaveCount(1);
  await page.keyboard.press("g");
  await expect(grid).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".diagram-canvas[data-grid]")).toHaveCount(0);
  await overview.click();
  await expect(overview).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".react-flow__minimap")).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") || "{}"));
  expect(stored).toMatchObject({ grid: false, minimap: true });
  // the keys stay the field's while typing, and the lists' while one is open
  await page.getByRole("combobox", { name: "Infrastructure" }).click();
  await page.keyboard.press("g");
  await expect(grid).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await page.keyboard.press("f");
  await expect(percent).not.toHaveText("100%");
});

test("a device clicked is named in the address; Escape lets go; the address names a device the page shows", async ({ page }) => {
  await mockApi(page);
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  const card = page.locator(".react-flow__node-card").first();
  const name = await card.getAttribute("data-id");
  await card.click();
  await expect.poll(() => address(page)).toBe(`?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#node=${encodeURIComponent(name ?? "")}`);
  await page.keyboard.press("Escape");
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112");
  await open(page, `${AT_REST}#node=${encodeURIComponent(name ?? "")}`, LIGHT, { token: TOKEN });
  await drawn(page);
  await expect(page.locator(`.react-flow__node-card.selected[data-id="${name}"]`)).toBeVisible();
  // another address (not a hash edit of the open page, which keeps the selection): a device the collection does not hold
  await open(page, "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0105#node=nowhere", LIGHT, { token: TOKEN });
  await drawn(page);
  await expect(page.getByRole("status")).toContainText("nowhere");
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0105");
});

test("without a token the page asks for one; a refused token asks again; the API down is said; a single collection has no band", async ({ page }) => {
  const api = await mockApi(page);
  await open(page, "/next/?infrastructure=demo-dc", LIGHT);
  const field = page.getByLabel("API token");
  await expect(field).toBeVisible();
  await field.fill("wrong");
  await page.keyboard.press("Enter");
  await expect(page.getByText("The API refused this token.")).toBeVisible();
  await field.fill(TOKEN);
  await page.getByRole("button", { name: "Connect" }).click();
  await drawn(page);
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112");
  // the API down
  await page.route("**/api/snapshot**", (route) => route.abort());
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await expect(page.getByText("The API does not answer.")).toBeVisible();
  await page.unroute("**/api/snapshot**");
  // a single collection: no band, no changes
  api.runs = ["demo-0119"];
  await open(page, "/next/?infrastructure=demo-dc", LIGHT, { token: TOKEN });
  await drawn(page);
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119");
  await expect(page.getByRole("group", { name: "Collections" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /changes/ })).toHaveCount(0);
  // the three views are live (Check with brick 7a, the Log with brick 7); the layers to come are reached and say why
  for (const name of ["Diagram", "Check", "Log"]) await expect(page.getByRole("tab", { name })).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("tab", { name: "Diagram" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "L2" }).hover();
  await expect(page.getByRole("tooltip", { name: /in progress/ })).toBeVisible({ timeout: 2000 });
});

test("the home opens an infrastructure in the diagram, and the logo goes back", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, "/next/", LIGHT, { token: TOKEN });
  await page.getByRole("link", { name: "demo-dc" }).click();
  await drawn(page);
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112");
  await page.getByRole("link", { name: "Living Diagram, home" }).click();
  await expect(page.getByRole("table", { name: "Infrastructures" })).toBeVisible();
});

test("the diff tooltip accounts for the total; the changes button shows or hides them on the map", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  const changes = page.getByRole("button", { name: /^\d+ changes$/ });
  const total = Number.parseInt((await changes.textContent()) ?? "0", 10);
  await changes.hover();
  const tip = page.getByRole("tooltip", { name: /since 12 Jan/ });
  await expect(tip).toBeVisible({ timeout: 2000 });
  const counted = ((await tip.textContent()) ?? "").match(/\d+/g)?.reduce((sum, n) => sum + Number(n), 0);
  expect(counted).toBe(total + 12); // every part's count, plus the "12" of the date
  await expect(changes).toHaveAttribute("aria-pressed", "true");
  await changes.click();
  await expect(changes).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#diff=0");
});

test("the overview is an island above the controls; a hundred collections scroll inside the band, which never meets the controls", async ({ page }) => {
  await mockApi(page, { extraRuns: 97 });
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  await dismissToast(page);
  await page.getByRole("button", { name: "Overview" }).click();
  const minimap = page.locator(".react-flow__minimap");
  await expect(minimap).toBeVisible();
  const boxes = await page.evaluate(() => {
    const rect = (el: Element | null) => el?.getBoundingClientRect() ?? null;
    return { minimap: rect(document.querySelector(".react-flow__minimap")), controls: rect(document.querySelector('[data-float="canvas-controls"]')), runs: rect(document.querySelector('[data-float="runs"]')) };
  });
  expect(boxes.minimap?.left).toBeGreaterThanOrEqual(16);
  expect((boxes.controls?.top ?? 0) - (boxes.minimap?.bottom ?? 0)).toBeGreaterThanOrEqual(12);
  // the band: in its place, 12 px at least from the controls, the current run in view, the oldest reachable
  expect(boxes.runs?.left ?? 0).toBeGreaterThanOrEqual((boxes.controls?.right ?? 0) + 12);
  expect(boxes.runs?.right).toBeLessThanOrEqual(1440 - 16);
  const band = page.getByRole("group", { name: "Collections" });
  await expect(band.getByRole("button")).toHaveCount(100);
  await expect(band.getByRole("button", { name: /19 Jan/ })).toBeInViewport();
  await band.getByRole("button", { name: /19 Jan/ }).focus();
  await page.keyboard.press("Home");
  await expect(band.getByRole("button").first()).toBeFocused();
  await expect(band.getByRole("button").first()).toBeInViewport();
  const report = await page.evaluate(audit, LIMITS);
  expect(report.floats.flags, "floating surfaces").toEqual([]);
});

test("Escape closes an open popover and nothing else; the list of collections being read is said; an unknown mode reads as Diagram; a lone first run says why it compares with nothing", async ({ page }) => {
  await mockApi(page, { delayRuns: 1500 });
  await open(page, "/next/?infrastructure=demo-dc#mode=l2", LIGHT, { token: TOKEN });
  // listing: the collection choice is busy, no controls on an empty map
  await expect(page.getByRole("combobox", { name: "Collection", exact: true })).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: /\d+%$/ })).toHaveCount(0);
  await drawn(page);
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112");
  await expect(page.getByRole("tab", { name: "Diagram" })).toHaveAttribute("aria-selected", "true");
  // a device selected, the settings open: Escape closes the popover, the selection stays
  const card = page.locator(".react-flow__node-card").first();
  await card.click();
  await expect.poll(() => address(page)).toMatch(/#node=/);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeHidden();
  expect(await address(page)).toMatch(/#node=/);
  await page.keyboard.press("Escape");
  await expect.poll(() => address(page)).not.toMatch(/#node=/);
  // the first run: nothing earlier to compare with, and the choice says so
  await page.getByRole("group", { name: "Collections" }).getByRole("button", { name: /5 Jan/ }).click();
  await expect.poll(() => address(page)).toBe("?infrastructure=demo-dc&run_id=demo-0105");
  const compare = page.getByRole("combobox", { name: "Compare with an earlier collection" });
  await expect(compare).toHaveAttribute("aria-disabled", "true");
  await compare.hover();
  await expect(page.getByRole("tooltip", { name: /No earlier collection/ })).toBeVisible({ timeout: 2000 });
});
