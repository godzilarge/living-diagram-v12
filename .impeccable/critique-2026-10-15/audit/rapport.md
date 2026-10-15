# Audit technique : repères (lot 8), bloc de code (lot 16), barre contextuelle (lot 4), 2026-10-15

Périmètre : `canvas/guides.ts`, `guide-drag.ts`, `GuideLayer.tsx`, `styles/guides.css` ; `app/code/`, `canvas/code*.tsx`,
`components/CodeVolets.tsx`, `cards/CodeCard.tsx`, `styles/code.css` ; `FloatingBar.tsx`, `FloatingVolet.tsx`,
`state/floating.ts`, `styles/floating.css` (chemins relatifs à `engine/src/app/`). Méthode : lecture, détecteur Impeccable,
mesures dans Chromium sans écran ni GPU (pilote `backend/tests/browser.py`, serveur `tests.test_view._serve`), sur demo-dc
et sur la jauge (500 équipements, `generate --seed 7`). Rien du projet n'a été modifié. Scripts : `scripts/` ; mesures :
`mesures-*.json` ; captures : `captures/`. Non testé : gestes tactiles (aucun toucher synthétisé), lecteur d'écran réel
(arbre d'accessibilité seulement), rendu avec GPU. Ce qui figure dans `docs/a-juger-a-l-usage.md` n'est pas compté.

## Score

| # | Axe | Score | Constat principal |
|---|-----|-------|-------------------|
| 1 | Accessibilité | 2 | Avertissement des secrets inatteignable au clavier après un collage, et Tab modifie le texte |
| 2 | Performance | 3 | Fiche d'un bloc de 2 000 lignes : une tâche longue de 160 à 240 ms |
| 3 | Thèmes | 3 | Textes dépendant de la teinte sous 4,5:1 en clair ; quelques couleurs en dur dans la barre |
| 4 | Responsive | 2 | L'avertissement des secrets passe sous la fiche à 1024, 1280 et 1440 |
| 5 | Intégrité | 3 | Système cohérent, détecteur sans constat ; z-index hors échelle, rôles ARIA détournés |
| **Total** | | **13/20** | **Acceptable** |

**Intégrité : réussie.** Le détecteur ne remonte rien (`detector.json`, `[]`). Aucun style en ligne : les places passent par
des variables posées par le CSSOM. Aucune chaîne en dur, jetons dans les deux thèmes. Les défauts ci-dessous sont localisés,
pas systémiques, sauf un : dans un volet de la barre, le clavier ne sait parcourir qu'**un seul** groupe.

Constats : 3 P1, 5 P2, 5 P3. Les trois P1 sont des défauts purs.

## P1

**[P1] Avertissement ouvert par un collage : le focus reste dans le champ, Tab écrit dans le code collé**
- Où : `canvas/code-edit.tsx:79` (`if (warn) { el.focus(); return; }`, un effet du parent passe après celui de
  `CodeWarn`, qui avait mis le focus sur « Retirer ») ; `:129` (Tab insère quatre espaces sans tenir compte de `warn`).
- Preuve (`mesures-suivi.json`) : après le collage d'une configuration Cisco avec des valeurs sensibles, le focus est sur
  le `textarea`. Deux Tab font commencer le texte par huit espaces. En six Tab, « Retirer la valeur » n'a jamais le focus.
  `Maj+Tab` sort vers ce qui précède le champ dans le DOM, alors que l'avertissement vient après. Le chemin
  « Ctrl+Entrée » met bien le focus sur « Retirer » : seul le collage est touché.
- Impact : au clavier, on ne peut ni retirer ni garder les valeurs. On modifie le texte collé sans le voir. Le rôle
  `alertdialog` n'est pas annoncé, puisque le focus n'y entre pas. WCAG 2.1.1 et 2.4.3.
- Correction : quand `warn` existe au montage, ne pas reprendre le focus dans le champ. Pendant que l'avertissement est
  ouvert, Tab n'insère rien et va vers lui. (`/impeccable harden`)

**[P1] L'avertissement des secrets passe sous la fiche**
- Où : `canvas/code-warn.tsx:246`. Si l'avertissement ne tient ni à droite ni à gauche du bloc, il se pose « à droite quand
  même ». Il vit dans la toile, sous la fiche (`--z-panel`).
- Preuve : la fiche ouverte, bloc centré par `reveal`. À 1024, 408 px masqués (et 48 px hors de l'écran). À 1280, 280 px
  masqués. À 1440, 200 px. On ne voit plus l'explication, la liste des valeurs, « Garder tel quel » ni « Modifier le
  texte » (`captures/avertissement-1024.png`, `-1280.png`, `-1440.png`). À 1920, il tient.
- Correction : quand aucun côté ne tient, poser l'avertissement sous le bloc ou au-dessus, ou le borner à
  `limite − 448` (il couvre alors le code, qui ne se lit pas pendant ce choix). (`/impeccable adapt`)

**[P1] Volets à plusieurs groupes : Tab ferme le volet, les flèches restent dans un groupe**
- Où : `components/FloatingBar.tsx:442-451` (Tab ferme le volet et rend le focus au bouton) ;
  `FloatingVolet.tsx:29-38` et `CodeVolets.tsx:173-182` (les flèches ne parcourent qu'un groupe) ; `FloatingBar.tsx:424`
  (focus d'ouverture : `querySelector("[aria-checked='true'], [tabindex='0'], button")` prend le premier élément du DOM,
  pas l'élément coché).
- Preuve (`mesures-a11y.json` › clavier) :
  - Volet « aligner et répartir » d'une sélection de cinq équipements : − / +, « par nom / à l'écran » et « mettre en
    grille » ont `tabIndex 0`, mais le premier Tab ferme le volet. Alt+G fait le geste avec les colonnes par défaut. Les
    réglages n'existent pas au clavier, et la fiche n'en a pas d'équivalent.
  - Volet du langage avec une suggestion : le focus s'ouvre sur « appliquer », ↑ et ↓ n'y font rien, et les sept langages
    sont inatteignables. Contournement : la liste « langage » de la fiche.
- Impact : WCAG 2.1.1. `engine/README.md` (§ bloc de code) affirme que « la barre et la fiche portent tout ce que la
  souris fait » : c'est faux pour les colonnes et l'ordre de la grille.
- Correction : dans un volet, Tab et Maj+Tab font le tour de ses groupes (le volet garde le focus comme un menu), Échap
  ferme. Focus d'ouverture : d'abord `[aria-checked=true]`, puis le reste. (`/impeccable harden`)

## P2

**[P2] Textes dépendant de la teinte sous 4,5:1 en thème clair** (mesurés sur les éléments réels, `mesures-a11y.json`)
- Pastille du langage (`code.css:58`, `color-mix(type 70 %, ink)`, 11 px) : orange 4,11, vert 4,16, ambre 4,48. Les neuf
  autres teintes passent, et tout passe en sombre (6,5 à 9).
- Cote d'un écart égal (`guides.css:186`, `--guide-ink` blanc sur `--guide`, 11 px) : ciel 4,10, ambre 3,64, sarcelle
  3,74. Le trait, lui, tient 3:1 partout (le minimum est 3,21, ambre).
- Nature d'une valeur dans l'avertissement (`code.css:113`) : « en clair » et « type 7 » à 4,35.
- Correction : en clair, une encre par teinte (sombre sur ciel, ambre, sarcelle, citron), ou 55 % d'encre dans la pastille.
  Dans la nature, `--warning` mélangé à 80 % d'encre. Le test Node des teintes doit couvrir le texte (4,5), pas seulement
  le trait (3). (`/impeccable colorize`)

**[P2] Pouce de défilement du bloc sous 3:1** (`code.css:73`) : 2,27:1 en sombre, 1,82:1 en clair (WCAG 1.4.11). Il fait
5 unités de large dans une piste de 12, donc environ 3 px d'écran au zoom d'ouverture. Correction : encre à 45 % au repos et
65 % au survol, pouce de 6 à 8. (`/impeccable polish`)

**[P2] Les lignes de l'avertissement ne sont plus des boutons pour l'accessibilité** (`code-warn.tsx:263` : `<button
role="listitem">`). L'arbre d'accessibilité expose `listitem` « ligne 3, mot de passe, hash : aller à la valeur ». Le lecteur
d'écran n'annonce pas d'action. WCAG 4.1.2. Correction : `<ul>` / `<li>` autour de `<button>`. (`/impeccable harden`)

**[P2] Ouvrir la fiche d'un bloc de 2 000 lignes coûte une tâche longue** (`cards/CodeCard.tsx:47-51` : tout le code en
`span`, soit 8 002 éléments). Mesure (`mesures-perf.json`, trois passages) :

| | 15 lignes | 2 000 lignes |
|---|---|---|
| demo-dc | 30 à 56 ms | 183 à 217 ms (tâche longue de 162 à 197 ms) |
| jauge 500 | 47 à 76 ms | 225 à 267 ms (tâche longue de 202 à 243 ms) |

La barre contextuelle n'apparaît qu'après (même rendu). C'est le pire cas du contrat (20 000 caractères en lignes
courtes). Correction : fenêtrer les lignes de la fiche comme sur la toile (hauteur de ligne fixe, 19 px), ou les rendre par
tranches après la première image. (`/impeccable optimize`)

**[P2] Pastilles de couleur des repères trop petites** (`guides.css:246-247`, panneau Affichage) : 16 × 16, centres à
22 px. Sous les 24 px de WCAG 2.5.8 (cible ou espacement). Correction : bouton de 24 avec une pastille de 16 dedans.
(`/impeccable adapt`)

## P3

- **`<g role="button">` « copier » non focalisable** (`canvas/code.tsx:89`) : `tabIndex −1`, dans un nœud `role=group`
  focalisable. La fiche porte « copier » au clavier. Retirer le rôle (`aria-hidden`), ou le rendre focalisable.
- **Compteur de colonnes** (`FloatingVolet.tsx:63`) : `aria-label` sur un `span` générique, nom interdit en ARIA 1.2. La
  région live lit « 4 » seul. Mettre « 4 colonnes » en texte `sr-only`.
- **`alertdialog` sans `aria-modal` ni confinement du focus** (`code-warn.tsx:255`, `aria-modal` mesuré `null`) : après le
  dernier bouton, Tab part dans la toile, avertissement ouvert.
- **z-index hors de l'échelle** : `floating.css:13,58,88` (28, 29, 31) et `guides.css:7` (5), alors que `tokens.css:51`
  définit `--z-*`. Ajouter `--z-fbar`, `--z-fvolet`, `--z-ftip`.
- **Couleurs en dur dans le thème clair de la barre et de l'infobulle** (`floating.css:15,19,91,94,95`) : `#1a2330`,
  `#a3b2c4` et `#68798f` sont `--bg-elev-2`, `--info` et `--ink-4` du sombre recopiés en valeur. Passer par des jetons.

## Choix discutables, pas des défauts

- `will-change: transform` permanent sur la couche des repères (`guides.css:7`) : justifié par une mesure (repeint plein
  écran à 500). À garder.
- `z-index: 1000 !important` sur le nœud en écriture (`code.css:77`) : c'est la convention du dépôt pour passer au-dessus du
  z-index en ligne de React Flow (quatre fois dans `canvas.css`).
- Les jetons du code (`--code-*`, `--tk-*`) vivent dans `code.css`, pas dans `tokens.css` : cohérent, mais un second lieu.
- Dans un volet, les flèches déplacent le focus sans choisir. Le motif radio de l'APG choisit à la flèche ; ici, c'est un
  choix assumé et commenté.

## Ce qui tient (mesuré)

- **Repères pendant un glissé** (script du lot 8 relancé). Un pas de calcul coûte 0,16 ms avec 400 candidates. À la jauge,
  le glissé tient 42 à 44 images/s repères allumés, contre 33 éteints ; à demo-dc, 48 à 50, contre 55 éteints (environ
  −10 %). Aucune image au-dessus de 100 ms, et la toile n'est jamais reconstruite pendant le geste.
- **Défilement d'un bloc de 2 000 lignes à la molette** : 56 à 60 images/s, p95 de 17 ms, aucune tâche longue, aux deux
  tailles. Seules les lignes visibles sont dessinées.
- **La barre au panoramique** (jauge, même sélection, `mesures-pan.json`) : p50 de 44 à 47 ms barre montrée, contre 44 ms
  masquée. Son coût est dans le bruit ; c'est la sélection qui coûte, pas la barre.
- **Contrastes du sombre** : tout passe (code 5,3 à 15, cote des repères 6,4 à 14,6, focus 10,4:1). En clair, le focus
  est à 5,8:1, les numéros à 4,9, le pied à 5,4.
- **Mouvement réduit** : la barre passe en fondu de 120 ms, les volets à 100 ms. Plus de transition sur le défilement ni sur
  « mettre en grille », plus d'animation de l'avertissement.
- **Mise en page** : aucun défilement horizontal de 1024 à 1920. La barre (528 px pour un bloc de code) et le volet des
  polices restent dans la zone et ne couvrent pas le bloc (`captures/barre-volet-police-*.png`).
- **Écriture puis Ctrl+Entrée** : le focus va sur « Retirer », le choix le plus sûr.

## Ordre recommandé

1. [P1] `/impeccable harden` : le focus et Tab de l'avertissement après un collage, le clavier des volets à plusieurs
   groupes, les rôles de la liste de l'avertissement.
2. [P1] `/impeccable adapt` : la place de l'avertissement quand la fiche est ouverte ; les pastilles de couleur à 24 px.
3. [P2] `/impeccable colorize` : l'encre par teinte en clair (pastille du langage, cote des repères, nature).
4. [P2] `/impeccable optimize` : fenêtrer le code dans la fiche.
5. [P2, puis P3] `/impeccable polish` : le pouce de défilement (P2), puis les z-index en jetons, les couleurs du clair de la barre, `copier`,
   le compteur.
