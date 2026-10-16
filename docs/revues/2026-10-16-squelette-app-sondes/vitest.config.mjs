// Configuration des sondes Vitest : cd app && npx vitest run --config ../docs/revues/2026-10-16-squelette-app-sondes/vitest.config.mjs
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
const cache = fileURLToPath(new URL("../../../app/node_modules/.vite-sondes", import.meta.url));
export default { cacheDir: cache, test: { root: here, include: ["gardes.test.ts", "preferences.test.ts"], globals: true, environment: "node" } };
