import { expect, test } from "@playwright/test";
import { LIGHT, mockApi, NOW, open, TOKEN } from "./helpers";
test.use({ timezoneId: "UTC", deviceScaleFactor: 3 });
test("probe: the IP addresses header", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await open(page, "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112#node=dc01-core-01", LIGHT, { token: TOKEN });
  await expect(page.locator(".react-flow__node-card").first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Shift+F");
  await page.waitForTimeout(500);
  const th = page.locator('aside.ui-panel th[data-key="addresses"]');
  console.log("SONDE th-addresses", JSON.stringify(await th.evaluate((e) => {
    const b = e.querySelector("button")!; const node = [...b.childNodes].find((n) => n.nodeType === 3)!;
    const r = document.createRange(); const i = node.textContent!.indexOf(" "); r.setStart(node, i); r.setEnd(node, i + 1);
    return { text: JSON.stringify(node.textContent), spaceWidth: r.getBoundingClientRect().width, ws: getComputedStyle(b).whiteSpace, ls: getComputedStyle(b).letterSpacing, ws2: getComputedStyle(b).wordSpacing };
  })));
  await th.screenshot({ path: "e2e/captures/zz-sonde-th-addresses.png" });
});
