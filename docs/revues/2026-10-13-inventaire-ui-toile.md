# Inventaire géométrie, tailles et manipulation de la toile (2026-10-13)

Rapport d'un agent de lecture, consigné tel que rendu, pour `docs/11-audit-ui-edition-et-plan.md` §9.2. Chemins relatifs
à `engine/src/`. Fichiers principaux : `canvas/card.ts`, `canvas/geometry.ts`, `canvas/groups.ts`, `canvas/annotations.ts`,
`canvas/connectors.ts`, `canvas/layout.ts`, `canvas/align.ts`, `app/canvas/Flow.tsx`, `nodes.tsx`, `anchors.tsx`, `snap.ts`,
`annotation.tsx`, `connector.tsx`, `table.tsx`, `edges.tsx`, `chips.tsx`, `toile.ts`, `opening.ts`, `app/styles/canvas.css`,
`app/styles/flow.css`.

## 1. Tailles et constantes

### Carte d'équipement (`canvas/card.ts`)
- Hauteur fixe `CARD_H = 80`, multiple de la grille de 20 (card.ts:30).
- Largeur naturelle : rail + marges + icône + gap + texte, bornée entre `MIN_W = 168` et `MAX_W = 360` (card.ts:33, 62, 89-92).
- Largeur commune de la run (`uniformWidth`) : `ceil(max(168, …largeurs) / 40) * 40`, `WIDTH_STEP = 40` (card.ts:31, 102-104), de 200 à 360 ; calculée dans `model.ts:521-524`, fantômes compris, stubs exclus.
- **Écart** : `model.ts:523` mesure la largeur avec le rôle HA et le stack (`cardExtrasOf`) ; `Flow.tsx:120` dessine avec `{role:null, stack:null}`. La largeur réservée peut dépasser ce qui est écrit.
- Polices : nom 15 px (`LABEL_PX`), rôle 10, stack 11 (card.ts:32). `.node-label` en `700 15px var(--mono)`, interlettrage 0,02 em (canvas.css:61). Largeur du texte estimée à 0,62 em par caractère, jamais mesurée (card.ts:35, 55).
- Nom : au-delà de `LABEL_MAX = 22`, raccourci en 11 + « … » + 10, puis capitales (card.ts:29, 58-60).
- `RX = 12`, `RAIL = 6`, `PAD = 12`, `GAP = 12`, `PAD_RIGHT = 16` (card.ts:33).
- Icône : grille 32 × 32 à l'échelle 1,25, **40 px** (card.ts:33-34 ; icons.ts:14), centrée (card.ts:83).
- Nom à y = 5.5, ou −4 avec une sous-ligne (card.ts:84) ; Flow passe toujours `null` : la sous-ligne n'existe jamais.

### Voisin inconnu (stub)
- Disque `STUB_R = 8`, 16 × 16 (card.ts:28 ; nodes.tsx:76). Nom dessous à y = 22, `500 10.5px var(--sans)` (nodes.tsx:82 ; canvas.css:62).

### Cadre de groupe (`canvas/groups.ts`)
- Défaut (groups.ts:137-140) : `padding 24`, `radius 16`, `stroke_width 2` `dashed`, `fill_opacity 8`, étiquette 12 px semibold. Bornes (groups.ts:136) : padding 0-300, radius 0-80, trait 0-8, étiquette 8-64.
- Boîte des cartes membres plus le padding ; ellipse : boîte × √2 ; arrondis (groups.ts:158-172). Marge de l'étiquette `max(8, round(label_size*0.6))` (groups.ts:178).

### Cadre de cluster HA
- `HULL_PAD = 24` plus la demi-largeur et la demi-hauteur de la plus grande carte, 6 de plus en haut (geometry.ts:209, 251-255) ; Flow.tsx:134 ajoute `PILL_H` (20) en haut ; coins `rx = 14` ; étiquette 14 px à (14, 20) (nodes.tsx:94-95 ; canvas.css:107).

