// The bench is bundled into ../grille/, served at /grille/ by the sandbox server (cd bac-a-sable && python3 -m
// http.server 8016 --bind 0.0.0.0). No external resource: the font is embedded from public/fonts/.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/grille/",
  plugins: [react()],
  build: { outDir: "../grille", emptyOutDir: true, assetsInlineLimit: 0 },
});
