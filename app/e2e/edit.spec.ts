// Edit mode (brick 6) in Chromium, on the synthetic API of e2e/fixtures/diagram/ (its intent writes answered by the
// backend's rule, `mockApi`): the pencil (M) enters the mode, the palette shows on the left, the panel and the band
// hide; a device selected gets the mockup's bar above it, with its volets; N inserts a note at the centre of the
// view, whose bar comes with its size list; Ctrl+Z undoes the insertion; the context menu on a right click; the keys
// of the palette win over the grid and the overview; nothing is written without a name, which the user button takes;
// the palette's foot undoes and redoes, and brings a hidden device back (retouch of 2026-10-17); outside the mode a
// drag pans the map, nothing moves; measured (bars, islands, tooltips, contrast) in light, dark and French, with its
// captures.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { audit } from "./audit";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";
import type { ApiMock } from "./helpers";

const LIMITS = { edge: 16, gap: 12, contrast: 4.5, tooltip: 8 };
test.use({ timezoneId: "UTC" });
const CAPTURES = "e2e/captures";
const CORE = "dc01-core-01";
const AT_REST = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const WITH_CORE = `${AT_REST}#node=${CORE}`;
const AUTHOR = "orhan";
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

function expectClean(report: Awaited<ReturnType<typeof audit>>) {
  expect(report.font.archivo, "Archivo is loaded").toBe(true);
  expect(report.bars.flatMap((bar) => bar.flags), "bars").toEqual([]);
  expect(report.floats.flags, "floating surfaces").toEqual([]);
  expect(report.layers.flags, "popovers and lists").toEqual([]);
  expect(report.tooltips.flags, "tooltips").toEqual([]);
  expect(report.contrast.flags, "text contrast").toEqual([]);
  expect(report.opacity.flags, "text opacity").toEqual([]);
}

