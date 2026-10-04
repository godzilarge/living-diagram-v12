// L'inspecteur : pour un câble, d'où il vient (chaque évidence : qui témoigne, ce qu'il annonce, comment le nom
// a été résolu) ; pour un équipement, sa fiche, sa couverture de collecte, ses ports. Tout est lu, rien n'est calculé.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const { h, clear, sourcePill, statusPill, severityPill, diffPill, pill, plain, brief, definition, table } = LD.dom;

  // Ce que le diff dit de l'élément : ajouté dans cette run ; retiré depuis la run d'avant (la fiche le montre alors
  // tel qu'il était) ; ou ses champs changés, avant → après. Rien quand la page n'a pas de diff.
  function changeOf(model, kind, id, ghost) {
    if (ghost) return { kind: "removed", fields: [] };
    return model.changeOf ? model.changeOf(kind, id) : null;
  }
  function diffBlock(model, change, what) {
    if (!change) return null;
    const before = model.diff.before.collector_run_id;
    if (change.kind === "added") return h("p", { class: "diff-note diff-added" }, "Ajouté : ce " + what + " n'était pas dans la run " + before + ".");
    if (change.kind === "removed") return h("p", { class: "diff-note diff-removed" }, "Retiré : ce " + what + " était dans la run " + before + " et n'est plus dans celle-ci ; la fiche le montre tel qu'il était.");
    return [h("h4", { class: "section" }, "Changements depuis la run " + before),
      definition(change.fields.map((f) => [f.path, brief(f.before) + " → " + brief(f.after)]))];
  }

  function checkList(model, checks, onSelect) {
    if (!checks.length) return h("p", { class: "muted" }, "Aucun contrôle sur cet élément.");
    return h("ul", { class: "checks" }, checks.map((check) => h("li", { class: "check" },
      h("div", { class: "check-head" }, severityPill(check.severity), h("code", {}, check.code)),
      h("div", { class: "check-meaning" }, (model.catalogue[check.code] || {}).meaning || ""),
      Object.keys(check.details).length ? definition(Object.entries(check.details).map(([k, v]) => [k, plain(v)])) : null,
      refButtons(model, check, onSelect))));
  }

  function refButtons(model, check, onSelect) {
    const targets = LD.tables ? LD.tables.targetsOf(model, check) : [];
    if (!targets.length || !onSelect) return null;
    return h("div", { class: "ref-row" }, targets.map((target) =>
      h("button", { class: "linklike", type: "button", onclick: () => onSelect(target.selection) }, target.label)));
  }

  function evidenceCard(model, evidence) {
    const observed = LD.model.OBSERVED[evidence.source];
    const raw = evidence.remote_raw, resolved = evidence.remote_resolved;
    const renamed = raw.port !== null && resolved.interface !== null && raw.port !== resolved.interface;
    return h("li", { class: "evidence " + (observed ? "observed" : "documented") },
      h("div", { class: "evidence-head" }, sourcePill(evidence.source), h("span", { class: "muted" }, observed ? "observé" : "documenté")),
      definition([
        ["témoin", LD.model.endLabel(evidence.witness)],
        ["il annonce", raw.name + " · " + (raw.port === null ? "sans port" : raw.port)],
        ["résolu en", resolved.hostname + " · " + (resolved.interface === null ? "port non précisé" : resolved.interface)],
        ["résolution du nom", LD.dom.RESOLUTION_LABEL[evidence.resolution] || evidence.resolution],
        renamed ? ["nom de port", "normalisé par B1 (R1) : " + raw.port + " → " + resolved.interface] : null,
      ]));
  }

  // La carte d'un bout de câble : les faits de cette run ; pour un câble retiré seulement, ceux de la run d'avant quand
  // le port n'est plus collecté, en le disant (revue, H1).
  function portCard(model, end, aggregate, removed) {
    const found = LD.model.interfaceAt(model, end.hostname, end.interface, removed);
    const title = h("h4", {}, LD.model.endLabel(end));
    if (!found) return h("div", { class: "port" }, title, h("p", { class: "muted" }, "Port absent de interfaces[] : équipement non collecté, ou nom tel qu'annoncé par le voisin."));
    const itf = found.itf;
    const parsed = itf.description_parsed;
    return h("div", { class: "port" }, title,
      found.ghost ? h("p", { class: "muted diff-removed" }, "Interface retirée depuis la run d'avant : valeurs telles qu'elles étaient.") : null,
      definition([
      ["état", itf.oper_status + " (admin " + itf.admin_status + ")" + (itf.oper_reason ? " · " + itf.oper_reason : "")],
      ["type · vitesse", itf.type + (itf.speed_mbps ? " · " + LD.dom.speedText(itf.speed_mbps) : "") + (itf.duplex ? " · " + itf.duplex : "")],
      ["média", itf.media],
      ["agrégat", aggregate || (itf.aggregate ? itf.aggregate.name + (itf.aggregate.member_status ? " (" + itf.aggregate.member_status + ")" : "") : null)],
      ["rôles", itf.roles.length ? itf.roles.join(", ") : null],
      ["description brute", itf.description === null ? "(aucune)" : h("code", { class: "wrap" }, itf.description)],
      ["description lue", parsed ? "criticité " + parsed.criticality + " · voisin " + parsed.neighbor + " · port " + plain(parsed.port) + (parsed.options ? " · " + parsed.options : "")
        : (itf.description ? "non lue par la grammaire criticité|voisin|port|options" : null)],
      ["mode · VLAN", itf.switchport_mode ? itf.switchport_mode + vlanText(itf) : null],
      ["MAC", itf.mac_address], ["IP", itf.ip_addresses.length ? itf.ip_addresses.map((ip) => ip.address + "/" + ip.prefix).join(", ") : null],
    ]));
  }

  function vlanText(itf) {
    if (itf.access_vlan) return " · access " + itf.access_vlan;
    if (itf.native_vlan || itf.allowed_vlans) {
      const allowed = itf.allowed_vlans ? itf.allowed_vlans.map((r) => (r.first === r.last ? r.first : r.first + "-" + r.last)).join(",") : "?";
      return " · natif " + plain(itf.native_vlan) + " · autorisés " + (allowed || "aucun");
    }
    return "";
  }

  // La phrase ne dit que ce que les évidences disent : qui a observé, qui a documenté. « Confirmé » veut dire
  // « observé et documenté », pas « toutes les descriptions concordent » : un désaccord lié au câble est signalé.
  function whyText(link) {
    const witnesses = (keep) => Array.from(new Set(link.raw.evidence.filter((e) => keep(e.source)).map((e) => LD.model.endLabel(e.witness)))).join(", ");
    const seen = witnesses((src) => LD.model.OBSERVED[src]);
    const written = witnesses((src) => !LD.model.OBSERVED[src]);
    const protocols = link.sources.filter((src) => LD.model.OBSERVED[src]).map((src) => src.toUpperCase()).join(" et ");
    const parts = [];
    if (seen) parts.push("Observé en " + protocols + " depuis " + seen + ".");
    else parts.push("Aucune observation LLDP ni CDP : ce câble n'existe que par les descriptions d'interface.");
    parts.push(written ? "Documenté par la description de " + written + "." : "Aucune description ne le documente.");
    if (link.checks.some((c) => c.code === "description_disagrees_with_observed")) parts.push("Attention : une description ne concorde pas avec l'observé, voir le contrôle ci-dessous.");
    return parts.join(" ");
  }

  // Les agrégats des deux bouts, cliquables quand le snapshot a leur document.
  function aggregateEnds(model, link, onSelect) {
    const raw = link.raw;
    const ends = [[raw.a.hostname, raw.aggregate_a], [raw.b.hostname, raw.aggregate_b]].filter(([, name]) => name !== null);
    if (!ends.length) return null;
    return h("span", {}, ends.map(([hostname, name], index) => {
      const aggregate = model.aggregateByKey.get(LD.model.aggregateKey(hostname, name));
      return [index ? " · " : null, aggregate ? LD.structures.aggregateButton(aggregate, onSelect) : hostname + " · " + name];
    }));
  }

  function linkPanel(model, link, onSelect) {
    const raw = link.raw;
    const why = whyText(link);
    const change = changeOf(model, "link", link.id, link.ghost);
    return [
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "câble"), statusPill(link.status),
        raw.oper === "down" ? pill("oper", "down", "down") : null, change ? diffPill(change.kind) : null),
      h("h3", { class: "ends" },
        h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: raw.a.hostname }) }, raw.a.hostname), " · " + raw.a.interface,
        h("span", { class: "arrow" }, " ↔ "),
        h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: raw.b.hostname }) }, raw.b.hostname), " · " + raw.b.interface),
      h("p", { class: "why" }, why),
      diffBlock(model, change, "câble"),
      definition([["état", raw.oper], ["vitesse commune", raw.speed_mbps ? LD.dom.speedText(raw.speed_mbps) : "différente ou inconnue"],
        ["agrégats", aggregateEnds(model, link, onSelect)], ["faisceau", link.beam ? LD.structures.beamButton(link.beam, onSelect) : null]]),
      h("h4", { class: "section" }, "Sources : " + raw.evidence.length + " évidence" + (raw.evidence.length > 1 ? "s" : "")),
      h("ul", { class: "evidences" }, raw.evidence.map((e) => evidenceCard(model, e))),
      h("h4", { class: "section" }, "Contrôles liés"), checkList(model, link.checks, onSelect),
      link.portChecks.length ? [h("h4", { class: "section" }, "Contrôles d'un port partagé avec d'autres câbles"),
        h("p", { class: "muted" }, "Ils visent un port qui porte plusieurs câbles, sans dire lequel : ils ne sont pas comptés sur celui-ci."),
        checkList(model, link.portChecks, onSelect)] : null,
      h("h4", { class: "section" }, "Les deux ports"),
      portCard(model, raw.a, raw.aggregate_a, link.ghost), portCard(model, raw.b, raw.aggregate_b, link.ghost),
    ];
  }

  function coverageRow(model, hostname) {
    const coverage = model.coverage.find((c) => c.hostname === hostname);
    if (!coverage) return null;
    return h("div", { class: "topic-row" }, Object.entries(coverage.topics).map(([topic, status]) => pill("topic", status, topic + " : " + status)));
  }

  // « Pourquoi ce port up n'a-t-il rien en face ? » : la question de qui met au point un exportateur. La colonne
  // câble est une jointure sur le snapshot ; le filtre ne garde que les ports physiques up sans câble.
  function interfaceTable(model, ifaces) {
    const holder = h("div", {});
    const cabled = (itf) => model.linksByIface.get(LD.model.ifaceKey(itf.hostname, itf.name)) || [];
    const lonely = ifaces.filter((itf) => (itf.type === "physical" || itf.type === "management") && itf.oper_status === "up" && !cabled(itf).some((l) => !l.ghost));
    const draw = (only) => {
      const rows = (only ? lonely : ifaces).map((itf) => {
        const links = cabled(itf);
        const facing = links.map((l) => LD.model.endLabel(l.a.hostname === itf.hostname && l.a.interface === itf.name ? l.b : l.a) + (l.ghost ? " (retiré)" : "")).join(", ");
        return { cells: [itf.name, itf.type, itf.oper_status, facing || "—", itf.description === null ? "" : h("code", { class: "wrap" }, itf.description)] };
      });
      clear(holder).appendChild(table(["nom", "type", "état", "câble vers", "description"], rows, { empty: only ? "aucun port physique up sans câble" : "aucune interface collectée" }));
    };
    draw(false);
    return [h("label", { class: "check-field" }, h("input", { type: "checkbox", onchange: (e) => draw(e.target.checked) }),
      "seulement les ports physiques up sans câble (" + lonely.length + ")"), holder];
  }

  // Les interfaces retirées depuis la run d'avant (ou toutes celles d'un équipement lui-même retiré), telles qu'elles
  // étaient : marquées, hors du compte « Interfaces : N » et du filtre « up sans câble » (revue, H1).
  function ghostInterfaceTable(model, gone) {
    const rows = gone.map((itf) => {
      const links = model.linksByIface.get(LD.model.ifaceKey(itf.hostname, itf.name)) || [];
      const facing = links.map((l) => LD.model.endLabel(l.a.hostname === itf.hostname && l.a.interface === itf.name ? l.b : l.a) + (l.ghost ? " (retiré)" : "")).join(", ");
      return { cells: [diffPill("removed"), itf.name, itf.type, itf.oper_status, facing || "—"] };
    });
    return table(["changement", "nom", "type", "état (run d'avant)", "câble vers"], rows, { empty: "aucune" });
  }

  function nodePanel(model, node, onSelect) {
    const links = model.linksByNode.get(node.hostname) || [];
    const gone = links.filter((l) => l.ghost).length; // les câbles retirés sont listés, marqués, hors du compte (revue, M4)
    const ifaces = model.ifacesByNode.get(node.hostname) || [];
    const ghostIfaces = model.ghostIfacesByNode.get(node.hostname) || [];
    const seen = node.evidence ? node.evidence.seen_by : [];
    const change = changeOf(model, "node", node.hostname, node.ghost);
    return [
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, LD.dom.KIND_LABEL[node.kind]),
        node.collection ? pill("collection", node.collection, "collecte : " + node.collection) : null, change ? diffPill(change.kind) : null),
      h("h3", {}, node.hostname),
      diffBlock(model, change, "équipement"),
      definition([
        ["type", node.type], ["constructeur · modèle", [node.vendor, node.model].filter(Boolean).join(" · ") || null],
        ["système", [node.os_name, node.os_version].filter(Boolean).join(" ") || null], ["série", node.serial_number], ["site", node.site],
        ["nom annoncé", node.reported_hostname], ["contextes virtuels", node.virtual_contexts.length ? node.virtual_contexts.join(", ") : null],
        ["stack", node.stack ? node.stack.member_count + " membres : " + node.stack.members.map((m) => m.slot + " " + m.role).join(", ") : null],
        ["capacités annoncées", node.evidence && node.evidence.capabilities.length ? node.evidence.capabilities.join(", ") : null],
      ]),
      node.kind === "device" ? [h("h4", { class: "section" }, "Couverture de la collecte"), coverageRow(model, node.hostname)] : null,
      seen.length ? [h("h4", { class: "section" }, "Vu par"), h("ul", { class: "plain" }, seen.map((w) => h("li", {}, sourcePill(w.source), " ", LD.model.endLabel(w))))] : null,
      h("h4", { class: "section" }, "Câbles : " + (links.length - gone) + (gone ? " · " + gone + " retiré" + (gone > 1 ? "s" : "") : "")),
      table(["port local", "en face"], links.map((link) => {
        const local = link.a.hostname === node.hostname ? link.a : link.b, remote = local === link.a ? link.b : link.a;
        return { onclick: () => onSelect({ kind: "link", id: link.id }), cells: [local.interface, [h("div", {}, LD.model.endLabel(remote)), h("div", {}, link.ghost ? diffPill("removed") : null, statusPill(link.status), link.sources.map(sourcePill))]] };
      }), { empty: "aucun câble" }),
      LD.structures.nodeStructures(model, node.hostname, onSelect),
      h("h4", { class: "section" }, "Contrôles"), checkList(model, model.checksByNode.get(node.hostname) || [], onSelect),
      node.ghost ? null : [h("h4", { class: "section" }, "Interfaces : " + ifaces.length), interfaceTable(model, ifaces)],
      ghostIfaces.length ? [h("h4", { class: "section" }, (node.ghost ? "Interfaces telles qu'elles étaient : " : "Interfaces retirées depuis la run d'avant : ") + ghostIfaces.length),
        ghostInterfaceTable(model, ghostIfaces)] : null,
    ];
  }

  // La vue d'ensemble ne répète pas les comptes de l'en-tête : elle dit ce qu'il ne dit pas, et comment lire la page.
  function overview(model) {
    return [
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "vue d'ensemble")),
      h("p", { class: "why" }, "Cliquer un câble montre ses sources ; cliquer un équipement montre sa fiche. Survoler un câble donne vitesse, duplex, média et état "
        + "des deux bouts. Glisser un équipement le déplace, la molette zoome, Tab parcourt les éléments."),
      definition([
        ["voisins inconnus", (model.kindCounts.get("stub") || 0) + " (masqués par défaut)"],
        ["agrégats", String(model.aggregates.length)], ["faisceaux", model.beams.length + " (bandes sous les câbles)"],
        ["domaines MLAG", String(model.mlagDomains.length)], ["clusters HA", model.clusters.length + " (cadres autour des membres)"],
      ]),
    ];
  }

  // Une ligne pour la zone live : ce qui vient d'être sélectionné, pour un lecteur d'écran, sans lui lire tout le panneau.
  const KIND_WORD = { link: "câble", node: "équipement", aggregate: "agrégat", beam: "faisceau", cluster: "cluster HA" };
  function describe(model, selection) {
    const entity = LD.model.entityOf(model, selection);
    if (!entity) return "";
    const label = { link: () => LD.model.endLabel(entity.a) + " ↔ " + LD.model.endLabel(entity.b), node: () => entity.hostname,
      aggregate: () => entity.hostname + " · " + entity.name, beam: () => LD.geometry.beamLabel(entity, true), cluster: () => LD.geometry.clusterLabel(entity) }[selection.kind]();
    return KIND_WORD[selection.kind] + " " + label + " sélectionné";
  }

  function show(container, model, selection, onSelect) {
    clear(container);
    let content = overview(model);
    if (selection && selection.kind === "link" && model.linkById.has(selection.id)) content = linkPanel(model, model.linkById.get(selection.id), onSelect);
    if (selection && selection.kind === "node" && model.nodeByHost.has(selection.id)) content = nodePanel(model, model.nodeByHost.get(selection.id), onSelect);
    const entity = LD.model.entityOf(model, selection);
    if (entity && selection.kind === "aggregate") content = LD.structures.aggregatePanel(model, entity, onSelect);
    if (entity && selection.kind === "beam") content = LD.structures.beamPanel(model, entity, onSelect);
    if (entity && selection.kind === "cluster") content = LD.structures.clusterPanel(model, entity, onSelect);
    container.appendChild(h("div", { class: "panel" }, content));
    container.scrollTop = 0;
    // Sous 900 px l'inspecteur est sous la toile : un panneau rempli hors écran ferait croire que le clic n'a rien fait.
    if (selection && typeof matchMedia === "function" && matchMedia("(max-width: 900px)").matches && container.scrollIntoView) container.scrollIntoView({ block: "start" });
  }

  LD.inspect = { show, checkList, describe };
})();
