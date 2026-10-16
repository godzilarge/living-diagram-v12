// The primitives in use, in Chromium: the focus ring on everything the keyboard reaches, arrows in the tab strip and
// the segmented choice, a list (Enter, typeahead, Escape, the focus back on its trigger), a popover (Escape, a click
// outside, the focus back), a disabled control that does nothing, a clickable table row, the toast (6 s, paused on
// hover, one at a time), reduced motion.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { LIGHT, open } from "./helpers";

/** What the keyboard focus looks like on the focused element: its outline, or a ring drawn as a shadow. */
const focusLook = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const ring = cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) >= 2;
    return { name: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30), ring: ring || cs.boxShadow !== "none" };
  });

test("every element the keyboard reaches shows the focus ring", async ({ page }) => {
  await open(page, "/next/primitives.html", LIGHT);
  const missing: string[] = [];
  let reached = 0;
  for (let i = 0; i < 90; i++) {
    await page.keyboard.press("Tab");
    const look = await focusLook(page);
    if (!look) continue;
    reached += 1;
    if (!look.ring) missing.push(look.name);
  }
  expect(reached).toBeGreaterThan(60);
  expect(missing).toEqual([]);
});

test("the shell: Tab reaches the tools with the ring; the settings popover closes on Escape and gives the focus back", async ({ page }) => {
  await open(page, "/next/", LIGHT);
  const settings = page.getByRole("button", { name: "Settings" });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const look = await focusLook(page);
    if (look) expect(look.ring, look.name).toBe(true);
  }
  await settings.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settings).toBeFocused();
  await settings.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(600, 600);
  await expect(dialog).toBeHidden();
});

test("arrows: the tab strip selects the enabled tabs and reaches a disabled one; the segmented choice skips it", async ({ page }) => {
  await open(page, "/next/primitives.html", LIGHT);
  const views = page.getByRole("tablist", { name: "View" });
  await views.getByRole("tab", { name: "Diagram" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(views.getByRole("tab", { name: /Control/ })).toHaveAttribute("aria-selected", "true");
  await expect(views.getByRole("tab", { name: /Control/ })).toBeFocused();
  const layers = page.locator('[data-bar="tip-rail-tabs"]');
  await layers.getByRole("tab", { name: "L1" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(layers.getByRole("tab", { name: "L2" })).toBeFocused();
  await expect(layers.getByRole("tab", { name: "L1" })).toHaveAttribute("aria-selected", "true");
  const scope = page.getByRole("radiogroup", { name: "Ports shown" });
  await scope.getByRole("radio", { name: "Cabled" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(scope.getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight");
  await expect(scope.getByRole("radio", { name: "Cabled" })).toHaveAttribute("aria-checked", "true");
});

test("a list: Enter opens it with the ring on the option, typeahead, Enter chooses, Escape closes, the focus comes back", async ({ page }) => {
  await open(page, "/next/primitives.html", LIGHT);
  const trigger = page.locator('[data-bar="context"]').getByRole("combobox", { name: "Infrastructure" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const list = page.locator('[data-layer="infrastructures"]');
  await expect(list).toBeVisible();
  await page.keyboard.press("ArrowDown");
  expect((await focusLook(page))?.ring).toBe(true);
  await page.keyboard.type("s");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(trigger).toHaveText("site-lyon");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("a disabled control does nothing; a clickable row answers the keyboard", async ({ page }) => {
  await open(page, "/next/primitives.html", LIGHT);
  const layers = page.locator('[data-bar="layers"]');
  await layers.getByRole("button", { name: "L2" }).click({ force: true }); // aria-disabled: Playwright would wait
  await expect(layers.getByRole("button", { name: "L1" })).toHaveAttribute("aria-pressed", "true");
  await expect(layers.getByRole("button", { name: "L2" })).toHaveAttribute("aria-pressed", "false");
  const row = page.getByRole("row", { name: /Ethernet1\/2\b/ });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-current", "true");
});

test("a toast hides after 6 s, waits while hovered, and there is one at a time", async ({ page }) => {
  await page.clock.install();
  await open(page, "/next/primitives.html", LIGHT);
  const show = page.getByRole("button", { name: "Show a toast" });
  const host = page.locator(".ui-toast-host [role=status]");
  await show.click();
  await show.click();
  await expect(host).toHaveCount(1);
  await page.clock.runFor(5000);
  await expect(host).toBeVisible();
  await page.clock.runFor(1200);
  await expect(host).toHaveCount(0);
  await show.click();
  await host.hover();
  await page.clock.runFor(8000);
  await expect(host).toBeVisible();
  await page.mouse.move(10, 10);
  await page.clock.runFor(6200);
  await expect(host).toHaveCount(0);
});

test("under reduced motion, transitions take 1 ms and the spinner stops", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "/next/primitives.html", LIGHT);
  const facts = await page.evaluate(() => ({
    tooltip: getComputedStyle(document.querySelector(".ui-tooltip") as Element).transitionDuration,
    rail: getComputedStyle(document.querySelector(".ui-rail") as Element, "::after").transitionDuration,
    spinner: getComputedStyle(document.querySelector(".ui-spin svg") as Element).animationName,
    delay: getComputedStyle(document.documentElement).getPropertyValue("--motion-tooltip-delay").trim(),
  }));
  expect(facts.tooltip.split(", ").every((d) => d === "0.001s")).toBe(true);
  expect(facts.rail).toBe("0.001s");
  expect(facts.spinner).toBe("none");
  expect(Number.parseFloat(facts.delay)).toBe(0);
});
