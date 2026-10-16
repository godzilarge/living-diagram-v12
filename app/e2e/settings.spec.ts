// The settings popover (brick 5) in Chromium, on the synthetic API of e2e/fixtures/: opened from the tools island of
// the diagram and of the home, it is measured against the approved mockup (design/comps/shell/index.html at
// `data-state="settings"`: 72 px from the top, 16 px from the right edge, 8 px of padding, three rows of 40 px, a
// 72 px label in ink-3 at 12 px, the chosen value at 600 in ink, the others in ink-2, a 12 px swatch before each
// accent) in both themes, both accents and French, with its captures; the gear says nothing more while it is open;
// a language chosen changes every word at once (islands, panel, title, `lang`), is stored and read again; the
// keyboard reaches each choice.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { audit } from "./audit";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

const LIMITS = { edge: 16, gap: 12, contrast: 4.5, tooltip: 8 };
test.use({ timezoneId: "UTC" });
const CAPTURES = "e2e/captures";
const AT_REST = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const WITH_DEVICE = `${AT_REST}#node=dc01-acc-03`;
/** The approved mockup's popover: `.popover` (top 72, right 16, padding 8), `.pop-row` (40 px), `.pop-l` (72 px, 8 px
 *  of left padding, ink-3 at `--t-xs` 12 px), `.btn[aria-pressed=true]` (ink, 600), `.sw` (12 px, 3 px radius). */
const MOCKUP = { top: 72, edge: 16, padding: 8, row: 40, rowGap: 4, label: 72, labelPad: 8, labelSize: 12, control: 32, swatch: 12, swatchRadius: 3 };
const VARIANTS = [
  { theme: "light", accent: "cobalt", lang: "en" },
  { theme: "dark", accent: "cobalt", lang: "en" },
  { theme: "light", accent: "ink", lang: "en" },
  { theme: "dark", accent: "ink", lang: "en" },
  { theme: "light", accent: "cobalt", lang: "fr" },
] as const;
/** Where the pointer rests before a capture: the empty map, so that no control shows its hover fill. */
const AWAY = { x: 1100, y: 520 };

