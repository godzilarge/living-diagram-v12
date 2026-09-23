<!-- Rapport de contre-revue indépendante, consigné tel que rendu. Le suivi du traitement est en fin de fichier. -->

> **Consigné le 2026-09-20, dès réception, avant toute correction.** Contre-revue de `backend/src/ld_backend/correlate/`
> après traitement de la première revue (`2026-09-20-b1-etape-1.md`). Texte du relecteur inchangé ci-dessous.

# Contre-revue B1 étape 1 — après corrections

## État mesuré

- `cd backend && uv run pytest -q -p no:cacheprovider` : **177 verts** (2 avertissements starlette, hors sujet). `uv run ruff check src tests` : propre. `correlate/` : **100 %** de lignes (501 instructions).
- `cd contracts && uv run pytest` : 394 verts, ruff propre. L'ajout de `self_observation` au catalogue n'a rien cassé : schéma et `CONTRAT.md` sans dérive.
- Aucun fichier du projet n'a été modifié. Les sondes sont dans `docs/revues/sondes-2026-09-20-contre-revue/` (copiées depuis le scratchpad de la session) (noté `R2/` ci-dessous). Elles se rejouent par `cd backend && PYTHONPATH=. uv run python R2/<sonde>.py`.

Points vérifiés comme corrects :

- **Fuzz** (`R2/probe_fuzz.py`, puis `R2/probe_fuzz_invariants.py`) : 1 500 bundles tordus mais valides, à graine fixe, ports locaux canoniques. Le tirage mêle hubs, MAC, doubles formes, casse, adresses, boucles, descriptions croisées et couvertures aléatoires. Résultat : 0 exception, 0 écart d'octets après permutation des sections, 0 clé de lien en double.
- **Cohérence des contrôles** (mêmes tirages) : aucune description qui à la fois confirme et désaccorde, aucun `one_way_observation` sur un lien témoigné des deux bouts par la même source.
- **`pair = next(iter(matched))`** (`merge.py:102`) est sûr : il n'est consommé que si `len(matched) == 1`.
- **`min()` de `display_name`** ne peut pas recevoir un ensemble vide. `neighbor_interface` est non nullable au contrat. Une description sans port n'est jamais la seule à nommer un bout.
- **Coût avec descriptions** (`R2/probe_perf.py`) : le coût est linéaire, 9 600 lldp + 9 600 descriptions en 1,7 s.

La fusion remaniée tient sur ce pour quoi elle a été écrite. Ce qui suit est ce qui ne tient pas. Quatre des sept premiers points (C1, H1, H3, M2) sont antérieurs aux corrections ou à leur frontière. H2 est un reste de M3. M1 est dans `_membership`, réécrite pour M7. M3 est un trou de spécification de R3. Je les rapporte parce que la mission met les exceptions et le déterminisme en tête.

---

## CRITIQUE

**C1 — Le même port local sous deux écritures équivalentes fait lever une exception : le C1 de la première revue est incomplet**

Où : `claims.py:92` (`witness_key=(host, equivalent(itf))`), `merge.py:132-134` (`min(witnesses)`), `merge.py:177-184` (`_evidence` écrit `claim.interface`).

Ce qui est faux :
- La clé du témoin passe par `equivalent()`. `Eth1/5` (document lldp) et `Ethernet1/5` (interface canonique, donc description) tombent dans le même bout.
- `display_name` retient `min(...)`, soit `Eth1/5`. L'évidence `description` garde `Ethernet1/5` comme témoin.
- Le contrat refuse (`evidence_witness_not_endpoint`) et `assemble` lève.
- Le contrat d'entrée accepte ce bundle : `local_interface_unknown` est un constat, pas un refus. C'est la situation d'un B0 débutant dont le topic lldp ne canonicalise pas encore ses noms locaux.
- Le test `test_c1_check_on_an_unknown_local_port…` utilise `Ethernet1/99`, qui n'est équivalent à aucun port. Il ne voit donc pas ce cas.

Sonde : `R2/probe_exceptions.py`, trois variantes, toutes en `ValidationError … evidence_witness_not_endpoint` :
- E1 : lldp local `Eth1/5` + description sur `Ethernet1/5` ;
- E1b : lldp `Eth1/5` + cdp `Ethernet1/5` ;
- E1c : `Mgmt0` + `mgmt0`.

