import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "/home/user/living-diagram-v12/app/e2e", testMatch: "journal.spec.ts", timeout: 60_000, workers: 1, reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4393", browserName: "chromium", headless: true, viewport: { width: 1440, height: 900 }, launchOptions: { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }, locale: "en-GB", timezoneId: "UTC" },
  webServer: { command: "cd /home/user/living-diagram-v12/app && npx vite preview --host 127.0.0.1 --port 4393 --strictPort --outDir /tmp/claude-0/-home-user-living-diagram-v12/957076b1-e595-56de-aba6-b1bd4895fc10/scratchpad/dist", url: "http://127.0.0.1:4393/next/primitives.html", reuseExistingServer: false, timeout: 60_000 },
});
