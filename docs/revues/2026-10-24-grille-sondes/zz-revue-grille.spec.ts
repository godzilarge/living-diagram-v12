// Sondes de la revue « grille » (2026-10-24). À copier dans app/e2e/, puis depuis app/ :
//   npx playwright test e2e/zz-revue-grille.spec.ts
// Écrit mesures.txt et des PNG dans docs/revues/2026-10-24-grille-sondes/. Ne vérifie rien : il mesure et consigne.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mockApi, open, TOKEN } from "./helpers";

const OUT = "../docs/revues/2026-10-24-grille-sondes";
const LOG = `${OUT}/mesures.txt`;
const CHECK = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#mode=control";
mkdirSync(OUT, { recursive: true });
writeFileSync(LOG, "");
const log = (...parts: unknown[]) => appendFileSync(LOG, parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ") + "\n");

const VARIANTS = [
  { theme: "light", accent: "cobalt", lang: "fr" },
  { theme: "dark", accent: "cobalt", lang: "fr" },
  { theme: "light", accent: "ink", lang: "fr" },
  { theme: "dark", accent: "ink", lang: "fr" },
] as const;
const FR = VARIANTS[0];

async function shown(page: Page) {
  await page.locator("tr.ui-register-row").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);
}
const box = async (page: Page, id: string) => (await page.locator(`[data-float="${id}"]`).boundingBox())!;
const grip = async (page: Page, id: string) => {
  const t = (await page.locator(`[data-float="${id}"] .ui-widget-head h2`).boundingBox())!;
  return { x: t.x + 20, y: t.y + t.height / 2 };
};
async function carry(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.waitForTimeout(250);
}

/** Contrast of two computed colours (rgb/rgba strings), the second opaque. */
const CONTRAST = `(() => {
  const parse = (s) => s.match(/[\\d.]+/g).map(Number);
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const blend = (fg, bg) => { const a = fg.length > 3 ? fg[3] : 1; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };
  return (fg, bg) => { const b = parse(bg); const f = blend(parse(fg), b); const [hi, lo] = [lum(f), lum(b)].sort((x, y) => y - x); return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };
})()`;

for (const v of VARIANTS) {
  test(`S1 contrastes des éléments nouveaux, ${v.theme}-${v.accent}`, async ({ page }) => {
    await mockApi(page);
    await open(page, CHECK, v, { token: TOKEN });
    await shown(page);
    const m = await page.evaluate((src) => {
      const ratio = eval(src);
      const css = (el: Element, p: string) => getComputedStyle(el).getPropertyValue(p);
      const tok = (n: string) => { const i = document.createElement("i"); i.style.color = `var(${n})`; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; };
      const paper = tok("--color-paper"), ground = tok("--color-ground");
      const label = document.querySelector(".ui-register-group-label")!;
      const count = document.querySelector(".ui-register-group-count")!;
      const bg = css(document.querySelector('[data-float="verdicts"]')!, "background-color");
      return {
        theme: document.documentElement.dataset.theme,
        sectionLabel: [css(label, "color"), ratio(css(label, "color"), bg)],
        sectionCount: [css(count, "color"), ratio(css(count, "color"), bg)],
        cornerL_ink3_on_paper: ratio(tok("--color-ink-3"), paper),
        cornerL_ink_on_paper: ratio(tok("--color-ink"), paper),
        placeholder_line2_on_ground: ratio(tok("--color-line-2"), ground),
        placeholder_line2_on_paper: ratio(tok("--color-line-2"), paper),
        placeholder_error_on_ground: ratio(tok("--color-error"), ground),
        placeholder_error_on_paper: ratio(tok("--color-error"), paper),
      };
    }, CONTRAST);
    log("S1 CONTRASTE", `${v.theme}-${v.accent}`, m);
  });
}

