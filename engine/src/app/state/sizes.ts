// La taille d'un texte (lots 4 bis et 16 bis de docs/11), libre de 8 à 64 comme le contrat l'admet pour tout texte :
// le champ et le pas à pas (± 1) donnent toute valeur ; Ctrl+Maj+> / < et la molette d'un bloc qu'on écrit montent ou
// descendent d'un cran de l'échelle des éditeurs (9, 10, 11, 12, 13, 14, 16, 18…), d'une valeur hors échelle au cran
// voisin. Partagé par le texte des annotations, connecteurs et groupes et par le bloc de code. Sans DOM, testé sous Node.

export const SIZE_MIN = 8, SIZE_MAX = 64;
/** L'échelle des crans (celle des traitements de texte, resserrée vers le bas où l'on règle le plus finement). */
export const SIZE_LADDER: readonly number[] = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

/** Une taille ramenée dans les bornes, entière. */
export const clampSize = (size: number): number => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(size)));

/** Le cran suivant (`dir` = 1) ou précédent (-1) de l'échelle ; d'une valeur hors échelle, le cran voisin dans ce sens ;
 *  aux bornes, la borne. */
export function stepSize(size: number, dir: 1 | -1): number {
  const at = clampSize(size);
  if (dir > 0) return SIZE_LADDER.find((s) => s > at) ?? SIZE_MAX;
  for (let i = SIZE_LADDER.length - 1; i >= 0; i -= 1) if (SIZE_LADDER[i] < at) return SIZE_LADDER[i];
  return SIZE_MIN;
}

/** Les crans d'une molette (Ctrl + molette pendant l'écriture d'un bloc) : les pixels accumulés (`acc`) deviennent des
 *  crans entiers, le reste est gardé ; un cran par 100 pixels (une encoche de souris), vers le haut = plus grand. */
export function wheelSteps(acc: number, deltaY: number, deltaMode: number, notch = 100): { steps: number; acc: number } {
  const px = acc - (deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * 800 : deltaY);
  const steps = Math.trunc(px / notch);
  return { steps, acc: px - steps * notch };
}

export const sizes = { SIZE_MIN, SIZE_MAX, SIZE_LADDER, clampSize, stepSize, wheelSteps };
