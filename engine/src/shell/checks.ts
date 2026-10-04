// La liste des contrôles d'un élément, telle que la fiche d'un câble, d'un équipement, d'un agrégat, d'un faisceau ou
// d'un cluster la montre : sévérité, code, sens (catalogue), détails, cibles cliquables. Un module à part pour que
// l'inspecteur et les panneaux des structures le partagent sans s'importer l'un l'autre (revue de la toile, M5).
import { h } from "../canvas/dom";
import type { Child } from "../canvas/dom";
import { plain } from "../canvas/format";
import type { CheckEntry, Model, Selection } from "../canvas/types";
import { targetsOf } from "./tables";
import { definition, severityPill } from "./widgets";

export type OnSelect = (selection: Selection | null) => void;

export function checkList(model: Model, checks: CheckEntry[], onSelect: OnSelect | null): HTMLElement {
  if (!checks.length) return h("p", { class: "muted" }, "Aucun contrôle sur cet élément.");
  return h("ul", { class: "checks" }, checks.map((check) => h("li", { class: "check" },
    h("div", { class: "check-head" }, severityPill(check.severity), h("code", {}, check.code)),
    h("div", { class: "check-meaning" }, (model.catalogue[check.code] || { meaning: "" }).meaning || ""),
    Object.keys(check.details).length ? definition(Object.entries(check.details).map(([k, v]) => [k, plain(v)])) : null,
    refButtons(model, check, onSelect))));
}

function refButtons(model: Model, check: CheckEntry, onSelect: OnSelect | null): Child {
  const targets = targetsOf(model, check);
  if (!targets.length || !onSelect) return null;
  return h("div", { class: "ref-row" }, targets.map((target) =>
    h("button", { class: "linklike", type: "button", onclick: () => onSelect(target.selection) }, target.label)));
}
