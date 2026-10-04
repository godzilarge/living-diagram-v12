# 07 — Le diff B3 : conception (2026-10-04)

**Statut : plan et six décisions validés par Orhan le 2026-10-04 ; écrit puis codé le même jour (contrat, B3, API, CLI,
page) ; revue indépendante consignée et traitée dans `docs/revues/2026-10-04-b3-diff.md` (0 critique, 1 haut, 5 moyens,
8 bas : défauts purs corrigés, trois questions de conception parquées en §7). Les détails se corrigent au premier rendu
sur une vraie infrastructure.** En une phrase : **le diff dit ce qui a changé dans l'infrastructure entre deux runs, en mots réseau,
sans jamais lire la couche d'intention.**

Références : modèle du snapshot `docs/05` §2 et `contracts/CONTRAT.md` partie B ; oracle de test = `manifest.json` de
`ld-contracts generate` (`contracts/README.md` § Générer) ; doctrine `CLAUDE.md` (`diff = C0(A) ↔ C0(B)`, jamais C2).

---

## 0. Ce que ce document décide

1. **Une fonction pure** `diff(before, after) -> Diff` sur deux snapshots d'une même infrastructure, dans `backend/`
   (`ld_backend/diff/`), à côté de B1. Déterministe : mêmes snapshots ⇒ mêmes octets. `diff(A, A)` est vide.
2. **Un troisième contrat, `Diff` v1, dans `ld-contracts`** (`contracts/src/ld_contracts/diff/`, partie C de
   `CONTRAT.md`, `diff-v1.schema.json`), versionné indépendamment du bundle et du snapshot. Types partagés avec le
   Snapshot : entités, références, énumérations, ordre canonique.
3. **Une identité par entité, celle du snapshot** (§3 D1). Pas de seconde règle d'appariement.
4. **Trois sortes par section** : `added` et `removed` portent l'entité complète (état « après » ou « avant »),
   `changed` porte la référence et la liste des champs `(path, before, after)`. Les contrôles ont leurs mots :
   `appeared`, `resolved`, `persisted`.
5. **Deux champs volatils déclarés**, exclus de `changed` et comptés : `nodes[].uptime_seconds`,
   `interfaces[].last_change_age_seconds`. `source` et `report` ne sont jamais comparés : ce sont les cartes d'identité
   des runs, recopiées dans `before` / `after`.
6. **Les volatils livrent deux faits typés**, section `events` : `rebooted` (l'uptime d'après est plus court que le
   temps écoulé entre les runs) et `flapped` (le port a changé d'état dans la fenêtre sans que son état diffère entre
   les deux runs). Le diff n'ignore pas l'uptime, il en lit ce qui est un événement.
7. **Le diff se calcule à la demande, jamais stocké** : dérivé, déterministe ; le stocker créerait un second produit à
   invalider. `GET /api/diff?infrastructure=&from=&to=`, `ld diff`, `ld render --from`. **Coût mesuré à la jauge**
   (revue M5 : 500 devices, 1 310 nœuds, 21 000 interfaces, 23 Mo par snapshot) : la comparaison tient en ~1 s, mais
   relire et **revalider** les deux snapshots archivés coûte ~2,2 s à chaque appel, soit ~3,2 s par `GET /api/diff` ;
   la timeline enchaînant des diffs N-1, la décision est ouverte (Q6).
8. **Ordre canonique refusé par le type**, comme le Snapshot : les listes sont triées par les mêmes clés que R6, les
   comptes du résumé doivent correspondre aux sections.

---

## 1. Position dans la chaîne

```
archive ── snapshot A (run N-1) ──┐
                                  ├── B3 diff(A, B) ── Diff ── API / CLI / page (peinture des câbles, onglet Diff)
archive ── snapshot B (run N)   ──┘
```

B3 ne lit que des snapshots (C0). Il ne connaît ni le bundle, ni l'archive, ni l'intention (C2), ni le rendu. La
timeline de la V1 est une suite de diffs N-1 → N ; la liste des runs est déjà triée par début de collecte pour cela.

