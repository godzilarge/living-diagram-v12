// Les panneaux des structures de R4 : un faisceau (les câbles entre deux agrégats), un agrégat, un cluster HA.
// Comme pour un câble : d'où ça vient (le document du topic, la couverture de la collecte), ce que ça relie, les
// contrôles. Tout est lu, rien n'est calculé.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const { h, pill, statusPill, sourcePill, plain, definition, table } = LD.dom;

  const aggregateLabel = (aggregate) => aggregate.hostname + " · " + aggregate.name;
  const aggregateButton = (aggregate, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "aggregate", id: aggregate.key }) }, aggregateLabel(aggregate));
  const nodeButton = (hostname, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: hostname }) }, hostname);
  const beamButton = (beam, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "beam", id: beam.id }) }, LD.graph.beamLabel(beam));
  const clusterButton = (cluster, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "cluster", id: cluster.id }) }, LD.graph.clusterLabel(cluster));

  function topicPill(model, hostname, topic) {
    const coverage = model.coverage.find((c) => c.hostname === hostname);
    const status = coverage ? coverage.topics[topic] : "absent";
    return pill("topic", status, "topic " + topic + " : " + status);
  }

  function cableRows(model, links, onSelect) {
    return links.map((link) => ({ onclick: () => onSelect({ kind: "link", id: link.id }),
      cells: [LD.model.endLabel(link.a), LD.model.endLabel(link.b), [statusPill(link.status), link.sources.map(sourcePill)], link.raw.oper] }));
  }

  const cableTable = (model, links, onSelect, empty) => table(["bout a", "bout b", "statut · sources", "état"], cableRows(model, links, onSelect), { empty });

  function memberRows(model, aggregate, onSelect) {
    return aggregate.raw.members.map((member) => {
      const links = (model.linksByIface.get(LD.model.ifaceKey(aggregate.hostname, member.name)) || []);
      const facing = links.map((link) => LD.model.endLabel(link.a.hostname === aggregate.hostname && link.a.interface === member.name ? link.b : link.a));
      return { onclick: links.length === 1 ? () => onSelect({ kind: "link", id: links[0].id }) : null,
        cells: [member.name, pill("member", member.status, member.status), facing.length ? facing.join(", ") : "—"] };
    });
  }

  function mlagText(aggregate, onSelect) {
    const domain = aggregate.mlag;
    if (!domain) return null;
    const partner = domain.members.find((m) => m !== aggregate);
    return definition([
      ["domaine MLAG", String(domain.raw.mlag_id)],
      ["agrégat pair", partner ? aggregateButton(partner, onSelect) : "(absent du snapshot)"],
      ["peer-link", domain.peerLink ? aggregateButton(domain.peerLink, onSelect) : "aucun agrégat marqué peer-link"],
      ["équipement aval", domain.raw.downstream ? nodeButton(domain.raw.downstream, onSelect) : "non unique ou inconnu (voir les contrôles)"],
    ]);
  }

  // Les câbles arrêtés à l'agrégat lui-même : R1-bis n'a pas su désigner le membre (`remote_port_is_aggregate`).
  const stoppedCables = (model, aggregate) => model.linksByIface.get(LD.model.ifaceKey(aggregate.hostname, aggregate.name)) || [];

  function aggregateWhy(model, aggregate) {
    const raw = aggregate.raw;
    const bundled = raw.members.filter((m) => m.status === "bundled").length;
    const stopped = stoppedCables(model, aggregate).length;
    const parts = [raw.members.length + " membre" + (raw.members.length > 1 ? "s" : "") + " dont " + bundled + " bundled, " + raw.protocol
      + (raw.lacp_mode ? " " + raw.lacp_mode : "") + (raw.min_links !== null ? ", min_links " + raw.min_links : "") + "."];
    parts.push(aggregate.cables.length ? aggregate.cables.length + " câble" + (aggregate.cables.length > 1 ? "s" : "") + " tracé" + (aggregate.cables.length > 1 ? "s" : "") + " sur ses membres." : "Aucun câble tracé sur ses membres.");
    if (stopped) parts.push(stopped + " câble" + (stopped > 1 ? "s" : "") + " arrêté" + (stopped > 1 ? "s" : "") + " à l'agrégat lui-même : le voisin l'annonce en port-id et B1 n'a pas su désigner le membre.");
    if (raw.mlag_peer_link) parts.push("Cet agrégat est le peer-link de son domaine MLAG.");
    else if (aggregate.mlag) parts.push("Membre du domaine MLAG " + aggregate.mlag.raw.mlag_id + ".");
    return parts.join(" ");
  }

  function aggregatePanel(model, aggregate, onSelect) {
    const raw = aggregate.raw;
    return [
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "agrégat"), pill("degraded", String(raw.degraded), raw.degraded ? "dégradé" : "complet"),
        pill("oper", raw.oper_status, raw.oper_status), raw.mlag_peer_link ? pill("role", "peer-link", "peer-link") : null),
      h("h3", { class: "ends" }, nodeButton(raw.hostname, onSelect), " · " + raw.name),
      h("p", { class: "why" }, aggregateWhy(model, aggregate)),
      definition([["protocole", raw.protocol + (raw.lacp_mode ? " · " + raw.lacp_mode : "")], ["min_links", raw.min_links], ["MLAG id", raw.mlag_id]]),
      h("h4", { class: "section" }, "Membres : " + raw.members.length),
      table(["port", "statut", "câble vers"], memberRows(model, aggregate, onSelect), { empty: "aucun membre listé" }),
      stoppedCables(model, aggregate).length ? [h("h4", { class: "section" }, "Câbles arrêtés à l'agrégat lui-même : " + stoppedCables(model, aggregate).length),
        h("p", { class: "muted" }, "Le voisin annonce le nom de l'agrégat en port-id (R1-bis) ; le membre n'a pas pu être désigné : contrôle remote_port_is_aggregate sur chaque câble."),
        cableTable(model, stoppedCables(model, aggregate), onSelect, "aucun")] : null,
      aggregate.beams.length ? [h("h4", { class: "section" }, "Faisceaux"), h("ul", { class: "plain" }, aggregate.beams.map((beam) => h("li", {}, beamButton(beam, onSelect))))] : null,
      aggregate.mlag ? [h("h4", { class: "section" }, "Domaine MLAG"), mlagText(aggregate, onSelect)] : null,
      h("h4", { class: "section" }, "Sources"),
      h("p", { class: "muted" }, "Document du topic aggregates de " + raw.hostname + " : membres et statuts tels que l'équipement les rapporte. ", topicPill(model, raw.hostname, "aggregates")),
      h("p", { class: "muted" }, "Chaque câble a ses propres sources : cliquer un membre câblé."),
      h("h4", { class: "section" }, "Contrôles"), LD.inspect.checkList(model, aggregate.checks, onSelect),
    ];
  }

  // La phrase ne compare les protocoles que si B1 a pu le faire : un bout sans document aggregates n'a pas de
  // protocole connu, ce n'est pas un désaccord (revue, 1). Chaque domaine MLAG des deux agrégats est nommé (revue, 3).
  function beamWhy(beam) {
    const parts = [beam.links.length + " câble" + (beam.links.length > 1 ? "s" : "") + " entre les membres de " + beam.a.aggregate + " et de " + beam.b.aggregate + "."];
    const missing = beam.aggregates.map((agg, index) => (agg ? null : [beam.a, beam.b][index])).filter(Boolean);
    if (missing.length) {
      const known = beam.known.map((agg) => agg.raw.protocol);
      parts.push((known.length ? "Protocole " + known[0] + " d'un côté ; " : "") + missing.map((end) => end.hostname + " · " + end.aggregate).join(" et ")
        + " n'a pas de document aggregates (appartenance lue dans interfaces[].members) : B1 ne compare pas les protocoles.");
    } else {
      const protocols = beam.known.map((agg) => agg.raw.protocol);
      parts.push(protocols[0] === protocols[1] ? "Protocole " + protocols[0] + " des deux côtés." : "Protocoles différents : " + protocols.join(" / ") + ".");
    }
    if (beam.peerLink) parts.push("C'est le peer-link d'un domaine MLAG.");
    beam.mlags.forEach((domain) => parts.push("Patte du domaine MLAG " + domain.raw.mlag_id + (domain.raw.downstream ? " (vers " + domain.raw.downstream + ")" : "") + "."));
    return parts.join(" ");
  }

  function beamPanel(model, beam, onSelect) {
    const ends = [beam.a, beam.b].map((end, index) => {
      const aggregate = beam.aggregates[index];
      return aggregate ? aggregateButton(aggregate, onSelect) : h("span", {}, end.hostname + " · " + end.aggregate + " (sans document aggregates)");
    });
    return [
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "faisceau"), beam.peerLink ? pill("role", "peer-link", "peer-link") : null,
        beam.mlags.map((domain) => pill("role", "mlag", "MLAG " + domain.raw.mlag_id)), beam.degraded ? pill("degraded", "true", "un agrégat dégradé") : null),
      h("h3", { class: "ends" }, ends[0], h("span", { class: "arrow" }, " ⇄ "), ends[1]),
      h("p", { class: "why" }, beamWhy(beam)),
      h("h4", { class: "section" }, "Câbles : " + beam.links.length),
      cableTable(model, beam.links, onSelect, "aucun câble"),
      h("h4", { class: "section" }, "Contrôles des deux agrégats"), LD.inspect.checkList(model, beam.checks, onSelect),
    ];
  }

  function memberTable(cluster, onSelect) {
    return table(["membre", "rôle", "état", "priorité", "rapporté par"], cluster.raw.members.map((member) => ({
      cells: [nodeButton(member.hostname, onSelect), member.role, pill("state", member.state, member.state), plain(member.priority), member.reported_by.join(", ")] })), { empty: "aucun membre" });
  }

  function heartbeatTable(cluster, onSelect) {
    return table(["membre", "interface", "câble"], cluster.heartbeats.map((hb) => ({
      cells: [hb.hostname, hb.interface, hb.link
        ? h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "link", id: hb.link.id }) }, LD.model.endLabel(hb.link.a) + " ↔ " + LD.model.endLabel(hb.link.b))
        : h("span", { class: "muted" }, "aucun câble observé ni documenté : rien n'est inventé")] })), { empty: "aucune interface de heartbeat rapportée" });
  }

  function clusterSources(model, cluster) {
    const reporters = new Set(cluster.raw.members.flatMap((m) => m.reported_by));
    return h("ul", { class: "plain" }, cluster.hosts.map((host) => {
      const node = model.nodeByHost.get(host) || {};
      return h("li", {}, reporters.has(host) ? ["document ha de " + host + " ", topicPill(model, host, "ha")]
        : h("span", { class: "muted" }, host + " : aucun document ha" + (node.collection ? " (collecte : " + node.collection + ")" : "")));
    }));
  }

  function clusterWhy(cluster) {
    const reporters = Array.from(new Set(cluster.raw.members.flatMap((m) => m.reported_by)));
    const down = cluster.raw.members.filter((m) => m.state === "down").map((m) => m.hostname);
    const parts = [cluster.hosts.length + " membre" + (cluster.hosts.length > 1 ? "s" : "") + " en " + cluster.raw.mode + ", décrit" + (cluster.hosts.length > 1 ? "s" : "") + " par le document ha de " + reporters.join(" et de ") + "."];
    if (down.length) parts.push("Membre" + (down.length > 1 ? "s" : "") + " down : " + down.join(", ") + ".");
    const without = cluster.heartbeats.filter((hb) => !hb.link).length;
    if (without) parts.push(without + " interface" + (without > 1 ? "s" : "") + " de heartbeat sans câble.");
    return parts.join(" ");
  }

  function clusterPanel(model, cluster, onSelect) {
    const raw = cluster.raw;
    return [
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "cluster HA"), pill("mode", raw.mode, raw.mode)),
      h("h3", {}, raw.cluster_name || cluster.hosts.join(" + ")),
      h("p", { class: "why" }, clusterWhy(cluster)),
      h("h4", { class: "section" }, "Membres : " + cluster.hosts.length), memberTable(cluster, onSelect),
      h("h4", { class: "section" }, "Heartbeat"), heartbeatTable(cluster, onSelect),
      h("h4", { class: "section" }, "Sources"), clusterSources(model, cluster),
      h("h4", { class: "section" }, "Contrôles"), LD.inspect.checkList(model, cluster.checks, onSelect),
    ];
  }

  // Ce qu'un équipement porte comme structures : ses agrégats, ses clusters ; pour la fiche d'un équipement collecté
  // (un voisin inconnu ou un externe n'a pas de document aggregates : rien à dire).
  function nodeStructures(model, hostname, onSelect) {
    const node = model.nodeByHost.get(hostname) || {};
    const aggregates = model.aggregatesByNode.get(hostname) || [];
    const clusters = model.clustersByHost.get(hostname) || [];
    return [
      clusters.length ? [h("h4", { class: "section" }, "Cluster" + (clusters.length > 1 ? "s" : "") + " HA"),
        h("ul", { class: "plain" }, clusters.map((cluster) => h("li", {}, clusterButton(cluster, onSelect))))] : null,
      node.kind !== "device" ? null : [h("h4", { class: "section" }, "Agrégats : " + aggregates.length),
      table(["agrégat", "protocole", "membres", "câbles", "état"], aggregates.map((aggregate) => ({
        onclick: () => onSelect({ kind: "aggregate", id: aggregate.key }),
        cells: [aggregate.name, aggregate.raw.protocol, aggregate.raw.members.filter((m) => m.status === "bundled").length + " / " + aggregate.raw.members.length + " bundled",
          String(aggregate.cables.length), pill("degraded", String(aggregate.raw.degraded), aggregate.raw.degraded ? "dégradé" : "complet")] })), { empty: "aucun document aggregates pour cet équipement" })],
    ];
  }

  LD.structures = { aggregatePanel, beamPanel, clusterPanel, nodeStructures, aggregateButton, beamButton, clusterButton, aggregateLabel };
})();
