# Prototype du lot 4 : la barre contextuelle flottante

Une page autonome qui montre la barre de réglages rapides posée au-dessus de l'élément sélectionné, sur un morceau
de toile factice. Rien ici n'est du code de l'application : c'est pour juger le rendu avant d'écrire le lot
(`docs/11-audit-ui-edition-et-plan.md` § Lot 4).

## Ouvrir

`file:///home/otosun/development/applications/demo/living-diagram-v12-biturbo/.impeccable/prototype-lot-4/index.html`

Aucune ressource externe : polices (Inter et JetBrains Mono, celles de l'application) et icônes Lucide sont dans la page.

## Ce qu'on peut faire

- **Cliquer** une note, une forme (« Baie 12 »), un tableau, l'image, la flèche, le cadre « Salle B — rangée 4 », un
  équipement : la barre de cette sorte apparaît au-dessus. Un câble ou le cluster HA : pas de barre (ils viennent de la
  donnée).
- **Maj + clic** : sélection multiple, mixte ou non ; la barre propose « aligner et répartir » (un bouton, un volet de
  deux rangées), grouper, teinte.
- **Teinte** et **alignements** agissent vraiment ; la plupart des réglages aussi (taille, gras, remplissage, bordure,
  coins, tracé, pointes, épaisseur, plan, verrou, en-tête, ligne et colonne, dupliquer, supprimer, épingler, grouper).
  Ctrl+Z / Ctrl+Y annulent.
- **Glisser** un élément : la barre disparaît, revient 120 ms après la relâche. **Glisser le fond** ou **molette** : la
  barre suit, à taille d'écran.
- **Maj tenue** : la barre s'efface (pour viser un Maj + clic). **Alt+T** : focus dans la barre, **← →** pour la
  parcourir, **↓** ouvre un volet, **Échap** ferme le volet puis rend la toile.
- Le **RT-01** touche le haut de la zone : sa barre passe dessous.
- En bas à droite (hors application) : **variante A / B** pour D10, thème, « sans nom » (lecture seule : pas de barre).

Captures (1440 × 900 sombre, sauf la 5) : `1-note` (volet des teintes, « ambre → violet » au survol), `2-connecteur`
(barre ancrée au milieu du tracé, décalée pour ne pas couvrir la note), `3-multi` (sélection mixte, volet « aligner et
répartir », infobulle avec raccourci), `4-equipement` (barre passée dessous), `5-clair` (1280 × 800, thème clair, volet de
la bordure), `6-groupe` (position de l'étiquette 3 × 3), `7-variante-b` (le même volet depuis la barre du haut),
`8-glisse` (barre absente pendant un glissé), `9-clavier` (Alt+T, → →), `10-tableau`, `11-image`. Les refaire :
`node scripts/icons.mjs` (si la liste d'icônes change), `node scripts/build.mjs`, `python3 scripts/capture.py`.
Sources : `src/` (gabarit, feuille de style, script) ; `index.html` est construit.

## Les choix et leur raison

- **Un rectangle aux coins de 10, pas une capsule.** La barre porte des commandes ; la capsule est réservée aux faits
  (règle des pastilles). Marge intérieure de 4 : les coins des boutons (6) sont concentriques.
- **Plus relevée que la barre du haut, et un ergot.** Fond `--bg-elev-2` et bordure forte en sombre, blanc opaque et
  bordure forte en clair (la barre du haut est en verre) : on ne confond pas « agir sur la toile » et « agir sur ceci ».
  L'ergot pointe l'ancre, même quand la barre s'est décalée.
- **Où elle se pose.** Au-dessus de la sélection, sinon dessous ; un connecteur seul s'ancre au milieu de son tracé (sa
  boîte englobante peut être grande et vide). Elle évite de couvrir une annotation visible (puis une carte, moins
  pénalisée) : dessus d'abord, puis dessous, centrée, sinon décalée juste assez, sans lâcher l'ancre. Limite : si tout
  est couvert, elle prend la place la moins couvrante ; les volets, eux, n'évitent rien.
- **Les alignements en un bouton.** Huit glyphes presque identiques côte à côte ne se lisaient qu'au survol : un bouton
  « aligner et répartir » ouvre un volet de deux rangées (gauche, centre, droite, répartir horizontalement ; haut, milieu,
  bas, répartir verticalement), chaque case a son infobulle avec son raccourci (Alt+A, H, D, W, V, S ; Alt+Maj+H, V).
  Répartir n'apparaît qu'à partir de trois éléments.
- **Une seule couleur dans la barre : celle de l'objet.** Le bouton teinte montre sa pastille ; le remplissage se montre
  à la teinte de l'objet. L'actif est relevé (`--ctl-on`), jamais cyan ; le cyan ne sert qu'au focus clavier.
- **La valeur sur le bouton quand elle tient** (pointes, tracé, coins, remplissage, bordure) : on lit l'état sans ouvrir.
  Taille du texte (icône `a-large-small`), épaisseur et style du trait gardent une icône d'usage ; la valeur se lit dans
  l'infobulle et le volet. Teintes mêlées : un disque coupé en deux teintes.
- **Un coin en bas à droite** (5 px, `--ink-3`) des boutons qui ouvrent un volet : ils proposent, ils n'agissent pas seuls.
- **Le volet s'ouvre du côté opposé à la sélection** (au-dessus quand la barre est au-dessus) : l'objet reste visible
  pendant qu'on survole les teintes. Le titre du volet dit la valeur posée, et « ambre → violet » au survol.
- **Une ombre plus courte que celle des panneaux** (`--shadow-fbar`) : la barre colle à l'objet, elle ne flotte pas loin.
- **Mouvement** : 150 ms, 4 px depuis l'objet, à l'apparition seulement ; disparition immédiate pendant un geste ; fondu
  seul sous mouvement réduit.

## À trancher par Orhan

1. **D10** : A (alignements dans la barre flottante seulement, recommandé : la barre du haut garde annuler, vue,
   insertion) ou B (aux deux endroits).
2. **Sens des volets** : du côté opposé à la sélection (prototype) ou toujours sous le bouton (spécification) ?
3. **Le coin des boutons à volet** : le garder, ou rien (Miro n'en met pas, Office oui) ?
4. **Sans nom (lecture seule)** : aucune barre (prototype), ou une barre réduite (centrer ; masquer / isoler pour un
   équipement) ?
5. **Une barre sur un équipement seul ?** Sur un équipement on lit surtout câbles et ports ; la barre (teinte, épingle,
   grouper, note, connecteur, masquer / isoler) recouvre des liens et les pastilles ACTIF / PASSIF pour des écritures
   rares. La garder, ou rien (la fiche suffit) ?
6. **Une grosse sélection** (30 équipements au rectangle, zoom 0,55) : la barre se pose en haut de la zone, loin de
   tout. Une barre « contextuelle » qui ne touche plus son contexte vaut-elle mieux que des alignements restés dans la
   barre du haut (ce qui rouvrirait D10) ?
