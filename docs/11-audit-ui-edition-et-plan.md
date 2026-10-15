# 11 — Audit de l'interface d'édition et plan de rattrapage (2026-10-13)

**Ce document fait une chose : il dit ce qui manque à l'application `/` pour être un éditeur de diagramme robuste,
confronté à ce que font Visio, draw.io, Lucidchart et les autres, et il découpe le rattrapage en lots qu'un agent peut
coder seul.** Statut : **à valider par Orhan** (§5, douze décisions) avant qu'un lot ne parte. Un lot validé se lit sans
ce qui l'entoure : §6 est écrit pour l'agent qui le codera.

Les retours d'Orhan qui ont déclenché l'audit (2026-10-13) : pas de copier / coller des formes ; nœuds découverts trop
petits, placement ni intuitif ni simple ; points de connexion affichés par défaut qui gênent le positionnement et le
redimensionnement ; mise en forme par le panneau latéral peu moderne, il manque un accès rapide au-dessus de l'élément
édité, « comme dans un Visio ». Verdict général : « une bonne base de travail », mais « pas fluide, pas intuitive, pas
moderne ». Le but : « rendre l'outil robuste et non pas juste une jolie démonstration ».

## 0. Par où commencer (recommandation)

Trois vagues. La première ne touche aucun contrat et répond aux quatre points cités ; la seconde donne le « ressenti
d'un éditeur » ; la troisième consolide. Cinq décisions suffisent pour lancer la première.

- **Vague 1, les fondations visibles** : lot 5 (lisibilité, S) → lot 1 (poignées et ancres, M) → lot 2 (sélection
  mixte et clavier, L). À trancher avant : D1 à D5.
- **Vague 2, le ressenti d'un éditeur** : lot 3 (presse-papiers) → lot 4 (barre contextuelle) → lot 6 (arrangements).
  À trancher avant : D6, D10. En parallèle, hors chemin critique : la **mesure seule** du lot 13 à 500 équipements, pour
  savoir si React Flow tient la jauge avant d'y ajouter de l'interaction.
- **Vague 3, consolider** : 7, 8, 9, 10 ; 13, 12 (avant 11 si plusieurs personnes éditent déjà), 11 ; 14, 15.
- **Ne pas commencer par** la barre contextuelle ni l'export, même s'ils sont les plus visibles : sans sélection mixte
  la barre serait à refaire, et l'export ne corrige rien de ce qui a été cité.

## 1. Méthode et sources

- **Inventaire lu dans le code**, pas dans les docs : deux relectures indépendantes (commandes, clavier, souris,
  persistance ; géométrie, tailles, poignées, ancres, types de nœuds, rendu, performance), chaque constat avec son
  `fichier:ligne`. Les faits de §2 et §4 en viennent.
- **Quatre captures de l'état réel** sur `demo-dc` (32 équipements, 3 runs), Chromium 1440 × 900, sombre :
  `.impeccable/planche-audit/` (`1-ouverture`, `2-equipement-selectionne`, `3-cadrer-tout`, `4-note-selectionnee`) ;
  script rejouable `.impeccable/planche-audit/scripts/capture_audit.py` (à lancer depuis `backend/` avec `PYTHONPATH=.`).
- **Benchmark** de sept éditeurs et d'un outil réseau (§3, annexe §9.3) par un agent avec sources, orienté ergonomie
  d'édition, pas fonctions métier ; React Flow 12 lu sur ses docs et son dépôt.
- **Critiques Impeccable antérieures** (`.impeccable/critique/`) : application 22/40 le 2026-10-07, inspecteur 25/40,
  bulle 19/32, Journal 29/40. Leurs restes ouverts sont repris ici quand ils touchent l'édition.
- Aucun bundle réel, comme toujours : `demo-dc` et le générateur.

## 2. L'état actuel en une page

Ce qui existe, famille par famille, et la limite vue. Le détail (chaque commande, chaque raccourci) est dans les deux
inventaires consignés en fin de document (§9).

| Famille | Ce qui existe | Limite vue |
|---|---|---|
| Navigation | molette = zoom (0,05 à 6), glissé sur le fond = panoramique, Espace + glissé (défaut React Flow), cadrer tout, centrer sur la sélection, minimap, grille 20, aimant au coin haut gauche | aucun raccourci de zoom (Ctrl+0 / 1 / + / −), pas d'indicateur de zoom, pas de zoom sur la sélection, pas de bouton du milieu, pas d'aide-mémoire des raccourcis |
| Ouverture | zoom de lecture 0,67 sur « ce qui compte », sinon cadrer tout | à « cadrer tout » sur 32 équipements, les noms font ~6,5 px (`3-cadrer-tout.png`) |
| Sélection | clic ; Maj + clic ajoute ; Maj + glissé = rectangle (mode « touche ») qui **ajoute** ; Échap vide | **jamais mixte** : plusieurs équipements, ou **un seul** élément d'une autre sorte (annotation, connecteur, groupe, cluster, câble) ; le rectangle n'attrape que des équipements ; Ctrl + clic ne fait rien ; pas de Ctrl+A |
| Déplacement | équipements (un ou toute la sélection, épingles en lot), cadre de groupe (entraîne ses membres), annotations, bouts et courbure d'un connecteur ; flèches (20, 100 avec Maj) sur les équipements | flèches et alignement **n'agissent que sur les équipements** ; aucun guide d'alignement (seul l'aimant de grille) ; le placement automatique n'aimante pas à la grille |
| Carte d'équipement | 80 de haut, largeur commune par run (200 à 360, pas de 40), nom mono 15 px en capitales, icône 40, rail de teinte, pastilles ACTIF / PASSIF / DOWN et stack | taille non réglable (ni par l'utilisateur ni par réglage) ; la largeur réservée compte un rôle et un stack que la carte n'écrit plus (`model.ts:523` vs `Flow.tsx:120`) |
| Annotations | note, rectangle, ellipse, tableau, image ; 8 poignées, Maj garde le rapport sur les coins ; double-clic édite ; dupliquer (+20) ; verrou ; plan dessous / dessus ; ancrage libre, équipement, groupe ; ligne de rappel | poignées de **8 unités du plan, pas compensées par le zoom** (elles rapetissent en dézoomant) ; les poignées de milieu de côté **coïncident au pixel près** avec les ancres (`4-note-selectionnee.png`) ; une annotation attachée « dessous » se dessine **au-dessus** de sa carte (règle parent / enfant de React Flow) ; pas de rotation, texte brut seul |
| Connecteurs | deux bouts libres ou ancrés (auto, n, e, s, w), tracé droit / coudé / courbe, pointes, étiquette, verrou, plan ; création depuis une ancre, le menu, la barre | les quatre ancres se montrent **au survol de n'importe quel nœud et sur tout élément sélectionné**, en écriture ; pas de point de passage libre |
| Groupes | membres + style (forme, teinte, remplissage, bordure, coins, marge, étiquette en neuf positions) ; cadre glissable ; cadre calculé depuis les membres | suppression immédiate depuis le menu contextuel (Ctrl+Z existe), confirmation dans la fiche : deux règles |
| Inspecteur | une grammaire pour les huit fiches, champs « scrub », sections repliables, largeur réglable | tout se règle **là et seulement là** : aucune commande au-dessus de l'élément |
| Barre d'outils | annuler, rétablir, cadrer, centrer, insérer (note, rectangle, ellipse, connecteur, tableau, image), alignements dès deux équipements, compte et « vider » | rien de contextuel à l'élément sélectionné |
| Menu contextuel | fond, équipement, groupe, annotation, cellule, connecteur ; clavier | pas de copier / coller / dupliquer d'équipement ni de groupe ; « supprimer » sans confirmation ici, avec dans la fiche |
| Clavier | `/`, Ctrl+K, Échap en chaîne, Ctrl+Z / Y, flèches, Ctrl+V (image ou texte → annotation), Entrée / Tab dans les tableaux | **absents** : Ctrl+C, Ctrl+X, Ctrl+D, Ctrl+A, Suppr / Retour arrière (`deleteKeyCode={null}`), Alt + glissé, raccourcis de zoom, F2 |
| Annuler | épingles, couleurs, groupes, annotations, connecteurs, déplacements locaux ; 100 entrées ; une clé modifiée par un autre est sautée et dite | la vue (couches, masques) et le placement mémorisé ne s'annulent pas, par choix |
| Affichage | sept couches dans l'adresse (faisceaux, vitesses, ports, câbles down, voisins, épingles, annotations) | pas de couches de l'utilisateur (calques), pas de vues nommées |
| Styles | tout par l'inspecteur ; défauts par sorte dans le contrat | pas de copier / coller de style, pas de « dernier style utilisé », pas de « même taille » |
| Ordre de superposition | deux plans (dessous / dessus) pour annotations et connecteurs ; cadres rangés par aire | pas d'avancer / reculer, pas d'ordre entre deux annotations du même plan (l'ordre du tableau décide) |
| Sortie | export CSV du Journal | **aucun export du diagramme** (PNG, SVG, PDF), pas d'impression, pas de mode présentation |
| Multi-utilisateur | dernier écrivain gagne, journal, orphelines, annuler qui saute ce qu'un autre a changé | le document d'intention **n'est relu qu'à l'ouverture d'une run** ou dans la réponse d'une écriture : une page ouverte ne voit jamais ce qu'un autre fait ; pas de précondition de révision (docs/08 Q5) |
| Performance | tout est reconstruit à chaque version de la toile (sélection comprise) ; chaque connecteur se redessine à chaque mouvement de n'importe quel nœud | aucune mesure de la face React Flow au-delà de 60 équipements |
| Tactile | pincement par défaut de React Flow | rien d'autre, par décision (« la fiche suffit ») |

## 3. Ce que font les éditeurs du marché

Sept éditeurs (draw.io, Lucidchart, Visio, Miro, FigJam, Excalidraw, tldraw) et un outil réseau (netbox-topology-views),
lus sur leurs pages officielles ; chaque cellule a sa source dans l'annexe §9.3. Les raccourcis sont en forme Windows.

### 3.1 La matrice, condensée

| Capacité | draw.io | Lucidchart | Visio | Miro | FigJam | Excalidraw | tldraw | Living Diagram |
|---|---|---|---|---|---|---|---|---|
| Dupliquer | Ctrl+D +10/+10, Ctrl+glissé | Ctrl+D, Alt+glissé | Ctrl+D, Ctrl+glissé | Ctrl+D, Alt+glissé | Ctrl+D, Alt+glissé | Ctrl+D +10/+10, Alt+glissé | Ctrl+D +10 à droite, Alt+glissé | menu, annotation seule |
| Coller le style | Alt+C / V | menu, pinceau | Ctrl+Maj+C / V | Ctrl+Alt+C / V | Ctrl+Alt+C / V | Ctrl+Alt+C / V | Maj+Q | — |
| Barre contextuelle | non | dynamique + panneau | mini-barre + volet | au-dessus, seule | seule | non | texte seul | — |
| Poignées / Maj / centre | 8 / oui / Ctrl | ? / oui / — | 8 / oui / — | 4 / oui / Alt | 8 / oui / Alt | 8 / oui / Alt | 8 / oui / Alt | 8 / coins / — |
| Même taille | copier la taille | Match Size | Size & Position | — | — | — | — | — |
| Guides / espacement égal | bords, centres | + cotes | dynamic grid | oui | — | 8 px, écarts | Ctrl, 8 px, écarts | grille seule |
| Points de connexion | survol, 2 modes | survol, rouges | survol, 2 modes | sélection, bleus | côté, Ctrl libre | flottant, Alt fixe | lent = précis, Alt | **survol de tout, sélection** |
| Z / calques / verrou | 4 / oui / Ctrl+L | 4 / oui / 4 verrous | 4 / oui / protection | 4 / oui / Ctrl+Maj+L | 4 / non / Ctrl+Maj+L | 4 / non / Ctrl+Maj+L | 4 / non / Maj+L | 2 plans / non / annot. |
| Rectangle | englobé, Alt = touché | touché | englobé, option | touché (90 %) | touché | englobé, préférence | touché, Ctrl, Alt lasso | Maj + touché |
| Cadrer / sélection / 100 % | Ctrl+Maj+H / idem / Entrée | menu / — / Ctrl+0 | Ctrl+Maj+W | Alt+1 / Alt+2 / Ctrl+0 | Maj+1 / Maj+2 | Maj+1 / Maj+2 / Ctrl+0 | Maj+1 / Maj+2 / Maj+0 | bouton / bouton / — |
| Texte riche / étiquettes de lien | oui / 3 | oui / 1 | oui / 1 | oui / n | oui / 1 | non / 1 | oui / 1 | non / 1 |
| Arrangements | 9 algorithmes | grille, hiérarchie | 5, sur la sélection | sélection | Tidy up | non | non | — |
| Export sélection / transparent / SVG | oui / oui / oui | oui / oui / oui | oui / web / desktop | zone / ? / oui | oui / oui / non | oui / oui / oui | oui / oui / oui | — |
| Curseurs / suivre / commentaires / historique | par le stockage | oui × 4 | bordure / — / oui / oui | oui × 4 | oui × 4 | oui / oui / + / + | oui / oui / licence / non | — / — / — / journal |

### 3.2 Ce que tous partagent (présent chez cinq éditeurs sur sept au moins)

1. **Ctrl+C / V / X et Ctrl+D** partout ; le double se décale d'un pas de grille (+10 / +10 chez draw.io et Excalidraw,
   +10 à droite chez tldraw). **Clone par modificateur + glissé** partout, **Alt + glissé chez cinq** ; tldraw et Figma
   font répéter l'écart du clone par le Ctrl+D suivant.
2. **Copier / coller le style** partout, `Ctrl+Alt+C / V` chez Miro, Figma, Excalidraw.
3. **Barre contextuelle à la sélection** chez cinq : au-dessus ou à côté, **contenu typé par l'élément** (couleur,
   trait, texte, lien, cadenas, « … ») ; le panneau latéral ne garde que valeurs numériques et attributs. Miro la cache
   tant que Maj est tenue.
4. **8 poignées, Maj = proportions, Alt = depuis le centre** (draw.io prend Ctrl).
5. **Guides bords + centres** chez six, **espacement égal** chez cinq, **seuil 8 px écran** (Excalidraw, tldraw) ;
   grille optionnelle partout ; un modificateur suspend ou force l'aimant.
6. **Aligner (6) et répartir (2)** partout ; `Alt+A / D / W / S` et `Alt+H / V` chez Figma et tldraw.
7. **Deux modes de liaison**, flottant (le contour) et fixe (un point) ; les points sont visibles **au survol ou à la
   sélection pendant qu'on relie**, jamais en permanence ; draw.io distingue au drop le contour bleu (flottant) de la
   croix verte (fixe).
8. **Connecteur coudé à points de passage** partout ; évitement des formes chez cinq (en option chez draw.io).
9. **Quatre commandes d'ordre et un verrou** partout : `Ctrl+] / [` (Lucidchart, Figma, Excalidraw) ou
   `Ctrl+Maj+F / B` (draw.io, Visio) ; verrou `Ctrl+Maj+L` chez trois.
10. **Rectangle de sélection par le glissé nu**, Maj + clic, Ctrl+A, Échap partout ; le défaut se partage entre
    « englobé » (draw.io, Visio, Excalidraw) et « touché » (Lucidchart, Miro, FigJam, tldraw) ; un modificateur
    bascule chez draw.io (Alt) et tldraw (Ctrl).
11. **Ctrl + molette = zoom, Espace + glissé = vue** chez six ; cadrer tout partout, cadrer la sélection chez cinq
    (`Maj+1 / Maj+2` chez FigJam, Excalidraw, tldraw ; `Alt+1 / 2` chez Miro) ; **pourcentage cliquable et
    aide-mémoire** (`?` ou F1) partout.
12. **Double-clic ou Entrée pour éditer** ; une étiquette sur le lien partout ; texte riche chez six.
13. **Export « sélection seule »** partout, fond transparent chez six, SVG chez six, échelle 1 / 2 / 3× (Excalidraw,
    tldraw).
14. **Curseurs en direct et « suivre »** chez cinq ; la sélection d'autrui se montre par une bordure à sa couleur
    (Visio, tldraw).

### 3.3 Les patrons à copier, nommés

- **draw.io** : la liaison lisible au drop (contour = flottant, croix = fixe) et l'évitement des formes **par câble**,
  jamais imposé. Nos ancres `auto` / `n e s w` reprennent ce code visuel (lot 1).
- **Lucidchart** : cotes pendant le glissé (pointillé = bords, plein = centres, distance affichée) et « Match Size »
  direct : l'aide d'alignement la plus complète (lots 8 et 10).
- **tldraw** : l'aimant comme geste (Ctrl tenu aimante avec des lignes de mesure), Alt + glissé puis Ctrl+D répète
  l'écart, le rectangle touche, Ctrl exige l'englobement, Alt passe en lasso. Trois modificateurs, zéro réglage (lots 2, 3, 8).
- **Excalidraw** : l'export en un dialogue (sélection seule, fond, sombre, échelle 1 à 3) ; `Ctrl+flèche` crée le nœud
  voisin déjà relié (lot 11 ; le second n'a pas de sens ici, les équipements viennent de la donnée).
- **Miro** : la barre unique au-dessus de l'objet, Maj la cache ; « voir les changements récents » surligne ce que les
  autres ont modifié (lots 4 et 12).
- **Visio** : « Re-Layout » qui ne touche que la sélection ; une taille tapée pour plusieurs formes (lots 6 et 10).
- **FigJam** : « Tidy up » dans la barre de sélection dès trois objets (lot 6, arrangement en grille).
- **netbox-topology-views** : « dès qu'un équipement est glissé, sa position est enregistrée » et sort du moteur
  physique, par groupe de coordonnées côté serveur : exactement notre placement mémorisé (docs/09). Rien à copier,
  une confirmation.

### 3.4 Ce que React Flow 12 fournit, et ce qu'il ne fournit pas

`@xyflow/react` 12.12.0. Fourni : `NodeToolbar` (à taille d'écran, `nodeId` en liste pour une sélection ; sans liste,
**masquée dès que plusieurs nœuds sont sélectionnés**) et `EdgeToolbar` ; `NodeResizer` / `NodeResizeControl`
(`keepAspectRatio` à brancher sur Maj) ; `snapToGrid` ; `Handle` avec classes `connecting` / `valid`,
`connectionMode="loose"`, `connectionRadius`, `useConnection()` ; `zIndex` par nœud, `zIndexMode`, `parentId` et
`extent: 'parent'` ; `selectionMode` `full` / `partial`, `selectionOnDrag`, `panOnDrag=[1, 2]`, `panOnScroll`
(le réglage « façon Figma » du dépôt xyflow) ; `zoomTo`, `zoomIn / zoomOut` (× 1,2), `fitView({ nodes })`,
`fitBounds`, `useKeyPress` ; `toObject`, `getNodesBounds`, `getViewportForBounds` ; lasso (exemple gratuit).
**À coder nous-mêmes** (exemples **payants** « Pro » ou absents) : copier / coller, lignes d'aide (« Helper Lines »),
points de passage d'une arête, annuler / rétablir (le nôtre existe), arrangement automatique (Dagre / ELK sont des
exemples, pas le cœur), pourcentage de zoom, aide-mémoire, texte riche, routage évitant, export SVG vectoriel,
collaboration. L'exemple « Download Image » épingle `html-to-image` **1.11.11** (« the latest working version »).

## 4. Les lacunes, classées

### 4.1 Les quatre points d'Orhan, confrontés aux faits

