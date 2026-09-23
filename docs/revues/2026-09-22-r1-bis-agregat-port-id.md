# Revue indépendante — R1-bis, port distant annoncé par le nom d'un agrégat (2026-09-22)

Rapport rendu tel quel par le relecteur (agent indépendant, sondes exécutées, aucun fichier du dépôt modifié).
Suivi en fin de document.

---

Suite `tests/correlate` : verte (112 tests). Sondes exécutées depuis `backend/` avec `uv run python`, fichiers dans le
scratchpad (`probe_r1bis.py`, `probe2.py`, `probe3.py`, `probe_seed.py`). Aucun fichier du dépôt modifié.

## Critique

Aucun.

## Haut

**H1 — Une description qui cite l'agrégat lui-même devient un faux désaccord dès que le membre est résolu.**
`backend/src/ld_backend/correlate/merge.py:53` (`_agrees`) : l'absorption « un bout resté agrégat concorde avec
n'importe lequel de ses membres » n'est codée que dans un sens (bout **observé** = agrégat). Le sens inverse — bout
observé = membre `x1`, description = `agg-core` — tombe dans `members_at(end)` avec `end = (fw, x1)` → `None` →
`False` → `description_disagrees_with_observed`.

Sonde P1 (sw-core-01/Ethernet1/3 décrit `C2|fw-edge-01|agg-core|`, fw/x1 décrit `C2|sw-core-01|Ethernet1/3|`, câble
reciblé sur x1 par le rang 3) :
```
link fw-edge-01/x1 <-> sw-core-01/Ethernet1/3 [confirmed]
check description_disagrees_with_observed refs=[sw-core-01/Ethernet1/3]
      details={'documented': {fw-edge-01, 'agg-core'}, 'observed': [{fw-edge-01, 'x1'}]}
```
P1b (membre résolu par observation inverse, rang 1) : même faux désaccord. C'est précisément la topologie qui motive
la règle : `agg-core` est ce que `show lldp neighbors` affiche, donc ce qu'un admin recopie en description ; chaque
port de switch face à un FortiGate documenté ainsi lèvera un warning sur les pages de qualité. Le spec dit « ne sont
pas reciblées », pas « contredisent » ; « elle précise l'observé, elle ne le contredit pas » vaut dans les deux sens.

