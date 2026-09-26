# Revue indépendante — B1 R4 : agrégats, faisceaux, domaines MLAG, clusters HA (2026-09-26)

Rapport rendu tel quel par le relecteur (agent indépendant, sondes exécutées, aucun fichier du dépôt modifié
hors ce rapport). Suivi en fin de document.

---

Périmètre : `backend/src/ld_backend/correlate/structures.py`, `ha.py`, `checkbuild.py`, `assemble.py`, `__init__.py`,
`tests/correlate/test_structures.py`, refus `aggregate_member_duplicate` dans `contracts/src/ld_contracts/models_interfaces.py`.
Référence : `docs/05` §2.4, §2.5, R4, §4, §5 (scénarios 2, 3, 8) ; contrat de sortie `contracts/src/ld_contracts/snapshot/`.

État constaté : `tests/correlate` vert (`correlate/` couvert à 100 %), `contracts` vert (ruff propre des deux côtés).
**La suite `backend` complète est rouge d'un test**, `tests/test_render.py::test_the_viewer_passes_its_node_tests`
(`TypeError` dans `overview`, `inspect.js:181`) : c'est le visualiseur en cours d'incrément B (assets `render/` modifiés,
`structures.js` non suivi), pas B1 ; noté pour mémoire, hors périmètre de cette revue.

Sondes exécutées depuis `backend/` avec `PYTHONPATH=. uv run python`, scripts dans le scratchpad de session
(`probe_r4.py` P1–P22, `probe_r4b.py` P23–P38, `probe_seed_r4.py` déterminisme, `probe_fix.py` corrections vérifiées).
Chaque sonde est une mutation de `contracts/fixtures/bundle-minimal.json` via les helpers de `tests/correlate/conftest.py`
(`variant`, `run`, `interface`, `lldp_doc`, `task_subject`) ; les mutations sont recopiées ci-dessous pour être rejouables.

## Critique

Aucun. **Aucun chemin trouvé vers un refus du contrat de sortie** (`reference_unknown`, `reference_inconsistent`,
`duplicate_identity`, `reported_by_not_a_member`, `heartbeat_not_a_member`) : voir « Vérifié et trouvé correct ».

## Haut

**H1 — Un peer-link câblé vers un stub ou un externe neutralise le repli par `mlag_id` : le domaine disparaît en
silence.** `structures.py:140-149` (`_peer_pairs`) retient la paire `{sw-core-01, unknown-peer}` dès que les câbles du
peer-link mènent à un seul autre hôte, quel qu'il soit ; `sw-core-01` entre alors dans `paired` (`:160`) et le repli
« hors de toute paire » (`:168-175`) l'exclut. Résultat : vPC 20 présent sur les deux cœurs, **zéro domaine, zéro
contrôle**. Sonde P5 (LLDP des cœurs sur Eth1/1–1/2 retiré, descriptions à `null`, puis
`lldp_doc(CORE_1, "Ethernet1/1", "unknown-peer", "Ethernet1/1")` et idem Eth1/2) :
```
links Po10 core-01 : [[sw-core-01/Ethernet1/1, unknown-peer/Ethernet1/1], [sw-core-01/Ethernet1/2, unknown-peer/Ethernet1/2]]
domaines : 0
```
P36 (même chose vers `rt-wan-01`, device d'une autre infrastructure) : 0 domaine. Un voisin résolu en stub
(`neighbor_name_ambiguous`, nom annoncé ≠ inventaire) suffit à faire disparaître une structure entière du snapshot,
sans trace : contraire à « jamais de désaccord résolu en silence ».
**Correction (vérifiée, `probe_fix.py`)** : une paire n'a de sens qu'entre deux devices porteurs de documents
`aggregates[]` :
```python
with_docs = {a.hostname for a in aggregates}
...
if len(others) == 1 and next(iter(others)) in with_docs:
```
P5 et P36 donnent alors `domain 20 [(sw-core-01, port-channel20), (sw-core-02, port-channel20)] peer_link=(sw-core-01,
port-channel10) downstream=fw-edge-01`, les tests existants passent. Ajouter P5 en test.

## Moyen

**M1 — Un membre HA connu de `devices` sous une autre infrastructure, jamais cité par LLDP / CDP, est retiré du cluster
sans aucun constat.** `ha.py:147` filtre la clé sur `known_hosts` (devices en périmètre + voisins cités) ; la docstring
(`ha.py:4-5`) affirme que « le constat `ha_member_unknown` du contrat d'entrée le dit déjà », or ce constat ne vise
que les noms absents de `devices` (`checks.py:153`). Sonde P1 (`devices` += `fw-dr-09` en `infra-dr`, ajouté aux
`members` du document `ha` de `fw-edge-01`) :
```
cluster [fw-edge-01, fw-edge-02] ; ha_member_unknown : 0 ; ha_view_mismatch : 0 ; fw-dr-09 absent des nœuds
```
Le rapporteur dit trois membres, le snapshot en montre deux et rien ne le signale. Cas plausible : cluster HA à cheval
sur deux infrastructures (site de secours), ou device rangé sous la mauvaise `infrastructure` dans `devices`.
**Défaut pur : le silence.** Deux voies pour le lever, à trancher : (a) le membre est un device connu, il devient un
nœud `external` comme un voisin d'une autre infra cité par LLDP (`_cited_node` existe déjà, `NodeEvidence.seen_by`
admet le vide ; `node_hostnames` s'étend aux membres HA présents dans `ctx.devices`) — rien d'inventé, aucun nouveau
code ; (b) le retirer mais l'écrire (nouveau code de catalogue, puisque `ha_member_unknown` est `origin = bundle`
et refusé à B1 par `check_origin_mismatch`). Dans les deux cas corriger la docstring. Recommandation : (a).

