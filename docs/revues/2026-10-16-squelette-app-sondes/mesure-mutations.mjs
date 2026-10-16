// Sonde : la mesure (app/e2e/audit.ts) par mutation sur la page vivante servie sous CSP (CSSOM seulement).
// Lancer : (vite preview sur 4318, voir geometrie.mjs) puis node ../docs/revues/2026-10-16-squelette-app-sondes/mesure-mutations.mjs
import { readFileSync } from "node:fs";
import ts from "../../../app/node_modules/typescript/lib/typescript.js";
import { chromium } from "../../../app/node_modules/playwright/index.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:4318";
const source = readFileSync(new URL("../../../app/e2e/audit.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { audit } = await import("data:text/javascript," + encodeURIComponent(js));
const LIMITS = { edge: 16, gap: 12, contrast: 4.5 };

const browser = await chromium.launch();
const cases = {
  "îlot à 8 px du bord": () => { const el = document.querySelector('[data-float="brand"]'); el.style.setProperty("translate", `${8 - el.getBoundingClientRect().left}px 0`); },
  "deux îlots à 8 px l'un de l'autre": () => { const a = document.querySelector('[data-float="brand"]'), b = document.querySelector('[data-float="context"]'); b.style.setProperty("translate", `${a.getBoundingClientRect().right + 8 - b.getBoundingClientRect().left}px 0`); },
  "second style d'infobulle (padding)": () => { document.querySelector(".ui-tooltip").style.setProperty("padding", "4px 6px"); },
  "texte à 2,6:1": () => { document.querySelector(".page-note").style.setProperty("color", "#999999"); },
  // ce qu'elle laisse passer
  "texte estompé par opacity: 0.3": () => { document.querySelector(".page-note").style.setProperty("opacity", "0.3"); },
  "anneau de focus supprimé partout": () => { for (const el of document.querySelectorAll(".ui-control")) el.style.setProperty("outline", "none", "important"); },
  "infobulle à 2 px de son contrôle": () => { const t = document.querySelector(".ui-tooltip"); t.style.setProperty("translate", "0 -6px"); },
  "infobulle avec un autre lettrage (letter-spacing)": () => { document.querySelector(".ui-tooltip").style.setProperty("letter-spacing", "0.08em"); },
  "bord de champ à 1,2:1": () => { for (const el of document.querySelectorAll(".ui-field-input")) el.style.setProperty("border-color", "#F0F0F0"); },
};
const results = {};
for (const [name, mutate] of Object.entries(cases)) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => localStorage.setItem("ld-prefs", JSON.stringify({ theme: "light", accent: "cobalt", lang: "en" })));
  await page.goto(`${BASE}/next/primitives.html`);
  await page.evaluate(() => document.fonts.ready);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 1440, height });
  await page.waitForTimeout(600);
  await page.evaluate(mutate);
  await page.waitForTimeout(100);
  const r = await page.evaluate(audit, LIMITS);
  const flags = [...r.bars.flatMap((b) => b.flags), ...r.floats.flags, ...r.layers.flags, ...r.tooltips.flags, ...r.contrast.flags];
  results[name] = flags.length ? `REFUSÉ (${flags.length}) : ${flags[0]}` : "laissé passer";
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
