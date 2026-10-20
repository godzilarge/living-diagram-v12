// The strings guard: no visible French or English text outside the i18n catalogues (src/i18n/locales). Read with
// the TypeScript parser on every .ts / .tsx of src/ (the catalogues and the i18n module aside):
//   1. JSX text with a letter, and a string with a letter written as a JSX child (`{"Topology"}`);
//   2. a literal value on an attribute or an object property that is read aloud or shown (aria-label, placeholder,
//      label, tooltip…), as `label="…"`, `label={"…"}` or `{ label: "…" }`;
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
  ["src/api/journal.ts:/api/intent/journal", "an API route (three path segments read as three words), never shown"],
  ["src/state/journal.ts:#mode=journal&jinfra=", "the address of an entry's link (its keys), never shown as words"],
  ["src/api/run.ts:/api/ingest/bundles", "an API route, never shown"],
  ["src/api/run.ts:/api/ingest/report", "an API route, never shown"],
  ["src/api/assets.ts:/api/intent/assets", "an API route, never shown"],
  ["src/ui/Palette.tsx:Tab", "a KeyboardEvent key name compared, never shown (the chip's word comes from ui:keys.tab)"],
  ["src/ui/Palette.tsx:Enter", "a KeyboardEvent key name compared, never shown (the chip's word comes from edit:keys.enter)"],
  ["src/ui/Select.tsx:Enter", "a KeyboardEvent key name compared, never shown"],
  ["src/ui/Table.tsx:Enter", "a KeyboardEvent key name compared, never shown"],
  ["src/state/edit-keys.ts:Enter", "a KeyboardEvent key name compared, never shown"],
  ["src/state/edit-keys.ts:Delete", "a KeyboardEvent key name compared, never shown (the word comes from edit:bar.delete)"],
  ["src/state/edit-keys.ts:Tab", "a KeyboardEvent key name compared, never shown"],
  ["src/state/edit-commands.ts:[data-image-file]", "a selector (the palette's file input), never shown"],
  ["src/state/bars.ts:Delete", "the standard's key name for aria-keyshortcuts, never shown (the chip's word comes from edit:keys.delete)"],
  ["src/state/bars.ts:Enter", "the standard's key name for aria-keyshortcuts, never shown (the chip's word comes from edit:keys.enter)"],
  ["src/diagram/Diagram.tsx:[data-float=\"context-bar\"] .ui-control:not([aria-disabled=\"true\"])", "a selector (the bar's first control, which Tab reaches), never shown"],
  ["src/diagram/Diagram.tsx:.react-flow__node[data-id=\"", "a selector (the canvas node that takes the focus after Tab), never shown"],
  ["src/edit/focus.ts:.react-flow__node.selected", "a selector (the selected node the focus goes back to), never shown"],
  ["src/edit/focus.ts:image/png,image/jpeg,image/webp", "MIME types (the file input's accept), never shown"],
  ["src/diagram/useEditKeys.ts:[data-float='context-bar']", "a selector (the contextual bar), never shown"],
  ["src/edit/ContextBar.tsx:.react-flow__minimap", "a selector (the minimap, an island the bar never covers), never shown"],
  ["src/diagram/useEditKeys.ts:Home", "a KeyboardEvent key name compared, never shown"],
  ["src/edit/useToolbarKeys.ts:Home", "a KeyboardEvent key name compared, never shown"],
  ["src/ui/Menu.tsx:Home", "a KeyboardEvent key name compared, never shown"],
  ["src/ui/Menu.tsx:Enter", "a KeyboardEvent key name compared, never shown"],
  ["src/ui/Menu.tsx:[data-menu-item]", "a selector (the rows the keys walk), never shown"],
  ["src/shell/ShellTools.tsx:Enter", "a KeyboardEvent key name compared, never shown"],
  ["src/ui/Feed.tsx:[data-feed-row]", "a selector (the heads of the rows the keys walk), never shown"],
  ["src/ui/Feed.tsx:Home", "a KeyboardEvent key name compared, never shown"],
  ["src/ui/Facets.tsx:Home", "a KeyboardEvent key name compared, never shown"],
  ["src/journal/Journal.tsx:0px 0px 600px 0px", "an IntersectionObserver margin (the next page is read 600 px before the foot), never shown"],
  ["src/journal/JournalTools.tsx:text/csv;charset=utf-8", "a MIME type (the exported file's), never shown"],
  ["src/state/home.ts:#mode=journal&jinfra=*", "the address of the Log of every infrastructure (its keys), never shown as words"],
]);

const VISIBLE_ATTRIBUTES = new Set([
  "aria-label", "aria-description", "aria-valuetext", "aria-roledescription", "aria-placeholder", "placeholder", "alt",
  "label", "title", "subtitle", "tooltip", "caption", "message", "note", "disabledReason", "closeLabel", "countLabel",
  "heading", "subheading", "ariaLabel", "text",
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
  const literal = (node: ts.Node | undefined) => {
    const inner = node && ts.isJsxExpression(node) ? node.expression : node;
    return inner && (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) && LETTER.test(inner.text) ? inner.text : null;
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && LETTER.test(node.text)) push(node, node.text);
    else if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) && literal(node) !== null) {
      push(node, literal(node) as string);
      return;
    } else if (ts.isJsxAttribute(node) && VISIBLE_ATTRIBUTES.has(node.name.getText(file)) && literal(node.initializer) !== null) {
      push(node, `${node.name.getText(file)}="${literal(node.initializer)}"`);
      return;
    } else if (ts.isPropertyAssignment(node) && VISIBLE_ATTRIBUTES.has(node.name.getText(file).replace(/["']/g, "")) && literal(node.initializer) !== null) {
      push(node, `${node.name.getText(file)}: "${literal(node.initializer)}"`);
      return;
    }
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !notText(node) && looksLikeWords(node.text)) push(node, node.text);
    else if ((ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && looksLikeWords(node.text)) push(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
