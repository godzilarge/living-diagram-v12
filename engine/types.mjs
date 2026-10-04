// Les types TypeScript des contrats, générés depuis les JSON Schema versionnés de `ld-contracts` : une seule source,
// aucune dérive possible (`npm run types`, puis un test compare le résultat aux fichiers versionnés).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMAS = resolve(here, "../contracts/src/ld_contracts/schema");
const OUT = resolve(here, "src/contracts");
export const CONTRACTS = [
  ["snapshot", "snapshot-v1.schema.json"],
  ["diff", "diff-v1.schema.json"],
  ["intent", "intent-v1.schema.json"],
];

const banner = (file) => `// Généré par engine/types.mjs depuis contracts/src/ld_contracts/schema/${file} : ne pas éditer.\n// Référence : contracts/CONTRAT.md. Régénérer avec \`npm run types\` dans engine/.\n`;

// Pydantic titre chaque propriété (« Hostname », « Endpoint »…) : sans ce ménage, le générateur fabriquerait un alias
// par propriété (`Hostname1`, `Endpoint3`…). Les titres des définitions (`$defs`) sont gardés : ce sont les noms des types.
function stripPropertyTitles(node) {
  if (Array.isArray(node)) return node.map(stripPropertyTitles);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" && value && typeof value === "object") {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, prop]) => {
        const { title, ...rest } = stripPropertyTitles(prop);
        // Un `$ref` accompagné d'une description est lu comme un type à part (`Endpoint1`) : on ne garde que la référence,
        // la définition porte déjà sa propre description.
        return [name, "$ref" in rest ? { $ref: rest.$ref } : rest];
      }));
    } else out[key] = stripPropertyTitles(value);
  }
  return out;
}

export async function generate(name, file) {
  let schema;
  try {
    schema = JSON.parse(readFileSync(resolve(SCHEMAS, file), "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null; // un contrat pas encore écrit : rien à générer
    throw error;
  }
  const text = await compile(stripPropertyTitles(schema), schema.title, {
    bannerComment: banner(file),
    additionalProperties: false,
    strictIndexSignatures: true,
    declareExternallyReferenced: true,
    style: { printWidth: 120, singleQuote: false, semi: true },
  });
  return { path: resolve(OUT, `${name}.ts`), text };
}

const check = process.argv.includes("--check");
let drift = false;
for (const [name, file] of CONTRACTS) {
  const out = await generate(name, file);
  if (!out) continue;
  if (check) {
    let current = null;
    try { current = readFileSync(out.path, "utf8"); } catch (error) { current = null; }
    if (current !== out.text) { drift = true; console.error(`types désynchronisés : ${out.path}`); }
  } else {
    writeFileSync(out.path, out.text);
    console.log(`écrit : ${out.path}`);
  }
}
if (check && drift) process.exit(1);
if (check) console.log("types à jour");
