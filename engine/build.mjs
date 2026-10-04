// Construit la toile en un seul fichier, sans minification, déterministe (mêmes sources ⇒ mêmes octets), rangé dans
// les assets du backend : Python l'embarque tel quel, sans jamais avoir besoin de Node. `--check` compare sans écrire.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
export const OUTFILE = resolve(here, "../backend/src/ld_backend/render/assets/js/viewer.js");
const BANNER = "// Généré par engine/build.mjs depuis engine/src (TypeScript) : ne pas éditer ici, lancer `npm run build` dans engine/.";

export async function bundle(write) {
  const result = await build({
    entryPoints: [resolve(here, "src/index.ts")],
    absWorkingDir: here, // les chemins des modules en commentaire ne dépendent pas d'où le build est lancé
    bundle: true,
    format: "iife",
    target: ["es2020"],
    charset: "utf8",
    legalComments: "none",
    minify: false,
    sourcemap: false,
    treeShaking: true,
    write,
    outfile: OUTFILE,
    banner: { js: BANNER },
    logLevel: "warning",
  });
  return write ? null : result.outputFiles[0].text;
}

if (process.argv.includes("--check")) {
  const fresh = await bundle(false);
  let committed = null;
  try { committed = readFileSync(OUTFILE, "utf8"); } catch (error) { committed = null; }
  if (committed !== fresh) {
    console.error(`viewer.js désynchronisé des sources : lancer \`npm run build\` dans engine/ (${OUTFILE})`);
    process.exit(1);
  }
  console.log("viewer.js à jour");
} else {
  await bundle(true);
  console.log(`écrit : ${OUTFILE}`);
}