test("S2 le L des coins : géométrie, rayon, comparée au banc", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await open(page, CHECK, FR, { token: TOKEN });
  await shown(page);
  const b = await box(page, "coverage");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const item = document.querySelector('[data-tile="coverage"]')!.getBoundingClientRect();
    const h = document.querySelector('[data-tile="coverage"] > .react-resizable-handle-se')!;
    const r = h.getBoundingClientRect();
    const s = getComputedStyle(h, "::before");
    const w = parseFloat(s.width), right = parseFloat(s.right), bottom = parseFloat(s.bottom);
    return {
      handle: { fromRight: +(item.right - r.right).toFixed(1), fromBottom: +(item.bottom - r.bottom).toFixed(1), w: r.width, h: r.height, opacity: getComputedStyle(h).opacity },
      L: { size: s.width + "×" + s.height, right: s.right, bottom: s.bottom, stroke: s.borderRightWidth + "/" + s.borderBottomWidth, radius: s.borderBottomRightRadius, color: s.borderRightColor,
        outerCornerFromTileCorner: +(item.right - (r.right - right)).toFixed(1), straightPart: +(w - parseFloat(s.borderBottomRightRadius)).toFixed(1) },
    };
  });
  log("S2 COIN brique", m);
  log("S2 COIN banc (bench.css:52,60) : poignée à 2 px du coin, L à 3 px dans la poignée = 5 px du coin, rayon 3 px, partie droite 4 px");
  await page.screenshot({ path: `${OUT}/coin-brique-x1.png`, clip: { x: b.x + b.width - 40, y: b.y + b.height - 40, width: 48, height: 48 } });
  // the same corner at DPR 4
  const ctx = await page.context().browser()!.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4, locale: "en-GB", timezoneId: "UTC" });
  const p2 = await ctx.newPage();
  await mockApi(p2);
  await open(p2, CHECK, FR, { token: TOKEN });
  await shown(p2);
  const b2 = await box(p2, "coverage");
  await p2.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await p2.waitForTimeout(300);
  await p2.screenshot({ path: `${OUT}/coin-brique-x4.png`, clip: { x: b2.x + b2.width - 24, y: b2.y + b2.height - 24, width: 28, height: 28 } });
  await ctx.close();
});

test("S3 aucun style en ligne autre que la géométrie de la bibliothèque", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, FR, { token: TOKEN });
  await shown(page);
  const idle = await page.evaluate(() => [...document.querySelectorAll("main [style]")].map((el) => `${el.className}: ${el.getAttribute("style")}`));
  log("S3 STYLE au repos", idle);
  const v = await box(page, "verdicts");
  await carry(page, await grip(page, "sources"), { x: v.x + 200, y: v.y + 240 });
  const during = await page.evaluate(() => [...document.querySelectorAll("main [style]")].map((el) => `${String(el.className).slice(0, 60)}: ${el.getAttribute("style")}`));
  log("S3 STYLE pendant un glissé", during);
  await page.mouse.up();
});

test("S4 pendant un glissé, rien d'autre ne bouge ni ne s'anime ; puis 240 ms", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, FR, { token: TOKEN });
  await shown(page);
  const others = ["verdicts", "coverage", "delivery"];
  const before = await Promise.all(others.map((id) => box(page, id)));
  const v = await box(page, "verdicts");
  await carry(page, await grip(page, "sources"), { x: v.x + 200, y: v.y + 240 });
  const after = await Promise.all(others.map((id) => box(page, id)));
  const anims = await page.evaluate(() => [...document.querySelectorAll(".ui-tiles-item")].map((el) => [el.getAttribute("data-tile"), el.getAnimations().length, getComputedStyle(el).transitionDuration]));
  log("S4 GLISSÉ autres tuiles déplacées (px)", others.map((id, i) => [id, Math.abs(after[i].x - before[i].x) + Math.abs(after[i].y - before[i].y)]));
  log("S4 GLISSÉ animations / durée de transition par tuile", anims);
  await page.mouse.up();
  await page.waitForTimeout(40);
  const back = await page.evaluate(() => { const el = document.querySelector('[data-tile="sources"]')!; return [el.getAnimations().map((a) => (a as CSSTransition).transitionProperty), getComputedStyle(el).transitionDuration, getComputedStyle(el).transitionTimingFunction]; });
  log("S4 REFUS retour (40 ms après le lâcher) transitions en cours, durée, ease", back);
});

test("S5 mouvement réduit : tuiles, Agrandir, poignées", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page);
  await open(page, CHECK, FR, { token: TOKEN });
  await shown(page);
  const item = await page.evaluate(() => { const el = document.querySelector(".ui-tiles-item")!; const h = el.querySelector(".react-resizable-handle")!; return [getComputedStyle(el).transitionDuration, getComputedStyle(h).transitionDuration]; });
  await page.locator('[data-float="coverage"]').getByRole("button", { name: "Agrandir" }).click();
  const anim = await page.evaluate(() => document.querySelector('[data-tile="coverage"]')!.getAnimations().map((a) => a.effect?.getTiming()));
  log("S5 RÉDUIT transition tuile / poignée", item, "animation Agrandir", anim);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.locator('[data-float="coverage"]').getByRole("button", { name: "Agrandir" }).click();
  const anim2 = await page.evaluate(() => document.querySelector('[data-tile="coverage"]')!.getAnimations().map((a) => a.effect?.getTiming()));
  log("S5 NORMAL animation Agrandir", anim2);
});

