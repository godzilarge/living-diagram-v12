// The primitives in use, in Chromium: the focus ring on everything the keyboard reaches, arrows in the tab strip and
// the segmented choice, a list (Enter, typeahead, Escape, the focus back on its trigger), a popover (Escape, a click
// outside, the focus back), a disabled control that does nothing, a clickable table row, the toast (6 s, paused on
// hover, one at a time), reduced motion; the home's token, its links reached and opened by the keyboard, a 401 at load
// and on a diff; the home's grid that never scrolls (14 infrastructures, long names); its tables sorted by their
// headers and filtered by state, a widget's settings (rows stored in `ld-prefs`, read again), the diffs read only for
// the rows on screen (a hundred collections), the headers at 1280 in French.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { infrastructuresFixture, LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

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

test("the home: Tab reaches the tools with the ring; the settings popover closes on Escape and gives the focus back", async ({ page }) => {
  await mockApi(page);
  await open(page, "/next/", LIGHT, { token: TOKEN });
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const look = await focusLook(page);
    if (look) expect(look.ring, look.name).toBe(true);
  }
  await settings.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
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

test("the home: no token asks for one; Enter connects; a row opens its infrastructure; a 401 asks again", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const api = await mockApi(page);
  await open(page, "/next/", LIGHT);
  const field = page.getByRole("textbox", { name: "API token" });
  await expect(field).toBeVisible();
  await expect(page.getByRole("table", { name: "Infrastructures" })).toHaveCount(0);
  await page.screenshot({ path: "e2e/captures/home-no-token.png" });
  await field.fill("wrong");
  await page.keyboard.press("Enter");
  await expect(page.getByText("The API refused this token. Check it and try again.")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("ld-api-token"))).toBeNull();
  await field.fill(TOKEN);
  await page.keyboard.press("Enter");
  const table = page.getByRole("table", { name: "Infrastructures" });
  await expect(table.locator("tbody tr")).toHaveCount(6);
  expect(await page.evaluate(() => sessionStorage.getItem("ld-api-token"))).toBe(TOKEN);
  // the keyboard reaches the name's link, never the row; Enter opens the infrastructure on its last good collection
  const first = table.locator("tbody tr").first();
  expect(await table.locator("tbody tr[tabindex]").count()).toBe(0);
  const link = first.getByRole("link", { name: "campus-rennes" });
  await expect(link).toHaveAttribute("href", "/next/?infrastructure=campus-rennes&run_id=rennes-0118");
  for (let i = 0; i < 12 && !(await link.evaluate((a) => a === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  expect((await focusLook(page))?.ring).toBe(true);
  // the last collection failed: the row shows the last good one's date and says the failure in red
  await expect(first).toContainText("18 Jan, 04:00");
  await expect(first.locator('td').nth(3).locator('.ui-state[data-tone="error"]')).toHaveText("Failed on 19 Jan");
  // Enter opens the infrastructure in the v2's diagram (brick 2), on the collection the row shows
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname === "/next/" && url.searchParams.has("infrastructure"));
  expect(new URL(page.url()).search).toBe("?infrastructure=campus-rennes&run_id=rennes-0118");
  // a click elsewhere on a row follows the same address
  await page.goto("/next/");
  await table.locator("tbody tr").nth(1).locator("td").nth(3).click();
  await page.waitForURL((url) => url.searchParams.get("run_id") === "wan-0119");
  // back on the home, a token revoked meanwhile: the field comes back
  api.refuse = true;
  await page.goto("/next/");
  await expect(field).toBeVisible();
  await expect(page.getByText("The API refused this token. Check it and try again.")).toBeVisible();
});

test("the home: a token revoked after the page showed, on a diff, asks for it again", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const api = await mockApi(page, { refuseDiffs: true });
  await open(page, "/next/", LIGHT, { token: TOKEN });
  await expect(page.getByRole("textbox", { name: "API token" })).toBeVisible();
  await expect(page.getByText("The API refused this token. Check it and try again.")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("ld-api-token"))).toBeNull();
  expect(api.calls.some((call) => call.startsWith("/api/diff"))).toBe(true);
});

