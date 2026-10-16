// TEMPORARY review probe 2 (relecteur-ui, 2026-10-16), deleted after use.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { audit } from "./audit";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

const OUT = process.env.PROBE_OUT ?? "/tmp";
const AT_REST = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const LIMITS = { edge: 16, gap: 12, contrast: 4.5, tooltip: 8 };
test.use({ timezoneId: "UTC" });
const log: Record<string, unknown> = {};
test.afterAll(() => writeFileSync(`${OUT}/probe2.json`, JSON.stringify(log, null, 1)));

async function drawn(page: Page) {
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
}
const flags = (r: Awaited<ReturnType<typeof audit>>) => ({ floats: r.floats.flags, bars: r.bars.flatMap((b) => b.flags), contrast: r.contrast.flags, tips: r.tooltips.flags });

function manyRuns(n: number) {
  const base = JSON.parse(readFileSync("e2e/fixtures/diagram/runs.json", "utf8")).runs as Record<string, string>[];
  const extra = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2025, 10, 1 + i * 2, 2));
    return { ...base[0], run_id: `old-${String(i).padStart(2, "0")}`, run_start: d.toISOString().replace(".000", ""), run_end: null, stored_at: d.toISOString() };
  });
  return { runs: [...extra, ...base] };
}

test("A many runs at 1440", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await page.route("**/api/ingest/bundles**", (route) => route.fulfill({ json: manyRuns(20) }));
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  const r = await page.evaluate(audit, LIMITS);
  log.A = { ...flags(r), band: await page.locator("[data-float=runs]").boundingBox(), ctl: await page.locator("[data-float=canvas-controls]").boundingBox(), docW: await page.evaluate(() => document.documentElement.scrollWidth) };
  await page.screenshot({ path: `${OUT}/A-many-runs.png` });
});

for (const width of [1280, 1199]) {
  test(`B width ${width} fr`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.clock.setFixedTime(NOW);
    await mockApi(page);
    await open(page, AT_REST, { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
    await drawn(page);
    const r = await page.evaluate(audit, LIMITS);
    log[`B${width}`] = flags(r);
    await page.screenshot({ path: `${OUT}/B-${width}.png` });
  });
}

test("D loading", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await page.route("**/api/ingest/bundles**", async (route) => { await new Promise((r) => setTimeout(r, 2500)); await route.fallback(); });
  await open(page, "/next/?infrastructure=demo-dc", LIGHT, { token: TOKEN });
  await page.screenshot({ path: `${OUT}/D-loading-runs.png` });
  log.Dtext = await page.locator("body").innerText();
  log.Dbusy = await page.locator("[aria-busy=true]").count();
});

test("E keyboard tab order and focus ring", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  await page.mouse.click(700, 650);
  const seq: unknown[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    seq.push(await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return `${el.tagName}.${(el.className || "").toString().slice(0, 30)} [${el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30)}] outline=${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`;
    }));
  }
  log.E = seq;
});

test("F escape with the settings popover open keeps the selection", async ({ page }) => {
  await mockApi(page);
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  await page.locator(".react-flow__node-card").first().click();
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => location.hash);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.waitForTimeout(300);
  const focusIn = await page.evaluate(() => (document.activeElement as HTMLElement)?.closest("[data-layer]") !== null);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  log.F = { before, after: await page.evaluate(() => location.hash), focusInLayer: focusIn, popoverOpen: await page.locator("[data-layer=settings]").count() };
  // and with the mouse: open by click then Escape with the focus moved back to the trigger
  await page.getByRole("button", { name: "Settings" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Settings" }).focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  log.F2 = { after: await page.evaluate(() => location.hash), popoverOpen: await page.locator("[data-layer=settings]").count() };
  // compare-with list open, Escape
  await page.locator(".react-flow__node-card").first().click();
  await page.getByRole("combobox", { name: "Compare with an earlier collection" }).click();
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  log.F3 = { after: await page.evaluate(() => location.hash) };
});

test("G disabled tab by arrows shows its reason", async ({ page }) => {
  await mockApi(page);
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  await page.getByRole("tab", { name: "Diagram" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(700);
  log.G = { focused: await page.evaluate(() => document.activeElement?.textContent), tip: await page.getByRole("tooltip").allTextContents(), selected: await page.getByRole("tab", { selected: true }).textContent() };
  // the changes button: Enter
  const before = await page.evaluate(() => location.href);
  await page.getByRole("button", { name: /changes/ }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  log.G2 = { same: before === (await page.evaluate(() => location.href)), disabled: await page.getByRole("button", { name: /changes/ }).getAttribute("aria-disabled") };
});

test("H reduced motion zoom", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page);
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  const t0 = await page.evaluate(() => getComputedStyle(document.querySelector(".react-flow__viewport")!).transform);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(30);
  const t1 = await page.evaluate(() => getComputedStyle(document.querySelector(".react-flow__viewport")!).transform);
  await page.waitForTimeout(600);
  const t2 = await page.evaluate(() => getComputedStyle(document.querySelector(".react-flow__viewport")!).transform);
  const rail = await page.evaluate(() => getComputedStyle(document.querySelector(".ui-run[aria-current=true]")!, "::after").transitionDuration);
  log.H = { t0, t1, t2, rail };
});

test("J api down on the runs list, K a 401 on the snapshot", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/ingest/bundles**", (route) => route.abort());
  await open(page, "/next/?infrastructure=demo-dc", LIGHT, { token: TOKEN });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/J-api-down.png` });
  log.J = await page.locator("body").innerText();
  await page.unroute("**/api/ingest/bundles**");
  await page.route("**/api/snapshot**", (route) => route.fulfill({ status: 401, json: { code: "unauthorized" } }));
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/K-401.png` });
  log.K = await page.locator("body").innerText();
});

test("L a run that fails after one shown", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, AT_REST, LIGHT, { token: TOKEN });
  await drawn(page);
  await page.route("**/api/snapshot**", (route) => route.fulfill({ status: 500, json: { code: "boom" } }));
  await page.getByRole("group", { name: "Collections" }).getByRole("button", { name: /5 Jan/ }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/L-failed.png` });
  log.L = { text: await page.locator("body").innerText(), address: await page.evaluate(() => location.search) };
});

for (const reduced of ["reduce", "no-preference"] as const) {
  test(`H2 zoom timing ${reduced}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced });
    await mockApi(page);
    await open(page, AT_REST, LIGHT, { token: TOKEN });
    await drawn(page);
    const samples = await page.evaluate(async () => {
      const vp = document.querySelector(".react-flow__viewport")!;
      const btn = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Zoom in")!;
      btn.click();
      const out: string[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 400) {
        await new Promise((r) => requestAnimationFrame(r));
        out.push(`${Math.round(performance.now() - t0)}:${getComputedStyle(vp).transform.split(",")[0]}`);
      }
      return out;
    });
    log[`H2-${reduced}`] = samples;
  });
}
