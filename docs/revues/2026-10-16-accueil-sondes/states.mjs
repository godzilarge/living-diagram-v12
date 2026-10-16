// Probe: the states of the home in the four variants (light / dark × cobalt / ink), measured in Chromium: contrast of
// the texts the page audit skips (aria-hidden counts) and of the texts on a hovered row; the chevron at rest, hovered,
// focused; the hover of a row that opens nothing (Latest collections); the focus ring of a row.
import { chromium, CONTRAST_JS, openHome, OUT } from "./common.mjs";
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) for (const accent of ["cobalt", "ink"]) {
  const { context, page } = await openHome(browser, { theme, accent });
  const contrast = eval(CONTRAST_JS);
  const ratioOf = (loc) => loc.evaluate(contrast);
  const infra = page.locator('[data-float="infrastructures"] tbody tr');
  const nantes = infra.filter({ hasText: "site-nantes" });
  const rest = {
    th: await ratioOf(page.locator('[data-float="infrastructures"] .ui-th').first()),
    count: await ratioOf(page.locator(".ui-widget-count")),
    errorCount: await ratioOf(nantes.locator('.home-check .ui-state[data-tone="error"]')),
    warningCount: await ratioOf(nantes.locator('.home-check .ui-state[data-tone="warning"]')),
    warningStatus: await ratioOf(nantes.locator('td:nth-child(4) .ui-state')),
    zero: await ratioOf(page.locator(".home-zero").first()),
    feedWhere: await ratioOf(page.locator(".home-feed-where").first()),
    slotText: await ratioOf(page.locator(".home-slot p")),
  };
  await nantes.hover();
  await page.waitForTimeout(300);
  const hovered = {
    bg: await nantes.locator("td").first().evaluate((td) => getComputedStyle(td).backgroundColor),
    errorCount: await ratioOf(nantes.locator('.home-check .ui-state[data-tone="error"]')),
    warningStatus: await ratioOf(nantes.locator('td:nth-child(4) .ui-state')),
    chevron: await nantes.locator(".home-go").evaluate((el) => ({ opacity: getComputedStyle(el).opacity, color: getComputedStyle(el).color })),
  };
  await page.screenshot({ path: `${OUT}/hover-infra-${theme}-${accent}.png`, clip: { x: 16, y: 80, width: 928, height: 440 } });
  const second = infra.nth(1);
  const chevronAtRest = await second.locator(".home-go").evaluate((el) => getComputedStyle(el).opacity);
  const runRow = page.locator('[data-float="collections"] tbody tr').nth(2);
  await runRow.hover();
  await page.waitForTimeout(300);
  const runs = {
    clickable: await runRow.evaluate((tr) => tr.hasAttribute("data-clickable") || tr.tabIndex >= 0),
    hoverBg: await runRow.locator("td").first().evaluate((td) => getComputedStyle(td).backgroundColor),
    cursor: await runRow.evaluate((tr) => getComputedStyle(tr).cursor),
  };
  await page.screenshot({ path: `${OUT}/hover-runs-${theme}-${accent}.png`, clip: { x: 16, y: 534, width: 928, height: 352 } });
  await page.mouse.move(5, 895);
  await second.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(250);
  const focus = await second.evaluate((tr) => {
    const cs = getComputedStyle(tr);
    return { outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} offset ${cs.outlineOffset}`, focused: tr === document.activeElement, chevron: getComputedStyle(tr.querySelector(".home-go")).opacity };
  });
  await page.screenshot({ path: `${OUT}/focus-row-${theme}-${accent}.png`, clip: { x: 16, y: 80, width: 928, height: 440 } });
  console.log(JSON.stringify({ theme, accent, rest, hovered, chevronAtRest, runs, focus }, null, 1));
  await context.close();
}
await browser.close();
