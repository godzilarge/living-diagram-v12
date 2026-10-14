# Prototype du lot 8 : repères d'alignement, aimant aux objets, mettre en grille

Une page autonome pour juger, avant toute ligne du projet, ce qu'on voit pendant un glissé (repères, cotes d'espacement)
et le geste « mettre en grille ». Le rendu de la toile, de la barre contextuelle et du volet est celui du prototype validé
du lot 4. Rien ici n'est du code de l'application (`docs/11-audit-ui-edition-et-plan.md` § Lot 8).

## Ouvrir

`file:///home/otosun/development/applications/demo/living-diagram-v12-biturbo/.impeccable/prototype-lot-8/index.html`

Aucune ressource externe : les polices (Inter, JetBrains Mono) et les icônes Lucide sont dans la page.

## Ce qu'on peut essayer

- **Glisser une carte** (ou la note, la forme « Baie 12 », le cadre « Salle B ») : un repère apparaît quand un bord ou le
  centre s'aligne avec une autre carte, une annotation ou un cadre, à 8 px d'écran près, et la carte s'y colle. Un repère
  par axe, et le centre passe avant un bord.
- **Espacement égal** : posez un accès au bout de la rangée « Salle B » (à droite de DC01-ACC-03). Les trois écarts de 60
  se cotent et la carte se cale sur le même écart. Ça marche aussi entre deux voisins, et à la verticale.
- **Ctrl tenu pendant le glissé** : ni repère ni aimant, la pastille dit « libre ». Le réglage « libérer » du cadre
  Prototype permet d'essayer Alt à la place (question 1).
- **Sélection multiple** : Maj + clic, ou **Maj + glisser le fond** (rectangle). Glissez-la : c'est sa boîte englobante
  (quatre équerres) qui s'aligne.
- **Redimensionner** la note ou la forme par ses poignées : le bord tiré s'aligne sur les bords des autres.
- **Aimant à la grille** (bouton aimant, en bas à gauche) : il ne joue que sur l'axe que les repères n'ont pas pris.
  **Guides** (bouton règle, juste dessous) : allumés par défaut, ils se coupent d'un clic.