---

## 2. Le contrat `Diff` v1

```
Diff
├─ diff_version          "1.0.0" — semver propre au diff
├─ infrastructure
├─ before, after         RunRef : collector_run_id, bundle_sha256, snapshot_version, start_datetime, end_datetime, status
├─ elapsed_seconds       after.start_datetime − before.start_datetime, signé (négatif = runs comparées à rebours)
├─ summary               par section : {added, removed, changed} ; checks : {appeared, resolved, persisted} ;
│                        coverage : {changed} ; events : {rebooted, flapped} ; volatile_changes
├─ nodes                 added[Node] · removed[Node] · changed[EntityChange]
├─ interfaces            added[SnapshotInterface] · removed[…] · changed[EntityChange]
├─ links                 added[Link] · removed[Link] · changed[EntityChange]
├─ aggregates            added · removed · changed
├─ mlag_domains          added · removed · changed
├─ ha_clusters           added · removed · changed
├─ checks                appeared[Check] · resolved[Check] · persisted (compte)
├─ coverage              changed[EntityChange]   (ref = nœud ; status, topics.<topic>)
└─ events                [Event] : kind ∈ {rebooted, flapped}, ref, details
```

- `EntityChange` = `ref: Ref` (les références typées du Snapshot : `node`, `interface`, `link`, `aggregate`, `cluster`)
  + `fields: tuple[FieldChange]` (au moins un), triés par `path`.
