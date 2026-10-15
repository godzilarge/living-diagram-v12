// Assemble la page autonome : src/template.html + src/style.css + src/lucide.js + Prism (vendor/, recopié tel quel, version
// épinglée) + les modules de src/ dans l'ordre, et
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

const face = async (family, path, weights, style, range = "") => {
  const b64 = (await readFile(path)).toString("base64");
  return `@font-face { font-family: "${family}"; font-style: ${style}; font-display: block; font-weight: ${weights}; src: url(data:font/woff2;base64,${b64}) format("woff2${weights.includes(" ") ? "-variations" : ""}");${range ? ` unicode-range: ${range};` : ""} }`;
};
// Lot 16 : les polices à chasse fixe proposées pour un bloc de code (vendor/fonts/, OFL, @fontsource 5.3.0, regular 400,
// latin et latin étendu ; unicode-range recopiés des feuilles @fontsource). JetBrains Mono : les fichiers de l'application.
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
const VF = join(HERE, "../vendor/fonts");
const codeFonts = [];
for (const [family, dir] of [["IBM Plex Mono", "ibm-plex-mono"], ["Source Code Pro", "source-code-pro"], ["Cascadia Mono", "cascadia-mono"]]) {
  codeFonts.push(await face(family, join(VF, dir, `${dir}-latin-400-normal.woff2`), "400", "normal", LATIN));
  codeFonts.push(await face(family, join(VF, dir, `${dir}-latin-ext-400-normal.woff2`), "400", "normal", LATIN_EXT));
}
const fonts = [
  await face("Inter Variable", join(APP_FONTS, "inter-latin-wght-normal.woff2"), "100 900", "normal"),
  await face("Inter Variable", join(NODE_FONTS, "inter/files/inter-latin-wght-italic.woff2"), "100 900", "italic"),
  await face("JetBrains Mono Variable", join(APP_FONTS, "jetbrains-mono-latin-wght-normal.woff2"), "100 800", "normal"),
  await face("JetBrains Mono Variable", join(NODE_FONTS, "jetbrains-mono/files/jetbrains-mono-latin-wght-italic.woff2"), "100 800", "italic"),
  ...codeFonts,
].join("\n");
const read = (f) => readFile(join(SRC, f), "utf8");
const VENDOR = join(HERE, "../vendor");
// Prism 1.30.0 (MIT) : le cœur et quatre grammaires officielles, puis la grammaire Cisco (MIT, recopiée) et FortiOS (écrite
// ici). `manual` : Prism ne parcourt jamais la page à la recherche de <code> à colorier ; seul Prism.tokenize est appelé.
const prism = ["window.Prism = { manual: true, disableWorkerMessageHandler: true };",
  ...(await Promise.all(["prism-core.min.js", "prism-python.min.js", "prism-bash.min.js", "prism-json.min.js", "prism-yaml.min.js", "prism-cisco.js"].map((f) => readFile(join(VENDOR, f), "utf8")))),
  await read("prism-fortios.js")].join("\n");
const MODULES = ["util.js", "code.js", "samples.js", "scene.js", "draw.js", "codedraw.js", "fields.js", "bar.js", "volets.js", "main.js", "codeui.js"];
let page = await read("template.html");
const [base, bis, icons, ...js] = await Promise.all([read("style-base.css"), read("style.css"), read("lucide.js"), ...MODULES.map(read)]);
const css = base + "\n" + bis + "\n" + (await read("code.css"));
// des remplaçants en fonction : un « $ » du code ne doit jamais être lu comme un motif de remplacement
page = page.replace("/*FONTS*/", () => fonts).replace("/*CSS*/", () => css).replace("/*ICONS*/", () => icons).replace("/*JS*/", () => prism + "\n" + js.join("\n"));
await writeFile(join(HERE, "../index.html"), page);
console.log(`index.html : ${(page.length / 1024).toFixed(0)} Ko`);
