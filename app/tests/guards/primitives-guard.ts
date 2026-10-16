// The primitives guard: outside src/ui, JSX never renders a native control (`button`, `input`, `select`, `textarea`,
// `a`) nor writes `style=` or `title=` on an HTML element: a control comes from the primitives, a tooltip from the one
// Tooltip. A component's own `title` prop (Panel, a section heading) is not the native tooltip and passes.
import ts from "typescript";
import type { Finding } from "./tokens-guard";
import type { Source } from "./files";

export const UI_DIR = "src/ui/";
const CONTROLS = new Set(["button", "input", "select", "textarea", "a"]);
const ATTRIBUTES = new Set(["style", "title"]);

export function primitiveFindings(source: Source): Finding[] {
  if (source.path.startsWith(UI_DIR) || !source.path.endsWith(".tsx")) return [];
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Finding[] = [];
  const at = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      if (CONTROLS.has(tag)) found.push({ path: source.path, line: at(node), text: `<${tag}>` });
      for (const attribute of node.attributes.properties)
        if (ts.isJsxAttribute(attribute) && ATTRIBUTES.has(attribute.name.getText(file)) && /^[a-z]/.test(tag))
          found.push({ path: source.path, line: at(attribute), text: `${attribute.name.getText(file)}= on <${tag}>` });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
