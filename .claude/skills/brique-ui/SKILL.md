---
name: brique-ui
description: Construire ou modifier une surface de l'application (barre, toile, fiche, volet, page) sous le monde visuel choisi. À charger pour toute modification d'interface, même une retouche. Impose PRODUCT.md, DESIGN.md, la page des primitives, le prototype au banc pour une interaction nouvelle, la capture et la revue contre la maquette.
---

# Brique d'interface

Une brique = une surface ou une interaction, livrée sous `DESIGN.md`, jugée par Orhan sur un rendu réel.

## 1. Lire (obligatoire, dans cet ordre)

1. `docs/etat.md` : où en est la refonte, ce qui est gelé.
2. `PRODUCT.md` : qui regarde, où, pour faire quoi. **Absent ⇒ s'arrêter** : la brique n'a pas de vérité produit.
3. `DESIGN.md` : le monde visuel, les jetons, chaque primitive et ses états. **Absent ⇒ s'arrêter.** Puis la
   maquette approuvée de la surface dans `design/comps/shell/` (page, états, captures) : c'est elle que la brique
   reproduit et que le relecteur compare.
4. La page vivante des primitives (`app/primitives.html`, `npm run dev`) et `app/src/ui/` : ce qui existe se
   réutilise ; un contrôle ne se rend que par une primitive.
5. La règle `.claude/rules/app.md` et le document de conception de la brique (`docs/NN-*.md` ou `docs/11`).
6. Les skills `frontend-design:frontend-design` et `impeccable:impeccable` (lancer `impeccable context`).

## 2. Annoncer

Avant tout code : en dix lignes, la surface, les primitives réutilisées, ce qui manque à `DESIGN.md` (une primitive
nouvelle est une **décision**, pas un détail : proposée à Orhan, ajoutée à `DESIGN.md` et à la page des primitives
avant usage), les décisions non triviales, les captures prévues.

## 3. Prototyper quand le comportement est incertain

Une interaction nouvelle (geste, outil, panneau, animation) se prototype hors du projet : page autonome dans
`bac-a-sable/<nom>/` (gitignoré ; données factices ; aucun fichier de `engine/`, `app/`, `backend/` touché), servie
par `cd bac-a-sable && python3 -m http.server 8016 --bind 0.0.0.0`. Orhan la juge dans son navigateur. **Pas certain ⇒
deux à quatre directions côte à côte.** Le code du projet ne s'écrit qu'après son accord. Une retouche d'une surface
existante sous `DESIGN.md` n'a pas besoin de prototype.

## 4. Construire

- Dans `app/` (v2) ou, tant que la v2 n'existe pas, dans la zone désignée par `docs/etat.md`.
- Couches `api/ → state/ → components/` ; la logique en modules purs testés sous Node ; aucun style en ligne, aucune
  chaîne en dur (catalogues `fr` / `en`), aucune valeur hors jetons.
- Lire `impeccable`'s `reference/craft-floor.md` juste avant la première édition d'UI.
- Construire **en entier**, puis une seule passe d'inspection groupée (captures sombre et clair à 1440, 1024 si la mise
  en page change), corriger tout en un lot, confirmer avec au plus une seconde passe. Pas de boucle de polissage.

## 5. Livrer

- Captures dans `.impeccable/planche-<brique>/` (sombre, clair, et les états qui comptent), remises à Orhan.
- Tests : modules purs sous Node ; un parcours Chromium pour une interaction ; suite complète une fois par lot.
- Revue : une **brique** est relue par l'agent `relecteur-ui` **contre la maquette approuvée et `DESIGN.md`**, jamais
  contre un score ; une retouche visuelle n'a pas de revue. Les défauts purs se corrigent sans Orhan ; une règle
  douteuse va dans `docs/a-juger-a-l-usage.md` avec un comportement prudent.
- Finir par le skill `livraison`.