- `FieldChange` = `path` (chemin pointé dans l'entité : `oper_status`, `aggregate.member_status`, `stack.member_count`),
  `before`, `after` (valeurs JSON).
- `Event` = `kind`, `ref`, `details` typés par sorte : `RebootedDetails` (`uptime_before`, `uptime_after`,
  `elapsed_seconds`) ou `FlappedDetails` (`age_after`, `elapsed_seconds`) ; la valeur lue est plus courte que la fenêtre
  et la fenêtre recopiée est celle du diff (refus `event_details_mismatch`, `event_not_in_window`,
  `event_elapsed_mismatch`).
- Refus du contrat (catalogue complet en partie C de `CONTRAT.md`) : `not_canonical_order` / `duplicate_identity` /
  `mlag_domain_same_device` / `snapshot_major_unsupported` (partagés), `counts_mismatch` (résumé ≠ sections),
  `elapsed_mismatch`, `too_short` (un `changed` sans champ), `field_change_equal`, `field_change_volatile` (un volatil
  déclaré dans `changed`), `identity_in_several_parts` (`added` / `removed` / `changed` disjoints, `appeared` /
  `resolved` disjoints), `events_without_elapsed` (événements à rebours), `string_pattern_mismatch` (`path` = identifiants
  pointés, jamais un indice de liste). Aucune référence à résoudre : un diff est auto-porteur.

---

## 3. Les règles de B3

### D0 — Entrées

Deux `Snapshot` validés, donc de la seule majeure que le contrat Snapshot accepte. Même `source.infrastructure`,
sinon `DiffError` (B3 refuse, jamais de diff partiel, message sans valeur). La direction est celle demandée :
`before` → `after`, quel que soit l'ordre des dates ; `elapsed_seconds` est signé et les événements (D4) ne se
calculent que s'il est strictement positif.

### D1 — Appariement par l'identité du snapshot

| Section | Identité (= clé de tri de R6) |
|---|---|
| `nodes` | `hostname` |
| `interfaces` | `(hostname, name)` |
| `links` | la clé du lien : paire triée des bouts `(hostname, interface)` ; `kind` n'en fait pas partie en V1 |
| `aggregates` | `(hostname, name)` |
| `mlag_domains` | `(mlag_id, membres)` |
| `ha_clusters` | l'ensemble des membres |
| `checks` | `(code, refs)` : les `details` n'identifient pas, ils décrivent |
| `coverage` | `hostname` |

Présent dans `after` seulement ⇒ `added` ; dans `before` seulement ⇒ `removed` ; dans les deux ⇒ comparé (D2). Un cluster
HA dont un membre disparaît est donc un cluster retiré et un cluster ajouté : c'est ce que dit l'identité du snapshot
(question Q1). Un device renommé est retiré puis ajouté : la clé est le hostname, et c'est la couche d'intention qui
pourra, plus tard, dire « c'est le même ». **L'identité est l'octet** : le snapshot refuse deux nœuds qui ne diffèrent
que par la casse, mais B3 apparie `sw-core-02` et `SW-Core-02` comme deux nœuds (retiré puis ajouté, avec leurs
interfaces et câbles) ; un stub (nom en `casefold`) devenu device n'est donc un nœud `changed` que si le device s'écrit
en minuscules (question Q5, revue M1).

### D2 — Comparaison champ à champ

L'entité est sérialisée en JSON (`model_dump(mode="json")`), aplatie en chemins pointés ; **les listes se comparent en
bloc** (`evidence`, `ip_addresses`, `members`, `cables`, `allowed_vlans` : un seul `FieldChange` avec la liste avant et
la liste après). Les chemins volatils (`uptime_seconds` d'un nœud, `last_change_age_seconds` d'une interface) sont
retirés avant comparaison et chaque différence retirée compte dans `summary.volatile_changes`. Une entité sans
différence restante n'apparaît pas.

### D3 — Contrôles

Identité `(code, refs)`, en multi-ensemble : deux contrôles de même identité dans `before` et un dans `after` ⇒ un
`resolved` (le dernier dans l'ordre canonique) et un `persisted`. Un contrôle dont seuls les `details` changent est
`persisted` : le problème est toujours là. **Une sévérité qui change seule est aussi un `persisted`**, invisible dans le
diff (`documented_not_observed` passant d'`info` à `warning` : question Q7, revue B2).

### D4 — Événements lus dans les volatils

- `rebooted` sur un nœud présent des deux côtés : `after.uptime_seconds` lu et `< elapsed_seconds`. Un uptime qui
  décroît mais reste supérieur au temps écoulé est impossible ; un uptime qui croît n'est pas un fait.
- `flapped` sur une interface présente des deux côtés : `after.last_change_age_seconds` entier `< elapsed_seconds` et
  `oper_status` identique dans les deux runs, **sur un nœud qui n'a pas `rebooted`** : après un redémarrage, tout port
  monté au démarrage a un âge plus court que la fenêtre, et le redémarrage l'explique (sur un cœur à 48 ports, « 49
  événements » pour un seul fait noierait un vrai flap ailleurs ; revue M2). Perte assumée : un flap postérieur au
  démarrage sur ce nœud n'est pas distingué. Si `oper_status` diffère, c'est un `changed`, pas un événement. `"never"`
  et `null` ne disent rien.

### D5 — Ordre et déterminisme

Chaque liste est triée par la clé de R6 de son entité ; `changed` et `events` par `ref_key` (sorte, identité) ;
`events` d'abord par `kind`. Le contrat refuse tout autre ordre. Test de déterminisme entre processus sous trois
`PYTHONHASHSEED`, comme B1.

### D6 — Ce que le diff ne regarde pas

Jamais l'intention (C2), jamais le rendu (C3), jamais le bundle. `report.*` n'est pas comparé : ses variations se
lisent dans les sections (descriptions, contrôles). Les comptes du résumé sont dérivés des sections et vérifiés.

---

## 4. Branchement

- **API** : `GET /api/diff?infrastructure=&from=&to=` (paramètres de requête, jamais le chemin). 404 « run `from`
  inconnue » / « run `to` inconnue » / « run archivée sans snapshot : lancer `ld correlate` », sans écho de valeur ;
  422 à la forme de l'API. Réponse = le contrat `Diff` (`$ref` vers son schéma dans OpenAPI, comme le snapshot).
- **CLI** : `ld diff before.json after.json --out diff.json` (deux bundles ou deux snapshots, reconnus à
  `snapshot_version`, sans archive ni serveur) ; `ld diff --infrastructure X [--from R1] [--to R2] [--out]` sur l'archive,
  `--to` = dernière run, `--from` = celle qui la précède : `ld diff --infrastructure X` répond « qu'est-ce qui a changé
  à la dernière run ? ». Même garde que `correlate` / `render` : pas de mélange des modes, `--out` ≠ entrée.
- **Page** : `ld render … --from <bundle|run>` embarque le diff dans la page ; `/view` lit `?from=` et propose
  « comparer avec la précédente » dans la liste des runs. Peinture : câbles `diff-added` (vert), `diff-removed`
  (fantômes gris pointillés dessinés depuis `links.removed`), `diff-changed` (ambre) ; nœuds ajoutés / retirés de même ;
  onglet **Diff** (résumé, puis une table par section, chaque ligne ouvre l'élément dans le graphe) ; dans l'inspecteur,
  les champs changés d'un élément sélectionné ; pastille d'en-tête « vs run … ». Même CSP, aucun style en ligne.

---

## 5. Hors périmètre, volontairement

- Diff de la couche d'intention ; diff sur plus de deux runs (la timeline enchaîne des diffs N-1) ; appariement d'un
  device renommé ; `kind` dans la clé de lien (majeure du snapshot, avec les vues L2 / L3) ; diff sémantique des
  `details` d'un contrôle ; peinture du diff sur les structures (faisceaux, clusters) au-delà de leur ligne dans l'onglet.

---

## 6. Plan et tests (TDD, chaque étape testée avant la suivante)

1. **Contrat** (fait) `ld_contracts/diff/` : modèles, ordre, refus, `diff-v1.schema.json`, partie C de `CONTRAT.md`,
   `fixtures/diff-skeleton.json`, `validate --contract diff`, `schema --contract diff`.
2. **B3** (fait) `ld_backend/diff/` : `fields.py` (aplatissement, volatils), `sections.py` (appariement), `events.py`,
   `engine.py` (`diff`). Tests sur variantes de la fixture (un câble retiré, un port tombé, une description changée,
   un reboot) et **sur les séries du générateur** : `scenario` à une seule sorte par run, un test par sorte.
3. **API + CLI** (fait), 404 / 422, deux modes, déterminisme entre processus.
4. **Page** (fait) : `--from`, onglet Diff, peinture, inspecteur ; tests sous Node (page avec diff), rendu vérifié en
   Chromium. Fantômes : ce qui a disparu est lu dans `diff.*.removed`, jamais compté, sans contrôle de cette run ; un
   fantôme stub suit la règle des stubs ; la bascule « changements » (`#diff=0`) éteint halos, couronnes et fantômes.
5. **Docs** (fait) : `README` backend et contracts, `QUICKSTART`, `CLAUDE.md` ; une revue indépendante (consignée).

**Oracle** (`manifest.json`, `details` avec les ports en `[hostname, interface]`) :

| Mutation | Attendu dans le diff |
|---|---|
| aucune (`mutations_per_run = 0`) | toutes les sections vides, `volatile_changes > 0`, aucun événement |
| `device_added` | nœud `added`, ses interfaces `added`, ses liaisons `added`, les ports de réserve des cœurs `changed` (down → up, entrent dans un agrégat), les port-channels des cœurs `added` (interfaces et agrégats), domaine MLAG `added` |
| `device_removed` | **le nœud survit en stub** (`changed`, `kind` device → stub : la description périmée des cœurs le cite encore), ses interfaces, ses stubs et les port-channels des cœurs `removed`, câbles `changed` (confirmé → documenté seul, `documented_not_observed` apparu), ports des cœurs `changed` (oper up → down) |
| `device_unreachable` | nœud `changed` (`collection`), ses interfaces `removed`, `coverage.changed`, `device_unreachable` `appeared` ; tout revient à N+1 |
| `topic_failed` | `coverage.changed` (le topic), `device_partial_collection` `appeared` |
| `cable_moved` | un câble `removed` (ancien port du cœur), un câble `added` (nouveau), les deux ports `changed` |
| `cable_down` | câble `changed` (`oper`, `status`, `evidence`), deux ports `changed` (`oper_status`), `link_down` `appeared` |
| `description_changed` | un port `changed` (`description`, `description_parsed`), `description_disagrees_with_observed` `appeared` |
| `ha_failover` | cluster `changed` (`members` : rôles permutés), aucun câble |
| `ha_member_down` | cluster `changed`, câbles du membre `changed`, `ha_member_down` `appeared` ; transitoire |
| `aggregate_member_suspended` | deux ports `changed` (`oper_status`, `oper_reason`, `aggregate.member_status`), agrégat `changed` |
| `speed_degraded` | un port `changed` (`speed_mbps`), `link_speed_mismatch` `appeared`, `flapped` aux deux bouts |
| `stub_added` | câble `added`, port `changed` ou `added` |
| `stub_removed` | câble `removed` ou `changed`, port `changed` (oper up → down) |
| `reboot` | événement `rebooted` sur le nœud, aucun `flapped` sur ses ports, rien d'autre que du volatil |

---

## 7. Ouvert, comportement prudent choisi

- **Q1 — Identité d'un cluster HA** : membres (identité du snapshot). Alternative : `cluster_name` quand il est lu,
  qui ferait d'un membre perdu un `changed`. À regarder sur un rendu.
- **Q2 — Interfaces d'un nœud ajouté ou retiré** : listées une à une (le diff est complet, le résumé dit « 48 interfaces
  ajoutées »). La page les replie sous le nœud. Alternative : les omettre comme impliquées par le nœud.
- **Q3 — Un device injoignable fait un gros diff** (ses interfaces disparaissent puis reviennent) : c'est la donnée ;
  la page pourra proposer un filtre « sans les devices injoignables ».
- **Q4 — Le mot `flapped`** pour « a changé d'état dans la fenêtre, même état aux deux bouts » : à confirmer par Orhan.
  La page écrit « flap » partout (pastille, explication, table vide), une seule formulation (revue B6).
- **Q5 — La casse dans l'identité** (revue M1) : B3 apparie à l'octet ; le snapshot définit l'unicité d'un nœud sans
  la casse et impose au stub un nom en `casefold`. Sur une infrastructure dont les hostnames portent des majuscules,
  chaque stub devenu device se lira « retiré + ajouté » avec ses câbles au lieu de « changé ». Alternative : replier la
  casse dans l'identité (nœud, bouts, interfaces, couverture, membres), la référence du `changed` prenant l'écriture
  d'`after`. Comportement courant figé par un test (`test_identity_is_byte_exact…`), à trancher au premier rendu réel.
- **Q6 — Revalider à chaque appel** (revue M5) : `GET /api/diff` relit et revalide les deux snapshots (~2,2 s à la
  jauge) avant de comparer (~1 s) ; `GET /api/snapshot` sert l'archive sans la revalider. Options : construire les
  modèles sans la passe d'intégrité (octets vérifiés à l'écriture), garder en mémoire le dernier snapshot lu par run
  (l'archive est immuable), ou stocker le diff N-1 à côté du snapshot comme produit dérivé remplaçable (ce que la
  décision 7 écarte : à réévaluer avec ce chiffre, avant la toile dont la timeline enchaîne N appels).
- **Q7 — La sévérité dans l'identité d'un contrôle** (revue B2) : D3 identifie par `(code, refs)` ; un passage d'`info`
  à `warning` est un `persisted` invisible. Options : la sévérité dans l'identité (un `resolved` + un `appeared`,
  bruyant), une liste `checks.changed` `(ref, before, after)` sur sévérité et détails, ou assumer et documenter (fait).
