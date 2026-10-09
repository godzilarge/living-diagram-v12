// Ce qu'un clic révèle des faisceaux d'agrégat (Orhan, 2026-10-07 : MLAG et port-channels cachés au repos ; un clic
// montre le faisceau, et les autres pattes du même MLAG / vPC). Trois ensembles d'identités de faisceaux :
// `primary` (le faisceau cliqué, celui du câble cliqué, ceux de l'agrégat cliqué), `sibling` (les autres faisceaux qui
// portent un domaine MLAG de `primary` : la patte d'un accès double-attaché vers l'autre cœur), `peer` (le peer-link
// de ces domaines). Le peer-link cliqué ne révèle que lui (il n'a pas de numéro de MLAG ; montrer toutes les pattes des
// cœurs serait du bruit) ; un équipement ne révèle rien. Pur, testé sous Node.
import { aggregateOf, beamOf, linkOf } from "./model";
import type { Beam, MlagDomainEntry, Model, Selection } from "./types";

export interface Revealed { primary: Set<string>; sibling: Set<string>; peer: Set<string> }
export const nothingRevealed = (): Revealed => ({ primary: new Set(), sibling: new Set(), peer: new Set() });

function primaryOf(model: Model, selection: Selection): Beam[] {
  if (selection.kind === "beam") { const beam = beamOf(model, selection); return beam ? [beam] : []; }
  if (selection.kind === "link") { const link = linkOf(model, selection); return link && link.beam ? [link.beam] : []; }
  if (selection.kind === "aggregate") { const aggregate = aggregateOf(model, selection); return aggregate ? aggregate.beams.slice() : []; }
  return [];
}

export function reveal(model: Model, selection: Selection | null): Revealed {
  const out = nothingRevealed();
  if (!selection) return out;
  const primary = primaryOf(model, selection);
  primary.forEach((beam) => out.primary.add(beam.id));
  const domains = new Set<MlagDomainEntry>();
  primary.forEach((beam) => { if (!beam.peerLink) beam.mlags.forEach((domain) => domains.add(domain)); });
  domains.forEach((domain) => {
    domain.members.forEach((aggregate) => aggregate.beams.forEach((beam) => { if (!out.primary.has(beam.id)) out.sibling.add(beam.id); }));
    if (domain.peerLink) domain.peerLink.beams.forEach((beam) => { if (!out.primary.has(beam.id)) out.peer.add(beam.id); });
  });
  return out;
}
