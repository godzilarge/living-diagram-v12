# Living Diagram v12 — Analyse de fondation

> Phase de recherche / analyse / confrontation — 2026-08-13 (révision : regard neuf).
> Sources : le brief v12, le `prototype_v11.5.html` (analysé §6), et une recherche état
> de l'art + versions vérifiées en ligne ce jour. **L'existant antérieur n'est pas une
> base de travail** — consigne du propriétaire.

---

## 1. La thèse centrale : la toile est un moteur, pas un composant

Le constat du propriétaire est juste : *faire posséder le rendu, le positionnement et la
logique par le framework UI n'est pas le bon outil*. Un framework déclaratif réconcilie
des arbres de composants ; une toile de diagramme vit de gestes à haute fréquence (pan,
zoom, drag, survol qui rallume 300 éléments) et d'invalidations chirurgicales. Marier les
deux force soit à mémoïser chaque référence sous peine d'effondrement, soit à redessiner
le monde à chaque événement. Les deux sont des taxes permanentes.

C'est le pattern éprouvé de tous les éditeurs de diagrammes sérieux (draw.io/mxGraph,
Excalidraw, tldraw, Figma) : **la scène appartient à un moteur autonome ; le framework ne
possède que le chrome autour**.

Décision proposée pour v12 :

- **Le cœur diagramme = un moteur TypeScript pur, sans framework** : modèle de scène,
  placement, routage, LOD, hit-testing, invalidation incrémentale, rendu. Testable en
  node sans DOM, exécutable headless (exports SVG, harnais de captures).
- **React = le shell uniquement** : panneaux, inspecteur, filtres, timeline, listes de
  contrôles — là où le déclaratif excelle (tables, formulaires, états de chargement).
  Jamais dans le chemin chaud de la toile.
- **Frontière explicite** : le shell envoie des *commandes* (charger telle vue, focus,
  filtre), le moteur émet des *événements* (sélection, survol, viewport) ; l'état de vue
  partageable vit dans l'URL.
- **Renderer derrière une interface** (l'idée `TopologyRenderer` du brief initial est la
  bonne) : implémentation **SVG incrémentale** d'abord — texte net, CSS, debug DOM,
  export trivial — avec bascule Canvas possible si un mur de perf apparaît. Le choix de
  la techno de rendu devient réversible, donc sans angoisse.

**Le prix, assumé et chiffré** : posséder la toile = reconstruire viewport, hit-testing,
drag, sélection, marquee (~2-4 semaines de socle ingrat). L'alternative (React Flow &
co.) achète ce socle mais réinstalle le framework dans le chemin chaud et impose ses
conventions à nos rendus spéciaux (agrafes, faisceaux, paliers de LOD, peinture de diff
— qui sont de toute façon du SVG maison). Recommandation : **on paie le socle une fois,
on possède tout ensuite.** À valider (§10.Q5).

---

## 2. La chaîne de risque données/temps

Le brief promet filtres, historique entre runs et retouches persistantes. Tout cela
repose sur une chaîne invisible, qui est le vrai risque du projet — pas le rendu :

```
identité stable → corrélation déterministe → diff crédible → intentions qui tiennent → layout stable
```

Si l'identité d'un équipement ou d'un lien change d'un run à l'autre (hostname vs FQDN,
`Gi1/0/1` vs `GigabitEthernet1/0/1`, stack vu 1 puis N châssis), le diff annonce des
changements fantômes, les retouches deviennent orphelines, la carte saute. **L'historique
est un amplificateur de bruit de collecte** : chaque instabilité de parsing devient un
faux changement affiché, et la confiance des utilisateurs ne s'achète qu'une fois.

Clés d'identité à spécifier avant toute ligne de code :

- **Device** : **hostname = clé CMDB** *(confirmé 2026-08-13 : l'API de collecte tire son
  inventaire de la CMDB à chaque run — aucun inventaire en dur — et les tables sont keyées
  par le hostname réel)*. `serial` en secours futur. Reste à trancher : stacks (1 hostname,
  N châssis) et clusters HA (collecte via VIP → le châssis passif est-il visible ?).
- **Interface** : `(device, ifName)` — canonicité **confirmée en amont** : l'API de
  collecte émet les mêmes noms dans toutes les tables. Reste à vérifier que le
  `port_voisin` des descriptions et le port-id LLDP citent la même forme.