1. **Copier / coller des formes.** Confirmé, et plus large : ni Ctrl+C, ni Ctrl+X, ni Ctrl+D, ni Alt + glissé ; « dupliquer »
   n'existe que pour une annotation, par le menu ou la fiche (+20 / +20) ; un connecteur, un groupe ne se dupliquent pas ;
   rien ne passe d'une infrastructure à l'autre. Ctrl+V existe mais ne colle qu'une image ou un texte **venus d'ailleurs**.
   Tous les éditeurs du benchmark ont Ctrl+C / V / D et Alt + glissé.
2. **Nœuds trop petits, placement pas intuitif.** Confirmé sur capture, avec une cause plus précise que la taille de la
   carte : à « cadrer tout », 32 équipements tiennent dans 1 440 × 900 au zoom 0,45 et le nom passe à 6,5 px. La carte
   (200 à 360 × 80) n'est pas petite ; c'est **le rapport carte / espacement** qui l'est : le placement force-dirigé
   (`IDEAL = 220`, `REACH = 660`) étale les grappes loin les unes des autres, et le nom (15 px) est petit **dans** sa carte
   (l'icône fait 40). Trois leviers, cumulables : le nom plus grand dans la même carte ; un niveau de détail qui garde le
   nom lisible en dézoomant ; des **arrangements** (en couches cœur → accès, en grille, radial) à la demande, qui sont
   le réflexe de tout éditeur (« Arrange › Layout » de draw.io, Lucidchart, Visio) et que l'application n'a pas du tout.
   Ce dernier point est, à mon avis, la vraie lacune : un ingénieur réseau pense son diagramme en couches, pas en ressorts.
3. **Points de connexion affichés par défaut.** Confirmé, et c'est un défaut pur en plus d'un choix : les quatre ancres
   se montrent au survol de **n'importe quel** nœud et sur tout élément sélectionné ; sur une annotation sélectionnée,
   l'ancre de milieu de côté se superpose exactement à la poignée de redimensionnement du même côté
   (`4-note-selectionnee.png`) : on ne sait pas ce qu'on va saisir. Les poignées (8 unités du plan, non compensées par le
   zoom) rapetissent en dézoomant alors que les ancres gardent leur taille d'écran. Le benchmark converge : les points de
   connexion n'apparaissent **que pendant qu'on tire un connecteur** (ou avec l'outil connecteur armé), jamais au repos.
4. **Mise en forme par le panneau, pas d'accès rapide.** Confirmé : aucune barre contextuelle ; chaque réglage demande
   d'aller dans le panneau de droite, de déplier une section, de trouver la rangée. Lucidchart, Miro, FigJam, Visio
   (mini-barre) posent une barre au-dessus de la sélection pour les réglages fréquents ; le panneau reste pour le reste.
   Au passage : la **bulle au survol** se montre aussi sur l'élément qu'on vient de sélectionner et recouvre ses poignées
   (`4-note-selectionnee.png`) ; aucun éditeur ne fait ça.

### 4.2 Les interactions que tout éditeur a, absentes ici

- **Sélection mixte** : impossible d'avoir un équipement et une annotation dans la même sélection, donc impossible de
  les déplacer, aligner, dupliquer ou supprimer ensemble. C'est la lacune la plus structurante : tout ce qui suit
  (presse-papiers, barre contextuelle, alignement, guides) suppose une sélection qui accepte toutes les sortes.
- **Rectangle de sélection** : seulement avec Maj ; le glissé nu déplace la vue. Visio, draw.io, Lucidchart, Figma,
  tldraw, Excalidraw font l'inverse (glissé nu = rectangle, Espace ou bouton du milieu = vue) ; Miro fait comme nous.
- **Suppr / Retour arrière** sur ce qui est sélectionné ; **Ctrl+A** ; **Ctrl+clic** pour ajouter ; **Alt + glissé** pour
  dupliquer.
- **Raccourcis de zoom** (Maj+1 tout, Maj+2 la sélection, Maj+0 100 %, Ctrl+= / Ctrl+−), **indicateur de zoom** avec
  menu ; **molette = défilement, Ctrl + molette = zoom** (draw.io, Lucidchart, Figma, Visio ; chez nous la molette zoome).
- **Guides d'alignement intelligents** (bords, centres, espacement égal) pendant un glissé ou un redimensionnement ;
  **aimant aux objets**, pas seulement à la grille.
- **Avancer / reculer / premier plan / arrière-plan** avec raccourcis ; un **ordre** entre éléments d'un même plan.
- **Copier / coller le style**, **dernier style utilisé** à l'insertion, **même largeur / hauteur**.
- **Redimensionner plusieurs éléments** à la fois ; redimensionner depuis le panneau (existe) et depuis les poignées à
  taille d'écran constante avec le curseur qui change.
- **Export** PNG / SVG / PDF, impression, **mode présentation** (interface masquée).
- **Aide-mémoire des raccourcis** (`?` ou Ctrl+/).
- **Édition en place** sur tout texte (existe : note, cellule, étiquette de connecteur ; manque : l'étiquette d'une forme
  et le nom d'un groupe sur la toile).
- **Flèches du clavier** sur tout ce qui est sélectionné (ici : équipements seulement).

### 4.3 Défauts purs trouvés en passant (à corriger dans le lot qui touche le fichier)

- Poignées d'annotation de 8 **unités du plan** (`annotation.tsx:272, 317`) : illisibles sous 0,5, énormes à 3.
- Ancre et poignée de milieu de côté au même point (`anchors.tsx:160-161`, `annotation.tsx:273-274`).
- Annotation attachée en plan « dessous » dessinée au-dessus de sa carte : React Flow donne à un enfant `z = parent + 1`
  (`Flow.tsx:199-201`) ; le réglage ment pour toute annotation attachée.
- `zoom-near` posé sur la toile (`Flow.tsx:556`) sans aucune règle CSS : mort.
- Largeur commune mesurée avec le rôle HA et le stack (`model.ts:523`) alors que la carte ne les écrit plus
  (`Flow.tsx:120`) : des cartes plus larges que nécessaire.
- « Supprimer le groupe » immédiat depuis le menu contextuel (`ContextMenu.tsx:92`), avec confirmation depuis la fiche.
- Bulle au survol visible sur l'élément sélectionné, par-dessus ses poignées (`Flow.tsx:84`, `bubble.ts`).
- Le centre d'un voisin inconnu (16 × 16) tombe hors grille quand son coin est aimanté ; le placement automatique
  n'aimante rien (`layout.ts:206`).
- Pas d'`extent` sur les enfants React Flow : une annotation attachée peut sortir de son parent sans que rien ne le dise
  (comportement acceptable, à documenter, pas à corriger).

### 4.4 Pourquoi ça ne fait « pas moderne »

Pas une question de palette : les jetons, la typographie et les pastilles tiennent. Ce qui manque est ce que la main
attend d'un éditeur et qui donne l'impression de « fluidité » :

- aucune réaction au survol avant le clic (pas de liseré, pas de curseur `grab` / `move` / `nwse-resize`) ;
- des poignées carrées qui changent de taille avec le zoom, des ancres partout ;
- rien n'apparaît **près** de ce qu'on manipule : ni barre contextuelle, ni badge de taille pendant un redimensionnement,
  ni badge de position pendant un glissé, ni distance aux voisins ;
- insertion au centre de la vue sans feedback (l'élément apparaît, point) ; aucun mouvement court qui explique ;
- la barre d'outils haute mélange des commandes de vue (cadrer) et d'insertion, et les alignements y arrivent par
  surprise quand deux équipements sont sélectionnés ;
- le panneau est dense (c'est voulu, c'est un inspecteur), mais il est la **seule** porte.

### 4.5 Robustesse : ce qui casserait à l'usage

- **Toile reconstruite à chaque version**, sélection comprise ; chaque connecteur abonné à **tous** les nœuds
  (`connector.tsx:102`) ; aucune mesure au-delà de 60 équipements pour la face React Flow. La jauge du projet est
  500 équipements / 1 500 câbles : à vérifier avant d'ajouter des couches d'interaction.
- **Pages concurrentes aveugles** : rien ne relit l'intention ; deux personnes sur la même infrastructure se voient au
  rechargement seulement. `expected_revision` (docs/08 Q5) toujours parqué.
- Aucune indication quand l'API ne répond plus pendant une édition (l'écriture échoue en silence relatif : un message
  d'état, pas d'état « hors ligne »).
- Les identifiants d'annotation naissent côté serveur (`a<révision>-<n>`) : un collage de dix éléments = dix créations
  dans une requête ; la réponse doit rendre les dix identifiants dans l'ordre (à vérifier dans le lot presse-papiers).

## 5. Les décisions à trancher (recommandation en premier)

| # | Question | Recommandation | Autre option |
|---|---|---|---|
| D1 | Glissé nu sur le fond | ~~rectangle de sélection~~ **révisée le 2026-10-14 par Orhan : glissé nu = panoramique, Maj + glissé = rectangle** (qui ajoute à la sélection ; « le glissé nu qui sélectionne, très très perturbant ») ; la vue se déplace aussi par Espace + glissé, même en partant d'un élément, et par le bouton du milieu | rectangle de sélection au glissé nu (Visio, draw.io, Lucidchart, Figma), la recommandation d'origine |
| D2 | Molette | ~~défilement, Ctrl + molette = zoom~~ **révisée le 2026-10-14 par Orhan : molette = zoom (comme avant)** ; Ctrl + molette zoome aussi, du même pas ; pincement = zoom | défilement (draw.io, Lucidchart, Figma, Visio), la recommandation d'origine |
| D3 | Ancres | **jamais au repos** ; visibles sur l'élément survolé **pendant** qu'on tire un bout de connecteur, et sur tous les éléments survolés quand l'**outil connecteur** est armé (`C`, bouton de la barre ; Échap le range) | flèches rapides au survol d'un élément sélectionné (AutoConnect de Visio / draw.io), en plus |
| D4 | Taille des cartes | **nom 15 → 18 px**, carte et grille inchangées ; **niveau de détail** sous 0,6 : nom agrandi, icône réduite, nom lisible jusqu'à 0,35 ; **arrangements** à la demande (lot 6) ; pas de taille par équipement | échelle d'affichage partagée (×1,25, ×1,5) comme intention de l'infrastructure, en plus |
| D5 | Suppr sur un équipement | **rien, et la page le dit** (« un équipement vient de la donnée : masquer ? » avec le bouton) ; Suppr vide les annotations, connecteurs et groupes de la sélection | Suppr = masquer |
| D6 | Copier un équipement | **tranchée le 2026-10-14 par Orhan, à la recommandation : copier un équipement = ses noms en texte ; coller des équipements ne crée rien** | rien |
| D7 | Ordre de superposition | **`order` entier additif** (Intent 1.6.0) dans chacun des deux plans gardés ; avancer / reculer / devant / derrière | fusionner les plans en un seul ordre |
| D8 | Export | **PNG d'abord** par capture du DOM (court), **SVG et PDF ensuite** par un rendu SVG pur de la scène (long) | SVG pur d'abord |
| D9 | Multi-utilisateur | **relecture de l'intention toutes les 15 s** quand l'onglet est visible (`ETag`, 304 sinon), fusion, « mis à jour par X » ; puis `expected_revision` | rien avant une vraie identité |
| D10 | Barre contextuelle | **tranchée le 2026-10-14 par Orhan sur le prototype : A**, les alignements quittent la barre haute pour la barre contextuelle (un bouton « aligner et répartir » à volet) | garder les alignements aux deux endroits |
| D11 | Texte riche des notes | **Markdown restreint** (gras, italique, listes, lien) dans le texte existant, rendu par la toile | rien (texte brut) |
| D12 | Style par défaut à l'insertion | **le dernier style utilisé par sorte**, préférence du navigateur | intention de l'infrastructure |

## 6. Les lots

Chaque lot se lit seul. Un agent qui le prend lit d'abord le lot 0, puis son lot, puis les fichiers que le lot nomme.
Taille : S (une demi-session), M (une session), L (une session longue ou deux). Les priorités : P0 = les quatre points
d'Orhan et ce qu'ils supposent, P1 = ce que tout éditeur a, P2 = finition et robustesse.

### Lot 0 — Règles communes à tous les lots (à lire en premier)

- **Lire** : `CLAUDE.md` § Règles de travail et § Conventions ; `docs/10-intentions-etendues.md` (le modèle des
  intentions, ses règles I0 à I6, G, A, C) ; `engine/README.md` § L'application et § Règles ; `backend/README.md`
  § L'application ; ce document, §2 à §5. Les deux inventaires de §9 disent où est chaque chose.
- **Annoncer avant de coder** : le lot est validé ici, mais l'agent écrit, avant la première ligne, un plan court
  (fichiers touchés, décisions non triviales, ce qu'il ne fera pas) ; il le laisse en tête de son rapport final.
- **Pur d'abord** : toute règle nouvelle (géométrie, sélection, guides, presse-papiers, ordre) vit dans un module `.ts`
  sans DOM ni React, dans `engine/src/canvas/` (partagé) ou `engine/src/app/state/` / `app/canvas/*.ts` (propre à
  l'application), testé sous Node dans `backend/tests/js/app.test.js` (ou `viewer.test.js` pour `canvas/`). Puis le
  branchement React, puis **un parcours Chromium** dans `backend/tests/test_app.py` (pilote `backend/tests/browser.py`,
  serveur par `tests.test_view._serve`, aides `_click`, `_press`, `_shift_rectangle`, `_settled`…). Un test vérifié par
  mutation vaut mieux qu'un test qui passe du premier coup.
- **Interdits** : style en ligne (la CSP n'en admet aucun ; les valeurs libres passent par des attributs de présentation
  SVG ou des variables CSS posées par le CSSOM) ; HTML écrit depuis une donnée (`dangerouslySetInnerHTML` est interdit
  par un test) ; minuterie (`setTimeout`, `requestAnimationFrame`) dans un module du moteur, la page la fournit ; chaîne
  française en dur (`strings.mjs` refuse ; tout texte passe par les catalogues `engine/src/i18n/locales/{fr,en}/*.json`,
  avec sa clé dans les deux langues, test de parité) ; nouvelle dépendance npm ou Python sans décision écrite dans le
  lot ; toute modification de `/view`, `ld render` et `viewer.js` hors correctif d'un bug (gelés) ; toute modification
  du snapshot, du diff, de B1.
- **Contrat `Intent`** : additif seulement (version mineure), `upgraded()` relit les mineures antérieures, schéma
  régénéré (`cd contracts && uv run ld-contracts schema --out`), `CONTRAT.md` régénéré (`uv run ld-contracts docs --out`),
  fixtures, tests `contracts/tests/intent/`, store (`backend/tests/test_intent*.py`), API, CLI `ld intent`.
  **Ce que le contrat de sortie refuse, l'entrée ne le laisse pas passer** : une borne se vérifie des deux côtés.
- **Toile** : positions entières ; une écriture d'intention part par les hôtes (`IntentHost.apply`, `writers.ts`), jamais
  par un appel direct ; tout ce qui s'écrit passe dans l'historique (`history.ts`, `undo.ts`) en **une entrée par geste** ;
  une sélection, une couche, un masque vivent dans l'adresse (`address.ts`), jamais une coordonnée ; rien ne s'écrit sans
  nom (`useEditable()`), et la vue Contrôle reste en lecture seule.
- **Commandes** : `cd engine && npm ci && npm run build && npm run check` (types stricts, bundle à jour, chaînes) ;
  `cd backend && uv run pytest` (suite complète **une fois par lot**, ~10 min ; un test ciblé pendant le travail :
  `uv run pytest tests/test_app.py -k nom`) ; `cd contracts && uv run pytest` si le contrat bouge ; `ruff check`.
  **Reconstruire (`npm run build`) juste avant la suite complète** : `app.js` est versionné, un bundle en retard fait
  échouer le test de dérive.
- **Captures** : une par retouche visuelle, pas de variantes sauf demande ; 1440 × 900 sombre, et 1280 clair pour ce qui
  touche la mise en page ; script modèle `.impeccable/planche-audit/scripts/capture_audit.py` ; les captures du lot vont
  dans `.impeccable/planche-<lot>/` et sont nommées dans le rapport.
- **Livraison** : tests verts (dire lesquels, avec les nombres), captures, puis la documentation en **une passe à la
  fin** : `engine/README.md` § L'application (ce qui change pour l'utilisateur et où est le code), ce document (la
  section du lot : « fait », écarts, parqués), `CLAUDE.md` (une entrée datée dans le journal, courte, qui renvoie ici),
  et `docs/10` si le contrat bouge. Un commit conventionnel par lot (`feat(app): …`). Pas de revue indépendante pour
  un lot visuel ; une revue indépendante consignée dans `docs/revues/` pour un lot qui touche le contrat ou l'API
  (lots 3, 9, 12).
- **Accessibilité** : focus visible, `aria-label` sur toute icône, Échap ferme, tout ce que la souris fait a un chemin
  clavier ou est dit « la fiche suffit » dans `engine/README.md`.
- **Mesure** : un lot qui touche le rendu ou la toile donne ses temps sur `demo-dc` et sur une série du générateur à
  500 équipements (`cd contracts && uv run ld-contracts generate --seed 7 --devices 500 --runs 1 --out /tmp/s500`).

### Lot 1 — Poignées, ancres, survol : l'élément qu'on manipule (P0, M)

**En une phrase** : ce qu'on saisit se voit, se distingue, et rien ne vient s'y superposer.

**Pourquoi** : §4.1 points 3 et 4, §4.3. Les ancres sont partout, les poignées coïncident avec elles et changent de
taille avec le zoom, la bulle recouvre l'élément sélectionné.

**Spécification**

- **Ancres** (décision D3) : aucune au repos, ni au survol, ni sur la sélection. Elles se dessinent (a) sur l'élément
  survolé pendant qu'un bout de connecteur est tiré (brouillon ou connecteur existant ; existe : `.anchor-dots.target`),
  (b) sur tout élément survolé quand l'**outil connecteur** est armé. Pendant le glissé d'un bout, l'élément survolé
  montre **deux cibles distinctes** (draw.io) : son contour en accent = bout `auto` (flottant, suit l'autre bout), ses
  quatre ancres = bout fixe (`n e s w`) ; l'ancre à portée (14 px) grossit, comme aujourd'hui. L'outil : le bouton « insérer un connecteur » de
  la barre devient un outil à bascule (`aria-pressed`), raccourci `C` ; armé, le curseur est `crosshair`, tirer depuis une
  ancre ou depuis l'intérieur d'un élément (bout `auto`) crée le connecteur, un clic sur le fond pose un bout libre puis
  le second clic finit ; Échap ou un second appui le range ; il se range seul après une création (pas de création en
  série, sauf Maj maintenue). Les entrées « tirer un connecteur » du menu contextuel et de la fiche restent.
- **Poignées de redimensionnement** : taille d'écran constante (1 / zoom, comme les ancres, `anchors.tsx:134-136`) ;
  quatre coins en carrés de 8 px, quatre milieux de côté en **barres** de 14 × 5 px posées sur le bord (plus de disque
  au même endroit) ; curseurs `nwse-resize`, `nesw-resize`, `ns-resize`, `ew-resize` ; Maj garde le rapport (coins, existe),
  **Alt redimensionne depuis le centre** ; minimum 20, maximum 4 000 (existe). Pendant le geste : une **pastille de
  taille** « L × H » en unités du plan, collée au coin saisi, à taille d'écran ; pendant un glissé d'annotation : une
  pastille « X, Y ». Les pastilles réutilisent `canvas/pill.ts` (`tone-muted`).
- **Survol** : un liseré d'accent à 50 % (1 px écran) sur l'annotation, le connecteur, le cadre survolés quand on peut
  écrire ; curseur `move` sur une annotation non verrouillée, `grab` sur le fond quand le glissé nu déplace la vue (lot 2
  peut le changer), `default` en Contrôle.
- **Bulle** : jamais sur l'élément sélectionné, jamais pendant un geste (glissé, redimensionnement, rectangle, brouillon
  de connecteur), jamais quand un éditeur en place est ouvert. Elle revient quand la sélection change ou se vide.
- **Défauts purs du même fichier** : annotation attachée en plan « dessous » : le choix « dessous » **disparaît de la
  fiche et du menu quand l'annotation est attachée** et la fiche dit « une annotation attachée se dessine au-dessus de
  son ancre » ; `zoom-near` retiré ; la largeur commune se mesure sans rôle ni stack (`model.ts:523`) ; le menu contextuel
  d'un groupe confirme la suppression comme la fiche, ou les deux passent en suppression directe avec « Ctrl+Z pour
  annuler » (choisir la seconde : cohérent avec les annotations).

**Code** : `engine/src/app/canvas/anchors.tsx` (visibilité, outil), `annotation.tsx` (poignées, pastilles, curseurs),
`Flow.tsx` (bulle, outil armé, brouillon à deux clics), `app/styles/canvas.css`, `components/Toolbar.tsx` (outil),
`state/store.tsx` (état `tool`), `engine/src/canvas/model.ts:523`. Module pur nouveau : `app/canvas/handles.ts` (géométrie
des poignées et des pastilles à partir d'une boîte et d'un zoom, Alt depuis le centre, Maj rapport), testé sous Node.

**Tests** : Node sur `handles.ts` (boîte résultante pour chaque poignée, Maj, Alt, bornes) ; Chromium : aucune ancre au
repos ni à la sélection, ancres visibles sur l'élément survolé pendant un glissé de bout, outil `C` armé puis rangé par
Échap, création à deux clics, poignée de milieu saisie sans créer de connecteur, bulle absente sur l'élément sélectionné,
taille de poignée identique à l'écran à 0,4 et à 2.

**Acceptation** : captures `1-note-selectionnee` (poignées seules), `2-outil-connecteur` (ancres sur le survol),
`3-redimensionnement` (pastille L × H), à 1440 × 900 ; aucun constat du détecteur Impeccable sur les fichiers touchés.

**Fait le 2026-10-13** : ancres jamais au repos ni sur la sélection (D3) ; elles se dessinent sur la cible d'un bout
qu'on tire (outil, ou bout d'un connecteur existant) et sous le pointeur quand l'outil connecteur est armé, avec deux
cibles comme draw.io (contour en accent plein = `auto`, quatre ancres = fixe, celle à portée grossit), dans une couche
unique par-dessus la toile (`app/canvas/drawing.tsx`, état à part : le pointeur ne redessine pas la toile). L'outil :
bouton à bascule de la barre (`aria-pressed`, libellé « outil connecteur »), touche C hors d'un champ, croix ; tirer
depuis une ancre ou l'intérieur d'un élément, ou deux clics ; Échap ou un second appui le range, une création aussi
sauf Maj tenue ; état `tool` dans le store (rangé en Contrôle et au changement de run). Décision pure dans
`app/canvas/tool.ts`, marques et règle de la bulle dans `app/canvas/hover.ts`, poignées dans `app/canvas/handles.ts`
(coins 8 px, barres 14 × 5 sur les côtés, taille d'écran constante, Maj rapport, Alt centre, bornes 20 / 4 000, pastilles
« L × H » et « X, Y » par `PillSvg`, ton `muted`), tous testés sous Node (quatre tests, sept mutations vérifiées) ; la
bulle sort de `Flow.tsx` dans `app/canvas/tips.tsx` (jamais sur la sélection, jamais pendant un geste, l'outil armé ni
une édition en place). Liseré d'accent à 50 % au survol (annotation, cadre, connecteur) quand on peut écrire, curseur
`move` sur une annotation non verrouillée, `default` en Contrôle. Défauts purs : « dessous » retiré de la fiche et du
menu d'une annotation attachée (la fiche le dit) ; `zoom-near` retiré de l'application (`/view`, gelée, garde le sien) ;
suppression d'un groupe directe depuis la fiche comme depuis le menu (« groupe supprimé (nom) · Ctrl+Z pour annuler ») ;
la largeur commune était déjà corrigée par le lot 5. Captures et script : `.impeccable/planche-lot-1/`.
**Écarts** : (1) les ancres ne sont plus des éléments de chaque nœud (`Anchors` par carte, disque, annotation, cadre :
retiré) mais une seule couche qui dessine les marques de la cible, et l'outil prend les appuis de la toile à la capture
(pointer events annulés : ni glissé, ni panoramique, ni rectangle de React Flow) ; plus de DOM par nœud, et un seul
chemin pour « tirer depuis une ancre » et « tirer depuis l'intérieur ». (2) Le bouton s'appelle « outil connecteur »
(« insérer un connecteur » ne disait plus ce qu'il fait) ; « insérer un connecteur ici » du menu du fond reste. (3) Un clic
sans glisser sur un élément pose aussi le départ (attaché, `auto`), comme sur le fond. (4) La bulle se tait aussi tant
que l'outil est armé (ses marques occupent le survol). (5) Pendant un redimensionnement par le haut, la gauche ou le
centre, la boîte suit désormais en direct (elle grandissait vers la droite jusqu'à la relâche) ; l'opacité de
l'annotation ne s'applique plus aux poignées. (6) Une barre de côté n'est pas dessinée sur un côté de moins de 40 px à
l'écran (elle se confondrait avec les coins). (7) L'annotation glissée ou redimensionnée passe devant le temps du geste,
pour que sa pastille ne passe pas sous une carte. **Parqués** : la confirmation de suppression d'une annotation et d'un
connecteur dans leur fiche (le lot ne visait que les groupes) ; Échap pendant un redimensionnement vide la sélection, la
boîte d'avant revient et rien ne s'écrit (pas d'annulation propre au geste) ; les
barres de frontière d'un tableau (`table.tsx`, 6 unités du plan) ne sont pas encore à taille d'écran.

### Lot 2 — Sélection mixte et clavier de base (P0, L)

**En une phrase** : une sélection accepte tout ce qui se dessine, et le clavier fait ce que tout éditeur fait.

**Pourquoi** : §4.2 premier point. Sans sélection mixte, ni presse-papiers (lot 3), ni barre contextuelle (lot 4), ni
guides (lot 7) ne tiennent.

**Spécification**

- **Modèle** : `Selection = { hosts: string[], annotations: string[], connectors: string[], groups: string[] }`, triée,
  dans `toile.ts` ; un **élément principal** (le dernier ajouté) décide de la fiche quand la sélection est d'une seule
  sorte ; une sélection de plusieurs sortes ouvre `MultiCard`, qui compte par sorte. Clusters, câbles et faisceaux restent
  seuls (ils ne s'éditent pas). L'adresse garde une seule clé de sélection quand elle est simple ; une sélection multiple
  reste transitoire (existant).
- **Souris** (décisions D1, D2) : clic = sélectionne ; **Maj + clic ou Ctrl + clic** = ajoute ou retire ; **glissé nu sur
  le fond = rectangle** en mode « touche » (`SelectionMode.Partial`, existant) qui **remplace** la sélection ; **Maj +
  rectangle ajoute** ; **Ctrl tenu pendant le rectangle = englobés seulement** (tldraw ; option, si le temps le permet) ; la vue se déplace par Espace + glissé, le bouton du milieu, ou le glissé nu **en Contrôle** (rien
  ne s'y sélectionne au rectangle). Molette = défilement, Maj + molette = horizontal, Ctrl + molette = zoom, pincement =
  zoom (`panOnScroll`, `zoomOnScroll={false}`, `zoomActivationKeyCode`). Les éléments verrouillés sont pris par le clic,
  pas par le rectangle.
- **Glissé** : une sélection mixte glisse d'un bloc (React Flow déplace les nœuds `selected` ; `onNodeDragStop` traite
  déjà annotations et équipements, `Flow.tsx:482-510`) ; les bouts **libres** des connecteurs sélectionnés suivent ; un
  cadre sélectionné entraîne ses membres (existe) ; **une seule entrée d'historique** pour le geste (épingles + patchs).
- **Clavier** : **Ctrl+A** sélectionne tout ce qui est visible (équipements, annotations, connecteurs ; pas les cadres) ;
  **Suppr / Retour arrière** supprime annotations, connecteurs et groupes de la sélection en une requête et une entrée
  d'historique, dit « n supprimés, Ctrl+Z pour annuler », et pour les équipements (D5) dit « un équipement vient de la
  donnée » avec « masquer » ; **flèches** déplacent toute la sélection (annotations et bouts libres compris), 20 ou 100
  avec Maj, une rafale = une entrée (existe pour les équipements) ; **Échap** garde sa chaîne ; **F2** ou Entrée sur une
  note, une étiquette de forme, un nom de groupe ouvre l'édition en place ; **Tab** cycle sur les éléments sélectionnables
  dans l'ordre de lecture (haut-gauche → bas-droite) et Maj+Tab à rebours, le focus suit la sélection.
- **Alignement et répartition** : sur toute sélection d'au moins deux boîtes (cartes et annotations ; les connecteurs
  sont exclus, les cadres aussi) : gauche, centre, droite, haut, milieu, bas, répartir H / V, par les **boîtes** et non
  les centres (`align.ts` étendu avec une boîte par élément ; les cartes gardent la règle actuelle quand la sélection n'a
  que des cartes, pour ne pas changer les captures existantes). Équipements → épingles, annotations → patchs, une entrée.
- **Édition en place** : l'étiquette d'une forme et le nom d'un groupe (sur le cadre) s'éditent au double-clic comme une
  note.

**Code** : `app/canvas/toile.ts` (modèle de sélection, `select`, `selectMany`, `toggle`, `nudge` étendu), `Flow.tsx`
(`syncSelection` réécrit, `onSelectionChange`, rectangle, props de pan / zoom, Tab), `state/store.tsx` (Suppr, Ctrl+A),
`components/Shell.tsx` (clavier), `engine/src/canvas/align.ts` (boîtes), `state/history.ts` (entrée composée),
`cards/MultiCard.tsx` (comptes par sorte), `state/describe.ts` (zone live). Module pur nouveau : `app/state/selection.ts`
(ajout, retrait, sortes, principal, ordre de Tab), testé sous Node.

**Tests** : Node (`selection.ts`, `align.ts` sur des boîtes, historique composé) ; Chromium : rectangle nu qui prend une
carte et une note, Ctrl+clic, glissé du bloc (épingle + patch, une entrée Ctrl+Z), Suppr (note et connecteur partis,
équipement resté avec le message), Ctrl+A, flèches sur une note, molette = défilement, Ctrl + molette = zoom, Tab.

**Acceptation** : captures `1-selection-mixte`, `2-alignement-mixte` ; le parcours Chromium existant
(`test_the_application_end_to_end_in_a_browser`) adapté sans perte d'assertion.

**Fait le 2026-10-14** : la sélection accepte les quatre sortes (`app/state/selection.ts`, pur : listes triées, élément
principal = le dernier entré, rectangle en mode « touche » ou « englobe », ordre de lecture et Tab en boucle,
opérations de Suppr), tenue par la toile (`toile.state.multi`, `primary`, `selectItems`, `allItems`, `cycle`) et par le
store (`picked`, `hosts` gardé pour les lecteurs d'avant) ; câbles, faisceaux, clusters et agrégats restent seuls ;
l'adresse garde une seule clé quand la sélection est simple. **D1 et D2 révisées par Orhan pendant le lot (écarts à la
spécification ci-dessus, voulus)** : le glissé nu sur le fond déplace la vue, en Diagramme comme en Contrôle
(`panOnDrag` [0, 1]) ; Maj + glissé = rectangle en mode « touche » qui ajoute à la sélection (Ctrl tenu à la relâche =
englobés seulement, option faite ; en Contrôle, des équipements seulement) ; un clic sans glisser sur le fond vide la
sélection ; Maj, Ctrl ou Cmd + clic ajoute ou retire ; Espace + glissé déplace la vue même en partant d'une carte,
d'une annotation, d'un cadre ou d'un tracé (la toile pose `space-pan` : ses éléments laissent passer l'appui jusqu'au
fond, rien ne se glisse ; avant, Espace + glissé sur une carte la déplaçait) ; le bouton du milieu aussi, partout. La
molette zoome (comme avant) ; Ctrl + molette zoome du même pas autour du pointeur (`app/canvas/wheel.ts` : React Flow
prenait le cran pour un pincement, ×4), un pincement garde son pas. D5 : Suppr sur un
équipement n'écrit rien et la ligne d'état propose « masquer » ; annotations, connecteurs et groupes partent en une
requête. Un bloc mixte glisse d'un coup (épingles, annotations, bouts libres des connecteurs, membres d'un cadre
sélectionné) en une écriture et une entrée d'annulation (« déplacement de n éléments ») ; les flèches de même, une
rafale = une écriture ; Ctrl+A ; F2 / Entrée et double-clic : texte d'une note, étiquette d'une forme, nom d'un groupe
sur son cadre (`app/canvas/inline.tsx`) ; Tab / Maj+Tab dans l'ordre de lecture, le focus suit. Alignement par les
boîtes (`canvas/align.ts`, `alignBoxes` : gauche, centre, droite, haut, milieu, bas, répartir à écarts égaux) dès
qu'une annotation est dans la sélection ; des cartes seules gardent leurs quatre alignements par les centres (captures
existantes inchangées). `MultiCard` compte par sorte (« 4 éléments · 2 équipements, 1 annotation, 1 connecteur »), liste
annotations, connecteurs et groupes, porte une corbeille ; la zone live le dit. Tests : Node (sélection, boîtes,
historique composé et reliage, molette, réducteur), Chromium `tests/test_app_selection.py` (tout le parcours demandé,
plus le bouton du milieu sur le fond et sur une carte), parcours existants inchangés ; 18 mutations attrapées (8 sous
Node, 10 dans Chromium), deux équivalentes (la garde des extrêmes d'une répartition ; `nodesDraggable` coupé sous Espace,
que `space-pan` rend redondant) ; captures `.impeccable/planche-lot-2/`.
**Défauts purs corrigés en passant** : (1) le SVG d'un pixel d'un connecteur était un élément en ligne posé sur la ligne
de base du texte : tracé, poignées et zone de clic dessinés environ 13 unités plus bas que la toile ne les calcule
(`flow.css`, `display: block` sur connecteurs, annotations, cadres ; un test le garde) ; (2) une demande d'édition en
place (menu, F2) se rejouait à chaque nouvelle version de l'annotation ou du cadre : elle ne vaut plus qu'une fois ;
(3) le bouton du milieu (retour d'Orhan pendant le lot) : React Flow le prend mais n'annulait pas l'action du
navigateur sur son appui (défilement automatique de Windows et de Firefox, collage de la sélection primaire sous
Linux), qui prenait la main sur le panoramique ; l'appui est annulé sur `mousedown` (pas sur `pointerdown`, qui
couperait les événements souris de d3-zoom) et `auxclick`, sans arrêter la propagation. Cause probable, non reproduite
dans le Chromium sans écran de Linux (sans défilement automatique) ; le test vérifie que l'appui est annulé et que la
vue bouge depuis le fond comme depuis une carte. (4) Un « annuler » qui recrée une note et le connecteur qui y tenait
laissait le connecteur orphelin (ancienne identité) : une seconde requête le relie (`relinkOps`), les valeurs gardées
dans la pile suivent (`remap`). **Écarts** : (1) la fiche : un élément = sa fiche, plusieurs = `MultiCard`, même d'une
seule sorte (la fiche du principal laisserait croire qu'on édite tout ; la fiche multiple des équipements existait) ;
(2) Tab et Ctrl+A prennent équipements, annotations et connecteurs, pas les cadres de groupe (Tab compte aussi les
verrouillés, Ctrl+A non) ; (3) Ctrl + clic sur le fond vide la sélection (React Flow) ; (4) un connecteur sélectionné
est désormais glissable par React Flow avec un bloc (seul, il se glisse toujours par son tracé) ; (5) dans un bloc, une
note n'a plus ses poignées de taille ; (6) panneau ouvert, la barre d'outils se centre entre la recherche et le panneau
et passe à la ligne (huit alignements à 1280 px la faisaient glisser dessous) ; le lot 4 la refait. **Mesures**
(Chromium sans écran, de l'action à la deuxième image ; trois passages) : demo-dc, Maj + rectangle 72 à 110 ms, Ctrl+A
23 ms (33 éléments), flèche 74 à 83 ms ; 500 équipements (`generate --seed 7`), rectangle 634 à 785 ms, Ctrl+A 189 à
202 ms (520 éléments), flèche 1,23 à 1,31 s : la toile reconstruite à chaque version (un simple `repaint` y coûte 0,6 à
1,1 s, en grande partie hors du script, non comparé à la version commitée), dette du lot 13, non corrigée ici.
**Parqués** : redimensionner plusieurs éléments, une ancre d'alignement autre que l'ensemble (« aligner sur le
principal »), la fiche d'une sélection mixte n'offre ni teinte ni style pour les annotations, Ctrl + clic sur le fond
qui garderait la sélection.

### Lot 3 — Presse-papiers : copier, couper, coller, dupliquer (P0, M)

**En une phrase** : Ctrl+C / X / V / D et Alt + glissé sur tout ce qui s'édite, dans la page et d'une page à l'autre.

**Dépend de** : lot 2 (sélection mixte). **Pourquoi** : §4.1 point 1.

**Spécification**

- **Charge utile** (module pur `app/state/clipboard.ts`) : `{ "living-diagram": 1, infrastructure, annotations: [...],
  connectors: [...], hosts: [...] }`. Annotations : contenu, style, boîte, ancrage **conservé** si l'ancre fait partie du
  collage ou existe dans l'infrastructure de destination (équipement du même nom, groupe du même id), sinon **libre** à la
  même place du plan ; images : l'empreinte `sha256` de l'image. Connecteurs : gardés si leurs deux bouts sont dans la
  charge ou existent à destination ; un bout absent devient un point libre à sa dernière position. Équipements (D6) : leurs
  noms, en texte seulement.
- **Écriture** : `navigator.clipboard.write` avec deux représentations : `web application/x-living-diagram+json`
  (Chromium) et `text/plain` (la charge JSON entière pour les annotations, ou les noms d'équipements un par ligne quand il
  n'y a qu'eux). Lecture : le format propre d'abord, sinon un `text/plain` qui commence par `{"living-diagram"` est une
  charge ; sinon le comportement actuel (image → annotation image, texte → note). Un presse-papiers interne (mémoire de
  l'onglet) double le système quand l'API refuse (contexte non sécurisé, permission).
- **Coller** : si le pointeur est sur la toile au moment du Ctrl+V, la boîte englobante du collage se pose **au
  pointeur** (coin haut gauche aimanté à la grille si l'aimant est actif) ; sinon à la place d'origine décalée de +20 / +20,
  et chaque collage répété décale encore. D'une autre infrastructure : même règle, les images sont **renvoyées** au
  magasin de destination (`GET /api/intent/assets/<sha>` puis `POST`) avant la création ; une image introuvable donne une
  annotation image avec le texte alternatif seul et un message.
- **Dupliquer** : Ctrl+D = copier + coller à +20 / +20 (un pas de notre grille ; +10 / +10 chez draw.io et Excalidraw,
  dont la grille fait 10) sans toucher au presse-papiers système ; après un Alt + glissé, le Ctrl+D suivant **répète
  l'écart** du clone (tldraw, Figma) tant que la sélection est la copie. **Alt + glissé** : un
  fantôme suit le pointeur (copie locale, opacité 0,6), la copie se crée au relâchement à la position du fantôme ; sans
  Alt au départ, glissé normal. Couper : Ctrl+X = copier puis supprimer (lot 2).
- **Serveur** : un collage de `n` éléments = **une** requête `POST /api/intent/patches` avec `n` opérations
  `annotation_create` / `connector_create` (l'exemple « Copy and Paste » de React Flow est payant : rien à en reprendre) ; vérifier que la réponse rend les identifiants **dans l'ordre des
  opérations** (sinon l'ajouter, additif, dans `backend/src/ld_backend/api.py` et `schemas.py`) ; les connecteurs qui
  visent une annotation collée sont créés **après** elle, dans la même requête, avec son identifiant rendu, ou dans une
  seconde requête si l'API ne permet pas de référencer une création de la même requête (choisir la seconde, plus simple,
  si le premier n'existe pas). **Une entrée d'historique** pour le collage entier.
- **Menu contextuel et barre contextuelle** : copier, couper, coller, dupliquer, avec leurs raccourcis écrits.
- **Hors périmètre** : coller des équipements, coller dans `/view`, coller un groupe (ses membres sont de la donnée ;
  coller un groupe recrée un groupe **vide de style identique** ? non : rien, dit dans le message).

**Code** : `app/state/clipboard.ts` (pur : sérialiser, désérialiser, remapper, décaler, texte des équipements),
`state/store.tsx` (commandes), `components/Shell.tsx` (`copy`, `cut`, `paste` natifs, Ctrl+D), `Flow.tsx` (Alt + glissé,
fantôme), `api/writers.ts` (créations en lot), `state/history.ts`, `components/ContextMenu.tsx`, `state/context.ts`.

**Tests** : Node sur `clipboard.ts` (aller-retour, ancre conservée / libérée, connecteur orphelin, décalage cumulé,
texte des équipements, charge étrangère ignorée) ; backend : identifiants d'un lot de créations dans l'ordre ; Chromium :
Ctrl+C / Ctrl+V d'une note et d'un connecteur attaché (deux annotations, un connecteur, une entrée Ctrl+Z), collage au
pointeur, Ctrl+D, Alt + glissé, collage entre deux infrastructures avec une image.

**Acceptation** : capture `1-collage` (original, copie décalée, barre contextuelle avec « coller »).

**Fait le 2026-10-14** : Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D, Alt + glissé et, dans le menu contextuel, « copier »,
« couper », « coller ici », « dupliquer » avec leur raccourci écrit (`aria-keyshortcuts`). **La charge**
(`app/state/clipboard.ts`, pur) : `{ "living-diagram": 1, infrastructure, annotations, connectors, hosts }`, chaque
annotation avec sa boîte dans le plan (`frame`), chaque connecteur avec la place de ses deux bouts ; relue avec une
garde de forme (version, types, identités uniques, empreinte `sha256` d'une image avant qu'elle parte dans une adresse,
2 M caractères au plus), le reste est validé par le serveur. Écrite
au clavier par les événements natifs (`copy` / `cut` : `application/x-living-diagram+json` et `text/plain`), depuis le
menu par l'API asynchrone (`web application/x-living-diagram+json` et `text/plain`, sinon le texte seul) ; la mémoire de
l'onglet double toujours le système. Relue : le format propre, puis un texte qui commence par `{"living-diagram"`, sinon
le comportement d'avant (image → annotation image, texte → note). D6 : un équipement copié donne son nom en texte, un
par ligne ; collé, rien ne se crée et la page le dit. **Coller** : au pointeur (coin haut gauche du collage, aimanté
avec l'aimant), sinon +20 / +20 cumulés ; ancrage gardé si l'ancre existe (équipement du même nom ; groupe du même id
**dans la même infrastructure seulement**), sinon libre à sa place ; bouts des connecteurs remappés sur les annotations
collées, gardés sur ce qui existe, sinon libres à leur dernière place. **API inchangée** : la réponse reste le document,
la règle des identités (`a<révision>-<n>`, n dans l'ordre des créations de chaque sorte) est désormais figée par un test
(`tests/test_api_intent.py`, `test_a_batch_of_creations_gets_its_ids_in_the_order_of_its_operations`) ; les connecteurs
qui visent une annotation collée partent dans une seconde requête (le serveur ne vérifie pas qu'une annotation visée
existe : deviner `a<révision + 1>` avant la réponse aurait relié en silence à une autre en cas d'écriture concurrente) ;
**une seule entrée d'annulation** pour les deux (`undo.chain`, `history.absorb`, « ajout de n éléments »), et le
rétablir relie de nouveau par `relinkOps` (lot 2). D'une autre infrastructure : chaque image est lue là-bas
(`fetchAssetFile`) et renvoyée au magasin d'ici (`uploadAsset`, même empreinte) avant la création, 50 images au plus
par collage (au-delà, rien n'est collé et la page le dit). **Dupliquer** :
Ctrl+D = copier + coller à +20 / +20 sans toucher au presse-papiers, puis répète l'écart du dernier clone tant que la
sélection est la copie. **Alt + glissé** (`app/canvas/clone.tsx`) : l'appui (bouton principal, Alt) sur une annotation,
un connecteur, une carte ou un cadre est pris à la capture avant React Flow ; le fantôme (les annotations dessinées par le
même `Body` que la toile, les connecteurs par `Stroke`) suit le pointeur à 60 % dans une couche à part, la copie se crée
à la relâche, l'original reste ; un Alt + clic sans mouvement sélectionne ; poignées, champs, Espace + glissé et le
bouton du milieu gardent leur geste (D1 / D2 révisées). **Couper** = copier puis Suppr du lot 2 (« n éléments coupés ·
Ctrl+Z pour annuler » ; un équipement reste et « masquer » est proposé). En Contrôle et sans nom, rien ne se colle ni ne
se duplique, la ligne d'état le dit ; copier reste possible. Tests : 5 tests Node (charge et relecture, plan de collage,
duplication et fantôme, entrée d'annulation composée, menu) et le test du menu existant adapté ; Chromium
`tests/test_app_clipboard.py`, deux parcours (le presse-papiers du système de Chromium sans écran, par les événements
natifs ; l'API asynchrone par `Browser.grantPermissions` ; le repli de l'onglet exercé par un texte collé égal à la
dernière copie) ; backend : identités d'un lot de créations. **23 mutations attrapées** (12 sous Node, 11 dans
Chromium), aucune survivante. Captures `.impeccable/planche-lot-3/` : `1-collage.png` (l'original estompé, sa copie
collée au pointeur et sélectionnée avec son connecteur, le menu contextuel ouvert sur elle, raccourcis écrits en chasse
fixe à droite), `2-alt-glisse.png` (le fantôme à 60 % pendant le glissé, l'original sélectionné à sa place). **Mesures**
(Chromium sans écran, de la touche Ctrl+V à la copie sélectionnée et peinte, deux requêtes ; trois passages) : 20
annotations et 10 connecteurs, demo-dc 176 à 223 ms ; 500 équipements (`generate --seed 7`) 1,47 à 1,57 s, l'essentiel
étant la toile reconstruite à chaque version (dette du lot 13, non corrigée ici). **Écarts, décisions prises seul** :
(1) une image introuvable devient une **note** qui porte son texte de remplacement (une annotation image sans fichier est
refusée par le contrat, `unknown_asset`) ; (2) un id de groupe ou d'annotation ne vaut que dans sa propre infrastructure
(la spécification disait « groupe du même id ») ; (3) un connecteur dont aucun bout ne bougerait est libéré et décalé ;
(4) les copies ne sont jamais verrouillées ; (5) ~~couper supprime aussi les groupes sélectionnés~~ **révisé après
revue (M4)** : couper supprime exactement ce qui a été copié, un groupe reste et la page le dit ; (6) la barre contextuelle n'existant pas encore, la capture
montre le menu contextuel ; « dupliquer » du menu d'une annotation passe désormais par le presse-papiers (copie
sélectionnée, connecteurs compris), celui de la fiche garde son chemin d'avant ; (7) un collage de plus de 500 éléments
est refusé et le dit (une requête de l'API en porte 500 au plus). **Parqués** : coller des équipements, coller un
groupe, coller dans `/view` (hors périmètre) ; une image du même magasin retirée entre la copie et le collage fait
refuser tout le collage (422 `unknown_asset`, dit tel quel) ; Alt + glissé et un gestionnaire de fenêtres Linux qui
prend Alt + glissé pour lui (rien à faire côté page) ; le fantôme d'un tableau n'en dessine que le cadre.

**Corrections après la revue indépendante (2026-10-14)** (`docs/revues/2026-10-14-lot-3-presse-papiers.md`, 0 critique,
1 haut, 5 moyens, 9 bas ; suivi point par point dans le rapport). **H1** : un collage appartient à sa toile.
L'écrivain et le placeur d'une run écrivent dans l'infrastructure de cette run, figée (`makeHosts(infrastructure)` ; le
jeton reste vivant) ; les images d'un collage se lisent et se renvoient avec cette session ; après chaque attente
(lecture, renvoi d'image, chaque requête), un collage dont la toile a changé s'arrête sans rien écrire de plus et le dit
(« collage abandonné », ou « interrompu » si une partie était déjà écrite) ; une écriture qui revient après un changement
d'infrastructure n'entre plus dans la pile d'annulation de l'autre (`StackHolder.owner`). **M1 + M2, sans changer l'API
ni le contrat** : les identités se lisent sur la **réponse** de la première requête (`AppWriter.outcomeOf`, jamais
`model.intent`) et y sont vérifiées (`verifyCreated` : présentes, de la sorte et à la place envoyées) ; si une manque, la
seconde requête ne part pas ; si elle ne part pas ou est refusée, la première est défaite par son entrée (`undo.revert` :
opérations inverses, sans entrée, l'entrée retirée de la pile), un seul message « collage refusé : … » ; si défaire échoue
aussi, la page le dit et l'entrée reste (Ctrl+Z défait ce qui reste) ; « n éléments collés » ne se dit qu'après tout. Le
rétablir lit aussi ses identités sur la réponse. L'engagement des identités est écrit (OpenAPI : route et trois opérations
de création, `test_openapi.py` ; `backend/README.md` ; `docs/10` §6). **M3** : un appui sur la toile hors d'un champ
efface la sélection de texte de la page ; un texte sélectionné dans une fiche garde la copie native. **M4** : couper =
copier puis supprimer les annotations et connecteurs de la charge prise (au clic, pas la sélection au retour de
l'écriture) ; groupes et équipements restent, dits. **M5** : une annotation attachée collée d'ailleurs tombe sous le
pointeur, son écart écrit depuis l'ancre d'ici (`Target.anchorAt` : centre de la carte, coin du cadre ;
`app/canvas/clip-toile.ts`). **Bas** : deux Ctrl+D rapprochés posent deux copies à deux pas (B1) ; Alt + glissé n'est
pas pris sans nom, et un cadre seul dit « un groupe ne se copie pas » (B3) ; borne en octets UTF-8 alignée sur le défaut
de `LD_MAX_INTENT_BYTES` (1 Mio, `bytesOf`, « collage trop gros ») (B4) ; ancrages libérés dits (B5) ; le menu « coller »
distingue refus de lecture et échec de collage (B6) ; `Flow.tsx` 622 → 431 lignes, le calcul des nœuds et arêtes sorti
dans `app/canvas/flow-build.ts` (B7) ; tests des trous : rétablir, seconde requête refusée, changement d'infrastructure
en vol, ancre d'ici, rangs au-delà de neuf (B8) ; la mémoire de l'onglet vit dans les commandes (une par Store), et
`toile.pointer` reste posé comme `frames`, `ends`, `boxes` (la toile tient l'état mutable de la vue) (B9). **Assumé (B2)** :
des noms d'équipements copiés n'ont pas de format propre ; collés dans un autre onglet, ils arrivent comme un texte brut
venu d'ailleurs et deviennent une note (comportement d'avant) ; dans le même onglet, la mémoire de l'onglet les reconnaît
et rien ne se crée. Tests : `tests/test_app_clipboard_guards.py` (nouveau, trois parcours Chromium : H1 rejoué, M1
rejoué, M3 / M4 / B1 / B3), rétablir ajouté au parcours principal, un test Node de plus (ancre d'ici, identités
vérifiées, octets), rangs au-delà de neuf et règle dans l'OpenAPI côté backend. **35 mutations attrapées** (16 sous
Node, 19 dans Chromium ; 12 nouvelles), aucune survivante ; l'écrivain figé seul est équivalent dans le parcours H1 (la
garde de la toile s'arrête avant tout envoi), attrapé avec elle.

### Lot 4 — La barre contextuelle flottante (P0, L)

**En une phrase** : les réglages fréquents de l'élément sélectionné sont à un clic, au-dessus de lui.

**Dépend de** : lot 1 (poignées), lot 2 (sélection mixte). **Pourquoi** : §4.1 point 4 ; décision D10.

**Méthode imposée (Orhan, 2026-10-14)** : prototype d'abord. Un premier agent, avec les skills
`frontend-design:frontend-design` et `impeccable:impeccable`, produit dans `.impeccable/prototype-lot-4/` une page HTML
autonome (données factices, jetons recopiés, aucun fichier de `engine/` ni de `backend/`) qu'Orhan juge lui-même ; le
code ne s'écrit qu'après son accord, le prototype validé faisant foi pour le rendu (`docs/11-prompt-agent-lot.md`
§ 2 bis). Même règle pour le lot 14 et tout nouveau panneau.

**Prototype validé le 2026-10-14** (`.impeccable/prototype-lot-4/`, fait foi pour le rendu, revue de design appliquée :
bouton unique « aligner et répartir » à volet, barre ancrée au milieu d'un connecteur et qui évite les annotations,
ergot vers l'ancre, fond relevé, rectangle aux coins de 10 et non capsule). **Réponses d'Orhan** : (1) D10 = A ;
(2) **la barre et ses volets ne masquent jamais l'objet** (volet du côté opposé à la sélection, de l'autre côté s'il
manque la place) ; (3) le coin des boutons à volet est gardé ; (4) une barre aussi sur un équipement seul ; (5) sans
nom (lecture seule) : aucune barre ; (6) barre loin d'une grosse sélection : à juger à l'usage
(`docs/a-juger-a-l-usage.md`). **Ajout validé** : un réglage « barre contextuelle affichée / masquée », préférence du
navigateur (`ld-prefs`, jamais dans l'adresse), affichée par défaut, basculée par **Ctrl + .** (à vérifier sous Chrome et
Firefox) et par une case du panneau Affichage, la ligne d'état dit la bascule ; masquée, Alt+T la rappelle pour la
sélection en cours sans changer la préférence ; Maj tenue la cache toujours le temps d'un Maj + clic.

**Spécification**

- **Où** : au-dessus de la boîte englobante de la sélection, centrée, 8 px au-dessus, à taille d'écran ; passe dessous
  quand le haut manque ; jamais sous la barre du haut, la barre d'outils ni le panneau (zone visible = insets de la
  toile, comme la bulle) ; suit l'élément pendant un déplacement de la vue ; **cachée pendant un geste** (glissé,
  redimensionnement, rectangle, brouillon) et pendant une édition en place, revient 120 ms après ; **Maj tenue la cache** (Miro) le temps d'un Maj + clic. Base technique :
  `NodeToolbar` de React Flow (`nodeId` accepte une liste, **obligatoire** pour une sélection multiple : sans liste la
  barre disparaît dès que deux nœuds sont sélectionnés ; `isVisible` piloté par nous), ou un portail en coordonnées
  d'écran si `NodeToolbar` ne couvre pas les connecteurs (ce sont des nœuds : il les couvre).
- **Forme** : une capsule de 36 px, fond `--panel` opaque, bordure `--line`, ombre `--shadow-2`, boutons d'icône 28 px
  (Lucide 16), séparateurs fins, infobulle « libellé · raccourci » ; les choix (teinte, taille, pointes) s'ouvrent en
  **volet** sous le bouton (le même `HuePicker` que l'inspecteur, grille 6 × 2) ; un volet se ferme à Échap ou au clic
  dehors ; le bouton actif est relevé (`--ctl-line`), jamais cyan (règle de l'inspecteur).
- **Contenu par sorte** (de gauche à droite ; `|` = séparateur) :
  - note : teinte | taille du texte (S / M / L = 12 / 13 / 15) · gras · alignement H (cycle) | plan · verrou | dupliquer ·
    supprimer ;
  - forme : teinte · remplissage (0 / 25 / 50 / 100 %) · bordure (plein / tirets / points / aucune) · coins | étiquette
    (édite en place) | plan · verrou | dupliquer · supprimer ;
  - tableau : ligne + · colonne + · fusionner (si plage) · en-tête | teinte | plan | supprimer ;
  - image : remplacer · opacité | plan · verrou | supprimer ;
  - connecteur : pointes (cycle des quatre) · tracé (droit / coudé / courbe) | teinte · épaisseur (1 / 2 / 3 / 4) · style |
    inverser · verrou | supprimer ;
  - groupe : teinte · forme (rectangle / ellipse) · position de l'étiquette (volet 3 × 3) | sélectionner les membres ·
    appliquer la teinte aux membres | supprimer ;
  - équipement : teinte | épingler / désépingler · grouper ou ajouter à un groupe | note attachée · connecteur | masquer ·
    isoler ;
  - sélection multiple : aligner (6) · répartir (2) (**retirés de la barre haute**, D10) | grouper · teinte | dupliquer ·
    supprimer · verrou.
  Tout ce que la barre fait, l'inspecteur le fait aussi (même état, mêmes hôtes) ; la barre n'a rien que l'inspecteur n'a pas.
- **Clavier** : depuis la toile, **Alt+T** (ou F10 ?) donne le focus à la barre, ← → entre les boutons, Échap rend le
  focus à la toile ; chaque bouton a son `aria-label` ; la barre est un `role="toolbar"`.
- **Pas de barre** : en Contrôle, sans nom (lecture seule : la barre ne montre que centrer et, pour un équipement,
  masquer / isoler ; ou rien : choisir rien, la fiche dit déjà pourquoi), sur un cluster, un câble, un faisceau.

**Code** : `components/FloatingBar.tsx` (nouveau) et `cards/style.tsx` (réutiliser `HuePicker`, `StrokeRow`),
`app/styles/app.css` (`.fbar`), `Flow.tsx` (`NodeToolbar`, visibilité pendant les gestes), `components/Toolbar.tsx`
(alignements retirés), `state/store.tsx` (commandes déjà existantes : réutiliser), catalogues `shell` / `panel`.
Module pur nouveau : `app/state/floating.ts` (quels boutons pour quelle sélection, et quelle position pour quelle boîte
dans quelle zone), testé sous Node.

**Tests** : Node (`floating.ts` : boutons par sorte et par droit, position qui passe dessous) ; Chromium : barre
présente sur une note, absente pendant son glissé, teinte posée par la barre (document écrit), alignement depuis la barre
sur une sélection mixte, Alt+T puis ← → puis Échap, absente en Contrôle.

**Acceptation** : captures `1-note`, `2-connecteur`, `3-multi` (barre au-dessus, volet ouvert sur l'une) ; critique
Impeccable à deux agents sur ces captures en fin de lot, les P1 corrigés dans le lot.

**Fait le 2026-10-14** : la barre contextuelle, transposée du prototype validé (rectangle aux coins de 10, fond relevé,
ergot, coin des boutons à volet, valeur sur le bouton, volet du côté opposé à la sélection, mouvement de 150 ms à
l'apparition seulement). **Base technique : une couche à soi en coordonnées d'écran, pas `NodeToolbar`** : il faut la
zone visible (sous la recherche et la barre d'outils, au-dessus de la bande, à gauche du panneau, lue dans le DOM),
passer dessous, éviter les annotations, s'ancrer au milieu d'un connecteur et poser des volets qui ne masquent jamais
l'objet ; `NodeToolbar` ne fait que « au-dessus de la boîte des nœuds donnés », par un style en ligne. La couche est un
enfant de `Flow` (fournisseur React Flow), s'abonne à la vue (`transform`, seulement quand elle se montre) et à la toile
(`version`) ; la toile ne la connaît pas (mesuré : sa version ne bouge pas pendant un panoramique). Les gestes passent
par `app/canvas/gate.ts` (glissé, rectangle, et les raisons `hold` existantes) ; retour 120 ms après, minuterie de la
page. **Code** : `app/state/floating.ts` (pur : cible, boutons par sorte et par droit, raccourcis, `placeBar`,
`placeVolet`, `anchorOf`, `multiHues`), `components/FloatingBar.tsx` (place, clavier, exécution par les commandes du
store), `FloatingVolet.tsx`, `floating-faces.tsx` (glyphes du prototype), `styles/floating.css`,
`state/floating-commands.ts` (`pinHere`, `lockItems`, `colorItems`) ; `HueGrid` et `PositionGrid` extraites de
`ui/inspector.tsx` (le volet de la barre et celui de la fiche sont la même grille) ; `Toolbar.tsx` sans alignements
(D10 = A) ; préférence `fbar` (`prefs.ts`), Ctrl + . et la case « barre contextuelle » du panneau Affichage, la ligne
d'état dit la bascule (« … · Ctrl+. pour la rétablir, Alt+T pour la rappeler ici ») ; masquée, Alt+T la rappelle pour la
sélection en cours. **Défaut corrigé** : la fiche multiple et la fiche d'un connecteur nomment les bouts par leur nom
lisible (équipement, texte ou sorte de l'annotation, nom du groupe, « point libre » ; `state/describe.ts`,
`connectorText`), sans identifiant ni coordonnée, la ligne ne déborde plus. **Écarts, décisions prises seul** : (1) les
volets ont un troisième recours, à côté de la barre sur sa rangée, quand ni le côté opposé ni l'autre côté de la
sélection ne tiennent (vu sur capture : le volet recouvrait la barre) ; (2) un connecteur sélectionné : son tracé
(échantillonné dans le DOM) et son étiquette comptent, la barre se pose à gauche ou à droite d'un tracé vertical, ergot
latéral (critique A, P1 : la règle d'Orhan « jamais masquer l'objet » est venue après le prototype, qui centrait la
barre sur le tracé) ; les étiquettes des autres connecteurs sont des obstacles ; (3) la teinte d'une sélection
multiple colore tout ce qui en a une (équipements, annotations, connecteurs, groupes), en une écriture, comme le
prototype ; la fiche multiple fait de même (parité) ; « défaut » seulement pour des équipements seuls ; (4) le bouton
teinte dit sa valeur (« teinte : ambre ») ; (5) parité barre ⊆ fiche : « épingler à sa place » ajouté au menu « … »
de la fiche d'un équipement, le verrou d'un coup à la fiche multiple ; (6) les raccourcis non codés du prototype
(Ctrl+B, Ctrl+G, Ctrl+Maj+L) ne sont pas affichés ; ceux qui existent le sont (Ctrl+D, Suppr, Entrée) ; (7) pas de barre
sur un voisin inconnu ni sur un fantôme du diff ; l'outil connecteur armé la cache ; (8) une sélection de cartes seules
garde la règle des centres pour « centrer » et « milieu » (captures du lot 2 inchangées), le reste par les boîtes ;
(9) Échap avec un volet ouvert le ferme d'abord, d'où que vienne le focus, avant de vider la sélection ; (10) le tableau
n'a pas « fusionner » dans la barre (la plage vit dans la toile ; le menu contextuel le garde), comme le prototype.
**Ctrl + .** : reçu par la page dans Chromium sans écran (parcours) ; Firefox non vérifié ; Alt+D (aligner à droite)
est aussi « barre d'adresse » de Chrome et Firefox sous Linux et Windows : à vérifier à l'usage, comme Alt+T et le menu
Outils de Firefox. **Mesures** (Chromium sans écran, trois passages) : du clic à la barre peinte, demo-dc 90 à 112 ms,
500 équipements (`generate --seed 7`) 713 à 826 ms, l'essentiel étant la toile reconstruite à la sélection (dette du lot
13) ; un panoramique de 1,6 s barre affichée, demo-dc 17,8 à 18,0 ms par image en moyenne (max 33), 500 équipements
17,4 à 19,0 ms (max 33 à 100), contre 16,7 ms barre masquée ; la version de la toile ne bouge pas pendant un
panoramique (la barre ne la reconstruit pas). **Tests** : trois tests Node (`floating.ts`), le parcours Chromium
`tests/test_app_floating.py` (tout ce que l'acceptation demande, plus la teinte d'une sélection mixte, Alt + D, le volet
d'une case d'Affichage) ; parcours existants adaptés sans perte d'assertion (`test_app.py`, `test_app_selection.py` :
alignements par la barre) ; 23 mutations Node attrapées sur 23, 10 Chromium sur 11, la onzième équivalente (« barre en Contrôle » :
`editable` l'exclut déjà). **Critique Impeccable à deux agents** : A 27/40 (P1 corrigés : teinte d'une sélection
mixte, barre sur un tracé), B : détecteur sans constat, contrastes AA ; corrigés aussi : légende « posé → survolé »
dans tous les volets, filet sur l'état allumé (P2 de B), `aria-haspopup="menu"` pour le volet des groupes, tabulation
itinérante tenue par React, contour du focus dans le menu des groupes, Alt+T écrit (ligne d'état,
`aria-keyshortcuts`). **Parqués** : « tirer un connecteur » crée un connecteur à bout libre (comme le menu contextuel
et la fiche ; armer l'outil depuis l'équipement serait un changement du lot 1) ; l'infobulle d'une case de la seconde
rangée se pose contre le volet, loin de la case ; les flèches dans un volet déplacent le focus sans cocher (rôles
`radio` hérités de l'inspecteur) ; le `title` natif des pastilles double la légende ; Maj tenue cache la barre aussi
pendant Maj + flèches ; trois carrés proches dans la barre d'une forme (remplissage, bordure, coins) ; la barre loin
d'une grosse sélection (`docs/a-juger-a-l-usage.md`). Captures : `.impeccable/planche-lot-4/` (1 à 6), script
`scripts/capture_lot4.py`.

**Retours d'Orhan à l'usage, 2026-10-14 (lot 4 bis, prototype d'abord)** : « Cette barre n'est pas là pour décorer et
n'est pas un gadget, elle est là pour permettre à l'utilisateur de formater son texte rapidement et efficacement, et plus
globalement d'éditer rapidement et facilement des objets. Il est donc crucial que les options de personnalisation soient
plus flexibles et complètes. » Ses cinq points : (1) taille du texte limitée à des choix fixes, il veut choisir
réellement la taille comme dans tous les outils du marché ; (2) pas de souligné ; (3) pas d'italique ; (4) alignement et
position du texte bien trop limités ; (5) le style des volets (sous-menus) n'est pas cohérent avec la barre. Constat :
le contrat admet déjà toute taille entière de 8 à 64 (`text_size`), la limite (1) est dans l'interface ; (2) et (3)
demandent des champs additifs au contrat `Intent` (mineure à coordonner avec le lot 9, qui prévoit aussi 1.6.0) ; (4)
est à préciser sur le prototype. Méthode : un prototype (skills frontend-design et impeccable,
`.impeccable/prototype-lot-4-bis/`) jugé par Orhan, puis l'implémentation après le lot 8 (mêmes fichiers).

**Prototype du lot 4 bis jugé le 2026-10-14** (revue de design indépendante 30/40, P1 corrigés) : « vraiment beaucoup
plus propre, c'est bien mieux ». Une correction : **retirer normal / demi-gras / gras du volet « police »**, redondant
avec le bouton gras de la barre. Les cinq questions du README (italique / souligné / barré sur la boîte puis par
caractère au lot 15, douze teintes pour le texte, « modifier l'étiquette » retiré de la barre d'une forme, pas de
justifié, étiquette de connecteur en pourcentage avec trois repères) : recommandations retenues sauf avis contraire
d'Orhan avant l'implémentation.

### Lot 5 — Lisibilité des cartes : le nom, le niveau de détail (P0, S)

**En une phrase** : un nom d'équipement se lit à tout zoom où on travaille.

**Pourquoi** : §4.1 point 2 ; décision D4 (sans l'échelle partagée, parquée).

**Spécification**

- **Nom** : `LABEL_PX` 15 → **18**, la carte reste 80 de haut ; `LABEL_MAX` 22 inchangé ; la largeur commune suit
  (0,62 em × 18) ; vérifier que la largeur maximale 360 tient 22 caractères, sinon `MAX_W` 400 (multiple de 40).
  `/view` lit `card.ts` aussi : elle suit, capture à joindre (correctif admis sur une page gelée : partagé).
- **Niveau de détail** (`Flow.tsx` : classes `zoom-far` < 0,6 ; ajouter `zoom-tiny` < 0,4) : en `zoom-far`, l'icône
  passe à 28 et le nom à **24 px** sur une seule ligne, centré sur la carte, rail conservé, pastilles cachées sauf
  `tone-danger` (existe) ; en `zoom-tiny`, l'icône disparaît, le nom seul à 30 px ; les étiquettes de port, de faisceau,
  de vitesse restent cachées. Les tailles sont posées par le CSS (`.zoom-far .node-label { font-size }`), la géométrie
  du plan ne change pas (la carte garde sa boîte : le placement et les câbles ne bougent pas) ; le nom peut être
  raccourci plus court en `zoom-tiny` (14 caractères) par une seconde ligne de texte déjà rendue et affichée par classe.
- **Ouverture** : `READ_ZOOM` 0,67 → mesurer avec le nouveau nom ; si 18 px à 0,55 donne ≥ 10 px, baisser à 0,55 pour
  cadrer plus d'équipements à l'ouverture.
- **Voisins inconnus** : disque 8 → 10, nom 10,5 → 12 px ; centre sur la grille (coin aimanté : décaler la boîte à 20 × 20).

**Code** : `engine/src/canvas/card.ts`, `app/styles/canvas.css`, `Flow.tsx:55`, `app/canvas/opening.ts`, `nodes.tsx`
(seconde ligne de texte pour le niveau de détail). Pas de contrat.

**Tests** : Node (`card.ts` : largeur commune avec 18 px, 22 caractères dans `MAX_W`) ; Chromium sur la série à 60
équipements : taille rendue du nom ≥ 10 px à l'ouverture et à « cadrer tout » (`test_the_application_opens_a_large_infrastructure_where_names_read` étendu) ; captures `/view` inchangées hors le nom.

**Acceptation** : captures `1-ouverture`, `2-cadrer-tout` sur `demo-dc` et sur 60 équipements ; les noms se lisent
sur `2-cadrer-tout` (≥ 10 px mesurés).

**Fait le 2026-10-13** : nom 15 → 18 dans la même carte (80 de haut) ; `MAX_W` 360 tient 22 caractères à 18 (334),
gardé. Deux niveaux de détail dans la même boîte, calculés par `card.ts` (`plan().far`, `plan().tiny`, purs, testés sous
Node) et montrés par classe (`canvas.css`, `nodes.tsx`) : `zoom-far` sous 0,6 (icône 28, nom 24 centré à droite du rail),
`zoom-tiny` sous 0,4, posée avec `zoom-far` (le nom seul à 30, 14 caractères au plus) ; placement et câbles inchangés.
`READ_ZOOM` 0,67 → **0,55** : à 0,55 la carte est déjà « de loin », le nom rendu fait 24 × 0,55 = 13,2 px (mesuré) ; le
plus petit nom rendu au-dessus de 0,55 est à 0,6 (10,8 px). Voisins inconnus : disque 8 → 10, nom 10,5 → 12, nœud React
Flow de 40 × 40 autour du disque (centre sur la grille quand le coin s'aimante ; câbles, accrochage et connecteurs lisent
toujours le disque). Défaut du lot 1 corrigé : la largeur commune se mesure sur les noms seuls (`model.ts`). `/view` suit
`card.ts` (nom à 18 dans `viewer.css`, disque de 10), rien d'autre. Mesures (taille rendue du nom, 1440 × 900) :

| Cas | Avant | Après |
|---|---|---|
| `demo-dc`, ouverture | 0,67 → 10,1 px | 0,55 → 13,2 px (de loin) |
| `demo-dc`, « cadrer tout » | 0,446 → 6,7 px | 0,391 → 11,7 px (de très loin) |
| 60 équipements, ouverture | 0,67 → 10,1 px | 0,55 → 13,2 px |
| 60 équipements, « cadrer tout » | 0,306 → 4,6 px | 0,324 → **9,7 px** |
| `demo-dc` 1280 clair, « cadrer tout » | — | 0,328 → 9,8 px |

**Écarts** : l'acceptation « ≥ 10 px à cadrer tout sur 60 équipements » n'est pas tenue (9,7 px). Le nom de très loin est
déjà le plus grand que la carte tienne (12 caractères à 30 dans 240) : à 0,324, la carte fait 78 px à l'écran et 12
caractères à 10 px en demandent 74 ; aucune taille dans la carte n'y arrive sans toucher ses bords. D4 promettait
« lisible jusqu'à 0,35 » : tenu (≥ 10 px dès 1/3). Le test Chromium vérifie ≥ 10 px à l'ouverture et, à « cadrer tout »,
le nom de très loin à ses 30 unités. Leviers, à trancher : un placement plus serré (lot 6), ou un nom de très loin qui
déborde un peu de sa carte. Les cartes s'élargissent (`demo-dc` : 200 → 240), le placement s'écarte d'autant
(« cadrer tout » de `demo-dc` 0,446 → 0,391) ; une infrastructure déjà mémorisée garde ses centres. À l'ouverture
(0,55), les pastilles de carte (ACTIF, stack) sont cachées comme sous 0,6 : conséquence de D4, visible. De loin, un nom
qui ne tient pas avec l'icône est raccourci au milieu (22 caractères dans une carte de 360 → 20). Captures et scripts :
`.impeccable/planche-lot-5/`. **Parqués** : l'étiquette des clusters HA (14 unités) reste illisible de loin ; la ligne
du dessous de `/view` (rôle, stack) peut élargir une carte au-delà de la largeur commune si elle dépasse le nom (aucun cas
sur `demo-dc`).

### Lot 6 — Arrangements : en couches, en grille, radial (P0, M)

> **Parqué le 2026-10-14 par Orhan, sauf « en grille », déplacé au lot 8.** Sa raison : « le placement est vraiment très
> personnel en fonction des préférences des utilisateurs, c'est aussi assez unique à chaque infrastructure. On n'est pas
> dans un livre scolaire où tout est rangé en couche core / distribution / access. Si Living Diagram est assez riche et
> simple dans la partie édition, le travail n'est à faire qu'une seule fois au moment de la première collecte et ensuite
> les positions sont stockées. » C'est le modèle du placement mémorisé (`docs/09`) : on place une fois, une nouvelle run
> ne place que les nouveaux. Un rangement « en couches » supposerait une topologie de manuel et serait presque toujours à
> refaire à la main. Ce qui compte donc : que le placement manuel, fait une fois, soit rapide et agréable même sur une
> grosse infrastructure, d'où l'ordre révisé de §7 (lot 13 performance, puis lot 8 guides avec « mettre en grille », puis
> lot 7). En couches, radial, organique relancé et « tout ranger » : parqués, la spécification ci-dessous reste comme
> trace et ne se code pas sans nouvelle demande.

**En une phrase** : « ranger » place la sélection, ou tout, comme un ingénieur réseau dessinerait : le cœur en haut,
l'accès en bas, les paires côte à côte.

**Pourquoi** : §4.1 point 2 ; le placement force-dirigé est le seul arrangement, et c'est celui qu'aucun éditeur
n'impose. Le placement mémorisé (docs/09) reste la mémoire ; un arrangement est une **commande** dont le résultat
s'enregistre comme des épingles (avec un nom) ou des déplacements locaux (sans), donc annulable, comme l'alignement.

**Spécification**

- **Commandes** (menu « ranger » dans la barre contextuelle de la sélection multiple et dans le menu contextuel du fond
  pour « tout ») : **en couches**, **en grille**, **radial**, **organique** (le placement actuel, relancé sur la sélection).
  S'applique à la sélection d'au moins deux équipements, sinon à tous les équipements visibles. Les annotations attachées
  suivent (enfants), les libres ne bougent pas.
- **En couches** (module pur `engine/src/canvas/arrange.ts`) : racines = la sélection « racine » si l'utilisateur en a
  marqué une (option : « ranger en couches depuis ici » sur un équipement), sinon automatiques : les équipements de type
  `router` et `firewall` d'abord, à défaut les plus connectés (degré) ; couches par distance (BFS) aux racines sur les
  câbles visibles ; dans une couche, ordre par barycentre des voisins de la couche d'au-dessus (deux passes descendante
  et montante, Sugiyama simplifié), **membres d'un cluster HA et d'une paire MLAG adjacents** ; espacement horizontal =
  largeur commune + 60, vertical = 80 × 2,5 ; couche centrée ; positions entières sur la grille ; les équipements
  épinglés hors sélection ne bougent pas, le rangement s'écrit autour d'eux (le résultat est translaté pour ne pas les
  recouvrir, `layout.separate` en finition). Orientation : haut → bas par défaut ; gauche → droite en option.
- **En grille** : colonnes = `ceil(sqrt(n × 1,6))`, ordre par nom (ou par l'ordre de la sélection), espacement comme
  ci-dessus ; **radial** : racine au centre (règle des racines), anneaux par distance, rayon = max(largeur commune × 1,2,
  périmètre / n) ; **organique** : `layout.run` sur la sélection avec les autres fixés (existe : `extend`).
- **Résultat** : positions entières, aimantées à la grille ; un paquet d'épingles (nom) ou des déplacements locaux ;
  **une entrée d'historique** ; message « 24 équipements rangés en couches (orhan) ». La vue cadre la sélection
  rangée. Rien n'est écrit dans le placement mémorisé par cette commande (il suit par `syncPlaces` comme un glissé).
- **Hors périmètre** : rangement automatique à l'ingestion (le placement mémorisé reste la règle), orthogonalisation
  des câbles, rangement des annotations.

**Code** : `engine/src/canvas/arrange.ts` (pur, testé : couches, ordre, adjacence HA / MLAG, grille, radial, grille
entière, épingles respectées), `app/canvas/toile.ts` (`arrange(kind, hosts)` → `moveTo` + paquet), `components/FloatingBar.tsx`
et `ContextMenu.tsx` (entrées), `state/history.ts`.

**Tests** : Node (sur `demo-dc` : les deux cœurs en couche 0 ou 1 selon les racines, les accès dessous, le cluster HA
adjacent, aucune collision de cartes, déterminisme) ; Chromium : « ranger en couches » depuis le menu du fond, épingles
écrites sous le nom, Ctrl+Z rend les places.

**Acceptation** : captures `1-couches`, `2-grille`, `3-radial` sur `demo-dc` ; temps < 200 ms à 500 équipements.

### Lot 7 — Zoom, navigation, raccourcis, présentation (P1, S)

**En une phrase** : la vue se commande au clavier et se lit, et l'interface sait s'effacer.

**Spécification**

- **Raccourcis** : **Maj+1** cadrer tout, **Maj+2** cadrer la sélection, **Maj+0** zoom 100 % (la convention de
  FigJam, Excalidraw et tldraw ; Ctrl+1 à Ctrl+9 changent d'onglet dans Chromium et ne s'interceptent pas), Ctrl+0 cadrer
  tout aussi, Ctrl+= / Ctrl+− par pas de 1,2 autour du centre de la vue, Ctrl + molette zoom au pointeur (lot 2),
  Espace + glissé et bouton du milieu (lot 2) ; Origine = cadrer tout ; **`?`** ou Ctrl+/ ouvre l'**aide-mémoire des raccourcis** (dialogue `Dialog`, deux colonnes,
  généré depuis une table unique `app/state/shortcuts.ts` qui alimente aussi les infobulles : une seule source).
- **Indicateur de zoom** dans `Controls` : « 67 % » cliquable → menu : 50, 100, 200 %, cadrer tout, cadrer la sélection.
- **Mode présentation** : **Ctrl+\\** (Figma) ou le bouton « plein écran » de `Controls` : passe en plein écran
  (`requestFullscreen`, admis par la CSP ? oui, pas une ressource) et masque toute l'interface flottante sauf un bouton
  de sortie discret ; la toile reste manipulable en lecture ; Échap sort. Préférence du navigateur : non (transitoire).
- **Curseurs** : `grab` / `grabbing` pour le panoramique, `crosshair` pour le rectangle (lot 1 / 2 posent le reste).

**Code** : `app/state/shortcuts.ts` (table, pure), `components/Shell.tsx`, `components/Controls.tsx`,
`components/Shortcuts.tsx` (dialogue), `app/canvas/toile.ts` (`zoomTo`, `zoomBy`, `fitSelection`), `app.css`.

**Tests** : Node (table des raccourcis sans doublon de combinaison, chaque entrée a sa clé de catalogue dans les deux
langues) ; Chromium : Ctrl+0 / 1 / 2, indicateur, `?`, mode présentation masque la barre et Échap la rend.

**Acceptation** : captures `1-aide-memoire`, `2-presentation`.

### Lot 8 — Guides d'alignement intelligents et aimant aux objets (P1, M)

**En une phrase** : pendant un glissé ou un redimensionnement, des lignes disent « aligné avec » et la boîte s'y colle.

**Dépend de** : lot 2. **Pourquoi** : §4.2 ; aucun éditeur du benchmark n'en est dépourvu.

**Spécification**

- **Module pur** `engine/src/canvas/guides.ts` : entrées = la ou les boîtes qui bougent (une boîte englobante quand il y
  en a plusieurs), les boîtes **candidates** (cartes, annotations, cadres visibles dans la zone de la vue élargie de
  50 %, 400 au plus, les plus proches d'abord), le zoom, la tolérance (**8 px écran**, le seuil d'Excalidraw et de tldraw). Sorties = la correction `(dx, dy)` à
  appliquer et les **lignes** à dessiner : bords (gauche, droite, haut, bas) et centres (H, V) alignés ; **espacement
  égal** : quand la boîte est entre deux candidates ou à côté d'une paire déjà espacée, la distance se propose (v2 du
  lot si le temps manque : v1 = bords et centres). Priorité : centre > bord, le plus proche gagne, une ligne par axe.
- **Pendant un glissé** : `onNodeDrag` lit la position proposée, demande la correction, l'applique (`setNodes` ou
  l'API de position de React Flow ; l'exemple « Helper Lines » de xyflow fait cela mais il est **payant**, on n'en
  reprend rien, le module est à nous) ; les lignes se dessinent
  dans une couche SVG en coordonnées d'écran (comme la bulle), couleur `--guide` (rose / rouge, jeton nouveau dans les
  deux thèmes, contraste ≥ 3:1 sur le fond), 1 px, avec un petit nombre pour une distance. **Alt** pendant le geste
  suspend l'aimantation (grille et guides) ; l'aimant de grille, quand il est actif, s'applique **après** les guides.
- **Pendant un redimensionnement** : le bord tiré s'aligne de même (lot 1 fournit les poignées).
- **Flèches du clavier** : pas de guides (déplacement d'un carreau).
- **Préférence** : « guides » dans `Controls`, actif par défaut (`ld-prefs.guides`).
- **Mettre la sélection en grille** (repris du lot 6, parqué, le 2026-10-14) : un geste d'édition à côté d'aligner et
  répartir (volet « aligner et répartir » de la barre contextuelle, menu contextuel d'une sélection) pour poser d'un coup
  vingt switchs d'accès en rangées régulières. Sélection d'au moins trois éléments ; la grille part du coin haut gauche
  de la boîte englobante de la sélection ; colonnes = `ceil(sqrt(n × 1,6))` ; ordre de lecture actuel (rangées par y puis
  x, pour que la grille respecte l'ordre que l'utilisateur voit), à défaut par nom ; pas horizontal = largeur commune
  + 60, vertical = hauteur de carte + 60 (boîtes réelles pour les annotations) ; positions entières, aimantées à la grille
  si l'aimant est actif ; les éléments hors sélection ne bougent pas ; **une entrée d'historique**, paquet d'épingles
  (nom) ou déplacements locaux (sans) ; message « 20 éléments mis en grille (orhan) ». Module pur
  `engine/src/canvas/align.ts` (à côté d'`alignBoxes`), testé sous Node. Jamais de rangement imposé à l'ouverture.

**Code** : `engine/src/canvas/guides.ts` (pur, testé), `app/canvas/Flow.tsx` (`onNodeDrag`), `app/canvas/annotation.tsx`
(redimensionnement), `app/canvas/GuideLayer.tsx` (nouveau, SVG écran), `components/Controls.tsx`, `state/prefs.ts`,
`styles/tokens.css` (`--guide`).

**Tests** : Node (`guides.ts` : bord, centre, priorité, tolérance en unités du plan selon le zoom, espacement égal, aucune
candidate hors zone, 400 candidates en < 2 ms) ; Chromium : un glissé qui passe à 6 px écran d'un alignement se colle et
la ligne se voit, Alt l'empêche, préférence rangée.

**Acceptation** : capture `1-guide-centre`, `2-espacement-egal` prises **pendant** le glissé (le pilote tient le bouton).

**Prototype validé le 2026-10-14** (`.impeccable/prototype-lot-8/`, skills frontend-design et impeccable, revue de design
indépendante appliquée ; Orhan : « vraiment pas mal du tout comme rendu et comme qualité ») ; il fait foi pour le rendu
(trait plein de 1 px interrompu sur les cartes, croix aux coins d'un repère de bord, cote d'écart en capsule, équerres de
coin pour la boîte d'une sélection multiple, aperçu de la grille avec le nom de chaque place, pastille du geste à la
première place libre). Réponses d'Orhan, qui remplacent la spécification ci-dessus là où elles diffèrent :
1. **Ctrl** tenu pendant le geste suspend l'aimantation (et non Alt : Alt + glissé = cloner depuis le lot 3).
2. **Repères en vert chartreuse par défaut** (`--guide`, `#c6f03a` sombre, `#4f7a00` clair), **et la couleur se choisit** :
   préférence du navigateur (`ld-prefs`, comme la grille et le thème ; propre à chacun, jamais une intention), réglée dans
   le panneau Affichage par une rangée de pastilles (chartreuse + les teintes nommées de `hues.ts` qui gardent un
   contraste ≥ 3:1 sur la toile dans les deux thèmes, vérifié par un test), « défaut » pour revenir au chartreuse.
3. **Grille : ordre par nom par défaut**, « à l'écran » en option dans le volet ; le dernier choix est une préférence du
   navigateur.
4. **Colonnes par défaut : le moins de cases vides** (4 × 3 pour 12, 5 × 4 pour 20), réglables par − / + dans le volet.

Le geste existe aussi au clic droit d'une sélection et par **Alt+G** (à juger à l'usage dans le navigateur d'Orhan, avec le
seuil de 8 px sur une grosse infrastructure).

**Fait le 2026-10-14** : les repères d'alignement, l'aimant aux objets et « mettre en grille », transposés du prototype
validé (trait plein de 1 px interrompu sur les boîtes qu'il traverse, croix aux coins d'un repère de bord, cote d'un écart
égal en capsule entre deux butées, quatre équerres autour d'une sélection glissée, pastille du geste « X, Y » à la
première place libre, « libre » quand Ctrl est tenu, aperçu de la grille avec le nom de chaque place, estompage allégé
pendant le geste et objets alignés à pleine opacité). **Le calcul** (`engine/src/app/canvas/guides.ts`, pur, testé sous
Node, `LDApp.guides`) : centre ↔ centre et bord ↔ bord, le centre avant un bord, l'écart égal (entre deux voisins, au bout
d'une paire) au rang d'un bord, le plus proche à rang égal, une ligne par axe ; tolérance 8 px d'écran / zoom ;
candidates = cartes, disques, annotations, cadres de groupe et de cluster de la vue élargie de moitié, 400 au plus, les
plus proches d'abord (un cadre ou un cluster ne compte pas pour l'espacement) ; l'aimant de la grille **après** les
repères, sur l'axe qu'ils n'ont pas pris (`placeMove`) ; le bord tiré d'un redimensionnement de même (`placeResize`,
jamais sous 20). **Le branchement** (`app/canvas/guide-drag.ts`) : au début d'un geste, une photographie (boîtes qui
bougent, candidates), puis à chaque pas la correction appliquée aux positions que React Flow propose (`onNodesChange`,
avant qu'elles ne soient montrées : React Flow n'aimante plus lui-même, `snapToGrid` retiré) ; Ctrl lu sur le pointeur et
au clavier (Ctrl pressé ou relâché sans bouger : la toile se replace aussitôt) ; à la relâche, les places corrigées sont
celles des nœuds montrés (React Flow rend les siennes, brutes) ; Alt + glissé (`clone.tsx`) : l'écart du fantôme corrigé,
les originaux restent des candidates (une copie s'aligne volontiers sur l'original), l'aimant par pas de 20 sur l'axe
libre comme avant ; le redimensionnement d'une annotation (`annotation.tsx`, `guideResize`). **La couche**
(`app/canvas/GuideLayer.tsx`) : en coordonnées d'écran, un état à part (`GuideStore`) : un pas de glissé ne redessine
qu'elle, jamais la toile (la version de la toile ne bouge pas pendant un glissé, mesuré) ; elle lit cet état **à la
prochaine image** (une mise à jour synchrone par `useSyncExternalStore` faisait rendre la toile de React Flow dans le même
pas : une image de 117 à 133 ms au premier glissé, une fois sur trois à huit, dans la garde de la jauge ; trouvé par
bissection) ; abonnée à la vue seulement quand elle montre quelque chose, sa propre couche de composition ; les objets
alignés reçoivent `guide-hit` sur leur nœud et repassent à pleine opacité ; l'estompage allégé (`guiding`) ne se pose que
jusqu'à 150 équipements dessinés (au-delà, repeindre toutes les cartes estompées d'un coup coûte). **Mettre en grille**
(`gridBoxes`, `gridColumns`, `naturalCompare`, `screenOrder` dans `engine/src/canvas/align.ts`, à côté d'`alignBoxes` ;
`/view` n'en embarque rien, `viewer.js` inchangé à l'octet) : les éléments d'un alignement (équipements de la run,
annotations non verrouillées ; cadres et connecteurs ne bougent pas), trois au moins ; colonnes par défaut **le moins de
cases vides** entre ⌈√n⌉ et ⌈√(1,6 n)⌉, à égalité la plus large (12 → 4 × 3, 20 → 5 × 4, 144 → 16 × 9 plutôt que
12 × 12) ; ordre **par nom** (chiffres comme des nombres, sans la casse ni locale) ou **à l'écran** (rangées par y puis
x) ; case = la plus grande boîte + 60, chaque boîte centrée dans sa case, départ au coin haut gauche de la sélection,
aimantées si l'aimant est mis ; `toile.gridSelected` / `gridPlan` (aperçu) ; un paquet d'épingles et les places des
annotations en **une** écriture, donc un Ctrl+Z (« 12 éléments mis en grille, enregistrés (orhan) ») ; sans nom, des
déplacements locaux, dits tels. Le volet « aligner et répartir » porte la section sous un filet (colonnes − / +,
ordre par nom / à l'écran, « mettre en grille · Alt+G »), son en-tête dit le résultat (« 12 → 4 × 3 ») et survoler la
section montre l'aperçu ; **Alt+G** et l'entrée « mettre en grille · Alt+G » du clic droit d'une sélection (sans aperçu)
font le même geste ; sous trois éléments, la ligne d'état le dit. **Préférences du navigateur** (`state/prefs.ts`) :
`guides` (bouton règle de la colonne `Controls`, allumé par défaut), `guideHue` (rangée de pastilles « couleur des
repères » du panneau Affichage, « défaut » rend le chartreuse ; posée sur la racine par le CSSOM, `--guide:
var(--hue-…)`), `gridOrder` (le dernier choix du volet). **Les teintes proposées** (`GUIDE_HUES`) : celles qui tiennent 3:1
sur la toile dans les deux thèmes, vérifiées par un test Node qui lit `tokens.css` ; l'orange (2,81:1) et le vert (2,91:1)
sur le fond clair n'y tiennent pas et ne sont pas proposés ; la cote en capsule écrit son chiffre en `--guide-ink` (le
fond sombre en sombre, blanc en clair : de 3,19:1 sur l'ambre à 6,3:1 en clair, 6,4 à 14:1 en sombre). **Tests** : 9
tests Node (repères : priorité, tolérance, grille après repères, Ctrl, espacement égal, redimensionnement, candidates,
temps, trait interrompu, pastille ; couleurs et contraste ; grille ; volet, Alt+G, menu ; préférences), parcours Chromium
`backend/tests/test_app_guides.py` (glissé à 6 px qui se colle et ligne visible bouton tenu, pastille, estompage allégé,
épingle écrite ; Ctrl : ni ligne ni aimant, « libre » ; Alt + glissé d'une note alignée sur l'original ; bord tiré
aligné ; repères éteints : rien ne colle ; couleur rangée, tenue au rechargement, jamais dans l'adresse ; volet : « 5 → 3 ×
2 », − / +, ordre rangé, aperçu au survol, grille par nom écrite en épingles ; Ctrl+Z rend les places ; Alt+G ; menu) ;
**22 mutations attrapées sur 22** (16 sous Node, 6 dans Chromium ; `.impeccable/planche-lot-8/scripts/mutations_lot8.py`).
**Mesures** (Chromium sans écran, 500 équipements `generate --seed 7`, zoom 1, glissé de 60 mouvements, trois passages ;
`scripts/mesure_lot8.py`, `mesures-lot8.json`) : un pas de calcul avec 400 candidates 0,16 ms dans la page, la
photographie des candidates 0,10 ms (519 cartes, 266 dans la zone) ; glissé d'une carte repères allumés 39,6 à 44,6 i/s
(image la plus longue 50 à 83 ms), éteints 32,6 à 32,9 i/s, la version commitée (sans repères) 31,2 à 33,9 i/s dans les
mêmes conditions : aucune régression (les repères accélèrent même un peu : une carte collée ne bouge pas d'une image à
l'autre) ; la toile n'est jamais reconstruite pendant un glissé (une seule version, celle de la sélection, comme avant) ;
garde `test_app_gauge.py` verte. Sous `vm` (tests Node), les fonctions natives d'un autre contexte rendent le calcul
une vingtaine de fois plus lent : le test du temps se mesure dans le contexte principal, comme la page. Captures :
`.impeccable/planche-lot-8/` (`1-guide-centre`, `2-espacement-egal` pris bouton tenu, `3-guide-bord`, `4-redimension`,
`5-volet-grille`, `6-grille-resultat`, `7-affichage-couleur-reperes`, `8-clair-1280` ; `scripts/capture_lot8.py`) ;
détecteur Impeccable sans constat. **Écarts, décisions prises seul** : (1) le module des repères vit dans
`engine/src/app/canvas/guides.ts` (il ne sert qu'à l'application), la grille dans `canvas/align.ts` ; (2) la pastille « X,
Y » d'un glissé d'équipement ou d'un bloc dit le coin haut gauche de la boîte (comme le prototype) ; une annotation seule
garde sa pastille d'avant (les valeurs de sa fiche) et la couche n'ajoute « libre » que Ctrl tenu ; (3) Maj (rapport) ou
Alt (depuis le centre) pendant un redimensionnement font bouger deux bords : les repères s'y taisent ; (4) avec l'aimant
mis, un redimensionnement pose le bord tiré sur la grille (avant : non aimanté), comme le prototype ; (5) Ctrl tenu
pendant un Alt + glissé suspend aussi l'aimant de la grille (avant : pas de 20 même avec Ctrl) ; (6) l'aimant d'un bloc
pose désormais le coin haut gauche de la boîte englobante (React Flow posait celui du premier nœud) ; (7) pas
d'animation de 240 ms des éléments vers leur place de grille (le prototype en avait une) : la grille se pose comme un
alignement, d'un coup ; (8) les colonnes réglées par − / + valent pour la sélection en cours (Alt+G les reprend), pas une
préférence ; (9) la teinte « défaut » et la pastille chartreuse font la même chose (« défaut » rend le chartreuse, comme
demandé, et se grise quand il est déjà là). (10) le parcours du presse-papiers (`test_app_clipboard.py`) mesurait l'écart exact d'un Alt + glissé : la copie s'y
alignait désormais sur une voisine (100 au lieu de 106) ; il tient Ctrl en plus (`_alt_drag(..., free=True)`), ce qui
est le geste « libre », aucune assertion retirée. **Garde de la jauge** : après la correction, une seule sorte d'échec
vue, 3 fois en une cinquantaine de passages, jamais en 17 passages de la version commitée : juste après le glissé, la
vue envoyée loin de tout, 425 à 520 cartes encore montées 0,6 s plus tard (la réponse de l'épingle arrive dans ce
temps) ; cause non établie, à surveiller. **Parqués** : l'écart égal pendant un redimensionnement (bords seulement) ;
les repères pendant les flèches (voulu : un carreau) ; la rafale de Ctrl pendant un Alt + glissé immobile ne redessine
pas le fantôme avant le prochain mouvement ; aperçu de la grille au clic droit (voulu : il recouvrirait les places) ;
Alt+G et le seuil de 8 px sont dans `docs/a-juger-a-l-usage.md`.

### Lot 9 — Ordre de superposition et verrou (P1, M) — contrat `Intent` 1.6.0

**En une phrase** : devant, derrière, avancer, reculer, et un cadenas qui se voit.

**Pourquoi** : §4.2 ; décision D7. Deux plans ne suffisent plus dès trois annotations qui se chevauchent.

**Spécification**

- **Contrat** : `order: int` (−100 000 à 100 000, défaut 0) sur `annotations[]` et `connectors[]` ; `locked: bool` sur
  `groups[]` (comme les annotations) ; `upgraded()` pose `order = 0` et `locked = false` sur un 1.5.x ; les deux plans
  (`plane`) restent. Rendu : `zIndex = base du plan + order` (dessous : −40 000 + order ; dessus : 20 000 + order),
  les cadres gardent leur rangement par aire sous tout. Opérations : `annotation_update` / `connector_update` /
  `group_update` acceptent déjà des patchs partiels (`order`, `locked` s'y ajoutent) ; pas de nouvelle opération.
- **Commandes** : premier plan (Ctrl+Maj+]) = `max(order du plan) + 1` ; arrière-plan (Ctrl+Maj+[) = `min − 1` ;
  avancer (Ctrl+]) / reculer (Ctrl+[) = échange avec l'élément **qui chevauche** le plus proche dans l'ordre (sinon
  rien, message « déjà devant ») ; sur une sélection multiple, chaque élément garde son rang relatif. Menu contextuel,
  barre contextuelle (volet « ordre » à quatre boutons), inspecteur (rangée « ordre » : les quatre boutons).
- **Verrou** : un élément verrouillé ne se glisse pas, ne se redimensionne pas, ne se supprime pas par Suppr, n'entre
  pas dans un rectangle, se sélectionne au clic (ses réglages restent modifiables) ; un **cadenas** à taille d'écran au
  coin haut droit (`pill.ts`, `tone-muted`), visible au survol et à la sélection ; **verrouiller un équipement =
  épingler** (déjà le cas : le dire dans la fiche) ; les groupes gagnent le verrou (cadre non glissable, membres
  glissables) ; Ctrl+Maj+L bascule.
- **Annotation attachée** : toujours au-dessus de son ancre (lot 1 le dit) ; son `order` ne joue qu'entre annotations
  attachées à la même ancre.

**Code** : `contracts/src/ld_contracts/intent/annotations.py`, `connectors.py`, `groups.py`, `upgrade`, schéma,
`CONTRAT.md`, fixtures ; `backend/src/ld_backend/intent.py` (opérations), `cli` (`ld intent` imprime l'ordre et le
verrou) ; `engine/src/canvas/annotations.ts` (`Z`), `app/canvas/Flow.tsx` (zIndex), `app/state/order.ts` (pur : devant,
derrière, avancer, reculer par chevauchement), `history.ts`, `ContextMenu.tsx`, `FloatingBar.tsx`, `cards/*`.

**Tests** : contrats (bornes, défaut, montée de version), store, API, CLI ; Node (`order.ts` : échange par chevauchement,
rang relatif d'une sélection) ; Chromium : trois notes qui se chevauchent, Ctrl+] en change l'ordre visible (élément
sous le pointeur), verrou qui refuse le rectangle et accepte le clic, Ctrl+Z. **Revue indépendante** (contrat).

**Acceptation** : capture `1-trois-notes-ordre`, `2-verrou`.

### Lot 10 — Styles : copier le style, dernier style, même taille (P1, S)

**Spécification**

- **Copier le style** Ctrl+Alt+C sur un élément, **coller le style** Ctrl+Alt+V sur la sélection (annotations et
  connecteurs ; un style de note sur une forme pose ce qui est commun : teinte, remplissage, bordure, coins, opacité,
  texte) ; menu contextuel et barre contextuelle (« pipette »). Une entrée d'historique par collage.
- **Dernier style utilisé** (D12) : à l'insertion, une note, une forme, un tableau, un connecteur prennent le dernier
  style **modifié** par l'utilisateur pour cette sorte (`ld-prefs.lastStyle[kind]`, posé quand un style change par la
  fiche ou la barre, jamais par un collage de style) ; « rétablir les défauts » dans l'inspecteur (volet « … »).
- **Même taille** : sur une sélection d'annotations, « même largeur », « même hauteur », « même taille » prennent celles
  du **dernier sélectionné** (principal), dans le menu de la sélection multiple et la barre contextuelle.

**Code** : `app/state/styles.ts` (pur : style commun, application à une sorte), `state/prefs.ts`, `state/store.tsx`,
`Shell.tsx`, `ContextMenu.tsx`, `FloatingBar.tsx`. Pas de contrat.

**Tests** : Node (style commun entre sortes, préférence bornée) ; Chromium : copier / coller le style, dernier style
à l'insertion, même largeur.

### Lot 11 — Export : PNG, puis SVG et PDF, et impression (P1, S puis L)

**En une phrase** : le diagramme sort de l'application tel qu'il se voit, avec ses annotations, pour un auditeur.

**Pourquoi** : §2 ; « Living Diagram va servir de référentiel solide en interne et pour les auditeurs » (docs/10 §6),
la sortie figée est parquée depuis le 2026-10-08. Décision D8.

**11 a, PNG (S)** : menu « exporter › PNG » (barre haute, menu, Ctrl+Maj+E) : volet avec **tout / la sélection**,
échelle 1 / 2 / 3, fond (thème / transparent), grille oui / non ; capture du conteneur React Flow par `html-to-image`
(dépendance **à décider** dans le lot : MIT, embarquée, pas de CDN, **1.11.11** comme l'exemple « Download Image » de
React Flow qui l'épingle en « latest working version » ; sinon le rendu manuel du lot 11 b) avec les polices
embarquées en `data:` (lire `fonts/*.woff2` par `fetch` sous `font-src 'self'`) ; l'interface flottante n'y est pas
(`filter` sur les classes) ; nom `<infrastructure>-<run>.png` ; téléchargement par `blob:` (CSP : `img-src blob:`
existe ; vérifier `download`). Message avec la taille.

**11 b, SVG et PDF (L)** : `engine/src/canvas/svg.ts` (pur) écrit la **scène** en SVG autonome à partir des mêmes
fonctions que la toile (`card.ts`, `icons.ts`, `pill.ts`, `geometry.ts`, `groups.ts`, `annotations.ts`, `connectors.ts`,
`tags.ts`), avec les couleurs **résolues** (les jetons lus par `getComputedStyle` sur la racine, passés en paramètres :
le module reste pur) et les polices en `@font-face` `data:` ; texte sélectionnable, identifiants `data-host` ; images
en `data:` (le magasin par `GET` avec le jeton). PDF = impression du SVG dans une page dédiée (`window.print`, feuille
`@page`) ; feuille d'impression de l'application (`@media print` : toile seule, fond blanc, pas d'interface) pour
Ctrl+P. Mode « sélection » = la boîte englobante de la sélection avec marge 40.

**Code** : `components/Export.tsx` (volet), `app/state/export.ts` (options, nom de fichier, pur), `app/canvas/svg.ts`,
`api/client.ts` (lecture des polices et des images), `app.css` (`@media print`).

**Tests** : Node (`svg.ts` : un SVG valide pour `demo-dc` avec une annotation et un connecteur, même nombre de cartes,
dimensions de la sélection, aucune URL externe) ; backend : le SVG écrit passe le test « aucune URL » ; Chromium :
export PNG déclenche un téléchargement (`Page.setDownloadBehavior`), fichier non vide, dimensions ×2.

**Acceptation** : le PNG et le SVG de `demo-dc` joints au rapport, ouverts dans Chromium, identiques à l'écran (icônes,
polices, teintes, annotations).

### Lot 12 — Multi-utilisateur : une page qui voit les autres (P1, M)

**En une phrase** : ce qu'un autre écrit apparaît sans recharger, et une écriture périmée ne l'écrase pas en silence.

**Pourquoi** : §4.5 ; docs/08 Q5 ; décision D9.

**Spécification**

- **API** : `GET /api/intent?infrastructure=` renvoie un `ETag` (la révision) et répond **304** à `If-None-Match` ; même
  chose pour `GET /api/placement`. Coût d'un 304 : lecture de la révision seule (le store la connaît sans relire le
  document : à vérifier, sinon mettre en cache `(taille, date) → révision`).
- **Page** : toutes les 15 s quand l'onglet est visible (`visibilitychange`, et une relecture immédiate au retour),
  `GET` conditionnel ; une réponse 200 **fusionne** : le document reçu remplace celui de la page, les épingles,
  couleurs, groupes, annotations, connecteurs se redessinent ; une boîte en cours de glissé ou un éditeur en place
  ouvert ne sautent pas (le local en attente garde la main jusqu'à sa propre écriture) ; message discret « intention
  mise à jour (par X il y a 20 s) », X lu dans la dernière ligne du journal (`GET /api/intent/journal?infrastructure=&…`,
  une page de 1) ; l'historique (Ctrl+Z) garde sa règle « une clé modifiée par un autre est sautée ».
- **Précondition** : `POST /api/intent/patches` accepte `expected_revision` ; **409** avec le document courant si la
  révision a bougé ; la page relit, **rejoue ses opérations** sur le document frais si elles ne touchent pas une clé
  modifiée entre-temps (une épingle, une couleur, un patch d'annotation sont idempotents par clé), sinon elle dit ce
  qu'elle a laissé ; trois essais au plus (règle du placement). Sans `expected_revision`, comportement d'aujourd'hui
  (compatibilité avec `/view`).
- **Option, si le temps le permet** : « voir les changements récents » (Miro) : les éléments modifiés par d'autres depuis
  l'ouverture de la page gardent un liseré discret jusqu'au prochain clic sur eux.
- **Hors périmètre** : présence (qui regarde), curseurs partagés, verrou d'édition ; `WebSocket` / SSE (la relecture
  suffit à 15 s ; à revoir si le besoin de « temps réel » est dit).

**Code** : `backend/src/ld_backend/api.py` (ETag, 304, `expected_revision`), `intent.py` (révision sans relecture),
`schemas.py`, `openapi.py`, `problems.py` (`stale_revision`) ; `engine/src/app/api/client.ts` (conditionnel),
`shell/intent.ts` (`refresh`, fusion), `api/writers.ts` (précondition, rejeu), `state/store.tsx` (minuterie fournie par
la page), catalogues.

**Tests** : backend (ETag, 304, 409 avec document, rejeu), Node (fusion qui garde le local en attente), Chromium à
deux onglets (une épingle posée dans l'un se voit dans l'autre sans rechargement ; une écriture périmée est rejouée ou
dite). **Revue indépendante** (API).

### Lot 13 — Performance de la toile à la jauge (P1, M)

**En une phrase** : 500 équipements et 1 500 câbles se sélectionnent et se glissent sans attendre.

**Spécification**

- **Mesure d'abord** (série du générateur, 500 équipements, pilote Chromium, `Performance.getMetrics` et des
  horodatages posés par la page) : temps jusqu'au premier dessin, temps d'une sélection (clic → fiche ouverte), images
  par seconde pendant un glissé de 60 images, temps de « cadrer tout », mémoire. Les chiffres vont dans le rapport et
  dans `engine/README.md`.
- **Cibles** : sélection < 50 ms, glissé ≥ 50 images / s, premier dessin < 2 s (hors placement), sans régression du
  déterminisme.
- **Corrections attendues** (dans l'ordre, chacune mesurée) : `React.memo` sur les composants de nœud et d'arête avec
  des props stables (données par identité, pas par objet neuf) ; reconstruction **incrémentale** dans `Flow.tsx`
  (ne recalculer que les nœuds et arêtes dont la version propre a changé : la scène garde une version par élément, la
  sélection ne reconstruit que les deux éléments qui changent de classe) ; connecteurs abonnés à **leurs bouts**
  seulement (`useNodesData([a, b])`) ; `placeCableTags` et `speedGroups` recalculés à un changement de positions, pas de
  sélection ; `onlyRenderVisibleElements` évalué (gain / risque sur `measured`) ; le glissé d'un cadre ne fait plus un
  `map` sur tous les nœuds (ne déplacer que ses membres par `updateNode`).
- **Garde** : un test Chromium à 500 équipements avec des bornes larges (sélection < 200 ms, glissé sans image > 100 ms),
  marqué lent, lancé dans la suite complète.

**Code** : `app/canvas/Flow.tsx`, `nodes.tsx`, `edges.tsx`, `connector.tsx`, `toile.ts` (versions par élément),
`backend/tests/test_app.py` (`test_the_application_at_the_gauge`).

**Fait le 2026-10-14** : rien ne change à l'écran (captures avant / après identiques à 0-6 pixels de tramée près) ; à
500 équipements, la sélection, les flèches, le collage et le glissé ne reconstruisent et ne peignent plus toute la
toile. Mesuré d'abord, puis après chaque correction (Chromium sans écran ni GPU, 1440 × 900, `generate --seed 7
--devices 500`, médianes de trois ; script `.impeccable/planche-lot-13/scripts/mesure_lot13.py`, résultats
`mesures-*.json`) ; le profil a montré que l'essentiel n'était pas le JavaScript mais le rendu natif de ~45 000
éléments DOM (3 856 arêtes, chacune un `svg` de React Flow) et ~4 400 abonnements au magasin de React Flow. Les
corrections, dans l'ordre : (A) `React.memo` sur nœuds et arêtes (cartes, disques, clusters, cadres sur leurs seules
données) : seul, sans effet, les données étant neuves à chaque version ; (B) **reprise des objets inchangés**
(`app/canvas/reuse.ts`, pur : égalité en profondeur bornée, l'objet déjà montré resservi tel quel, les mesures
`measured` gardées quand il change ; une version sans changement ne donne rien à React Flow) ; (C) **caches de
`flow-build.ts`** par toile et par langue : plan de carte, textes traduits (noms accessibles, rôles : 4 400 appels de
`t` par version avant), groupes de vitesse par scène, bande de faisceau, place des pastilles recalculée au changement
de positions seulement ; (D) un connecteur abonné à **ses deux bouts** (nœud, données, place, taille) au lieu de
`s.nodes` ; (F) le glissé d'un cadre de groupe déplace ses membres dans le même `applyNodeChanges` que le cadre (plus
de second passage ni de second `setNodes`) ; (G) **une pastille cachée au repos** (étiquette de faisceau, vitesse
éteinte) n'entre dans le dessin qu'à sa première apparition puis y reste (fondu de sortie gardé), son arrivée garde
son fondu par `@starting-style` (`canvas.css`) : 1 918 arêtes de moins à l'ouverture ; (H) **`onlyRenderVisibleElements`**
évalué puis adopté, avec ses protections : cadres, clusters et connecteurs déclarent leur taille (`width`, `height` ; un
connecteur, la boîte de son tracé, sans appui, cachée dans la minimap), sinon React Flow jugeait un connecteur par son
coin et un cadre sur une mesure périmée ; deux défauts que la culture révélait, corrigés : un nœud remonté rejouait la
dernière demande d'édition (F2) et ouvrait son champ (registre `claim` dans `annotation.tsx`, au lieu d'une référence
par instance), un champ d'édition en place démonté avec son nœud perdait sa saisie (il enregistre, comme quitté :
`useFinish`, `inline.tsx`) ; Tab vers un élément hors champ centre la vue et le focus suit à son arrivée (`Shell.tsx`) ;
(I) après un déplacement, **la place des pastilles attend que les positions ne bougent plus** (120 ms, minuterie de la
page) : elles gardent entre-temps leur place relative sur leur câble, comme pendant un glissé ; le résultat final est
celui d'un calcul immédiat (vérifié). Mesures à 500 équipements (temps en ms ; images/s, image la plus longue entre
parenthèses ; « sélection » : du clic au DOM à jour / à la fiche et la carte peintes ; « 1er dessin » : placement
mémorisé, de la navigation aux cartes peintes) :

| Étape | 1er dessin | sélection | barre peinte | flèche ×1 | flèche ×20 | collage 30 | glissé carte | bloc de 20 | cadre de groupe | pano. de près | pano. de loin | cadrer tout | tas Mo / DOM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| avant | 2 791 | 443 / 719 | 777 | 288 | 360 | 1 444 | 15-17 (433) | 18 (517) | 14 (517) | 19-22 (167) | 22 (117) | 413 | 75 / 44 961 |
| A memo | 3 082 | — / 712 | 811 | 346 | 367 | 1 427 | 15-17 (467) | 19 (500) | 15 (533) | — | — | 396 | 75 / 44 961 |
| B reprise | 2 470 | — / 522 | 622 | 117 | 173 | 786 | 15-19 (433) | 20 (350) | 15 (417) | — | — | 396 | 72 / 44 961 |
| C caches | 2 348 | — / 420 | 490 | 109 | 172 | 587 | 17-21 (317) | 18 (333) | 15 (283) | — | — | 416 | 71 / 44 961 |
| D + F connecteurs, cadre | 2 253 | — / 430 | 538 | 127 | 177 | 564 | 16-20 (333) | 18 (283) | 16 (300) | — | — | 387 | 71 / 44 961 |
| G pastilles à la demande | 1 614 | 232 / 286 | 375 | 80 | 113 | 456 | 24-29 (200) | 21 (183) | 17 (183) | 29-30 (50) | 39 (50) | 235 | 53 / 28 717 |
| H culture | 1 175 | 71 / 149 | 207 | 52 | 56 | 315 | 49-50 (117) | 35 (167) | 29 (150) | 41-47 (50) | 29 (50) | 555 | 34 / 8 954 |
| I pastilles différées | 1 129 | 72 / 147 | 208 | 30 | 46 | 319 | 50-51 (83) | 35 (100) | 30 (100) | 37-42 (33) | 25 (67) | 548 | 34 / 8 954 |
| **final** | **1 253** | **73 / 146** | **211** | **45** | **50** | **298** | **51-53 (67)** | **35 (67)** | **29 (100)** | **37-45 (33)** | **36 (50)** | **534** | **34 / 8 954** |

Sur `demo-dc` (33 équipements), avant → final : 1er dessin 257 → 211, sélection 56 / 130 → 42 / 112, barre 198 →
180, flèche ×1 63 → 37, collage 183 → 131, glissé 51-53 i/s inchangé, « cadrer tout » 61 → 81. Les étapes A à D ont été
mesurées avec la première version du script (sans le temps « DOM à jour » ni les panoramiques). Les écarts d'une
passe à l'autre sur une même étape vont jusqu'à ±15 %. Le « 1er dessin » avec placement calculé (première ouverture
d'une infrastructure) passe de 3,2 s à 1,5 s. **Verdict sur les cibles** : premier dessin < 2 s, **tenu** (1,25 s) ;
glissé ≥ 50 images / s, **tenu pour une carte** (51-53 i/s, aucune image > 100 ms), **pas pour un bloc de 20 (35 i/s)
ni un cadre de groupe de 10 membres (29 i/s)** (dans un bloc, chaque image déplace 20 cartes et leurs câbles) ; sélection
< 50 ms, **non tenue** (DOM à jour en 73 ms, peint en 146 ms ; sur `demo-dc`, 42 / 112 ms : le plancher est hors de la
toile, la fiche qui s'ouvre et la tramée logicielle de Chromium sans GPU, plein écran avec panneaux floutés, 546 ms de
tramée hors du fil principal au profil) ; déterminisme **intact** (captures, pastilles replacées égales à un calcul
immédiat, garde). **La garde** : `backend/tests/test_app_gauge.py`, `test_the_application_at_the_gauge` (marqué
`slow`, marqueur enregistré dans `pyproject.toml`, lancé par la suite complète ; ~40 s) : 500 équipements, sélection
peinte < 200 ms (médiane de trois), glissé sans image > 100 ms (pendant le geste, la relâche à part), et la justesse de
ce que la performance a changé (culture active ; nœud monté à son arrivée et jamais caché ; tout présent après
« cadrer tout » et une bascule de couche ; connecteur dont le coin est hors champ ; champ d'édition qui enregistre en
sortant de la vue ; demande d'édition non rejouée ; Tab vers un élément hors champ ; fondu d'arrivée d'une pastille ;
pastilles replacées comme un calcul immédiat) ; 8 mutations attrapées sur 8 (`scripts/mutations_garde_lot13.py`) ; le
module pur, 11 sur 11 sous Node (`scripts/mutations_lot13.py`). **Écarts, décisions prises seul** : (1) la garde vit
dans son propre fichier (`test_app.py` fait 1 718 lignes ; les lots 2 à 4 ont fait de même) ; (2) les versions par
élément de la spécification sont remplacées par une comparaison des objets construits (même effet, aucune
comptabilité de versions à tenir dans `toile.ts`, qui ne change pas) ; (3) culture adoptée (sans elle, la sélection
reste à ~290 ms et le glissé à ~25 i/s, la garde ne tient pas) ; en échange, « cadrer tout » monte tout (413 → 534 ms),
le panoramique de loin reste au niveau d'avant (22 → 36 i/s, mais 39 sans la culture) et un élément qui ne déborde de
sa boîte (courbe d'un câble, étiquette de groupe posée hors de son cadre, ligne de rappel d'une annotation hors champ)
peut paraître au bord de l'écran un instant plus tard : ajouté à `docs/a-juger-a-l-usage.md`, la retirer est une
propriété ; (4) le parcours de la barre contextuelle (`test_app_floating.py`) attendait une note posée hors champ dans
le DOM : il attend désormais qu'elle soit dessinée par la toile, la ligne suivante la montre (aucune assertion retirée) ;
(5) un champ d'édition qui disparaît sans avoir fini enregistre, aussi hors de la culture (sélection changée ailleurs,
annotation supprimée entre-temps : avant, la saisie était perdue en silence) ; (6) le placement des pastilles
(`canvas/tags.ts`) n'est pas accéléré : il est partagé avec `/view`, gelée. **Parqués** : « cadrer tout » à 500 (tout se
monte ; les dessins de loin d'une carte, lot 5, font un quart de ses éléments : n'en monter qu'un selon le zoom
l'allégerait d'autant) ;
glissé d'un bloc ou d'un cadre sous 50 i/s ; la liste des nœuds et arêtes reconstruite puis comparée à chaque version
(~15 ms à 500) ; le panoramique de loin. **§8, avis** : React Flow tient la jauge pour ce qu'Orhan fait à 500
équipements (sélectionner, glisser, pousser aux flèches, coller, au zoom de travail), à condition de ne monter que ce
qui se voit ; ce qui reste lent (tramée sans GPU, « cadrer tout ») tient au nombre d'éléments à peindre plus qu'à la
bibliothèque. Pas de raison de rouvrir le pari ; à revoir si Orhan juge à l'usage le bord de l'écran ou « cadrer tout ».
Captures : `.impeccable/planche-lot-13/` (`avant-*`, `apres-*`, `diff-*` ; quatre vues sur `demo-dc` et sur 500
équipements : ouverture, « cadrer tout », sélection, couches vitesses et port-channels ; `scripts/capture_lot13.py`,
`compare_lot13.py`).

### Lot 14 — La passe visuelle « moderne » (P2, M) — après les lots 1 à 5

**En une phrase** : ce que la main fait, l'œil le voit venir et le voit se faire.

**Spécification** (une capture par retouche, pas de variantes) : curseurs partout (`grab`, `grabbing`, `move`,
`crosshair`, `text`, redimensionnement) ; liseré de survol et anneau de sélection (2 px écran, accent, coins suivis) ;
poignées et pastilles de geste (lot 1) relues ; apparition de la barre contextuelle (120 ms, 4 px, `--t-tip`), de
l'élément inséré (un pulse d'opacité, 200 ms), du collage (même pulse), fondu de la bulle (existe) ; fantôme d'Alt +
glissé ; messages d'état en bas à gauche empilés avec icône et bouton d'action (« masquer », « annuler ») au lieu de
la ligne centrale ; barre d'outils haute en deux groupes (vue · insertion) ; état vide du diagramme (aucun équipement
visible : une phrase et « tout montrer ») ; mouvement réduit respecté. **Critique Impeccable** à deux agents isolés sur
cinq captures (ouverture, sélection d'une note avec barre, sélection mixte, glissé avec guides, présentation) ; cible
≥ 30 / 40 ; les P1 corrigés dans le lot, le reste consigné.

### Lot 15 — Texte riche restreint dans les notes (P2, S) — si D11 est retenue

Markdown restreint dans `note.text` (contrat inchangé : c'est du texte) : `**gras**`, `_italique_`, `- liste`, `[lien](https://…)`
(ouvert dans un nouvel onglet, `rel="noopener"`, `http(s)` seulement) ; rendu par la toile (`annotations.ts` : le retour à
la ligne apprend les jetons, `annotation.tsx` : `tspan` par style) ; l'éditeur en place reste un `textarea` ; un bouton
« gras » dans la barre contextuelle entoure la sélection du champ. Un texte qui ne parse pas s'affiche brut. Test Node
du parseur (pur), Chromium (gras rendu, lien cliquable, mutation : `<script>` reste du texte).

### Lot 16 — Le bloc de code (Intent 1.6.0) — prototype validé le 2026-10-14

**En une phrase** : coller sur le diagramme un bout de configuration ou de code, lisible, coloré si on le veut,
copiable, et ne jamais enregistrer un mot de passe sans l'avoir vu. Prototype : `.impeccable/prototype-lot-16/` (README :
décisions, contrat, règle de la molette, sources, licences), validé par Orhan (« C'est très bon, on code ça maintenant »). Passé avant le lot 4 bis, codé dans un
worktree en parallèle du lot 8 et fusionné après lui ; versions du contrat : lot 16 = `Intent` 1.6.0, lot 4 bis = 1.7.0,
lot 9 = 1.8.0 (une mineure par lot livré).

**Décisions d'Orhan (2026-10-14), appliquées telles quelles**

- Cinquième sorte d'annotation `code`, mêmes règles que les autres (libre ou attachée, connecteurs, presse-papiers du
  lot 3, annulable, journal, orphelines, recherche).
- **Contrat `Intent` 1.5.0 → 1.6.0, additif** : `CodeContent` (`kind: "code"`, `text` 1 à 20 000 caractères,
  tabulations → 4 espaces et CRLF → LF normalisés par la page, refus d'une tabulation ou d'un CR ; `language` ∈ `plain |
  python | bash | json | yaml | cisco_ios | fortios` ; `title` 0-80 ; `highlight` booléen ; `line_numbers` booléen ;
  `font` ∈ `jetbrains_mono | ibm_plex_mono | source_code_pro | cascadia_mono`), **hauteur de boîte libre** (`h` comme
  les autres annotations, pas de repli : `folded` / `fold_lines` n'existent pas), défauts dans
  `DEFAULT_ANNOTATION_STYLE`, `upgraded()` relit 1.5.x sans changement, schéma JSON et `CONTRAT.md` régénérés, motifs dans
  `contracts/README.md` § Décisions. La position de défilement n'est jamais dans le contrat (état de vue). Le journal et
  `journal_words.py` / catalogues de recherche connaissent la sorte `code` (faits du Journal en mots, sujet nommé par
  son titre).
- **Coloration par Prism 1.30.0** (MIT ; dépendance nouvelle **décidée**, version exacte épinglée ; `Prism.tokenize`,
  jamais de DOM ni de `highlightAll`, `manual: true`) ; grammaires Python, Bash, JSON, YAML officielles ; **Cisco IOS /
  NX-OS = grammaire Prism du plugin Obsidian `blakebratcher/obsidian-cisco-syntax` 0.2.0, MIT, reprise avec sa licence**
  et la règle du prototype qui corrige les noms d'hôte coloriés à moitié ; **FortiOS = la grammaire écrite dans le
  prototype** ; Junos plus tard. Jetons rangés en familles, dessinés en `tspan` à classes (`tk-…`), couleurs en jetons
  CSS dans les deux thèmes (contraste ≥ 4,5:1, test). **Coloration au choix par bloc** (`highlight`). Corrige le défaut
  vu : la variable d'une boucle Bash (`for hote in`) colorée comme un mot-clé.
- **Polices** : quatre à chasse fixe, OFL, embarquées (JetBrains Mono déjà là ; IBM Plex Mono, Source Code Pro, Cascadia
  Mono depuis `@fontsource` 5.3.0, woff2 latin + latin étendu, regular), servies par le backend comme les polices
  existantes (`font-src 'self'`), `@font-face` avec `unicode-range` : chargées seulement si un bloc les affiche ; chasse
  mesurée par police (`em` exact, Cascadia 0,590) pour couper les lignes ; pas de police du système ; le volet ne
  montre pas le poids des fichiers.
- **Hauteur libre, le code défile dans la boîte** (« une très grosse configuration, je ne veux peut-être pas l'afficher
  en entier ») : huit poignées, aimant à la grille ; seules les lignes visibles sont dessinées ; bouton « ajuster la
  hauteur au contenu » (borné à 60 lignes, absent si inutile) ; pied « lignes 34-58 sur 120 », « n plus bas » ; barre de
  défilement fine visible au survol ou à la sélection, pouce glissable, clic sur la piste = une page ; Page préc. /
  Page suiv. / Origine / Fin sur le bloc sélectionné ; double-clic = édition qui s'ouvre là où on lisait. **Règle de la
  molette** : sur un bloc **sélectionné seul**, la molette fait défiler le code ; ailleurs (bloc non sélectionné,
  sélection multiple, toile) elle zoome la toile (D2) ; Ctrl + molette zoome toujours ; en butée, rien ne passe à la
  toile ; pendant l'édition, le champ défile de lui-même. La fiche montre le code entier.
- **Édition** : `textarea` à chasse fixe avec gouttière de numéros, Ctrl+Entrée enregistre, Échap annule, Tab = 4 espaces.
- **Collage** : un texte de code collé (au moins trois lignes et un langage reconnu par la détection du prototype)
  devient un bloc de code avec son langage ; sinon une note ; Ctrl+Z annule. Détection de langage aussi proposée dans
  le volet « langage ».
- **Secrets** : avant tout enregistrement (création, édition, collage), la page repère les motifs du prototype et
  avertit : liste par ligne et nature, point rouge dans la gouttière, clic qui sélectionne la valeur ; « Retirer ces
  valeurs » (→ `<removed>`), « Garder tel quel » (une alerte reste sur le bloc et dans la fiche), « Modifier le texte ».
  Module pur, testé, aucun envoi ailleurs.
- **Barre contextuelle** (entrées d'un bloc de code) : teinte, langage, police, coloration, numéros, ajuster la hauteur,
  taille, plan, verrou, dupliquer, supprimer ; **copier** dans l'en-tête du bloc et dans la fiche (pas dans la barre).
  Fiche : titre éditable, code entier coloré, section « Affichage ». Insertion depuis la barre d'outils haute (bloc
  « Insérer ») et le menu contextuel du fond.
- Recherche : le contenu d'un bloc est cherchable (« vlan 20 »).
- `/view` (gelée) : liste les blocs de code dans l'onglet Intentions comme les autres annotations, sans les dessiner ;
  `ld intent` les imprime.

**Fait le 2026-10-14** (agent Opus, worktree isolé, en parallèle du lot 8) : tout ce qui précède. **Contrat** 1.6.0
(`contracts/src/ld_contracts/intent/annotations.py` : `CodeContent`, `CodeLanguage`, `CodeFont` ; refus par le type :
`string_too_long`, `string_pattern_mismatch` pour une tabulation ou un CR, `enum`, `bool_type`, `extra_forbidden`) ;
**backend** : rien à changer à l'API (le contenu discriminé du contrat suffit), `journal_replay.py` (nom = titre,
jamais le texte ; « bloc de code sans titre »), `journal_words.py` (« bloc de code », « code block »), `cli.py` (`ld
intent` : langage, lignes, titre, jamais le texte). **Pur** (`engine/src/app/code/`, `LDApp.code`) : `geometry.ts`
(boîte, fenêtre de lignes, barre de défilement, molette en lignes entières avec reste, touches, ajuster), `languages.ts`
(énumération, normalisation, détection, « collé = bloc ? »), `tokens.ts` (Prism → onze familles, noms d'hôte entiers,
`<removed>`, coupure `›`), `secrets.ts` (motifs, nature, retrait, aperçu en points, marquage `secret` d'une valeur
gardée quelle que soit la grammaire), `prism.ts` (ordre de chargement écrit : `manual`, cœur, global, grammaires),
`fortios.ts`, `view.ts` (défilement, « copié », brouillon : un petit magasin à part, faire défiler un bloc ne
reconstruit pas la toile). **React** : `app/canvas/code.tsx` (dessin SVG, seules les lignes visibles, molette en
écouteur natif non passif arrêté avant React Flow, Ctrl + molette laissé au zoom), `code-edit.tsx`, `code-warn.tsx`,
`code-draft.tsx` (le brouillon dans le plan par `ViewportPortal`), `state/code-commands.ts` (insérer, coller, créer,
enregistrer, copier, retirer, régler, ajuster), `state/code-bar.ts` (entrées de la barre, pures), `components/
CodeVolets.tsx` (polices, langages avec suggestion), `cards/CodeCard.tsx`, `styles/code.css`, `fonts.css`.
**Points d'insertion dans des fichiers partagés avec le lot 8** (une à trois lignes chacun) : `floating.ts` (types
`Face` / `Volet` / `IconName` étendus, une ligne qui délègue à `code-bar.ts`), `FloatingBar.tsx` (une ligne
d'exécution, une classe `named`), `FloatingVolet.tsx` (une ligne : les volets du code). `Flow.tsx`, `ContextMenu.tsx`,
`prefs.ts` : inchangés (le brouillon est un enfant de `Flow` posé par `Canvas.tsx`, le menu exécute déjà `insert:*`).
**Tests** : contrats 637 ; backend : CLI, API (défauts, 422 sans écho), journal (nom, recherche) ; Node
`backend/tests/js/code.test.js` (9 tests : familles, coupure, normalisation et détection, secrets, géométrie, barre,
contraste des deux thèmes, Journal, recherche) ; Chromium `backend/tests/test_app_code.py` (insérer puis écrire, coller
une configuration avec secrets → avertissement → ligne qui sélectionne la valeur → retirer, Ctrl+Z, molette sur le bloc
sélectionné qui défile sans zoomer, Page suiv. / Origine, coloration coupée puis rendue, police changée et son fichier
chargé à ce moment seulement, redimensionner sur la grille, molette sur un bloc non sélectionné qui zoome, double-clic
qui s'ouvre à la ligne lue, Échap qui n'écrit rien, Ctrl+Entrée, copier). **Mutations** : 25 attrapées sur 26
(`.impeccable/planche-lot-16/scripts/mutations_lot16.py`, 21 sous Node, 5 dans Chromium) ; la survivante est
équivalente (« nombre collé à une lettre » : aucune grammaire du lot ne coupe un nombre collé à une lettre, la règle
reste en défense). Captures : `.impeccable/planche-lot-16/` (1 à 7, script `scripts/capture_lot16.py`).
**Écarts, décisions prises seul** : (1) un nombre précédé d'un tiret seul après une espace reste un nombre (`= -9.0` :
la règle du prototype le décolorait) ; (2) une valeur sensible gardée est marquée `secret` (rouge souligné) quelle que
soit la grammaire, pas seulement en Cisco / FortiOS ; (3) une insertion ouvre un brouillon vide (rien n'est créé avant
Ctrl+Entrée ; le langage est alors proposé par la détection) ; (4) un champ d'écriture démonté avec une valeur sensible
non vue n'enregistre rien (la règle du lot 13, « un champ qui disparaît enregistre », cède devant A10) ; (5) la recherche
lit aussi le texte des notes (section « notes et code ») ; (6) le panneau ne s'élargit pas tout seul pour un bloc
(prototype : 560) : la poignée de l'application le fait ; (7) le double-clic sur l'en-tête ouvre l'écriture comme
ailleurs (le titre s'écrit dans la fiche) ; (8) le texte d'un bloc n'est jamais un nom : ni dans le journal, ni dans
`ld intent`, ni dans l'aide accessible (un secret gardé y vivrait). **Parqués** : le volet d'une barre posée au-dessus
d'un bloc très haut peut couvrir le bloc quand la place manque au-dessus (placement du lot 4, à reprendre avec le lot 4
bis) ; un collage de plus de 20 000 caractères est refusé et le dit (pas de découpe) ; Junos ; les graisses (le regular
seul est embarqué, le gras se synthétise).

**Fusion sur `main` le 2026-10-15**, après le lot 8 : conflits mécaniques (exports `LDApp`, feuilles importées,
catalogues `shell`, volet) résolus en gardant les deux lots. Deux corrections : (1) **le redimensionnement d'un bloc de
code suit la règle du lot 8** (repères, puis la grille seulement si l'aimant est mis, Ctrl = libre) au lieu d'un
arrondi à 20 imposé à la relâche, qui faisait sauter la boîte alignée et ignorait la préférence ; les tailles minimales
du bloc restent (`boundedBox`) ; le parcours Chromium allume l'aimant avant de vérifier la grille ; (2) deux parcours
de `test_app.py` comptaient dix boutons dans la barre d'outils, onze avec « bloc de code ». Suite complète verte après
reconstruction.

### Déjà planifiés, inchangés, après ces lots (docs/10 §8)

Épingles d'étiquettes et styles de câbles ; masque par règle enregistré ; câbles déclarés. Puis la revue indépendante de
`docs/10` complet. Parqués et le restent : rotation, polygones, calques par audience, plusieurs ancres par côté,
connecteur à segments libres, présence en temps réel, tactile.

## 7. Ordre recommandé

| Ordre | Lot | Priorité | Taille | Dépend de | Modèle |
|---|---|---|---|---|---|
| 1 | 5 Lisibilité des cartes | P0 | S | — | Sonnet ou Opus |
| 2 | 1 Poignées, ancres, survol | P0 | M | — | Opus |
| 3 | 2 Sélection mixte et clavier | P0 | L | 1 | Opus |
| 4 | 3 Presse-papiers | P0 | M | 2 | Opus |
| 5 | 4 Barre contextuelle | P0 | L | 1, 2 | Opus |
| 6 | 6 Arrangements | P0 | M | 2 | Opus |
| 7 | 7 Zoom, raccourcis, présentation | P1 | S | 2 | Sonnet ou Opus |
| 8 | 8 Guides | P1 | M | 1, 2 | Opus |
| 9 | 9 Ordre et verrou (Intent 1.6.0) | P1 | M | 4 | Opus + revue |
| 10 | 10 Styles | P1 | S | 4 | Sonnet ou Opus |
| 11 | 13 Performance | P1 | M | 2 | Opus |
| 12 | 11 Export (a puis b) | P1 | S + L | — | Opus |
| 13 | 12 Multi-utilisateur | P1 | M | — | Opus + revue |
| 14 | 14 Passe visuelle | P2 | M | 1 à 8 | Opus |
| 15 | 15 Texte riche | P2 | S | 4 | Sonnet ou Opus |

**Ordre révisé le 2026-10-14** (Orhan, après le lot 4) : lots 5, 1, 2, 3, 4 livrés ; **lot 6 parqué** (voir sa section ;
« en grille » passe au lot 8) ; la suite est **13 → 8 → 7**, parce que le placement se fait une fois à la main et doit
être rapide sur une grosse infrastructure : la performance d'abord (0,7 s par sélection, 1,2 s par flèche, 1,5 s par
collage à 500 équipements), puis les guides d'alignement (avec un prototype du rendu des repères avant le code), puis la
navigation. Les lots 9 à 12, 14 et 15 suivent dans l'ordre du tableau.

Les lots 11 et 12 n'ont pas de dépendance : ils peuvent partir en parallèle des lots 2 à 4 sur une branche à part,
à condition de ne pas toucher `Flow.tsx` (lot 11 a) ou de le toucher en dernier (lot 12, fusion). Les lots 1 à 4 sont
**séquentiels** : ils réécrivent la même sélection et la même toile.

## 8. Ce qui reste ouvert après ce document

- Les douze décisions de §5.
- L'échelle d'affichage partagée (D4, option), à revoir après le lot 5 sur capture.
- La tolérance de la jauge pour React Flow : si le lot 13 ne tient pas les cibles, le pari « React Flow pour
  l'application » se rediscute (la toile TypeScript de `/view` tient 500 équipements).
- Une identité réelle des utilisateurs (préférences côté serveur, présence, droits) : hors de ce document.

## 9. Annexes consignées

- §9.1 `docs/revues/2026-10-13-inventaire-ui-commandes.md` : l'inventaire des commandes, du clavier, de la souris, de
  la persistance, et des absences vérifiées par grep.
- §9.2 `docs/revues/2026-10-13-inventaire-ui-toile.md` : l'inventaire des tailles, des poignées, des ancres, des types
  de nœuds, du rendu et de la performance.
- §9.3 `docs/revues/2026-10-13-benchmark-editeurs.md` : le benchmark des sept éditeurs et de l'outil réseau, avec
  ses sources (une fiche par produit, douze points chacune, puis la synthèse et le détail de React Flow 12).
