// Recopie les icônes Lucide utilisées par le prototype en SVG inline (src/lucide.js), depuis le paquet déjà installé
// dans engine/node_modules (lecture seule). Lancer : node scripts/icons.mjs (depuis le dossier du prototype).
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ICONS = join(HERE, "../../../engine/node_modules/lucide-react/dist/esm/icons");
const NAMES = [
  "undo-2", "redo-2", "maximize", "crosshair", "sticky-note", "square", "circle", "table", "move-up-right", "image", "x",
  "align-start-vertical", "align-center-vertical", "align-end-vertical", "align-start-horizontal", "align-center-horizontal",
  "align-end-horizontal", "align-horizontal-space-around", "align-vertical-space-around", "layout-grid", "minus", "plus",
  "ruler-dimension-line", "magnet", "grid-3x3", "map", "sun", "moon", "search", "git-compare-arrows", "sliders-horizontal",
  "user", "workflow", "shield-check", "history", "check", "chevron-left", "chevron-right", "chevron-down", "keyboard",
  "pin", "pin-off", "group", "sticky-note-plus", "eye-off", "focus", "copy", "copy-plus", "trash-2", "lock", "lock-open",
  "layers", "bold", "a-large-small", "text-align-start", "text-align-center", "text-align-end", "square-dashed-mouse-pointer",
  "paintbrush", "bring-to-front", "send-to-back", "rotate-ccw",
];

const attrs = (o) => Object.entries(o).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ");
const out = {};
for (const name of NAMES) {
  // le module se lit comme du texte : on en garde le littéral `__iconData` (certains noms sont des alias qui réexportent)
  let src = await readFile(join(ICONS, `${name}.mjs`), "utf8");
  const alias = src.match(/from '\.\/([\w-]+)\.mjs'/);
  if (!/const __iconData/.test(src) && alias) src = await readFile(join(ICONS, `${alias[1]}.mjs`), "utf8");
  const literal = src.match(/const __iconData = (\{[\s\S]*?\n\});/)[1];
  const node = new Function(`return ${literal}`)().node;
  out[name] = node.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join("");
}
await writeFile(join(HERE, "../src/lucide.js"), `// Icônes Lucide (ISC), lucide-react ${JSON.parse(await readFile(join(ICONS, "../../../package.json"), "utf8")).version}, recopiées par scripts/icons.mjs.\nconst LUCIDE = ${JSON.stringify(out, null, 0)};\n`);
console.log(`${NAMES.length} icônes`);
