// The guards that fail the suite: tokens, primitives, strings, the check code reserved to Check. Each is proved on synthetic sources (it catches what
// it must, lets pass what it must), then run on every source of src/.
import { describe, expect, it } from "vitest";
import { sources } from "./guards/files";
import { codeFindings } from "./guards/code-guard";
import { primitiveFindings } from "./guards/primitives-guard";
import { looksLikeWords, stringFindings } from "./guards/strings-guard";
import { cssFindings, scriptFindings } from "./guards/tokens-guard";

const css = (text: string, path = "src/ui/X.css") => cssFindings({ path, text }).map((f) => f.text);
const tsx = (text: string, path = "src/shell/X.tsx") => ({ path, text });

describe("tokens guard", () => {
  it("refuses a raw colour, radius, shadow, font family or size", () => {
    expect(css(".a { color: #141414; }")).toHaveLength(1);
    expect(css(".a { background: rgb(0, 0, 0); }")).toHaveLength(1);
    expect(css(".a { border-color: white; }")).toHaveLength(1);
    expect(css(".a { border-radius: 6px; }")).toHaveLength(1);
    expect(css(".a { box-shadow: 0 1px 2px var(--color-ink); }")).toHaveLength(1);
    expect(css(".a { font-family: Inter, sans-serif; }")).toHaveLength(1);
    expect(css(".a { font-size: 13px; }")).toHaveLength(1);
    expect(css(".a { font: 12px Inter; }")).toHaveLength(1);
    expect(css(".a { font-weight: 650; }")).toHaveLength(1);
  });

  it("reads the last declaration of a block without its semicolon", () => {
    expect(css(".a { color: #ff0000 }")).toHaveLength(1);
    expect(css(".a { color: var(--color-ink); border-radius: 3px }")).toHaveLength(1);
  });

  it("refuses a length hidden in calc() and a named colour in a gradient", () => {
    expect(css(".a { font-size: calc(13px); }")).toHaveLength(1);
    expect(css(".a { border-radius: calc(3px); }")).toHaveLength(1);
    expect(css(".a { box-shadow: calc(4px) calc(4px) calc(8px); }")).toHaveLength(1);
    expect(css(".a { background-image: linear-gradient(red, blue); }")).toHaveLength(1);
    expect(css(".a { outline-offset: calc(-1 * var(--focus-ring-width)); border-radius: calc(var(--radius-control) - 2px); }")).toHaveLength(1);
    expect(css(".a { mask-image: linear-gradient(to bottom, currentColor 50%, transparent); }")).toEqual([]);
  });

  it("lets tokens, keywords and font faces pass", () => {
    expect(css(".a { color: var(--color-ink); border-radius: var(--radius-control); box-shadow: none; }")).toEqual([]);
    expect(css(".a { font: inherit; font-family: inherit; font-size: var(--text-body-size); border-radius: 0; }")).toEqual([]);
    expect(css('@font-face { font-family: "Archivo"; src: url(a.woff2); }')).toEqual([]);
    expect(css(".a { color: #000; }", "src/styles/tokens.css")).toEqual([]);
  });

  it("refuses a colour or a style property in a script", () => {
    expect(scriptFindings(tsx('const c = "#2150E8";'))).toHaveLength(1);
    expect(scriptFindings(tsx("const c = `rgba(0, 0, 0, 0.5)`;"))).toHaveLength(1);
    expect(scriptFindings(tsx("const x = <div style={{ borderRadius: 4 }} />;"))).toHaveLength(1);
    expect(scriptFindings(tsx('const x = <path fill="red" stroke="black" />;'))).toHaveLength(2);
    expect(scriptFindings(tsx('const x = <div className="ui-a" data-tab="b" />;'))).toEqual([]);
    expect(scriptFindings(tsx('const x = <path fill="none" stroke="currentColor" />;'))).toEqual([]);
  });

  it("holds on every stylesheet and script of src/", () => {
    const found = [...sources([".css"]).flatMap(cssFindings), ...sources([".ts", ".tsx"]).flatMap(scriptFindings)];
    expect(found).toEqual([]);
  });
});

