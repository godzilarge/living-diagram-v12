// Le clavier de la page, une seule règle : une touche frappée dans un champ (saisie, liste, texte éditable) appartient au
// champ, jamais à la toile ni aux raccourcis (revue de session, D4 : la règle était recopiée en cinq endroits). Avec
// `buttons`, un bouton focalisé garde aussi ses touches (Espace l'active, il ne déplace pas la vue).
const FIELDS = ["INPUT", "SELECT", "TEXTAREA"];

export function typing(target: EventTarget | null, buttons = false): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return FIELDS.includes(el.tagName) || (buttons && el.tagName === "BUTTON") || !!el.isContentEditable;
}