### Annotations (`canvas/annotations.ts`)
- `DEFAULT_SIZE` (annotations.ts:34) : note 220×80, forme 200×120, tableau 160×52, image 320×240. Bornes : taille 20-4000, texte 8-64 (annotations.ts:21). Cellule 80 × 26, `PAD = 8` (annotations.ts:35).
- Image insérée à sa taille naturelle, largeur ≤ 600, minimum 20 (store.tsx:362-365).
- Insertion : coin haut gauche aimanté par `snap = round(v/GRID)*GRID` (store.tsx:246-247) ; la barre passe `viewCenter - (100, 40)` (Toolbar.tsx:57) ; un connecteur inséré est horizontal, `DEFAULT_LENGTH = 160` centré (store.tsx:416 ; connectors.ts:241) ; doublon décalé de +GRID (store.tsx:349) ; « connecter » depuis le menu crée un bout libre à `plan.x + 160` (ContextMenu.tsx:78, 91, 129).

### Connecteurs (`canvas/connectors.ts`)
- `STUB = 24` (connectors.ts:250). Bornes (connectors.ts:236) : trait 1-8, opacité 10-100, texte 8-64, courbure ±2000. Défaut : trait 2 plein ; pointe en flèche à la fin, aucune au début (connectors.ts:239-240). Pointe `7 + 2.5*stroke_width` (connectors.ts:390).
- Poignées (connector.tsx:29) : `HANDLE_R = 7`, courbure rayon 6, zone `HIT = 16`, le tout × 1/zoom.

### Placement (`canvas/layout.ts`)
- `IDEAL = 220`, `REACH = 660` (layout.ts:21-23). Carte par défaut 200 × 80 ; `scene.ts:64` passe `{w: model.cardWidth, h: CARD_H}`.
- Séparation minimale centre à centre : carte + `GAP_X 60` / `GAP_Y 40` (layout.ts:24-25, 170). `SHELF_GAP = 50` ; rangée des isolés 140 sous le graphe (layout.ts:26, 182). `HEAT 1.5`, `EXTEND_HEAT 0.5` (layout.ts:27-28). Itérations : 300 jusqu'à 600 nœuds, 150 jusqu'à 1500, 80 au-delà (layout.ts:31-34). Centres entiers (layout.ts:206). **Aucune grille dans le placement.**

### Zoom (`Flow.tsx:55` ; `opening.ts:329-330` ; `toile.ts:97`)

| Constante | Valeur | Fichier:ligne |
|---|---|---|
| `MIN_ZOOM` | 0.05 | Flow.tsx:55 |
| `MAX_ZOOM` | 6 | Flow.tsx:55 |
| `ZOOM_FAR` | < 0.6 | Flow.tsx:55 |
| `ZOOM_NEAR` | ≥ 1.2 | Flow.tsx:55 |
| `DRAG_THRESHOLD` | 4 | Flow.tsx:55 |
| `MOVE_MS` | 220 | Flow.tsx:55 |
| `READ_ZOOM` | 0.67 | opening.ts:329 |
| `FIT_MARGIN` | 70 | opening.ts:330 |
| `FIT_MAX_ZOOM` | 1.6 | opening.ts:330 |
| `REVEAL_MIN_ZOOM` | 0.8 | toile.ts:97 |

- Ouverture (opening.ts:370-378) : si tout tient à ≥ 0,67, cadrer tout ; sinon 0,67 sur ce qui compte, ou sur l'équipement le plus proche du barycentre.
- `zoom-far` (Flow.tsx:556 ; canvas.css:30-32) : masque les noms de port, les étiquettes de faisceau, rôle et stack, les pastilles de vitesse et les pastilles de carte sauf `tone-danger`. `zoom-near` : posée (Flow.tsx:556), **aucune règle CSS** dans `app/styles/`.

