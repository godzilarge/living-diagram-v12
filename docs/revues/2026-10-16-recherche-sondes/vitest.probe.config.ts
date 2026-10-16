import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const app = "/home/otosun/development/applications/demo/living-diagram-v12-biturbo/app";
export default defineConfig({
  root: app,
  resolve: { alias: { "@engine": app + "/../engine/src" } },
  test: { environment: "node", include: [process.env.PROBE_DIR + "/**/*.probe.ts"], dir: process.env.PROBE_DIR },
});
