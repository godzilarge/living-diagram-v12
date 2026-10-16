// Vite builds two pages (the shell, `index.html`, and the living primitives page, `primitives.html`) into `dist/`,
// served by the backend at `/next/`. `@engine` reaches the pure engine (`../engine/src`); its bare imports (i18next)
// resolve from this package. No asset is inlined: the CSP allows `'self'` only, never `data:`.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const engine = fileURLToPath(new URL("../engine/src", import.meta.url));
export const API = "http://127.0.0.1:8000";
// The policy the backend sends with `/next/` (backend/src/ld_backend/render/next.py): `vite preview` sends it too,
// so the measurement runs under the real policy.
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; " +
  "img-src 'self' blob:; base-uri 'none'; form-action 'none'";

export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/next/" : "/",
  plugins: [react()],
  resolve: {
    alias: { "@engine": engine },
    // the v1 canvas (engine/src/app/canvas) resolves these from this package too: one copy of each in the bundle
    dedupe: ["react", "react-dom", "i18next", "react-i18next", "lucide-react", "@xyflow/react", "prismjs"],
  },
  server: { proxy: { "/api": API }, fs: { allow: [".."] } },
  preview: { headers: { "Content-Security-Policy": CSP } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        primitives: fileURLToPath(new URL("primitives.html", import.meta.url)),
      },
    },
  },
  test: { environment: "node", include: ["tests/**/*.test.{ts,tsx}"] },
}));