### Grille et aimantation
- `GRID = 20` (Flow.tsx:58) ; `BackgroundVariant.Lines`, `gap = 20`, si `prefs.grid` (Flow.tsx:572) ; `snapToGrid={prefs.snap}`, `snapGrid=[20,20]` (Flow.tsx:571) ; défaut `grid: false`, `snap: false` (prefs.ts:18).
- React Flow aimante le **coin haut gauche** (xyflow system index.mjs:2172-2178) ; en glissé multiple, un seul décalage calculé sur le premier élément (index.mjs:2118-2131). Largeur multiple de 40 et hauteur 80 : un coin aimanté met aussi le centre sur la grille ; pour un stub (16 × 16), le centre tombe à +8, hors grille.
- Flèches : pas de `GRID` (20), ×5 (100) avec Maj (Shell.tsx:30, 86).

## 2. Ancres et poignées

### Ancres (`anchors.tsx`, `snap.ts`)
- **Rendues seulement si `data.editable`** (nodes.tsx:67, 84, 112 ; annotation.tsx:406) ; `editable` = `mode === "diagram" && canWrite()` (store.tsx:145).
- Sur les cartes, les stubs, les cadres de groupe et les annotations ; ni sur les clusters ni sur les connecteurs.
- **Visibilité** : `visibility: hidden` au repos ; visibles au **survol** de n'importe quel nœud, ou quand la carte, l'annotation ou le cadre est **sélectionné** (canvas.css:236-237) ; aussi sur l'élément visé pendant un glissé de bout (`.anchor-dots.target`, canvas.css:237 ; anchors.tsx:175-181) ; cachées pendant une édition de texte ou de cellule et pendant un redimensionnement (annotation.tsx:406).
- Quatre points n/e/s/w au milieu des côtés (connectors.ts:291-296 ; anchors.tsx:160-161). `ANCHOR_R = 5`, zone `ANCHOR_HIT = 11`, × 1/zoom, constantes à l'écran (anchors.tsx:134-136, 164-165) ; ancre accrochée rayon 7 (anchors.tsx:178) ; curseur `crosshair` (canvas.css:238).
- **Création d'un connecteur** : appui gauche sur une ancre → `drawStart({kind, ref, side})` (anchors.tsx:145-151) ; brouillon pointillé (`DraftLayer`, Flow.tsx:585-594 ; canvas.css:243-245) ; `pickEnd` à chaque mouvement, tolérance `SNAP_PX = 14` px écran (Flow.tsx:56, 325-330) ; priorité : ancre à portée → `side` ; sinon élément sous le pointeur → `side:"auto"` ; sinon libre ; candidats carte, puis annotation, puis groupe, le plus petit à rang égal (snap.ts:199-216) ; création au relâchement si le pointeur a bougé de plus de 6 unités (Flow.tsx:339-341), par `onConnectorCreate`.
- Les poignées natives de React Flow ne servent pas : `nodesConnectable={false}`, `Handle isConnectable={false}` (Flow.tsx:568 ; nodes.tsx:34-39).

### Poignées de redimensionnement des annotations (annotation.tsx)
- **8 poignées** nw, n, ne, e, se, s, sw, w (annotation.tsx:273-274). Carré `HANDLE = 8` en unités du plan, **non compensé par le zoom** (annotation.tsx:272, 317).
- Visibles si `selected && editable && !locked && !édition` (annotation.tsx:405). **Maj garde le rapport, seulement sur les coins** (annotation.tsx:286, 306). Bornes 20 / 4000 (annotation.tsx:272, 287). Écriture au relâchement si la boîte a changé ; boîte locale (`pending`) jusqu'à la réponse (annotation.tsx:386-391 ; Flow.tsx:309-318).

### Poignées de connecteur (connector.tsx)
- Deux bouts, plus la courbure au milieu si `bendable` (connector.tsx:177-183). Visibles au survol, sélectionné (`.shown`) ou pendant un geste (`.live`) (canvas.css:228-229), `editable && !locked` (connector.tsx:115, 177).
- Bout : seuil 3 px, accrochage par `pick` (connector.tsx:138, 151-153). Courbure : un tracé droit devient courbe, ±2000 (connector.tsx:139, 154-157). Corps : seulement sélectionné et avec un bout libre ; seuls les bouts libres bougent (connector.tsx:127-128, 140-142). Double-clic : étiquette, 80 caractères (connector.tsx:69-70, 172).