- **Lien L1** : paire d'endpoints triée canoniquement (`device:port—device:port`).
  Jamais d'id synthétique auto-incrémenté. *(Confirmé par l'état de l'art : c'est le
  pattern de toute l'industrie ; il n'existe pas — et il n'y a pas besoin — de « lib de
  diff de graphe » : un diff d'ensembles keyés suffit.)*
- **Canal/agrégat** : `(device, nom de Po)` par extrémité — les numéros de Po sont
  device-local et peuvent différer aux deux bouts ; on ne synthétise jamais un « numéro
  partagé ».
- **Provenance partout** : `discoveredBy: lldp | cdp | description | both | manual` +
  confiance. **Observé** (LLDP/CDP : la réalité du fil) et **documenté** (description :
  l'intention déclarée) sont deux natures de fait — on les croise toujours, et leur
  désaccord est promu en **contrôle d'intégrité**, jamais résolu en silence. Voisin cité
  mais hors périmètre CMDB = **nœud stub** (style distinct) — précisément celui que
  l'utilisateur complètera à la main.

### Acquis données (réponses du 2026-08-13)

- L'API de collecte (FastAPI) émet un **modèle vendor-agnostic** : `l1_interfaces`
  (name, description, type, admin/oper_state, ip, speed, duplex, parent_interface,
  members) + tables lldp, cdp, arp, mac. La normalisation par vendeur **disparaît de
  B1**, remplacée par des **sources d'évidence enfichables** derrière une interface
  commune : descriptions + LLDP + CDP en V1 ; MAC/ARP s'ajouteront sans toucher au reste.
- La base amont **ne garde que la dernière run** → les snapshots (B2) sont stockés par
  Living Diagram, indépendants du schéma amont (voulu par le propriétaire).
- **Descriptions** au format `criticité|device_voisin|port_voisin|options` — la criticité
  est une métadonnée exploitable (filtres, mise en avant, contrôle de cohérence entre les
  deux bouts). Parseur strict + compteur de non-parsables, jamais d'échec silencieux.
- vPC arrivera dans `extra_vars` (concept Cisco, hors modèle commun) ; membres de Po via
  `members` ; subinterfaces (`parent_interface`) et `ip_address` réservés à l'overlay L3.
- **Périmètre en base** : chaque device porte un champ `infrastructure` → le scoping par
  infra se fait directement en base ; la CMDB reste l'enrichissement (building/rack/tags).
  Un device qui change d'infra entre deux runs est lui-même un événement de diff.
- **Stacks** *(décision)* : 1 unité logique → **1 nœud**, badge ×N.
- **Clusters HA (firewalls)** *(décision)* : 2 châssis physiques → **2 nœuds** sur le
  diagramme (« un L1 montre chaque connexion »), regroupés par un cartouche cluster nourri
  par la **table HA** (mode active_passive/active_active, `members_name` = clé CMDB,
  `members_roles`, serials) — qui devient la **4ᵉ source d'évidence** : grouping, rôles,
  contrôle « membre mort », et détection de **bascule HA entre deux runs** (événement de
  timeline). Trou assumé : les **interfaces HA ne sont pas dans le modèle** → la relation
  de peering est rendue comme *logique* (style distinct, provenance `ha_model`), jamais un
  câble inventé ; les liens HA physiques apparaîtront via descriptions/LLDP sur ces ports
  ou un futur enrichissement du modèle. Bonus : les serials de la table HA renforcent
  l'identité au-delà du hostname.
- **Générateur de test** : des **scénarios d'évolution** nommés — une suite de runs avec
  mutations (device ajouté, lien retiré, Po dégradé, membre HA mort, bascule) — pour que
  chaque type de diff et chaque contrôle ait sa démonstration générée de bout en bout.

---

## 3. Le modèle en quatre couches

| Couche | Contenu | Propriétaire | Durée de vie |
|---|---|---|---|
| **0 — Snapshot** | Le graphe collecté d'un run (devices, liens, canaux, provenance, statut de collecte par device) | Corrélation (Python) | Immuable, par run |
| **1 — Dérivé** | Rôles inférés, groupes de redondance, zones, **contrôles d'intégrité** | Analyse (déterministe) | Recalculable, jamais « vérité » stockée à la main |
| **2 — Intention** | Retouches humaines : positions pinnées, nœuds/liens manuels, masquages, notes, corrections de rôle | Utilisateur | Longue, indépendante des runs |
| **3 — Vue** | Zoom, focus, filtres, palier LOD, date/comparaison | Session | Éphémère, encodée dans l'URL |

- **Rendu** = `f(couche 0 ⊕ couche 2, couche 3)` — recalculé, jamais stocké.
- **Diff** = entre couches 0 uniquement (la réalité collectée). Les intentions sont
  signalées à part : on ne mélange pas « l'infra a changé » et « quelqu'un a déplacé une
  bulle ».
- La couche 2 est un ensemble de **patchs déclaratifs keyés sur identités stables**
  (jamais sur des coordonnées, jamais sur un snapshot précis). Merge à l'affichage,
  conflits **surfacés** : patch orphelin (cible disparue) → panneau de réconciliation ;
  lien masqué mais revu par la collecte → reste masqué, badge « toujours détecté » ;
  nœud manuel désormais collecté → proposition de fusion.
- Le nom « **couche d'intention** » (issu du prototype) est adopté : il dit exactement ce
  que c'est — l'écart voulu entre la réalité collectée et le dessin.

**Temporalité à l'écran** : timeline par infra + comparaison A↔B **peinte sur le
diagramme** (disparu = fantôme désaturé tratillé, nouveau = halo, modifié = badge). Trois
encodages visuels qui ne se confondent jamais : structure ≠ télémétrie ≠ temporalité — le
rouge reste réservé aux alarmes. Piège assumé : un device injoignable pendant un run
n'est pas un device retiré — le statut de collecte par device fait partie du snapshot et
le diff distingue « absent des données » d'« absent de l'infra ».

---

## 4. Les contrôles d'intégrité — la brique qui rend le diagramme « vivant »

L'idée la plus forte du prototype, généralisée : **le graphe s'audite lui-même à chaque
run**. Débits hétérogènes dans un canal, identifiants vPC divergents aux deux bouts,
membre unique dans un agrégat prévu à N, mono-attachement d'un équipement supposé
redondé, membres non contigus, half-duplex, lien vu d'un seul côté. Chaque contrôle est :

- calculé **au moment de la corrélation** (Python, déterministe), stocké avec le snapshot ;
- **diffable** : un contrôle qui apparaît ou disparaît entre deux runs est un événement
  d'historique de premier ordre (« le Po20 est devenu mono-membre entre hier et
  aujourd'hui » — l'exemple exact du brief) ;