/** Fourteen infrastructures, some with a 60-character name: the fixture's six, then eight more. */
function many(long: boolean) {
  const base = infrastructuresFixture();
  const extra = Array.from({ length: 8 }, (_, i) => {
    const name = long ? `site-${i}-${"x".repeat(53)}` : `site-${i}`;
    return { ...base.infrastructures[3], infrastructure: name, recent_runs: [] };
  });
  return { ...base, infrastructures: [...base.infrastructures, ...extra] };
}

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`the home never scrolls at ${size.width} × ${size.height}: 14 infrastructures, both left widgets with 3 rows at least`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await page.setViewportSize(size);
    await mockApi(page, { infrastructures: many(true) });
    await page.goto("/next/");
    await page.evaluate((token) => sessionStorage.setItem("ld-api-token", token), TOKEN);
    await page.reload();
    const infra = page.getByRole("table", { name: "Infrastructures" });
    await expect(infra.locator("tbody tr")).toHaveCount(14);
    const facts = await page.evaluate(() => {
      const visibleRows = (name: string) => {
        const body = document.querySelector(`[data-float="${name}"] .ui-widget-body`) as HTMLElement;
        const box = body.getBoundingClientRect();
        return [...body.querySelectorAll("tbody tr")].filter((tr) => {
          const r = tr.getBoundingClientRect();
          return r.top >= box.top && r.bottom <= box.bottom + 1;
        }).length;
      };
      const widget = document.querySelector('[data-float="infrastructures"]') as HTMLElement;
      const check = widget.querySelector("thead th:nth-child(5)") as HTMLElement;
      const name = [...widget.querySelectorAll("tbody td:first-child")].find((td) => (td.textContent ?? "").length > 50) as HTMLElement;
      const link = name.querySelector("a") as HTMLElement;
      return {
        scroll: document.documentElement.scrollHeight,
        inner: window.innerHeight,
        infraRows: visibleRows("infrastructures"),
        runsRows: visibleRows("collections"),
        checkInside: check.getBoundingClientRect().right <= widget.getBoundingClientRect().right,
        overflowX: (widget.querySelector(".ui-widget-body") as HTMLElement).scrollWidth > (widget.querySelector(".ui-widget-body") as HTMLElement).clientWidth,
        nameCut: name.scrollWidth > name.clientWidth || link.scrollWidth > name.clientWidth,
      };
    });
    expect(facts.scroll).toBe(facts.inner);
    expect(facts.infraRows).toBeGreaterThanOrEqual(3);
    expect(facts.runsRows).toBeGreaterThanOrEqual(3);
    expect(facts.checkInside).toBe(true);
    expect(facts.overflowX).toBe(false);
    expect(facts.nameCut).toBe(true);
    await page.screenshot({ path: `e2e/captures/home-fourteen-${size.width}x${size.height}.png` });
  });
}

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

test("a disabled control does nothing; a clickable row answers Enter and Space", async ({ page }) => {
  await open(page, "/next/primitives.html", LIGHT);
  const layers = page.locator('[data-bar="layers"]');
  await layers.getByRole("button", { name: "L2" }).click({ force: true }); // aria-disabled: Playwright would wait
  await expect(layers.getByRole("button", { name: "L1" })).toHaveAttribute("aria-pressed", "true");
  await expect(layers.getByRole("button", { name: "L2" })).toHaveAttribute("aria-pressed", "false");
  const row = page.getByRole("row", { name: /Ethernet1\/2\b/ });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-current", "true");
  const next = page.getByRole("row", { name: /Ethernet1\/3\b/ });
  await next.focus();
  await page.keyboard.press(" ");
  await expect(next).toHaveAttribute("aria-current", "true");
  await expect(row).not.toHaveAttribute("aria-current", "true");
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

/** The names of a table's rows, top to bottom. */
const firstCells = (page: Page, table: string) => page.getByRole("table", { name: table }).locator("tbody tr td:first-child").allInnerTexts();

test("the home: a column header sorts its table, by the keyboard too, and says it with aria-sort", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, "/next/", LIGHT, { token: TOKEN });
  const infra = page.getByRole("table", { name: "Infrastructures" });
  expect(await firstCells(page, "Infrastructures")).toEqual(["campus-rennes", "wan-core", "demo-dc", "site-lyon", "site-nantes", "lab-sec"]);
  const name = infra.getByRole("button", { name: "Name" });
  await name.click();
  await expect(infra.locator("th").first()).toHaveAttribute("aria-sort", "ascending");
  expect(await firstCells(page, "Infrastructures")).toEqual(["campus-rennes", "demo-dc", "lab-sec", "site-lyon", "site-nantes", "wan-core"]);
  await name.press("Enter");
  await expect(infra.locator("th").first()).toHaveAttribute("aria-sort", "descending");
  expect((await firstCells(page, "Infrastructures"))[0]).toBe("wan-core");
  expect((await focusLook(page))?.ring).toBe(true);
  // the state by severity: failed, late, partial, then succeeded; the header it left says none
  await infra.getByRole("button", { name: "Collection status" }).click();
  await expect(infra.locator("th").first()).toHaveAttribute("aria-sort", "none");
  expect(await firstCells(page, "Infrastructures")).toEqual(["campus-rennes", "lab-sec", "demo-dc", "site-nantes", "wan-core", "site-lyon"]);
  await infra.getByRole("button", { name: "To check" }).click();
  await infra.getByRole("button", { name: "To check" }).click();
  expect((await firstCells(page, "Infrastructures"))[0]).toBe("demo-dc");
  // the latest collections by result, failed first
  const runs = page.getByRole("table", { name: "Latest collections" });
  await runs.getByRole("button", { name: "Result" }).click();
  await expect(runs.locator("tbody tr").first().locator(".ui-state")).toHaveText("Failed");
  await runs.getByRole("button", { name: "Date" }).click();
  await expect(runs.locator("tbody tr").first()).toContainText("18 Jan, 04:00");
});