**M2 — `null` compte comme un désaccord : `ha_view_mismatch` sur une priorité ou un nom de cluster non lus.**
`ha.py:46` (`_agreed`) et `ha.py:56` (`_member`) comparent les valeurs brutes, `None` compris. Doctrine du projet
(2026-09-19) : « `null` n'affirme jamais un fait ». Sonde P2 (`fw-edge-02` répond : mêmes rôles et états,
`cluster_name: null`, `priority: null` sur les deux membres) :
```
ha_view_mismatch field=cluster_name views=[{fw-edge-01: EDGE-CLUSTER}, {fw-edge-02: None}]
ha_view_mismatch field=member member=fw-edge-01 (priority 200 / None)
ha_view_mismatch field=member member=fw-edge-02 (priority 100 / None)
cluster_name retenu : EDGE-CLUSTER (premier rapporteur) — mais None si l'ordre des hostnames était inverse
```
Trois warnings pour un exportateur qui n'a pas lu la priorité sur un membre (Gaia ClusterXL n'a pas de priorité au
sens FortiOS), et un `cluster_name` qui dépend du hasard alphabétique des rapporteurs. **Défaut pur** pour la
comparaison : ne confronter que les valeurs non nulles (`{v for _, v in views if v is not None}`), par champ
(`role`, `state`, `priority` séparément plutôt que le triplet). **À trancher** pour la valeur retenue : garder la vue
propre si elle est non nulle, sinon la première valeur non nulle des autres rapporteurs (rien d'inventé : c'est une
valeur rapportée), sinon `null`. Test à ajouter.

**M3 — Deux agrégats du même device avec le même `mlag_id` : aucun domaine, aucun contrôle.**
`structures.py:166` (`len(left) == 1 and len(right) == 1`) et `:174` écartent le cas sans rien dire. Sonde P4
(`sw-core-01` reçoit `port-channel21`, membre `Ethernet1/5`, `mlag_id: 20` comme `port-channel20`) :
```
aggregates avec mlag_id 20 : [(sw-core-01, port-channel20), (sw-core-01, port-channel21), (sw-core-02, port-channel20)]
domaines : 0 ; contrôles MLAG : aucun
```
Un numéro de vPC / MLAG est unique par device (NX-OS, EOS, Junos MC-AE le refusent à la configuration) : deux fois
le même numéro est un défaut de parseur, pas une topologie. **Règle douteuse, à trancher** : le refuser au contrat
d'entrée (`mlag_id_duplicate`, même famille que `member_in_several_aggregates` : « B1 n'a pas à choisir »), ce qui
est cohérent avec le principe du 2026-09-20 ; ou, si Orhan connaît une plateforme où c'est légal, un contrôle.
Comportement prudent en attendant : documenter dans `docs/05` R4 que le cas ne forme pas de domaine.

## Bas