test("S6 clavier : ordre de Tab, focus sous une tuile agrandie", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, FR, { token: TOKEN });
  await shown(page);
  await page.locator('[data-float="verdicts"] .ui-field input').focus();
  const seq: string[] = [];
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    seq.push(await page.evaluate(() => { const a = document.activeElement as HTMLElement; const t = a.closest("[data-tile]")?.getAttribute("data-tile"); return `${t}:${a.tagName}:${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 30)}`; }));
  }
  log("S6 TAB depuis le filtre", seq);
  // enlarge Coverage by the keyboard, then Tab out of it
  const enlarge = page.locator('[data-float="coverage"]').getByRole("button", { name: "Agrandir" });
  await enlarge.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const obscured: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    obscured.push(await page.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      const r = a.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const tile = a.closest("[data-tile]")?.getAttribute("data-tile");
      const visible = !!top && (a === top || a.contains(top));
      return `${tile}:${a.tagName}:${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 24)} visible=${visible}`;
    }));
  }
  log("S6 TAB avec Couverture agrandie", obscured);
  await page.screenshot({ path: `${OUT}/focus-sous-agrandie.png` });
});

test("S7 ordre du DOM contre ordre visuel après déplacement", async ({ page }) => {
  await mockApi(page);
  const moved = { delivery: { x: 0, y: 0, w: 4, h: 6 }, verdicts: { x: 4, y: 0, w: 8, h: 17 }, coverage: { x: 0, y: 6, w: 4, h: 5 }, sources: { x: 0, y: 11, w: 4, h: 6 } };
  await open(page, CHECK, FR, { token: TOKEN, prefs: { checkTiles: moved } });
  await shown(page);
  const dom = await page.evaluate(() => [...document.querySelectorAll(".ui-tiles-item")].map((el) => { const r = el.getBoundingClientRect(); return `${el.getAttribute("data-tile")}@${Math.round(r.x)},${Math.round(r.y)}`; }));
  log("S7 ORDRE DOM (Tab) / place à l'écran", dom);
});

test("S8 le geste de l'en-tête : un champ garde son geste", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, FR, { token: TOKEN });
  await shown(page);
  const before = await box(page, "verdicts");
  const icon = (await page.locator('[data-float="verdicts"] .ui-field svg').first().boundingBox())!;
  await carry(page, { x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 }, { x: icon.x + 6, y: icon.y + 300 });
  const during = await box(page, "verdicts");
  const placeholder = await page.locator(".react-grid-placeholder").count();
  await page.mouse.up();
  log("S8 GLISSÉ depuis la loupe du filtre : Verdicts déplacé de", Math.round(during.y - before.y), "px ; cadre cible présent :", placeholder);
  // and from a toggle's count, then from the widget's count
  const cnt = (await page.locator('[data-float="verdicts"] .ui-widget-count').boundingBox())!;
  await carry(page, { x: cnt.x + cnt.width / 2, y: cnt.y + cnt.height / 2 }, { x: cnt.x + 300, y: cnt.y + 400 });
  const d2 = await box(page, "verdicts");
  await page.mouse.up();
  log("S8 GLISSÉ depuis le compte de l'en-tête : Verdicts déplacé de", Math.round(d2.y - before.y), "px");
});

test("S9 préférence extrême : un rang immense", async ({ page }) => {
  await mockApi(page);
  const far = { verdicts: { x: 0, y: 0, w: 8, h: 17 }, coverage: { x: 8, y: 0, w: 4, h: 5 }, sources: { x: 8, y: 5, w: 4, h: 6 }, delivery: { x: 8, y: 10_000_000, w: 4, h: 6 } };
  const problems = await open(page, CHECK, FR, { token: TOKEN, prefs: { checkTiles: far } });
  await shown(page);
  const m = await page.evaluate(() => { const s = document.querySelector("main.control-space")!; const d = document.querySelector('[data-tile="delivery"]')!.getBoundingClientRect(); return { scrollHeight: s.scrollHeight, delivery: [Math.round(d.x), Math.round(d.y)] }; });
  log("S9 checkTiles delivery.y = 1e7 accepté par parseTiles :", m, "erreurs console", problems.length);
});

