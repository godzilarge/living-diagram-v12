// La configuration des sondes : celle de l'application, sur un autre port (une autre suite peut tourner en même temps).
// À copier dans app/ avec sondes.spec.ts dans app/e2e/, puis : npx playwright test -c playwright.sondes.config.ts sondes.spec.ts
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const PORT = 4391;
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://127.0.0.1:${PORT}` },
  webServer: { ...base.webServer, command: `npx vite build --outDir dist-sondes && npx vite preview --outDir dist-sondes --host 127.0.0.1 --port ${PORT} --strictPort`, url: `http://127.0.0.1:${PORT}/next/primitives.html` },
});
