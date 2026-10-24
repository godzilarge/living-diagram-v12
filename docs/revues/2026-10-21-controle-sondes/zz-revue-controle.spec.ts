// Sonde de la revue 2026-10-21 (brique 7a, Contrôle) : mesures dans Chromium contre la maquette
// design/comps/shell/control.html. Temporaire dans app/e2e/, copiée dans docs/revues/2026-10-21-controle-sondes/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";

const OUT = "../docs/revues/2026-10-21-controle-sondes";
mkdirSync(OUT, { recursive: true });
const log: string[] = [];
const say = (line: string) => { log.push(line); console.log(line); };
test.afterAll(() => writeFileSync(`${OUT}/mesures.txt`, log.join("\n") + "\n"));
const CHECK = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#mode=control";
const MOCKUP = `file://${process.cwd()}/../design/comps/shell/control.html`;

async function shown(page: Page) {
  await expect(page.locator("table.ui-register tr.ui-register-row").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

/** WCAG ratio of two computed colours (rgb/rgba over the given opaque background). */
const RATIO = `(fg, bg) => {
  const p = (c) => c.match(/[\\d.]+/g).map(Number);
  const [r1,g1,b1,a1=1] = p(fg), [r2,g2,b2] = p(bg);
  const mix = [r1*a1+r2*(1-a1), g1*a1+g2*(1-a1), b1*a1+b2*(1-a1)];
  const L = (rgb) => { const [r,g,b] = rgb.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*r+0.7152*g+0.0722*b; };
  const l1 = L(mix), l2 = L([r2,g2,b2]);
  return Math.round(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))*100)/100;
}`;

test("composition : ligne dépliée, en-têtes de groupe, tables mini, Livraison à 1440 × 900", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, CHECK, { ...LIGHT, lang: "fr" }, { token: TOKEN });
  await shown(page);
  const row = page.locator("tr.ui-register-row").first();
  await row.click();
  await page.mouse.move(700, 880);
  const m = await page.evaluate(() => {
    const r = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
    const table = document.querySelector("table.ui-register")!;
    const open = document.querySelector("tr.ui-register-row[data-open]")!;
    const detail = document.querySelector("tr.ui-register-detail")!;
    const td = detail.querySelector("td")!;
    const li = detail.querySelector("li")!;
    const icon = li.querySelector(".ui-register-target-icon")!;
    const link = li.querySelector("a")!;
    const cs = getComputedStyle(td);
    const group = document.querySelector("tr.ui-register-group")!;
    const rowsOf = (sel: string) => [...document.querySelectorAll(`${sel} tbody tr`)].map((tr) => Math.round(tr.getBoundingClientRect().height));
    const delivery = document.querySelector('[data-float="delivery"] .ui-widget-body')!;
    const db = delivery.getBoundingClientRect();
    const dts = [...delivery.querySelectorAll("dt")].map((dt) => ({ text: dt.textContent, whole: dt.getBoundingClientRect().bottom <= db.bottom }));
    return {
      tableLeft: r(table)!.left, markLeft: r(open.querySelector(".ui-mark"))!.left, titleLeft: r(open.querySelector(".ui-register-title"))!.left,
      iconLeft: r(icon)!.left, linkLeft: r(link)!.left, detailHeight: r(detail)!.height, liBottom: r(li)!.bottom, detailBottom: r(detail)!.bottom,
      tdPaddingLeft: cs.paddingLeft, tdHeight: cs.height, groupHeight: r(group)!.height,
      coverageRows: rowsOf('[data-float="coverage"]'), sourcesRows: rowsOf('[data-float="sources"]'), coverageHead: Math.round(r(document.querySelector('[data-float="coverage"] thead tr'))!.height),
      deliveryFacts: dts,
    };
  });
  say(`BRIQUE fr 1440x900 : table.left=${m.tableLeft} mark.left=${m.markLeft} phrase.left=${m.titleLeft} cible.icone.left=${m.iconLeft} cible.lien.left=${m.linkLeft}`);
  say(`BRIQUE détail : td padding-left=${m.tdPaddingLeft} hauteur ligne détail=${m.detailHeight} (une cible de 28 px) ; air sous la dernière cible=${Math.round(m.detailBottom - m.liBottom)} px`);
  say(`BRIQUE en-tête de groupe : ${m.groupHeight} px ; couverture : tête ${m.coverageHead} px, lignes ${m.coverageRows.join(",")} ; sources : lignes ${m.sourcesRows.join(",")}`);
  say(`BRIQUE Livraison, faits entiers dans le corps : ${m.deliveryFacts.map((f) => `${f.text}=${f.whole ? "oui" : "NON"}`).join(" ")}`);
  await page.screenshot({ path: `${OUT}/brique-deplie-fr.png` });

  // la maquette, mêmes mesures
  await page.goto(MOCKUP);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  const k = await page.evaluate(() => {
    const r = (el: Element | null) => el!.getBoundingClientRect();
    const open = document.querySelector(".reg tr.open")!;
    const detail = document.querySelector(".reg tr.detail")!;
    const li = detail.querySelector("li")!;
    const rowsOf = (sel: string) => [...document.querySelectorAll(`${sel} tbody tr`)].map((tr) => Math.round(tr.getBoundingClientRect().height));
    const delivery = document.querySelector('[data-float="livraison"] .w-body')!;
    const db = delivery.getBoundingClientRect();
    return {
      tableLeft: r(document.querySelector(".reg")).left, markLeft: r(open.querySelector(".mark")).left, titleLeft: r(open.querySelector(".what b")).left,
      iconLeft: r(li.querySelector(".ico")).left, linkLeft: r(li.querySelector("a")).left, detailHeight: r(detail).height,
      airBelow: Math.round(r(detail).bottom - r(detail.querySelectorAll("li")[1]).bottom),
      groupHeight: r(document.querySelector(".reg tr.sevhead")).height,
      coverageRows: rowsOf('[data-float="couverture"]').slice(0, 3), sourcesRows: rowsOf('[data-float="sources"]'),
      deliveryFacts: [...delivery.querySelectorAll("dt")].map((dt) => `${dt.textContent}=${dt.getBoundingClientRect().bottom <= db.bottom ? "oui" : "NON"}`),
    };
  });
  say(`MAQUETTE : table.left=${k.tableLeft} mark.left=${k.markLeft} phrase.left=${k.titleLeft} cible.icone.left=${k.iconLeft} cible.lien.left=${k.linkLeft} ; détail ${k.detailHeight} px (deux cibles), air sous la dernière ${k.airBelow} px`);
  say(`MAQUETTE en-tête de groupe : ${k.groupHeight} px ; couverture lignes ${k.coverageRows.join(",")} ; sources lignes ${k.sourcesRows.join(",")}`);
  say(`MAQUETTE Livraison, faits entiers : ${k.deliveryFacts.join(" ")}`);
});

