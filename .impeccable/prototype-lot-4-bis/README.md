# Prototype du lot 4 bis : une barre contextuelle qui édite vraiment

Une page autonome : la barre de réglages rapides du lot 4, refaite pour formater un texte comme dans tout éditeur, avec
des volets dessinés dans la même famille que la barre. Données factices, aucun fichier de l'application touché
(`docs/11-audit-ui-edition-et-plan.md` § Lot 4, « Retours d'Orhan à l'usage »).

## Ouvrir

`file:///home/otosun/development/applications/demo/living-diagram-v12-biturbo/.impeccable/prototype-lot-4-bis/index.html`

Aucune ressource externe : polices (Inter et JetBrains Mono, droites et italiques) et icônes Lucide sont dans la page.

## Quoi essayer

- **Cliquer la note jaune.** La barre montre, de gauche à droite : teinte | police, **taille**, gras, italique, souligné,
  barré, couleur du texte, position du texte | plan, verrou | dupliquer, supprimer. Tout s'applique en direct sur la
  note ; Ctrl+Z / Ctrl+Y annulent.
- **La taille est libre, de 8 à 64.** On tape la valeur dans le champ (Entrée), ↑↓ (±1, Maj ±10), on **glisse
  l'icône « AA »** à gauche du nombre (4 px par cran, Maj × 10 ; tout le glissé fait une seule entrée d'historique),
  ou le chevron ouvre seize valeurs proposées (8 à 64), avec un aperçu au survol (« 16 → 20 px »). Ctrl+Maj+> et
  Ctrl+Maj+< passent à la valeur proposée suivante ou précédente, comme dans les traitements de texte.
- **Ctrl+B, Ctrl+I, Ctrl+U**, **Ctrl+Maj+X** (barré). B est enfoncé dès le demi-gras ; le relâcher remet en normal
  (le volet « police » garde les trois graisses).
- **Le volet « position »** : neuf cases qui dessinent ce qu'elles font (trois lignes placées comme elles le seront
  dans la boîte), puis la **marge** intérieure (un pointillé la montre dans la note pendant qu'on la règle) et
  l'**interligne** (1,00 à 3,00).
- **Double-clic sur la note** : on écrit dedans (Ctrl+Entrée ou un clic dehors pour finir).
- **La forme « Baie 12 »** : la même barre, avec en tête ce que la forme a en plus (remplissage, bordure, coins).
- **Le connecteur** (la flèche vers le routeur) : son étiquette se pose où l'on veut sur le tracé (départ, milieu,
  arrivée ou n'importe quel pourcentage) et au-dessus, sur le trait ou au-dessous.
- **Le cadre « Salle B »** : son étiquette en neuf positions, dedans ou dehors.
- **Le tableau** : police, taille, gras, italique, souligné, couleur, alignement des cellules.
- **Maj + clic** sur plusieurs objets : les réglages s'appliquent à tous. Une valeur qui diffère se lit « — »
  (taille), « Mixte » (police), en tirets (gras, italique…), en barre tricolore (couleur).
- **Le clavier** : Alt+T donne la barre ; ← → d'un contrôle au suivant (le champ de taille compte pour un : ← → y
  déplacent le curseur, puis passent au voisin) ; ↓ ouvre un volet (Alt+↓ celui des tailles) ; Tab circule dans le
  volet ; Échap ferme le volet, puis rend la toile.
- **En bas à droite** (hors application) : « volets : lot 4 / lot 4 bis » montre le même volet dans l'ancien dessin,
  pour comparer ; thème ; « sans nom » (lecture seule : pas de barre).

## Les choix

- **Une grammaire, quatre groupes, toujours dans cet ordre** : l'objet (teinte, remplissage, trait…) | le texte
  (police, taille, gras, italique, souligné, barré, couleur, position) | l'arrangement (plan, verrou) | les actions
  (dupliquer, supprimer). Chaque sorte remplit les groupes qu'elle a. Le groupe « texte » est identique partout où
  il y a du texte (note, forme, tableau, connecteur, groupe, sélection mixte) ; seul le dernier bouton, la position,
  change de volet selon l'objet. Pas de texte sur un équipement : son nom vient de la donnée.
- **Un volet est la barre repliée en rangées** (le retour n° 5). Même fond, même bordure forte, même ombre courte, mêmes
  coins (10), même marge de 4, des contrôles de 28 aux coins de 6, le même état « posé » (relevé et cerné, jamais
  cyan) et le même ergot, pointé vers le bouton qui l'a ouvert. Avant, le volet prenait le fond et l'ombre de
  l'inspecteur, avec des pistes de 30 : deux familles côte à côte. Le titre d'un volet a la hauteur d'une rangée : le
  réglage à gauche, la valeur posée à droite, l'aperçu au survol.
