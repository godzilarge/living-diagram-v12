# 10 — Les intentions étendues, la couleur d'abord : conception (2026-10-07)

**Statut : cadre validé le 2026-10-06 (masque par règle, groupes et notes, câbles déclarés) ; premier incrément décidé le
2026-10-07 sur une demande d'Orhan (« un réglage pour modifier la couleur des icônes, stocké dans les intentions, visible
par tout le monde, persistant ») : la couleur. Écrit avant le code ; codé le même jour (contrat `Intent` 1.1.0, store,
API, `ld intent`, application, `/view`) ; les groupes le même jour (§5, « Go » d'Orhan) ; **les annotations le
2026-10-08** (§6, Intent 1.3.0 : notes, formes, tableaux, images ; trois décisions tranchées par Orhan le même jour,
« le plan est solide, à toi de jouer avec le code »). Les autres incréments s'ajoutent à ce document, section par section.**
En une phrase : **une intention étendue est une décision de documentation qui ne vient pas de la collecte ; la première
après l'épingle est la couleur d'un équipement ou d'un type, partagée par tout le monde et qui survit aux runs.**

Références : `docs/08` (le contrat `Intent` v1, les règles I0 à I6, le store et son journal) ; `docs/00` §3 (quatre
couches, `rendu = f(C0 ⊕ C2, C3)`) ; la carte et les icônes `engine/src/canvas/card.ts`, `icons.ts`.

---

## 0. Ce que ce document décide

1. **Une intention, jamais une préférence du navigateur.** Le thème, la grille, l'aimant, la minimap sont des réglages
   d'affichage propres à un navigateur (`prefs.ts`, `localStorage`). Une couleur sur un équipement est une décision de
   documentation : elle va dans le document d'intention de l'infrastructure, signée, datée, journalisée, et tout le monde
   la voit.
2. **Deux niveaux, une seule famille.** La **palette des types** de l'infrastructure (`type_colors` : un switch en bleu,
   un firewall en violet…) et l'**écrasement par équipement** (`device_colors`, keyé par `hostname`). Plus tard, le
   groupe (même mécanique, keyé par le groupe).
3. **Une couleur par équipement, pas une par partie.** Rail, icône, minimap, icône de la fiche lisent la même couleur
   (`--type`). Colorer l'icône sans le rail ferait deux signaux qui se contredisent.
4. **Une teinte nommée, jamais une valeur libre.** Douze teintes (`Hue`), chacune avec sa valeur sombre et sa valeur
   claire dans les jetons du moteur ; le contrat ne connaît que le nom. Un hexadécimal libre casserait le thème clair et
   le contraste du symbole en réserve de l'icône.
5. **Les défauts vivent dans le moteur, pas dans le document.** `DEFAULT_HUE` par type (`hues.ts`) ; le document ne
   porte que ce qui a été décidé. `uncolor` / `uncolor_type` reviennent au défaut en retirant l'entrée.
6. **Même règles que les épingles** : dernier écrivain gagne par clé (type ou hostname), journal, opérations jamais
   remplacement, couleur orpheline listée et jamais effacée en silence, le diff et le snapshot n'en lisent rien.
7. **`Intent` 1.0.0 → 1.1.0, additif.** Deux listes à côté de `pins`, toutes clés écrites comme avant. Un document
   1.0.0 déjà sur disque se lit en 1.1.0 avec les deux listes vides (le store l'écrit à sa prochaine écriture) ; la
   validation d'un fichier reste stricte.

---

## 1. Le contrat `Intent` 1.1.0

```
Intent
├─ intent_version   "1.1.0"
├─ infrastructure, revision, updated_at   (inchangés)
├─ pins             [Pin]                 (inchangé)
├─ type_colors      [TypeColor]  triées par `type`, uniques (sept au plus, un par type du contrat d'entrée)
└─ device_colors    [DeviceColor] triées par `hostname`, uniques (10 000 au plus, même borne que les épingles)
TypeColor    { type: DeviceType, hue: Hue, author, at }
DeviceColor  { hostname, hue: Hue, author, at }
Hue  blue | sky | indigo | violet | pink | red | orange | amber | lime | green | teal | slate
```

- `type` est l'énumération du contrat d'entrée (`switch | router | firewall | load_balancer | wireless_controller |
  server | other`) : un type inconnu est refusé.
- Refus : `not_canonical_order` / `duplicate_identity` sur chaque liste, `patch_after_update` (un patch daté après
  `updated_at`, quelle que soit la liste ; remplace `pin_after_update`), `too_long`, `extra_forbidden`, `missing`,
  valeur hors énumération.
- Défauts du moteur : switch bleu, routeur orange, firewall violet, répartiteur turquoise, contrôleur Wi-Fi vert,
  serveur et autre ardoise.

---

## 2. Les règles

### C0 — Résolution
La couleur d'un équipement = `device_colors[hostname]` sinon `type_colors[type]` sinon `DEFAULT_HUE[type]` (ardoise si
le type est absent). Un voisin inconnu n'a pas de couleur (disque gris, inchangé).

### C1 — Application
`color {hostname, hue}`, `uncolor {hostname}`, `color_type {type, hue}`, `uncolor_type {type}` : appliquées dans
l'ordre, la dernière gagne ; auteur et date de la requête sur chaque entrée écrite. Même requête que les épingles
(`POST /api/intent/patches`, 500 opérations au plus, mêmes 404 / 422).

