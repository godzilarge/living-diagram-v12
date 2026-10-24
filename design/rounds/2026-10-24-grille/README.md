# Banc « grille » : la vue Contrôle en tuiles libres

Une page autonome construite à partir de la maquette retenue (`design/comps/shell/control.html`, direction A,
« le registre »), ses quatre widgets posés sur une grille libre : chacun se déplace par son en-tête et se
redimensionne par ses bords et ses coins, la disposition est mémorisée dans le navigateur. Bibliothèque :
**react-grid-layout 2.3** (Grafana, Kibana, Metabase l'utilisent). Hors produit, gitignoré ; les sources et les
captures sont versionnées dans `design/rounds/2026-10-24-grille/`.

## Lancer

```
cd bac-a-sable && python3 -m http.server 8016 --bind 0.0.0.0
```

Puis `/grille/` (G3), `/grille/?d=g2`, `/grille/?d=g1` (`?theme=dark`, `?accent=c`, `?density=b`, `?bench=0` cache la barre). Reconstruire :
`cd bac-a-sable/grille-src && python3 build.py && npm run build` (écrit `bac-a-sable/grille/`). Captures et sondes
des gestes : depuis `app/`, `node ../bac-a-sable/grille-src/capture.mjs`, sorties dans `.impeccable/planche-grille/`.

La barre de banc, en bas : Clair / Sombre, Cobalt / Encre, **G3 · G2 · G1**, **Registre V0 … V4**,
**Libre / Verrouillée**
(verrouillée : ni poignée ni glissé, la page telle qu'un lecteur la verrait), **Réinitialiser** (la maquette), le
contrôle mesuré après chaque geste (« 16 / 16 px ✓ » : 16 px des bords, 16 px entre voisins, aucun chevauchement,
sinon la première anomalie en rouge) et la taille de la fenêtre.

## Les directions

- **G3, libre et défilante** (2026-10-24, après le regard d'Orhan sur G1 et G2) : la page défile, les tuiles se
  posent librement sans compaction ni chevauchement (la règle du plateau de G1, sans fond : il y a toujours de la
  place en bas, donc on peut toujours réorganiser) ; pendant le glissé rien d'autre ne bouge et le cadre de la
  place cible passe en rouge là où le dépôt sera refusé ; **Resserrer** ferme les trous une fois, à la demande.
  Son Verdicts est **celui de l'application** (brique 7a : lignes de 56 px sur deux lignes, la règle repliée sous
  la phrase), avec une seconde densité **Verdicts 64** à comparer dans la barre (64 px, 4 px entre les deux
  lignes, titres de groupe à 44 px, cibles à 32 px). G1 et G2 restent pour comparer, avec le même Verdicts.

- **G1, bornée à la fenêtre** : un plateau de 12 colonnes × 24 rangs sous la rangée du haut, la page ne défile
  jamais. Les tuiles se posent librement comme des fenêtres sur un bureau : aucune compaction, jamais de
  chevauchement (un dépôt sur une place occupée revient en arrière, un redimensionnement s'arrête au voisin ou au
  bord du plateau : la hauteur cède d'abord, puis la largeur). Pour agrandir une tuile il faut d'abord faire de
  la place. Le plateau suit la fenêtre : la même disposition en parts se redessine à 13 pouces, les rangs rétrécissent.
- **G2, la page défile** : 12 colonnes, rangs de 32 px (48 avec la gouttière), compaction verticale (une tuile
  déposée s'insère, les autres descendent), la grille est aussi haute que ses rangs et la fenêtre défile. Les
  hauteurs sont en pixels : à 13 pouces la disposition est la même, on défile davantage.

Commun : la gouttière est de 16 px ; un en-tête se saisit (ses commandes exceptées) ; huit poignées (quatre coins
marqués d'un petit L, quatre bords invisibles au curseur) ; la place cible en cadre line-2 pointillé ; 240 ms sur
l'ease du design (1 ms en mouvement réduit) ; une tuile adapte son en-tête et ses colonnes à sa largeur (sous
640 px Verdicts replie son filtre en icône et sa colonne Règle) ; le fondu du bas n'apparaît que si le contenu
déborde ; **Agrandir** (`maximize-2`, un bouton par tuile) pose la tuile sur tout l'espace au-dessus d'un voile,
Échap ou le bouton la remet ; minimum 3 colonnes × 3 rangs.

## Les cinq registres de Verdicts (2026-10-24, soir)

Orhan, sur G3 : « le tableau Verdicts, c'est mieux mais je ne suis pas convaincu : la donnée n'a pas l'air bien
organisée, ça manque de structure entre les éléments ». Diagnostic : le nombre est dit deux fois (dans la phrase et
dans la colonne Combien), la seconde ligne mêle un identifiant et une catégorie, rien ne s'aligne, et le regroupement
par sévérité éclate un même sujet. Cinq structures dans la barre (`Registre V0 … V4`, `?reg=v3`), mêmes données
(`src/verdicts.js`, extraites de la maquette), les bascules de sévérité filtrent chacune :

- **V0** l'actuel (l'application, brique 7a) : deux lignes, 56 px, la règle sous la phrase.
- **V1 colonnes** : un vrai tableau, sévérité | verdict (la phrase sans son nombre) | règle | code | combien.
- **V2 le nombre en tête** : le nombre à 17 px à gauche, la phrase à côté, le code et la règle dans le détail.
- **V3 par règle** : sections par famille (Câbles, Agrégats, États, Voisins…) titrées en corps 600, la sévérité en
  marque sur chaque ligne, la phrase avec son nombre, le code à droite, 44 px.
- **V4 la phrase seule** : sections par famille, la phrase sans son nombre, le nombre dans la colonne de comptes, le
  code, la règle et la sévérité dans le détail.

## Ce qu'Orhan a vu (2026-10-24, G1 et G2)

G1 : « sauf bug, on ne peut jamais réorganiser » : exact, ce n'est pas un bug, le plateau de départ est plein et sans
compaction rien ne bouge avant d'avoir réduit une tuile ; « Agrandir » lui plaît. G2 : la liberté de placement lui
plaît, mais le glissé saccade (la compaction recalculait toutes les tuiles à chaque mouvement, animées en 240 ms).
Commun : la Couverture est soignée et lisible, Verdicts trop condensé ; or le banc montrait le registre de la maquette
(44 px), pas celui de l'application (56 px) : corrigé, deux densités à comparer. D'où G3.

## Risques, honnêtement

- **G1** : sans compaction, faire de la place est un geste de plus (réduire avant de déplacer) ; des trous peuvent
  rester ; pendant le glissé le cadre de la place cible se dessine même là où le dépôt sera refusé (la tuile revient
  alors à sa place : à juger, un cadre rouge ou absent dirait le refus avant de lâcher) ; à 13 pouces les rangs font 12,7 px et une tuile de 7 rangs ne montre plus qu'une ligne : ce que chaque
  tuile montre dépend de l'écran, ce que G2 évite en défilant.
- **G2** : la page défile, ce que la coquille n'a jamais fait (les îlots flottent sur une carte) ; une tuile
  déposée fait descendre les autres, ce qui surprend la première fois ; une grande fenêtre peut laisser du vide
  sous la grille.
- **Les deux** : la bibliothèque place les tuiles par style calculé (`transform`), ce que notre garde « jamais de
  style en ligne » devra admettre pour elle ; le glissé par l'en-tête entre en conflit avec le tri par en-tête de
  colonne s'il arrive un jour dans l'en-tête du widget (il est dans le tableau aujourd'hui) ; la disposition est
  par navigateur jusqu'aux comptes.

## Si une direction est retenue : ce qu'il faudra écrire dans `DESIGN.md`

- La disposition est une **préférence de navigateur** (`ld-prefs`, un champ par vue : `checkTiles`), jamais une
  intention, jamais dans l'adresse ; « Réinitialiser » dans les Réglages du widget ou de la vue.
- **Layout** : la grille de Contrôle (12 colonnes, gouttière 16, G1 : 24 rangs en parts de la hauteur ; G2 : rangs de
  32 px), les minimums, la règle d'adaptation d'une tuile à sa largeur (requête de conteneur).
- **Primitives nouvelles**, une décision chacune : la poignée de redimensionnement (coin marqué, bord au curseur),
  la place cible d'un glissé (cadre line-2 pointillé), l'en-tête saisissable, l'état agrandi d'un widget (voile et
  ombre layer, comme le focus du panneau).
- **Motion** : 240 ms sur l'ease du design pour un changement de place ou de taille, rien pendant le geste.
