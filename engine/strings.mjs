// Aucune chaîne française en dur dans l'application (2026-10-10, lot 8 de la langue) : tout texte que l'application
// peut afficher vient des catalogues (`src/i18n/locales/<langue>/*.json`). Le périmètre est exactement ce que
// l'application livre : le fichier que esbuild construit depuis `src/app/main.tsx`, arbre secoué, sans ses catalogues
// (la toile, les hôtes et ce qu'elle garde des modules partagés avec `/view` compris), lu par le compilateur TypeScript. Un texte français se reconnaît à une lettre
// accentuée du français, à un mot outil français entre deux espaces, à un mot que seul le français des catalogues
// emploie, ou à la typographie française (« : » précédé d'une espace, guillemets) ; les commentaires ne comptent pas (ils sont en
// français par convention, et esbuild les retire), les chaînes et les gabarits comptent (le JSX y est déjà compilé). Une exception se déclare dans
// `ALLOWED` avec sa raison, jamais en silence. `node strings.mjs` liste ; `--check` échoue s'il reste une chaîne.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const FRENCH_LETTER = /[àâæçéèêëîïôœùûüÿÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ]/;
const FRENCH_WORD = /(^|\s)(le|la|les|des|une|du|au|aux|aucun|aucune|avec|sans|pour|dans|sur|est|sont|et|ou|pas|par|de|un)\s/i;
// La typographie française : espace avant « : », « ; », « ! », « ? », et les guillemets « ».
const FRENCH_TYPOGRAPHY = /\s[:;!?](\s|$)|[«»]/;

/** Les mots que le français des catalogues emploie et que l'anglais n'emploie pas (trois lettres au moins) : « toutes »,
 *  « supprimer », « masquer »… Un mot français sans accent ni mot outil se reconnaît ainsi (revue de l'interface
 *  bilingue, M1 : « toutes » passait). Tiré des catalogues à chaque lancement : il suit leurs changements. */
function lexicon() {
  const words = (language) => {
    const out = new Set();
    const dir = resolve(here, "src/i18n/locales", language);
    const walk = (value) => {
      if (typeof value === "string") { for (const w of value.replace(/\{\{[^}]*\}\}/g, " ").toLowerCase().match(/\p{L}{3,}/gu) || []) out.add(w); }
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) walk(JSON.parse(readFileSync(resolve(dir, file), "utf8")));
    return out;
  };
  const english = words("en");
  // Les mots du code (noms d'espaces, clés des catalogues, `journal`, `mode=journal`) ne sont pas des textes français.
  const code = new Set();
  const keys = (value) => { if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) { for (const w of key.toLowerCase().match(/\p{L}{3,}/gu) || []) code.add(w); keys(inner); } };
  for (const file of readdirSync(resolve(here, "src/i18n/locales/fr")).filter((name) => name.endsWith(".json"))) {
    code.add(file.slice(0, -5));
    keys(JSON.parse(readFileSync(resolve(here, "src/i18n/locales/fr", file), "utf8")));
  }
  return new Set(Array.from(words("fr")).filter((w) => !english.has(w) && !code.has(w)));
}
const FRENCH_ONLY = lexicon();

// `fichier:texte` → raison. Un texte qui n'est jamais montré, ou qui est une donnée et non un mot de l'interface.
export const ALLOWED = new Map([
  ["src/i18n/core.ts:Français", "le nom d'une langue s'écrit dans sa langue, quelle que soit celle de la page (sélecteur)"],
  ["src/canvas/groups.ts:sans", "valeur du contrat (`label_font` : `sans` | `mono`), jamais affichée telle quelle"],
  ["src/canvas/connectors.ts:sans", "valeur du contrat (`text_font` : `sans` | `mono`), jamais affichée telle quelle"],
  ["src/canvas/annotations.ts:sans", "valeur du contrat (`text_font` : `sans` | `mono`), jamais affichée telle quelle (le brouillon d'un bloc de code lit les défauts, lot 16)"],
  ["src/app/code/tokens.ts:comment", "nom d'un jeton de Prism (`comment`, la famille des commentaires), jamais affiché"],
  ["src/app/state/text-format.ts:sans", "valeur du contrat (`text_font` / `label_font` : `sans` | `mono`), le défaut d'un style relu sans police (lot 4 bis)"],
  ["src/app/components/TextVolets.tsx:sans", "valeur du contrat (`text_font` : `sans` | `mono`) d'un choix du volet ; le mot affiché vient des catalogues (lot 4 bis)"],
]);
// Garde-fou : le scan lit bien l'application (un fichier livré vide ou mal découpé ne prouverait rien).
const MIN_TEXTS = 500;

