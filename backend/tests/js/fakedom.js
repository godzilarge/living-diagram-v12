// Un DOM minimal pour exécuter le visualiseur sous Node : pas de rendu, mais tout le code tourne, et l'arbre
// produit se lit. Volontairement sans innerHTML : le visualiseur n'a pas le droit de s'en servir.
"use strict";

const fs = require("node:fs");
const vm = require("node:vm");

class FakeNode {
  constructor(document, tag, text) {
    this.ownerDocument = document;
    this.tagName = tag;
    this.text = text === undefined ? null : text;
    this.attributes = new Map();
    this.childNodes = [];
    this.listeners = new Map();
    this.parentNode = null;
    this.hidden = false;
    this.checked = false;
    this.value = "";
    this.scrollTop = 0;
    const node = this;
    this.classList = {
      names: () => (node.getAttribute("class") || "").split(/\s+/).filter(Boolean),
      contains: (name) => node.classList.names().includes(name),
      toggle: (name, force) => {
        const names = new Set(node.classList.names());
        const on = force === undefined ? !names.has(name) : !!force;
        if (on) names.add(name); else names.delete(name);
        node.setAttribute("class", Array.from(names).join(" "));
        return on;
      },
    };
  }
  get firstChild() { return this.childNodes[0] || null; }
  get textContent() { return this.text !== null ? this.text : this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(value) { this.childNodes = [new FakeNode(this.ownerDocument, "#text", String(value))]; }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "id") this.ownerDocument.byId.set(String(value), this);
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
  removeChild(child) { this.childNodes = this.childNodes.filter((c) => c !== child); child.parentNode = null; return child; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  fire(type, event) {
    const full = { target: this, currentTarget: this, stopPropagation() {}, preventDefault() {}, clientX: 0, clientY: 0, pointerId: 1, ...event };
    (this.listeners.get(type) || []).forEach((listener) => listener(full));
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 700 }; }
  setPointerCapture() {}
  all(predicate, found = []) {
    if (predicate(this)) found.push(this);
    this.childNodes.forEach((child) => child.all(predicate, found));
    return found;
  }
  withClass(name) { return this.all((n) => n.classList.contains(name)); }
}

function createDocument(pageHtml) {
  const document = { byId: new Map() };
  document.createElement = (tag) => new FakeNode(document, tag);
  document.createElementNS = (_ns, tag) => new FakeNode(document, tag);
  document.createTextNode = (text) => new FakeNode(document, "#text", text);
  document.getElementById = (id) => document.byId.get(id) || null;
  document.body = new FakeNode(document, "body");
  for (const [, tag, id] of pageHtml.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"/g)) {
    document.body.appendChild(new FakeNode(document, tag)).setAttribute("id", id);
  }
  return document;
}

function readPage(path) {
  const html = fs.readFileSync(path, "utf8");
  const data = /<script type="application\/json" id="ld-data">([\s\S]*?)<\/script>/.exec(html)[1];
  const script = /<script id="ld-viewer">([\s\S]*?)<\/script>/.exec(html)[1];
  return { html, data: JSON.parse(data), script };
}

// Exécute le visualiseur. Sans `data`, seules les parties pures (modèle, placement) sont utilisables.
// `hash` : le fragment d'URL au démarrage. `location`, `history` et `window` sont assez faux pour que le chemin
// « l'URL est l'état de vue » s'exécute : lecture au démarrage, réécriture, événement hashchange.
function load(page, data, hash) {
  const document = createDocument(page.html);
  if (data) document.getElementById("ld-data").text = JSON.stringify(data);
  else document.byId.delete("ld-data");
  const location = { hash: hash || "" };
  const history = { replaceState: (_state, _title, url) => { location.hash = url; } };
  const window = new FakeNode(document, "window");
  const context = vm.createContext({ document, console, location, history, window });
  vm.runInContext(page.script, context, { filename: "viewer.js" });
  const go = (next) => { location.hash = next; window.fire("hashchange", {}); };
  return { LD: context.LD, document, location, go };
}

module.exports = { readPage, load };