Correction proposée, prototypée par monkeypatch dans `R2/probe_fix_c1.py` :
1. Dans `display_name`, pour un bout qui témoigne, préférer le nom présent dans `ctx.names_by_host[host]`, sinon `min`.
2. Dans `_link`, écrire le témoin de chaque évidence avec le nom du bout du lien (`display_name(claim.witness_key, …)`), pas avec l'écriture du document.
3. Dédoublonner les évidences après cet alignement. Deux documents lldp identiques à l'écriture du port local près deviennent la même évidence (E1d dans la même sonde : `duplicate_identity`).

Résultat du prototype : la fixture de référence reste identique à l'octet ; E1 donne un câble `confirmed` sur `Ethernet1/5` ; E1c donne un câble `observed_only`.

Tests à ajouter : E1, E1b, E1d.

---

## HAUT

**H1 — Non-déterminisme entre deux processus : `_coverage` itère un `frozenset`**

Où : `context.py:69-70`, sur `SUBJECT_ALIASES` (`contracts/src/ld_contracts/checks.py:36-43`, valeurs `frozenset`).

Ce qui est faux :
- `next(... for a in aliases ...)` prend le premier alias présent. L'ordre d'itération d'un `frozenset[str]` dépend de `PYTHONHASHSEED`.
- Si une task porte deux alias du même topic avec des statuts différents (`port_channels: success`, `etherchannels: failed`, ce que le contrat accepte), le statut retenu change d'un démarrage à l'autre.
- Depuis M7, l'appartenance aux agrégats en dépend aussi. `one_way_observation` et la sévérité de `documented_not_observed` en dépendent de la même façon.
- Aucun test de permutation ne peut le voir : tout se passe dans un seul processus.

Sonde : `R2/probe_hashseed.py`, lancée sous `PYTHONHASHSEED=0..5`. Même bundle, même ordre de documents :
- graines 0, 1, 3, 4 : `aggregates=success`, empreinte `62a858e75c03` ;
- graines 2, 5 : `aggregates=failed`, `Ethernet1/1.aggregate=port-channel10`, empreinte `849a1a10c7e7`.

Probabilité faible (il faut deux alias du même topic sur un device). C'est pourtant le pire mode de panne pour B2 et B3 : un diff fantôme au redémarrage.