Correction proposée (ne recible rien, juge seulement l'accord) :
```python
members_of_end = ctx.members_at(end) or ()
members_of_expected = ctx.members_at(expected) or ()
return expected[1] in {equivalent(m) for m in members_of_end} or end[1] in {equivalent(m) for m in members_of_expected}
```
La description rejoint alors les évidences du lien (`remote_resolved.interface = agg-core` à côté de l'observé `x1`,
comme une description sans port) ; le contrat de sortie l'accepte (vérifié : `validate_snapshot_dict` ok sur P1).
Corriger aussi la docstring de `_agrees` (l. 46-48), qui annonce déjà la sémantique symétrique. Ajouter le test.

## Moyen

**M1 — Un claim `is_self` reciblé cesse d'être une auto-observation et dessine un câble intra-device.**
`aggregates.py:77` : aucun garde `claim.is_self`. Sonde P2 (LLDP `sw-core-01/port-channel20 →
sw-core-01/port-channel20`, Po20 à un seul membre) :
```
link sw-core-01/Ethernet1/3 <-> sw-core-01/port-channel20 [observed_only]
      evidence (lldp, témoin port-channel20, raw port-channel20, resolved Ethernet1/3)
self_observation: []          ← avant R1-bis : self_observation, aucun câble
```
Le contrat de sortie accepte ce lien (validé), donc rien ne l'arrête. P2b (Po10, deux membres) reste
`self_observation` mais y ajoute un `remote_port_is_aggregate` sans objet. Déclencheur artificiel (témoin LLDP =
agrégat qui s'annonce lui-même), mais régression pure. Correction : `if members is None or claim.is_self:
claims.append(claim); continue`. Test à ajouter.

**M2 — Le hub est muet sur un agrégat quel que soit le nombre de voisins.**
`merge.py:84` : `self.ctx.members_at(end) is None` exclut tout bout agrégat. Le spec justifie l'exclusion par « il a
autant de voisins que de membres » ; le code ne le vérifie pas. Sonde P4 (trois ports de switch observent `agg-core`,
deux membres) :
```
3 links fw-edge-01/agg-core <-> …  [observed_only]
multiple_observed_neighbors : aucun
```
Cas réel : entrée LLDP périmée (hold time 120 s pendant un recâblage) ou voisin mal identifié. Correction : `members
= self.ctx.members_at(end)` ; signaler si `members is None or (members and len(others) > len(members))` (membres
inconnus `()` : muet, prudent). Test à ajouter.

## Bas

**B1 — Les deux bouts annoncent un agrégat : une seule passe ne converge pas.** `aggregates.py:72` : `_MemberFinder`
est construit sur les claims **avant** reciblage. Sonde P20 (`sw1/Eth1/3 → fw/agg-core` et `fw/x1 →
sw1/port-channel20`) : le claim du FW est reciblé sur Ethernet1/3 (rang 2), mais le rang 1 du claim du switch cherche
encore `x1 observe Eth1/3` dans l'index d'origine et échoue → deux câbles sur sw1/Eth1/3 (`agg-core` et `x1`), hub,
deux `one_way_observation`. Cisco n'annonce jamais un Po en port-id, donc hors infra actuelle : à parquer avec H2
(`docs/06`). Si traité : seconde passe avec un finder reconstruit sur les claims reciblés (le reciblage ne fait
qu'ajouter des observations inverses, deux passes suffisent, ordre indifférent).

**B2 — Le rang 3 résout chaque claim isolément : un même membre peut recevoir deux câbles.** Sonde P6 (sw1/Eth1/3
décrit `x1` ; fw/x1 décrit `sw2/Eth1/4` ; sw2/Eth1/4 sans description) : les deux témoins sont reciblés sur x1, deux
liens `confirmed` sur x1 + `multiple_observed_neighbors`. Visible et conforme au spec ; noter seulement que « membre
déjà pris par un autre témoin du même agrégat » n'est pas une ambiguïté. Parquer.

**B3 — Membres inconnus (`()`) : description citant un membre = désaccord, pas absorption.** Sonde P3 :
`remote_port_is_aggregate members=[]` + `description_disagrees_with_observed`. Prudent, à documenter. Lié : sonde
P22 (topic `aggregates` en succès, aucun document pour le FW, `interfaces[].members = [x1, x2]`) → `members: []`
alors que le bundle les connaît. Conséquence de la décision « `aggregates[]` fait foi » ; à signaler à Orhan pour son
exportateur (un `aggregates[]` incomplet rend R1-bis aveugle).

**B4 — Couverture de tests.** Non couverts : H1 (description citant l'agrégat), M1 (`is_self`), M2 (plus
d'observateurs que de membres), rang 1 ambigu (P21 : x1 et x2 observent tous deux sw1/Eth1/3 → trois câbles sur
sw1/Eth1/3, hub ; conforme), LLDP + CDP sur le même témoin non résolu (P19 : un seul contrôle après dédoublonnage,
correct). `tests/correlate/test_review2.py:69` (`test_h1_same_bytes_whatever_the_hash_seed`) ne rejoue que
`_two_aliases` : ajouter une variante R1-bis (la sonde ci-dessous passe, le test garde la régression).

## Vérifié et trouvé correct

- **Rangs** : 1 → 2 → 3, le premier qui parle décide, plusieurs candidats ⇒ aucun (tests + P21) ; membre unique sans
  autre évidence ; membres inconnus ⇒ `members: []`, aucun reciblage.
- **Voisin non collecté / externe / injoignable** : `members_at` → `None`, nom brut conservé, aucun contrôle (test +
  lecture de `_aggregate_members`, qui ne voit que les interfaces et agrégats du bundle).
- **Seuls les claims observés sont reciblés** (`aggregates.py:77`) ; les descriptions ne le sont jamais.
- **Contrat de sortie** : `remote_raw.port = agg-core`, `remote_resolved.interface = x1`, témoin = bout du lien,
  `remote_resolved.hostname` = device opposé ; `validate_snapshot_dict` ok sur P1, P2, P14.
- **`_agrees` sens observé = agrégat** : description ambiguë absorbée sans désaccord, non ajoutée si son témoin n'est
  pas un bout du lien (test + P6). **Hub exclu** pour un agrégat à ≤ membres voisins (P7).
- **Déterminisme** : `keys` bâti depuis un tuple trié ; `observed[0]` et `next(iter(documented))` seulement à
  `len == 1` ; finder construit une fois, indépendant de l'ordre des claims ; `_aggregate_members` retourne des tuples
  triés. Sonde `probe_seed.py` : 4 variantes R1-bis (fixture `_fortigate_aggregate`, rang 1 ambigu, descriptions
  contradictoires, trois observateurs LLDP + CDP) × 5 `PYTHONHASHSEED` × permutation de toutes les sections ⇒ **une
  seule empreinte** par variante.
- **`Po1` canonique chez un vendeur non Cisco** (P18) : clé `equivalent` des deux côtés (`context.py:122,124`,
  `claims.py:94`, `aggregates.py:43,55`) ⇒ résolu sur x1, aucun contrôle.
- **Forme courte Cisco dans la description d'un membre** (`C2|sw-core-01|Eth1/3|`, P12) : `resolve_port` l'étend,
  rang 3 (b) matche.
- **Topic `interfaces` en échec, `aggregates` en succès** (P14) : membres depuis `aggregates[]`, reciblage ok,
  snapshot valide. **`aggregates` en échec** : repli sur `interfaces[].members` (test).
- **LLDP + CDP sur le même témoin** : reciblages identiques, compteur par claim (cohérent avec
  `ifname_short_to_long`), contrôles dédoublonnés par `check_key` (P19).
- **`one_way_observation`** : réciprocité calculée sur les clés reciblées ; membre observant en retour ⇒ pas de
  contrôle (test 2) ; lien resté agrégat avec LLDP FW en succès ⇒ contrôle (P1b), juste.
- **`documented_not_observed`** : une description absorbée dans un lien agrégat ne crée jamais son propre lien
  `documented_only`.
- **Agrégat côté témoin** (P9, `fw/agg-core → sw1/Eth1/3`) : non reciblé (le spec ne vise que le port distant),
  fusionné dans la même paire que le claim inverse, hub muet ; cohérent.
- **Performance** : `_MemberFinder` O(claims) à la construction, O(membres) par recherche ; `_agrees` O(membres) ;
  `self.multiple` un `dict.get` par bout. Rien de quadratique.
- `cisco.py` : extraction fidèle d'`ifnames.py`, aucun changement de logique.

---

## Suivi (2026-09-22, même jour)

| Point | Décision | Où |
|---|---|---|
| H1 | **Corrigé.** `_agrees` symétrique : une description qui cite l'agrégat concorde avec un bout observé qui en est membre ; elle rejoint les évidences du lien (`remote_resolved.interface = agg-core`), comme une description sans port. | `merge.py` `_agrees`, test `test_description_citing_the_aggregate_agrees_with_its_member` |
| M1 | **Corrigé.** Un claim `is_self` n'est jamais reciblé ni contrôlé : il reste une auto-observation. | `aggregates.py`, test `test_self_observation_is_never_retargeted` |
| M2 | **Corrigé.** Le hub se tait sur un bout agrégat seulement s'il a au plus autant de voisins que de membres ; membres inconnus ⇒ muet (prudent). | `merge.py` `group()`, test `test_more_observers_than_members_is_still_a_hub` |
| B1 | **Parqué** avec H2 (`docs/06`) : deux bouts qui s'annoncent tous deux par leur agrégat, hors infra actuelle (Cisco n'annonce jamais un Po en port-id). Comportement actuel visible (hub + `one_way_observation`), pas silencieux. | `docs/05` R1-bis |
| B2 | **Parqué** : un membre pris deux fois par le rang 3 donne deux câbles et `multiple_observed_neighbors`, visible ; l'arbitre sera la table MAC ou LACP. | `docs/05` R1-bis |
| B3 | **Documenté** : membres inconnus ⇒ description citant un membre = désaccord (prudent). **À dire à Orhan** : `aggregates[]` fait foi quand le topic est en succès ; un `aggregates[]` incomplet rend R1-bis aveugle (`members: []`). | `docs/05` R1-bis, `CLAUDE.md` |
| B4 | **Fait** : tests H1, M1, M2, rang 1 ambigu, variante R1-bis dans `test_h1_same_bytes_whatever_the_hash_seed`. | `tests/correlate/test_aggregates.py`, `test_review2.py` |