- **Flèches** : la sélection bouge d'un carreau (Maj : cinq), sans repère.
- **Mettre en grille** : sélectionnez les douze accès en désordre (Maj + glisser le fond autour d'eux), ouvrez
  « aligner et répartir » dans la barre contextuelle. Survolez la section du bas : chaque place à venir s'affiche avec le
  nom de l'équipement qui ira là. Ensuite, réglez les colonnes (− +) et l'ordre (par nom ou à l'écran), puis cliquez.
  Le même geste existe au clic droit sur la sélection et par **Alt+G**. Ctrl+Z annule tout le geste.
- En bas à droite (hors application) : thème, touche qui libère, **couleur des repères** (sélecteur pour essayer une autre
  teinte, « rétablir »), remise en désordre de la scène.

Les glissés s'annulent par Échap pendant le geste et par Ctrl+Z ensuite.

## Captures

Elles sont en 1440 × 900 sombre, sauf mention. Les glissés sont capturés bouton tenu.

- `1-repos` : la scène au repos.
- `2-guide-centre` : repère de centre.
- `3-guide-bord` : repère de bord et espacement vertical, au zoom 1.
- `4-espacement-egal` : les trois écarts de 60 et le centre de la rangée.
- `5-multi-glisse` : une sélection de trois glissée d'un bloc.
- `6-redimension` : le bord droit tiré jusqu'à celui de la note.
- `7-volet-grille` : le volet ouvert et l'aperçu.
- `8-grille-resultat` : le résultat de la grille.
- `9-menu-contextuel` : l'entrée « mettre en grille » au clic droit.
- `10-clair-1280` : l'espacement égal, en clair et 1280 × 800.
- `11-libre` : un glissé Ctrl tenu.
- `12-sombre-1280` : le repère de centre, en sombre et 1280 × 800.

Pour les refaire : `node scripts/icons.mjs` (si la liste d'icônes change), `node scripts/build.mjs`, puis
`python3 scripts/capture.py`. Les sources sont dans `src/` ; `index.html` est construit.

## Les choix de rendu

- **Une seule couleur nouvelle, `--guide` : un vert chartreuse** (`#c6f03a` en sombre, `#4f7a00` en clair ; contraste
  sur la toile de 14:1 et 4,5:1, pour un seuil de 3:1 sur un trait). Les autres teintes sont déjà prises dans cette
  toile : le rouge dit « erreur », le rose dit « changé » (diff), le cyan dit « sélection », l'ambre et l'orange disent
  « avertissement ». Un premier essai en magenta (la couleur des repères d'Illustrator) se lisait comme le rose du diff :
  la revue l'a relevé et c'était juste. La couleur se change en un seul endroit (`src/style.css`, section « Lot 8 »).
- **Un trait plein de 1 px**, net au demi-pixel. Le tiret est déjà pris (câble documenté, cadre de groupe, cluster HA).
- **Le repère ne barre jamais un nom** : il s'interrompt sur les cartes et les annotations qu'il traverse. Un repère de
  bord longe les objets qu'il aligne et porte une petite croix à chaque coin aligné. Un repère de centre s'arrête au bord
  des objets, ce qui suffit.
- **La cote d'un écart égal est une capsule** (une distance est un fait) posée dans l'écart, entre deux butées. Si l'écart
  est trop étroit pour elle, elle sort au-dessus.
- **Une sélection glissée montre sa boîte englobante en quatre équerres** à la couleur de la sélection. Un rectangle
  complet semblait enfermer les cartes non sélectionnées.
- **La pastille du geste** (X, Y ; L × H en redimensionnement ; « libre » sans aimant) se pose dessous, dessus, à
  droite ou à gauche, à la première place qui ne couvre ni une carte ni un repère.
- **Pendant un glissé, l'estompage de la sélection s'allège** (0,62 au lieu de 0,32) : on vise des cartes qu'il faut
  lire. Celles avec lesquelles on s'aligne repassent à pleine opacité.
- **« Mettre en grille » vit dans le volet « aligner et répartir »**, sous un filet : deux réglages nommés (colonnes,
  ordre), puis l'action en pleine largeur avec son raccourci. Il apparaît à partir de trois éléments, comme « répartir ».
  L'en-tête du volet dit le résultat avant de cliquer (« 12 → 4 × 3 »).
- **L'aperçu de la grille** : chaque place à venir est une carte en contour cyan, presque opaque, qui porte le nom de
  l'équipement qui ira là. Les éléments actuels s'effacent dessous (0,3). Au clic, ils glissent jusqu'à leur place en
  240 ms ; avec « réduire les animations », ils y vont directement.
- **Le menu contextuel n'affiche pas d'aperçu** : il recouvrirait les places. L'entrée agit directement, et Ctrl+Z
  annule.
- **Cellule de la grille = la plus grande boîte + 60**, départ au coin haut gauche de la sélection, aimantée à la grille
  si l'aimant est actif. Les cadres et les connecteurs ne bougent pas.

## À trancher par Orhan

1. **Quelle touche suspend l'aimantation pendant un glissé : Ctrl (recommandé) ou Alt (spécification) ?** Alt +
   glissé veut déjà dire « cloner » depuis le lot 3. Si Alt suspendait aussi l'aimant, un clone ne pourrait jamais se
   poser aligné, alors que c'est l'usage courant (glisser un clone, puis Ctrl+D répète l'écart). Figma et tldraw
   suspendent avec Ctrl. Ctrl + clic garde son sens (ajouter à la sélection) : Ctrl n'est lu qu'une fois le glissé
   commencé.
2. **La couleur des repères : chartreuse (recommandé), ou le rouge ou rose de la spécification ?** Le rouge se lit
   comme une erreur, le rose comme un changement du diff ; le magenta a été essayé et se confondait avec le rose. Le
   sélecteur en bas à droite permet d'en essayer d'autres sur la vraie scène.
3. **L'ordre de la grille par défaut : par nom (recommandé) ou à l'écran (spécification) ?** Sur un placement en
   désordre (le premier dessin automatique), l'ordre de lecture est arbitraire : dans le prototype, il donne 04, 05,
   07, 06… Un ingénieur range des switchs d'accès par nom. Les deux restent au choix dans le volet. Je recommande que le
   dernier choix soit gardé comme préférence du navigateur.
4. **Les colonnes par défaut : le moins de cases vides (recommandé) ou la formule de la spécification ?** Pour 12
   éléments, la formule ⌈√(1,6 n)⌉ donne 5 colonnes, avec une dernière rangée de 2. La règle recommandée cherche entre
   √n et cette formule : elle donne 4 × 3 pour 12, et 5 × 4 pour 20. Le pas à pas « − + » permet de régler à la main
   dans les deux cas.

À ajouter à `docs/a-juger-a-l-usage.md` si le lot est codé : Alt+G (mettre en grille) dans le navigateur d'Orhan, et le
seuil de 8 px (trop collant, ou pas assez, sur une grosse infrastructure).
