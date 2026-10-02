# Revue indépendante — R2, forme HA positionnelle des descriptions (2026-10-02)

Rapport consigné tel que rendu par le relecteur (agent indépendant, aucun fichier modifié par lui), suivi en fin de
document.

---

Dépôt : `/home/otosun/development/applications/demo/living-diagram-v12-biturbo`. Suite exécutée : backend `tests/correlate` 200 verts, contracts `tests/snapshot` verts, ruff propre des deux côtés. Aucun fichier modifié ; sondes dans le scratchpad (`probe.py`, `probe2.py`), résultats cités ci-dessous.

## Résumé

La brique fait ce qu'elle annonce sur le scénario 11 : chaque membre lit sa paire, le cas réel motivant fonctionne de bout en bout (sonde : LLDP du cœur vers `agg-core` + forme HA sur `x1` ⇒ `fw-edge-01/x1 ↔ sw-core-01/Ethernet1/3` **confirmé**, `fw-edge-02/x1 ↔ Ethernet1/5` documenté seul, aucun `remote_port_is_aggregate`), le déterminisme tient entre processus (4 graines, 1 empreinte), les `details` sont rendus en texte et le catalogue est cohérent sur ses trois supports (`codes.py`, schéma, `CONTRAT.md`, test `DOCS_05_SECTION_4`).

Le problème de fond est **la reconnaissance « à la forme »** : la grammaire HA recouvre la grammaire V1 dès qu'une description a cinq champs dont le quatrième est de forme nom. Ce recouvrement est purement syntaxique, il n'y a pas de discriminant, et il produit dans un sens un câble V1 perdu (H1), dans l'autre un câble inventé (H2). À côté, le code ne lit que « trop peu de paires » et jamais « trop de paires » (H3), ce qui, combiné au contrat qui prévoit qu'un membre mort disparaît de `members`, décale les rangs en silence. Rien de critique (aucun plantage, aucune corruption), trois hauts, quatre moyens, sept bas.

## Ce qui est bon

- `aggregates.py` (R1-bis, rang 3) profite directement de la forme HA : la description de **chaque** membre pointe désormais vers **son** port de cœur, ce qui résout le cas FortiGate réel sans toucher à R1-bis.
- Raisons structurées, pas de repli sur l'ordre des hostnames (décision respectée), `null` ne contredit rien, vue propre prioritaire : la logique `_priority` est bien alignée sur `ha.py::_member` (lignes 62-66) dans le cas nominal.
- `ha_places` trie tout (documents, clés, listes de clusters) ; aucune itération d'ensemble.
- Tests utiles : priorités égales ⇒ aucun câble côté firewalls mais le cœur documente toujours le sien ; `no_cluster` distinct de `description_unparseable` ; B10 respecté sur `agg-core` ; test JS du rendu de la raison.

## 1. Défauts

### H1 — haut · Une description V1 à options (champ 4 de forme nom) sur un device sans cluster perd son câble

`backend/src/ld_backend/correlate/descriptions.py:62-64` (`_looks_ha`), `:91-93` (`_parse_ha`, `place is None`) ; `docs/05-snapshot-et-correlation.md:330` (« Standalone : forme V1 »).

La grammaire V1 (décision du 2026-09-20, toujours écrite dans `_parse_v1`) dit que le champ 4 « garde ses `|` » : `C2|fw-edge-01|x1|uplink|10G` était une description V1 valide (options `uplink|10G`). Elle a maintenant cinq champs et `uplink` est de forme nom ⇒ `_looks_ha` vrai ⇒ sur tout device qui n'est pas membre d'un cluster, `Unresolved(no_cluster)` : aucun claim.

Scénario (sonde a) : `sw-core-01/Ethernet1/3` décrit `C2|fw-edge-01|x1|uplink|10G`, `fw-edge-01/x1` sans description. Résultat : **aucun câble** sur `Ethernet1/3`, et un `description_ha_unresolved` `no_cluster` sur un switch Nexus qui n'a rien de HA. Avant la brique : câble `documented_only` vers `fw-edge-01/x1`.