test("the home: the filter keeps the rows of one state, the arrows move it, the count stays the total, zero says nothing matches", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const base = infrastructuresFixture();
  await mockApi(page, { infrastructures: { ...base, infrastructures: base.infrastructures.slice(0, 2) } });
  await open(page, "/next/", LIGHT, { token: TOKEN });
  const widget = page.locator('[data-float="infrastructures"]');
  const filter = page.getByRole("radiogroup", { name: "Filter by collection status" });
  await expect(filter.getByRole("radio")).toHaveText(["All2", "Succeeded1", "Partial0", "Failed1", "Late0"]);
  await filter.getByRole("radio", { name: "Failed, 1" }).click();
  await expect(widget.locator("tbody tr")).toHaveCount(1);
  await expect(widget.locator("tbody tr")).toContainText("campus-rennes");
  await expect(widget.locator(".ui-widget-count")).toHaveText("2");
  await page.keyboard.press("ArrowRight");
  await expect(filter.getByRole("radio", { name: "Late, 0" })).toHaveAttribute("aria-checked", "true");
  await expect(filter.getByRole("radio", { name: "Late, 0" })).toBeFocused();
  await expect(widget.getByText("No infrastructure matches.")).toBeVisible();
  await expect(widget.locator("table")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(widget.locator("tbody tr")).toHaveCount(2);
  // the latest collections filter on their result, without "late": a collection is never late
  const runs = page.getByRole("radiogroup", { name: "Filter by result" });
  await expect(runs.getByRole("radio")).toHaveText(["All4", "Succeeded3", "Partial0", "Failed1"]);
  await runs.getByRole("radio", { name: "Failed, 1" }).click();
  await expect(page.getByRole("table", { name: "Latest collections" }).locator("tbody tr")).toHaveCount(1);
  await page.screenshot({ path: "e2e/captures/home-filter.png" });
});

test("the home: a widget's settings choose how many rows it lists, stored in the browser, read again; Escape gives the focus back", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const api = await mockApi(page);
  await open(page, "/next/", LIGHT, { token: TOKEN });
  const runsWidget = page.locator('[data-float="collections"]');
  await expect(runsWidget.locator("tbody tr")).toHaveCount(6);
  const gear = runsWidget.getByRole("button", { name: "Widget settings" });
  await gear.click();
  const dialog = page.getByRole("dialog", { name: "Widget settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Show the last collections" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "6" })).toHaveAttribute("aria-pressed", "true");
  // under the header, aligned on the widget's right edge
  const [head, box, widget] = await Promise.all([runsWidget.locator(".ui-widget-head").boundingBox(), dialog.boundingBox(), runsWidget.boundingBox()]);
  expect(Math.round((box?.y ?? 0) - ((head?.y ?? 0) + (head?.height ?? 0)))).toBe(8);
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) - ((widget?.x ?? 0) + (widget?.width ?? 0)))).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "e2e/captures/home-settings.png" });
  await dialog.getByRole("button", { name: "25" }).click();
  await expect(dialog.getByRole("button", { name: "25" })).toHaveAttribute("aria-pressed", "true");
  await expect(runsWidget.locator("tbody tr")).toHaveCount(25);
  expect(api.calls).toContain("/api/infrastructures?recent=25");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") ?? "{}").homeRuns)).toBe(25);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(gear).toBeFocused();
  // the modifications: their own choices, the journal read again with its limit
  const changes = page.locator('[data-float="modifications"]').getByRole("button", { name: "Widget settings" });
  await changes.click();
  await page.getByRole("dialog", { name: "Widget settings" }).getByRole("button", { name: "50" }).click();
  await expect.poll(() => api.calls.includes("/api/intent/journal?limit=50")).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ld-prefs") ?? "{}").homeChanges)).toBe(50);
});