- projeté partout : liste latérale (survol ↔ toile synchronisés), badge sur le nœud,
  section de l'inspecteur, filtre (« ne montrer que ce qui a une anomalie »).

C'est la différence entre un Visio qui dessine et un outil qui comprend ce qu'il dessine.

---

## 5. Le pipeline du moteur (vue d'ensemble des briques)

```
MongoDB (SDK collecte)      API CMDB (périmètre, building/rack/tags)
        └──────────────┬─────────────┘
                       ▼
   B1 CORRÉLATION (Python, batch/run) → snapshot canonique + contrôles
                       ▼
   B2 SNAPSHOT STORE (immuable) ──► B3 DIFF ENGINE (changements typés A↔B)
                       ▼
   B4 COUCHE D'INTENTION (patchs keyés identité stable, conflits surfacés)
                       ▼
        API REST FastAPI : snapshot ⊕ intention ⊕ diff ⊕ contrôles
   ────────────────────────────────────────────────────────────────────
                       ▼               (frontière réseau)
   B5 ANALYSE (TS pur) : rôles inférés, groupes de redondance, zones dérivées
                       ▼
   B6 SCÈNE (TS pur) : projection par palier LOD → entités visuelles
                       ▼
   B7 PLACEMENT (TS pur) : structure → stratégie → coordonnées (seedées, pins)
                       ▼
   B8 ROUTAGE (TS pur) : ancres, pistes, faisceaux, agrafes
                       ▼
   B9 RENDERER (SVG incrémental, derrière interface) ← interactions (hit, drag, zoom)
   ────────────────────────────────────────────────────────────────────
   SHELL REACT : URL/vues, panneaux, inspecteur, timeline, filtres, réconciliation
```

Chaque étage est une fonction pure sur des structures immuables ; les interactions ne
retraversent que les étages nécessaires (survol → patch de style ; drag → re-routage
local ; changement de palier → re-projection de la scène). **Jamais de redessin complet
par événement** (§6, piège n°2 du prototype).

