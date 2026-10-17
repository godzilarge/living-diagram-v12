// Revue brique 6 (édition) : sondes Chromium. À copier dans app/e2e/ (et playwright.sondes.config.ts dans app/) puis :
//   cd app && LD_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test -c playwright.sondes.config.ts sondes.spec.ts
// Les mesures sont écrites dans la sortie (`console.log`) et dans ../docs/revues/2026-10-16-edition-sondes/sonde-*.png ; un `expect` qui échoue
// est un constat du rapport docs/revues/2026-10-16-edition.md.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { audit } from "./audit";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";
import type { Prefs } from "./helpers";

const CORE = "dc01-core-01";
const AT_REST = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
const WITH_CORE = `${AT_REST}#node=${CORE}`;
const LIMITS = { edge: 16, gap: 12, contrast: 4.5, tooltip: 8 };

async function editing(page: Page, prefs: Prefs = LIGHT, path = WITH_CORE) {
  await page.clock.setFixedTime(NOW);
  const api = await mockApi(page);
  const problems = await open(page, path, prefs, { token: TOKEN, author: "orhan" });
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  const toast = page.getByRole("status").filter({ has: page.getByRole("button") });
  if (await toast.count()) await toast.getByRole("button").last().click();
  await page.keyboard.press("m");
  await expect(page.getByRole("toolbar", { name: /Editing tools|Outils d'édition/ })).toBeVisible();
  await page.waitForTimeout(300);
  return { api, problems };
}
const bar = (page: Page) => page.getByRole("toolbar", { name: /Quick actions|Actions rapides/ });
const palette = (page: Page) => page.getByRole("toolbar", { name: /Editing tools|Outils d'édition/ });

test("H1 : « Add to <group> » de la barre d'équipement écrit group_add sur l'id du groupe", async ({ page }) => {
  const { api } = await editing(page);
  await bar(page).getByRole("button", { name: "Group" }).click();
  await page.getByRole("menuitem", { name: /^Add to/ }).click();
  await expect.poll(() => api.ops.length).toBe(1);
  console.log("op écrite :", JSON.stringify(api.ops[0]));
  expect(api.ops[0]).toMatchObject({ op: "group_add", id: "g5-1" }); // reçu id "add:g5-1" : le backend répond unknown_group
});

test("M : Ctrl+B sur une note sélectionnée (raccourci affiché par « Bold »)", async ({ page }) => {
  const { api } = await editing(page, LIGHT, AT_REST);
  await page.keyboard.press("n");
  await expect(bar(page).getByRole("button", { name: "Bold" })).toBeVisible();
  const tip = await bar(page).getByRole("button", { name: "Bold" }).evaluate((b) => b.getAttribute("aria-keyshortcuts"));
  await bar(page).getByRole("button", { name: "Bold" }).hover();
  await page.waitForTimeout(600);
  console.log("infobulle de Bold :", await page.getByRole("tooltip").textContent(), "aria-keyshortcuts:", tip);
  await page.locator(".react-flow__node.selected").first().focus();
  const before = api.ops.length;
  await page.keyboard.press("Control+b");
  await page.waitForTimeout(500);
  console.log("ops après Ctrl+B :", api.ops.slice(before).map((op) => JSON.stringify(op)));
  expect(api.ops.length, "Ctrl+B écrit le gras").toBe(before + 1);
});

test("M : « Text colour » de la barre de note change la teinte de la note, pas la couleur du texte", async ({ page }) => {
  const { api } = await editing(page, LIGHT, AT_REST);
  await page.keyboard.press("n");
  const note = page.locator(".react-flow__node.selected .annotation").first();
  await expect(note).toBeVisible();
  const text = note.locator(".annotation-text").first();
  const before = { cls: await note.getAttribute("class"), color: await text.evaluate((e) => getComputedStyle(e).color), bg: await note.evaluate((e) => getComputedStyle(e).backgroundColor) };
  await bar(page).getByRole("button", { name: /^Text colour/ }).click();
  await page.locator("[data-layer]").last().getByRole("button").nth(0).click(); // la première teinte
  await expect.poll(() => api.ops.length).toBe(2);
  await page.waitForTimeout(400);
  const after = { cls: await note.getAttribute("class"), color: await text.evaluate((e) => getComputedStyle(e).color), bg: await note.evaluate((e) => getComputedStyle(e).backgroundColor) };
  console.log("op :", JSON.stringify(api.ops[1]), "\navant :", JSON.stringify(before), "\naprès :", JSON.stringify(after));
  await page.screenshot({ path: "../docs/revues/2026-10-16-edition-sondes/sonde-text-colour.png" });
  expect(after.color, "la couleur du texte change").not.toBe(before.color);
});

test("mesures de la palette, de la barre et des volets contre la maquette", async ({ page }) => {
  await editing(page);
  const m = await page.evaluate(() => {
    const r = (e: Element | null) => { const b = e!.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const pal = document.querySelector("[data-float='edit-tools']")!;
    const pbtn = [...pal.querySelectorAll("button")].map(r);
    const seps = [...pal.querySelectorAll(".ui-separator")].map(r);
    const ctx = document.querySelector("[data-float='context-bar']")!;
    const kids = [...ctx.children].map((e) => ({ tag: e.className.split(" ")[0], ...r(e) }));
    const gaps = kids.slice(1).map((k, i) => k.x - (kids[i].x + kids[i].w));
    return { palette: r(pal), paletteButtons: pbtn.map((b) => `${b.x},${b.y} ${b.w}x${b.h}`), separators: seps, bar: r(ctx), barGaps: gaps, barKids: kids.map((k) => `${k.tag} ${k.w}x${k.h}`) };
  });
  console.log(JSON.stringify(m, null, 1));
  expect(m.palette.x).toBe(16);
  expect(m.palette.y).toBe(216);
  expect(m.palette.w).toBe(48);
  expect(m.bar.h).toBe(48);
  // le volet de l'outil forme : 12 px à droite de l'îlot, son premier contrôle à hauteur du déclencheur
  await palette(page).getByRole("button", { name: "Shape" }).click();
  const menu = page.locator("[data-layer='shapes']");
  await expect(menu).toHaveAttribute("data-status", "open");
  await page.waitForTimeout(300);
  const shape = await page.evaluate(() => {
    const pal = document.querySelector("[data-float='edit-tools']")!.getBoundingClientRect();
    const trig = [...document.querySelectorAll("[data-float='edit-tools'] button")].find((b) => b.getAttribute("aria-expanded") === "true")!.getBoundingClientRect();
    const layer = document.querySelector("[data-layer='shapes']")!.getBoundingClientRect();
    const first = document.querySelector("[data-layer='shapes'] [role='menuitem']")!.getBoundingClientRect();
    return { gapFromIsland: Math.round(layer.left - pal.right), firstRowTop: Math.round(first.top), triggerTop: Math.round(trig.top) };
  });
  console.log("volet forme :", JSON.stringify(shape));
  expect(shape.gapFromIsland).toBe(12);
  await page.keyboard.press("Escape");
});

for (const prefs of [{ theme: "light", accent: "ink", lang: "en" }, { theme: "dark", accent: "ink", lang: "en" }, { theme: "dark", accent: "cobalt", lang: "en" }, { theme: "light", accent: "cobalt", lang: "en" }] as const) {
  const tag = `${prefs.theme}-${prefs.accent}`;
  test(`contraste mesuré, ${tag} : texte (audit), icônes, rail, anneau de focus, ligne clavier du menu`, async ({ page }) => {
    await editing(page, prefs);
    const report = await page.evaluate(audit, LIMITS);
    console.log(tag, "audit texte :", report.contrast.checked, "éléments,", JSON.stringify(report.contrast.flags));
    await bar(page).getByRole("button", { name: /^Hue/ }).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const volet = await page.evaluate(audit, LIMITS);
    console.log(tag, "audit avec volet des teintes :", JSON.stringify(volet.contrast.flags));
    await page.keyboard.press("Escape");
    // contours non textuels (≥ 3:1) : icône d'outil, rail de l'outil courant, anneau de focus
    await palette(page).getByRole("button", { name: "Select" }).focus();
    const contours = await page.evaluate(() => {
      const parse = (v: string) => (/rgba?\(([^)]+)\)/.exec(v)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number)) ?? [0, 0, 0, 1];
      const lum = (c: number[]) => { const [r, g, b] = c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a: number[], b: number[]) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return +((h + 0.05) / (l + 0.05)).toFixed(2); };
      const paper = parse(getComputedStyle(document.querySelector("[data-float='edit-tools']")!).backgroundColor);
      const sel = document.activeElement as HTMLElement;
      const icon = parse(getComputedStyle(document.querySelector("[data-float='edit-tools'] button:not([aria-disabled='true']) svg")!).color);
      const after = getComputedStyle(sel, "::after");
      const rail = parse(after.backgroundColor);
      const ring = parse(getComputedStyle(sel).outlineColor);
      const hover = parse(getComputedStyle(document.documentElement).getPropertyValue("--color-hover") ? `rgb(0,0,0)` : "rgb(0,0,0)");
      return { paper: paper.join(","), icon: ratio(icon, paper), rail: ratio(rail, paper), railColour: after.backgroundColor, ring: ratio(ring, paper), ringColour: getComputedStyle(sel).outlineColor, ringStyle: getComputedStyle(sel).outlineStyle, hover };
    });
    console.log(tag, "contours :", JSON.stringify(contours));
    await page.locator(".react-flow__node-card", { hasText: CORE }).click({ button: "right" });
    await page.keyboard.press("ArrowDown");
    const active = await page.evaluate(() => {
      const row = document.querySelector("[data-layer='context-menu'] [data-active]") as HTMLElement;
      return { text: getComputedStyle(row).color, fill: getComputedStyle(row).backgroundColor };
    });
    const menuReport = await page.evaluate(audit, LIMITS);
    console.log(tag, "ligne clavier du menu :", JSON.stringify(active), "audit :", JSON.stringify(menuReport.contrast.flags));
    await page.screenshot({ path: `../docs/revues/2026-10-16-edition-sondes/sonde-contrast-${tag}.png` });
    expect(report.contrast.flags).toEqual([]);
    expect(volet.contrast.flags).toEqual([]);
    expect(menuReport.contrast.flags).toEqual([]);
    expect(contours.icon).toBeGreaterThanOrEqual(3);
    expect(contours.rail).toBeGreaterThanOrEqual(3);
    expect(contours.ring).toBeGreaterThanOrEqual(3);
  });
}

test("clavier : palette, barre, volet, Échap, menu contextuel au clavier", async ({ page }) => {
  await editing(page);
  const where = () => page.evaluate(() => { const a = document.activeElement as HTMLElement; const f = a.closest("[data-float]"); return `${f?.getAttribute("data-float") ?? a.className.split(" ")[0]}:${a.getAttribute("aria-label") ?? a.textContent?.trim().slice(0, 24)}`; });
  // depuis l'outil « Select » de la palette, Tab avance : la barre contextuelle est-elle atteinte ?
  await palette(page).getByRole("button", { name: "Select" }).focus();
  const stops: string[] = [await where()];
  for (let i = 0; i < 30; i += 1) { await page.keyboard.press("Tab"); stops.push(await where()); }
  console.log("Tab depuis la palette, une sélection posée :", stops.join(" | "));
  expect.soft(stops.filter((s) => s.startsWith("edit-tools:")).length, "un seul arrêt dans la palette").toBe(1);
  expect.soft(stops.some((s) => s.startsWith("context-bar:")), "la barre contextuelle est atteinte par Tab").toBe(true);
  // la palette : ↓ marche, un seul arrêt
  await palette(page).getByRole("button", { name: "Select" }).focus();
  await page.keyboard.press("ArrowDown");
  console.log("palette après ↓ :", await where());
  // la barre : → marche, Échap rend le focus à la carte et garde la sélection
  const first = bar(page).getByRole("button").first();
  await first.focus();
  await page.keyboard.press("ArrowRight");
  console.log("barre après → :", await where());
  await page.keyboard.press("Escape");
  console.log("après Échap sur la barre :", await where());
  await expect(bar(page)).toBeVisible();
  // un volet au clavier : Entrée l'ouvre, Échap le ferme et rend le focus au déclencheur
  await bar(page).getByRole("button", { name: /^Hue/ }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  console.log("focus à l'ouverture du volet des teintes :", await where());
  await page.keyboard.press("Escape");
  console.log("focus après Échap du volet :", await where());
  // le menu contextuel atteint au clavier (Maj+F10, puis la touche Menu) sur la carte focalisée
  await page.locator(`.react-flow__node[data-id="${CORE}"]`).focus();
  console.log("focus sur la carte :", await where());
  await page.keyboard.press("Shift+F10");
  await page.waitForTimeout(300);
  const menu = await page.getByRole("menu").count();
  console.log("menu contextuel après Maj+F10 :", menu);
  if (!menu) { await page.keyboard.press("ContextMenu"); await page.waitForTimeout(300); }
  console.log("menu contextuel après la touche Menu :", await page.getByRole("menu").count());
  expect.soft(await page.getByRole("menu").count(), "le menu contextuel s'ouvre au clavier").toBe(1);
});

test("M : P et H, affichés dans les infobulles de la barre d'équipement, épinglent et masquent", async ({ page }) => {
  const { api } = await editing(page);
  for (const name of [/^Pin in place/, /^Hide this device/]) {
    await bar(page).getByRole("button", { name }).hover();
    await page.waitForTimeout(600);
    console.log("infobulle :", await page.getByRole("tooltip").textContent());
  }
  await page.locator(`.react-flow__node[data-id="${CORE}"]`).focus();
  await page.keyboard.press("p");
  await page.waitForTimeout(400);
  console.log("ops après P :", JSON.stringify(api.ops));
  await page.keyboard.press("h");
  await page.waitForTimeout(400);
  const hash = await page.evaluate(() => location.hash);
  console.log("adresse après H :", hash);
  expect.soft(api.ops.map((op) => op.op), "P épingle").toContain("pin");
  expect.soft(hash, "H masque").toContain("hide=");
});

test("mouvement réduit : la palette et la barre arrivent en 1 ms", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await editing(page);
  const durations = await page.evaluate(() => ({
    palette: getComputedStyle(document.querySelector("[data-float='edit-tools']")!).animationDuration,
    bar: getComputedStyle(document.querySelector("[data-float='context-bar']")!).animationDuration,
  }));
  console.log("durées sous reduced-motion :", JSON.stringify(durations));
  expect(durations.palette).toBe("0.001s");
  expect(durations.bar).toBe("0.001s");
});

test("capture : une note sélectionnée (état edit-note de la maquette), clair et sombre", async ({ page }) => {
  await editing(page, LIGHT, AT_REST);
  await page.keyboard.press("n");
  await expect(bar(page)).toBeVisible();
  await page.waitForTimeout(400);
  const dim = await page.evaluate(() => [...document.querySelectorAll(".react-flow__node-card")].slice(0, 4).map((n) => getComputedStyle(n).opacity + "/" + getComputedStyle(n.firstElementChild as Element).opacity));
  console.log("opacité des cartes non sélectionnées (nœud/carte) :", dim.join(" "));
  await page.screenshot({ path: "../docs/revues/2026-10-16-edition-sondes/sonde-edit-note-light.png" });
});

test("H : en édition, ← → sur les onglets Diagramme / Contrôle / Journal déplacent l'équipement sélectionné", async ({ page }) => {
  const { api } = await editing(page);
  const tab = page.getByRole("tab", { name: /^Diagram/ });
  await tab.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => (document.activeElement as HTMLElement).textContent?.trim());
  console.log("focus après → sur l'onglet :", after, "| ops écrites :", JSON.stringify(api.ops));
  expect.soft(api.ops, "aucune écriture depuis un onglet").toEqual([]);
  expect.soft(after, "→ passe à l'onglet suivant").not.toMatch(/^Diagram/);
});

test("B : le premier contrôle d'un volet sous son déclencheur (teintes, tailles, plus)", async ({ page }) => {
  await editing(page);
  const measure = async (name: RegExp) => {
    const trigger = bar(page).getByRole("button", { name });
    await trigger.click();
    await page.waitForTimeout(350);
    const out = await page.evaluate(() => {
      const t = document.querySelector("[data-float='context-bar'] [aria-expanded='true']")!.getBoundingClientRect();
      const layer = [...document.querySelectorAll("[data-layer]")].pop()!;
      const first = layer.querySelector("button")!.getBoundingClientRect();
      const barBox = document.querySelector("[data-float='context-bar']")!.getBoundingClientRect();
      return { triggerX: Math.round(t.x), firstX: Math.round(first.x), gapToBar: Math.round(barBox.top - layer.getBoundingClientRect().bottom) };
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    return out;
  };
  const hue = await measure(/^Hue/);
  const more = await measure(/^More/);
  console.log("teintes :", JSON.stringify(hue), "plus :", JSON.stringify(more));
  expect.soft(hue.firstX).toBe(hue.triggerX);
  expect.soft(more.firstX).toBe(more.triggerX);
});

for (const theme of ["light", "dark"] as const) {
  test(`B : les douze pastilles du volet des teintes contre le papier, ${theme}`, async ({ page }) => {
    await editing(page, { theme, accent: "cobalt", lang: "en" });
    await bar(page).getByRole("button", { name: /^Hue/ }).click();
    await page.waitForTimeout(350);
    const out = await page.evaluate(() => {
      const parse = (v: string) => (/rgba?\(([^)]+)\)/.exec(v)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number)) ?? [0, 0, 0, 1];
      const lum = (c: number[]) => { const [r, g, b] = c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a: number[], b: number[]) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return +((h + 0.05) / (l + 0.05)).toFixed(2); };
      const layer = [...document.querySelectorAll("[data-layer]")].pop()!;
      const paper = parse(getComputedStyle(layer).backgroundColor);
      return [...layer.querySelectorAll(".ui-swatch")].map((s) => `${s.getAttribute("data-swatch")} ${ratio(parse(getComputedStyle(s).backgroundColor), paper)}`);
    });
    console.log(theme, "pastilles / papier :", out.join(", "));
    expect.soft(out.filter((s) => Number(s.split(" ")[1]) < 3), "pastilles sous 3:1").toEqual([]);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`le menu contextuel est-il opaque ? ${theme}`, async ({ page }) => {
    await editing(page, { theme, accent: "ink", lang: "en" });
    await page.locator(".react-flow__node-card", { hasText: CORE }).click({ button: "right" });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const menu = document.querySelector("[data-layer='context-menu']") as HTMLElement;
      const chain: string[] = [];
      for (let n: HTMLElement | null = menu; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.opacity !== "1" || s.zIndex !== "auto") chain.push(`${n.className.slice(0, 30)} op=${s.opacity} z=${s.zIndex}`); }
      const r = menu.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + 30, r.y + 10) as HTMLElement;
      return { bg: getComputedStyle(menu).backgroundColor, chain, topAtCorner: top.className.slice(0, 50), parent: menu.parentElement?.className.slice(0, 40) };
    });
    console.log(theme, "menu :", JSON.stringify(m));
    await page.screenshot({ path: `../docs/revues/2026-10-16-edition-sondes/sonde-menu-${theme}-ink.png` });
  });
}
