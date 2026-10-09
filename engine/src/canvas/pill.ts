// La pastille : une seule forme pour tout ce qui énonce un fait court sur la toile et dans les fiches (rôle HA, stack,
// vitesse, MLAG, statut, gravité ; Orhan, 2026-10-07 : « une classe unique, une forme, une police, une taille ; la
// couleur change selon l'état »). Capsule de 20, JetBrains Mono 600 11 en capitales : sa largeur se calcule ici, jamais
// mesurée (une chasse fixe), pour que la toile reste déterministe. Les commandes (boutons) ont une autre forme : un
// rectangle aux coins de 6. Pur, testé sous Node.

export const PILL_H = 20, PILL_PAD = 7, PILL_ADV = 6.82, PILL_ICON = 12, PILL_DOT = 6, PILL_LEAD_GAP = 4;
/** Au-delà, ce n'est plus une pastille mais du texte. */
export const PILL_MAX = 14;

export type PillLead = "icon" | "dot" | null;

/** La largeur d'une pastille : marges, icône ou point de tête, texte à chasse fixe (0,6 em + 0,02 em d'interlettrage). */
export function pillWidth(text: string, lead: PillLead = null): number {
  const leadW = lead === "icon" ? PILL_ICON + PILL_LEAD_GAP : lead === "dot" ? PILL_DOT + PILL_LEAD_GAP : 0;
  return Math.ceil(2 * PILL_PAD + leadW + Array.from(text).length * PILL_ADV);
}

/** Une vitesse lue en Mbit/s, en jeton compact comme sur une fiche constructeur : 100M, 1G, 2.5G, 10G, 400G. */
export function speedToken(mbps: number): string {
  if (mbps < 1000) return mbps + "M";
  const g = Math.round(mbps / 100) / 10;
  return (Number.isInteger(g) ? String(g) : g.toFixed(1)) + "G";
}

// Le nom court d'un agrégat, comme on le dit : port-channel10 → PO10, Bundle-Ether1 → BE1 ; sinon le nom en capitales
// (agg-core, ae0). Seulement l'écriture : le nom complet reste dans la fiche et la bulle.
const SHORT: [RegExp, string][] = [[/^port-?channel\s*(\d.*)$/i, "PO"], [/^bundle-?ether\s*(\d.*)$/i, "BE"], [/^po(\d.*)$/i, "PO"]];
export function aggregateShort(name: string): string {
  for (const [pattern, prefix] of SHORT) {
    const found = pattern.exec(name);
    if (found) return prefix + found[1];
  }
  return name.toUpperCase();
}

/** Ce qu'un faisceau dit de lui en pastille : PEER-LINK, MLAG 104 (MLAG 20+21 s'il en porte deux), sinon ses
 *  port-channels (PO10, PO10/PO20 quand les deux bouts n'ont pas le même nom : un numéro est local à son équipement). */
export function beamPillText(beam: { a: { aggregate: string }; b: { aggregate: string }; peerLink: boolean; mlags: { raw: { mlag_id: number | null } }[] }): string {
  if (beam.peerLink) return "peer-link";
  if (beam.mlags.length) return "MLAG " + beam.mlags.map((d) => d.raw.mlag_id).join("+");
  const a = aggregateShort(beam.a.aggregate), b = aggregateShort(beam.b.aggregate);
  return a === b ? a : a + "/" + b;
}

export const pill = { beamPillText, pillWidth, speedToken, aggregateShort, PILL_H, PILL_MAX };