Le **contrat pivot** (schéma du snapshot, couche 0/1) est le seul couplage Python↔TS :
JSON Schema versionné, types TS générés.

### Sélection et entités de première classe
Nœud, lien, mais aussi **canal** (Po/vPC), **zone**, **groupe de redondance** : chacun a
une identité stable → survolable, sélectionnable, focusable, diffable, adressable par URL.
(Un ingénieur pense « le Po50 vers la baie de stockage », pas « ces deux traits ».)

### LOD à trois paliers (sémantique, pas cosmétique)
`Zones → Faisceaux → Câbles`, piloté par le zoom avec surclassement manuel. Au palier
Zones, les équipements s'agrègent en cartes de zone (compteurs, clic = plonger) ; au
palier Faisceaux, les liens parallèles se replient en un trait « n× » ; au palier Câbles,
tout est déplié — chaque câble physique visible, agrafes de canal, étiquettes de ports.
La scène (B6) émet des **entités différentes par palier** — ce n'est pas du style, c'est
une projection. Note : le repli en faisceau est un artefact du palier *intermédiaire* ;
au palier de travail, les membres physiques restent tous visibles.

### Conventions visuelles retenues (du prototype)
- **Agrafe de canal** : trait perpendiculaire barrant les membres d'un Po près du bord du
  nœud, étiqueté (`Po50 · vPC 101`), cliquable — l'agrégation se voit sans épaissir les
  câbles ni inventer de texte.
- **Façade de ports dans l'inspecteur, jamais sur la toile** : la façade dimensionnait le
  dessin et imposait des diagonales ; c'est une vue de détail d'un équipement, pas un
  élément de topologie. Elle montre aussi les ports **hors périmètre** (hachurés — un
  serveur vu par CDP mais non collecté), ce qui rejoint les nœuds stubs de la corrélation.
- **Inspecteur synchronisé** : survoler une ligne de la table de brassage allume le lien
  sur la toile, et réciproquement.
- **Barre de focus** : profondeur de voisinage (1/2 sauts) + isoler + quitter.

---

## 6. Verdict sur `prototype_v11.5.html`

**À retenir** (intégré ci-dessus) : contrôles d'intégrité ; canal = entité ; agrafes ;
LOD 3 paliers avec cartes de zone ; façade au panneau + ports hors périmètre ; couche
d'intention (concept et nom) ; inspecteur riche synchronisé ; ancrage des ports qui garde
les membres d'un canal adjacents puis trie par abscisse d'en face (réduit les
croisements) ; routage orthogonal par allocation de pistes dans l'inter-rangée ;
esthétique sobre « papier technique » (à confronter à une direction artistique propre).

**À ne pas hériter** :
1. **Les positions sont codées en dur** (`x`, `y` dans les données, colonnes calculées à
   la main). Le problème dur du brief — le moteur de placement — n'y est pas résolu, il
   est esquivé : le prototype démontre des conventions de rendu sur un layout *écrit
   par un humain*. Ne pas s'y tromper.
2. **Redessin complet à chaque événement** : `draw()` détruit et reconstruit tout le SVG
   à chaque survol. Tenable à 18 équipements, mort à 300+. Le moteur v12 doit être
   incrémental dès le premier jour (invalidation ciblée, culling viewport).
3. **Modèle mêlé à la présentation** : zone, coordonnées, groupes déclarés dans les
   données d'équipement. En v12, les zones sont **dérivées** (CMDB, analyse), jamais
   saisies dans la donnée topologique.
4. **Panneaux en DOM manuel** (`createElement` en chaîne) : exactement là où React est
   le bon outil. L'inspecteur du prototype est une excellente *spec produit* et un
   mauvais *code de référence*.
5. Mono-fichier, variables globales, zéro type, zéro test — normal pour un prototype,
   disqualifiant comme base.

---

## 7. Le moteur de placement (le problème dur, affronté)

Le brief refuse les couches scolaires imposées — d'accord : **aucun template en entrée**.
Mais les infras réelles ont une structure, et elle est détectable :