- **Un champ est creusé, un bouton est posé.** Le champ de taille (et ceux de la marge, de l'interligne, de la place
  d'une étiquette) a un fond plus sombre que la barre : on tape dedans. C'est la grammaire du champ « scrub » de
  l'inspecteur, à la hauteur de la barre.
- **Un choix s'applique tout de suite et le volet reste ouvert** : on essaie, on compare, Échap ou un clic dehors le
  ferme.
- **Le volet ne masque jamais l'objet**, ni le tracé d'un connecteur sélectionné (un obstacle dur pour la barre et pour
  le volet). S'il ne tient pas du côté libre, la barre passe de l'autre côté de l'objet le temps du volet (elle revient
  à la fermeture). En dernier recours, il se pose à côté de la barre.
- **Un choix exclusif vit dans une piste creusée**, comme le champ de taille et la grille de position : dans un volet,
  ce qui se creuse se règle, ce qui est posé se lit.
- **« Modifier l'étiquette » quitte la barre de la forme** pour laisser la place au texte : on édite au double-clic,
  par Entrée ou F2 (comme sur la note). C'est un écart au lot 4 validé, à confirmer.
- **Parité barre ⊆ fiche, inchangée** : tout ce que la barre règle, la section Texte de l'inspecteur le règle aussi
  (italique, souligné, barré, marge, interligne, couleur à douze teintes y entreront avec le lot).
- **Les italiques sont de vrais italiques** (Inter Italic, JetBrains Mono Italic), pas un penché synthétique :
  environ 200 Ko de polices de plus dans `app.js` (latin et latin étendu), si l'italique est retenu.

## Contrat ou interface : chaque réglage

« Interface » : le contrat `Intent` 1.5.0 le permet déjà, seule la barre (ou la toile) le bridait. « Ajout » : un
champ additif du contrat, une mineure `Intent` (1.6.0, à coordonner avec le lot 9 qui prévoit aussi 1.6.0) ;
`upgraded()` relit un document antérieur avec la valeur par défaut, et le dessin d'un document existant ne change pas.

