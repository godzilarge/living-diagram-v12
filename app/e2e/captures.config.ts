// The captures of a brick (`npx playwright test --config e2e/captures.config.ts`): the suite's server and browser,
// the capture scripts only (`*.capture.ts`), never part of `npm run e2e`.
import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({ ...base, testDir: ".", testMatch: "*.capture.ts", webServer: { ...server!, cwd: ".." } });