**B1 — Un peer-link correctement étiqueté qui porte aussi un `mlag_id` reçoit `mlag_pair_direct_link`
(« peer-link mal étiqueté »).** `structures.py:155` ne retire pas les agrégats `mlag_peer_link = true` des
candidats ; la paire (Po10, Po10) tombe dans `beams` (`:191`). Sonde P3 (`mlag_id: 10` sur les deux Po10, flag
inchangé) :
```
domain 20 … ; check mlag_pair_direct_link [sw-core-01/port-channel10, sw-core-02/port-channel10] {mlag_id: 10}
```
Le contrôle dit le contraire de la donnée. Rare (aucun constructeur ne numérote son peer-link) mais **défaut pur**.
Correction vérifiée (`probe_fix.py`) : `with_id = [a for a in aggregates if a.mlag_id is not None and not
a.mlag_peer_link]` ; le test existant du peer-link mal étiqueté (flag à `false`) reste vert.

**B2 — Heartbeat à deux câbles menant tous deux à un membre : `heartbeat_link_not_observed` sans détail alors que
deux câbles sont observés.** `ha.py:81-88`. Sonde P9-b (LLDP `fw-edge-01/ha1 → fw-edge-02/ha1` et `→ fw-edge-02/ha2`) :
```
hb fw-edge-01 ha1 None ; heartbeat_link_not_observed info {} (+ multiple_observed_neighbors)
```
Le libellé du catalogue (« sans câble observé ni documenté ») est faux ici : câbles observés mais ambigus. Décision 4
acceptée (aucun choix), mais porter `details.candidates = [clés des câbles]` pour que la page ne dise pas « non
observé ». P9-a (un câble vers un membre, un vers un tiers) choisit bien l'unique câble vers le membre.

**B3 — Peer-link étiqueté d'un seul côté : domaine formé, rôles `mlag_peer_link` sur une seule moitié, aucun
contrôle.** Sonde P29 (`mlag_peer_link: false` sur le Po10 de `sw-core-02`) : domaine 20 avec
`peer_link = (sw-core-01, port-channel10)`, `roles` sur `sw-core-01/Ethernet1/1` seulement, contrôles MLAG vides.
Les deux devices ne disent pas la même chose du même faisceau ; rien n'est choisi à la place de l'autre (les deux
`mlag_peer_link` restent lisibles sur `aggregates[]`), donc pas un silence au sens strict. **Parquer** : un contrôle
« flag d'un seul côté d'un faisceau » demanderait un code ; à voir sur bundle réel.

**B4 — `aggregate_protocol_mismatch` en `error` sur un faisceau purement documenté.** Sonde P37 (fixture de
référence, `agg-core` en `static`) : les deux contrôles portent sur des faisceaux dont tous les câbles sont
`documented_only` (le FortiGate n'a pas de LLDP, `sw-core-01` n'en a pas pour Eth1/3). Orhan a dit les descriptions
de production peu fiables : une erreur fondée sur elles seules pèse lourd. **Parquer**, comportement prudent : ajouter
`details.cable_statuses` (statuts distincts des câbles du faisceau) pour que la page qualifie l'erreur ; le catalogue
n'admet qu'`error`, une sévérité par statut serait une décision de contrat.

**B5 — Split-brain : un membre dit l'autre `down`, l'autre se dit `up` ⇒ la vue propre prime et `ha_member_down`
disparaît, il ne reste qu'un warning.** Sonde P22 (`fw-edge-02` répond, se dit `up`, `fw-edge-01` le dit `down`) :
```
fw-edge-02 secondary up 100 reported_by (fw-edge-01, fw-edge-02)
ha_view_mismatch field=member member=fw-edge-02 ; ha_member_down : aucun
```
Conforme à la décision 3, mais c'est précisément la signature d'un cluster cassé (heartbeat perdu, les deux
répondent) et l'erreur est absente. **Parquer** ; comportement prudent proposé, additif et sans rien résoudre :
émettre `ha_member_down` dès qu'**un** rapporteur dit `down` (`details.reported_by` = ceux qui le disent), l'état
retenu restant la vue propre.

**B6 — Domaine dont un seul agrégat a des câbles : `downstream` jugé sur une moitié, aucun contrôle.**
`structures.py:193` : `_other_hosts(left) | _other_hosts(right)` ; si `right.cables == ()`, `downstream` = l'aval de
`left` seul, sans `mlag_downstream_inconsistent`. Visible via `aggregates[].cables` vide et, souvent,
`aggregate_member_not_bundled`. **Parquer** (cas « une patte du vPC non câblée / non observée »), documenter dans
`docs/05` R4.

