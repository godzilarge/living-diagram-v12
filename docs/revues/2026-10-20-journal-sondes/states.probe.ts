import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { journalPage, LOG, OUT, open, TOKEN, withJournal } from "./common";

const empty = (over: Record<string, unknown> = {}) => ({ ...(journalPage() as object), entries: [], total: 0, next: null, ...over });
const cases: [string, string, ((url: URL) => unknown) | undefined][] = [
  ["empty", LOG, () => empty({ authors: [], categories: [], infrastructures: [], actions: [] })],
  ["nomatch", LOG + "&jq=zzz&jau=orhan&jp=7d", () => empty()],
  ["failed", LOG, () => 500],
  ["rev", LOG + "&jrev=69", undefined],
  ["revmissing", LOG + "&jrev=999", (url) => ({ ...(journalPage() as object), start_missing: url.searchParams.get("start") !== null })],
  ["object", LOG + "&jobj=dc01-core-01", undefined],
  ["unreadable", LOG, () => ({ ...(journalPage() as object), unreadable: 3 })],
];
for (const theme of ["light", "dark"]) for (const [name, url, body] of cases) {
  test(`${name} ${theme}`, async ({ page }) => {
    await withJournal(page, body);
    await open(page, url, { theme, accent: "cobalt", lang: "fr" }, { token: TOKEN });
    await page.waitForTimeout(1500);
    await page.mouse.move(1, 899);
    await page.screenshot({ path: `${OUT}/state-${name}-${theme}.png` });
    if (theme === "light") {
      const info = await page.evaluate(() => ({
        subtitle: document.querySelector(".journal-subtitle")?.textContent,
        body: (document.querySelector(".journal-body") as HTMLElement)?.innerText.slice(0, 400),
        context: (document.querySelector(".journal-context") as HTMLElement)?.innerText,
        target: document.querySelector("[data-target]")?.textContent?.slice(0, 80),
        focused: document.activeElement?.textContent?.slice(0, 60),
        alerts: [...document.querySelectorAll("[role=alert],[aria-live]")].map((e) => `${e.getAttribute("role") ?? ""}/${e.getAttribute("aria-live") ?? ""}: ${e.textContent?.slice(0, 60)}`),
      }));
      writeFileSync(`${OUT}/state-${name}.json`, JSON.stringify(info, null, 1));
    }
  });
}