### C2 — Orphelines
Une couleur d'équipement dont le hostname n'est pas un nœud de la run affichée (ou un fantôme) est **orpheline** : listée
dans l'onglet Intentions de `/view` et par `ld intent`, retirable, jamais effacée en silence. Une couleur de type n'est
jamais orpheline (le type existe par construction).

### C3 — Qui écrit
Un écrivain avec un nom, comme pour les épingles ; sans nom, les pastilles sont désactivées et la fiche le dit.

### C4 — Ce que personne ne lit
Ni B1, ni B3, ni le placement : la couleur n'entre ni dans le snapshot, ni dans le diff, ni dans la mémoire de placement.

---

## 3. Branchement

- **Contrat** : `contracts/src/ld_contracts/intent/` (modèles, codes, `upgraded()` pour un document 1.0.0), partie D de
  `CONTRAT.md`, `intent-v1.schema.json`, fixture `intent-skeleton.json` (deux épingles, une couleur de type, une couleur
  d'équipement).
- **Store** (`backend/intent.py`) : quatre opérations de plus, même journal ; `load` relit un 1.0.0 en 1.1.0.
- **API** : `POST /api/intent/patches` accepte les six opérations ; `GET /api/intent` sert le document.
- **CLI** : `ld intent` liste aussi les couleurs (type, équipement, orphelines).
- **Moteur** : `hues.ts` (teintes, défauts, résolution, pur) ; le modèle indexe `colorByHost`, `colorByType`,
  `orphanColors` ; chaque carte porte la classe `hue-<teinte>` qui pose `--type` ; la légende de `/view` suit la
  palette des types ; l'onglet Intentions de `/view` liste les couleurs.
- **Application** : dans la fiche d'un équipement, une rangée de douze pastilles et « défaut » ; un volet « palette des
  types » depuis le menu, la même rangée par type ; la minimap suit (`mm-<teinte>`).
- **Tests** : contrats (ordre, énumérations, aucune clé par défaut, montée de version), store (opérations, journal,
  borne, 1.0.0 relu), API (422 sur une teinte ou un type inconnus), CLI, Node (résolution, classes, onglet), Chromium
  (une pastille cliquée colore la carte et le document).

---

## 4. Hors périmètre, volontairement

Une valeur de couleur libre ; une couleur par partie de la carte ; la couleur d'un câble ou d'un faisceau ; la fiche de
`/view` (gelée : la couleur s'y voit sur la carte, se lit dans l'onglet Intentions).

---

## 5. Les groupes (2026-10-07, « Go sur le regroupement. Il faut que ce soit riche en fonctions. Ne pas brider
## l'utilisateur et surtout ergonomique. »)

En une phrase : **un groupe est une liste d'équipements et un style ; son cadre se calcule depuis ses membres, suit
leurs déplacements, se glisse d'un bloc, et tout le reste se règle librement dans la fiche.**

### 5.1 Ce qui est décidé

1. **Un groupe = des membres + un style, jamais une forme libre à coordonnées.** C'est la seule borne : une forme
   dessinée à la main casse dès qu'un membre bouge ou qu'une run en ajoute un. Tout le reste est ouvert : forme,
   teinte, remplissage, bordure, marge, étiquette (texte, position, dedans ou dehors, taille, graisse, police,
   couleur), description.
2. **Identité stable attribuée par le serveur** à la création (`g<revision>-<n>`), jamais le libellé : renommer un
   groupe ne le recrée pas ; l'adresse le désigne par `#group=<id>`.
3. **Un équipement peut être dans plusieurs groupes** ; les cadres se dessinent sous les cartes, le plus grand sous le
   plus petit (un groupe dans un groupe par simple inclusion, sans rien déclarer).
4. **Le cadre est un objet de la toile** : clic = fiche du groupe (ses membres éclairés), glissé du cadre = tous les
   membres déplacés d'un bloc (un seul paquet d'épingles, comme la sélection glissée), survol = bulle.
5. **Membres orphelins** (absents de la run) : listés dans la fiche et dans l'onglet Intentions, jamais retirés en
   silence ; le cadre se dessine avec les membres présents ; un groupe sans aucun membre présent n'est pas dessiné, il
   est dit orphelin.
6. **Toutes les clés du style sont écrites** ; le serveur complète avec les défauts à la création (`GroupStyle` par
   défaut : rectangle, coins 16, ardoise, remplissage 8 %, bordure 2 en tirets, marge 24, étiquette en haut à gauche,
   dedans, 12 px, demi-gras, sans, à la teinte) et accepte des patchs partiels au changement.
