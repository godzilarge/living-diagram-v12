// Sonde : clavier (anneau de focus, options de liste, en-têtes et lignes de tableau, onglet désactivé), mouvement réduit,
// contraste des contours (≥ 3:1), dans Chromium, clair et sombre.
// Lancer : (vite preview sur 4318, voir geometrie.mjs) puis node ../docs/revues/2026-10-16-squelette-app-sondes/clavier-mouvement.mjs
import { chromium } from "../../../app/node_modules/playwright/index.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:4318";
const browser = await chromium.launch();
const out = {};

async function open(theme, reducedMotion = "no-preference") {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion, locale: "en-GB" });
  await page.addInitScript((t) => localStorage.setItem("ld-prefs", JSON.stringify({ theme: t, accent: "cobalt", lang: "en" })), theme);
  await page.goto(`${BASE}/next/primitives.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  return page;
}

// 1. clavier : la liste ouverte, l'option active a-t-elle un indicateur ≥ 3:1 ?
{
  const page = await open("light");
  const trigger = page.locator(".ui-select-trigger").first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  out.listbox = await page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return { role: el.getAttribute("role"), selected: el.getAttribute("aria-selected"), outline: s.outlineStyle + " " + s.outlineWidth, background: s.backgroundColor };
  });
  await page.keyboard.press("ArrowDown");
  out.listboxNext = await page.evaluate(() => {
    const el = document.activeElement; const s = getComputedStyle(el);
    return { role: el.getAttribute("role"), outline: s.outlineStyle, background: s.backgroundColor };
  });
  // nom accessible du déclencheur contre son texte visible
  out.selectName = await trigger.evaluate((el) => ({ role: el.getAttribute("role"), ariaLabel: el.getAttribute("aria-label"), visible: el.textContent }));
  await page.close();
}

// 2. clavier : une ligne de tableau cliquable est-elle atteignable ?
{
  const page = await open("light");
  out.tableRows = await page.evaluate(() => [...document.querySelectorAll(".ui-table tbody tr")].slice(0, 2).map((tr) => ({ tabIndex: tr.tabIndex, role: tr.getAttribute("role") })));
  const th = page.locator("button.ui-th").first();
  await th.focus();
  await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  out.sortHeaderFocus = await th.evaluate((el) => { const s = getComputedStyle(el); return { focused: document.activeElement === el, outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, offset: s.outlineOffset }; });
  await page.close();
}

// 3. clavier : l'onglet désactivé et sa raison ; le segment
{
  const page = await open("light");
  out.disabledTab = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"][aria-disabled="true"]')][0];
    return { tabIndex: tab.tabIndex, reachable: tab.tabIndex >= 0 };
  });
  const seg = page.locator('.ui-segment[aria-checked="true"]').first();
  await seg.focus();
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowLeft");
  out.segmentFocus = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { cls: document.activeElement.className, offset: s.outlineOffset }; });
  await page.close();
}

// 4. mouvement réduit : durées calculées
for (const motion of ["no-preference", "reduce"]) {
  const page = await open("light", motion);
  out[`motion-${motion}`] = await page.evaluate(() => {
    const tip = document.querySelector(".ui-tooltip");
    const rail = document.querySelector(".ui-rail");
    const pop = document.querySelector(".ui-popover");
    const scrim = document.querySelector(".ui-scrim");
    const spin = document.querySelector(".ui-spin svg");
    return {
      tooltip: getComputedStyle(tip).transitionDuration,
      rail: getComputedStyle(rail, "::after").transitionDuration,
      popover: getComputedStyle(pop).transitionDuration,
      scrimDelay: getComputedStyle(scrim).transitionDelay,
      spinner: spin ? getComputedStyle(spin).animationName + " " + getComputedStyle(spin).animationDuration : null,
      panel: getComputedStyle(document.querySelector(".ui-panel")).transitionDuration,
    };
  });
  // l'infobulle attend-elle toujours 350 ms ?
  const zoom = page.getByRole("button", { name: "Zoom out" });
  await zoom.hover();
  const t0 = Date.now();
  await page.getByRole("tooltip", { name: /Zoom out/ }).waitFor();
  out[`motion-${motion}`].tooltipShownAfterMs = Date.now() - t0;
  await page.close();
}

// 5. contraste des contours (≥ 3:1) : bord de champ, segment choisi sur sa piste, anneau de focus
const lum = (c) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return +((h + 0.05) / (l + 0.05)).toFixed(2); };
const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
for (const theme of ["light", "dark"]) {
  const page = await open(theme);
  const c = await page.evaluate(() => {
    const field = document.querySelector(".ui-field-input");
    const seg = document.querySelector('.ui-segment[aria-checked="true"]');
    const track = seg.parentElement;
    const forced = document.querySelector('.ui-control[data-force="focus"]');
    const paper = getComputedStyle(document.querySelector(".ui-island")).backgroundColor;
    return { fieldBorder: getComputedStyle(field).borderTopColor, paper, segment: getComputedStyle(seg).backgroundColor, track: getComputedStyle(track).backgroundColor, ring: getComputedStyle(forced).outlineColor };
  });
  out[`contours-${theme}`] = {
    "bord de champ / papier": ratio(rgb(c.fieldBorder), rgb(c.paper)),
    "segment choisi / piste": ratio(rgb(c.segment), rgb(c.track)),
    "anneau de focus / papier": ratio(rgb(c.ring), rgb(c.paper)),
  };
  await page.close();
}

console.log(JSON.stringify(out, null, 2));
await browser.close();