for (const variant of [
  { theme: "light", accent: "cobalt", lang: "en" },
  { theme: "dark", accent: "cobalt", lang: "en" },
  { theme: "light", accent: "ink", lang: "en" },
  { theme: "dark", accent: "ink", lang: "en" },
]) {
  test(`contrastes non textuels et textes propres à Contrôle, ${variant.theme}-${variant.accent}`, async ({ page }) => {
    await mockApi(page);
    await open(page, CHECK, variant, { token: TOKEN });
    await shown(page);
    await page.locator("tr.ui-register-row").nth(1).click();
    await page.mouse.move(700, 895);
    const out = await page.evaluate((ratioSrc) => {
      const ratio = eval(ratioSrc) as (fg: string, bg: string) => number;
      const paper = getComputedStyle(document.querySelector('[data-float="verdicts"]')!).backgroundColor;
      const hollow = document.querySelector('.ui-mark[data-tone="off"]')!;
      const dotted = document.querySelector('.ui-source-line[data-line="dotted"]')!;
      const solid = document.querySelector('.ui-source-line[data-line="solid"]')!;
      const code = document.querySelector(".ui-code")!;
      const meta = document.querySelector(".ui-register-meta")!;
      const group = document.querySelector(".ui-register-group th")!;
      const counts = [...document.querySelectorAll('[data-bar="severities"] .ui-count')].map((c) => `${c.textContent}:${ratio(getComputedStyle(c).color, paper)}`);
      const link = document.querySelector(".ui-register-targets a")!;
      const field = document.querySelector('[data-float="verdicts"] input')!;
      const neutralMark = document.querySelector('[data-float="coverage"] tbody .ui-mark[data-tone="neutral"]')!;
      const warnMark = document.querySelector('[data-float="coverage"] tbody .ui-mark[data-tone="warning"]')!;
      return {
        paper,
        hollow: ratio(getComputedStyle(hollow).borderTopColor, paper), hollowWidth: getComputedStyle(hollow).borderTopWidth,
        dotted: ratio(getComputedStyle(dotted).borderTopColor, paper), solid: ratio(getComputedStyle(solid).borderTopColor, paper),
        codeText: ratio(getComputedStyle(code).color, paper), codeBorder: ratio(getComputedStyle(code).borderTopColor, paper),
        meta: ratio(getComputedStyle(meta).color, paper), group: ratio(getComputedStyle(group).color, paper), counts,
        link: ratio(getComputedStyle(link).color, paper), field: ratio(getComputedStyle(field).borderTopColor, paper),
        neutralMark: ratio(getComputedStyle(neutralMark).backgroundColor, paper), warnMark: ratio(getComputedStyle(warnMark).backgroundColor, paper),
      };
    }, RATIO);
    say(`CONTRASTE ${variant.theme}-${variant.accent} (fond ${out.paper}) : marque creuse ${out.hollow}:1 (trait ${out.hollowWidth}) · marque grise ${out.neutralMark} · marque ambre ${out.warnMark} · trait plein ${out.solid} · pointillé ${out.dotted} · Code texte ${out.codeText} / bord ${out.codeBorder} · méta ${out.meta} · groupe ${out.group} · bascules ${out.counts.join(" ")} · lien cible ${out.link} · bord du filtre ${out.field}`);
    await page.screenshot({ path: `${OUT}/contraste-${variant.theme}-${variant.accent}.png`, clip: { x: 944, y: 80, width: 480, height: 330 } });
  });
}

