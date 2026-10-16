// Sonde : chaque garde par mutation. « refuse » = ce qu'elle promet et attrape ; « laisse passer » = un trou.
// Un test VERT ici prouve le comportement constaté (un trou qui laisse passer est vert tant qu'il existe).
import { primitiveFindings } from "../../../app/tests/guards/primitives-guard";
import { stringFindings } from "../../../app/tests/guards/strings-guard";
import { cssFindings, scriptFindings } from "../../../app/tests/guards/tokens-guard";

const css = (text: string) => cssFindings({ path: "src/shell/X.css", text });
const tsx = (text: string) => ({ path: "src/shell/X.tsx", text });
const all = (text: string) => [...scriptFindings(tsx(text)), ...primitiveFindings(tsx(text)), ...stringFindings(tsx(text))];

describe("tokens : ce qu'elle refuse", () => {
  it("une couleur en dur, une taille de police en em", () => {
    expect(css(".a { color: #141414; }")).toHaveLength(1);
    expect(css(".a { font-size: 1.2em; }")).toHaveLength(1);
    expect(scriptFindings(tsx('const x = <rect fill="#ff0000" />;'))).toHaveLength(1);
  });
});

describe("tokens : ce qu'elle laisse passer", () => {
  it("une déclaration sans point-virgule final (dernière du bloc)", () => {
    expect(css(".a { color: #ff0000 }")).toEqual([]);
    expect(css(".a { margin: 0; border-radius: 3px }")).toEqual([]);
  });
  it("n'importe quelle valeur enveloppée dans calc()", () => {
    expect(css(".a { font-size: calc(13px); border-radius: calc(3px); box-shadow: calc(4px) calc(4px) calc(8px); }")).toEqual([]);
  });
  it("un dégradé en couleurs nommées, une couleur nommée dans un attribut SVG", () => {
    expect(css(".a { background-image: linear-gradient(red, blue); }")).toEqual([]);
    expect(scriptFindings(tsx('const x = <rect fill="red" stroke="blue" />;'))).toEqual([]);
  });
  it("une graisse, une durée, une interligne en dur", () => {
    expect(css(".a { font-weight: 700; transition: color 300ms ease; line-height: 17px; }")).toEqual([]);
  });
});

describe("primitives : ce qu'elle laisse passer", () => {
  it("style= sur un composant (Button n'omet pas style)", () => {
    expect(all("const x = <Button style={s}>{t('a')}</Button>;")).toEqual([]);
    expect(all("const x = <IconButton style={{ width: 40 }} label={t('a')} icon={i} />;")).toEqual([]);
  });
  it("du HTML depuis une donnée", () => {
    expect(all("const x = <div dangerouslySetInnerHTML={{ __html: data }} />;")).toEqual([]);
  });
  it("un faux bouton", () => {
    expect(all('const x = <div role="button" tabIndex={0} onClick={f} />;')).toEqual([]);
  });
});

describe("chaînes : ce qu'elle laisse passer", () => {
  it("un mot seul dans une expression JSX, une propriété d'objet, un attribut en expression", () => {
    expect(all('const x = <span>{"Topology"}</span>;')).toEqual([]);
    expect(all('const x = <span>{"Bonjour"}</span>;')).toEqual([]);
    expect(all('const items = [{ id: "a", label: "Topology" }];')).toEqual([]);
    expect(all('const x = <IconButton label={"Dismiss"} icon={i} />;')).toEqual([]);
  });
  it("deux mots anglais en minuscules", () => {
    expect(all('const x = <Toast message={"saved locally"} />;')).toEqual([]);
  });
});
