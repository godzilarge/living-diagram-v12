// The primitives guard: outside src/ui, JSX never renders a native control (`button`, `input`, `select`, `textarea`,
// `a`), never gives an element an interactive role (a `<div role="button">` is a fake control), and never writes
// `style=` or `title=`, on an HTML element or a component (the primitives exclude `style` from their props; a
// tooltip comes from the one Tooltip). Nowhere, not even in src/ui, `dangerouslySetInnerHTML`.
import ts from "typescript";
import type { Finding } from "./tokens-guard";
import type { Source } from "./files";

export const UI_DIR = "src/ui/";
const CONTROLS = new Set(["button", "input", "select", "textarea", "a"]);
const ATTRIBUTES = new Set(["style", "title"]);
const INTERACTIVE_ROLES = new Set(["button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "option", "slider", "textbox", "combobox", "spinbutton"]);

function attributeFindings(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, file: ts.SourceFile, inUi: boolean): string[] {
  const tag = node.tagName.getText(file);
  const out: string[] = [];
  for (const attribute of node.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue;
    const name = attribute.name.getText(file);
    if (name === "dangerouslySetInnerHTML") out.push(`dangerouslySetInnerHTML on <${tag}>`);
    if (inUi) continue;
    if (ATTRIBUTES.has(name)) out.push(`${name}= on <${tag}>`);
    const value = attribute.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : "";
    if (name === "role" && INTERACTIVE_ROLES.has(value)) out.push(`role="${value}" on <${tag}>`);
  }
  return out;
}

export function primitiveFindings(source: Source): Finding[] {
  if (!/\.tsx?$/.test(source.path)) return [];
  const inUi = source.path.startsWith(UI_DIR);
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Finding[] = [];
  const at = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      if (!inUi && CONTROLS.has(tag)) found.push({ path: source.path, line: at(node), text: `<${tag}>` });
      for (const text of attributeFindings(node, file, inUi)) found.push({ path: source.path, line: at(node), text });
    }
    if (ts.isIdentifier(node) && node.text === "dangerouslySetInnerHTML" && !ts.isJsxAttribute(node.parent))
      found.push({ path: source.path, line: at(node), text: "dangerouslySetInnerHTML" });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