const pencil = (page: Page, fr: boolean) => page.getByRole("button", { name: fr ? /outils d'édition|Quitter le mode/ : /Edit: editing tools|Leave edit mode/ });
const palette = (page: Page, fr: boolean) => page.getByRole("toolbar", { name: fr ? "Outils d'édition" : "Editing tools" });
const bar = (page: Page, fr: boolean) => page.getByRole("toolbar", { name: fr ? /Actions rapides/ : /Quick actions/ });

type Opened = { problems: string[]; api: ApiMock };
async function openEditing(page: Page, variant: (typeof VARIANTS)[number] | typeof LIGHT, path = WITH_CORE, author = AUTHOR): Promise<Opened> {
  await page.clock.setFixedTime(NOW);
  const api = await mockApi(page);
  const problems = await open(page, path, variant, { token: TOKEN, author });
  await drawn(page);
  await dismissToast(page);
  await page.keyboard.press("m");
  await expect(palette(page, variant.lang === "fr")).toBeVisible();
  return { problems, api };
}

for (const variant of VARIANTS) {
  const tag = `${variant.theme}-${variant.accent}-${variant.lang}`;
  const fr = variant.lang === "fr";

  test(`edit mode with a device selected: palette, bar and volet, measured, ${tag}`, async ({ page }) => {
    const { problems } = await openEditing(page, variant);
    // the mode: the panel and the band gone, the pencil on, the palette's select tool current
    await expect(page.locator(".diagram-panel")).toHaveCount(0);
    await expect(page.getByRole("group", { name: fr ? "Collectes" : "Collections" })).toHaveCount(0);
    await expect(pencil(page, fr)).toHaveAttribute("aria-pressed", "true");
    await expect(palette(page, fr).getByRole("button")).toHaveCount(12);
    // the foot of the palette: hidden devices, undo and redo, each disabled with its reason while it has nothing to do
    for (const name of fr ? ["Équipements masqués", "Annuler", "Rétablir"] : ["Hidden devices", "Undo", "Redo"])
      await expect(palette(page, fr).getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-disabled", "true");
    await expect(palette(page, fr).getByRole("button", { name: fr ? "Sélectionner" : "Select" })).toHaveAttribute("aria-pressed", "true");
    // the device bar above the selected card
    const deviceBar = bar(page, fr);
    await expect(deviceBar).toBeVisible();
    await expect(deviceBar.getByRole("button", { name: fr ? "Épingler la position" : "Pin in place" })).toBeVisible();
    const cardBox = await page.locator(".react-flow__node-card", { hasText: CORE }).boundingBox();
    const barBox = await deviceBar.boundingBox();
    if (!cardBox || !barBox) throw new Error("the card or the bar is not drawn");
    expect(Math.round(cardBox.y - (barBox.y + barBox.height)), "12 px between the bar and its element").toBe(12);
    expect(Math.abs(cardBox.x + cardBox.width / 2 - (barBox.x + barBox.width / 2)), "centred on the element").toBeLessThan(2);
    await page.screenshot({ path: `${CAPTURES}/edit-${tag}.png` });
    // the hue volet opens under its trigger, above the bar
    await deviceBar.getByRole("button", { name: fr ? /^Teinte/ : /^Hue/ }).click();
    const volet = page.locator("[data-layer]").last();
    await expect(volet).toHaveAttribute("data-status", "open");
    await page.waitForTimeout(300); // the rise of the popover ends
    await expect(volet.getByRole("button")).toHaveCount(13);
    const voletBox = await volet.boundingBox();
    if (!voletBox) throw new Error("the volet is not drawn");
    expect(Math.round(barBox.y - (voletBox.y + voletBox.height)), "12 px between the volet and the bar").toBe(12);
    await page.screenshot({ path: `${CAPTURES}/edit-hue-${tag}.png` });
    await page.keyboard.press("Escape");
    await expect(volet).toHaveCount(0);
    // one tooltip on screen, from the palette, so the grammar is measured
    await palette(page, fr).getByRole("button", { name: fr ? "Note" : "Note" }).hover();
    await expect(page.getByRole("tooltip", { name: /Note/ })).toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(200);
    const report = await page.evaluate(audit, LIMITS);
    expect(problems, "console errors and CSP refusals").toEqual([]);
    expect(report.floats.count, "brand, context, views, tools, the palette, the bar, the canvas controls").toBe(7);
    expect(report.tooltips.count).toBe(1);
    expectClean(report);
  });
}

test("N inserts a note at the centre of the view: its bar with the size list; Ctrl+Z undoes it", async ({ page }) => {
  const { api } = await openEditing(page, LIGHT, AT_REST);
  await page.keyboard.press("n");
  await expect(page.locator(".react-flow__node").filter({ hasText: "Note" })).toHaveCount(1, { timeout: 5000 });
  expect(api.ops.map((op) => op.op)).toEqual(["annotation_create"]);
  const noteBar = bar(page, false);
  await expect(noteBar).toBeVisible();
  await expect(noteBar.getByRole("button", { name: "Bold" })).toBeVisible();
  await expect(noteBar.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-disabled", "true");
  await noteBar.getByRole("button", { name: /^Text size/ }).click();
  const sizes = page.locator("[data-layer]").last();
  await expect(sizes).toHaveAttribute("data-status", "open");
  await page.waitForTimeout(300);
  await expect(sizes.getByRole("button", { name: /^\d+$/ })).toHaveCount(7); // the mockup's six and the note's own 13
  await expect(sizes.getByRole("button", { name: "13", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `${CAPTURES}/edit-note-light-cobalt-en.png` });
  await sizes.getByRole("button", { name: "20", exact: true }).click();
  await expect(sizes).toHaveCount(0);
  await expect.poll(() => api.ops.map((op) => op.op)).toEqual(["annotation_create", "annotation_update"]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => api.ops.length).toBe(3);
  await expect(page.getByRole("status")).toContainText(/undone/i); // the first undo is written before the second is asked
  await page.keyboard.press("Control+z");
  await expect(page.locator(".react-flow__node").filter({ hasText: "Note" })).toHaveCount(0, { timeout: 5000 });
});

test("the keys: N and G belong to the palette, M leaves the mode, Escape puts the tool away then lets go", async ({ page }) => {
  await openEditing(page, LIGHT);
  const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") ?? "{}") as { grid?: boolean; minimap?: boolean });
  const before = await prefs();
  await page.keyboard.press("g");
  await expect.poll(() => page.locator(".react-flow__node-frame, .react-flow__node-group").count()).toBeGreaterThanOrEqual(0);
  expect((await prefs()).grid).toBe(before.grid);
  await page.keyboard.press("k");
  await expect(palette(page, false).getByRole("button", { name: "Connector" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(palette(page, false).getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
  await expect(bar(page, false)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bar(page, false)).toHaveCount(0);
  await expect(palette(page, false)).toBeVisible();
  await page.keyboard.press("m");
  await expect(palette(page, false)).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Collections" })).toBeVisible();
});

test("a right click opens the context menu on a device; an entry hides it; Escape closes", async ({ page }) => {
  await openEditing(page, LIGHT);
  await page.locator(".react-flow__node-card", { hasText: CORE }).click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.locator(".react-flow__node-card", { hasText: CORE }).click({ button: "right" });
  await page.getByRole("menuitem", { name: /^hide$/i }).click();
  await expect(page.locator(".react-flow__node-card", { hasText: CORE })).toHaveCount(0);
  expect(await page.evaluate(() => location.hash)).toContain("hide=");
});

test("nothing is written without a name: the page says so; the user button takes the name", async ({ page }) => {
  await openEditing(page, LIGHT, WITH_CORE, "");
  await expect(bar(page, false)).toHaveCount(0);
  await page.keyboard.press("n");
  await expect(page.getByRole("status")).toContainText(/your name/i);
  await page.getByRole("button", { name: "Your name" }).click();
  const field = page.getByRole("textbox", { name: "Your name" });
  await field.fill("Orhan");
  await field.press("Enter");
  await expect(page.getByRole("button", { name: /Orhan, your name/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ld-author"))).toBe("Orhan");
  await expect(bar(page, false)).toBeVisible();
});

test("the bar at the keyboard: Tab from the card reaches it, → walks it, Escape gives the map back and keeps the selection", async ({ page }) => {
  await openEditing(page, LIGHT);
  const deviceBar = bar(page, false);
  await expect(deviceBar).toBeVisible();
  await page.locator(".react-flow__node-card", { hasText: CORE }).focus();
  await page.keyboard.press("Tab");
  await expect(deviceBar.getByRole("button", { name: /^Hue/ })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(deviceBar.getByRole("button", { name: "Pin in place" })).toBeFocused();
  await expect(deviceBar.getByRole("button", { name: "Pin in place" })).toHaveAttribute("aria-keyshortcuts", "P");
  await page.keyboard.press("Escape");
  await expect(deviceBar).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest(".flow-host, .diagram-canvas"))).toBe(true);
});

test("the bar hides during a drag and comes back after; an element dragged out of the zone has no bar until it is back", async ({ page }) => {
  const { api } = await openEditing(page, LIGHT);
  const card = page.locator(".react-flow__node-card", { hasText: CORE });
  const box = await card.boundingBox();
  if (!box) throw new Error("the card is not drawn");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40, { steps: 8 });
  await expect(bar(page, false)).toBeHidden();
  await page.mouse.up();
  await expect(bar(page, false)).toBeVisible();
  await expect.poll(() => api.ops.filter((op) => op.op === "pin").length).toBe(1); // the drag pins the device under the name
  // the view panned until the card leaves the zone: the bar waits
  await page.mouse.move(700, 500);
  await page.mouse.down();
  await page.mouse.move(700, 100, { steps: 10 });
  await page.mouse.move(700, -200, { steps: 10 });
  await page.mouse.up();
  await expect(bar(page, false)).toBeHidden();
  await page.keyboard.press("f");
  await expect(bar(page, false)).toBeVisible();
});

test("P pins, H hides; the group menu adds the device to an existing group by its own id, accepted by the API", async ({ page }) => {
  const { api } = await openEditing(page, LIGHT);
  await page.keyboard.press("p");
  await expect.poll(() => api.ops.map((op) => op.op)).toEqual(["pin"]);
  await expect(bar(page, false).getByRole("button", { name: "Remove the pin" })).toBeVisible();
  // the fixture's intent carries one group: the group button opens its menu, "add to" names the group itself
  await bar(page, false).getByRole("button", { name: "Group" }).click();
  const menu = page.getByRole("menu", { name: "Group" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: /Add to/ }).first().click();
  await expect.poll(() => api.ops.map((op) => op.op)).toEqual(["pin", "group_add"]);
  const added = api.ops[1] as { id: string; members: string[] };
  expect(added.id).toMatch(/^g\d+-\d+$/);
  expect(added.members).toEqual([CORE]);
  await page.keyboard.press("h");
  await expect(page.locator(".react-flow__node-card", { hasText: CORE })).toHaveCount(0);
});

test("read mode moves nothing: a drag on a card pans the whole map, nothing is written", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const api = await mockApi(page);
  await open(page, WITH_CORE, LIGHT, { token: TOKEN, author: AUTHOR });
  await drawn(page);
  await dismissToast(page);
  const writes = api.placements.length; // the fresh devices of the run, memorized at the opening (docs/09)
  const card = page.locator(".react-flow__node-card", { hasText: CORE });
  const other = page.locator(".react-flow__node-card").filter({ hasNotText: CORE }).first();
  const [cardBefore, otherBefore] = [await card.boundingBox(), await other.boundingBox()];
  if (!cardBefore || !otherBefore) throw new Error("the cards are not drawn");
  await page.mouse.move(cardBefore.x + cardBefore.width / 2, cardBefore.y + cardBefore.height / 2);
  await page.mouse.down();
  await page.mouse.move(cardBefore.x + cardBefore.width / 2 + 60, cardBefore.y + cardBefore.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const [cardAfter, otherAfter] = [await card.boundingBox(), await other.boundingBox()];
  if (!cardAfter || !otherAfter) throw new Error("the cards left the screen");
  expect({ dx: Math.round(cardAfter.x - cardBefore.x), dy: Math.round(cardAfter.y - cardBefore.y) }).toEqual({ dx: 60, dy: 60 });
  expect({ dx: Math.round(otherAfter.x - otherBefore.x), dy: Math.round(otherAfter.y - otherBefore.y) }).toEqual({ dx: 60, dy: 60 });
  expect(api.ops).toEqual([]);
  expect(api.placements.length).toBe(writes);
});

test("the palette's foot: Undo takes the inserted note back, Redo brings it back, each disabled when its stack is empty", async ({ page }) => {
  const { api } = await openEditing(page, LIGHT, AT_REST);
  const undo = palette(page, false).getByRole("button", { name: /^Undo/ });
  const redo = palette(page, false).getByRole("button", { name: /^Redo/ });
  await expect(undo).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("n");
  await expect(page.locator(".react-flow__node").filter({ hasText: "Note" })).toHaveCount(1, { timeout: 5000 });
  await expect(undo).not.toHaveAttribute("aria-disabled", "true");
  await expect(redo).toHaveAttribute("aria-disabled", "true");
  await undo.click();
  await expect(page.locator(".react-flow__node").filter({ hasText: "Note" })).toHaveCount(0, { timeout: 5000 });
  await expect(undo).toHaveAttribute("aria-disabled", "true");
  await expect(redo).not.toHaveAttribute("aria-disabled", "true");
  await redo.click();
  await expect(page.locator(".react-flow__node").filter({ hasText: "Note" })).toHaveCount(1, { timeout: 5000 });
  await expect.poll(() => api.ops.map((op) => op.op)).toEqual(["annotation_create", "annotation_delete", "annotation_create"]);
});

test("the palette's foot: H hides the device, the palette lists the rule, choosing it brings the device back selected and in view", async ({ page }) => {
  const { api } = await openEditing(page, LIGHT);
  const hidden = palette(page, false).getByRole("button", { name: /^Hidden devices/ });
  await expect(hidden).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("h");
  await expect(page.locator(".react-flow__node-card", { hasText: CORE })).toHaveCount(0);
  await expect(hidden).toHaveAccessibleName("Hidden devices (1)");
  await hidden.click();
  const menu = page.getByRole("menu", { name: /^Hidden devices/ });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(2); // the one rule (the device's name), "Show all"
  await menu.getByRole("menuitem", { name: CORE }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".react-flow__node-card", { hasText: CORE })).toBeVisible();
  await expect(page.locator(".react-flow__node-card.selected", { hasText: CORE })).toHaveCount(1); // back in view, selected
  await expect(hidden).toHaveAttribute("aria-disabled", "true");
});

test("rules written in the address: one row per rule with its count; a rule lifts as a whole; Show all lifts them, memorized once", async ({ page }) => {
  // two devices by name, the external one by kind; opened with the rules, the three are never placed nor memorized
  const rules = `hide=${encodeURIComponent("^(dc01-acc-01|dc01-acc-03)$")}&hide=${encodeURIComponent("kind:external")}`;
  const { api } = await openEditing(page, LIGHT, `${AT_REST}#${rules}`);
  await expect(page.locator(".react-flow__node-card")).toHaveCount(5);
  const writes = api.placements.length; // the five shown, memorized at the opening
  const hidden = palette(page, false).getByRole("button", { name: /^Hidden devices/ });
  const menu = page.getByRole("menu", { name: /^Hidden devices/ });
  await expect(hidden).toHaveAccessibleName("Hidden devices (3)");
  await hidden.click();
  const rows = menu.getByRole("menuitem");
  await expect(rows).toHaveCount(3); // the two names, the expression with its count, "Show all"
  await expect(rows.nth(0)).toContainText("dc01-acc-01");
  await expect(rows.nth(0)).toContainText("dc01-acc-03");
  await expect(rows.nth(1)).toContainText("kind:external");
  await expect(rows.nth(1)).toContainText("1");
  await page.screenshot({ path: `${CAPTURES}/edit-hidden-light-cobalt-en.png` });
  // the expression lifted alone: the external device is back, the two named stay hidden
  await rows.nth(1).click();
  await expect(menu).toHaveCount(0);
  await expect(hidden).toHaveAccessibleName("Hidden devices (2)");
  expect(page.url()).not.toMatch(/external/);
  expect(page.url()).toMatch(/hide=/);
  await hidden.click();
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await menu.getByRole("menuitem", { name: "Show all" }).click();
  await expect(menu).toHaveCount(0);
  await page.keyboard.press("f"); // the view fits the whole run: the canvas draws the visible cards only
  await expect(page.locator(".react-flow__node-card")).toHaveCount(8, { timeout: 5000 });
  await expect(hidden).toHaveAttribute("aria-disabled", "true");
  expect(page.url()).not.toMatch(/hide=/);
  // the devices placed fresh are memorized once per lift (the external one, then the two named): the document grows
  // (the API keeps what it has), no storm
  await expect.poll(() => api.placements.length).toBe(writes + 2);
  await page.waitForTimeout(500);
  expect(api.placements.length).toBe(writes + 2);
});
