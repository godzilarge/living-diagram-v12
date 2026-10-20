import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LOG, OUT, open, TOKEN, withJournal, journalPage } from "./common";
test("csv export and its toast", async ({ page }) => {
  await withJournal(page, (url) => ({ ...(journalPage() as object), next: null }));
  await open(page, LOG, { theme: "light", accent: "cobalt", lang: "fr" }, { token: TOKEN });
  await expect(page.locator("[data-feed-row]").first()).toBeVisible({ timeout: 15_000 });
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter en CSV" }).click();
  const d = await dl;
  await page.waitForTimeout(400);
  const toast = await page.locator(".ui-toast").allInnerTexts();
  const role = await page.locator(".ui-toast").first().getAttribute("role");
  const path = await d.path();
  const head = path ? (await import("node:fs")).readFileSync(path, "utf8").split("\n").slice(0, 2).join("\n") : "";
  await page.screenshot({ path: `${OUT}/csv-toast.png` });
  writeFileSync(`${OUT}/csv.txt`, `${d.suggestedFilename()}\n${toast.join(" / ")} role=${role}\n${head}`);
});
