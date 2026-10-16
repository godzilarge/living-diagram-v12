// The tokens guard: no raw colour, radius, shadow, font family or font size outside src/styles/tokens.css. A CSS
// value takes a token (`var(--…)`) or a keyword; a script never writes a colour or one of those properties.
import ts from "typescript";
import type { Source } from "./files";

export const TOKENS_FILE = "src/styles/tokens.css";

const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
// CSS named colours (the complete list would add nothing: a design colour is never spelt otherwise)
const NAMED = /\b(?:black|white|red|green|blue|yellow|orange|purple|violet|pink|gray|grey|silver|maroon|navy|teal|olive|lime|aqua|cyan|magenta|fuchsia|brown|gold|indigo|crimson|coral|salmon|tomato|beige|ivory|khaki|lavender|plum|tan|turquoise|wheat)\b/i;
const COLOUR_PROPERTY = /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline))?(?:-color)?|outline(?:-color)?|fill|stroke|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|box-shadow|text-shadow)$/;
const KEYWORDS = /^(?:inherit|initial|unset|revert|none|0|transparent|currentcolor)$/i;
// a value built from tokens only; a `calc(…)` may combine tokens and plain numbers, never a length of its own
const TOKENISED = { test: (value: string) => /^(?:var\(--[\w-]+\)|calc\([^;]*\)|[\s,])+$/.test(value) && !/\d(?:px|rem|em)\b/.test(value) };
const WEIGHT_KEYWORDS = /^(?:inherit|initial|unset|normal)$/;

export type Finding = Readonly<{ path: string; line: number; text: string }>;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Declarations of a stylesheet, comments removed, with whether they sit in an @font-face block. */
function declarations(css: string): { property: string; value: string; at: number; fontFace: boolean }[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const out: { property: string; value: string; at: number; fontFace: boolean }[] = [];
  const faces = [...clean.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => [m.index, m.index + m[0].length]);
  // the last declaration of a block may go without its `;`
  for (const m of clean.matchAll(/([a-z-]+)\s*:\s*([^;{}]+?)\s*(?:;|(?=\}))/gi)) {
    const at = m.index;
    out.push({ property: m[1].toLowerCase(), value: m[2].trim(), at, fontFace: faces.some(([a, b]) => at > a && at < b) });
  }
  return out;
}

export function cssFindings(source: Source): Finding[] {
  if (source.path === TOKENS_FILE) return [];
  const found: Finding[] = [];
  for (const { property, value, at, fontFace } of declarations(source.text)) {
    const report = () => found.push({ path: source.path, line: lineOf(source.text, at), text: `${property}: ${value}` });
    const bare = value.replace(/var\(--[\w-]+\)/g, "");
    if (RAW_COLOUR.test(bare)) report();
    else if ((COLOUR_PROPERTY.test(property) || /gradient\(|image|mask/.test(property + value)) && NAMED.test(bare)) report();
    else if (/radius$/.test(property) && !(KEYWORDS.test(value) || TOKENISED.test(value))) report();
    else if (/^(?:box|text)-shadow$/.test(property) && !(KEYWORDS.test(value) || TOKENISED.test(value))) report();
    else if (property === "font-family" && !fontFace && !(KEYWORDS.test(value) || TOKENISED.test(value))) report();
    else if (property === "font-size" && !(KEYWORDS.test(value) || TOKENISED.test(value))) report();
    else if (property === "font" && !KEYWORDS.test(value)) report();
    else if (property === "font-weight" && !fontFace && !(WEIGHT_KEYWORDS.test(value) || TOKENISED.test(value))) report();
  }
  return found;
}

// SVG presentation attributes that paint: only `none`, `currentColor` or a class
const PAINT_ATTRIBUTES = new Set(["fill", "stroke", "color", "stopColor", "floodColor", "lightingColor"]);
const PAINT_KEYWORDS = /^(?:none|currentColor|transparent|inherit)$/;

const STYLE_KEYS = /^(?:color|background(?:Color)?|border(?:\w*Color|\w*Radius)?|borderRadius|boxShadow|textShadow|fontFamily|fontSize|font|fill|stroke|outline(?:Color)?)$/;

/** A script: a colour in a string, or a style object that sets a colour, radius, shadow or font. */
export function scriptFindings(source: Source): Finding[] {
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true, source.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Finding[] = [];
  const at = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && RAW_COLOUR.test(node.text))
      found.push({ path: source.path, line: at(node), text: node.text });
    if (ts.isJsxAttribute(node) && PAINT_ATTRIBUTES.has(node.name.getText(file)) && node.initializer && ts.isStringLiteral(node.initializer) && !PAINT_KEYWORDS.test(node.initializer.text))
      found.push({ path: source.path, line: at(node), text: node.getText(file) });
    if (ts.isPropertyAssignment(node) && STYLE_KEYS.test(node.name.getText(file).replace(/["']/g, "")) && ts.isObjectLiteralExpression(node.parent) && isStyleObject(node.parent))
      found.push({ path: source.path, line: at(node), text: node.getText(file) });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** An object written for `style={…}` or `.style`. */
function isStyleObject(object: ts.ObjectLiteralExpression): boolean {
  const parent = object.parent;
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) return parent.parent.name.getText() === "style";
  return ts.isBinaryExpression(parent) && /\.style$/.test(parent.left.getText());
}