async function drawn(page: Page): Promise<void> {
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

async function dismissToast(page: Page): Promise<void> {
  const toast = page.getByRole("status").filter({ has: page.getByRole("button") });
  if (await toast.count()) await toast.getByRole("button").last().click();
  await expect(page.getByRole("status")).toHaveCount(0);
}

async function openDiagram(page: Page, variant: (typeof VARIANTS)[number] | typeof LIGHT, path = AT_REST): Promise<string[]> {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  const problems = await open(page, path, variant, { token: TOKEN });
  await drawn(page);
  await dismissToast(page);
  return problems;
}

const gear = (page: Page, fr = false) => page.getByRole("button", { name: fr ? "Réglages" : "Settings", exact: true });
const dialog = (page: Page, fr = false) => page.getByRole("dialog", { name: fr ? "Réglages" : "Settings", exact: true });
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") ?? "{}") as Record<string, unknown>);

/** A token's colour as the browser says a computed colour. */
const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

/** The popover's geometry and styles, read in the DOM. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const style = (el: Element) => getComputedStyle(el);
    const token = (name: string) => style(document.documentElement).getPropertyValue(name).trim();
    const layer = document.querySelector('[data-layer="settings"]') as HTMLElement;
    const pop = box(layer);
    const rows = Array.from(layer.querySelectorAll(".prefs-row"));
    const labels = rows.map((row) => row.querySelector(".prefs-label") as HTMLElement);
    const buttons = Array.from(layer.querySelectorAll("button"));
    const text = (button: Element) => button.querySelector(".ui-button-text") ?? button;
    const say = (button: Element) => ({ weight: style(text(button)).fontWeight, color: style(button).color, height: box(button).height });
    const swatches = Array.from(layer.querySelectorAll(".prefs-swatch"));
    return {
      top: pop.top,
      right: innerWidth - pop.right,
      padding: style(layer).paddingLeft,
      rows: rows.map((row) => box(row).height),
      rowGaps: rows.slice(1).map((row, i) => box(row).top - box(rows[i]).bottom),
      labels: labels.map((label) => ({ width: box(label).width, paddingLeft: style(label).paddingLeft, size: style(label).fontSize, color: style(label).color })),
      pressed: buttons.filter((button) => button.getAttribute("aria-pressed") === "true").map(say),
      plain: buttons.filter((button) => button.getAttribute("aria-pressed") !== "true").map(say),
      swatches: swatches.map((swatch) => ({ width: box(swatch).width, height: box(swatch).height, radius: style(swatch).borderRadius, color: style(swatch).backgroundColor })),
      tokens: { ink: token("--color-ink"), ink2: token("--color-ink-2"), ink3: token("--color-ink-3"), cobalt: token("--swatch-cobalt"), inkSwatch: token("--swatch-ink") },
    };
  });

function expectMockup(found: Awaited<ReturnType<typeof geometry>>) {
  expect(found.top, "under the tools island").toBe(MOCKUP.top);
  expect(found.right, "on the right edge").toBe(MOCKUP.edge);
  expect(found.padding).toBe(`${MOCKUP.padding}px`);
  expect(found.rows, "three rows of 40 px").toEqual([MOCKUP.row, MOCKUP.row, MOCKUP.row]);
  expect(found.rowGaps).toEqual([MOCKUP.rowGap, MOCKUP.rowGap]);
  for (const label of found.labels) {
    expect(label.width).toBe(MOCKUP.label);
    expect(label.paddingLeft).toBe(`${MOCKUP.labelPad}px`);
    expect(label.size).toBe(`${MOCKUP.labelSize}px`);
    expect(label.color).toBe(rgb(found.tokens.ink3));
  }
  expect(found.pressed, "one chosen value per row").toHaveLength(3);
  for (const button of found.pressed) expect(button).toEqual({ weight: "600", color: rgb(found.tokens.ink), height: MOCKUP.control });
  expect(found.plain).toHaveLength(3);
  for (const button of found.plain) expect(button).toEqual({ weight: "500", color: rgb(found.tokens.ink2), height: MOCKUP.control });
  expect(found.swatches.map((swatch) => [swatch.width, swatch.height, swatch.radius])).toEqual([
    [MOCKUP.swatch, MOCKUP.swatch, `${MOCKUP.swatchRadius}px`],
    [MOCKUP.swatch, MOCKUP.swatch, `${MOCKUP.swatchRadius}px`],
  ]);
  expect(found.swatches.map((swatch) => swatch.color), "each accent's own colour").toEqual([rgb(found.tokens.cobalt), rgb(found.tokens.inkSwatch)]);
}

function expectClean(report: Awaited<ReturnType<typeof audit>>) {
  expect(report.font.archivo, "Archivo is loaded").toBe(true);
  expect(report.bars.flatMap((bar) => bar.flags), "bars").toEqual([]);
  expect(report.floats.flags, "floating surfaces").toEqual([]);
  expect(report.layers.flags, "popovers and lists").toEqual([]);
  expect(report.contrast.flags, "text contrast").toEqual([]);
  expect(report.opacity.flags, "text opacity").toEqual([]);
}

for (const variant of VARIANTS) {
  const tag = `${variant.theme}-${variant.accent}-${variant.lang}`;
  const fr = variant.lang === "fr";

  test(`the settings popover matches the mockup on the diagram, ${tag}`, async ({ page }) => {
    const problems = await openDiagram(page, variant);
    const button = gear(page, fr);
    await button.click();
    await expect(dialog(page, fr)).toBeVisible();
    // one state on the gear: expanded (the rail), never pressed as well
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(button).not.toHaveAttribute("aria-pressed", /./);
    await page.waitForTimeout(400); // the fade ends before it is measured
    // the gear says nothing more while its popover is open: no tooltip over it
    await button.hover();
    await page.waitForTimeout(600);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.mouse.move(AWAY.x, AWAY.y);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${CAPTURES}/settings-${tag}.png` });
    expectMockup(await geometry(page));
    const report = await page.evaluate(audit, LIMITS);
    expect(problems, "console errors and CSP refusals").toEqual([]);
    expect(report.layers.count, "the settings popover").toBe(1);
    expectClean(report);
    // the three choices read as the stored preferences
    const chosen = dialog(page, fr).locator('[aria-pressed="true"]');
    await expect(chosen).toHaveText([
      fr ? "Clair" : "Light",
      variant.accent === "cobalt" ? "cobalt" : fr ? "encre" : "ink",
      fr ? "Français" : "English",
    ].map((word, i) => (i === 0 && variant.theme === "dark" ? (fr ? "Sombre" : "Dark") : word)));
  });
}

test("the settings popover matches the mockup on the home, light and dark", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  const problems = await open(page, "/next/", LIGHT, { token: TOKEN });
  await expect(page.getByRole("table", { name: "Infrastructures" }).locator("tbody tr")).toHaveCount(6);
  await gear(page).click();
  await expect(dialog(page)).toBeVisible();
  await page.waitForTimeout(400);
  expectMockup(await geometry(page));
  await page.screenshot({ path: `${CAPTURES}/settings-home-light.png` });
  await dialog(page).getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(dialog(page), "the popover stays open after a choice").toBeVisible();
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.waitForTimeout(400);
  expectMockup(await geometry(page));
  await page.screenshot({ path: `${CAPTURES}/settings-home-dark.png` });
  expect(problems).toEqual([]);
  expect((await page.evaluate(audit, LIMITS)).contrast.flags).toEqual([]);
  // the language from the home: the page, the tools and the popover speak French at once; stored
  await dialog(page).getByRole("group", { name: "Language" }).getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("table", { name: "Infrastructures" }).getByRole("columnheader", { name: /Dernière collecte/ })).toBeVisible();
  await expect(gear(page, true)).toHaveAttribute("aria-expanded", "true");
  await expect(dialog(page, true).getByRole("group", { name: "Thème" })).toBeVisible();
  expect(await stored(page)).toMatchObject({ theme: "dark", language: "fr" });
});

test("a dark theme stored paints dark before the application loads", async ({ page }) => {
  // the application's chunk held back: the boot script alone has run when the page is looked at
  await page.route(/\/next\/assets\/main-[^/]+\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.addInitScript(() => localStorage.setItem("ld-prefs", JSON.stringify({ theme: "dark", accent: "ink" })));
  await page.goto("/next/", { waitUntil: "commit" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark", { timeout: 1000 });
  await expect(page.locator("html")).toHaveAttribute("data-accent", "ink");
  expect(await page.locator("#root").innerHTML(), "the application has not drawn yet").toBe("");
});

test.describe("a French browser", () => {
  test.use({ locale: "fr-CA" });
  test("nothing chosen: the page speaks the browser's language; a theme chosen leaves the language unchosen", async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    await open(page, AT_REST, LIGHT, { token: TOKEN, prefs: { language: null } });
    await drawn(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("tab", { name: "Diagramme" })).toHaveAttribute("aria-selected", "true");
    await gear(page, true).click();
    await expect(dialog(page, true).getByRole("group", { name: "Langue" }).getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");
    await dialog(page, true).getByRole("group", { name: "Thème" }).getByRole("button", { name: "Sombre" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect((await stored(page)).language, "the browser's choice stays the browser's").toBeNull();
  });
});

test("a language chosen changes every word at once, is stored and read again; so are the theme and the accent", async ({ page }) => {
  await openDiagram(page, LIGHT, WITH_DEVICE);
  await expect(page.getByRole("tab", { name: "Diagram" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveTitle("Diagram of demo-dc");
  const aside = page.getByRole("complementary");
  await expect(aside.getByRole("heading", { name: "Identity" })).toBeVisible();
  await gear(page).click();
  await dialog(page).getByRole("group", { name: "Language" }).getByRole("button", { name: "Français" }).click();
  // the page, the islands, the panel, the title and the popover itself speak French; the popover stays open
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("tab", { name: "Diagramme" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveTitle("Diagramme de demo-dc");
  await expect(aside.getByRole("heading", { name: "Identité" })).toBeVisible();
  await expect(dialog(page, true)).toBeVisible();
  await expect(dialog(page, true).getByRole("group", { name: "Langue" }).getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");
  await expect(gear(page, true)).toHaveAttribute("aria-expanded", "true");
  // the dates and the v1 canvas follow without a reload
  await expect(page.getByRole("group", { name: "Collectes" }).getByRole("button", { name: /19 janv\./ })).toBeVisible();
  await expect(page.locator(".react-flow").getByText(/actif-passif/)).toBeVisible();
  expect((await stored(page)).language).toBe("fr");
  // the theme and the accent: on the page at once, stored
  await dialog(page, true).getByRole("group", { name: "Thème" }).getByRole("button", { name: "Sombre" }).click();
  await dialog(page, true).getByRole("group", { name: "Accent" }).getByRole("button", { name: "encre" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "ink");
  expect(await stored(page)).toMatchObject({ theme: "dark", accent: "ink", language: "fr" });
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${CAPTURES}/settings-switched.png` });
  // read again at the next opening, with no choice made (a new tab of the same browser: `open` would store the
  // test's own preferences before the page loads)
  const again = await page.context().newPage();
  await again.clock.setFixedTime(NOW);
  await again.addInitScript((token) => sessionStorage.setItem("ld-api-token", token), TOKEN); // the token lives in the tab
  await mockApi(again);
  await again.goto(WITH_DEVICE);
  await drawn(again);
  await expect(again.locator("html")).toHaveAttribute("lang", "fr");
  await expect(again.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(again.locator("html")).toHaveAttribute("data-accent", "ink");
  await expect(again.getByRole("tab", { name: "Diagramme" })).toHaveAttribute("aria-selected", "true");
  // back to English from the French popover
  await gear(again, true).click();
  await dialog(again, true).getByRole("group", { name: "Langue" }).getByRole("button", { name: "English" }).click();
  await expect(again.locator("html")).toHaveAttribute("lang", "en");
  await expect(again.getByRole("tab", { name: "Diagram" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog(again)).toBeVisible();
  // the first tab follows the choice made in the second, and a choice made there now writes English back
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("tab", { name: "Diagram" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  expect(await stored(page)).toMatchObject({ language: "en", grid: false });
});

test("the keyboard opens the settings, reaches each choice and picks one; Escape closes and gives the focus back", async ({ page }) => {
  await openDiagram(page, LIGHT);
  const button = gear(page);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog(page).getByRole("button", { name: "Light" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog(page).getByRole("button", { name: "Dark" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(dialog(page).getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog(page).getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");
  // the rows in order: theme, accent, language (French first, as in the mockup)
  await page.keyboard.press("Tab");
  await expect(dialog(page).getByRole("button", { name: "cobalt" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(dialog(page).getByRole("button", { name: "Français" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog(page).getByRole("button", { name: "English" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(button).toBeFocused();
  await expect(page.getByRole("tooltip"), "a focus given back opens no tooltip").toHaveCount(0);
});
