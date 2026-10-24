// The code guard (DESIGN.md, Chips and counts, Code; Check view: "codes live here"): a check code is shown only in the
// Check view. `Code` may be used by `src/control/`, by the register that holds it (`src/ui/Register.tsx`) and on the
// living primitives page (`src/primitives/`); anywhere else (the Diagram view, its panel, its search palette, the home)
// an import of the primitive from `ui/` and its `<Code>` are refused (Lucide's `Code` icon is another thing).
import ts from "typescript";
import type { Source } from "./files";

export const CODE_ALLOWED = [/^src\/control\//, /^src\/ui\/Register\.tsx$/, /^src\/ui\/Code\.tsx$/, /^src\/ui\/index\.ts$/, /^src\/primitives\//];

export type CodeFinding = Readonly<{ path: string; line: number; text: string }>;

export function codeFindings(source: Source): CodeFinding[] {
  if (CODE_ALLOWED.some((allowed) => allowed.test(source.path))) return [];
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true, source.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: CodeFinding[] = [];
  const at = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const fromUi = (node: ts.ImportDeclaration) => ts.isStringLiteral(node.moduleSpecifier) && /(^|\/)ui(\/Code)?$/.test(node.moduleSpecifier.text);
  let imported = false;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && fromUi(node)) {
      const bindings = node.importClause?.namedBindings;
      const names = bindings && ts.isNamedImports(bindings) ? bindings.elements : [];
      for (const name of names) if ((name.propertyName ?? name.name).text === "Code") {
        imported = true;
        found.push({ path: source.path, line: at(name), text: name.getText(file) });
      }
    }
    if (imported && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === "Code") found.push({ path: source.path, line: at(node), text: node.getText(file) });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
