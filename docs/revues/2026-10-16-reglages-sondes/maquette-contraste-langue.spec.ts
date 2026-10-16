// TEMPORARY probes of the brick-5 review (docs/revues/2026-10-16-reglages-sondes/); deleted after the review.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOCKUP = "file://" + join(HERE, "../../design/comps/shell/index.html");
const AT_REST = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const WITH_DEVICE = `${AT_REST}#node=dc01-acc-03`;

async function diagram(page: Page, prefs = LIGHT, path = AT_REST) {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  const problems = await open(page, path, prefs, { token: TOKEN });
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  const toast = page.getByRole("status").filter({ has: page.getByRole("button") });
  if (await toast.count()) await toast.getByRole("button").last().click();
  return problems;
}

/** Measured the same way in the mockup and in the app: popover box, rows, labels, buttons, swatches, rails. */
const measure = (sel: { pop: string; row: string; label: string }) => {
  const s = (el: Element, p?: string) => getComputedStyle(el, p);
  const b = (el: Element) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const pop = document.querySelector(sel.pop)!;
  const rows = [...pop.querySelectorAll(sel.row)];
  return {
    pop: { ...b(pop), border: s(pop).border, radius: s(pop).borderRadius, shadow: s(pop).boxShadow, bg: s(pop).backgroundColor, transition: s(pop).transition, transform: s(pop).transform },
    rows: rows.map((row) => {
      const label = row.querySelector(sel.label)!;
      const buttons = [...row.querySelectorAll("button")];
      return {
        row: b(row),
        label: { ...b(label), text: label.textContent, size: s(label).fontSize, weight: s(label).fontWeight, lh: s(label).lineHeight, color: s(label).color },
        buttons: buttons.map((btn) => {
          const sw = btn.querySelector(".sw, .prefs-swatch");
          const text = btn.querySelector(".ui-button-text") ?? btn;
          const range = document.createRange(); range.selectNodeContents(text); const tr = range.getBoundingClientRect();
          return { ...b(btn), text: btn.textContent, pressed: btn.getAttribute("aria-pressed"), size: s(btn).fontSize, weight: s(text).fontWeight, color: s(btn).color, bg: s(btn).backgroundColor,
            pad: s(btn).padding, textX: Math.round((tr.x - btn.getBoundingClientRect().x) * 10) / 10, textW: Math.round(tr.width * 10) / 10,
            swatch: sw ? { ...b(sw), x: Math.round((sw.getBoundingClientRect().x - btn.getBoundingClientRect().x) * 10) / 10, bg: s(sw).backgroundColor, radius: s(sw).borderRadius } : null,
            rail: { left: s(btn, "::after").left, right: s(btn, "::after").right, bottom: s(btn, "::after").bottom, height: s(btn, "::after").height, bg: s(btn, "::after").backgroundColor, transform: s(btn, "::after").transform, transition: s(btn, "::after").transition } };
        }),
      };
    }),
  };
};

for (const [theme, accent, mAccent] of [["light", "cobalt", "a"], ["dark", "ink", "c"], ["dark", "cobalt", "a"], ["light", "ink", "c"]] as const) {
  test(`mockup vs app, ${theme} ${accent}, French`, async ({ page }) => {
    await page.goto(MOCKUP);
    await page.evaluate(([t, a]) => { const r = document.documentElement; r.dataset.theme = t; r.dataset.accent = a; r.dataset.state = "settings"; }, [theme, mAccent]);
    // the mockup's bench sets aria-pressed on theme/accent from the root's state
    await page.evaluate(([t, a]) => document.querySelectorAll("[data-bench]").forEach((btn) => { const [k, v] = (btn as HTMLElement).dataset.bench!.split(":"); btn.setAttribute("aria-pressed", String(k === "theme" ? v === t : v === a)); }), [theme, mAccent]);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const mock = await page.evaluate(measure, { pop: ".popover.settings", row: ".pop-row", label: ".pop-l" });
    const gearMock = await page.evaluate(() => { const g = document.querySelector(".settings-toggle")!; const s = getComputedStyle(g); return { bg: s.backgroundColor, color: s.color, pressed: g.getAttribute("aria-pressed") }; });
    const app = await page.context().newPage();
    await diagram(app, { theme, accent, lang: "fr" });
    const gear = app.getByRole("button", { name: "Réglages", exact: true });
    await gear.focus();
    await app.keyboard.press("Enter");
    await app.waitForTimeout(400);
    await app.mouse.move(700, 600);
    await app.locator("html").evaluate((el) => (document.activeElement as HTMLElement | null)?.blur());
    await app.waitForTimeout(300);
    const got = await app.evaluate(measure, { pop: '[data-layer="settings"]', row: ".prefs-row", label: ".prefs-label" });
    const gearApp = await gear.evaluate((g) => { const s = getComputedStyle(g); return { bg: s.backgroundColor, color: s.color, pressed: g.getAttribute("aria-pressed"), expanded: g.getAttribute("aria-expanded") }; });
    console.log(JSON.stringify({ theme, accent, mock, got, gearMock, gearApp }));
  });
}

