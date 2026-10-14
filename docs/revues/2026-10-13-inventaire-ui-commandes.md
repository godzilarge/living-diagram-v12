# Inventaire des fonctions d'édition et de navigation de l'application (2026-10-13)

Rapport d'un agent de lecture, consigné tel que rendu, pour `docs/11-audit-ui-edition-et-plan.md` §9.1. Lu dans le
code, pas dans les docs. Chemins relatifs à `engine/src/app/` sauf indication contraire. React Flow `@xyflow/react`
12.12.0 (`engine/package.json:28`). Trois conditions reviennent partout :
- **« éditable »** : vue Diagramme et écrivain nommé (`state/store.tsx:145`).
- **Contrôle** : la vue se lit seulement.
- **Journal** : la toile est remplacée par le journal.

## 1. Commandes par zone

### Barre du haut (`components/TopBar.tsx`)
- **Bascule de vue** Diagramme / Contrôle / Journal (`:46-58`). En Diagramme, le bouton Contrôle porte une pastille avec le nombre d'erreurs, ou à défaut d'avertissements (`:42-53`).
- **Comptes** : nombre d'équipements, en lecture (`:86`) ; en Contrôle seulement, un bouton par statut (confirmed / observed_only / documented_only) qui masque ou montre ses câbles via `toggleStatus` (`:88-95`) ; en Contrôle seulement, erreurs et avertissements lancent un parcours (`startWalk`, `:98-103`) ; le compte du diff `+a −r ~c` lance le parcours « diff » (`:104-108`).
- **Puces de règles** « masqué » / « isolé », chacune retirable par sa croix (`:19-31`).
- **Bascule « Changements »** : `showDiff`, présente seulement s'il y a un diff (`:157`).
- **Panneau Affichage** (`:158`) et **bouton auteur** qui ouvre le menu (`:159`).
- **Menu** (`:114-138`) : saisie du nom (80 caractères au plus, `:119-128`) ; langue (`:130`) ; « Palette des types », en Diagramme seulement (`:132`, ouvre `TypePalette.tsx` : 12 teintes par type ou le retour au défaut, `TypePalette.tsx:48`) ; changer d'infrastructure (`:133`) ; oublier le jeton (`:134`).

### Coquille (`components/Shell.tsx`)
- Clavier global (§2) et collage (`:66-73`).
- Bouton « Retour au journal » après un « montrer » depuis le Journal (`:114`).

### Barre d'outils flottante (`components/Toolbar.tsx`)
- **Annuler / rétablir** : l'infobulle donne le libellé de l'opération et « Ctrl+Z » ou « Ctrl+Y ». Masqués en Contrôle (`:47-51`).
- **Cadrer tout** (`fit`, `:52`). **Centrer sur la sélection**, désactivé sans sélection (`:53`).
- **Insérer**, si éditable : note, rectangle, ellipse, connecteur, tableau. L'objet est posé au centre de la vue (`:22-28`, `:57`). Image : un sélecteur de fichier png, jpeg ou webp (`:58-60`).
- **Avec au moins 2 équipements sélectionnés** : aligner horizontalement et verticalement. Avec au moins 3 : répartir en horizontal et en vertical (`:44`, `:66`).
- Compte de la sélection et bouton « vider » (Échap) (`:68-69`). En Contrôle, seuls le compte et « vider » restent.

### Controls, en bas à gauche (`components/Controls.tsx`)
- Grille (`:15`), aimant (`snap`, `:16`), minimap (`:17`), thème clair ou sombre (`:19`). Préférences du navigateur, pas des réglages d'adresse.

### Panneau Affichage (`components/Display.tsx:18-33`)
Chaque couche est un interrupteur (`:62`), avec sa clé d'adresse (`state/address.ts:51-56`, `:69-75`) :

| Section | Couche | Clé d'adresse | Défaut |
|---|---|---|---|
| Câbles | `showBeams` | `beams=1` | non |
| Câbles | `showSpeeds` | `speeds=1` | non |
| Câbles | `showPorts` | `ports=1` | non |
| Câbles | `showOper` | `oper=1` | non |
| Équipements | `showStubs` | `stubs=1` | non |
| Équipements | `showPins` | `pins=0` | oui |
| Contexte | `showNotes` | `notes=0` | oui |