test("clavier : ordre de Tab, anneau de focus sur une ligne, Entrée sur une cible, Échap", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const order: string[] = [];
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press("Tab");
    order.push(await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const label = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || el.tagName;
      return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? "[" + el.getAttribute("role") + "]" : ""}:${label}`;
    }));
  }
  say(`TAB depuis le haut : ${order.join(" → ")}`);
  const row = page.locator("tr.ui-register-row").first();
  await row.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const ring = await row.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} offset ${s.outlineOffset}`; });
  say(`FOCUS ligne du registre (clavier) : outline ${ring}`);
  await page.screenshot({ path: `${OUT}/focus-ligne.png`, clip: { x: 16, y: 130, width: 912, height: 140 } });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  const onLink = await page.evaluate(() => document.activeElement?.tagName + ":" + document.activeElement?.textContent);
  say(`Après Entrée puis Tab : le focus est sur ${onLink}`);
  await page.keyboard.press("Escape");
  say(`Échap sur la cible : focus ${await page.evaluate(() => document.activeElement?.tagName + ":" + document.activeElement?.textContent)}, adresse ${await page.evaluate(() => location.hash)}`);
  await page.keyboard.press("Enter");
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  say(`Entrée sur la cible : adresse ${await page.evaluate(() => location.search + location.hash)}`);
});

test("1024 px de large", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockApi(page);
  await open(page, CHECK, { ...LIGHT, lang: "fr" }, { token: TOKEN });
  await shown(page);
  const m = await page.evaluate(() => {
    const w = document.querySelector('[data-float="verdicts"]')!.getBoundingClientRect();
    const head = document.querySelector('[data-float="verdicts"] .ui-widget-head')!;
    const parts = [...head.querySelectorAll("h2, .ui-widget-count, [data-bar=severities] button, input")].map((el) => { const r = el.getBoundingClientRect(); return `${(el.textContent || el.getAttribute("placeholder") || el.tagName).trim()}[${Math.round(r.left)}–${Math.round(r.right)}]`; });
    const floats = [...document.querySelectorAll("[data-float]")].map((el) => { const r = el.getBoundingClientRect(); return { name: el.getAttribute("data-float"), l: r.left, r: r.right, t: r.top, b: r.bottom }; });
    const overlaps: string[] = [];
    for (let i = 0; i < floats.length; i++) for (let j = i + 1; j < floats.length; j++) {
      const a = floats[i], b = floats[j];
      if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) overlaps.push(`${a.name}/${b.name}`);
    }
    return { widget: `${Math.round(w.left)}–${Math.round(w.right)}`, headScroll: `${head.scrollWidth}/${head.clientWidth}`, parts, overlaps, docWidth: document.documentElement.scrollWidth };
  });
  say(`1024 : verdicts ${m.widget} ; en-tête scrollWidth/clientWidth ${m.headScroll} ; ${m.parts.join(" ")} ; chevauchements ${m.overlaps.join(", ") || "aucun"} ; largeur du document ${m.docWidth}`);
  await page.screenshot({ path: `${OUT}/largeur-1024-fr.png` });
});

