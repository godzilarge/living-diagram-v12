// TEMPORARY (review of brick 5): the same measurement on another port and another build directory; deleted after the review.
import { defineConfig } from "@playwright/test";
const PORT = 4391;
const OUT = "/tmp/ld-revue-dist";
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, browserName: "chromium", headless: true, viewport: { width: 1440, height: 900 }, locale: "en-GB", timezoneId: "UTC" },
  webServer: {
    command: `npx vite build --outDir ${OUT} --emptyOutDir && npx vite preview --outDir ${OUT} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/next/primitives.html`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