- Le bouton affiche le nombre de couches qui s'écartent du défaut (`:36`). Un clic hors du panneau le ferme.

### Recherche (`components/Search.tsx`, `state/search.ts`)
- **Cherchable** : les équipements, par les champs de `query.ts`, plus `port:` et `desc:` (`search.ts:18`), fantômes compris (`:62-65`) ; les ports, par nom et abréviations (Eth1/1, Po10…) et par description (`:89-115`) ; les groupes, par nom et description, et les clusters HA (`:117-125`).
- **Syntaxe** : termes séparés par des espaces, tous doivent correspondre, chaque terme est une regex insensible à la casse, `champ:regex` possible (`:43-54`) ; des puces proposent les champs pendant la frappe (`Search.tsx:75-79`, `search.ts:147-151`). Chercher éclaire et estompe, sans rien filtrer (`Canvas.tsx:35`, `:109-113`).
- **Actions** : ouvrir un résultat (centrer et ouvrir sa fiche, `:39`) ; « sélectionner » les équipements trouvés, aussi par Maj+Entrée (`:40`, `:108`) ; « masquer » (`addHide`) ou « isoler » (`setOnly`) d'après la règle (`:110-111`) ; « tout montrer » (`clearRules`, `:112`) ; au plus 8 résultats par section (`:17`).

### Timeline (`components/Timeline.tsx`)
- Run précédente et suivante (`:39`, `:52`). Clic sur une run : elle s'ouvre, comparée à la précédente (`:46`). Sélecteur « comparer à » une run antérieure, ou aucune (`:54-57`).

### WalkBar (`components/WalkBar.tsx`)
- Précédent / suivant (`:22`, `:24`) et fin du parcours (`:27`). Finir rend la sélection et la vue d'avant (`state/store.tsx:226-234`).

