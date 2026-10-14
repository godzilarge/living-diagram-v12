// Ce qui a changé entre deux dessins de la toile (lot 13 de docs/11) : la toile reconstruit tous ses nœuds et arêtes à
// chaque version (flow-build.ts), et React Flow redessine tout élément dont l'objet change. On reprend donc l'objet déjà
// montré quand le nouveau ne diffère en rien : une sélection ne redessine que les éléments dont la classe change, un
// déplacement que ceux qui bougent. Pur, sans DOM ni React, testé sous Node.

/** La profondeur jusqu'où deux valeurs se comparent : assez pour les données d'un nœud (plan d'une carte, style et
 *  contenu d'une annotation, cellules d'un tableau) ; au-delà, seule l'identité compte. */
export const DEPTH = 6;

/** Un objet simple (littéral, JSON), quel que soit le royaume qui l'a créé : son prototype est nul ou un `Object.prototype`. */
const plain = (value: object): boolean => { const proto = Object.getPrototypeOf(value); return proto === null || Object.getPrototypeOf(proto) === null; };

/** Deux valeurs égales en profondeur bornée : la même référence, deux nombres égaux (NaN compris), ou deux tableaux ou
 *  objets simples aux mêmes clés et aux valeurs égales. Une `Map`, un `Set`, une fonction : l'identité seulement. */
export function same(a: unknown, b: unknown, depth = DEPTH): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (depth <= 0 || typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!same(a[i], b[i], depth - 1)) return false;
    return true;
  }
  if (!plain(a) || !plain(b)) return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  for (const key of keys) if (!(key in y) || !same(x[key], y[key], depth - 1)) return false;
  return true;
}

/** Deux listes aux mêmes éléments, un à un, par identité : l'égalité d'un abonnement (connecteur abonné à ses bouts). */
export const sameItems = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

/** Ce que React Flow pose lui-même sur un élément montré et qui ne vient pas de la toile : ses mesures (gardées). */
const OWN = new Set(["measured"]);

/** L'élément montré peut-il resservir pour le neuf ? Mêmes clés, mêmes valeurs ; de celles que React Flow pose, seules
 *  ses mesures et un état éteint (`dragging: false`) sont admis : jamais pendant un glissé, où il tient la place. */
export function unchanged(next: object, shown: object): boolean {
  const n = next as Record<string, unknown>, s = shown as Record<string, unknown>;
  for (const key of Object.keys(n)) if (!same(n[key], s[key])) return false;
  for (const key of Object.keys(s)) if (!(key in n) && !OWN.has(key) && s[key] !== undefined && s[key] !== false) return false;
  return true;
}

interface Measured { measured?: { width?: number; height?: number } }

/** Les éléments à donner à React Flow : pour chaque élément neuf, celui déjà montré sous le même `id` s'il ne diffère
 *  pas (même objet : React Flow ne le redessine pas), sinon le neuf, qui garde les mesures déjà prises de l'ancien
 *  (sans elles, React Flow le tiendrait pour neuf, le cacherait et retirerait ses arêtes jusqu'à une nouvelle mesure ;
 *  défaut vu le 2026-10-07). Rend la liste montrée elle-même quand rien n'a changé, ni l'ordre ni un élément. */
export function reuse<T extends { id: string }>(next: readonly T[], shown: readonly T[]): T[] {
  const byId = new Map<string, T>();
  shown.forEach((item) => byId.set(item.id, item));
  let changed = next.length !== shown.length;
  const out = next.map((item, i) => {
    const old = byId.get(item.id);
    if (old && unchanged(item, old)) {
      if (shown[i] !== old) changed = true;
      return old;
    }
    changed = true;
    const m = old ? (old as Measured).measured : undefined;
    return m && m.width !== undefined && m.height !== undefined ? ({ ...item, measured: m } as T) : item;
  });
  return changed ? out : (shown as T[]);
}

export const reusing = { DEPTH, same, sameItems, unchanged, reuse };