| Réglage | Objets | Contrat aujourd'hui | Ce qu'il faut |
|---|---|---|---|
| Taille libre 8 à 64 | note, forme, tableau, connecteur, groupe | `text_size` / `label_size` entier 8-64 | interface (la barre n'offrait que 12 / 13 / 15) |
| Police sans / mono | tous | `text_font` / `label_font` | interface |
| Gras (et graisse normal / demi-gras / gras) | tous | `text_weight` / `label_weight` | interface (B bascule gras ↔ normal) |
| Couleur : encre ou teinte de l'objet | tous | `text_color` / `label_color` ∈ `ink`, `hue` | interface |
| Couleur : l'une des douze teintes | tous | non | **ajout** : `LabelColor` élargi aux noms de `Hue` (valeurs d'énumération ajoutées) |
| Alignement horizontal | note, forme, tableau | `text_align` | interface (la barre ne faisait que le cycle) |
| Alignement vertical | note, forme | `text_valign` | interface (absent de la barre) |
| Neuf positions, dedans ou dehors | groupe | `label_position`, `label_placement` | interface (la barre n'avait pas « dehors ») |
| Italique | tous | non | **ajout** : `text_italic` / `label_italic`, booléen, défaut faux |
| Souligné | tous | non | **ajout** : `text_underline` / `label_underline`, booléen, défaut faux |
| Barré | tous | non | **ajout** : `text_strike` / `label_strike`, booléen, défaut faux (question 1) |
| Marge intérieure | note, forme | non (8 fixe, `PAD` dans `canvas/annotations.ts`) | **ajout** : `text_padding`, entier 0-64, défaut 8 |
| Interligne | note, forme | non (1,35 fixe, `lineHeight`) | **ajout** : `text_line_height`, entier 100-300 (%), défaut 135 |
| Place de l'étiquette sur le tracé | connecteur | non (toujours au milieu) | **ajout** : `label_at`, entier 0-100 (%), défaut 50 |
| Côté de l'étiquette | connecteur | non (toujours sur le trait, sur fond) | **ajout** : `label_side` ∈ `above`, `on`, `below`, défaut `on` |
| Taille au-delà de 64 | tous | borne 64 | non proposé ; élargir la borne serait un ajout |

Rendu en SVG, tout est faisable sans mesurer le texte : `font-style: italic`, `text-decoration` (souligné et barré,
tracés par le navigateur ; une ligne tracée à la main reste possible pour l'export du lot 11), ancres
`start | middle | end`, interligne et marge dans le retour à la ligne existant (chasse estimée). La place d'une
étiquette sur le tracé se lit sur le chemin (`getPointAtLength`).

## Questions pour Orhan

1. **Italique, souligné (et barré) : sur toute la boîte maintenant, attendre le texte riche par caractère du lot 15,
   ou les deux ?** Recommandation : **les deux**. La boîte maintenant (trois booléens du contrat), parce que c'est ce
   qu'on attend d'une barre : un clic, tout le texte de l'objet. Le lot 15 ajoutera plus tard, dans une note, le
   marquage d'un mot (Markdown restreint), qui se superpose au style de la boîte. Le barré : le garder (coût nul, utile
   pour « retiré » ou « plus d'actualité »).
2. **Couleur du texte : élargir aux douze teintes**, en plus de l'encre et de la teinte de l'objet ? Recommandation :
   oui (une note jaune au texte rouge pour une alerte) ; toujours des teintes nommées, jamais une valeur libre.
3. **« Modifier l'étiquette » quitte la barre de la forme** (écart au lot 4 validé) pour faire place au texte : on
   édite au double-clic, par Entrée ou F2, comme une note. D'accord ? Recommandation : oui ; l'étiquette reste éditable dans la
   fiche.
4. **Justifié ?** Recommandation : **non pour l'instant**. En SVG, il faut placer chaque mot à la main sur une largeur
   estimée (jamais mesurée) : rendu inégal, pour des notes courtes où il n'apporte rien.
5. **L'étiquette d'un connecteur : position libre en % le long du tracé et côté (au-dessus, sur le trait,
   au-dessous), comme prototypé, ou seulement départ / milieu / arrivée ?** Recommandation : le % libre avec les trois
   repères, qui valent 10, 50 et 90 % (pas 0 et 100 : l'étiquette ne se pose pas sur la pointe ni sur l'objet).

Pris sans question, réversible : **une seule marge pour les quatre côtés** (deux champs doubleraient le volet pour un
besoin rare).

À juger à l'usage (pour `docs/a-juger-a-l-usage.md`) : Ctrl+B / I / U sous Firefox (marque-pages, infos de la page,
source : la page les intercepte, comme Google Docs, à vérifier) ; Ctrl+Maj+< sur un clavier AZERTY (la touche < > donne
« > » avec Maj : réduire se fait par Ctrl+<, sans Maj ; le prototype accepte les deux) ; la barre qui passe de l'autre
côté de l'objet quand un volet ne tient pas (une revue la juge déroutante, l'autre ne la relève pas ; l'alternative,
choisir le côté de la barre à la sélection en réservant la hauteur du plus grand volet, la poserait souvent loin de
l'objet) ; la densité de la barre d'un connecteur (17 commandes, dont 8 pour l'étiquette).

## La revue de design

Deux critiques indépendantes (skill impeccable) : 28 / 40 puis 30 / 40, détecteur sans constat sur la barre ni les
volets. Corrigé : la barre et le volet couvraient le tracé du connecteur sélectionné (obstacle dur désormais) ; la grille
3 × 3 ne dessinait pas l'axe vertical (cadre et 5 px de course, titre « milieu gauche ») ; l'état enfoncé et l'état
mixte étaient sous 3:1 (filet à `--ink-3`, `#6b7889` en clair) ; B ne s'enfonçait pas sur du demi-gras et le perdait ;
champs marge et interligne de largeurs différentes ; chevron de taille à 20 px (24) ; volet du connecteur sans
libellés ; choix exclusifs sans piste ; filets de la barre presque invisibles ; listes à 32 au lieu de 28 ; icône
« aligner à gauche » sur le bouton « aligner et répartir » (icône neutre). Laissé : la barre qui change de côté
(ci-dessus) ; la forme différente des sélecteurs police (bouton) et taille (champ), voulue (on choisit une police, on
tape une taille) ; l'ombre du volet collé à la barre ; seize valeurs proposées plutôt que douze.

## Captures

1440 × 900, thème sombre, sauf la 10. `0-avant-note.png` et `0-avant-clair.png` : la barre réelle du lot 4 (recopiées
de `.impeccable/planche-lot-4/`). `1-note-barre-texte` (taille tapée, italique et souligné au raccourci),
`2-volet-taille` (seize valeurs, aperçu au survol), `3-volet-position` (neuf cases, marge réglée à la poignée,
pointillé dans la note ; la barre est passée sous la note pour laisser le volet ouvert sans la masquer),
`4-forme-volet-police` (police et graisse, chaque nom dans sa police), `5-connecteur-etiquette` (étiquette posée
au-dessus du tracé), `6-selection-mixte` (note, forme et connecteur : « — », tirets, volet de couleur « mixte »),
`7-groupe-etiquette` (étiquette dehors, la barre ne la couvre pas), `8-comparaison-volet-lot4` et
`8-comparaison-volet-bis` (le même volet, ancien et nouveau dessin), `9-clavier` (Alt+T, → →, ↑ ↑ : la taille passe
à 18), `10-clair-1280` (thème clair, volet position).

Refaire : `node scripts/icons.mjs` (si la liste d'icônes change), `node scripts/build.mjs`,
`python3 scripts/capture.py`. Sources : `src/` (gabarit, deux feuilles de style, sept modules) ; `index.html` est
construit.