7. **Cinq opérations** : `group_create` (libellé, membres, description et style facultatifs ; répond avec l'`id`),
   `group_update` (libellé, description, membres, style, chacun facultatif), `group_add` / `group_remove` (des
   membres, sans réécrire la liste : deux personnes qui ajoutent chacune un membre ne s'écrasent pas), `group_delete`.
   Dernier écrivain gagne par groupe pour `update`, par membre pour `add` / `remove` ; journal.
8. **Ce que le serveur refuse** : un `id` inconnu (`unknown_group`, 422 : le groupe a été supprimé entre-temps, la
   page recharge le document), un groupe sans membre (retirer le dernier membre = supprimer le groupe, explicitement),
   un libellé vide ou > 80, une valeur de style hors de ses bornes ou de son énumération, plus de 1 000 groupes.

### 5.2 Le contrat `Intent` 1.2.0

```
Intent
└─ groups   [Group], triés par id, uniques ; 1 000 au plus
Group
├─ id            "g<revision>-<n>" attribué par le serveur
├─ label         texte 1..80, sans caractère de contrôle
├─ description   texte 0..500 (vide admis)
├─ members       [hostname] triés, uniques, 1..10 000
├─ style         GroupStyle, toutes clés écrites
└─ author, at    qui a créé ou modifié en dernier, quand
GroupStyle
├─ shape          rectangle | ellipse
├─ radius         0..80       (coins du rectangle)
├─ hue            Hue         (les douze teintes)
├─ fill_opacity   0..100      (%)
├─ stroke_width   0..8
├─ stroke_style   solid | dashed | dotted | none
├─ padding        0..300      (marge autour des cartes)
├─ label_position top_left | top | top_right | left | center | right | bottom_left | bottom | bottom_right
├─ label_placement inside | outside
├─ label_size     8..64       (px)
├─ label_weight   regular | semibold | bold
├─ label_font     sans | mono
└─ label_color    hue | ink
```

### 5.3 Les règles

- **G0 — Enveloppe.** La boîte des cartes des membres présents, élargie de `padding` ; rectangle aux coins `radius`,
  ou ellipse circonscrite à cette boîte. Recalculée à chaque dessin : un membre qui bouge entraîne le cadre.
- **G1 — Ordre.** Cadres sous les cartes et sous les cadres de cluster HA ; entre cadres, le plus grand dessous.
- **G2 — Glissé.** Glisser le cadre déplace chaque membre présent de la même translation ; à la relâche, un seul
  paquet d'épingles (`onPins`, cause `dragged`), sous le nom donné ; sans nom, déplacement local dit tel.
- **G3 — Sélection.** Un groupe sélectionné éclaire ses membres et les câbles entre eux ; `#group=<id>` dans l'adresse ;
  « sélectionner les membres » transforme la sélection en sélection multiple (aligner, colorer, grouper encore).
- **G4 — Orphelins.** Membre absent de la run : listé, retirable, jamais retiré en silence ; groupe sans membre
  présent : non dessiné, listé.
- **G5 — Teinte des membres.** Un groupe ne colore pas ses membres ; « appliquer la teinte aux membres » le fait, en
  envoyant les couleurs d'équipement (docs/10 §2), explicitement.
- **G6 — Qui écrit.** Un nom ; sans nom, la fiche se lit, les contrôles sont absents.

### 5.4 Branchement

- **Contrat** : `Group`, `GroupStyle`, énumérations, `groups` dans `Intent` 1.2.0, `upgraded()` relit un 1.0.x ou 1.1.x.
- **Store** : cinq opérations, identifiants `g<revision>-<n>`, refus `unknown_group`, `group_without_member`.
- **API** : mêmes routes ; `ld intent` liste les groupes et leurs orphelins.
- **Moteur** : `canvas/groups.ts` (pur : défauts, complétion du style, enveloppe, ancre de l'étiquette) ; le modèle
  indexe `groupById`, `groupsByHost`, `orphanGroups` ; la scène porte les groupes visibles ; sélection de sorte `group`.
- **Application** : nœud « cadre de groupe » dans React Flow (SVG, attributs de présentation, jamais de style en
  ligne), glissable ; `GroupCard` (libellé et description éditables, membres, orphelins, éditeur de style, actions :
  centrer, sélectionner les membres, appliquer la teinte, masquer, isoler, supprimer avec confirmation) ; depuis la
  sélection multiple : « grouper » (libellé) et « ajouter à un groupe » ; depuis la fiche d'un équipement : ses
  groupes, « ajouter à un groupe », retirer.
- **`/view`** (gelée) : l'onglet Intentions liste les groupes (membres, orphelins, supprimer) ; les cadres ne s'y
  dessinent pas pour l'instant.

### 5.5 Hors périmètre, volontairement

Réduire un groupe en un seul nœud (ses câbles agrégés) ; une forme libre ; un groupe de groupes déclaré ; un cadre
sans membre ; l'export.

## 6. Les annotations (2026-10-08, demande d'Orhan : « un panneau avec de la personnalisation comme tous les outils
## d'édition : zone de texte, formes libres, tableau, images ; donner du contexte au diagramme »)

En une phrase : **une annotation est ce que seul l'humain sait et que la collecte ne saura jamais : une note, une
forme, un tableau ou une image, posée sur la toile, libre ou attachée à un équipement ou à un groupe, signée, datée,
et qui survit aux runs.** Living Diagram livre la toile avec tous les équipements ; les annotations livrent le
contexte (plan d'adressage, contact, référence de changement, photo de baie) qu'un référentiel interne et un auditeur
attendent. Ce n'est pas Visio : peu d'objets, mais complets.

### 6.1 Ce qui est décidé (trois points tranchés par Orhan le 2026-10-08)

1. **Deux familles, deux règles.** Un **groupe** dit *qui en fait partie* : des membres, une enveloppe calculée,
   jamais une forme à coordonnées (§5, inchangé). Une **annotation** dit *ce que la donnée ignore* : rien ne peut la
   déduire, donc elle porte une position et une taille. La borne de §5 ne la concerne pas, et elle ne concerne toujours
   pas les groupes.
2. **Un ancrage.** Une annotation est **libre** (coordonnées du plan, comme une épingle), ou **attachée** à un
   équipement (position relative au centre de sa carte) ou à un groupe (relative au coin haut gauche de son cadre) :
   elle suit ce qui bouge. Une **ligne de rappel** optionnelle relie une annotation attachée à son ancre (une légende
   fléchée sans connecteur libre). « Replacer » ne touche jamais une annotation libre, et le dit.
3. **Quatre sortes, bornées.** Note (texte brut multi-ligne, 2 000 caractères, jamais du HTML, pas de Markdown) ;
   forme (rectangle, ellipse, avec une étiquette ; pas de polygone ni de courbe libre) ; tableau (lignes × colonnes de
   texte, 30 × 8, 120 caractères par cellule, rendu par la toile, pas un tableur ; **depuis 1.4.0** : largeurs de
   colonnes et hauteurs de lignes relatives, cellules fusionnées, édition en place) ; image (PNG, JPEG, WebP, **4 Mo
   au plus**, **SVG refusé** : un SVG embarque des scripts). Les images sont le dernier incrément : un magasin de
   fichiers côté serveur, une route authentifiée, la CSP ouverte à `blob:`.
   **Les lignes et les flèches ne sont plus des formes (révision du 2026-10-09, Orhan : « dans l'état actuel, elles
   ne servent à rien ; si je ne peux pas contrôler pleinement leur position et leur forme, elles ne sont pas
   utiles »)** : ce sont des **connecteurs** (§6.6), à deux bouts, chacun libre ou attaché à un équipement, un groupe
   ou une annotation.
4. **Un style complet, toutes clés écrites**, les mêmes énumérations que les groupes (teinte parmi douze, bordure,
   police sans ou mono, graisse, couleur teinte ou encre) plus l'alignement du texte et l'opacité de l'ensemble ; le
   serveur complète avec les défauts de la sorte à la création, accepte des patchs partiels ensuite.
5. **Identité stable attribuée par le serveur** : `a<revision>-<n>`, comme un groupe ; l'adresse désigne une annotation
   par `#annotation=<id>`.
6. **Orphelines** : une annotation attachée à un équipement absent de la run (ou à un groupe sans membre présent, ou
   supprimé) n'est pas dessinée, elle est listée (fiche, onglet Intentions de `/view`, `ld intent`), jamais effacée en
   silence ; elle se détache (devient libre, au dernier centre de la vue) ou se supprime.
7. **Reconnaissable comme une intention.** Devant un auditeur, la force du diagramme est que ce qui est dessiné est
   observé et daté : une annotation est signée et datée (auteur, date, journal), sa bulle et sa fiche le disent, et
   rien de ce qu'elle porte n'entre jamais dans le snapshot, le diff ou le placement mémorisé.
8. **Sans nom, lecture seule.** Créer, déplacer, redimensionner, éditer demandent un nom (comme les couleurs et les
   groupes) ; sans nom, la fiche se lit. Pas de « déplacement local » d'annotation : il n'y aurait rien à enregistrer.
9. **Ordre validé : annotations d'abord**, puis les épingles d'étiquettes et les styles de câbles (§7 à écrire), puis le
   masque par règle et les câbles déclarés.

### 6.2 Le contrat `Intent` 1.3.0, révisé en 1.4.0 (tableaux, connecteurs)

```
Intent
└─ annotations  [Annotation], triées par id, uniques ; 2 000 au plus
Annotation
├─ id        "a<revision>-<n>" attribué par le serveur
├─ anchor    { kind: free | device | group, ref: hostname | id de groupe | null }   (null si et seulement si free)
├─ x, y      entiers ±1 000 000 : coin haut gauche ; libre = plan ; device = écart au centre de la carte ;
│            group = écart au coin haut gauche du cadre
├─ w, h      entiers 20..4 000
├─ z         back | front   (sous les cadres et les cartes, ou au-dessus de tout)
├─ locked    booléen (ni glissé ni redimensionnement sur la toile ; la fiche déverrouille)
├─ leader    booléen (ligne de rappel vers l'ancre ; faux obligatoire si libre : `leader_without_anchor`)
├─ content   NoteContent | ShapeContent | TableContent | ImageContent, discriminé par `kind`
├─ style     AnnotationStyle, toutes clés écrites
└─ author, at
NoteContent  { kind: "note", text: 1..2000, retours à la ligne admis, aucun autre caractère de contrôle }
ShapeContent { kind: "shape", shape: rectangle | ellipse, label: 0..80 }
TableContent { kind: "table", header: booléen, rows: [[cellule 0..120]], 1..30 lignes, 1..8 colonnes,
               toutes les lignes de même longueur (`table_ragged`),
               widths: [poids 1..4000] | null (autant que de colonnes : `table_dims_mismatch`), heights: idem,
               merges: [{row, col, rows, cols}] triées, dans le tableau, sans chevauchement, deux cellules au moins
               (`table_merge_outside`, `table_merge_overlap`, `table_merge_trivial`) }
             (les poids se partagent la boîte au prorata : la boîte reste la mesure ; null = pistes égales ; une
              cellule couverte par une fusion garde son texte sans le montrer, séparer le rend)
ImageContent { kind: "image", asset: sha256 hexadécimal (64), alt: 0..120 }
AnnotationStyle
├─ hue            Hue (douze teintes)        ├─ text_size    8..64
├─ fill_opacity   0..100                     ├─ text_weight  regular | semibold | bold
├─ stroke_width   0..8                       ├─ text_font    sans | mono
├─ stroke_style   solid | dashed | dotted | none   ├─ text_color   hue | ink
├─ radius         0..80                      ├─ text_align   left | center | right
└─ opacity        10..100 (l'annotation entière)   └─ text_valign  top | middle | bottom
```

- Défauts par sorte (dans le contrat, `DEFAULT_ANNOTATION_STYLE`) : note ambre, fond 12 %, bordure 1 pleine, coins 8,
  texte 13 sans, encre, gauche, haut ; forme ardoise, fond 8 %, bordure 2 pleine, coins 12, étiquette 12 demi-gras
  centrée ; tableau ardoise, fond 0 %, bordure 1 pleine, coins 6, texte 12 mono, encre, gauche ; image sans fond ni
  bordure, coins 8. Taille par défaut : note 220 × 80, forme 200 × 120, tableau 80 par colonne × 26 par ligne, image
  sa taille naturelle bornée à 600 de large.
- Refus : `not_canonical_order` / `duplicate_identity` sur `annotations`, `patch_after_update`, `too_long`,
  `anchor_ref_mismatch` (libre avec référence, attachée sans), `leader_without_anchor`, `table_ragged`, bornes et
  énumérations du style, `string_pattern_mismatch` (identité, référence, asset).
- **Trois opérations** : `annotation_create` (contenu obligatoire ; ancrage, position, taille, plan, verrou, ligne de
  rappel, style facultatifs ; répond avec l'`id`), `annotation_update` (patchs partiels ; le contenu se remplace en
  entier, **de la même sorte** : `annotation_kind_change` refusé), `annotation_delete`. Dernier écrivain gagne par
  annotation ; journal. Refus 422 `unknown_annotation` (supprimée entre-temps), `unknown_asset` (image dont le fichier
  n'est pas dans le magasin).
- **Les connecteurs** (1.4.0) : voir §6.6.
- **Les images** : `POST /api/intent/assets?infrastructure=` reçoit le fichier brut (`Content-Type` image), borné à
  `LD_MAX_ASSET_BYTES` (4 Mo), **reconnu à ses octets de tête** (PNG, JPEG, WebP ; jamais à son nom ni à son type
  déclaré), rangé sous son empreinte (`<archive>/_intent/<infra>/assets/<sha256>` : un même fichier envoyé deux fois
  n'est rangé qu'une fois) ; répond `{asset, media_type, bytes, width, height}`. `GET /api/intent/assets?…&asset=`
  le sert avec son type vérifié, `nosniff`, cache immuable. `DELETE` refuse (`asset_in_use`) tant qu'une annotation le
  cite ; `ld intent` liste les fichiers et ceux que rien ne cite. La page lit l'image avec le jeton et la montre par
  une adresse `blob:` (CSP `img-src 'self' blob:`) : jamais le jeton dans une adresse.

### 6.3 Les règles

- **A0 — Place.** Libre : la boîte est `(x, y, w, h)` dans le plan. Attachée à un équipement : coin haut gauche =
  centre de la carte + `(x, y)`. Attachée à un groupe : coin haut gauche du cadre (G0) + `(x, y)`. Recalculée à chaque
  dessin ; pendant un glissé de l'ancre, l'annotation suit (nœud enfant de sa carte ou de son cadre dans React Flow).
- **A1 — Visibilité.** Une annotation libre se dessine dès que la couche « annotations » est allumée (panneau
  Affichage, `notes=0` l'éteint). Une annotation attachée suit son ancre : équipement masqué (règle, voisin inconnu
  caché, statut), groupe non dessiné ⇒ non dessinée. Fantôme du diff : orpheline (pas un nœud de la run).
- **A2 — Ordre.** `back` : sous les cadres de groupe et de cluster, sous les câbles (une zone, une image de fond) ;
  `front` : au-dessus des cartes et des pastilles. Une annotation attachée se dessine toujours au-dessus de son ancre.
- **A3 — Glissé, taille.** Glisser une annotation la déplace (libre : `x, y` du plan ; attachée : nouvel écart) ; huit
  poignées la redimensionnent (Maj garde le rapport ; une image le garde par défaut) ; une seule écriture à la
  relâche. Verrouillée : ni l'un ni l'autre. Une annotation dans la sélection multiple glissée suit le bloc.
- **A4 — Sélection.** Clic = fiche ; `#annotation=<id>` ; la sélection éclaire son ancre. Double-clic sur une note =
  édition du texte en place (Ctrl+Entrée ou quitter enregistre, Échap abandonne). **Un tableau s'édite sur la toile**
  (2026-10-09) : clic = cellule choisie, Maj + clic = plage, double-clic = édition en place (Entrée enregistre, Tab
  passe à la suivante, Échap abandonne), les frontières des colonnes et des lignes se glissent (les poids deviennent
  les largeurs dessinées, la boîte ne bouge pas), le clic droit insère ou supprime une ligne ou une colonne (la boîte
  grandit ou rétrécit d'une piste moyenne), fusionne une plage, sépare une cellule, bascule l'en-tête.
- **A4 bis — Le clic droit** (2026-10-09, Orhan : « tout ce qui est action rapide devrait être accessible via un clic
  droit »). Un menu contextuel selon la cible, les mêmes commandes que les fiches et la barre, jamais un chemin à
  part (`app/state/context.ts`, pur) : le fond (insérer ici une note, un rectangle, une ellipse, un connecteur, un
  tableau, une image ; cadrer tout ; vider la sélection), un équipement (centrer, masquer, isoler ; attacher une note,
  tirer un connecteur, retirer l'épingle ; dans une sélection multiple : aligner, grouper), un groupe (sélectionner,
  masquer, isoler les membres ; note, connecteur ; supprimer), une annotation (cellule : voir A4 ; note : modifier le
  texte ; dupliquer, verrouiller, plan, détacher, tirer un connecteur, supprimer), un connecteur (inverser, pointes,
  tracé, redresser, détacher les bouts, verrouiller, plan, supprimer). Supprimer depuis le menu est direct : Ctrl+Z
  défait, la ligne d'état le dit. Sans nom, le menu se réduit à ce qui se lit (centrer, masquer, isoler).
- **A4 ter — Coller** (2026-10-09, Orhan : « coller une image depuis le presse-papiers ne fonctionne pas »). Ctrl+V
  hors d'un champ : une image du presse-papiers (PNG, JPEG, WebP) part au magasin et devient une annotation image au
  centre de la vue, à sa taille naturelle (600 de large au plus) ; un texte devient une note. « Insérer une image »
  (fichier) reste.
- **A5 — Ligne de rappel.** Du bord de la boîte au bord de la carte ou du cadre de l'ancre, trait du style de
  l'annotation, pointe à l'ancre ; jamais pour une annotation libre.
- **A6 — Orphelines.** Ancre absente : non dessinée, listée ; « détacher » la rend libre au centre de la vue courante.
- **A7 — Qui écrit.** Un nom ; sans nom, tout se lit, rien ne se glisse.
- **A8 — Ce que personne ne lit.** Ni B1, ni B3, ni le placement ; « replacer » laisse les annotations libres où elles
  sont et le dit (« n annotations libres gardent leur place »).
- **A9 — Annuler.** Les trois opérations entrent dans la pile (§7) sous la clé de l'annotation ; une annotation recréée
  change d'identité, la pile suit ; un glissé, un redimensionnement, une édition de texte = une entrée.

### 6.4 Branchement

- **Contrat** : `Annotation`, `Anchor`, les quatre contenus, `AnnotationStyle`, énumérations, `annotations` dans
  `Intent` 1.3.0, `upgraded()` relit 1.0.x à 1.2.x ; partie D de `CONTRAT.md`, schéma, fixture. **1.4.0** :
  `Merge`, `widths` / `heights` / `merges` du tableau, `connectors.py` (`Connector`, `FreeEnd`, `AttachedEnd`,
  `Heads`, `ConnectorStyle`), `upgraded()` convertit un 1.3.x.
- **Store** : trois opérations, identifiants `a<revision>-<n>`, refus `unknown_annotation`,
  `annotation_kind_change`, `unknown_asset` ; magasin d'images `backend/assets.py` (empreinte, octets de tête,
  dimensions lues dans l'en-tête, borne).
- **API** : mêmes routes de patchs ; `POST` / `GET` / `DELETE /api/intent/assets` ; `ld intent` liste les
  annotations (sorte, ancre, auteur, état) et les fichiers.
- **Moteur** : `canvas/annotations.ts` (pur : énumérations, défauts, boîte depuis l'ancre, retour à la ligne du texte
  par estimation de chasse comme la carte, ligne de rappel, orphelines), `canvas/table.ts` (pur : grille au prorata,
  cellules et fusions, lignes et colonnes insérées ou retirées, frontières glissées, boîte qui grandit),
  `canvas/connectors.ts` (pur : bouts résolus, tracés, courbure, pointes, orphelins) ; le modèle indexe
  `annotationById`, `annotationsByHost`, `annotationsByGroup`, `orphanAnnotations` ; la scène porte les annotations
  visibles ; sélection de sorte `annotation`.
- **Application** : nœud « annotation » React Flow (SVG, enfant de sa carte ou de son cadre quand elle est attachée),
  glissable, huit poignées, édition de texte en place ; `AnnotationCard` (contenu selon la sorte, ancrage, plan,
  verrou, ligne de rappel, style complet, centrer, dupliquer, détacher, supprimer en deux clics) ; dans la barre
  d'outils, un bloc **Insérer** (note, rectangle, ellipse, flèche, tableau, image) qui pose l'objet au centre de la
  vue et ouvre sa fiche ; couche « annotations » dans Affichage ; bulle au survol (sorte, auteur, date).
- **`/view`** (gelée) : l'onglet Intentions liste les annotations, sans les dessiner.
- **Tests** : contrats (ordre, bornes, contenu discriminé, tableau en escalier, ancrage incohérent, montée de version),
  store (création, patchs, suppression, sorte figée, journal), API (422 nommés, fichiers : octets de tête, borne,
  doublon, suppression refusée), CLI, Node (boîte, retour à la ligne, orphelines, scène, historique, adresse), Chromium
  (insérer une note, la glisser, l'éditer, la supprimer, Ctrl+Z ; une image envoyée puis montrée).

### 6.5 Hors périmètre, volontairement

Texte riche ou Markdown ; rotation ; polygone ou courbe libre ; style par cellule d'un tableau (couleur, graisse par
cellule) ; recadrage d'une image ; calques nommés par audience ; **la sortie figée** (SVG ou PDF de la toile avec ses
annotations), brique naturelle d'après pour les auditeurs ; les flèches du clavier et l'alignement sur les annotations ;
un connecteur à plusieurs segments libres (le tracé coudé et la courbure couvrent le besoin dit) ; plusieurs ancres par
côté d'un élément (quatre suffisent tant que le besoin n'est pas vu) ; un connecteur ancré à un câble ou à un faisceau ;
Ctrl+C / Ctrl+V d'une annotation elle-même (dupliquer existe).

### 6.6 Les connecteurs (2026-10-09, Intent 1.4.0 ; ancres 1.5.0)

En une phrase : **un connecteur est une ligne ou une flèche que l'humain tire entre deux bouts, chacun libre ou
attaché à un équipement, un groupe ou une annotation ; il suit ce qui bouge et reste une intention, jamais un câble.**

- **Contrat** : `connectors[]` à côté des annotations, identité `c<revision>-<n>` ; `start` et `end` discriminés par
  `kind` (`free` : `x`, `y` du plan ; `device` : `hostname` ; `group` : `id` ; `annotation` : `id` ;
  `end_ref_mismatch` si l'id n'a pas la forme de sa sorte ; `connector_same_ends` si les deux bouts visent le même
  élément) ; `heads` `{start, end}` ∈ `none` | `arrow` ; `route` `straight` | `elbow` | `curve` ; `bend` ±2 000
  (courbe : écart du milieu de l'arc à la corde, signé ; coudé : décalage du segment médian) ; `label` 0..80 ; `z`,
  `locked` ; style (teinte, épaisseur 1..8, trait plein | tirets | pointillés, opacité, texte). Défauts : flèche à
  l'arrivée, droit, ardoise, épaisseur 2. Trois opérations : `connector_create` (deux bouts obligatoires, répond avec
  l'id), `connector_update` (patchs partiels, un bout remplacé en entier), `connector_delete` ; 422
  `unknown_connector`. Mêmes règles que les annotations : dernier écrivain gagne, journal, Ctrl+Z (identités `c…`
  numérotées à part), orphelin (un bout sur un élément absent : listé, jamais dessiné ni effacé).
- **Montée de version** : un document 1.3.x relu par le store voit ses formes `line` / `arrow` devenir des
  connecteurs (`c` + les numéros de l'annotation, bouts aux coins de la boîte ; attachée : le départ reste attaché, le
  bout d'arrivée est posé libre au point relatif lu tel quel, à replacer), et ses tableaux recevoir des pistes égales.
  Rien n'est effacé.
- **Géométrie** (`canvas/connectors.ts`, pur) : un bout attaché part du bord de la boîte de son élément vers le
  premier point de passage ; droit = un segment ; coudé = deux angles droits, horizontal d'abord si la corde l'est,
  segment médian décalé de `bend` ; courbe = une quadratique dont le milieu de l'arc s'écarte de `bend` de la corde ;
  la pointe est un triangle de 7 + 2,5 × épaisseur, orienté par la tangente.
- **Toile** (`app/canvas/connector.tsx`) : un nœud React Flow qui ne se glisse pas comme une carte ; il lit la place
  vivante de ses bouts (une carte glissée l'entraîne pendant le geste) ; sélectionné et éditable, trois poignées :
  les deux bouts (glisser un bout sur une carte, une annotation ou un cadre l'y attache, dans cet ordre de préférence
  ; ailleurs, il est libre) et la courbure au milieu (glisser un tracé droit le courbe) ; le corps se glisse quand il
  a un bout libre ; double-clic = étiquette en place ; clic droit = menu (A4 bis). Dessiné avec ses deux bouts (un
  équipement masqué emporte le connecteur qui y touche), sous la couche « annotations » ; un équipement sélectionné
  éclaire ses connecteurs, un connecteur sélectionné éclaire ses bouts ; `#connector=<id>`.
- **Fiche** (`ConnectorCard`) : bouts, inverser, verrouiller, détacher (les deux bouts libres, là où ils sont),
  supprimer en deux clics ; étiquette, pointes, forme, courbure, plan, style complet. **Insérer** : un connecteur
  libre au centre de la vue ; depuis le menu d'un équipement, d'un groupe ou d'une annotation : « tirer un
  connecteur », le départ attaché. `/view` liste les connecteurs dans l'onglet Intentions ; `ld intent` les imprime.
- **Les ancres (1.5.0, 2026-10-09 ; retour d'Orhan le même jour : « pas facilement manipulables », « pas de point
  d'ancrage sur les éléments, ça ne facilite pas l'alignement », « la flèche s'arrête un peu avant les éléments »)**.
  Trois réponses. (1) **Contrat** : un bout attaché porte `side` ∈ `auto` | `n` | `e` | `s` | `w` : `auto` = le point
  du contour qui regarde l'autre bout (ce que 1.4.0 dessinait), un côté = le milieu de ce côté de la boîte. Montée de
  version additive : `upgraded()` pose `auto` sur un 1.4.x. (2) **Géométrie** (`connectors.ts`) : le tracé arrive sur
  le **vrai contour** (`outlinePoint` : l'arc d'un coin arrondi, une ellipse, un disque de voisin inconnu), plus sur le
  coin fantôme du rectangle, cause de l'écart vu par Orhan ; une ancre fixe **sort perpendiculairement** à son côté
  (`STUB` 24) et le coudé se décide entre les sorties ; deux ancres en équerre donnent un seul coin, sans segment
  médian (`bendable` faux : pas de poignée de courbure). (3) **Toile** : chaque carte, disque, annotation et cadre
  montre **quatre points d'ancrage** au survol ou sélectionné quand on peut écrire (`app/canvas/anchors.tsx`) ; **tirer
  depuis un point crée un connecteur** ancré à ce côté, dont le bout d'arrivée suit le pointeur (brouillon en
  pointillé dans le plan, `ViewportPortal`) ; un bout glissé, neuf ou existant, **montre les ancres de l'élément qu'il
  survole et s'y accroche** à moins de 14 px d'écran (`app/canvas/snap.ts`, pur : une ancre à portée, sinon l'élément
  dessous sur son contour, sinon libre ; une carte avant une annotation avant un cadre, le plus petit d'abord ; l'autre
  bout du même connecteur exclu) ; les poignées gardent une **taille d'écran constante** (rayon divisé par le zoom) et
  se montrent au survol, pas seulement sélectionné ; zone de prise du trait élargie. La fiche règle l'ancre de chaque
  bout attaché (automatique, haut, droite, bas, gauche). Tests : contrats (ancre, montée de version), Node (ancres,
  contours, sorties, équerre, accrochage), Chromium (un bout relâché près du haut d'une carte s'ancre en `n` ; tirer
  depuis une ancre crée un connecteur, Ctrl+Z le défait). Parqué (§6.5) : plusieurs ancres par côté.

## 7. Annuler, rétablir (2026-10-07, validé par Orhan : « GO »)

Deux boutons dans la barre (toujours visibles, la bulle nomme le geste), Ctrl+Z, Ctrl+Y ou Ctrl+Maj+Z (sans effet
dans un champ de texte, qui garde sa propre annulation).

- **Ce qui s'annule** : les modifications faites **dans cette page** : épingles (glissé, flèches du clavier,
  alignement, retrait), couleurs d'équipement et de type, groupes (création, modification, membres, suppression), et
  les déplacements locaux faits sans nom. **Ce qui ne s'annule pas** : la sélection et les filtres (état de vue, dans
  l'adresse), « replacer » (déjà confirmé), les modifications des autres.
- **Annuler est une écriture, pas un retour en arrière** : les opérations inverses partent par `POST
  /api/intent/patches` sous le nom de l'écrivain ; le journal dit qui a annulé quoi, quand. Aucune nouvelle route,
  aucun changement de contrat.
- **On ne défait jamais le travail d'un autre** : une entrée retient, clé par clé (épingle d'un équipement, sa couleur,
  la couleur d'un type, un groupe), la valeur d'avant et celle d'après. Une clé dont la valeur courante n'est plus
  celle qu'on a laissée (quelqu'un l'a changée depuis) est **sautée**, et la page le dit (« 1 modifié depuis par
  quelqu'un d'autre, laissé tel ») ; si tout est sauté, l'entrée sort de la pile.
- **Un groupe supprimé puis recréé change d'identité** (`g<révision>-<n>`, attribuée par le serveur) : la pile suit
  la nouvelle identité partout.
- **La pile** : 100 entrées au plus, propre à l'onglet, perdue au rechargement ; elle traverse les runs d'une même
  infrastructure (l'intention est par infrastructure), se vide quand on en change ; les déplacements locaux ne valent
  que pour la toile qui les a faits et sont oubliés à la run suivante. Un geste nouveau vide « rétablir ».
- **Les flèches** déplacent la sélection d'un carreau de grille (20), de cinq avec Maj ; une rafale n'enregistre qu'un
  paquet d'épingles, 400 ms après la dernière flèche, donc une seule entrée de la pile.
- Code : `engine/src/app/state/history.ts` (pur : clés, valeurs, opérations inverses, pile ; testé sous Node),
  `engine/src/app/canvas/undo.ts` (observe l'écrivain, rejoue par l'hôte d'intention), `toile.ts` (`nudge`, `flush`,
  `restore`, `onMoved`).

## 8. À venir dans ce document

Les **épingles d'étiquettes et les styles de câbles** (§7 bis, validés le 2026-10-08 : une étiquette de port, de
faisceau ou de vitesse déplacée à la main est une épingle relative à son câble, `t` le long de la courbe et un écart ;
teinte et épaisseur d'un câble, le motif du statut conservé ; défauts par infrastructure), le **masque par règle**
enregistré (`hide` / `only` comme intention), les **câbles déclarés** (quatrième statut, signé, jamais dans le snapshot
ni le diff). Chacun : une section ici, une liste additive dans `Intent`, ses opérations, ses orphelines, ses tests.
