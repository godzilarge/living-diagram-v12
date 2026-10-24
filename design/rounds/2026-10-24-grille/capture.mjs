// Captures and gesture probes of the bench « grille » (served at :8016/grille/). Run from app/ (Playwright there):
//   node ../bac-a-sable/grille-src/capture.mjs      → .impeccable/planche-grille/*.png and a readout per step
import { chromium } from "/home/otosun/development/applications/demo/living-diagram-v12-biturbo/app/node_modules/@playwright/test/index.mjs";
import { mkdirSync } from "node:fs";

const OUT = "/home/otosun/development/applications/demo/living-diagram-v12-biturbo/.impeccable/planche-grille/";
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:8016/grille/";
const browser = await chromium.launch();

const readout = (page) => page.evaluate(() => ({ check: document.querySelector("[data-check]")?.textContent, ok: document.querySelector("[data-check]")?.dataset.ok, size: document.querySelector(".bench .dim")?.textContent, layout: JSON.parse(localStorage.getItem(`ld-bench-grille-${document.body.dataset.dir}`) || "null") }));
const box = (page, id) => page.locator(`[data-float="${id}"]`).boundingBox();
async function drag(page, from, to, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

for (const dir of ["g3", "g2", "g1"]) {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${BASE}?d=${dir}&theme=${theme}`);
    await page.waitForSelector('[data-float="livraison"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}${dir}-${theme}-maquette.png`, fullPage: dir !== "g1" });
    console.log(dir, theme, "maquette", await readout(page), "errors", errors);
    if (theme === "dark") { await context.close(); continue; }

    // 1. G1: the verdicts narrowed by their east edge (three columns), then the coverage dragged into the freed
    //    space; G2: the coverage dragged by its header onto the large place (the verdicts flow down)
    const cov = await box(page, "couverture");
    const ver = await box(page, "verdicts");
    if (dir !== "g2") {
      const east = page.locator('[data-float="verdicts"]').locator("xpath=ancestor::div[contains(@class,'react-grid-item')]").locator(".react-resizable-handle-e");
      await page.mouse.move(ver.x + 200, ver.y + 200);
      const e = await east.boundingBox();
      await drag(page, { x: e.x + 4, y: e.y + 200 }, { x: e.x + 4 - 356, y: e.y + 200 });
      const v2 = await box(page, "verdicts");
      await drag(page, { x: cov.x + 120, y: cov.y + 28 }, { x: v2.x + v2.width + 16 + 120, y: ver.y + 28 });
    } else {
      await drag(page, { x: cov.x + 120, y: cov.y + 28 }, { x: ver.x + 140, y: ver.y + 28 });
    }
    await page.mouse.move(720, 890);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}${dir}-glisse-couverture.png`, fullPage: dir !== "g1" });
    console.log(dir, "après glissé", await readout(page), { couverture: await box(page, "couverture"), verdicts: await box(page, "verdicts") });

    // 2. the coverage resized by its south-east corner, wider and taller
    const c2 = await box(page, "couverture");
    const handle = page.locator('[data-float="couverture"]').locator("xpath=ancestor::div[contains(@class,'react-grid-item')]").locator(".react-resizable-handle-se");
    await page.mouse.move(c2.x + 100, c2.y + 20);
    const h = await handle.boundingBox();
    await drag(page, { x: h.x + 8, y: h.y + 8 }, { x: h.x + 8 + 240, y: h.y + 8 + 200 });
    await page.mouse.move(720, 890);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}${dir}-redimensionne.png`, fullPage: dir !== "g1" });
    console.log(dir, "après redimensionnement", await readout(page), { couverture: await box(page, "couverture") });

    // 3. a frozen drag: the sources lifted, the placeholder shown
    const src = await box(page, "sources");
    await page.mouse.move(src.x + 100, src.y + 28);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(src.x + 100 - 40 * i, src.y + 28 - 10 * i);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}${dir}-pendant-glisse.png`, fullPage: dir !== "g1" });
    await page.mouse.up();
    await page.waitForTimeout(400);

    // 4. enlarge the verdicts
    await page.locator('[data-float="verdicts"] button[aria-label="Agrandir"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}${dir}-agrandi.png` });
    console.log(dir, "agrandi", await readout(page), { verdicts: await box(page, "verdicts") });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // 5. a 13-inch window with the layout kept
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}${dir}-1366.png`, fullPage: dir !== "g1" });
    console.log(dir, "1366", await readout(page));

    // 6. reset
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Réinitialiser" }).click();
    await page.waitForTimeout(500);
    console.log(dir, "réinitialisé", await readout(page));
    // 7. G3: the five registers in the verdicts' tile (V0 the application's, V1 to V4 from data)
    if (dir === "g3") {
      for (const [v, name] of [["v0", "V0"], ["v1", "V1"], ["v2", "V2"], ["v3", "V3"], ["v4", "V4"]]) {
        await page.getByRole("button", { name, exact: true }).click();
        await page.waitForTimeout(400);
        await page.mouse.move(720, 890);
        await page.screenshot({ path: `${OUT}${dir}-registre-${v}.png`, clip: { x: 16, y: 80, width: 933, height: 804 } });
      }
      await page.getByRole("button", { name: "V0", exact: true }).click();
      await page.waitForTimeout(200);
    }
    // 8. locked
    await page.getByRole("button", { name: "Verrouillée" }).click();
    await page.mouse.move(300, 300);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}${dir}-verrouillee.png` });
    console.log(dir, "errors", errors);
    await context.close();
  }
}
await browser.close();