### Frontières de tableau (table.tsx)
- Barres `BAR = 6` en unités du plan (table.tsx:193), visibles si sélectionnée et éditable (table.tsx:313-314) ; piste ≥ `MIN_TRACK = 20` (table.ts:9, 140) ; clic = cellule (Maj étend), double-clic = édition, Tab = suivante (table.tsx:252-291).

## 3. Types de nœuds React Flow

Types : `card`, `stub`, `cluster`, `frame`, `annotation`, `connector` (nodes.tsx:117 ; Flow.tsx:52). Réglages globaux (Flow.tsx:567-571) : `nodesDraggable={!control}`, `elevateNodesOnSelect={false}`, `elevateEdgesOnSelect={false}`, `deleteKeyCode={null}`, `zoomOnDoubleClick={false}`.

| Type | Glissable | Sélectionnable | Redim. | Connectable | zIndex |
|---|---|---|---|---|---|
| card / stub | oui hors Contrôle, **même sans droit d'écriture** (Flow.tsx:569) | oui | **non** | non | 0 (Flow.tsx:116, 124) |
| cluster | `false` (Flow.tsx:136) | oui | non | non | `-1`, sous les arêtes |
| frame (groupe) | `!control` (Flow.tsx:176) ; entraîne ses membres (Flow.tsx:457-491) | `!control` | non (calculée) | non | `-3 - (n - i)`, le plus grand le plus bas (Flow.tsx:180-181) |
| annotation | `editable && !locked` (Flow.tsx:201) | `!control` | oui, 8 poignées | non | `Z_BACK = -40` ou `Z_FRONT = 20` (Flow.tsx:53, 201) |
| connector | `false` (Flow.tsx:230) | `!control` | non (poignées propres) | non | `-41` ou `21` (Flow.tsx:230) |

- **Parenté** : une annotation attachée est un enfant React Flow : à un équipement, `parentId = hostname`, position `(w/2 + a.x, h/2 + a.y)` ; à un groupe, `parentId = "group:<id>"`, position `(a.x, a.y)` (Flow.tsx:199). Aucun `extent` (grep) : l'enfant peut sortir de son parent. Les cartes ne sont pas enfants des cadres ni des clusters. Ordre du tableau : frames, clusters, cartes, annotations, connecteurs (Flow.tsx:236).
- **z-order** : React Flow (system 0.0.83, index.mjs:1789-1794) donne à un enfant `z = parentZ + 1` si `parentZ >= childZ`. Une annotation « plan dessous » (−40) attachée à une carte (z 0) passe donc à **z = 1, au-dessus de la carte** ; attachée à un cadre, juste au-dessus de son cadre. Le plan « dessous » ne vaut que pour les annotations libres.
- Les éditeurs en place (note, cellule) et la liste de stack forcent `z-index: 1000` (canvas.css:175, 213, 263).

## 4. Sélection, glissé, alignement

