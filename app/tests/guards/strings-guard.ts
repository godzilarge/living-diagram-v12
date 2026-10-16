// The strings guard: no visible French or English text outside the i18n catalogues (src/i18n/locales). Read with
// the TypeScript parser on every .ts / .tsx of src/ (the catalogues and the i18n module aside):
//   1. JSX text with a letter;
//   2. a literal value on an attribute that is read aloud or shown (aria-label, placeholder, label, tooltip…);
//   3. any other string literal that reads as words: French (an accented letter, French typography, a French
//      function word), English prose (a capitalised word followed by others, or three words), or a value of the
//      catalogues spelt in code.
// Not text: string literal types, property names, import paths, the message of `new Error(…)` (for developers,
// never shown). An exception is declared in ALLOWED with its reason, never in silence.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import type { Finding } from "./tokens-guard";
import type { Source } from "./files";
import { SRC } from "./files";

export const I18N_DIR = "src/i18n/";
export const ALLOWED: ReadonlyMap<string, string> = new Map([
  // `path:text` → reason
]);

const VISIBLE_ATTRIBUTES = new Set([
  "aria-label", "aria-description", "aria-valuetext", "aria-roledescription", "aria-placeholder", "placeholder", "alt",
  "label", "title", "subtitle", "tooltip", "caption", "message", "note", "disabledReason", "closeLabel", "countLabel",
]);
const LETTER = /\p{L}/u;
const FRENCH_LETTER = /[àâæçéèêëîïôœùûüÿÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ]/;
const FRENCH_TYPOGRAPHY = /\s[:;!?](\s|$)|[«»]/;
const FRENCH_WORD = /(^|\s)(le|la|les|des|une|du|au|aux|avec|sans|pour|dans|sur|est|sont|et|ou|pas|par|de|un)\s/i;
const ENGLISH_PROSE = /^[A-Z][a-z]+(?:[\s,'-]+[A-Za-z]+)+[.!?:]?$/;
// one code token (`shell:prefs.theme`, `ArrowRight` is not one: capitalised), or a list of class names
const KEY = /^[a-z][a-zA-Z0-9]*(?:[-_.:/]+[a-zA-Z0-9]+)*[-_.:/]?$/;
const CLASSES = /^(?:[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+\s*)+$/;
const IDENTIFIERS = { test: (text: string) => KEY.test(text) || CLASSES.test(text) };

/** Every string value of the catalogues, both languages: a catalogue text spelt in code is a duplicate. */
function catalogueTexts(): Set<string> {
  const out = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === "string") out.add(value);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  const root = join(SRC, "i18n", "locales");
  for (const language of readdirSync(root))
    for (const file of readdirSync(join(root, language)).filter((name) => name.endsWith(".json")))
      walk(JSON.parse(readFileSync(join(root, language, file), "utf8")));
  return out;
}
const CATALOGUE = catalogueTexts();

export function looksLikeWords(text: string): boolean {
  const trimmed = text.trim();
  if (!LETTER.test(trimmed) || IDENTIFIERS.test(trimmed)) return false;
  if (FRENCH_LETTER.test(trimmed) || FRENCH_TYPOGRAPHY.test(trimmed) || FRENCH_WORD.test(` ${trimmed} `)) return true;
  if (ENGLISH_PROSE.test(trimmed)) return true;
  if ((trimmed.match(/\p{L}{2,}/gu) ?? []).length >= 3) return true;
  return trimmed.length >= 3 && CATALOGUE.has(trimmed);
}

function notText(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): boolean {
  const parent = node.parent;
  if (ts.isLiteralTypeNode(parent) || ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node) return true;
  if (ts.isExternalModuleReference(parent) || ts.isImportTypeNode(parent)) return true;
  return ts.isNewExpression(parent) && parent.expression.getText() === "Error";
}

export function stringFindings(source: Source): Finding[] {
  if (source.path.startsWith(I18N_DIR) || !/\.tsx?$/.test(source.path)) return [];
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true, source.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Finding[] = [];
  const push = (node: ts.Node, text: string) => {
    if (ALLOWED.has(`${source.path}:${text.trim()}`)) return;
    found.push({ path: source.path, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, text: text.trim() });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && LETTER.test(node.text)) push(node, node.text);
    else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && VISIBLE_ATTRIBUTES.has(node.name.getText(file)) && LETTER.test(node.initializer.text)) {
      push(node, `${node.name.getText(file)}="${node.initializer.text}"`);
      return;
    }
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !notText(node) && looksLikeWords(node.text)) push(node, node.text);
    else if ((ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && looksLikeWords(node.text)) push(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