1. **Analyse structurelle** (B5, sur le graphe + la CMDB) : paires/groupes redondants par
   équivalence de voisinage (deux nœuds au voisinage quasi identique + lien peer direct =
   paire MLAG/HA) ; hubs par degré/centralité ; éventails hub→feuilles ; mesh biparti
   (fabric) ; chaînes/anneaux ; communautés (Louvain/Leiden). Briques JS disponibles :
   `graphology-metrics`, `graphology-communities-louvain`, 2-coloration pour le biparti.
   Le graphe est petit (≤ 500 nœuds) : tout se calcule à la volée.
2. **Rôle = une sortie, pas une entrée** : inféré de (type/modèle CMDB : Fortinet 600F →
   firewall ; motifs structurels ; tags), avec confiance. Correction utilisateur →
   couche d'intention → contrainte au run suivant.
3. **Partition d'abord** : building/site/salle (CMDB) puis composantes structurelles ;
   stratégie de placement choisie **par partition** (étagé pour les arbres/hiérarchies
   émergentes, radial pour hub-and-spoke, grille+corridor pour grands éventails, packing
   des composantes) ; liens inter-partitions routés en frontière.
4. **Stabilité inter-runs, la propriété reine** : le placement du run N est seedé par le
   run N-1 (ordres et positions), nouveaux nœuds insérés à perturbation minimale, pins
   d'intention = contraintes dures. Un layout 10 % plus « optimal » qui bouge tout à
   chaque run est pire qu'un layout stable : diff visuel illisible, mémoire spatiale
   détruite.

**Critères d'acceptation mesurables** (à la place de « zéro retouche », invérifiable) :
< 10 % de nœuds déplacés manuellement par diagramme ; 100 % des nœuds inchangés entre
deux runs sans changement structurel les concernant ; corpus golden visuel (captures)
comme oracle de régression.

**Options d'outillage** (recherche vérifiée) : moteur maison au-dessus de `graphology`
(recommandé — le placement est le cœur différenciant et nos formes sont spéciales), avec
`elkjs` 0.12 en option d'appoint — seul moteur OSS offrant nativement incrémental + nœuds
pinnés + ports + partitions, mais licence EPL-2.0 à faire valider par la politique
d'entreprise ; `@dagrejs/dagre` 3.1 (ressuscité, maintenu) pour un éventuel bouton
« re-ranger » ; `libavoid-js` (routage orthogonal incrémental autour d'obstacles) si le
routage maison atteint ses limites.

---

## 8. État de l'art — ce que la recherche établit

**Aucun projet OSS ne couvre l'ensemble** (placement riche + LOD + diff + intentions +
périmètre CMDB). Chaque morceau existe et converge vers ce design :

| Besoin | Référence | Enseignement |
|---|---|---|
| Retouches persistantes | netbox-topology-views (coordonnées en DB + « CoordinateGroups » nommés), Netdisco (liens manuels comblant les trous LLDP) | La couche d'intention généralise des patterns validés |
| Diff peint sur la carte | nextbox-ui / visualize-lldp (`is_new` vert, `is_dead` rouge tratillé), IP Fabric « Compare Snapshot », NVIDIA NetQ (time-travel par timestamp) | L'UX cible existe — la copier sans complexe |
| Snapshots temporels | SuzieQ (snapshots horodatés, requêtes temporelles), Batfish (API différentielle `snapshot` vs `reference_snapshot`) | Forme du stockage et de l'API de diff |
| Versionnement de graphe complet | Infrahub (branch/diff/merge natif sur Neo4j) | Concepts — trop lourd ; notre diff d'ensembles suffit |
| LOD / zoom sémantique | PatternFly react-topology (detail levels, production Red Hat) | À lire avant d'implémenter le palier Zones |
| Toile possédée par un moteur | draw.io/mxGraph, Excalidraw, tldraw, Figma | Le pattern §1 est le standard des éditeurs sérieux |