test("contrast of every word and rail of the popover, at rest and under the pointer, four variants", async ({ page }) => {
  const out: unknown[] = [];
  for (const [theme, accent] of [["light", "cobalt"], ["light", "ink"], ["dark", "cobalt"], ["dark", "ink"]] as const) {
    await diagram(page, { theme, accent, lang: "fr" });
    await page.getByRole("button", { name: "Réglages", exact: true }).click();
    await page.waitForTimeout(400);
    const buttons = page.locator('[data-layer="settings"] button');
    const n = await buttons.count();
    for (let i = -1; i < n; i++) {
      if (i >= 0) { await buttons.nth(i).hover(); await page.waitForTimeout(250); } else { await page.mouse.move(700, 600); await page.waitForTimeout(250); }
      const r = await page.evaluate(() => {
        const parse = (c: string) => { const m = c.match(/[\d.]+/g)!.map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
        const lum = (c: { r: number; g: number; b: number }) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const ratio = (a: string, b: string) => { const x = lum(parse(a)), y = lum(parse(b)); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; };
        const pop = document.querySelector('[data-layer="settings"]')!;
        const paper = getComputedStyle(pop).backgroundColor;
        const bgOf = (el: Element): string => { for (let e: Element | null = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (parse(c).a > 0) return c; } return paper; };
        const items = [...pop.querySelectorAll(".prefs-label, button")].map((el) => ({ what: el.textContent, color: getComputedStyle(el).color, bg: bgOf(el), text: ratio(getComputedStyle(el).color, bgOf(el)) }));
        const rails = [...pop.querySelectorAll('button[aria-pressed="true"]')].map((el) => ({ what: el.textContent, rail: ratio(getComputedStyle(el, "::after").backgroundColor, bgOf(el)) }));
        const swatches = [...pop.querySelectorAll(".prefs-swatch")].map((el) => ({ what: el.parentElement?.parentElement?.textContent, sw: ratio(getComputedStyle(el).backgroundColor, bgOf(el)) }));
        return { items, rails, swatches };
      });
      out.push({ theme, accent, hover: i, ...r });
    }
    // the focus ring
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => { const el = document.activeElement!; const s = getComputedStyle(el); return { what: el.textContent, outline: s.outlineStyle + " " + s.outlineWidth + " " + s.outlineColor + " " + s.outlineOffset }; });
    out.push({ theme, accent, ring });
    await page.keyboard.press("Escape");
  }
  console.log(JSON.stringify(out));
});

test("reduced motion: the popover, the rail and the control", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await diagram(page);
  const gear = page.getByRole("button", { name: "Settings", exact: true });
  await gear.click();
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelector('[data-layer="settings"]')?.getAttribute("data-status") === "open");
  const r = await page.evaluate(() => {
    const pop = document.querySelector('[data-layer="settings"]')!;
    const btn = pop.querySelector("button")!;
    return { pop: getComputedStyle(pop).transitionDuration, rail: getComputedStyle(btn, "::after").transitionDuration, control: getComputedStyle(btn).transitionDuration, gearRail: getComputedStyle(document.querySelector('[aria-label="Settings"]')!, "::after").transitionDuration };
  });
  await page.keyboard.press("Escape");
  const t1 = Date.now();
  await page.waitForFunction(() => !document.querySelector('[data-layer="settings"]'));
  console.log(JSON.stringify({ ...r, openMs: Date.now() - t0, closeMs: Date.now() - t1 }));
});

test.describe("a French browser with nothing chosen", () => {
  test.use({ locale: "fr-FR" });
  test("follows the browser, and a theme chosen keeps following it", async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await page.addInitScript((token) => { sessionStorage.setItem("ld-api-token", token); }, TOKEN);
    await mockApi(page);
    await page.goto(AT_REST);
    await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
    const before = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, stored: localStorage.getItem("ld-prefs") }));
    await page.getByRole("button", { name: "Réglages", exact: true }).click();
    const pressedLang = await page.locator('[data-layer="settings"] [aria-pressed="true"]').allTextContents();
    await page.getByRole("button", { name: "Sombre" }).click();
    const after = await page.evaluate(() => localStorage.getItem("ld-prefs"));
    console.log(JSON.stringify({ before, pressedLang, after }));
  });
});