test("une run sans rapport d'ingestion et sans stored_at", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await page.route("**/api/ingest/report**", (route) => route.fulfill({ status: 404, json: { code: "not_found" } }));
  await page.route("**/api/ingest/bundles**", async (route) => {
    const body = JSON.parse(readFileSync("e2e/fixtures/diagram/runs.json", "utf8"));
    body.runs = body.runs.map((run: Record<string, unknown>) => { const { stored_at: _, ...rest } = run; return rest; });
    await route.fulfill({ json: body });
  });
  await open(page, CHECK, { ...LIGHT, lang: "fr" }, { token: TOKEN });
  await shown(page);
  const facts = await page.locator('[data-float="delivery"] dt').allTextContents();
  const values = await page.locator('[data-float="delivery"] dd').allTextContents();
  say(`SANS RAPPORT NI stored_at : Livraison ${facts.map((f, i) => `${f}=${values[i]}`).join(" | ")}`);
  await page.screenshot({ path: `${OUT}/sans-rapport-fr.png` });
});

test("mouvement réduit et survol d'une ligne ouverte", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  const row = page.locator("tr.ui-register-row").first();
  await row.click();
  const d = await row.evaluate((el) => {
    const chev = el.querySelector(".ui-register-chevron")!;
    const td = el.querySelector("td")!;
    const rail = document.querySelector('[data-bar="severities"] button');
    return { chev: getComputedStyle(chev).transitionDuration, td: getComputedStyle(td).transitionDuration, rail: rail ? getComputedStyle(rail, "::after").transitionDuration : "-" };
  });
  say(`MOUVEMENT RÉDUIT : chevron ${d.chev}, survol de ligne ${d.td}, rail des bascules ${d.rail}`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await row.hover();
  await page.waitForTimeout(300);
  const fill = await page.evaluate(() => {
    const open = document.querySelector("tr.ui-register-row[data-open] td")!;
    const detail = document.querySelector("tr.ui-register-detail td")!;
    return `ligne ouverte ${getComputedStyle(open).backgroundColor}, son détail ${getComputedStyle(detail).backgroundColor}`;
  });
  say(`SURVOL d'une ligne ouverte : ${fill}`);
  await page.screenshot({ path: `${OUT}/survol-ligne-ouverte.png`, clip: { x: 16, y: 180, width: 912, height: 140 } });
});

test("le bouton des changements en Contrôle", async ({ page }) => {
  await mockApi(page);
  await open(page, CHECK, LIGHT, { token: TOKEN });
  await shown(page);
  const button = page.getByRole("button", { name: /changes/ });
  const before = await button.getAttribute("aria-pressed");
  await button.click();
  await page.waitForTimeout(300);
  say(`CHANGEMENTS en Contrôle : aria-pressed ${before} → ${await button.getAttribute("aria-pressed")}, adresse ${await page.evaluate(() => location.hash)}, registre toujours là : ${await page.locator("table.ui-register").count()}`);
});

test("sélection mise de côté puis remontrée ; Échap dans la palette ouverte depuis Contrôle", async ({ page }) => {
  await mockApi(page);
  await open(page, "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#node=dc01-core-01", LIGHT, { token: TOKEN });
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-float="panel"]')).toContainText("dc01-core-01", { timeout: 5000 });
  await page.getByRole("tab", { name: /Check/ }).click();
  await shown(page);
  say(`SÉLECTION en Contrôle : adresse ${await page.evaluate(() => location.hash)}, panneau ${await page.locator('[data-float="panel"]').count()}`);
  await page.getByRole("tab", { name: "Diagram" }).click();
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  const panel = page.locator('[data-float="panel"]');
  say(`SÉLECTION de retour au Diagramme : adresse ${await page.evaluate(() => location.hash)}, panneau ${await panel.count()} ${(await panel.count()) ? (await panel.locator("h2, h3").first().textContent()) : ""}`);
  await page.getByRole("tab", { name: /Check/ }).click();
  await shown(page);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox", { name: "Search everywhere" })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  say(`ÉCHAP palette depuis Contrôle : focus ${await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute("aria-label"))}, vue ${await page.evaluate(() => location.hash)}, registre ${await page.locator("table.ui-register").count()}`);
  // l'action de la requête depuis Contrôle
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search everywhere" }).fill("acc");
  const hide = page.getByRole("option", { name: /Hide these/ });
  const has = await hide.count();
  if (has) { await hide.first().click(); await page.waitForTimeout(400); }
  say(`MASQUER depuis Contrôle (${has} action) : adresse ${await page.evaluate(() => location.hash)}, vue affichée : registre ${await page.locator("table.ui-register").count()}, toile ${await page.locator(".react-flow").count()}, palette ouverte ${await page.getByRole("combobox", { name: "Search everywhere" }).count()}`);
});
