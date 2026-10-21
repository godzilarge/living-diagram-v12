# Banc « tuiles » : redimensionner et réordonner les widgets de la vue Contrôle

Trois pages autonomes, construites à partir de la maquette retenue (`design/comps/shell/control.html` (this copy lives in `design/rounds/2026-10-21-tuiles/`, the bench itself in `bac-a-sable/tuiles/`), direction A,
« le registre ») : même CSS, mêmes données `demo-dc`, police embarquée. Chacune propose une autre façon de mettre
une information au premier plan (Orhan cite « Couverture de la collecte »). Hors produit, gitignoré.

## Lancer

```
cd bac-a-sable && python3 -m http.server 8016 --bind 0.0.0.0
```

Puis `/tuiles/t1.html`, `/tuiles/t2.html`, `/tuiles/t3.html`. Les fichiers s'ouvrent aussi directement dans le
navigateur (aucune ressource externe).

- Reconstruire depuis la maquette : `python3 build.py` (lit `control.html` et `src/`).
- Captures et vérification des gestes : depuis `app/`,
  `LD_CHROMIUM=/opt/pw-browsers/chromium node ../bac-a-sable/tuiles/capture.mjs` (ajouter `--probe` pour rejouer
  chaque geste et lire le contrôle 16 / 16 px), sorties dans `.impeccable/planche-tuiles/`.

La barre de banc, en bas : Clair / Sombre, Cobalt / Encre, T1 · T2 · T3, **Couverture en avant** (applique le geste
de la direction), **Réinitialiser** (revient à la maquette, oublie l'état mémorisé), et le contrôle mesuré après
chaque geste : « 16 / 16 px ✓ » (16 px des bords, 16 px sous la barre du haut, 16 px entre voisins, aucun
chevauchement), sinon la première anomalie en rouge. Paramètres d'adresse : `?state=cov`, `?theme=dark`, `?bench=0`.

## Les trois directions

- **T1, les poignées** : on tire les gouttières (largeur gauche / droite, hauteurs à droite) ; pas de 8 px, flèches
  ± 8 et Maj ± 32 sur la poignée focalisée, double-clic pour revenir à la maquette ; minimum un en-tête et une ligne,
  aucune colonne sous 480 px.
- **T2, les tailles** : le bouton de réglages de chaque widget ouvre un popover à rail, Taille (Compacte, Normale,
  Grande) et Place (Mettre en premier) ; la grille se recompose seule (une grande place, les autres empilées à droite,
  hauteurs réparties à parts équitables).
- **T3, les places** : quatre places fixes (celles de la maquette) ; on tire un widget par son en-tête vers une autre
  place et les deux s'échangent, ou le bouton « Mettre en avant » l'envoie dans la grande place en un clic.

Commun aux trois : un widget adapte son en-tête et ses colonnes à la largeur de sa place (requête de conteneur) ; à
moins de 640 px, Verdicts replie son filtre en icône, met ses sévérités sur une seconde ligne et masque la colonne
Règle. Le fondu du bas n'apparaît que si le contenu déborde (la maquette fondait une dernière ligne entière).

## Ce que chacune donne, Couverture en avant (1440 × 900)

| | Couverture | Ce qui cède |
|---|---|---|
| Maquette | 480 × 315, 4 lignes lisibles sur 30 | — |
| T1 | 912 × 552, 12 lignes | Verdicts en 480 px de large, Sources et Livraison réduites à une ligne |
| T2 | 912 × 804, 20 lignes | Verdicts passe à droite (480 × 315) |
| T3 | 912 × 804, 20 lignes | Verdicts passe à droite (480 × 315) |

T2 et T3 donnent **le même résultat** pour ce cas : la différence est le geste (un menu ou un glissé) et la taille
compacte, que seul T2 offre.

## Risques, honnêtement

- **T1** : des tailles libres cassent la grille, et la place gagnée par l'un est prise à un autre : à 1440 × 900 la
  Couverture n'atteint que 12 lignes, au prix de Sources et Livraison écrasées ; à 13 pouces, moins encore, et une
  disposition réglée sur l'écran de bureau ne tient plus sur le portable. Les deux colonnes ne
  peuvent jamais s'échanger : on agrandit, on ne met pas au premier plan. Trois poignées invisibles au repos : un
  geste à découvrir.
- **T2** : pas de geste, mais trois tailles suffisent-elles ? « Grande » n'est pas une taille, c'est la place de
  gauche (exactement le « Mettre en avant » de T3) ; « Normale » ne se choisit pas, elle se partage ; seule
  « Compacte » est une vraie taille. La grande place n'est jamais vide : sur le widget en grand, Compacte et Normale
  sont désactivées (et l'infobulle dit pourquoi). Un réglage de plus par widget.
- **T3** : le glissé d'un en-tête entre en conflit avec le défilement (au pavé tactile, au doigt) et, demain, avec le
  tri ou une sélection de texte ; un en-tête qui s'attrape est une primitive nouvelle. Des places fixes : Sources dans
  la grande place laisse 700 px vides, Livraison dans la place de Sources défile.

## Si une direction est retenue : ce qu'il faudra écrire dans `DESIGN.md`

- La disposition est une **préférence de navigateur** (`ld-prefs`, un champ par vue, par exemple `controlTiles`),
  jamais une intention, jamais dans l'adresse, jamais partagée entre utilisateurs ; « Réinitialiser » dans le popover
  ou les Réglages.
- **Widget header** : l'action nouvelle (T2 : Taille et Place dans le popover de réglages ; T3 : `LayoutPanelLeft`
  « Mettre en avant », et l'en-tête comme poignée de glissé).
- **Layout** : la grille de Contrôle (une grande place 912 × pleine hauteur, une colonne de 480), la règle de partage
  des hauteurs (T2), les minimums (un en-tête et une ligne), et la règle « un widget s'adapte à la largeur de sa
  place ».
- **Primitives nouvelles**, une décision chacune : la poignée de gouttière (T1 : rail 2 px accent au survol et au
  focus, `separator` au clavier) ; la place cible d'un glissé (T3 : cadre line-2 en pointillés, place d'origine en
  cadre libre, ombre layer pendant le glissé) ; la taille compacte d'un widget (T2).
- **Motion** : 240 ms sur l'ease du design pour un changement de place ou de taille, 1 ms en mouvement réduit ; rien
  pendant le glissé lui-même.
