// L'onglet Intentions de `/view` (B4, docs/08 ; couleurs, groupes, annotations, connecteurs : docs/10) et la ligne
// « épingle » de la fiche d'un équipement : la comptabilité de la couche d'intention, page gelée, en français. Séparé
// de l'hôte (`intent.ts`) pour que l'application, qui partage l'hôte sans cet onglet, n'en embarque pas le code
// (lot 8 de la langue, 2026-10-10). Une épingle orpheline (équipement absent de cette run) est dite telle, jamais
// effacée en silence ; retirer tout demande une confirmation dans la page.
import { KIND_LABEL as ANNOTATION_KIND, summary } from "../canvas/annotations";
import { summary as connectorSummary } from "../canvas/connectors";
import { clear, h } from "../canvas/dom";
import { hueLabel } from "../canvas/hues";
import { LABEL as ICON_LABEL } from "../canvas/icons";
import type { Child } from "../canvas/dom";
import { STYLE_LABEL } from "../canvas/groups";
import type { Annotation, Connector, DeviceColor, Group, Model, Pin, TypeColor } from "../canvas/types";
import type { Op } from "./apps";
import { AUTHOR_MAX_LENGTH } from "./intent";
import type { PinGraph, TabContext } from "./intent";
import { confirmable, definition, pill, table } from "./widgets";
import type { TableRow } from "./widgets";

const dateText = (iso: string): string => iso.replace("T", " ").replace(/:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/, " $2").replace(" Z", " UTC");

// Les déplacements faits à la main dans cette page et non enregistrés : sans écrivain (page autonome, nom absent),
// ou en attendant la réponse de l'API.
function localMoves(model: Model, graph: PinGraph): string[] {
  return Array.from(graph.state.pinned.keys()).filter((host) => !model.pinByHost.has(host)).sort();
}

