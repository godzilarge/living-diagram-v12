// TEMPORARY probe of the brick-5 review; deleted after the review.
import { test } from "@playwright/test";
import { mockApi, NOW, TOKEN } from "./helpers";

for (const path of ["/next/", "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112"]) {
  test(`frames painted before the stored dark theme is on the page: ${path}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await page.addInitScript((token) => {
      sessionStorage.setItem("ld-api-token", token);
      localStorage.setItem("ld-prefs", JSON.stringify({ theme: "dark", accent: "cobalt", language: "fr" }));
      const frames: string[] = [];
      (window as unknown as { frames_: string[] }).frames_ = frames;
      const tick = () => {
        const root = document.documentElement;
        const bg = document.body ? getComputedStyle(document.body).backgroundColor : "no body";
        frames.push(`${Math.round(performance.now())}ms theme=${root.dataset.theme} lang=${root.lang} bg=${bg}`);
        if (frames.length < 120) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, TOKEN);
    await mockApi(page);
    await page.goto(path);
    await page.waitForTimeout(1500);
    console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { frames_: string[] }).frames_.filter((f, i, all) => i === 0 || f.split(" ").slice(1).join(" ") !== all[i - 1].split(" ").slice(1).join(" ")))));
  });
}