describe("primitives guard", () => {
  it("refuses a native control, style= or title= outside src/ui", () => {
    const found = primitiveFindings(tsx('const x = <div title="a"><button /><a href="#">{x}</a><input style={s} /></div>;'));
    expect(found.map((f) => f.text)).toEqual(["title= on <div>", "<button>", "<a>", "<input>", "style= on <input>"]);
  });

  it("refuses style= and title= on a component, a fake control, and dangerouslySetInnerHTML everywhere", () => {
    const found = primitiveFindings(tsx('const x = <><Button style={s} /><IconButton title="a" /><div role="button" onClick={f} /></>;'));
    expect(found.map((f) => f.text)).toEqual(["style= on <Button>", "title= on <IconButton>", 'role="button" on <div>']);
    expect(primitiveFindings(tsx("const x = <div dangerouslySetInnerHTML={h} />;", "src/ui/X.tsx")).map((f) => f.text)).toEqual(["dangerouslySetInnerHTML on <div>"]);
    expect(primitiveFindings(tsx("const p = { dangerouslySetInnerHTML: h };"))).toHaveLength(1);
  });

  it("lets the primitives themselves and lookalike tags pass", () => {
    expect(primitiveFindings(tsx('const x = <button style={s} role="tab" />;', "src/ui/Button.tsx"))).toEqual([]);
    expect(primitiveFindings(tsx('const x = <aside role="group"><abbr /><Button /><Panel heading={t} /></aside>;'))).toEqual([]);
  });

  it("holds on every component of src/", () => {
    expect(sources([".tsx"]).flatMap(primitiveFindings)).toEqual([]);
  });
});

describe("strings guard", () => {
  it("recognises words in both languages and lets code pass", () => {
    for (const words of ["Search everywhere", "aucun équipement", "Réglages", "nom : x", "the page is empty now", "Settings"])
      expect(looksLikeWords(words), words).toBe(true);
    for (const code of ["ui-control ui-rail", "data-tab", "10 G", "Ethernet1/1", "ArrowRight", "shell:prefs.theme", "en-GB", "L1"])
      expect(looksLikeWords(code), code).toBe(false);
  });

  it("refuses JSX text, a visible attribute and words in a literal; never a type, a key or an Error", () => {
    const found = stringFindings(tsx(
      'const x = <p aria-label="Close" className="ui-a">Hello</p>;\nconst y = "Search everywhere";\n' +
        'type T = "Some Words Here";\nconst o = { "Key Name Here": 1 };\nthrow new Error("the page has no root element");',
    ));
    expect(found.map((f) => f.text)).toEqual(['aria-label="Close"', "Hello", "Search everywhere"]);
  });

  it("refuses a lone visible word written as an expression or an object property", () => {
    const found = stringFindings(tsx(
      'const x = <><span>{"Topology"}</span><Toast label={"Dismiss"} message={"saved locally"} /></>;\n' +
        'const items = [{ id: "a", label: "Topology" }];\nconst y = <span>{" "}{value}</span>;',
    ));
    expect(found.map((f) => f.text)).toEqual(["Topology", 'label="Dismiss"', 'message="saved locally"', 'label: "Topology"']);
  });

  it("holds on every script of src/ outside the catalogues", () => {
    expect(sources([".ts", ".tsx"]).flatMap(stringFindings)).toEqual([]);
  });
});

describe("code guard", () => {
  it("refuses a check code outside the Check view, lets it pass there", () => {
    const panel = { path: "src/panel/X.tsx", text: 'import { Code, Mark } from "../ui";\nexport const x = <Code>{"link_down"}</Code>;' };
    expect(codeFindings(panel)).toHaveLength(2);
    expect(codeFindings({ path: "src/search/X.tsx", text: 'import { Code } from "../ui/Code";' })).toHaveLength(1);
    expect(codeFindings({ path: "src/edit/X.tsx", text: 'import { Code } from "lucide-react";\nexport const i = <Code />;' }), "Lucide's icon").toEqual([]);
    expect(codeFindings({ ...panel, path: "src/control/X.tsx" })).toEqual([]);
    expect(codeFindings({ ...panel, path: "src/ui/Register.tsx" })).toEqual([]);
    expect(codeFindings({ path: "src/panel/Y.tsx", text: 'import { CodeContext } from "x";' })).toEqual([]);
  });

  it("holds on every script of src/", () => {
    expect(sources([".ts", ".tsx"]).flatMap(codeFindings)).toEqual([]);
  });
});