export function createIntentTab({ model, writer, hooks, canWrite, send, removeOne, unpinOps, refresh }: TabContext): { view: () => void; pinBlock: (hostname: string) => Child } {
  function writerNote(): Child {
    if (!writer) {
      const why = model.intent ? "cette page a été générée sans serveur (ld render)" : "cette page vient d'un fichier, sans archive ni serveur";
      return h("p", { class: "intent-note warn" }, "Lecture seule : " + why + ". Glisser un équipement le déplace ici seulement ; rien n'est enregistré.");
    }
    const field = h("input", { id: "i-author", type: "text", value: writer.author, placeholder: "votre nom", maxlength: AUTHOR_MAX_LENGTH,
      "aria-label": "votre nom, écrit sur chaque épingle", spellcheck: "false",
      onchange: (e: Event) => { writer.setAuthor((e.target as HTMLInputElement).value.trim().slice(0, AUTHOR_MAX_LENGTH)); refresh(); } });
    const text = writer.author
      ? "Vos épingles s'enregistrent sous le nom « " + writer.author + " » : glisser un équipement l'épingle pour tout le monde. Dernier écrivain gagne, par épingle ; chaque écriture est journalisée."
      : "Sans nom, vos déplacements restent locaux. Donnez votre nom pour que vos épingles s'enregistrent :";
    return h("p", { class: "intent-note" + (writer.author ? "" : " warn") }, text, " ", h("label", { class: "check-field" }, "nom ", field));
  }

  function pinRow(pin: Pin, orphan: boolean): TableRow {
    const target: Child = orphan ? pin.hostname
      : h("button", { class: "linklike", type: "button", onclick: () => hooks.openInGraph({ kind: "node", id: pin.hostname }) }, pin.hostname);
    const state = orphan ? pill("pin", "orphan", "orpheline : équipement absent de cette run") : pill("pin", "present", "présente");
    const remove: Child = canWrite() ? h("button", { type: "button", onclick: (e: Event) => removeOne(pin.hostname, e.target as HTMLButtonElement) }, "retirer") : "";
    return { cells: [target, String(pin.x), String(pin.y), pin.author, dateText(pin.at), state, remove] };
  }

  // Les couleurs de l'onglet : une ligne par type coloré, une par équipement coloré (orpheline si absent de la run).
  function colourRow(target: Child, hue: string, author: string, at: string, orphan: boolean | null, remove: () => Op[]): TableRow {
    const state = orphan === null ? "" : orphan ? pill("pin", "orphan", "orpheline : équipement absent de cette run") : pill("pin", "present", "présente");
    const button: Child = canWrite() ? h("button", { type: "button", onclick: (e: Event) => { (e.target as HTMLButtonElement).setAttribute("disabled", ""); void send(remove(), [], "couleur retirée", true); } }, "retirer la couleur") : "";
    return { cells: [target, h("span", { class: "hue-dot hue-" + hue }, hueLabel(hue)), author, dateText(at), state, button] };
  }
  function coloursBlock(): Child {
    const types: TypeColor[] = model.intent && model.intent.type_colors ? model.intent.type_colors : [];
    const devices: DeviceColor[] = model.intent && model.intent.device_colors ? model.intent.device_colors : [];
    const orphans = new Set(model.orphanColors.map((c) => c.hostname));
    const rows = types.map((c) => colourRow("type · " + (ICON_LABEL[c.type] || c.type), c.hue, c.author, c.at, null, () => [{ op: "uncolor_type", type: c.type }]))
      .concat(devices.map((c) => colourRow(orphans.has(c.hostname) ? c.hostname : h("button", { class: "linklike", type: "button", onclick: () => hooks.openInGraph({ kind: "node", id: c.hostname }) }, c.hostname),
        c.hue, c.author, c.at, orphans.has(c.hostname), () => [{ op: "uncolor", hostname: c.hostname }])));
    const orphanOps = (): Op[] => model.orphanColors.map((c) => ({ op: "uncolor", hostname: c.hostname }));
    return [h("h3", {}, "Couleurs enregistrées : " + rows.length + (orphans.size ? " · " + orphans.size + " orpheline" + (orphans.size > 1 ? "s" : "") : "")),
      h("p", { class: "muted" }, "La teinte d'un type vaut pour toute l'infrastructure ; celle d'un équipement l'emporte. Douze teintes nommées, jamais une valeur libre (docs/10)."),
      table(["cible", "teinte", "auteur", "date", "état", ""], rows, { empty: "aucune couleur : la palette des types et la fiche d'un équipement, dans l'application" }),
      canWrite() && orphans.size ? h("div", { class: "toolbar-row" }, confirmable("retirer les couleurs orphelines", () => { void send(orphanOps(), [], "couleurs orphelines retirées", true); }, { count: orphans.size })) : null];
  }

  // Les groupes de l'onglet : une ligne par groupe, ses membres présents et orphelins ; supprimer demande confirmation.
  function groupsBlock(): Child {
    const list: Group[] = model.intent && model.intent.groups ? model.intent.groups : [];
    const rows = list.map((group): TableRow => {
      const orphans = group.members.filter((host) => { const node = model.nodeByHost.get(host); return !node || !!node.ghost; });
      const present = group.members.length - orphans.length;
      const state = present === 0 ? pill("pin", "orphan", "orphelin : aucun membre dans cette run") : orphans.length ? pill("pin", "orphan", orphans.length + " membre(s) absent(s)") : pill("pin", "present", "présent");
      const remove: Child = canWrite() ? confirmable("supprimer", () => { void send([{ op: "group_delete", id: group.id }], [], "groupe " + group.label + " supprimé", true); }, { count: group.members.length }) : "";
      return { cells: [h("span", {}, h("b", {}, group.label), " ", h("code", { class: "muted" }, group.id)), h("span", { class: "hue-dot hue-" + group.style.hue }, STYLE_LABEL[group.style.shape] || group.style.shape),
        present + " / " + group.members.length + (orphans.length ? " · absents : " + orphans.join(", ") : ""), group.author, dateText(group.at), state, remove] };
    });
    return [h("h3", {}, "Groupes enregistrés : " + rows.length + (model.orphanGroups.length ? " · " + model.orphanGroups.length + " orphelin" + (model.orphanGroups.length > 1 ? "s" : "") : "")),
      h("p", { class: "muted" }, "Un groupe = des membres + un style ; son cadre se calcule depuis ses membres (docs/10 §5). Il se crée, se modifie et se glisse dans l'application ; ici, la comptabilité."),
      table(["groupe", "forme", "membres", "auteur", "date", "état", ""], rows, { empty: "aucun groupe : depuis la fiche d'une sélection multiple, dans l'application" })];
  }

  // Les annotations de l'onglet (docs/10 §6) : une ligne par annotation, son ancre, orpheline si l'ancre est absente.
  function annotationsBlock(): Child {
    const list: Annotation[] = model.intent && model.intent.annotations ? model.intent.annotations : [];
    const orphans = new Set(model.orphanAnnotations.map((a) => a.id));
    const rows = list.map((a): TableRow => {
      const where = a.anchor.kind === "free" ? "libre" : a.anchor.kind + " · " + a.anchor.ref;
      const state = orphans.has(a.id) ? pill("pin", "orphan", "orpheline : ancre absente de cette run") : pill("pin", "present", "présente");
      const remove: Child = canWrite() ? confirmable("supprimer", () => { void send([{ op: "annotation_delete", id: a.id }], [], "annotation supprimée", true); }, { count: 1 }) : "";
      return { cells: [h("span", {}, h("b", {}, ANNOTATION_KIND[a.content.kind] || a.content.kind), " ", h("code", { class: "muted" }, a.id)), summary(a), where, a.x + ", " + a.y + " · " + a.w + " × " + a.h, a.author, dateText(a.at), state, remove] };
    });
    return [h("h3", {}, "Annotations enregistrées : " + rows.length + (orphans.size ? " · " + orphans.size + " orpheline" + (orphans.size > 1 ? "s" : "") : "")),
      h("p", { class: "muted" }, "Une annotation dit ce que la donnée ignore : note, forme, tableau, image, libre ou attachée à un équipement ou à un groupe (docs/10 §6). Elle se crée et se règle dans l'application ; ici, la comptabilité."),
      table(["sorte", "contenu", "ancrage", "boîte", "auteur", "date", "état", ""], rows, { empty: "aucune annotation : la barre d'outils de l'application, « insérer »" })];
  }

  // Les connecteurs de l'onglet (docs/10 §6, 1.4.0) : une ligne par connecteur, ses bouts, orphelin si un bout est absent.
  function connectorsBlock(): Child {
    const list: Connector[] = model.intent && model.intent.connectors ? model.intent.connectors : [];
    const orphans = new Set(model.orphanConnectors.map((c) => c.id));
    const rows = list.map((c): TableRow => {
      const state = orphans.has(c.id) ? pill("pin", "orphan", "orphelin : un bout vise un élément absent de cette run") : pill("pin", "present", "présent");
      const remove: Child = canWrite() ? confirmable("supprimer", () => { void send([{ op: "connector_delete", id: c.id }], [], "connecteur supprimé", true); }, { count: 1 }) : "";
      return { cells: [h("code", { class: "muted" }, c.id), connectorSummary(c), c.route, c.author, dateText(c.at), state, remove] };
    });
    return [h("h3", {}, "Connecteurs enregistrés : " + rows.length + (orphans.size ? " · " + orphans.size + " orphelin" + (orphans.size > 1 ? "s" : "") : "")),
      h("p", { class: "muted" }, "Un connecteur relie deux bouts, libres ou attachés à un équipement, un groupe ou une annotation : une ligne ou une flèche de contexte, jamais un câble (docs/10 §6). Il se trace dans l'application ; ici, la comptabilité."),
      table(["id", "connecteur", "tracé", "auteur", "date", "état", ""], rows, { empty: "aucun connecteur : la barre d'outils de l'application, « insérer »" })];
  }

  // Retirer plusieurs épingles demande une confirmation, dans la page.
  const removeMany = (label: string, hosts: string[]): Child => (hosts.length
    ? confirmable(label, () => { void send(unpinOps(hosts), hosts, hosts.length + " épingle" + (hosts.length > 1 ? "s retirées" : " retirée")); }, { count: hosts.length })
    : null);

  function view(): void {
    const container = hooks.container();
    const graph = hooks.graph();
    const pins = model.intent ? model.intent.pins : [];
    const orphans = new Set(model.orphanPins.map((p) => p.hostname));
    const local = localMoves(model, graph);
    const headers = ["équipement", "x", "y", "auteur", "date", "état", ""];
    const rows = pins.map((pin) => pinRow(pin, orphans.has(pin.hostname)));
    const orphanHosts = model.orphanPins.map((p) => p.hostname);
    const allHosts = pins.map((p) => p.hostname);
    clear(container).appendChild(h("div", { class: "page" },
      h("h2", {}, "Intentions"),
      h("p", { class: "lead" }, "La couche d'intention est ce que vous voulez en plus de ce que la collecte montre. Première intention : l'épingle, la place voulue d'un équipement, "
        + "keyée par son nom, qui survit aux runs. Glisser un équipement sur le graphe l'épingle ; « replacer » recalcule le placement autour des épingles. Le diff ne lit jamais l'intention. "
        + "Les équipements non épinglés gardent aussi leur place d'une run à l'autre : c'est le placement mémorisé, une donnée calculée que « replacer » renouvelle."),
      writerNote(),
      model.intent ? definition([["infrastructure", model.intent.infrastructure], ["révision", String(model.intent.revision)],
        ["dernière écriture", model.intent.updated_at ? dateText(model.intent.updated_at) : "jamais"]]) : null,
      h("h3", {}, "Épingles enregistrées : " + pins.length + (orphans.size ? " · " + orphans.size + " orpheline" + (orphans.size > 1 ? "s" : "") : "")),
      orphans.size ? h("p", { class: "muted" }, "Une épingle orpheline vise un équipement qui n'est pas dans cette run (retiré, renommé, ou pas encore collecté). Elle n'est pas dessinée, elle n'est pas effacée : si l'équipement revient, elle s'applique à nouveau.") : null,
      table(headers, rows, { empty: model.intent ? "aucune épingle : glisser un équipement sur le graphe" : "pas de couche d'intention dans cette page" }),
      canWrite() ? h("div", { class: "toolbar-row" }, removeMany("retirer les épingles orphelines", orphanHosts), removeMany("retirer toutes les épingles", allHosts)) : null,
      coloursBlock(),
      groupsBlock(),
      annotationsBlock(),
      connectorsBlock(),
      h("h3", {}, "Déplacements locaux non enregistrés : " + local.length),
      local.length ? [h("p", { class: "muted" }, local.join(", ")),
        h("button", { type: "button", title: "chaque équipement retrouve sa place mémorisée ou son épingle", onclick: () => { graph.resetPins(); refresh(); } }, "oublier les déplacements locaux")]
        : h("p", { class: "muted" }, "aucun")));
  }

  // La ligne « épingle » de la fiche d'un équipement, avec son action.
  function pinBlock(hostname: string): Child {
    const pin = model.pinByHost.get(hostname);
    const local = !pin && hooks.graph().state.pinned.has(hostname);
    if (!pin && !local) return null;
    return [h("h4", { class: "section" }, "Épingle"),
      pin ? definition([["place voulue", pin.x + ", " + pin.y], ["par", pin.author], ["le", dateText(pin.at)]]) : h("p", { class: "muted" }, "déplacé dans cette page, non enregistré"),
      pin && canWrite() ? h("button", { type: "button", onclick: (e: Event) => removeOne(hostname, e.target as HTMLButtonElement) }, "retirer l'épingle") : null];
  }

  return { view, pinBlock };
}