Correction proposée :
- itérer `sorted(aliases)` ;
- écrire la règle quand plusieurs alias sont présents (proposition : le nom canonique d'abord, sinon le pire statut), dans `docs/05` §2.7 ;
- passer `SUBJECT_ALIASES` en tuples ;
- ajouter un test unitaire sur une task à deux alias et un test qui lance B1 en sous-processus sous deux graines et compare les octets.

**H2 — Port-id en MAC non résolu + une autre observation du même voisin = deux câbles pour un câble physique (M3 incomplet)**

Où : `merge.py:61-79` (`group`), `:243-265` (`_one_way_checks`), `:74` (`multiple`).

Ce qui est faux :
- L'« accord jugé sur le device » n'est appliqué qu'entre une description et l'observé, jamais entre deux observations.
- Cas réel : `A/p` voit `B` par une MAC que R1 ne peut pas attribuer, et `B/x` voit `A/p` par son nom. Ce sont deux groupes, donc deux câbles.
- Les deux témoignages sont jugés non réciproques : deux `one_way_observation` faux.
- Les deux descriptions concordantes trouvent deux candidats et ne confirment plus rien.
- La MAC non attribuable n'est pas un cas d'école. La fixture du projet porte la même MAC sur `x1`, `agg-core` et `agg-core.400` (agrégat FortiGate, bond Linux ou Gaia : les membres prennent la MAC de l'agrégat). Dans ce cas `ports_by_mac` a trois propriétaires.

Sondes :
- `R2/probe_misc.py` M1, sans toucher aux MAC de la fixture, avec un LLDP parfaitement réciproque entre `sw-core-01/Ethernet1/3` et `fw-edge-01/x1`. Résultat : liens `fw-edge-01/70:4c:a5:aa:bb:01 <-> sw-core-01/Ethernet1/3 [observed_only]` et `fw-edge-01/x1 <-> sw-core-01/Ethernet1/3 [observed_only]`, plus deux `one_way_observation`, alors que les descriptions des deux bouts concordent.
- `R2/probe_semantics.py` S2, même racine : un stub vu en LLDP (port-id MAC) et en CDP (port nommé) sur le même port donne deux câbles et deux `multiple_observed_neighbors` faux, dont `details.neighbors` liste deux fois `ap-12`. C'est le cas typique des bornes et des téléphones.

Correction proposée (règle à écrire dans R3 avant le code, comme pour M2/M3) : après le groupement de l'observé, réconcilier chaque bout `(B, MAC)` vu depuis `W`.
- Si exactement un autre câble observé de `W` mène à `B` (vu depuis `W` ou depuis `B`), les claims MAC rejoignent ce câble. Le témoin `W` en est bien un bout, donc le contrat l'accepte, et `remote_resolved.interface` garde la MAC.
- S'il y en a zéro ou plusieurs, on garde le comportement actuel.
- La réciprocité se juge alors sur la paire fusionnée, et `multiple` compte des bouts après réconciliation.
- Tests à ajouter : M1, S2, et un vrai hub qui reste un hub.

**H3 — Un hostname d'inventaire en forme d'adresse donne `duplicate_identity`, ou une mauvaise sorte de nœud**

Où : `identity.py:47-51` (la forme d'adresse court-circuite les niveaux 1 et 2), `:34-35`.

Ce qui est faux :
- `Hostname` est un `NonEmptyStr`. Un device sans nom configuré, inventorié sous son IP, annonce cette IP comme `neighbor`. Ce sont deux faits cohérents entre eux.
- `resolve_name` part directement sur `_by_address`. Aucune interface ne porte l'adresse, donc il crée un stub `10.0.0.9` à côté du nœud `device` `10.0.0.9`. Le snapshot est refusé.
- Le docstring de `resolve_name` (« exact, casse, nom rapporté, adresse ») décrit un autre ordre que le code.

Sondes :
- `R2/probe_exceptions.py` E2 : `ValidationError … duplicate_identity`.
- `R2/probe_e2bis.py` E2b : hostname `2001:db8::9` annoncé `2001:DB8:0::9`, même exception.
- `R2/probe_e2bis.py` E2c : même device dans une autre infrastructure. Pas d'exception, mais le nœud sort en `stub` au lieu d'`external`.

Correction proposée : essayer les niveaux 1 et 2 sur le nom brut **et** sur sa forme canonique d'adresse avant `_by_address`. Amender la phrase de R0 en « passe directement au niveau 4 après les niveaux 1 et 2 ». Trois tests (E2, E2b, E2c).

---

## MOYEN

**M1 — `_membership` dépend de l'ordre des documents quand un port figure dans deux agrégats**

Où : `context.py:93-104`.

Ce qui est faux : dans `aggregates[]` le dernier écrit gagne (`membership[...] =`). Dans le repli, le premier gagne (`setdefault`). Le contrat ne refuse pas un membre cité par deux agrégats.

Sonde : `R2/probe_determinism.py`.
- D1 : 4 permutations sur 6 donnent des octets différents. `Ethernet1/1.aggregate` vaut `port-channel20 / suspended` ou `port-channel10 / bundled` selon l'ordre.
- D2 (repli par `interfaces[].members`) : 2 écarts sur 6.

Cas rare (bug de parseur), mais c'est une violation directe de l'exigence centrale.

Correction proposée : choix déterministe (plus petit nom d'agrégat par `natural_key`) plus un contrôle visible. Ou mieux, un refus ou constat côté contrat d'entrée (`member_in_several_aggregates`), tant que le 1.0.0 n'est pas gelé.

**M2 — Doublons internes acceptés par le bundle et refusés par le snapshot : exception dans `assemble`**

Où : `assemble.py:148` (`ip_addresses` triées mais non dédoublonnées), `assemble.py:49-59` (`_stack`, slots).

Sonde : `R2/probe_assemble.py`.
- A1 : la même IP deux fois sur une interface donne `duplicate_identity` sur `SnapshotInterface`.
- A2 : deux `chassis_members` au même slot donnent `duplicate_identity` sur `Stack`.
- A3 (`virtual_contexts`, heartbeats en double) et A4 (même IP sur deux interfaces) passent.

Correction proposée : fermer l'écart entre les deux contrats.
- Doublon exact d'IP : dédoublonner dans B1, ou le refuser à l'entrée.
- Slot en double : c'est une contradiction de donnée, donc refus ou constat côté `ld-contracts`.

**M3 — « Un port physique ne porte qu'un câble » (R3) n'est tenu que face à l'observé ; deux cas restent muets**

Où : `merge.py:74`, `:108-109`.

Ce qui est faux :
- (a) Des descriptions contradictoires entre elles dessinent tous leurs câbles `documented_only` sur le même port, sans contrôle qui dise la contradiction.
- (b) Un port muet vu par deux témoins porte deux câbles observés sans `multiple_observed_neighbors`. `multiple` n'est calculé que depuis `seen_by` (le port qui observe), alors que `touching` contient déjà l'information.
- Cas réel pour (b) : N serveurs nommés `localhost`, port `eth0`.

Sonde : `R2/probe_semantics.py`.
- S3 : trois descriptions en cercle. `sw-core-02/Ethernet1/4` porte 3 câbles, `fw-edge-01/ha1` en porte 2. Aucun contrôle de contradiction.
- S4 : deux descriptions vers `fw-edge-01/ha1`, 2 câbles, aucun contrôle.
- S5 : `ha1` vu depuis deux switches, 2 câbles observés, aucun `multiple_observed_neighbors`.
- Le tout est déterministe : 0 écart sur 6 permutations.

Correction proposée :
- (b) dériver le contrôle de `touching` (tout bout avec plus d'un bout opposé observé) et dire dans R3 que le port référencé peut être le port vu ;
- (a) à trancher par Orhan : nouveau code, ou règle écrite « le documenté peut se contredire, `documented_not_observed` suffit ».

**M4 — Tests : trois gardes plus étroites que leur nom**

Où : `tests/correlate/test_review.py:53-68`, `:13-22` ; `tests/correlate/test_determinism.py`.

1. **Garde C2.** Compter les `expand_cisco` garde la cause d'hier, pas la propriété « coût linéaire » que le nom du test annonce.
   - Sonde `R2/probe_c2_guard.py` : `_one_way_checks` remplacé par un balayage O(n²) sur les clés précalculées. Résultat : 600 appels à `expand_cisco` (identique au code actuel), 40 000 comparaisons, et le test passerait (`True`).
   - À compléter par un test de ratio (t(4n)/t(n) borné, marqué lent), ou renommer le test pour ce qu'il garde.
2. **Test C1.** Il ne couvre pas l'écriture équivalente (voir C1).
3. **`test_determinism.py`.** Tout se passe dans un seul processus (voir H1). `_awkward` n'a ni MAC, ni description sans port, ni repli d'agrégat, ni alias.

Le reste de `test_review.py` reproduit bien ce qu'il annonce. J'ai vérifié que H1, M1, M2, M5 et C1-bis échoueraient avec l'ancien code.

---

## BAS

- **B1** `claims.py:76` : `unresolved_names` garde l'écriture brute alors que le stub porte la forme repliée ou canonique.
  - Sonde `R2/probe_misc.py` M2 : stubs `['2001:db8::9', 'srv-hyp-07', 'srv-z']` contre `unresolved_names` `['2001:DB8:0::9', 'SRV-Z', 'srv-hyp-07', 'srv-z']`. Quatre noms pour trois stubs.
  - Soit ajouter `resolved.hostname`, soit écrire dans §2.7 que ce sont les écritures annoncées.
- **B2** `merge.py:214-229` : `details.neighbors` complet recopié dans chacun des k contrôles d'un hub, donc coût et taille en k².
  - Sonde `R2/probe_perf.py` : 0,22 s à k=250, 11,8 s à k=2000.
  - Sonde `R2/probe_misc.py` : 423 Kio à k=50, 4,9 Mio à k=200 (inondation CDP derrière un switch tiers).
  - Acceptable aux ordres de grandeur réalistes. À surveiller, ou porter un seul contrôle par port-hub avec N références de liens.
- **B3** Dérive de documentation :
  - `docs/05` §6 ne liste pas `checkbuild.py` ;
  - §7 parle encore des « six niveaux de R0 », des « quatre statuts » et de « port-id MAC remplacé par la port-description » (retiré le 2026-09-18) ;
  - `identity.py:48` a un docstring qui donne un ordre différent du code ;
  - `test_m7_…_only_when_the_aggregates_topic_is_absent` porte un nom contraire à la règle retenue (« pas en `success` »). Le cas `failed` est bien testé, mais dans `test_assemble.py:62`.
- **B4** `test_review.py:55`, `:115-118` : des imports locaux dans les tests, ce que B7 avait fait retirer ailleurs.

Cohérence doc ↔ code pour le reste : R0 (niveaux, ambiguïté, IP sur la valeur), R1 (préfixe `cisco` sans la casse), R2 (B10, champ 3 absent), R3 (placement, absorption, `self_observation`, nom d'endpoint, réciprocité, sévérités), R4 (appartenance), §2.6 (repli sur le nœud) et §4 décrivent ce que le code fait. Je n'ai trouvé aucun autre écart.

---

## Corrections de la première revue : verdict

- C1 : **incomplet** (port local sous deux écritures équivalentes, voir C1 ci-dessus)
- C2 : correct (mesuré linéaire) ; garde de test étroite (M4)
- H1 : correct (déterministe, `neighbors` complet) ; faux hub résiduel traité en H2
- H2 : correct
- M1 : correct
- M2 : correct
- M3 : **incomplet** (réglé pour description ↔ observé, pas pour observé ↔ observé, voir H2)
- M4 : correct
- M5 : correct
- M6 : correct (défaut voisin en H3)
- M7 : correct, écart assumé justifié et testé. Mais la couverture dont il dépend n'est pas déterministe (H1), et `_membership` ne l'est pas non plus (M1).
- B1 : correct
- B2 : correct
- B3 : écarté par décision, sans objet
- B4 : correct
- B5 : correct
- B6 : correct
- B7 : correct (reste `docs/05` §7, voir B3)
- B8 : correct
- B9 : correct
- B10 : correct
- B11 : sans objet

Aucune correction n'est fausse. Deux sont incomplètes.

## Ordre de traitement proposé

1. **C1**, puis **H1** et **H3** : trois défauts purs et petits, avec leurs tests. Ils bloquent le branchement dans `ingest.py`, puisqu'ils donnent une exception ou des octets instables.
2. **H2** : règle de réconciliation MAC à écrire dans R3 et à faire valider par Orhan avant le code.
3. **M1** et **M2** : décider ce qui relève du contrat d'entrée (refus ou constat, tant que le 1.0.0 n'est pas gelé) et ce qui relève de B1.
4. **M3** : (b) se code tout de suite depuis `touching` ; (a) est une question pour Orhan.
5. **M4**, puis les BAS, avec la mise à jour de `docs/05` §6 et §7.

---

## Traitement

Rapport consigné dès réception, sondes copiées dans `docs/revues/sondes-2026-09-20-contre-revue/`. Tests :
`backend/tests/correlate/test_review2.py`. Vérification finale : `probe_exceptions.py` ne lève plus rien,
`probe_hashseed.py` donne la même empreinte sous `PYTHONHASHSEED` 0 à 5 (deux empreintes avant).

### Défauts purs, corrigés le 2026-09-20

| Point | Correction | Où |
|---|---|---|
| C1 | le bout prend l'écriture que `interfaces[]` connaît ; le témoin de chaque évidence porte le nom du bout ; évidences dédoublonnées par leur clé (E1, E1b, E1c, E1d testés) | `merge.py`, `docs/05` R3 |
| H1 | alias lus dans un ordre écrit (nom canonique, puis alphabétique) ; test en sous-processus sous trois graines | `context.py`, `docs/05` §2.7 |
| H3 | un nom en forme d'adresse essaie d'abord les niveaux 1 et 2, sur l'écriture annoncée puis la forme canonique (E2, E2b, E2c testés) | `identity.py`, `docs/05` R0 |
| M3-b | `multiple_observed_neighbors` dérivé de tous les bouts à plusieurs câbles observés, port muet compris | `merge.py`, `docs/05` R3 |
| M4 | test C2 renommé pour ce qu'il garde ; test de ratio t(4n) / t(n) ajouté ; test C1 complété ; déterminisme testé entre processus | `tests/correlate/` |
| B1 | documenté : `unresolved_names` porte les écritures annoncées | `docs/05` §2.7 |
| B3 | `docs/05` §6 et §7 alignés, docstring de `resolve_name`, test M7 renommé | `docs/05`, `identity.py`, tests |
| B4 | imports locaux : conservés là où ils servent un `monkeypatch` ou un `pytest.raises` isolé | — |

### Tranché par Orhan le 2026-09-20, puis codé

| Point | Décision | Correction |
|---|---|---|
| M1 | refus à l'entrée (« complètement d'accord ») | `member_in_several_aggregates`, sur `aggregates[].members` et sur `interfaces[].members` ; `contracts/src/ld_contracts/bundle.py` |
| M2 | validé | slot en double : refus `chassis_member_slot_duplicate` (`models_devices.py`) ; IP strictement en double : retirée par B1 à l'assemblage (`assemble.py`) |
| M3-a | validé : ne rien ajouter | règle écrite dans `docs/05` R3 ; l'arbitre sera la table MAC |

État : contracts 398 tests, backend 187 tests, tous verts ; sondes `probe_assemble.py` et `probe_determinism.py` rejouées.

### Encore ouvert

| Point | Question |
|---|---|
| H2 | réconcilier **deux observations** du même câble quand l'une n'a qu'une MAC pour port (LLDP en MAC + CDP nommé vers une borne ; FortiGate dont les membres portent la MAC de l'agrégat). Sans réponse d'Orhan à ce jour ; proposé : l'instruire dans `docs/06`, même problème d'attribution d'une MAC à un port |
| B2 | `details.neighbors` recopié dans chaque contrôle d'un hub : taille en k² (4,9 Mio à 200 voisins) ; à surveiller |