Le contrôle existe donc « sans contrôle » n'est pas vrai, mais il est trompeur (il parle de HA sur un device qui n'en a pas) et la doc est fausse : la docstring de `_looks_ha` (« une description V1 à options n'y ressemble pas ») et `docs/05:330` « Standalone : forme V1 » affirment le contraire du comportement. Tous les tests de V1 à options utilisent `a=1|b=2` (le `=` échappe à `NAME_RE`), ce qui masque le recouvrement.

Recommandation (à trancher par Orhan, trois voies) : (i) sans place HA, lire V1 (aucun câble V1 perdu ; `no_cluster` ne subsiste que si on peut l'établir autrement, par exemple document `ha` standalone présent) ; (ii) garder la règle et **écrire noir sur blanc** dans `CONTRAT.md` / `docs/05` que, en V1, un champ 4 de forme nom suivi d'un cinquième champ est lu comme une forme HA (piège documenté) ; (iii) un marqueur explicite de la forme HA dans la convention (mot réservé en tête, par exemple), seule voie sans ambiguïté. Dans tous les cas corriger la docstring et la phrase de `docs/05`.

### H2 — haut · La même V1 à options sur un membre HA invente un câble vers un stub

`descriptions.py:80-88` (`_pairs_found`), `:96-102`.

Scénario (sonde b) : `ha_pair_variant` (priorités 200/100), `x1` des deux membres = `C2|sw-core-01|Ethernet1/3|uplink|10G`. `_pairs_found` compte deux paires (`sw-core-01|Ethernet1/3`, `uplink|10G`) : `fw-edge-01` (rang 0) tombe juste par hasard, `fw-edge-02` (rang 1) **dessine `fw-edge-02/x1 → uplink/10G`**, nœud stub `uplink` créé, seul contrôle `neighbor_unknown` (celui de n'importe quel stub). Câble inventé, sans contrôle spécifique : contraire à « le front n'invente rien ». C'est l'autre face de H1 ; même recommandation.

### H3 — haut · Plus de paires que de membres : lu en silence, rangs décalés quand un membre a disparu de `members`

`descriptions.py:96-101` : seul `found < size` est refusé ; au-delà, les paires surnuméraires sont absorbées dans `options`.

Le contrat prévoit explicitement qu'un membre mort disparaisse de la liste (`contracts/src/ld_contracts/models_ha.py:18-23` : « absent alors qu'il était listé au run précédent : membre mort » ; sur FGCP `get system ha status` ne liste que les unités présentes). Une description écrite pour le cluster physique à n membres se retrouve alors lue contre n-1 membres, et si le membre disparu n'était pas le dernier par priorité, **tous les rangs en dessous se décalent**.

Scénario (sonde c) : cluster physique `fw-edge-00` (200, éteint), `fw-edge-01` (200→ listé 200), `fw-edge-02` (100) ; description `C2|sw-core-01|Ethernet1/1|sw-core-01|Ethernet1/3|sw-core-01|Ethernet1/5`. Résultat : `fw-edge-01` lit `Ethernet1/1` (attendu 1/3), `fw-edge-02` lit `Ethernet1/3` (attendu 1/5) ⇒ câble faux `fw-edge-02/x1 ↔ sw-core-01/Ethernet1/3` dessiné, `options = "sw-core-01|Ethernet1/5"`, **aucun `description_ha_unresolved`**.

Recommandation : symétrique de `fewer_pairs_than_members` : `found != size` ⇒ `Unresolved("more_pairs_than_members", {members, pairs})` (la raison est une chaîne libre dans `details`, pas de changement de contrat ; mettre à jour la liste de `docs/05` R2 et `backend/README.md:432-433`). Comportement prudent : avec un membre manquant on ne sait pas quelle paire manque, donc aucun câble est la lecture honnête. Note : cela ne règle pas H1/H2 (deux options de forme nom ressemblent à une paire), c'est le même recouvrement.

## 2. Cas limites (comportement actuel, recommandation, sans trancher)

### M1 — moyen · Désaccord de priorité sans vue propre : le rang suit l'ordre alphabétique des rapporteurs

`descriptions.py:116-122` ; à comparer à `ha.py:62-75` qui, sur la même donnée, émet `ha_view_mismatch`.

Scénario (sonde d) : trois membres, `fw-01` sans document `ha` (injoignable), `fw-02` dit `fw-01 = 200`, `fw-03` dit `fw-01 = 50`. `_priority` prend la première valeur lue dans l'ordre des hostnames des rapporteurs ⇒ `fw-01` rang 0, `fw-03` rang 1, `fw-02` rang 2 ; avec la vue de `fw-03` ce serait `fw-03`, `fw-02`, `fw-01`. Le code suit la spec (« sinon premier rapporteur, comme R4 »), mais dans ce coin la spec réintroduit le repli sur l'ordre des hostnames qu'Orhan a refusé, et R4 signale pourtant le désaccord. Recommandation : `priority_undecided` (avec les vues en `details`) quand la vue propre manque et que deux valeurs lues diffèrent ; cohérent avec « `null` ne contredit rien » (une seule valeur lue reste acceptée).

### M2 — moyen · Clé de cluster différente de R4 quand un membre est inconnu de `devices` ; `docs/05:327` est inexact

`descriptions.py:145` (clé = tous les noms listés) vs `ha.py:168` (clé = noms ∩ `known_hosts`).

Scénario (sonde e) : `ha_pair_variant`, le document de `fw-edge-02` liste en plus `fw-ghost` (absent de `devices`, constat d'entrée `ha_member_unknown`). R4 : **un seul** cluster `(fw-edge-01, fw-edge-02)`, aucun `ha_view_mismatch` ; R2 : les deux membres sont dans « deux clusters » ⇒ `cluster_ambiguous` sur `x1`, `x2` des deux firewalls, aucun câble. La page montre un cluster, le contrôle parle de deux. `docs/05:327` (« cas de l'`ha_view_mismatch` de R4 ») est faux ici : R2 est strictement plus soupçonneux que R4. Le choix « un membre inconnu compte dans le rang » est défendable (cluster physique), mais la phrase de la doc doit dire que R2 et R4 ne regroupent pas pareil, ou les deux règles doivent partager la clé (avec H3 traité, un fantôme compté hors clé donnerait « trop de paires », donc prudent aussi). À trancher.

### M3 — moyen · Forme HA tronquée (quatre champs) sur un membre : le rang 1 reprend le câble du rang 0

`descriptions.py:62` (`MIN_HA_FIELDS = 5`), spec `docs/05:320-322` (3-4 champs = V1, pour Gaia).

Scénario (sonde h) : `C2|sw-core-01|Ethernet1/3|sw-core-01` (dernier port oublié) sur un membre de rang 1 ⇒ V1 : `sw-core-01 / Ethernet1/3`, options `sw-core-01`. C'est exactement le faux câble que la brique corrige, réintroduit par une faute de frappe, sans contrôle. Conforme à la spec, mais sur un **membre de cluster** une V1 dont le champ 4 est de forme nom mérite au moins un `info` (soupçon de forme HA tronquée). Recommandation à présenter à Orhan avec H1/H2 : c'est le même sujet (le discriminant de la forme).

### M4 — moyen · Couverture de tests : le cas réel motivant et les cas ci-dessus n'ont pas de test

`backend/tests/correlate/test_ha_descriptions.py`. Aucun test ne combine LLDP vers `agg-core` (R1-bis) et forme HA, alors que c'est le cas réel qui justifie la brique (`_fortigate_aggregate` de `test_determinism.py:37-43` reste en V1 ; ma sonde montre que ça marche, il faut le figer). Aucun test pour : V1 à options de forme nom sur un non-membre (H1) et sur un membre (H2) ; paires surnuméraires (H3) ; cluster à trois membres avec rang 2 et options ; désaccord de priorité sans vue propre (M1) ; membre fantôme (M2). Les tests V1 à options n'utilisent que `a=1|b=2`, ce qui ne peut pas révéler H1.

## 3. Sécurité — aucun constat

Toutes les nouvelles clés de `details` (`reason`, `members`, `pairs`, `priorities[]{hostname, priority}`, `clusters[][]`) passent par `plain()` (`render/assets/js/dom.js:48-56`) puis `definition()` (`:71-73`) et `h()` qui n'écrit que des `createTextNode` / `setAttribute` (`:19-22`). Points d'entrée vérifiés : `inspect.js:14`, `tables.js:31`, `tables.js:72` ; le filtre texte `tables.js:42` compare des chaînes (`JSON.stringify`), sans HTML. Les entrées `priorities[]` n'ont pas de clé `interface`, donc `plain` ne les prend pas pour un bout de câble. Le test JS ajouté (`viewer.test.js:473-487`) vérifie la lecture, pas l'absence de HTML, mais la règle « jamais de HTML depuis une donnée » reste couverte par le test existant sur les sources du visualiseur.

Bas, page (B7 ci-dessous) : `model.js:141-148` `mentioned()` collecte les chaînes de `details` comme noms d'« autre bout » ; `members` / `priorities[].hostname` / `clusters` sont des noms de membres du cluster, donc le contrôle peut être attribué à un câble du port menant à un membre (port heartbeat portant une forme HA). Sans gravité.

## 4. Qualité de code

Règles respectées : fonctions < 50 lignes (`ha_places` 24), fichier 162 lignes, pas de mutation d'entrée, frozen partout, `zip(strict=True)`. Points bas :

- **B1** — `tests/correlate/test_review2.py:128-131` : `ha_pair_variant` n'est pas dans `test_h1_same_bytes_whatever_the_hash_seed`, alors que la règle de la contre-revue du 2026-09-20 est « le déterminisme se teste aussi entre processus ». Ma sonde (4 graines) est verte ; l'ajouter.
- **B2** — `descriptions.py:95` : `place.unresolved or Unresolved(PRIORITY_UNDECIDED, {})` est une branche morte (`_place` et `ha_places` posent toujours `unresolved` avec `rank=None`) qui masquerait une incohérence future. Rendre l'état impossible par le type (union `Placed | Unresolved` plutôt que `rank: int | None` + `unresolved: Unresolved | None`) ou lever.
- **B3** — `descriptions.py:37-46` : `__init__` manuel sur un dataclass `frozen, slots` avec `MappingProxyType` ⇒ `Unresolved` et `HaPlace` **non hachables** (`hash(Unresolved(...))` ⇒ `TypeError: unhashable type: 'dict'`), repr `mappingproxy({})`. Le reste de B1 passe de simples `dict` aux contrôles ; un `tuple[tuple[str, JsonValue], ...]` ou un dict documenté suffirait.
- **B4** — `descriptions.py:139` : `ha_places` renvoie un `dict` mutable là où `Context` type tout en `Mapping` ; cohérence.
- **B5** — `claims.py:106-109` + `checkbuild.py:47-49` : `interface_check(..., **details)` puis `**fallback` : collision de mot-clé (`TypeError`) si un `Unresolved.details` porte un jour la clé `interface` (port local absent de `interfaces[]` ⇒ `fallback = {"interface": name}`). Aucune clé ne collisionne aujourd'hui ; réserver les clés ou fusionner les dicts.
- **B6** — `claims.py:111-113` : une forme HA non résolue n'entre pas dans `report.unparseable_descriptions` ; l'onglet Qualité la montre via le contrôle (`tables.js:7`), mais le compteur « descriptions non lues » sous-estime. Décision à documenter (ou compteur dédié).
- **B7** — voir § 3.

## Tableau récapitulatif

| Sévérité | Point | Fichier |
|---|---|---|
| haut | H1 · V1 à options de forme nom sur un device sans cluster ⇒ câble perdu, `no_cluster` trompeur ; doc et docstring fausses | `correlate/descriptions.py:62-64, 91-93` ; `docs/05:330` |
| haut | H2 · Même V1 sur un membre HA ⇒ câble inventé vers un stub, sans contrôle spécifique | `correlate/descriptions.py:80-102` |
| haut | H3 · Plus de paires que de membres lu en silence ; membre mort absent de `members` ⇒ rangs décalés, faux câbles | `correlate/descriptions.py:96-101` ; `models_ha.py:18-23` |
| moyen | M1 · Désaccord de priorité sans vue propre tranché par l'ordre des hostnames des rapporteurs, là où R4 émet `ha_view_mismatch` | `correlate/descriptions.py:116-122` ; `correlate/ha.py:62-75` |
| moyen | M2 · Clé de cluster ≠ R4 sur membre inconnu de `devices` : `cluster_ambiguous` vs un seul cluster affiché ; `docs/05:327` inexact | `correlate/descriptions.py:145` ; `correlate/ha.py:168` |
| moyen | M3 · Forme HA tronquée à 4 champs sur un membre = V1 ⇒ le rang 1 reprend le câble du rang 0 | `correlate/descriptions.py:62` ; `docs/05:320-322` |
| moyen | M4 · Pas de test du cas réel (R1-bis + forme HA) ni de H1-H3, M1, M2, cluster à 3 | `tests/correlate/test_ha_descriptions.py` |
| bas | B1 · Scénario 11 absent du test inter-processus `PYTHONHASHSEED` | `tests/correlate/test_review2.py:128-131` |
| bas | B2 · Branche morte `or Unresolved(PRIORITY_UNDECIDED, {})` | `correlate/descriptions.py:95` |
| bas | B3 · `Unresolved` / `HaPlace` non hachables, `__init__` manuel, repr `mappingproxy` | `correlate/descriptions.py:37-46` |
| bas | B4 · `ha_places` renvoie un `dict` mutable | `correlate/descriptions.py:139` |
| bas | B5 · Collision de mot-clé possible entre `details` et `fallback` | `correlate/claims.py:106-109` ; `checkbuild.py:47-49` |
| bas | B6 · Forme HA non résolue hors du compteur `unparseable_descriptions` | `correlate/claims.py:111-113` |
| bas | B7 · Noms de membres dans `details` pris pour des noms d'autre bout par `mentioned()` (attribution, pas de HTML) | `render/assets/js/model.js:141-148` |
| — | Sécurité : aucun constat (`details` rendus en nœuds texte) | `render/assets/js/dom.js:19-22, 48-56, 71-73` |

Ordre de traitement suggéré : H3 (défaut pur, correction locale, nouvelle raison), puis une seule question à Orhan qui couvre H1/H2/M3 (quel discriminant pour la forme HA ?), M1 et M2 parqués en comportement prudent avec la doc corrigée, puis M4 et les bas dans la foulée.

---

## Suivi (2026-10-02, même jour)

Règle du projet : les défauts purs se corrigent sans Orhan, les règles douteuses se parquent avec un comportement
prudent et une question. Tout est traité ou parqué ci-dessous ; backend 351 tests, `correlate/` à 100 %.

| Point | Décision | Où |
|---|---|---|
| H1 | **Corrigé** (voie i). La forme HA n'est lue que sur un membre de cluster ; hors cluster, topic `ha` absent ou en échec compris, toute description est V1 et le champ 4 garde ses `|`. La raison `no_cluster` disparaît. Conséquence assumée et documentée : si le topic `ha` d'un membre tombe, sa forme HA se lit en V1 (la couverture le montre). | `descriptions.py` `parse_description`, test `test_without_a_cluster_the_same_text_is_read_as_v1` ; `docs/05` R2 |
| H2 | **Parqué, comportement documenté.** Sur un membre, 1 + 2n champs dont les devices sont de forme nom = forme HA par convention ; une V1 dont l'option contient `|` n'est pas dans la convention d'Orhan (l'option est un champ). Le rang 1 lit alors `uplink / 10G`, stub visible, `neighbor_unknown`. Question ouverte pour Orhan : un marqueur explicite de la forme HA ? | test `test_on_a_member_an_option_with_a_separator_has_the_ha_form` ; `docs/05` R2 « Piège assumé » |
| H3 | **Corrigé.** La forme HA doit compter exactement 1 + 2n champs : trop ou trop peu ⇒ `field_count_mismatch` (`details.fields`, `expected_fields`), aucun câble. L'option après les paires est abandonnée (la convention HA n'en a pas). Nouvelle raison `device_not_a_name` (`details.field`) pour un device de paire qui n'est pas un nom au-delà de la deuxième paire. | `_parse_ha` ; tests `test_a_field_count_other_than…`, `test_more_pairs_than_members_draws_nothing` |
| M1 | **Corrigé** (prudence). Sans vue propre, deux valeurs lues différentes ⇒ `priority_undecided`, `details.disputed` = les valeurs ; une seule valeur lue reste acceptée. | `_priority` ; test `test_two_values_read_without_an_own_view_leave_the_rank_undecided` |
| M2 | **Corrigé** : la clé de cluster est celle de R4, membres ∩ `devices`. Un membre fantôme ne compte pas ; la description écrite pour le cluster physique a alors trop de champs ⇒ `field_count_mismatch`, prudent. `docs/05` corrigé (« un membre inconnu ne compte pas »). | `ha_places(docs, known)` ; tests `test_a_member_unknown_to_devices_does_not_count`, `test_a_ghost_member_does_not_shift_the_ranks` |
| M3 | **Parqué, comportement documenté** : une forme HA tronquée à quatre champs sur un membre est une V1 à option (test qui fige le comportement). Même sujet que H2 : le discriminant de la forme. | test `test_v1_on_a_cluster_member_stays_v1` (cas M3) ; `docs/05` R2 |
| M4 | **Fait** : cas réel R1-bis + forme HA (`test_the_real_case_lldp_to_the_aggregate_and_the_ha_form`, câbles `confirmed` sans `remote_port_is_aggregate`), H1, H2, H3, cluster à trois membres rang 2, M1, M2. | `test_descriptions.py`, `test_ha_descriptions.py` |
| B1 | **Fait** : scénario 11 dans le test inter-processus (`PYTHONHASHSEED`). | `test_review2.py` |
| B2 | **Fait** : union `HaPlace | Unresolved`, plus de `rank: None`. | `descriptions.py` |
| B3 | **Fait** : `Unresolved` est un dataclass gelé à champs typés, hachable, `details()` construit le dict du contrôle. | `descriptions.py` |
| B4 | **Fait** : `ha_places` annoncée `Mapping`. | `descriptions.py` |
| B5 | **Documenté** : `details()` ne produit jamais la clé `interface` (réservée au repli). Une collision resterait une erreur explicite, voulue. | docstring de `Unresolved.details` |
| B6 | **Documenté** : `report.unparseable_descriptions` ne compte que ce qu'aucune grammaire ne lit ; la forme HA non résolue est un contrôle. | `docs/05` R2 |
| B7 | **Fait** : `members`, `priorities`, `disputed`, `clusters` ne désignent pas l'autre bout dans `mentioned()`. | `render/assets/js/model.js` |

**Ouvert pour Orhan** (une seule question) : la forme HA se reconnaît à sa forme, sans marqueur. Sur un membre, une V1
dont l'option contient `|` est lue comme une forme HA (H2) et une forme HA tronquée est lue comme une V1 (M3).
Convention à tenir d'ici là : sur un membre, jamais de `|` dans une option. Un marqueur explicite (mot réservé en
tête, par exemple) lèverait l'ambiguïté au prix d'un changement de convention.
