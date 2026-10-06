# 09 — Le placement mémorisé : conception (2026-10-06)

**Statut : plan annoncé le 2026-10-06 après le « Tu peux y aller » d'Orhan (session autonome) ; écrit puis codé le même
jour (store, `GET` et `POST /api/placement`, `ld placement`, placement en deux temps dans la toile, « replacer » confirmé
dans `/view` ; test de bout en bout uvicorn + Chromium sur deux runs) ; revue indépendante consignée et traitée le même
jour (`docs/revues/2026-10-06-placement-memorise.md` : précondition de révision, renvoi des envois échoués, stubs à leur
place, épingles hors mémoire). Les détails se corrigent au premier rendu sur une vraie infrastructure.**
En une phrase : **chaque infrastructure retient la place de chaque équipement déjà dessiné, et une nouvelle run ne place
que les nouveaux.**

Références : les quatre couches de `docs/00` §3 (C1 dérivé, recalculable) ; la phase 3 « placement seedé N-1 » de
`docs/00` §10 ; la limite connue de `docs/08` §0.8 (seuls les équipements épinglés étaient stables entre deux runs) ; la
toile `engine/README.md`.

---

## 0. Pourquoi

Le placement de la toile est déterministe (même snapshot ⇒ même dessin) mais repartait de zéro à chaque run : les positions
de départ sont tirées du **rang** de chaque nœud dans la liste triée, un seul équipement ajouté décale tous les rangs
suivants. Mesuré le 2026-10-06 sur le générateur synthétique, un switch d'accès ajouté entre deux runs : **68 %** des
équipements non touchés bougent de plus d'une longueur de câble à 24 équipements, **100 %** à 100 (médiane 7,7 longueurs) ;
avec cinq épingles, les autres bougent encore (75 % et 92 %). Une position de départ tirée du nom plutôt que du rang ne
règle rien (92 % et 83 %) : le force-dirigé est sensible à tout. « Pas touché = ça me convient » ne vaut donc que pour la
run regardée : à la suivante, l'équipement est ailleurs sans que personne n'ait rien fait. Pour un diagramme stable, il
fallait tout épingler.

## 1. Ce que ce document décide

1. **Figé plutôt que seedé.** Un équipement qui a une place mémorisée la garde **exactement** : zéro dérive, et le dessin
   d'une run ne dépend pas de l'ordre dans lequel les runs ont été regardées. L'essai « seedé » (départ aux positions
   d'avant, chaleur réduite) laissait encore glisser les nœuds de 0,15 longueur de câble par run, et chaque regard aurait
   réécrit la mémoire. Le prix : le dessin se dégrade avec le temps (trous, nouveaux venus serrés) ; **« replacer » repart
   de zéro** et renouvelle la mémoire.
2. **Une donnée dérivée et jetable, un document par infrastructure, côté serveur.** `<archive>/_placement/<infra>/
   placement.json`, à côté de l'intention : tout le monde voit le même dessin. La perdre coûte un replacement, aucune
   épingle (celles-ci vivent dans l'intention, C2). Donc : **pas de cinquième contrat** dans `ld-contracts` (formes typées
   dans `backend/src/ld_backend/placement.py`, présentes dans OpenAPI, types TS écrits à la main comme le rapport
   d'ingestion), ni journal, ni auteur. Écarté : la mémoire dans le navigateur (`localStorage` : par personne, par poste,
   perdue ; deux ingénieurs verraient deux dessins) ; le rejeu de la chaîne des runs à l'ouverture (coût linéaire en runs,
   et une run recorrélée ou ingérée en retard redessinerait tout) ; un calcul côté Python à l'ingestion (deux
   implémentations du placement, ou Node dans le backend : refusé depuis la toile).
3. **Écrit par la page `/view`, la première place est celle qui reste, et une page ne complète que le document qu'elle a
   lu.** Le placement se calcule dans le navigateur ; la page envoie, après chaque dessin, les équipements qu'elle a placés
   **sans** mémoire, avec la révision du document lu avant de dessiner (`base_revision`) ; le serveur n'entre que ceux qui
   n'ont pas encore de place (premier dessin gagnant), ne réécrit rien quand la requête n'apporte rien, et **refuse (409,
   avec le document courant) une requête faite sur un document qui a changé depuis** : sinon deux premières pages ouvertes
   sur deux runs différentes mêleraient deux dessins incompatibles (revue, H1 : le nouveau switch de l'une se mémorisait
   exactement sur un switch de l'autre). Refusée, la page adopte le document courant, replace ses nouveaux venus autour de
   lui et renvoie, trois fois au plus. Aucun nom requis, seulement le jeton : c'est une donnée calculée, pas une intention.
4. **L'intention gagne toujours sur la mémoire, et la mémoire n'est pas une copie de l'intention** : un équipement
   épinglé se dessine à son épingle et **n'est pas mémorisé** (il n'a pas été placé par la page) ; retirer l'épingle le
   place par les forces près de ses voisins, et c'est alors qu'il est mémorisé (revue, B1). Un glissé sans nom
   (déplacement local) est oublié par « oublier les déplacements locaux », qui rend chaque équipement à sa place mémorisée
   sans rien replacer.