test("Escape in the popover keeps the selection; a click on a chosen value; Tab past the last choice", async ({ page }) => {
  await diagram(page, LIGHT, WITH_DEVICE);
  const aside = page.getByRole("complementary");
  await expect(aside).toBeVisible();
  const gear = page.getByRole("button", { name: "Settings", exact: true });
  await gear.click();
  await page.getByRole("button", { name: "Dark" }).focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const kept = { panel: await aside.isVisible(), hash: await page.evaluate(() => location.hash), focus: await page.evaluate(() => document.activeElement?.getAttribute("aria-label")) };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const second = { hash: await page.evaluate(() => location.hash) };
  await gear.focus();
  await page.keyboard.press("Enter");
  for (let i = 0; i < 7; i++) await page.keyboard.press("Tab");
  await page.waitForTimeout(400);
  const past = { open: await page.locator('[data-layer="settings"]').count(), focus: await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName} ${a.getAttribute("aria-label") ?? a.textContent?.slice(0, 30)}` : null; }) };
  console.log(JSON.stringify({ kept, second, past }));
});

/** The words of the en catalogue that French says otherwise (longer than three letters, no variable). */
function englishOnly(): string[] {
  const dir = join(HERE, "../src/i18n/locales");
  const leaves = (t: Record<string, unknown>, p = ""): [string, string][] => Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [[p + k, v] as [string, string]] : leaves(v as Record<string, unknown>, `${p}${k}.`)));
  const out: string[] = [];
  for (const ns of ["ui", "shell", "home", "diagram", "panel", "search"]) {
    const en = new Map(leaves(JSON.parse(readFileSync(join(dir, "en", `${ns}.json`), "utf8"))));
    const fr = new Map(leaves(JSON.parse(readFileSync(join(dir, "fr", `${ns}.json`), "utf8"))));
    for (const [k, v] of en) if (fr.get(k) !== v && v.length > 3 && !v.includes("{{")) out.push(v);
  }
  return out;
}

const words = (page: Page) => page.evaluate(() => {
  const out = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.textContent?.trim(); if (t) out.add(t); }
  document.querySelectorAll("[aria-label],[title],[placeholder],[aria-description],[alt]").forEach((el) => ["aria-label", "title", "placeholder", "aria-description", "alt"].forEach((a) => { const v = el.getAttribute(a); if (v) out.add(v.trim()); }));
  out.add(document.title);
  return [...out];
});

test("after a switch to French (and on a page opened in French), no English word is left; the dates and the v1 canvas follow", async ({ page }) => {
  await diagram(page, LIGHT, WITH_DEVICE);
  const en = englishOnly();
  const band = page.locator('[data-float] :text("Jan")').first();
  const canvasBefore = await page.locator(".react-flow").evaluate((el) => [...el.querySelectorAll("[aria-label],[title]")].map((x) => x.getAttribute("aria-label") ?? x.getAttribute("title")).concat([...el.querySelectorAll("*")].filter((x) => x.childElementCount === 0).map((x) => x.textContent ?? "")).filter(Boolean).slice(0, 400));
  const bandBefore = await band.textContent().catch(() => null);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Français" }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const leftAfterSwitch = (await words(page)).filter((w) => en.includes(w));
  const canvasAfter = await page.locator(".react-flow").evaluate((el) => [...el.querySelectorAll("[aria-label],[title]")].map((x) => x.getAttribute("aria-label") ?? x.getAttribute("title")).concat([...el.querySelectorAll("*")].filter((x) => x.childElementCount === 0).map((x) => x.textContent ?? "")).filter(Boolean).slice(0, 400));
  const canvasChanged = canvasBefore.filter((w, i) => canvasAfter[i] !== w).map((w, i) => [w, canvasAfter[canvasBefore.indexOf(w)]]).slice(0, 12);
  const bandAfter = await page.locator('[data-float] :text("janv.")').first().textContent().catch(() => null);
  // a page opened in French
  const fresh = await page.context().newPage();
  await diagram(fresh, { theme: "light", accent: "cobalt", lang: "fr" }, WITH_DEVICE);
  const leftFresh = (await words(fresh)).filter((w) => en.includes(w));
  const home = await page.context().newPage();
  await home.clock.setFixedTime(NOW);
  await mockApi(home);
  await open(home, "/next/", { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
  await home.waitForTimeout(500);
  const leftHome = (await words(home)).filter((w) => en.includes(w));
  console.log(JSON.stringify({ leftAfterSwitch, leftFresh, leftHome, bandBefore, bandAfter, canvasChanged, homeTitle: await home.title() }));
});