- Maj sert à la fois de touche multi-sélection et de touche du rectangle, `SelectionMode.Partial` (Flow.tsx:567-568).
- **Résolution** (`syncSelection`, Flow.tsx:390-409) : équipements > annotation > connecteur > cadre > cluster > arête. Avec au moins 2 équipements, `selectHosts` ne garde **que des équipements** (toile.ts:182-188). Le rectangle n'ajoute que des équipements (`isHost`) (Flow.tsx:414-424).
- **Une sélection ne peut donc pas être mixte durablement** : multiple = cartes et stubs ; sinon un seul élément. Au rebuild suivant, `selected` est recalculé depuis la toile, et une annotation ou un cadre ajouté par Maj+clic perd sa sélection.
- **Glissé** (Flow.tsx:482-510) : React Flow déplace tous les nœuds `selected` ; `onNodeDragStop` traite les annotations (patch de l'écart relatif) et les équipements (`moveTo` du centre arrondi, puis `dropped`). Un glissé mixte est géré s'il arrive, mais la sélection l'empêche. Glisser un cadre déplace ses membres présents, un seul paquet (Flow.tsx:460-491) ; glisser une carte entraîne ses annotations enfants.
- **Flèches** : équipements non fantômes seulement (toile.ts:247-250, 259-269), `NUDGE_MS = 400` (toile.ts:96).
- **Alignement** (`align.ts`, toile.ts:236-244) : sur `state.selected`, donc les **équipements**, par leurs **centres** ; horizontal = même y, vertical = même x (align.ts:306-315), ≥ 2 ; répartition ≥ 3, tri le long de l'axe, ex æquo par le nom (align.ts:316-328) ; positions entières, sans aimantation.

## 5. Rendu d'une carte d'équipement

- SVG `className="node " + classes`, `viewBox` centré, `overflow=visible` (nodes.tsx:59). Classes (Flow.tsx:112) : `kind-*`, `type-*`, `hue-*`, `collection-*`, `ha-member ha-<lead|follow> ha-state-*`, `diff-*`, `pinned`, `selected`, `related`, `match`.
- Dessiné (nodes.tsx:60-67) : `node-ring` en cas de diff (+4) ; `node-shape` (rect `rx 12`) ; `node-rail` (bande gauche de 6, découpée aux coins, card.ts:68-73) ; `TypeGlyph` en trois couches `icon-body`, `icon-shade`, `icon-mark` (nodes.tsx:42-49) ; `node-label` ; `node-pin` à (−w/2−9, −h/2−9) si `.pinned` (canvas.css:64-66) ; `Chips` ; `Anchors`.
- **Teinte** : `hueOfNode` : couleur de l'équipement, sinon de son type, sinon le défaut (switch bleu, router orange, firewall violet, LB teal, WLC vert, sinon slate ; hues.ts:14-29). `hue-*` pose `--type` qui colore le rail et le corps de l'icône (canvas.css:35-50, 53) ; fond `var(--node)`.
- **Pastilles** (chips.tsx:17-48 ; pill.ts:130 ; pill.tsx:106-120 ; canvas.css:159-161) : rangée à cheval sur le bord haut, alignée à droite, retrait 16, écart 6 ; capsule `PILL_H = 20`, `600 11px mono` capitales, détourée (`pill-knock`) ; HA « ACTIF » / « PASSIF » / « DOWN » (shell.json:343-345, `haBadge` model.ts:32-38) ; stack : icône `Layers` + nombre, `tone-neutral`, cliquable, ouvre `StackList` à taille d'écran (`--unzoom`) ; point de gravité rayon 5, masqué en Diagramme (canvas.css:271).
- **Noms de port** : sur l'arête (edges.tsx:227-229), à `t = min(0.45, (reach + PORT_GAP 16) / longueur)`, `reach` = distance du centre au bord (card.ts:113-117), à défaut `PORT_CLEAR = 62` (geometry.ts:210, 243) ; ancrage `start` / `end` selon le côté (geometry.ts:244-246) ; `9.5px mono` ; visibles avec `.show-ports` (câbles non `crowded`, `pairCount ≤ 2`) ou sur un câble sélectionné (canvas.css:28-29).
- **Redimensionnement par l'utilisateur : NON.** Aucune poignée sur `CardNode` ; taille par `cardPlan(name, …, model.cardWidth)` (Flow.tsx:120), `CARD_H` constant. Pour le permettre : `card.ts:77-110`, `Flow.tsx:120-125`, `nodes.tsx:51-73`, `model.ts:521-524`, `scene.ts:64` et `layout.ts:170` (une seule boîte par run), et un champ de taille dans `Intent`, qui n'existe pas.

## 6. Rendu des arêtes

- D'un **centre de carte à l'autre**, sous les cartes ; handle invisible centré (nodes.tsx:34-39 ; flow.css:23).
- **Câble** : quadratique `M…Q…` (geometry.ts:235-247) ; `fanOffset = (i - (n-1)/2) * min(14, 110/n)`, contrôle décalé de `2*offset` (geometry.ts:209, 218-221, 239) ; un câble seul est droit ; parallèles en éventail ; boucle au-dessus pour un câble vers soi-même, portée `46 + 12*i` (geometry.ts:225-229).
- Couches (edges.tsx:221-229) : `diff-halo`, `link-halo` (heartbeat), `link-line`, `link-hit` (12 px, canvas.css:6), `link-mark` (r 4.5), `port-label`.
- **Faisceau** (edges.tsx:235-244 ; geometry.ts:264-269) : `beam-band` invisible (canvas.css:84), largeur `18 + éventail` ; `beam-hit` `band + 16`. **Étiquette** (`beamLabel`) : PO10, MLAG n, PEER-LINK (pill.ts:162-167) ; cachée au repos, montrée par `.show-beams` ou un `reveal-*` (reveal.ts:51-63 ; canvas.css:88-95) ; cliquable quand montrée (canvas.css:94) ; placée par `tags.ts` (`MIDDLE`, `NEAR_Q`, évitement, `GAP 3`, poids 4 ; tags.ts:24-32).
- **Vitesse** : pastille par groupe, `selectable: false`, `pointer-events: none` ; couche « vitesses » ou câble sélectionné / éclairé (Flow.tsx:153-161 ; canvas.css:99-101).
- **Sélection** : `.link.selected` trait 3.5 avec ombre d'accent (canvas.css:12-13) ; survol 3 ; `.has-selection` estompe le reste (0.22 ; 0.35 cadres et annotations) (canvas.css:77-78, 116, 226, 255) ; `edgesFocusable={false}` (Flow.tsx:570).

## 7. Module `toile.ts`

- Compteur `version` et `listeners` ; `bump()` incrémente et notifie (toile.ts:110-112) ; `subscribe` (toile.ts:305) ; Flow lit `useSyncExternalStore(toile.subscribe, toile.version)` (Flow.tsx:274).
- Commandes (toile.ts:42-93, 303-317) : `scene`, `render(keepView, replace)`, `repaint`, `recolor` ; `fit`, `frame`, `open`, `viewport`, `restoreView`, `viewCenter`, `attach` ; `notable` ; `select`, `selectHosts`, `reveal` ; `moveTo`, `dropped`, `alignSelected`, `nudge`, `flush`, `restore` ; `resetPins`, `replaceAll`, `syncPins`, `syncPlaces`, `unpin` ; champs `frames` et `ends`. Pas de `center` public (`centerOn` interne, toile.ts:140-150). Filtres dans `state.filters`, `state.layers`, `state.query`, `state.control` ; la page les modifie puis appelle `render` ou `repaint`.

## 8. Performance

- **Tout reconstruit à chaque version** : `build()` dans `useMemo([toile, version, editable, language])` (Flow.tsx:280-286, et l'en-tête Flow.tsx:2-4). Toute sélection fait un `bump`. Chaque reconstruction refait `placeCableTags`, `speedGroups`, `reveal` et le chemin de chaque connecteur (Flow.tsx:140-143, 223-232).
- Seule mémoïsation : ce `useMemo`, plus la reprise de `measured` (Flow.tsx:356-360). Aucun `React.memo` dans `app/canvas` (grep).
- `ConnectorNode` s'abonne à `useStore(s => s.nodes)` : **chaque connecteur se redessine à chaque changement de n'importe quel nœud**, y compris à chaque image d'un glissé (connector.tsx:102). Le glissé d'un cadre refait un `map` sur tous les nœuds à chaque mouvement (Flow.tsx:473-479).
- Placement O(n²) par itération, itérations bornées ; commentaire « à 500 nœuds… dix secondes » avec des dictionnaires (layout.ts:31-34, 100-101).
- **Tests** : `backend/tests/test_app.py` : le seul `generate_series` utilise **60 équipements** (test_app.py:698-704) ; **aucun test à 500 équipements** pour la face React Flow ; 1203 épingles dans viewer.test.js:1334 testent l'envoi par paquets, pas le rendu.
