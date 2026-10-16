// The DOM measurement of the primitives page and the shell, in Chromium, on the built pages served by `vite preview`
// under the backend's CSP. `npm run e2e` builds first.
import { defineConfig } from "@playwright/test";

const PORT = 4317;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: "en-GB",
    // the fixtures' dates are UTC: the page shows them as written, whatever the machine's zone
    timezoneId: "UTC",
  },
  webServer: {
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/next/primitives.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
