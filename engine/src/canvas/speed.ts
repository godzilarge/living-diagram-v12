// La vitesse des câbles, en pastilles (Orhan, 2026-10-07). Une pastille par groupe, jamais une par câble : l'éventail
// espace les câbles de 14 au plus, une pastille fait 20 de haut. Un groupe = un faisceau d'agrégat (« 2×10G »), ou les
// câbles hors faisceau d'une même paire d'équipements, ou un câble seul. La vitesse se lit dans `interfaces[]`, ports
// `physical` / `management` seulement (la vitesse d'un agrégat est une somme) ; rien n'est déduit : deux bouts qui
// diffèrent s'écrivent tous les deux (« 10G/1G », en avertissement), un seul bout lu donne une pastille pointillée,
// aucun bout lu, pas de pastille. Pur, testé sous Node.
import { beamBand, fanOffset } from "./geometry";
import { interfaceAt, worst } from "./model";
import { speedToken } from "./pill";
import type { Endpoint, Severity } from "../contracts/snapshot";
import type { Beam, Model, ModelLink } from "./types";

export type SpeedTone = "neutral" | "warning" | "muted";
export interface SpeedGroup {
  key: string; pair: string; beam: Beam | null; links: ModelLink[]; text: string; tone: SpeedTone; dashed: boolean;
  /** La pire gravité des câbles du groupe : le point du milieu des câbles entre dans la pastille. */
  worst: Severity | null;
  /** L'écart de l'axe du groupe à l'axe de la paire (géométrie de l'éventail), et la position le long de la courbe. */
  offset: number; t: number;
}

const PHYSICAL = new Set(["physical", "management"]);
/** Les places essayées le long de la courbe, dans l'ordre, quand plusieurs groupes partagent une paire. */
export const SLOTS = [0.5, 0.65, 0.35, 0.8, 0.2];

function endSpeed(model: Model, end: Endpoint): number | null {
  const found = interfaceAt(model, end.hostname, end.interface, false);
  if (!found || !PHYSICAL.has(found.itf.type)) return null;
  const mbps = found.itf.speed_mbps;
  return typeof mbps === "number" ? mbps : null;
}

interface CableSpeed { token: string | null; rank: number; mismatch: boolean; partial: boolean }

function cableSpeed(model: Model, link: ModelLink): CableSpeed {
  const a = endSpeed(model, link.a), b = endSpeed(model, link.b);
  if (a !== null && b !== null) {
    return a === b ? { token: speedToken(a), rank: a, mismatch: false, partial: false }
      : { token: speedToken(a) + "/" + speedToken(b), rank: Math.max(a, b), mismatch: true, partial: false };
  }
  const one = a !== null ? a : b;
  return one === null ? { token: null, rank: 0, mismatch: false, partial: false } : { token: speedToken(one), rank: one, mismatch: false, partial: true };
}

// « 2×10G », « 2×10G+1G » : les jetons du plus rapide au plus lent, comptés.
function groupText(speeds: CableSpeed[]): string {
  const counts = new Map<string, { count: number; rank: number }>();
  speeds.forEach((s) => { if (!s.token) return; const got = counts.get(s.token); counts.set(s.token, { count: (got ? got.count : 0) + 1, rank: s.rank }); });
  return Array.from(counts).sort((x, y) => y[1].rank - x[1].rank || (x[0] < y[0] ? -1 : 1))
    .map(([token, { count }]) => (count > 1 ? count + "×" + token : token)).join("+");
}

/** Les pastilles de vitesse des câbles donnés (les câbles visibles), dans l'ordre des câbles ; les fantômes n'en ont pas. */
export function speedGroups(model: Model, links: ModelLink[]): SpeedGroup[] {
  const byKey = new Map<string, ModelLink[]>();
  links.forEach((link) => {
    if (link.ghost || link.a.hostname === link.b.hostname) return;
    const key = link.beam ? "beam:" + link.beam.id : "pair:" + link.pair;
    const got = byKey.get(key);
    if (got) got.push(link); else byKey.set(key, [link]);
  });
  const groups: SpeedGroup[] = [];
  byKey.forEach((members, key) => {
    const speeds = members.map((link) => cableSpeed(model, link));
    if (!speeds.some((s) => s.token)) return;
    const beam = members[0].beam;
    const tone: SpeedTone = speeds.some((s) => s.mismatch) ? "warning" : members.every((l) => l.raw.oper === "down") ? "muted" : "neutral";
    const offset = beam ? beamBand(beam).offset : members.reduce((sum, link) => sum + fanOffset(link), 0) / members.length;
    groups.push({ key, pair: members[0].pair, beam, links: members, text: groupText(speeds), tone, dashed: speeds.some((s) => s.partial || !s.token),
      worst: worst(members.flatMap((link) => (link.worst ? [{ severity: link.worst }] : []))), offset, t: SLOTS[0] });
  });
  // Plusieurs groupes sur une paire (deux faisceaux côte à côte, un faisceau et un câble seul) : chacun sa place le
  // long de la courbe, dans l'ordre de leur écart à l'axe ; au-delà des places, la dernière se répète.
  const byPair = new Map<string, SpeedGroup[]>();
  groups.forEach((g) => { const got = byPair.get(g.pair); if (got) got.push(g); else byPair.set(g.pair, [g]); });
  byPair.forEach((list) => list.sort((x, y) => x.offset - y.offset || (x.key < y.key ? -1 : 1))
    .forEach((g, i) => { g.t = SLOTS[Math.min(i, SLOTS.length - 1)]; }));
  return groups;
}

/** Le point à `t` le long de la courbe d'un groupe (la même que `geometry.chord` : quadratique, contrôle écarté de
 *  2 × `offset` le long de la normale) : où la pastille se pose. */
export function pointOn(p: { x: number; y: number }, q: { x: number; y: number }, offset: number, t: number): { x: number; y: number } {
  const dx = q.x - p.x, dy = q.y - p.y, length = Math.max(Math.hypot(dx, dy), 0.01);
  const c = { x: (p.x + q.x) / 2 - (dy / length) * offset * 2, y: (p.y + q.y) / 2 + (dx / length) * offset * 2 };
  return { x: (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * c.x + t * t * q.x, y: (1 - t) * (1 - t) * p.y + 2 * (1 - t) * t * c.y + t * t * q.y };
}

export const speed = { speedGroups, pointOn, SLOTS };