### Menu contextuel (`state/context.ts`, exécution dans `components/ContextMenu.tsx:63-131`)
- **Fond** (`context.ts:26-30`) : si éditable, insérer note, rectangle, ellipse, connecteur, tableau ou image, au point cliqué (`ContextMenu.tsx:68`) ; toujours « Cadrer tout » ; « Vider la sélection » s'il y en a une.
- **Équipement** (`:32-41`) : Centrer, Masquer, Isoler (sur toute la sélection si l'équipement en fait partie, `ContextMenu.tsx:72`) ; si éditable et sélection multiple : Aligner H, Aligner V, Grouper ; si éditable et équipement seul : Note attachée (avec ligne de rappel, `:77`) et Connecteur depuis l'équipement (`:78`) ; « Désépingler » si épinglé.
- **Groupe** (`:43-46`) : Centrer, Sélectionner les membres, Masquer les membres, Isoler les membres ; si éditable : Note attachée, Connecteur, Supprimer le groupe, **immédiat, sans confirmation** (`ContextMenu.tsx:92`).
- **Connecteur** (`:48-61`) : Centrer ; si éditable : Inverser ; pointes (fin / début / deux / aucune, cochée) ; tracé droit / coudé / courbe ; « Redresser » s'il est courbé ; « Détacher les bouts » s'il est attaché ; Verrouiller / Déverrouiller ; Premier plan / Arrière-plan ; Supprimer, sans confirmation.
- **Cellule de tableau**, si éditable (`:65-78`) : Modifier ; Fusionner (plage) ; Séparer (fusionnée) ; Ligne au-dessus / en dessous / Supprimer la ligne (si plus d'une) ; Colonne à gauche / à droite / Supprimer la colonne (si plus d'une) ; En-tête (cochée).
- **Annotation** (`:79-84`) : « Modifier le texte » (note, éditable) ; Centrer ; si éditable : Dupliquer, Verrouiller, Premier plan / Arrière-plan, Détacher (si ancrée), Connecteur, Supprimer, sans confirmation.
- **Clavier du menu** : ↑↓ parcourent, Entrée choisit, Échap ferme (`ContextMenu.tsx:43-48`). Un clic ailleurs, la molette, un redimensionnement ou une perte de focus le ferment (`:24-29`).

### Fiches (`components/Panel.tsx`)
- Une seule fiche à la fois (`:75-88`). Croix (`:95`). Bord gauche glissable ; ←/→ par 16 px, 64 avec Maj ; Origine ou double-clic rendent 348 px (`:33-64`).
- **NodeFacts, équipement en Diagramme** (`cards/NodeFacts.tsx`) : Centrer (`:124`), Historique au Journal (`:125`), Masquer (`:126`), Isoler (`:127`), « … » → Désépingler (si épinglé et éditable, `:128`). Section Apparence repliée (`cards/Appearance.tsx`) : teinte ou défaut (`:22`), retirer d'un groupe (`:28`), ajouter à un groupe existant (`:35`). Rien d'autre ne s'édite.
- **NodeCard, équipement en Contrôle** (`cards/NodeCard.tsx:84-87`) : Centrer, Historique, Masquer, Isoler. Aucune édition.
- **LinkFacts / LinkCard, câble** (`cards/LinkFacts.tsx:22`, `cards/LinkCard.tsx:64`) : Centrer et lien vers le faisceau. Lecture seule.
- **Faisceau, agrégat, cluster** (`cards/StructureCards.tsx`) : Centrer (`:45`, `:78`, `:116`) ; le cluster a « Sélectionner les membres » (`:79`). Lecture seule.
- **MultiCard, sélection multiple** (`cards/MultiCard.tsx`) : Masquer et Isoler (`:41-42`) ; si éditable : teinte commune (`:49`), nouveau groupe avec un nom (`:55-59`), ajouter à un groupe existant (`:61`) ; liste des équipements, cliquables (`:67`).
- **GroupCard** (`cards/GroupCard.tsx`) : Centrer, Historique, Sélectionner les membres (`:58-60`) ; « … » : Masquer, Isoler, Appliquer la teinte aux membres, Supprimer **avec confirmation** (`:61-68`, `:76`) ; nom en place, 80 caractères (`:70`) ; description, 500 (`:73`) ; retirer un membre s'il en reste plus d'un (`:82`) ; cadre : rectangle ou ellipse, teinte, remplissage 0-100 %, marge 0-300, bordure (solid, dashed, dotted, none) et épaisseur 0-8, coins 0-80 (`:23-30`) ; étiquette : 9 positions, dedans ou dehors, police sans ou mono, taille 8-64, graisse regular / semibold / bold, couleur teinte ou encre (`:31-39`). Le cadre suit ses membres : il ne se redimensionne pas.
- **AnnotationCard** (`cards/AnnotationCard.tsx`) : Centrer, Historique, Dupliquer, Verrouiller (`:156-159`) ; « … » : Détacher, Supprimer avec confirmation (`:160-163`, `:172`). Contenu : note, texte 2000 (`:92`) ; forme : rectangle ou ellipse, étiquette (`:97-98`) ; tableau : grille de champs, lignes 1-30, colonnes 1-8, en-tête (`:31-54`) ; image : texte alternatif, remplacement (`:104-106`). Position : ancrage libre, équipement (suggestions) ou groupe (`:57-83`) ; X, Y ; L et H entre 20 et 4000 ; plan ; opacité 10-100 % ; ligne de rappel (`:179-192`). Forme : teinte, remplissage, bordure, coins (`:118-124`). Texte : police, taille, graisse, couleur, alignements (`:125-135`).
- **ConnectorCard** (`cards/ConnectorCard.tsx`) : Centrer, Historique, Inverser, Verrouiller (`:58-61`) ; « … » : Détacher, Supprimer avec confirmation (`:62-65`, `:74`) ; bouts (cliquables) et ancre auto, n, e, s, w (`:77-82`) ; tracé : étiquette 80 caractères, pointes, droite / coudée / courbe, courbure −400..400, plan, opacité (`:85-93`) ; trait : teinte, style, épaisseur 1-8 (`:94-98`) ; texte : police, taille, graisse, couleur (`:99-106`).
- **Champs numériques** (`ui/inspector.tsx:218-227`) : glisser le préfixe fait défiler (×10 avec Maj), ↑/↓ de même ; Entrée valide, Échap annule.

## 2. Raccourcis clavier

**Globaux** (`components/Shell.tsx`) :
- `/` ou Ctrl/Cmd+K : focus sur la recherche, sauf dans un champ ou en Journal (`:45-49`).
- Échap, dans cet ordre (`:50-57`) : ferme le menu contextuel, la recherche, la palette des types, le menu, l'écran de connexion, finit le parcours, vide la sélection. Échap cache aussi l'infobulle (`canvas/Flow.tsx:377`).
- Ctrl/Cmd+Z annule ; Ctrl/Cmd+Y ou Ctrl/Cmd+Maj+Z rétablit. Pas en Contrôle, pas dans un champ (`:79-80`).
- Flèches : déplacent la sélection d'équipements de 20 px, ou 100 avec Maj (`:30-31`, `:86-87`) ; une rafale enregistrée 400 ms après la dernière touche (`canvas/toile.ts:96`, `:259-268`) ; **équipements seulement** (`toile.ts:246-249`).
- Pendant un parcours, ↑↓ passent d'un équipement à l'autre (`:84`).
- Ctrl+V (événement `paste`) : image → annotation image ; texte → note de 2000 caractères au plus, au centre de la vue. Hors des champs, pas en Contrôle ni en Journal, écriture possible seulement (`:66-73`, `state/store.tsx:421-430`).

**Locaux** : recherche ↑↓, Entrée ouvre, Maj+Entrée sélectionne, Échap vide puis ferme (`Search.tsx:42-53`) ; timeline ←/→ (`Timeline.tsx:24-27`) ; éditeur de note : Ctrl+Entrée enregistre, quitter enregistre, Échap abandonne (`canvas/annotation.tsx:138-148`) ; cellule : Entrée enregistre, **Tab passe à la suivante**, Échap abandonne (`canvas/table.tsx:37-42`) ; étiquette de connecteur : Entrée / Échap (`canvas/connector.tsx:63-67`) ; dialogues : Tab piégé, Échap ferme (`ui/index.tsx:72-78`) ; description : Ctrl+Entrée (`ui/inspector.tsx:188`) ; Journal : ↑↓, Origine, Fin, `o` (`Journal.tsx:229-244`), `/` ou Ctrl+K (`journal/Tools.tsx:94`).

**Existence explicite** :
- **Ctrl+C** : absent sur la toile. Seul le Journal copie un lien (`journal/Row.tsx:103-107`).
- **Ctrl+V** : présent (ci-dessus). **Ctrl+D** : absent (dupliquer par le menu ou la fiche seulement). **Ctrl+A** : absent.
- **Suppr / Retour arrière** : absents. `deleteKeyCode={null}` (`Flow.tsx:569`) et aucun gestionnaire.
- **Ctrl+0, Ctrl+1, Ctrl+plus / moins** : absents ; React Flow n'en fournit pas.
- **Espace+glisser** : non configuré ; défaut React Flow (`panActivationKeyCode='Space'`), alors que le glissé sur le fond déplace déjà la vue.
- **Alt+glisser** : absent. Aucune lecture d'`altKey` sur la toile.
- **Tab** : défaut React Flow (nœuds focalisables ; câbles exclus par `edgesFocusable={false}`, `Flow.tsx:570`). Dans les tableaux : cellule suivante.

## 3. Souris et React Flow

**Props passées** (`canvas/Flow.tsx:561-573`) : `minZoom` 0.05, `maxZoom` 6 (`:55`) ; `nodeDragThreshold` 4 ; `selectionKeyCode="Shift"`, `multiSelectionKeyCode="Shift"`, `selectionMode=Partial` ; `nodesConnectable=false`, `elevateEdgesOnSelect=false`, `elevateNodesOnSelect=false` ; `zoomOnDoubleClick=false`, `deleteKeyCode=null`, `fitView=false` ; `nodesDraggable={!control}`, `edgesFocusable=false` ; `snapToGrid={prefs.snap}`, `snapGrid=[20,20]` ; `Background` lignes au pas 20 si la grille est active ; `MiniMap` déplaçable et zoomable si active.

**Défauts de la bibliothèque, non surchargés** (vérifiés dans `node_modules`) : `panOnDrag=true`, `panOnScroll=false`, `zoomOnScroll=true`, `zoomOnPinch=true`, `selectionOnDrag=false`, `elementsSelectable=true`, `panActivationKeyCode='Space'`, `zoomActivationKeyCode` Ctrl (Cmd sur Mac).

En pratique : la molette zoome ; glisser sur le fond déplace la vue ; Maj+glisser trace un rectangle de sélection, **ajouté** à la sélection précédente (`Flow.tsx:410-424`) ; Maj+clic ajoute ; Ctrl+clic ne fait rien ; **la sélection multiple ne contient que des équipements** : une annotation, un connecteur, un groupe, un cluster, un câble ou un faisceau se sélectionnent seuls (`Flow.tsx:390-409`).

**Glissable** : équipements, seuls ou toute la sélection ; épingles en lot à la relâche (`Flow.tsx:482-510`) ; cadre de groupe : entraîne ses membres présents (`:459-491`), pas en Contrôle (`:176`) ; annotations : si éditables et non verrouillées (`:201`) ; clusters et connecteurs : pas au niveau de React Flow (`:136`, `:230`) ; connecteur : poignées des bouts, accrochage à une ancre à moins de 14 px d'écran ou au contour (`:56`, `connector.tsx:138`, `:151-153`), poignée du milieu pour courber (`:139`, `:154-157`), corps seulement s'il est déjà sélectionné avec un bout libre (`:126-128`, `:158-164`) ; ancres, quatre points au milieu des côtés des cartes, disques, annotations et cadres : tirer crée un connecteur (`canvas/anchors.tsx:22-54`, `nodes.tsx:67`, `:84`, `:112`) ; poignées d'annotation, 8, de 20 à 4000, Maj garde le rapport sur les coins (`annotation.tsx:54-102`) ; frontières des tableaux (`table.tsx:150-151`) ; bord du panneau (`Panel.tsx:40-52`).

**Double-clic** : note → texte en place (`annotation.tsx:175`) ; cellule (`table.tsx:97-104`) ; connecteur → étiquette (`connector.tsx:172`) ; bord du panneau → largeur par défaut. Rien sur les équipements ni sur le fond.

**Clic dans un tableau sélectionné** : choisit une cellule ; Maj+clic étend la plage (`table.tsx:89-96`). **Clic droit** : menu contextuel (`Flow.tsx:536-551`, `annotation.tsx:177`, `connector.tsx:173`, `table.tsx:105-112`) ; un clic droit ne déclenche jamais de glissé (`button !== 0`). **Autres** : survol → infobulle après 100 ms (`Flow.tsx:84`) ; clic sur la pastille de stack → liste des membres (`canvas/chips.tsx:32`).

## 4. Annuler / rétablir

- **Entre dans la pile** : les écritures d'intention acceptées et faites par cette page : épingle et désépingle, couleur d'équipement et de type, `group_*`, `annotation_*`, `connector_*` (`state/history.ts:66-89`, `canvas/undo.ts:28-38`) ; les déplacements sans nom, entrées « locales » (`undo.ts:40-43`).
- **Rejeu** : annuler est une nouvelle écriture, signée, au journal (`history.ts:1-5`) ; une clé modifiée par un autre est sautée et dite (`:129`, `undo.ts:65`) ; si plus rien n'est rejouable, l'entrée sort (`undo.ts:60-63`).
- **Limites** : 100 entrées (`history.ts:37`, `:178`) ; un nouveau geste vide « rétablir » ; la pile vit par infrastructure (`store.tsx:258`), les entrées locales sont oubliées au changement de run (`Canvas.tsx:68`, `history.ts:180`) ; une opération à la fois (`undo.ts:46`) ; inactif en Contrôle et en Journal (`Shell.tsx:77-80`) ; non annulables : la vue (couches, masquer, isoler, statuts) et la mémorisation du placement.

## 5. Persistance

- **Navigateur** : `localStorage["ld-prefs"]` : theme, language, grid, snap, minimap, panelWidth (300-760) (`state/prefs.ts:11-18`) ; `localStorage["ld-author"]` (`shell/http.ts:7`) ; `sessionStorage["ld-api-token"]` (`shell/http.ts:6`).
- **Adresse** (`state/address.ts`) : `?` : `infrastructure`, `run_id`, `from` (`:17-28`) ; `#` : `mode` (control ou journal), `stubs`, `ports`, `speeds`, `beams`, `pins`, `notes`, `oper`, `diff`, `hide` (répétable), `only`, `mask` ; une seule sélection par `node`, `link`, `aggregate`, `beam`, `cluster`, `group`, `annotation`, `connector` (`:11`, `:48-83`) ; en Journal : `jq`, `jau`, `jcat`, `jact`, `jobj`, `jinfra`, `jp`, `jfrom`, `jto`, `jrev` (`state/journal.ts:122-135`) ; suivi des modifications manuelles et du retour arrière (`store.tsx:480-495`).
- **Serveur** (`api/writers.ts`, `shell/apps.ts:8-18`) : `POST /api/intent/patches` avec `{author, ops}`, envois sérialisés (`writers.ts:25`, `:40-44`) ; opérations : `pin`, `unpin`, `color`, `uncolor`, `color_type`, `uncolor_type`, `group_create`, `group_update`, `group_add`, `group_remove`, `group_delete`, `annotation_create`, `annotation_update`, `annotation_delete`, `connector_create`, `connector_update`, `connector_delete` ; `/api/placement` avec `{base_revision, replace, places}`, un 409 renvoie le document courant (`writers.ts:49-59`) ; `/api/intent/assets` pour les images (`api/client.ts:72`) ; l'écriture est refusée sans nom ou si l'intention n'a pas pu être lue (`writers.ts:20-21`).

## 6. Capacités absentes, vérifiées par grep

- **Copier / coller d'annotations** : absent (`clipboard.write|writeText|"copy"|onCopy` ne trouve que `journal/Row.tsx:103-107`). Coller crée une note ou une image, jamais une copie d'objet.
- **Dupliquer un équipement, un groupe ou un connecteur** : absent (`duplicate`). Seules les annotations se dupliquent : +20, copie déverrouillée (`store.tsx:346-355`).
- **Tout sélectionner** : absent (`selectAll|Ctrl+A`). Seul « sélectionner les trouvés » de la recherche.
- **Suppr sur une annotation ou un connecteur** : absent (`"Delete"|"Backspace"`, `deleteKeyCode={null}`).
- **Ordre de superposition au-delà de deux plans** : absent. `PLANES = back | front` (`canvas/annotations.ts:18`). Cadres rangés par aire (`Flow.tsx:180-181`).
- **Verrou sur les équipements** : absent. `locked` n'existe que pour annotations et connecteurs.
- **Redimensionner une carte d'équipement** : absent. Poignées dans `annotation.tsx` seulement ; taille calculée (`cardPlan`).
- **Export SVG / PNG / PDF / impression** : absent (`toPng|toSvg|html-to-image|toBlob|print|pdf`). Seul l'export CSV du Journal (`journal/Tools.tsx:68-80`).
- **Guides d'alignement intelligents** : absent (`helperLine|guide|snapLine|smart`). Aimant de grille et accrochage des bouts aux ancres seulement.
- **Vues nommées / favoris** : absent (`bookmark|savedView|namedView|favori|signet`). L'adresse partageable en tient lieu.
- **Rafraîchissement multi-utilisateur** : absent (`setInterval|EventSource|WebSocket|poll|visibilitychange|refetch`). L'intention n'est relue qu'avec la run ou dans la réponse d'une écriture ; le Journal se relit à l'ouverture et au changement de filtres (`store.tsx:500-503`).
- **Aide-mémoire des raccourcis pour la toile** : absent (`shortcut|raccourci|cheat|keymap`). Journal seulement (`Journal.tsx:107-118`) et infobulles de la barre.
- **Tactile** : aucun code (`touch|pinch|pointerType`). Pincement par défaut de React Flow, non vérifié.
- **Mise en forme du texte (gras, italique, listes)** : absente. Graisse et police pour toute la note (`WEIGHTS`, `FONTS`, `canvas/groups.ts:14-15`).
- **Recadrage d'image** : absent (`crop|recadr`). Remplacement et redimensionnement de la boîte, image ajustée sans déformation (`preserveAspectRatio="xMidYMid meet"`, `annotation.tsx:134`).
- **Rotation** : absente (`rotat`). Le seul résultat, `canvas/graph.ts:243`, oriente des étiquettes de l'ancien `/view`.

**Point non tranché** : Espace+glisser par-dessus un nœud, comportement interne de React Flow 12 non surchargé, non vérifié.