**B7 — Couverture de tests.** Non couverts : H1 (peer-link vers stub / externe), M1 (membre hors périmètre), M2
(`null` contre valeur), M3 (même `mlag_id` deux fois sur un device), B1 (peer-link avec `mlag_id`), B2 (deux câbles
vers des membres), B3, P23 (membre écrit dans une autre casse : retiré + `ha_member_unknown`, correct), P35 (boucle
intra-device entre deux membres du même agrégat : un câble, faisceau (X, X) muet, aucun plantage, correct), P38 (deux
rapporteurs, deux heartbeats, un seul câble : les deux `HeartbeatInterface` pointent le même câble, correct).
`test_structures_are_order_independent` ne renverse que quatre sections et ne varie pas `PYTHONHASHSEED` : ajouter
une variante R4 (deux rapporteurs HA + seconde paire) à `test_review2.py::test_h1_same_bytes_whatever_the_hash_seed`.

## Vérifié et trouvé correct

- **Contrat de sortie, par contrainte** : `aggregates[].hostname` ∈ nœuds (un document de topic vise toujours un device
  du périmètre, `bundle.py:107-120`) ; `cables` ⊆ liens et touchent un membre du document (même filtre `end.hostname
  == doc.hostname and end.interface in names` des deux côtés, `structures.py:71` / `integrity.py:69`) ; `members`
  triés et sans doublon (refus `aggregate_member_duplicate` ajouté à l'entrée, testé) ; `degraded` calculé comme le
  contrat ; domaines : membres dans `aggregates[]` avec le même `mlag_id`, devices distincts, `peer_link` flagué et d'un
  des deux devices, `downstream` un nœud (issu d'un bout de lien) ; clusters : rapporteur toujours en périmètre donc
  toujours membre (`reported_by_not_a_member` et `heartbeat_not_a_member` impossibles), `reported_by` unique (un
  document `ha` par hostname, `bundle.py:130`), câble de heartbeat pris dans les liens du port exact ; `refs` des
  contrôles toujours de deux sortes ou de deux identités distinctes (faisceau (X, X) écarté avant l'émission) ;
  comptes = tailles des sections ; ordres canoniques identiques aux clés de `snapshot.py:69-75`.
- **Chemins exotiques sans plantage** : membre HA stub cité par LLDP (P8 : membre du cluster, nœud `stub`,
  `ha_member_unknown` présent) ; membre écrit dans une autre casse (P23) ; document `aggregates[]` présent alors que
  le topic est `failed` (P21 : le document fait foi, faisceau et protocole jugés) ; membre d'agrégat absent de
  `interfaces[]` (P20 : référence repliée sur le nœud, `member` dans `details`) ; hub sur un membre (P20 : deux câbles
  dans `cables`, `downstream` double signalé) ; peer-link dont les câbles mènent à deux hôtes (P18 : pas de paire,
  repli, `peer_link` = l'agrégat dont les câbles mènent bien au pair) ; deux rapporteurs aux ensembles de membres
  différents (P12) et standalone listé par un autre (P13) : deux clusters et `ha_view_mismatch field=members` sur
  chaque cluster, visible.
- **Déterminisme** : `probe_seed_r4.py`, cinq variantes (seconde paire vPC, deux rapporteurs HA en désaccord, trois
  clusters qui se chevauchent, repli sans peer-link, protocole en désaccord + aval double) × `PYTHONHASHSEED`
  ∈ {0, 1, 42, 12345, random} × trois permutations de **toutes** les sections, en sous-processus ⇒ **une empreinte par
  variante**. Lecture du code : aucun parcours d'ensemble non trié n'atteint la sortie (`_peer_pairs` filtre, ne
  produit pas d'ordre ; `_candidates` trie paires et ids ; `flagged` bâti sur les agrégats déjà triés ;
  `_links_by_port` trie les liens ; vues HA dans l'ordre des rapporteurs triés ; `views` de `_overlap_checks` dans
  l'ordre des clés triées).
- **Scénarios 2, 3, 8 de `docs/05`** : conformes (tests) ; rôles `mlag_peer_link` sur les membres des deux cœurs.
- **Décision 1** (agrégat sans document = pas d'entrée) : cohérente de bout en bout (appartenance visible sur
  `interfaces[].aggregate` et `links[].aggregate_*`, faisceau sans protocole muet, `downstream` calculé quand même).
- **Performance** : rien de quadratique sur les liens ; `hosts.count` et `_overlap_checks` sont en O(n²) sur des
  dizaines d'éléments au plus.

## Classement

**Défauts purs (à corriger sans discussion)** : H1 (paire limitée aux devices porteurs de documents), M1 (le silence
et la docstring ; la voie (a) ou (b) reste à trancher), M2 (ne pas confronter `null`), B1 (peer-links flagués hors des
candidats), B2 (`details.candidates`), B7 (tests).

**Règles douteuses (à parquer avec un comportement prudent, visible)** : M3 (même `mlag_id` deux fois : refus
d'entrée ou contrôle), M2 pour la valeur retenue, B3 (flag d'un seul côté), B4 (erreur sur faisceau documenté seul),
B5 (`ha_member_down` dès qu'un rapporteur le dit), B6 (une patte sans câble).

---

## Suivi

Traité le jour même (2026-09-26), backend 279 tests verts, `correlate/` à 100 %, ruff propre.

**Défauts purs, corrigés :**
- **H1** — `_peer_pairs` n'apparie qu'avec un device porteur de documents `aggregates[]` (`structures.py`) ; test
  `test_h1_a_peer_link_cabled_to_a_stub_does_not_swallow_the_domain` (sonde P5) : domaine 20 retrouvé, peer-link
  `sw-core-01 · port-channel10`.
- **M1** — voie (a) : un membre HA connu de `devices` sous une autre infrastructure devient un nœud `external` sans
  témoin (`assemble.ha_members_out_of_scope`, ajouté à `node_hostnames` et à `_nodes`) et reste dans le cluster ;
  docstring de `ha.py` corrigée ; test `test_m1_…` (sonde P1). Un membre absent de `devices` reste retiré, couvert par
  `ha_member_unknown`.
- **M2** — `null` ne contredit rien : `_agreed` et `_member` ne confrontent que les valeurs lues, champ par champ
  (`role`, `state`, `priority` séparément) ; valeur retenue = la vue propre si elle est lue, sinon la première valeur
  lue dans l'ordre des rapporteurs, sinon `null` (rien d'inventé : une valeur rapportée). Test `test_m2_…` (sonde P2).
- **B1** — les agrégats `mlag_peer_link` ne sont plus candidats à un domaine (`_candidates`) ; test `test_b1_…`
  (sonde P3).
- **B2** — `heartbeat_link_not_observed` porte `details.candidates` (bouts d'en face des câbles ambigus) ; test
  `test_b2_…` (sonde P9-b).
- **B7** — tests ajoutés : H1, M1, M2, M3 (comportement parqué figé), B1, B2, B4, B5 ; variante `r4` (seconde paire
  vPC 20, deux rapporteurs HA en désaccord, membre d'une autre infra) dans
  `test_review2.py::test_h1_same_bytes_whatever_the_hash_seed`.

**Règles douteuses, comportement prudent adopté (additif, visible), à trancher avec Orhan :**
- **B4** — `aggregate_protocol_mismatch` reste `error` (sévérité du catalogue) mais porte `details.cable_statuses` :
  la page peut dire qu'il ne repose que sur des descriptions.
- **B5** — `ha_member_down` est émis dès qu'un rapporteur dit `down` (`details.reported_by` = ceux qui le disent),
  l'état retenu restant la vue propre : le split-brain garde son erreur. Test `test_b5_…` (sonde P22).
- **M3** — même `mlag_id` deux fois sur un device : aucun domaine, aucun contrôle ; **proposition à Orhan** : refus
  d'entrée `mlag_id_duplicate` (même famille que `member_in_several_aggregates`). Comportement figé par
  `test_m3_…` en attendant.
- **B3** (peer-link marqué d'un seul côté) et **B6** (une patte du vPC sans câble) — parqués tels quels, documentés
  dans `backend/README.md` § R4 et `docs/05` R4.

Hors périmètre signalé (suite `backend` rouge d'un test du visualiseur) : c'était l'incrément B des pages en cours
d'écriture, vert depuis.