/** L'application telle qu'elle est livrée, sans minification et sans ses catalogues (remplacés par `{}`) : ce que
 *  l'arbre secoué garde, et seulement cela. Une fonction de `/view` jamais appelée par l'application n'y est pas. */
async function shipped() {
  const stubLocales = { name: "stub-locales", setup(b) { b.onLoad({ filter: /i18n[\\/]locales[\\/].*\.json$/ }, () => ({ contents: "{}", loader: "json" })); } };
  const result = await build({
    absWorkingDir: here, entryPoints: [resolve(here, "src/app/main.tsx")], bundle: true, write: false, minify: false, treeShaking: true,
    format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, loader: { ".woff2": "empty", ".css": "empty" },
    outdir: resolve(here, ".strings"), logLevel: "silent", plugins: [stubLocales],
  });
  return result.outputFiles.find((file) => file.path.endsWith(".js")).text;
}

/** Les textes du fichier livré, chacun rattaché au module source que esbuild annonce avant lui (`// src/…`). */
function textsOf(code) {
  const source = ts.createSourceFile("app.js", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const marks = Array.from(code.matchAll(/^\s*\/\/ (\S+)$/gm), (m) => ({ at: m.index, module: m[1] }));
  const moduleAt = (pos) => { let found = ""; for (const mark of marks) { if (mark.at > pos) break; found = mark.module; } return found; };
  const out = [];
  const push = (node, text) => {
    if (!text.trim()) return;
    const pos = node.getStart(source);
    out.push({ module: moduleAt(pos), text });
  };
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) push(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) push(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** Une liste de classes CSS ou d'identifiants (`sheet-card glass palette-types`) : du code, pas un texte affiché. */
const identifiers = (text) => { const tokens = text.trim().split(/\s+/); return tokens.every((w) => /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(w)) && tokens.some((w) => /[-_]/.test(w)); };

export const looksFrench = (text) => !identifiers(text) && looksFrenchText(text);
const looksFrenchText = (text) => FRENCH_LETTER.test(text) || FRENCH_WORD.test(" " + text + " ") || FRENCH_TYPOGRAPHY.test(text)
  || (text.toLowerCase().match(/\p{L}{3,}/gu) || []).some((w) => FRENCH_ONLY.has(w));

/** Les textes de nos sources (`src/`) que l'application livre ; les bibliothèques ne sont pas à nous. */
export async function ours() {
  return textsOf(await shipped()).filter(({ module }) => module.startsWith("src/"));
}

export async function findings(texts) {
  return (texts || (await ours())).filter(({ module, text }) => looksFrench(text) && !ALLOWED.has(module + ":" + text));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const texts = await ours();
  const sane = looksFrench("aucun équipement") && looksFrench("rien à faire") && looksFrench("voir la liste") && looksFrench("toutes") && looksFrench("retour au journal")
    && looksFrench("Diagramme") && looksFrench("nom : x") && !looksFrench("no device found") && !looksFrench("ha-member") && !looksFrench("name: x");
  if (!sane || texts.length < MIN_TEXTS) { console.error(`strings.mjs : le détecteur ou le découpage ne tient plus (${texts.length} textes lus)`); process.exit(2); }
  const found = await findings(texts);
  for (const f of found) console.log(`${f.module}  ${JSON.stringify(f.text).slice(0, 140)}`);
  if (process.argv.includes("--check") && found.length) {
    console.error(`${found.length} chaîne(s) française(s) en dur dans l'application : passer par les catalogues (src/i18n/locales), ou déclarer l'exception dans strings.mjs (ALLOWED)`);
    process.exit(1);
  }
}