5. **Les voisins inconnus ne sont jamais mémorisés** (périmètre V1 : l'infrastructure, jamais les endpoints) et **les
   afficher ne déplace plus aucun équipement** : le placement se fait en deux temps (§3). Un voisin inconnu qui a une
   place (un équipement retiré de la collecte survit en stub, `docs/07` §6) se dessine là où il était (revue, M2). Un nœud
   sans câble (rangé sous le graphe) n'a pas de place à retenir non plus ; une place mémorisée, elle, le garde là où il
   était s'il perd ses câbles (un équipement injoignable ne saute plus sur l'étagère).
6. **Pages `ld render`** : depuis l'archive, le document est embarqué en lecture seule (un équipement nouveau est placé
   dans la page, dit « non mémorisé (page sans serveur) ») ; depuis un fichier bundle, rien ne change (aucune mémoire).
7. **« Replacer »** recalcule tout autour des épingles enregistrées et **remplace le document** ; dans `/view` c'est pour
   tout le monde, donc le bouton demande confirmation dans la page. `ld placement --forget` est la sortie en ligne de
   commande, et la seule pour un document corrompu (isolé, jamais écrasé en silence, 500 qui nomme la commande).

## 2. Règles

| | Règle |
|---|---|
| **P0** | Une place est keyée par le `hostname` du nœud, à l'octet ; entière, bornée à ±1 000 000 (mêmes types que l'épingle). Un équipement au plus une fois ; le document est trié par `hostname` (refusé sinon : `place_duplicate`, `places_not_sorted`). 10 000 places au plus. |
| **P1** | Lire ne crée rien : une infrastructure jamais dessinée se lit comme le document vide (`revision` 0). |
| **P2** | `POST` sans `replace` : n'entrent que les équipements sans place ; rien n'est écrit si rien n'entre (ni révision, ni fichier). Avec `replace` : le document devient exactement `places`, `revision + 1`. Dans les deux cas, si la requête apporterait quelque chose et que `base_revision` n'est pas la révision courante : **409**, corps = document courant, rien d'écrit. Sous verrou de fichier et de fil, écriture atomique, comme l'intention ; les deux hors de la boucle d'événements. |
| **P3** | Dans la toile, les nœuds fixés sont : les places mémorisées, puis les épingles (enregistrées puis locales), qui gagnent. Les autres sont placés par les forces. Positions rendues **entières** : ce qui est mémorisé est exactement ce qui est dessiné. |
| **P4** | Compléter un dessin (`extend`) : un nœud libre part du barycentre de ses voisins déjà placés, de proche en proche, décalé d'un pas de spirale ; chaleur de départ réduite (0,5 longueur au lieu de 1,5) ; deux nœuds fixés ne se calculent rien. Un dessin neuf (aucune place), voisins inconnus masqués, est celui d'avant au centime près (arrondi) ; voisins inconnus affichés, il change par construction (deux temps : l'infrastructure ne leur fait plus de place). |
| **P5** | Ce que la page vient de placer par les forces et qui n'est ni voisin inconnu, ni fantôme, ni rangé sous le graphe, ni tenu par une épingle entre dans la mémoire de la page, puis part vers l'API si la page en a l'écrivain (coquille servie, document lu). Un fantôme ou un voisin inconnu mémorisé se dessine là où il était, jamais mémorisé lui-même. |
| **P6** | Après une réponse, le document que l'API renvoie **est** la mémoire de la page (une réponse plus ancienne que le document déjà lu est ignorée) : un équipement dessiné ailleurs que sa place, ou sans place alors qu'il en mérite une, et non épinglé, est replacé, et ce que la page place repart. Un envoi échoué garde ce qu'il portait et le renvoie au prochain dessin ; un envoi refusé (409) ou accepté sans retenir ce qu'il portait est repris trois fois au plus, puis la page s'arrête et le dit. Pendant qu'un « replacer » attend sa réponse, les réponses des envois d'avant ne réalignent pas la page. |

## 3. Le placement en deux temps (toile)

1. **L'infrastructure** (équipements, externes, fantômes du diff) : fixée par ses épingles puis ses places mémorisées,
   le reste placé autour (`layout.run(infra, edges, fixed, { extend: mémoire non vide })`). Ce qui vient d'être placé
   entre dans la mémoire.
2. **Les voisins inconnus**, autour de l'infrastructure toute fixée (`extend` toujours). Ils ne pèsent donc jamais sur
   la place d'un équipement : avec ou sans eux, l'infrastructure est au même endroit, et la mémoire ne dépend pas de ce
   que la vue montrait.

Mesuré sur le générateur (2026-10-06) : un switch ajouté ⇒ **0 équipement déplacé** à 24, 100 et 500 équipements ; le
nouveau se pose à 1,2 à 2,2 longueurs de ses cœurs, à plus de 0,4 longueur de tout autre nœud. Temps à la jauge (521
nœuds d'infrastructure, 1 337 avec les voisins inconnus) : dessin neuf 0,32 s, complété 0,12 s, voisins inconnus 0,75 s.

## 4. Branchement

| Où | Quoi |
|---|---|
| `backend/src/ld_backend/placement.py` | `Place`, `Placement`, `PlacementWrite` (formes typées, OpenAPI), `PlacementStore` (`load`, `record`, `forget`), `PlacementCorruptError`, `PlacementLimitError` |
| `backend/src/ld_backend/files.py` | `locked`, `write_atomically` : partagés avec le store d'intention (extraits de `intent.py`) |
| `GET /api/placement?infrastructure=` | le document ; vide si jamais dessiné ; 500 (`ld placement --forget`) si corrompu |
| `POST /api/placement?infrastructure=` `{"base_revision": 3, "replace": false, "places": [{"hostname", "x", "y"}]}` | 200 le document résultant ; 409 le document courant (la page avait lu une autre révision), rien d'écrit ; 404 sans run archivée ; 413 (`LD_MAX_INTENT_BYTES`, même borne) ; 415 ; 422 sans valeur |
| `ld placement --infrastructure X [--forget]` | lire ; ou retirer le document (lisible ou non) |
| `ld render --infrastructure X --run-id Y` | la page embarque le document (clé `placement`, lecture seule) ; en mode fichier, rien |
| `engine/src/canvas/layout.ts` | `run(ids, edges, fixed, { extend })`, `wired(ids, edges)`, positions entières |
| `engine/src/canvas/graph.ts` | `state.placed`, placement en deux temps, `onPlaced`, `replaceAll`, `syncPlaces` ; `resetPins` ne replace plus rien |
| `engine/src/shell/placement.ts` | l'hôte côté page : file d'envoi, en attente (`pending`) renvoyé, 409 ⇒ adoption et renvoi borné, ligne d'état, infobulle et confirmation de « replacer » |
| `engine/src/shell/shell.ts` | lit `/api/placement` avec le snapshot ; `Placer` (200, 409 = périmé avec le document, sinon échec) ; sans document lu, rien ne s'écrit |

## 5. Ce qui se voit

- Ligne d'état sous le graphe : « 25 équipements placés et mémorisés », « 1 équipement placé et mémorisé », « placement
  recalculé et mémorisé pour tout le monde », « … non mémorisés : l'API ne répond pas (renvoyé au prochain dessin) »,
  « … sur un placement qui a changé entre-temps : replacé autour du nouveau… », « … placés ici, non mémorisés (page
  sans serveur) ».
- En-tête : « placement mémorisé indisponible : … » quand le document ne se lit pas (la run s'ouvre quand même, mémoire
  de la page seule, rien ne s'écrit).
- « Replacer » : dans `/view`, « confirmer : replacer » / « annuler » ; infobulle qui dit que c'est pour tout le monde.

## 6. Questions parquées (comportement prudent en place)

- **Q1 — Un premier dessin pauvre fige un mauvais placement** (exportateur en cours de mise au point : première run sans
  câbles, puis la vraie). Aujourd'hui : « replacer » ou `ld placement --forget`. À voir au premier rendu réel si un
  seuil (mémoire couvrant moins de la moitié des équipements ⇒ dessin neuf) est utile.
- **Q2 — Un équipement recâblé vers un autre site reste où il était**, avec un long câble. C'est voulu (l'œil voit le
  changement) ; le glissé-épingle ou « replacer » corrigent.
- **Q3 — Mémoire d'un fantôme.** Un équipement retiré se dessine là où il était s'il a une place (en fantôme, ou en
  stub s'il survit par une description) ; sans place (jamais dessiné avant), il est placé mais jamais mémorisé. Une
  place orpheline reste (l'équipement peut revenir) ; « replacer » l'efface.
- **Q4 — Première vue avec les changements d'un diff.** Les fantômes participent au premier temps du placement quand les
  changements sont affichés (`?from=` sans `#diff=0`) : la place mémorisée d'un équipement nouveau peut dépendre de la
  run d'avant choisie et de l'adresse. Assumé : premier dessin gagnant.
- **Q5 — Précondition de révision** : tranchée par la revue (H1) pour les deux modes, `record` comme `replace` ; deux
  « replacer » simultanés : le second est refusé, adopte le premier et le dit (« replacer à nouveau si besoin »). La
  question `docs/08` Q5 (intention) reste ouverte, elle.
