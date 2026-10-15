---
paths:
  - "app/**"
  - "engine/src/app/**"
---

# L'application (interface React)

Ce qu'un utilisateur regarde. Servie à `/` par le backend. **Tout ce qui touche à son apparence passe par l'agent `ui`
et le skill `brique-ui`**, jamais par une retouche à la main de l'orchestrateur.

## Avant d'écrire une ligne

- Lire `PRODUCT.md` (la vérité produit) et `DESIGN.md` (le monde visuel choisi, les jetons, les primitives et leurs
  états). S'ils manquent, la refonte n'a pas atteint cette étape : s'arrêter et le dire. Ne jamais inventer une
  couleur, une taille, une ombre, une police hors de `DESIGN.md`.
- Regarder l'existant : la page des primitives, la surface voisine. Une primitive se réutilise, elle ne se redessine
  pas. Un état (survol, allumé, désactivé, focus, erreur, occupé, mixte) a **une** définition.
- Une interaction nouvelle (geste, outil, panneau) se prototype d'abord au banc `bac-a-sable/<nom>/`, jugée par Orhan.

## Architecture

- Couches strictes **`api/ → state/ → components/`** : un composant rend l'état et envoie des actions ; il ne fait
  jamais d'appel réseau et ne touche jamais la toile. Seul `Canvas` monte la toile. La logique vit dans des modules
  purs (`state/`, `canvas/*.ts`) testés sous Node sans DOM ; un `.ts` du moteur n'appelle jamais `setTimeout`, la
  page fournit ses minuteries.
- L'adresse est l'état de vue (sélection, run, mode, couches) par un module pur ; la sélection multiple est transitoire.
- Préférences du navigateur (`ld-prefs` : thème, grille, langue, largeur du panneau) ≠ intentions (partagées, dans le
  contrat `Intent`, journalisées). Ne jamais ranger l'une à la place de l'autre.
- Deux vues : **Diagramme** (faits du device, édition) et **Contrôle** (verdicts de B1, lecture seule). Le critère de
  rangement est « qui le dit ».

## Interdits mécaniques (testés)

- Jamais de style en ligne, jamais de HTML construit depuis une donnée (`dangerouslySetInnerHTML` interdit) : CSP
  `'self'` partout, aucune ressource externe, polices embarquées.
- Aucune chaîne visible en dur : tout texte passe par les catalogues `fr` / `en` (`engine/strings.mjs` le vérifie) ;
  une clé avec `{{count}}` porte ses pluriels dans les deux langues.
- Icônes plutôt que mots dans les commandes, le mot dans l'infobulle ; capitales réservées aux pastilles.
- `/view` et `ld render` sont gelés : correctifs seulement, jamais une fonction nouvelle.

## Livrer

Une capture par retouche, à 1440 en sombre **et** en clair, jugée en une passe. Les tests complets tournent une fois
par lot (`cd backend && uv run pytest`, `cd engine && npm run check`). Une retouche visuelle n'a pas de revue
indépendante ; une brique en a une, contre la maquette approuvée, jamais contre un score.