test("S10 requête de conteneur : la tuile de 640,5 px", async ({ page }) => {
  await page.setViewportSize({ width: 1329, height: 900 });
  await mockApi(page);
  const six = { verdicts: { x: 0, y: 0, w: 6, h: 17 }, coverage: { x: 6, y: 0, w: 6, h: 6 }, sources: { x: 6, y: 6, w: 6, h: 5 }, delivery: { x: 6, y: 11, w: 6, h: 6 } };
  await page.addInitScript((token) => sessionStorage.setItem("ld-api-token", token), TOKEN);
  await page.addInitScript((tiles) => localStorage.setItem("ld-prefs", JSON.stringify({ theme: "light", accent: "cobalt", language: "fr", checkTiles: tiles })), six);
  await page.goto(CHECK);
  await shown(page);
  const m = await page.evaluate(() => {
    const cov = document.querySelector('[data-tile="coverage"]')!;
    const th = cov.querySelector('thead th[data-align="center"]')!;
    const ver = document.querySelector('[data-tile="verdicts"]')!;
    const code = ver.querySelector('thead th[data-key="code"]')!;
    return { coverageTile: cov.getBoundingClientRect().width, topicHead: th.getBoundingClientRect().width, verdictsTile: ver.getBoundingClientRect().width, codeColumn: getComputedStyle(code).display };
  });
  log("S10 CONTENEUR à 1329 px, tuiles de 6 colonnes", m, "(DESIGN : sous 640 px étroit, dès 641 px colonnes de sujets à 72 px)");
});

test("S11 registre : alignement de la colonne Code (banc V3 : à gauche, colonne à 1 %)", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, FR, { token: TOKEN });
  await shown(page);
  const m = await page.evaluate(() => [...document.querySelectorAll('tr.ui-register-row td[data-key="code"] .ui-code')].map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }));
  const lefts = new Set(m.map((x) => x[0]));
  const rights = new Set(m.map((x) => x[1]));
  log("S11 CODE bords gauches distincts", lefts.size, [...lefts], "bords droits distincts", rights.size, [...rights]);
  await page.screenshot({ path: `${OUT}/registre-brique-fr.png`, clip: { x: 16, y: 80, width: 933, height: 800 } });
});

test("S12 page vivante : spécimen Tiles", async ({ page }) => {
  await open(page, "/next/primitives.html", FR);
  const spec = page.locator(".page-check-tiles");
  await spec.scrollIntoViewIfNeeded();
  const m = await spec.evaluate((el) => ({
    tiles: el.querySelectorAll(".ui-tiles-item").length,
    handles: el.querySelectorAll("[data-handle]").length,
    enlarge: [...el.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.textContent),
    width: el.getBoundingClientRect().width,
  }));
  log("S12 PAGE VIVANTE spécimen", m);
  const reg = await page.evaluate(() => [...document.querySelectorAll(".ui-register-group")].map((g) => g.textContent));
  log("S12 PAGE VIVANTE sections du registre", reg);
  await spec.screenshot({ path: `${OUT}/page-vivante-tiles.png` });
});

test("S13 Agrandir : la tuile voyage-t-elle 240 ms ? (jeton lu dans la feuille construite)", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, FR, { token: TOKEN });
  await shown(page);
  const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--motion-layer"));
  const home = await box(page, "coverage");
  await page.locator('[data-float="coverage"]').getByRole("button", { name: "Agrandir" }).click();
  const timing = await page.evaluate(() => document.querySelector('[data-tile="coverage"]')!.getAnimations().map((a) => a.effect?.getTiming().duration));
  // the visible box (clip-path) 60 ms later: a travel of 240 ms would still be on its way
  await page.waitForTimeout(60);
  const at60 = await page.evaluate(() => { const el = document.querySelector('[data-tile="coverage"]')!; const r = el.getBoundingClientRect(); return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], running: el.getAnimations().length, clip: getComputedStyle(el).clipPath, translate: getComputedStyle(el).translate }; });
  log("S13 AGRANDIR --motion-layer lu :", JSON.stringify(token), "durée WAAPI (ms) :", timing, "à 60 ms :", at60, "place d'origine :", [Math.round(home.x), Math.round(home.y), Math.round(home.width), Math.round(home.height)]);
});
