// La ligne de base réelle d'une rangée de code (lot 16 bis de docs/11), mesurée dans la page : la lecture (SVG) pose
// son texte exactement où l'écriture (CodeMirror, une ligne HTML de même police, taille et hauteur) le posera, quels
// que soient le navigateur et la plate-forme (l'arrondi des métriques de police n'y est pas le même : Blink sous Linux
// prend un pixel à l'ascendante quand la descendante est arrondie par défaut, geometry.ts). Une mesure par police,
// taille et hauteur de rangée, gardée ; rien tant que la police n'est pas chargée (la formule de geometry.ts sert de
// repli, et la page se redessine quand les polices arrivent). Module du navigateur : sans document (tests sous Node),
// il ne mesure rien.

const cache = new Map<string, number>();

/** Le décalage de la ligne de base dans une rangée de hauteur `lh`, mesuré ; `null` si la police n'est pas encore là
 *  (ou sans document). */
export function measuredBaseline(font: string, size: number, lh: number): number | null {
  if (typeof document === "undefined" || !document.body) return null;
  const key = font + "|" + size + "|" + lh;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const line = document.createElement("div");
  line.className = "code-probe cf-" + font;
  line.style.setProperty("--probe-fs", size + "px");
  line.style.setProperty("--probe-lh", lh + "px");
  const mark = document.createElement("span");
  mark.className = "code-probe-mark";
  line.append("x", mark);
  document.body.appendChild(line);
  const family = getComputedStyle(line).fontFamily.split(",")[0].trim();
  const ready = !document.fonts || document.fonts.check(size + "px " + family);
  const offset = mark.getBoundingClientRect().top - line.getBoundingClientRect().top;
  line.remove();
  if (!ready) return null;
  cache.set(key, offset);
  return offset;
}

/** Les polices finissent de se charger : les mesures faites avant sont oubliées, la page se redessine. */
export function onFontsLoaded(listener: () => void): () => void {
  if (typeof document === "undefined" || !document.fonts) return () => undefined;
  const done = (): void => { cache.clear(); listener(); };
  document.fonts.addEventListener("loadingdone", done);
  return () => document.fonts.removeEventListener("loadingdone", done);
}
