// Assemble la page autonome : src/template.html + src/style.css + src/lucide.js + src/app.js, et les deux polices
// (Inter et JetBrains Mono, sous-ensemble latin, celles que l'application embarque) en data: URI. Aucune ressource
// externe : la page s'ouvre en file://. Lancer : node scripts/build.mjs (depuis le dossier du prototype).
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../src");
const FONTS = join(HERE, "../../../backend/src/ld_backend/render/assets/app/fonts");

const face = async (family, file, weights) => {
  const b64 = (await readFile(join(FONTS, file))).toString("base64");
  return `@font-face { font-family: "${family}"; font-style: normal; font-display: block; font-weight: ${weights}; src: url(data:font/woff2;base64,${b64}) format("woff2-variations"); }`;
};
const fonts = [await face("Inter Variable", "inter-latin-wght-normal.woff2", "100 900"), await face("JetBrains Mono Variable", "jetbrains-mono-latin-wght-normal.woff2", "100 800")].join("\n");
const read = (f) => readFile(join(SRC, f), "utf8");
let page = await read("template.html");
const [css, icons, js] = await Promise.all([read("style.css"), read("lucide.js"), read("app.js")]);
// des remplaçants en fonction : un « $ » du code ne doit jamais être lu comme un motif de remplacement
page = page.replace("/*FONTS*/", () => fonts).replace("/*CSS*/", () => css).replace("/*ICONS*/", () => icons).replace("/*JS*/", () => js);
await writeFile(join(HERE, "../index.html"), page);
console.log(`index.html : ${(page.length / 1024).toFixed(0)} Ko`);
