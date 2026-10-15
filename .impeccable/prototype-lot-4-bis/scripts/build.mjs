// Assemble la page autonome : src/template.html + src/style.css + src/lucide.js + les modules de src/ dans l'ordre, et
// les polices (Inter et JetBrains Mono, sous-ensemble latin, droites et italiques) en data: URI. Aucune ressource
// externe : la page s'ouvre en file://. Lancer : node scripts/build.mjs (depuis le dossier du prototype).
// Les droites viennent des fichiers que l'application embarque ; les italiques, du paquet @fontsource-variable déjà
// installé dans engine/node_modules (l'application ne les embarque pas aujourd'hui : c'est l'une des questions).
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../src");
const APP_FONTS = join(HERE, "../../../backend/src/ld_backend/render/assets/app/fonts");
const NODE_FONTS = join(HERE, "../../../engine/node_modules/@fontsource-variable");

const face = async (family, path, weights, style) => {
  const b64 = (await readFile(path)).toString("base64");
  return `@font-face { font-family: "${family}"; font-style: ${style}; font-display: block; font-weight: ${weights}; src: url(data:font/woff2;base64,${b64}) format("woff2-variations"); }`;
};
const fonts = [
  await face("Inter Variable", join(APP_FONTS, "inter-latin-wght-normal.woff2"), "100 900", "normal"),
  await face("Inter Variable", join(NODE_FONTS, "inter/files/inter-latin-wght-italic.woff2"), "100 900", "italic"),
  await face("JetBrains Mono Variable", join(APP_FONTS, "jetbrains-mono-latin-wght-normal.woff2"), "100 800", "normal"),
  await face("JetBrains Mono Variable", join(NODE_FONTS, "jetbrains-mono/files/jetbrains-mono-latin-wght-italic.woff2"), "100 800", "italic"),
].join("\n");
const read = (f) => readFile(join(SRC, f), "utf8");
const MODULES = ["util.js", "scene.js", "draw.js", "fields.js", "bar.js", "volets.js", "main.js"];
let page = await read("template.html");
const [base, bis, icons, ...js] = await Promise.all([read("style-base.css"), read("style.css"), read("lucide.js"), ...MODULES.map(read)]);
const css = base + "\n" + bis;
// des remplaçants en fonction : un « $ » du code ne doit jamais être lu comme un motif de remplacement
page = page.replace("/*FONTS*/", () => fonts).replace("/*CSS*/", () => css).replace("/*ICONS*/", () => icons).replace("/*JS*/", () => js.join("\n"));
await writeFile(join(HERE, "../index.html"), page);
console.log(`index.html : ${(page.length / 1024).toFixed(0)} Ko`);
