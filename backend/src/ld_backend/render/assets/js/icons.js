// Les icônes d'équipement, une par `type` du contrat (switch, router, firewall, load_balancer, wireless_controller,
// server, other) : des tracés SVG de 16 × 16 dessinés ici, au trait, sans aucune ressource externe. Le type vient du
// snapshot ; l'icône n'ajoute rien, elle le montre.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const PATHS = {
    switch: "M1.5 4.5h13a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z M4 7h7 M9 5.5L11 7l-2 1.5 M12 9H5 M7 7.5L5 9l2 1.5",
    router: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14z M4 6h5 M7.5 4.5L9 6l-1.5 1.5 M12 10H7 M8.5 8.5L7 10l1.5 1.5",
    firewall: "M1 3.5h14v9H1z M1 6.5h14 M1 9.5h14 M5 3.5v3 M10 3.5v3 M3 6.5v3 M8 6.5v3 M13 6.5v3 M5 9.5v3 M10 9.5v3",
    load_balancer: "M8 1.5v4 M8 5.5L3 10.5 M8 5.5v5 M8 5.5l5 5 M1.5 10.5h3v3h-3z M6.5 10.5h3v3h-3z M11.5 10.5h3v3h-3z",
    wireless_controller: "M1.5 9.5h13v4h-13z M8 9.5V6 M5 5a4.2 4.2 0 0 1 6 0 M3 3a7 7 0 0 1 10 0",
    server: "M3.5 1.5h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z M2.5 5.5h11 M2.5 9.5h11 M5.5 3.5h.01 M5.5 7.5h.01 M5.5 11.5h.01",
    other: "M2.5 2.5h11v11h-11z M6 6.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.2 M8 11h.01",
  };
  const LABEL = { switch: "switch", router: "routeur", firewall: "firewall", load_balancer: "répartiteur", wireless_controller: "contrôleur Wi-Fi", server: "serveur", other: "autre" };
  const SIZE = 16;

  // Le tracé du type demandé, ou celui d'« autre » pour un type inconnu ou absent (un voisin inconnu n'a pas de type).
  const path = (type) => PATHS[type] || PATHS.other;
  const known = (type) => Object.prototype.hasOwnProperty.call(PATHS, type);

  LD.icons = { path, known, LABEL, SIZE, TYPES: Object.keys(PATHS) };
})();
