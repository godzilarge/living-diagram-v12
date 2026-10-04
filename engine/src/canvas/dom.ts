// Fabrique d'éléments. Règle de sécurité de la page : une donnée n'entre dans le document que par un nœud texte
// ou un attribut posé par setAttribute, jamais comme du HTML (un voisin LLDP peut annoncer une balise).
// Rien d'autre ici : les libellés et formats sont dans format.ts, les widgets HTML de la page dans shell/widgets.ts.

const SVG_NS = "http://www.w3.org/2000/svg";

export type Child = globalThis.Node | string | number | boolean | null | undefined | Child[];
export type Attrs = Record<string, unknown> | null | undefined;
type Handler = (event: Event) => void;
// Une Map, pas un objet : `"constructor" in {}` regarderait le prototype (revue de la toile, B1).
const HANDLERS = new Map<string, string>([["onclick", "click"], ["oninput", "input"], ["onchange", "change"], ["onsubmit", "submit"]]);

function flatten(children: Child[], into: Child[] = []): Child[] {
  for (const child of children) {
    if (Array.isArray(child)) flatten(child, into);
    else into.push(child);
  }
  return into;
}

function fill<T extends Element>(element: T, attrs: Attrs, children: Child[]): T {
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    const event = HANDLERS.get(name);
    if (name === "class") element.setAttribute("class", String(value));
    else if (event) element.addEventListener(event, value as Handler);
    else element.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of flatten(children)) {
    if (child === null || child === undefined || child === false || Array.isArray(child)) continue;
    element.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
  return element;
}

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]): HTMLElementTagNameMap[K] =>
  fill(document.createElement(tag), attrs, children);
export const s = <K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]): SVGElementTagNameMap[K] =>
  fill(document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K], attrs, children);

export function clear<T extends Element>(element: T): T {
  while (element.firstChild) element.removeChild(element.firstChild);
  return element;
}

export const dom = { h, s, clear };
