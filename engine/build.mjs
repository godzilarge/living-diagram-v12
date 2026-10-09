// Construit les deux faces de la toile, sans minification des identifiants, déterministes (mêmes sources ⇒ mêmes
// octets), rangées dans les assets du backend : Python les sert telles quelles, sans jamais avoir besoin de Node.
// - `viewer.js` : la page `ld render` et la coquille `/view`, un seul fichier IIFE embarqué dans la page ;
// - `app/app.js`, `app/app.css`, `app/fonts/*` : l'application servie à `/` (React embarqué, polices embarquées,
//   zéro CDN), des fichiers lus à la requête, protégés par `script-src 'self'; style-src 'self'; font-src 'self'`.
// `--check` compare sans écrire : un fichier oublié après une modification des sources fait échouer la suite.
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(here, "../backend/src/ld_backend/render/assets");
export const OUTFILE = resolve(ASSETS, "js/viewer.js");
export const APP_DIR = resolve(ASSETS, "app");
const BANNER = "// Généré par engine/build.mjs depuis engine/src (TypeScript) : ne pas éditer ici, lancer `npm run build` dans engine/.";

const common = {
  absWorkingDir: here, // les chemins des modules en commentaire ne dépendent pas d'où le build est lancé
  bundle: true,
  target: ["es2020"],
  charset: "utf8",
  legalComments: "none",
  minify: false,
  sourcemap: false,
  treeShaking: true,
  logLevel: "warning",
};

export async function bundle(write) {
  const result = await build({ ...common, entryPoints: [resolve(here, "src/index.ts")], format: "iife", write, outfile: OUTFILE, banner: { js: BANNER } });
  return write ? null : result.outputFiles[0].text;
}

// L'application : un script, une feuille de style, les polices (latin et latin étendu, graisse variable) copiées
// sous `fonts/` avec leur nom (pas d'empreinte : les noms sont stables, le contenu est comparé). React est construit
// en production (`process.env.NODE_ENV`), sinon esbuild embarquerait sa version de développement.
export async function bundleApp(write) {
  const result = await build({
    ...common,
    entryPoints: [resolve(here, "src/app/main.tsx")],
    format: "iife",
    jsx: "automatic",
    minify: true, // React en production pèse 800 Ko lisibles : minifié, 260 Ko ; les sources sont dans le dépôt
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".woff2": "file" },
    assetNames: "fonts/[name]",
    entryNames: "app",
    outdir: APP_DIR,
    write,
    banner: { js: BANNER, css: "/* " + BANNER.slice(3) + " */" },
    metafile: false,
  });
  if (write) return null;
  return Object.fromEntries(result.outputFiles.map((file) => [relative(APP_DIR, file.path), file.contents]));
}

const same = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i]);
function listFiles(dir, prefix = "") {
  let out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out = out.concat(listFiles(resolve(dir, entry.name), prefix + entry.name + "/"));
    else out.push(prefix + entry.name);
  }
  return out.sort();
}

if (process.argv.includes("--check")) {
  let drift = false;
  const fresh = await bundle(false);
  let committed = null;
  try { committed = readFileSync(OUTFILE, "utf8"); } catch (error) { committed = null; }
  if (committed !== fresh) { drift = true; console.error(`viewer.js désynchronisé des sources : lancer \`npm run build\` dans engine/ (${OUTFILE})`); }
  const app = await bundleApp(false);
  let present = [];
  try { present = listFiles(APP_DIR); } catch (error) { present = []; }
  const wanted = Object.keys(app).sort();
  if (present.join("\n") !== wanted.join("\n")) { drift = true; console.error(`app/ : fichiers attendus ${wanted.join(", ")}, présents ${present.join(", ") || "aucun"}`); }
  for (const [name, contents] of Object.entries(app)) {
    let current = null;
    try { current = readFileSync(resolve(APP_DIR, name)); } catch (error) { current = null; }
    if (!current || !same(Array.from(current), Array.from(contents))) { drift = true; console.error(`app/${name} désynchronisé des sources : lancer \`npm run build\` dans engine/`); }
  }
  if (drift) process.exit(1);
  console.log("viewer.js et app/ à jour");
} else {
  await bundle(true);
  console.log(`écrit : ${OUTFILE}`);
  rmSync(APP_DIR, { recursive: true, force: true }); // un fichier d'une version d'avant ne survit pas au build
  await bundleApp(true);
  console.log(`écrit : ${APP_DIR}/ (${listFiles(APP_DIR).join(", ")})`);
}