test("the home: with a hundred collections, only the diffs of the rows on screen are asked, one at a time", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const api = await mockApi(page);
  await open(page, "/next/", LIGHT, { token: TOKEN, prefs: { homeRuns: 100 } });
  const widget = page.locator('[data-float="collections"]');
  await expect(widget.locator("tbody tr")).toHaveCount(100);
  const onScreen = () =>
    widget.evaluate((section) => {
      const body = section.querySelector(".ui-widget-body") as HTMLElement;
      const box = body.getBoundingClientRect();
      const rows = [...body.querySelectorAll("tbody tr")].filter((tr) => {
        const r = tr.getBoundingClientRect();
        return r.bottom > box.top && r.top < box.bottom;
      });
      return { rows: rows.length, pending: rows.filter((tr) => tr.querySelector('[aria-busy="true"]')).length };
    });
  const diffs = () => api.calls.filter((call) => call.startsWith("/api/diff"));
  await expect.poll(async () => (await onScreen()).pending).toBe(0);
  const first = await onScreen();
  expect(first.rows).toBeGreaterThan(3);
  expect(diffs().length).toBeGreaterThan(0);
  expect(diffs().length).toBeLessThanOrEqual(first.rows);
  // scrolled to the end: the rows that came into view are read, never the ones scrolled past
  await widget.locator(".ui-widget-body").evaluate((body) => body.scrollTo({ top: body.scrollHeight }));
  await expect.poll(async () => (await onScreen()).pending).toBe(0);
  const end = await onScreen();
  expect(diffs().length).toBeLessThanOrEqual(first.rows + end.rows);
  expect(diffs().length).toBeLessThan(40);
  const last = JSON.parse((await widget.locator("tbody tr").last().getAttribute("data-row")) ?? "[]") as string[];
  expect(diffs().some((call) => call.endsWith(`to=${last[1]}`))).toBe(true);
  expect(new Set(diffs()).size).toBe(diffs().length);
  expect(api.mostDiffsInFlight).toBe(1);
});

test("the home at 1280 in French: the filters and the settings fit their headers, the words whole", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1280, height: 720 });
  await mockApi(page);
  await open(page, "/next/", { ...LIGHT, lang: "fr" }, { token: TOKEN });
  await expect(page.getByRole("table", { name: "Infrastructures" }).locator("tbody tr")).toHaveCount(6);
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll(".ui-widget-head")].map((head) => {
      const title = (head.querySelector("h2") as HTMLElement).getBoundingClientRect();
      const count = head.querySelector(".ui-widget-count")?.getBoundingClientRect();
      const tools = head.querySelector(".ui-widget-tools")?.getBoundingClientRect();
      const h = head.getBoundingClientRect();
      const cut = [...head.querySelectorAll(".ui-segment")].filter((s) => s.scrollWidth > s.clientWidth).length;
      return { room: tools ? tools.left - Math.max(title.right, count?.right ?? 0) : null, inside: tools ? h.right - tools.right : null, cut, over: head.scrollWidth > head.clientWidth };
    }),
  );
  for (const head of heads.filter((h) => h.room !== null)) {
    expect(head.room).toBeGreaterThanOrEqual(8);
    expect(head.inside).toBeGreaterThanOrEqual(12);
    expect(head.cut).toBe(0);
    expect(head.over).toBe(false);
  }
  await page.screenshot({ path: "e2e/captures/home-1280-fr.png" });
});
