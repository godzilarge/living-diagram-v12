// Fabrique d'éléments. Règle de sécurité de la page : une donnée n'entre dans le document que par un nœud texte
// ou un attribut posé par setAttribute, jamais comme du HTML (un voisin LLDP peut annoncer une balise).
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  function fill(element, attrs, children) {
    for (const [name, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (name === "class") element.setAttribute("class", value);
      else if (name === "onclick") element.addEventListener("click", value);
      else if (name === "oninput") element.addEventListener("input", value);
      else if (name === "onchange") element.addEventListener("change", value);
      else element.setAttribute(name, value === true ? "" : String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      element.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
    }
    return element;
  }

  const h = (tag, attrs, ...children) => fill(document.createElement(tag), attrs, children);
  const s = (tag, attrs, ...children) => fill(document.createElementNS(SVG_NS, tag), attrs, children);

  function clear(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
    return element;
  }

  const SOURCE_LABEL = { lldp: "LLDP", cdp: "CDP", description: "Description" };
  const STATUS_LABEL = { confirmed: "confirmé", observed_only: "observé seul", documented_only: "documenté seul" };
  const KIND_LABEL = { device: "équipement collecté", external: "équipement d'une autre infra", stub: "voisin inconnu" };
  const RESOLUTION_LABEL = {
    hostname: "nom exact", hostname_casefold: "nom, à la casse près", reported_hostname: "nom annoncé par l'équipement",
    address: "adresse (IP ou MAC)", stub: "non résolu : voisin inconnu",
  };

  const pill = (kind, value, label) => h("span", { class: "pill " + kind + "-" + value }, label === undefined ? value : label);
  const sourcePill = (source) => pill("source", source, SOURCE_LABEL[source] || source);
  const statusPill = (status) => pill("status", status, STATUS_LABEL[status] || status);
  const severityPill = (severity) => pill("severity", severity);

  // Une valeur de `details` : texte, liste, ou bout de câble {hostname, interface}.
  function plain(value) {
    if (value === null || value === undefined) return "—";
    if (Array.isArray(value)) return value.length ? value.map(plain).join(", ") : "—";
    if (typeof value === "object") {
      if ("hostname" in value && "interface" in value) return LD.model.endLabel(value);
      return Object.entries(value).map(([k, v]) => k + " : " + plain(v)).join(" ; ");
    }
    return String(value);
  }

  function definition(rows) {
    return h("dl", { class: "kv" }, rows.filter((row) => row && row[1] !== null && row[1] !== undefined && row[1] !== "").map(
      ([label, value]) => [h("dt", {}, label), h("dd", {}, typeof value === "object" ? value : String(value))]));
  }

  function table(headers, rows, options) {
    const head = h("tr", {}, headers.map((label) => h("th", {}, label)));
    const body = rows.map((row) => {
      const line = h("tr", { class: row.onclick ? "clickable" : null, onclick: row.onclick || null, tabindex: row.onclick ? 0 : null },
        row.cells.map((cell) => h("td", {}, cell)));
      if (row.onclick) line.addEventListener("keydown", (event) => { if (event.key === "Enter") row.onclick(); });
      return line;
    });
    const empty = rows.length ? null : h("tr", {}, h("td", { colspan: headers.length, class: "empty" }, (options && options.empty) || "rien à signaler"));
    return h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, head), h("tbody", {}, body, empty)));
  }

  LD.dom = { h, s, clear, pill, sourcePill, statusPill, severityPill, plain, definition, table,
    SOURCE_LABEL, STATUS_LABEL, KIND_LABEL, RESOLUTION_LABEL };
})();
