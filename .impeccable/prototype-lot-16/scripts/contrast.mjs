// Le contraste de chaque couleur de jeton sur le fond du bloc (et la gouttière, l'en-tête), dans les deux thèmes.
// WCAG 2.x : 4,5:1 pour le texte. Lancer : node scripts/contrast.mjs (depuis le dossier du prototype).
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const css = await readFile(join(dirname(fileURLToPath(import.meta.url)), "../src/code.css"), "utf8");
const block = (sel) => Object.fromEntries([...css.split(sel)[1].split("}")[0].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
let worst = 99;
for (const [name, sel] of [["sombre", ":root {"], ["clair", ':root[data-theme="light"] {']]) {
  const v = block(sel);
  const rows = Object.keys(v).filter((k) => k.startsWith("tk-") || k === "code-ink" || k === "code-num").map((k) => {
    const r = Math.min(ratio(v[k], v["code-bg"]), ratio(v[k], v["code-gutter"]), ratio(v[k], v["code-head"]));
    worst = Math.min(worst, r);
    return `${k.padEnd(12)} ${v[k]}  ${r.toFixed(2)}${r < 4.5 ? "  < 4,5 !" : ""}`;
  });
  console.log(`— ${name} (fond ${v["code-bg"]})\n` + rows.join("\n"));
}
console.log(`le plus faible : ${worst.toFixed(2)}:1`);