Verdict réutilisation : **rien à adopter en bloc** — le différenciateur v12 (diff +
intentions + placement ensemble) n'existe nulle part ; on réutilise des briques
(`graphology`, normalisation d'interfaces Python) et des patterns validés.

---

## 9. Stack (versions vérifiées le 2026-08-13)

| Brique | Choix | Version | Note |
|---|---|---|---|
| Moteur diagramme | **TS pur, zéro dépendance framework** | — | testable node, headless, renderer SVG incrémental derrière interface |
| Shell UI | React | **19.2.8** | pin ≥ 19.2.1 (React2Shell — RSC, hors sujet en SPA, on pin quand même) |
| Build | Vite | **8.2** | ⚠️ Vite 8 = Rolldown/Oxc (esbuild/Rollup sortis du défaut) |
| Langage | TypeScript | **7.0** | compilateur Go natif (~10×) ; repli 6.x sans douleur si un outil coince (API stable en 7.1) |
| Routing (URL = vue) | TanStack Router | v1 (1.170.x) | typé, production-grade — la vue partageable du brief |
| Data fetching | TanStack Query | **v5** (5.101.x) | ⚠️ les paquets « v6 » sont Svelte/Solid — piège de naming |
| État shell | Zustand | 5.0.x | pour le shell seulement ; la toile a son propre état dans le moteur |
| Analyse graphe | graphology + metrics + communities | 0.26 | gelé mais stable (~860k dl/sem) |
| Layout d'appoint | elkjs / @dagrejs/dagre | 0.12 / 3.1 | elkjs sous réserve licence EPL-2.0 ; dagre ressuscité et maintenu |
| Repli toile | @xyflow/react | 12.11.3 | **uniquement** si le pari « posséder la toile » est refusé (§10.Q5) |
| API | FastAPI + Pydantic | 0.141 / 2.13 | existant |
| Mongo | **PyMongo Async** | 4.17 | ⚠️ **Motor déprécié (mai 2026, EOL mai 2027)** — vérifier ce qu'utilise le SDK de collecte |
| Tests | vitest + harnais captures Playwright | — | le moteur headless rend les golden screenshots naturels |

---

## 10. Séquencement proposé et questions ouvertes

| Phase | Contenu | Sortie vérifiable |
|---|---|---|
| **0** | Contrat pivot (identités, snapshot, contrôles) + audit des données Mongo réelles | JSON Schema + doc identité + 3 exports réels anonymisés |
| **1** | Corrélation + snapshots + contrôles de base + diff, TDD sur corpus golden (fixtures JSON pures + MongoDB éphémère en container avec générateur d'anomalies — **aucune donnée réelle**) | CLI : Mongo → snapshot ; mêmes entrées = même snapshot ; diffs et contrôles justes |
| **2** | Socle toile : moteur de scène + renderer SVG incrémental + interactions | 500 nœuds / 1 500 liens fluides sur fixtures — **jauge de perf dès ce stade, échec rapide si le pari SVG casse** |
| **3** | Placement : analyse structurelle → stratégies par partition → stabilité seedée | Corpus golden visuel sur infras réelles |
| **4** | Timeline + diff peint sur la toile | « Qu'est-ce qui a changé entre hier et aujourd'hui ? » démontrable |
| **5** | Couche d'intention + édition + réconciliation | Une retouche survit à 3 runs ; conflit surfacé, jamais silencieux |
| **6** | LOD complet (cartes de zone), vues nommées, L3 en overlay | — |

Phases 1 et 2 parallélisables (le socle toile travaille sur fixtures).

**Questions** *(les deux premières bloquent la phase 0 ; run/identité résolues le
2026-08-13, voir « Acquis données » §2)* :

1. ~~Stacks / clusters HA~~ — **résolu 2026-08-13** : stack = 1 nœud badge ×N ; cluster
   HA = 2 nœuds + cartouche via la table HA (voir « Acquis données » §2).
2. **Descriptions réelles** : un échantillon anonymisé (y compris malformées / périmées)
   pour calibrer le parseur et le corpus d'anomalies.
3. **Zones** : la CMDB porte-t-elle une notion de zone *fonctionnelle* (périmètre,
   sécurité, fabric…) ou seulement géographique (building/rack) ? Sinon la zone
   fonctionnelle sera inférée (avec correction possible via la couche d'intention).
4. **Rythme** : fréquence des runs, profondeur d'historique attendue ?
5. **Le pari « posséder la toile »** (§1) : validez-vous le socle interactions à
   construire (~2-4 sem) en échange du contrôle total — ou préférez-vous une lib de
   canvas toute faite avec ses taxes ? C'est LA décision d'architecture front.
6. **Multi-utilisateur** sur la couche d'intention : dernier écrivain gagne + audit
   suffit-il pour v12 (pas de collaboratif temps réel) ?
7. **Palier Zones** : replier les équipements en cartes de zone à l'overview vous
   convient-il, sachant qu'au palier de travail chaque câble physique reste visible ?
