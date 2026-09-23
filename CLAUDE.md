# Living Diagram v12 — mémoire de projet

Application web de diagrammes de topologie **physique (L1)** d'infrastructures réseau
(Cisco IOS-XE / NX-OS, Fortinet, Checkpoint), nourrie par une base MongoDB de collecte
amont. Besoins clés : historique entre runs (snapshots + diff), retouches persistantes
(« couche d'intention »), filtres, LOD par zoom, placement sans template imposé.

Ce fichier est le **journal des décisions**. Le détail vit dans `docs/` ; on ne le recopie
pas ici, on le référence. Toute décision nouvelle ou révisée se note ici avec sa date.

## Règles de travail (non négociables)

- **Annoncer avant de coder, documenter en finissant.** Avant toute implémentation :
  dire quoi, où, avec quelles décisions non triviales. À la fin : arborescence, entrée /
  sortie, comment démarrer, comment tester. Orhan valide et comprend chaque brique avant
  la suivante.
- **Le contrat est le standard.** Orhan adapte ses données au contrat (et le challenge) ;
  ne pas lui demander ses sorties brutes de topics, définir et documenter ce qu'on attend.
  **Le contrat demande ce que B1 consomme, jamais ce qu'un producteur possède** (2026-09-14) :
  ce qui se passe dans le collecteur (driver, parseur, humain, API) ne regarde pas Living
  Diagram ; un champ n'entre pas parce qu'un producteur l'a sous la main, ni n'est refusé parce
  qu'un autre aurait du mal à le fournir.

- **Voir avant de trancher** (Orhan, 2026-09-20). Aucune grosse décision de design ne se prend sans rendu sous les
  yeux : « ce sont des choses qui vont se corriger au fur et à mesure des tests avec un vrai bundle ». Ne pas lui
  faire arbitrer des cas limites abstraits (issus de revues adverses ou de fuzz) : les défauts purs se corrigent sans
  lui, les règles douteuses se parquent en « ouvert » avec un comportement prudent. **Une** revue indépendante par
  brique, pas de boucle revue → contre-revue → re-revue. Une remarque de fond d'Orhan sur le modèle ou le contrat passe
  avant tout code en cours : s'arrêter, répondre avec un avis et des recommandations.
- **Échanger en français.** Le propriétaire (Orhan, ingénieur réseau) attend de la rigueur,
  des propositions argumentées et de la **confrontation** : pas de complaisance. Il tranche
  les questions visuelles par comparaison de captures.
- **Regard neuf.** `../living-diagram` (v11) n'est **pas** une base de travail : ne pas le
  citer, ne pas en porter le code. `prototype_v11.5.html` a été analysé (verdict dans
  `docs/00-analyse-fondation.md` §6) : on garde des idées, jamais du code.
- **Le front n'invente rien, tout vient de la donnée.** Jamais de câble inventé, jamais
  de numéro de Po synthétisé (ils sont device-locaux), jamais de désaccord résolu en
  silence : un désaccord devient un contrôle d'intégrité visible.
- **Aucune donnée réelle ne sort de l'infra.** Tests sur fixtures JSON synthétiques et
  MongoDB éphémère en container, peuplée par un générateur à seed déterministe qui rejoue
  des scénarios d'évolution (runs successifs avec mutations).
- **Déterminisme** : même bundle d'entrée ⇒ même snapshot, à l'octet. Condition
  d'existence du diff et de la couche d'intention.
- Multi-utilisateur sur la couche d'intention dès le départ.

## Architecture (validée, à challenger sur les six décisions de l'artefact)

Pipeline de briques pures, détaillé dans l'artefact publié
<https://claude.ai/code/artifact/630b787d-6862-4e3c-8e1c-7d40fd373e3c> (copie locale
`docs/living-diagram-v12.html`, à republier **par `url`** pour garder le lien ; v13 du 2026-09-20 ; second artefact
« Le chemin d'un bundle », <https://claude.ai/artifact/FFYf3L28NTfCZmfbZcS4TU>, copie locale `docs/chemin-d-un-bundle.html`, v9 du 2026-09-22 : son
tableau « B1 : ce qui est fait, ce qui reste » se tient à jour à chaque étape) :

```
MongoDB amont : devices (référence) · collector_runs · collector_run_tasks_<id> · <topic>_<id>
   └─ B0 Lecture & assemblage (Python) — seul module couplé au schéma amont, zéro corrélation
        → RunBundle (contrat v1, JSON pur, archivé)
   └─ B1 Corrélation (Python, fonction pure) → snapshot + contrôles + rapport
   └─ B2 Archive (bundles + snapshots, immuables)  ·  B3 Diff typé  ·  B4 Couche d'intention (patchs keyés identité)
   └─ API REST FastAPI — frontière réseau : un seul contrat JSON versionné, types TS générés
   └─ Moteur diagramme TypeScript pur, zéro framework, headless :
        B5 Analyse · B6 Scène (LOD 3 paliers) · B7 Placement (seedé N-1, pins) · B8 Routage · B9 Renderer SVG incrémental
   └─ Shell React : URL = état de vue, panneaux, inspecteur, timeline, filtres, réconciliation
```

- **Vocabulaire** (2026-09-10) : le *snapshot* est un objet (le graphe d'une run), **B1** la fonction
  qui le fabrique, **B2 Archive** l'étagère qui le range avec le bundle, **B3** la comparaison de deux
  snapshots. Analogie retenue par Orhan : appareil photo / photo / album / photos côte à côte.
- **Toile = moteur TS pur ; React = shell uniquement**, jamais dans le chemin chaud.
  Renderer derrière une interface (SVG incrémental d'abord, Canvas possible).
- **Quatre couches** : C0 snapshot (immuable, par run) · C1 dérivé (recalculable) ·
  C2 intention (patchs keyés identités stables, jamais coordonnées ni run) · C3 vue (URL).
  `rendu = f(C0 ⊕ C2, C3)` ; `diff = C0(A) ↔ C0(B)`, jamais C2.
- **Un seul snapshot aux arêtes typées** (câble L1, segment L2, adjacence L3, session
  BGP) ; les diagrammes L1 / L2 / L3 sont des **vues** du même graphe, pas trois modèles.
- **B0 est codé par Orhan dans l'environnement sécurisé** (2026-09-10). Frontière
  **validée le 2026-09-10** : B0 = exportateur séparé qui produit un **RunBundle JSON
  validé** et le pousse vers `POST /api/ingest/bundles` (ou fichier + `ld ingest`, même
  chemin de code) ; artefact partagé = paquet `ld-contracts` (`contracts/` : modèles
  Pydantic, JSON Schema versionné, fixtures, validateur, anonymiseur). Écartés : B0 module
  de B1, endpoints par topic dans l'API de collecte, base partagée comme contrat.
  **Living Diagram tourne dans la même zone que l'API de collecte** et peut lui parler :
  transport par défaut = HTTP local / fichier ; l'API Living Diagram peut appeler
  l'exportateur directement. Détail : `docs/03-b0-lecture-assemblage.md` §7.
- **Bouton d'actualisation** (2026-09-10) : V1 = niveaux 1 (afficher la dernière version
  ingérée) et 2 (demander un nouvel export de la dernière run, via file de demandes).
  **Niveau 3 (déclencher une run de collecte puis afficher le diagramme mis à jour) est
  certain, pas une hypothèse** : à concevoir dès maintenant dans la file de demandes
  (`collect + export`), à livrer après la V1. Détail : `docs/03` §7.8.
- **`/docs` charge Swagger UI depuis un CDN** (2026-09-10) : comportement FastAPI par défaut conservé
  pour l'instant (option 3). Le serveur n'ouvre aucune connexion sortante, c'est le navigateur qui charge
  les scripts. Options écartées mais documentées dans `backend/README.md` § Depuis `/docs` : embarquer
  Swagger UI dans le paquet (recommandée si la zone n'a pas d'accès Internet), ou désactiver `/docs`.
  `/openapi.json` et `/docs` restent servis sans jeton (surface d'API et contrat, déjà public).
- **Où normaliser, où assembler, où corréler** : valeurs et unités dans la **librairie de
  collecte** (par topic, une commande) ; jointures entre topics dans **B0** ; tout ce qui
  relie deux devices dans **B1**. La normalisation résiduelle de B0 est comptée dans le
  rapport de corrélation et doit tendre vers zéro.
- Stack technique et versions vérifiées : `docs/00-analyse-fondation.md` §9.

## Modèle de données amont (acquis)

**Référence normative : `contracts/CONTRAT.md`.** Historique du raisonnement :
`docs/01-revue-collecte-interfaces.md`, `docs/02-revue-collecte-devices.md`,
`docs/03-b0-lecture-assemblage.md`, `docs/04-modeles-topics-l1.md`.

- **`devices`** = table de référence, hors run, représente le présent, filtrable par
  `infrastructure` (hostname, site, infrastructure, type, brand, brand_model, os_name,
  os_version, serial_number). **Plus de CMDB** (2026-09-08). Un device = une infra. Un
  stack = un document. Pas de VDC ; du VSX Checkpoint (modélisation à confirmer).
  `type` figé : `switch | router | firewall | load_balancer | wireless_controller | server | other`.
  `os_name` non normalisé, chaîne libre d'affichage, **copié sur le nœud du snapshot avec `os_version`**
  pour l'inspecteur (« NX-OS 10.4(2) », docs/05 §2.1, décision 2026-09-14). **`platform` retiré du topic `system`
  (2026-09-14)** : introduit le 2026-09-10 comme énumération fermée, aucune règle de `docs/05` ne le
  consommait (R1 résout les noms distants par recherche dans `interfaces[]`, sinon par les évidences
  CDP / LLDP et `devices[].vendor`) ; reviendra avec sa règle et son test si un besoin apparaît. `vendor` / `model`
  conservés comme noms, chaînes libres (décision 2026-09-10).
- **Runs** : une API lance une collecte (ensemble d'équipements, liste de topics) ;
  `collector_runs` (collection_name libre, collector_run_id, start/end, status) ; une
  collection `<topic>_<collector_run_id>` par topic et par run ;
  `collector_run_tasks_<id>` avec `status_per_subject` ne listant que les topics
  supportés et sélectionnés (absent = rien à attendre). Une run couvre tout le parc par
  défaut ; filtrage par le champ `infrastructure` des documents.
- **Identité** : `hostname` = clé, copié depuis devices dans toutes les collections ;
  domaine DNS retiré des voisins LLDP/CDP en amont ; noms d'interfaces **locaux**
  canoniques et identiques entre topics ; noms d'interfaces **distants** bruts (B1
  normalise court ↔ long Cisco). Lien = paire d'endpoints triée ; jamais d'id synthétique.
- **Descriptions** : `criticité|device_voisin|port_voisin|options`, premier champ =
  criticité (vocabulaire non figé). Brutes en base ; le parseur vit dans B1.
- **Doctrine** : LLDP/CDP = observé, description = documenté ; l'observé dessine le lien,
  le documenté commente le port ; désaccord ⇒ contrôle. Voisin inconnu = stub ; voisin
  d'une autre infra = externe connu.
- **Stacks** : 1 nœud, badge ×N nourri par `system.chassis_members` (option c).
- **Clusters HA** : 2 nœuds + cartouche via le topic `ha` ; `heartbeat_interfaces`
  demandé pour combler le trou d'août. **`local_role` / `local_state` retirés de `HaStatus`**
  (2026-09-14, demande d'Orhan) : la vue locale se lit dans `members`, où le device local doit
  figurer octet pour octet et une seule fois (`ha_local_not_in_members`, `ha_member_duplicate`, refus) ;
  `standalone` = exactement un membre, lui-même, rôle `member` (`ha_standalone_not_alone`).
- **MLAG / vPC** : `mlag_id`, `mlag_peer_link` au premier niveau du topic `aggregates`
  (remplace « vPC dans extras », 2026-09-10).
- **Règle premier niveau vs `extras`** : premier niveau si le concept est agnostique, le
  type normalisé, et B1 le consomme ; sinon `extras`, jamais lu hors clés déclarées.
- **`run_id`** n'est pas sur les documents (dans le nom de la collection) ;
  `collected_at` attendu par (device, topic) dans les tasks.
- **`infrastructure` n'est plus sur les documents de topic du bundle** (2026-09-14, demande d'Orhan) :
  au premier niveau et sur `devices` seulement. Le validateur contrôle l'appartenance **via `devices`**
  (`hostname_outside_infrastructure`), qui fait foi ; le périmètre d'un bundle est celui de `devices`
  au moment de l'export. Contrat 1.0.0 modifié en place : gel au premier bundle réel ingéré
  (règle dans `contracts/README.md` § Décisions).
- **`last_change_age_seconds` = `entier ≥ 0 | "never" | null`** (2026-09-16) : « never » est un fait
  (aucun changement depuis le dernier démarrage, RFC 2863 `ifLastChange = 0`), distinct de « non lu ».
  Sentinelle `-1` proposée par Orhan, écartée : sans borne elle passait déjà, et la règle de flap
  `collected_at - âge` l'aurait lue comme un flap sans erreur. B1 lit `"never"` comme un âge
  ≥ `system.uptime_seconds`. Motifs : `contracts/README.md` § Décisions, `docs/01` §2.5.
- **`access_vlan` ajouté à `interfaces`** (2026-09-16) : `entier ≥ 1 ≤ 4094 | null`, VLAN d'un port
  `access` ; `vlan_id` reste réservé à la sous-interface et à la SVI (sens différent, pas de champ à
  double lecture). Justification B1 : CDP annonce l'access VLAN comme VLAN natif, le contrôle de
  désaccord compare `neighbor_native_vlan` au VLAN non tagué local (`access_vlan` ou `native_vlan`) ;
  **révisé le 2026-09-18** : `neighbor_native_vlan` retiré, B1 compare les VLAN non tagués des deux bouts.
  `native_vlan` borné `1..4094` ; VLAN renseignés hors de leur mode
  **refusés** (`access_vlan_outside_access_mode`, `trunk_vlans_outside_trunk_mode`), mode `null` compris.
  `switchport_mode` = mode configuré résolu, jamais « down » (un port access `notconnect` garde son
  VLAN) ; `none` = lu, aucun mode applicable ; `null` = non lu. Contrôle B1 : `native_vlan_mismatch`
  (docs/05 R5). Motifs : `contracts/README.md` § Décisions.
- **`allowed_vlans` = liste d'intervalles `{first, last}`** (2026-09-16) : entiers stricts 1..4094,
  `first ≤ last` (`vlan_range_inverted`), doublons et chevauchements refusés (`vlan_ranges_overlap`),
  VLAN unique = `first == last`, `all` = `[{"first": 1, "last": 4094}]`, `[]` = aucun, `null` = non lu.
  Orhan proposait une liste de chaînes `"10-20"` ; écartée : deux entiers en texte, à côté
  d'`access_vlan` en entier. B1 fait l'union et trie (R6, spécifié). Au passage, l'anonymiseur ne
  remplace plus un hostname court (`10`, `aa`) à l'intérieur des IP et des MAC. Motifs :
  `contracts/README.md`.
- **`lldp` et `cdp` réduits à six champs identiques** (2026-09-18, demande d'Orhan : topic trop lourd à
  construire) : `hostname`, `local_interface`, `neighbor`, `neighbor_interface`, `neighbor_capabilities`,
  `extras`. Retirés : sous-types, port-description, chassis-id, IP de management, system-description, TTL
  (LLDP) ; serial, plateforme, IP de management, VLAN natif, duplex, version (CDP). Motif : ce qu'un voisin
  **collecté** annonce de lui-même est dans ses propres topics. Conséquences dans `docs/05` : R0 joint sur
  `system[].reported_hostname` (plus de serial, chassis-id, IP) avec `neighbor_name_ambiguous` si plusieurs
  devices répondent ; R1 n'a plus que CDP et `devices[].vendor` comme évidence Cisco, sinon équivalence de
  noms ; claim `remote_description` supprimé ; `native_vlan_mismatch` (R5) compare les `interfaces[]` des
  deux bouts, donc aussi sur un câble vu par LLDP seul. Sans sous-type, **une MAC se reconnaît à sa forme**
  et doit être normalisée dans `neighbor` et `neighbor_interface` (`mac_not_normalized`, `lldp` et `cdp`,
  erreur portée par le champ ; trois notations reconnues, douze chiffres hexadécimaux sans séparateur restent
  un nom) ; `neighbor_capabilities` = jetons `^[a-z0-9_]+$`, protégés dans l'anonymiseur ;
  `LldpIdSubtype` supprimée. Pertes assumées : port d'en face d'un voisin non collecté qui annonce une MAC
  (R3 juge l'accord sur le device, `remote_port_is_mac`), inspecteur des stubs réduit au nom et aux
  capacités, voisin renommé et injoignable fini en stub. Motifs : `contracts/README.md` § Décisions.
- **Endpoints hors cible pour le moment** (2026-09-18) : la cible est la topologie réseau ; serveurs,
  téléphones, bornes ne sont pas dessinés. **B1 ne filtre rien** : les stubs restent dans le snapshot, la
  vue réseau les masque par défaut (filtre sur `kind = stub` et capacités annoncées), d'où
  `neighbor_capabilities` conservé. Réversible sans recalcul.
- **Clé nullable absente = `null`, comptée** (2026-09-19, demande d'Orhan) : les ~51 champs `X | null` ont
  `default=None` ; l'oubli n'est plus un 422 mais un constat agrégé `nullable_key_absent` (un par champ,
  occurrences + devices, trié par chemin ; `contracts/src/ld_contracts/defaults.py`, via `model_fields_set`).
  Motif : le 422 poussait à écrire `doc.get(...)` dans B0, oubli invisible ; il est maintenant compté et doit
  tendre vers zéro, comme `residual_normalizations`. Garde-fous : faute de frappe toujours refusée
  (`extra="forbid"`), non-nullables toujours requis, défaut jamais une valeur, test garde-fou sur le schéma.
  `--strict-findings` rend la fonction de forçage : à utiliser dans les tests de l'exportateur.
  **Le compte vit dans le rapport d'ingestion, jamais dans le snapshot** : l'archive garde la forme canonique
  (toutes clés écrites, même `sha256` pour clé absente et `null` explicite), donc le compte ne se recalcule
  pas au rejeu ; B1 le recopier casserait le déterminisme (`docs/05` §2.7). Doctrine : **`null` n'affirme
  jamais un fait** (« pas de valeur » : non lu, sans objet, non fourni) ; un fait s'écrit avec une valeur.
  Revue indépendante appliquée : l'exportateur envoie ce qu'il a produit (`json.dumps(bundle)` ou
  `model_dump_json(exclude_unset=True)`), **jamais la forme canonique, qui efface les absences** ; l'anonymiseur
  conserve les absences ; le parcours ne descend pas dans `extras` ; réponse du POST = livraison reçue,
  `GET …/report` = première livraison archivée.
- **`vrf` : `"default"` = table globale, `null` = non lu ou sans objet** (2026-09-19, proposition d'Orhan ;
  avant : « null = table globale »). Nom réservé en minuscules exactes (`VRF_GLOBAL` dans `common.py`), natif
  sur NX-OS / EOS / IOS-XR, traduit par la librairie de collecte ailleurs (IOS-XE sans `vrf forwarding`, Junos
  `master`, FortiOS vrf `0`, Gaia). `texte non vide | null`. Valeur réservée acceptée ici alors que `-1` a été
  écarté : B1 ne calcule rien sur `vrf`, c'est une clé `(hostname, vrf)`, la table globale est une instance
  comme les autres. Casse jamais normalisée (`Default` = VRF utilisateur sur NX-OS) : constat
  `vrf_default_case`. Pas de refus d'un `vrf` sur port commuté (aucune règle de B1). Anonymiseur : `default`
  conservé. Collision assumée : VRF utilisateur nommée exactement `default` (à vérifier sur IOS-XE).
  Documentation : `CONTRAT.md` § « `null` et valeurs réservées » (tableau par plateforme).
  **Ouvert** : `virtual_context` (« null si non partitionné ») a le même défaut ; description reformulée,
  jeton à choisir avec la modélisation VSX.
- **Surface d'API consolidée avant B1** (2026-09-19, test de bout en bout sur instance réelle, 20 bundles au
  `curl` ; Orhan : « une base solide plutôt qu'un patch en urgence »). **Une run s'adresse par paramètres de
  requête, jamais par le chemin** : `GET /api/ingest/bundle?infrastructure=&run_id=` et `…/report?…` ; avec `/`
  dans un libellé, une run archivée était listée mais illisible (404). Écarté : refuser `/` dans le contrat
  (`infrastructure` est un libellé libre venu de `devices`, une raison d'URL ne le contraint pas). `meta.json`
  porte `run_start`, `run_end`, `run_status` ; **la liste des runs est triée par début de collecte**, pas par
  date d'export : ordre de la timeline et du diff N-1. Réponses typées (`backend/src/ld_backend/schemas.py` :
  `IngestReport`, `RunList`…) donc présentes dans OpenAPI pour les types TS ; `summary` = `null` quand le
  bundle n'est pas lu ; `archived_path` supprimé (il annonçait un chemin faux) ; 409 avec `conflict`
  (deux empreintes, date de première ingestion) ; constat structuré `details` ; dates écrites par le backend en
  UTC `Z` ; 415 hors JSON ; erreurs de paramètres à la forme de l'API, sans écho ; une ligne de journal par
  ingestion (`%r` sur les identifiants). Mesuré : 500 devices / 24 000 interfaces / 15,5 Mo en 1,5 à 1,8 s,
  ~215 Mo résidents. Détail : `backend/README.md`.
- **`docs/05` §8 : questions 3, 4, 5, 7, 8 tranchées** (2026-09-20, Orhan) : deux voisins sur un port ⇒ deux
  câbles + contrôle ; grille de sévérités error / warning / info ; device injoignable ⇒ câbles `documented_only`
  depuis l'autre bout ; snapshot dans `ld-contracts`, module `snapshot`, `CONTRAT.md` en deux parties ; semver du
  snapshot indépendant du bundle. **Question 1 tranchée le même jour** : `port-channel10` devient le peer-link, un vrai vPC 20
  (`port-channel20`, un membre par cœur) relie les cœurs à `fw-edge-01` (`x1` / `x2`, agrégat FortiGate) ; scénario 3
  = test positif du domaine MLAG, `mlag_pair_direct_link` sur fixture dédiée. **Reste** : question 6 (échantillon
  de descriptions, non bloquant). **`docs/05` validé : les modèles du snapshot peuvent être écrits.**
- **Les collections de topics amont portent `infrastructure`** (2026-09-20, Orhan) : réponse à la question B0
  ouverte le 2026-09-14. Règle inchangée (`docs/03` étape 4) : la copie sert d'index Mongo, jamais de périmètre ;
  le périmètre est la jointure sur `devices` lue à l'export.
- **Contrat Snapshot v1 écrit** (2026-09-20, après le « go » d'Orhan sur sept décisions annoncées) :
  `contracts/src/ld_contracts/snapshot/`, partie B de `CONTRAT.md`, `snapshot-v1.schema.json`,
  `fixtures/snapshot-skeleton.json`. Décisions : ordre canonique **refusé par le type** (clé naturelle
  `snapshot/order.py`, partagée avec B1) ; référence non résolue = **refus** (`reference_unknown`), un snapshot
  incohérent est un bug de B1 ; **aucune clé nullable absente** (tous les champs requis, pas d'`extras`) ;
  **catalogue fermé** `CheckCode` (docs/05 §4 ∪ constats du bundle sauf `nullable_key_absent`, `origin` en champ,
  sévérité contrôlée ; constats du bundle en warning, `vrf_default_case` info) ; types partagés avec le bundle ;
  golden différé à B1 ; fixture Q1 corrigée. Renommage : `from` → `witness` dans les évidences.
  Refactor : `FINDING_CODES` dans `checks.py`, `docgen.py` scindé en trois, `schema --contract`.
  **Revue indépendante appliquée le même jour** (24 points, tout traité) : cohérences structurelles refusées
  (`reference_inconsistent`), `hostname` unique sans la casse toutes sortes confondues, `coverage` = `collection`,
  description sans port ⇒ accord sur le device (R3), règle VLAN / mode partagée, `validate --contract snapshot`.
  Corrections de `docs/05` : scénario 9 (aucun `reported_hostname_differs` : le contrat compare sans la casse),
  R6 `(code, refs, details)`, clé de lien sans `kind` en V1 (majeure à prévoir avec les vues L2 / L3).
  Motifs : `contracts/README.md` § Décisions. **Suite : B1 en TDD dans `backend/`** (`docs/05` §6 et §7).
- **B1 étape 1 (R0 à R3, R6) écrite** (2026-09-20, après « Go B1 » d'Orhan sur cinq décisions) : seules les
  interfaces `physical` / `management` produisent des claims de câble (la description d'un agrégat est parsée, jamais
  dessinée) ; grammaire V1 des descriptions isolée (`descriptions.py`, champ 2 obligatoire de forme hostname) ; vue
  HA par membre (étape 2) ; fixtures dédiées en mémoire ; pas de version du corrélateur dans le snapshot. `correlate`
  reçoit l'empreinte du bundle archivé en argument. Découpage : étape 1 nœuds / interfaces / câbles, étape 2 R4-R5 +
  golden, étape 3 branchement (`snapshot.json`, `GET /api/snapshots`, `ld correlate`). Guide : `backend/README.md` § B1.
- **Revue indépendante de B1 étape 1 : lot 1 appliqué, lot 2 à valider** (2026-09-20). La session de revue a été
  coupée par la limite de session avant toute correction ; rapport retrouvé dans la transcription et **consigné dans
  `docs/revues/2026-09-20-b1-etape-1.md`** (règle : un rapport de revue s'archive dans `docs/revues/` dès sa remise,
  avec son suivi). 2 critiques, 2 hauts, 7 moyens, 11 bas. Lot 1 (défauts purs) : référence de contrôle repliée sur le
  nœud quand le port local est absent de `interfaces[]` (`checkbuild.py`, un seul fabricant de contrôles) ;
  réciprocité linéaire (clés calculées une fois par claim ; fusion à 9 600 claims : 46 s → 1,2 s) ; hub déterministe,
  `details.neighbors` = tous les voisins du port témoin ; **nouveau code `self_observation`** (warning, R3 : `A/p → A/p`
  en LLDP / CDP / description, aucun câble) ajouté au catalogue du contrat Snapshot ; IP comparée sur sa valeur ;
  `vendor` commence par `cisco` sans la casse ; **repli sur `interfaces[].members` quand le topic `aggregates` n'est
  pas en `success`** (absent ou `failed` ; écart assumé avec le relecteur qui disait « absent » seul). Test de
  performance = compte d'expansions de noms, pas un chronomètre. **Lot 2 tranché par Orhan et codé le même jour** :
  l'observé gagne toujours, la description n'arrive qu'en dernier lieu ; une description est placée par rapport aux
  câbles observés à ses **deux** bouts, un port ne porte qu'un câble (M2, `details.observed_at`) ; MAC non résolue chez
  un device collecté = un seul câble, bout `(B, MAC)`, description d'en face absorbée car le contrat refuse une
  évidence hors des bouts du lien (M3) ; description sans port = confirme s'il y a un seul candidat, sinon rien (M4) ;
  `description_unparseable` limité aux ports `physical` / `management` (B10) ; **B3 abandonné**.
- **Contre-revue de B1 étape 1 : défauts purs corrigés, quatre questions ouvertes** (2026-09-20). Rapport et sondes
  dans `docs/revues/` (consignés dès réception). Aucune correction fausse, deux incomplètes. Corrigé : port local sous
  deux écritures équivalentes (le bout prend l'écriture que `interfaces[]` connaît, le témoin d'une évidence porte le nom
  du bout, évidences dédoublonnées) ; **alias de topic lus dans un ordre écrit** (nom canonique, puis alphabétique : le
  snapshot dépendait de `PYTHONHASHSEED`, invisible à tout test de permutation ⇒ **le déterminisme se teste aussi entre
  processus**, en sous-processus sous plusieurs graines) ; un nom en forme d'adresse est d'abord un nom (R0, niveaux 1
  et 2 avant le niveau 4) ; `multiple_observed_neighbors` vise tout port à plusieurs câbles observés, port muet compris.
  **Tranché par Orhan le même jour** : M1 ⇒ refus `member_in_several_aggregates` dans le contrat d'entrée
  (`aggregates[].members` et `interfaces[].members`) ; M2 ⇒ refus `chassis_member_slot_duplicate`, et une IP strictement
  en double est retirée par B1 ; M3-a ⇒ des descriptions contradictoires entre elles dessinent chacune leur câble
  `documented_only` sans contrôle de plus, l'arbitre sera la table MAC. **Principe retenu : ce que le contrat de sortie
  refuse, le contrat d'entrée ne le laisse pas passer**, sinon B1 plante entre les deux. Contracts 398 tests, backend
  187, `correlate/` à 100 %. **Encore ouvert : H2** (réconcilier deux observations d'un même câble quand l'une n'a
  qu'une MAC pour port : bornes LLDP + CDP, FortiGate dont les membres portent la MAC de l'agrégat), proposé pour
  `docs/06`.
- **Tranche visible avant la suite** (2026-09-20, validé « complètement » par Orhan). Pour lui `CONTRACTS` est la
  brique fondamentale (des données propres, noms d'interfaces canoniques partout, facilitent tout le reste) ; nuance
  actée : le contrat garantit la forme et la cohérence, pas la vérité (sources qui se contredisent, firewalls sans
  LLDP), et les noms locaux non canoniques sont déjà détectés (`local_interface_unknown`, `--strict-findings` dans les
  tests de l'exportateur). **But, dans ses mots : générer des pages HTML qui permettent de visualiser ce que ça donne
  et de montrer les sources** (tel lien tracé avec des données LLDP, tel cluster de firewalls avec des données HA…).
  Plan : (1) brancher B1 (ex-étape 3 : `snapshot.json` à côté du bundle, `ld correlate`, `GET` du snapshot) ;
  (2) pages HTML de visualisation servies / générées par le backend, **hors ligne** (aucun CDN), nœuds et câbles
  colorés par statut, clic ⇒ évidences, contrôles, couverture, rapport ; incrément A = câbles et leurs sources,
  incrément B = clusters HA et agrégats (tire la partie HA / agrégats de R4 dans la tranche) ; (3) côté Orhan, un
  premier exportateur minimal sur une petite infra (`devices`, `tasks`, `interfaces`, `lldp`, `cdp` ; `aggregates`,
  `system`, `ha` peuvent être des listes vides) ; (4) regarder ensemble, `ld-contracts anonymize` si des captures
  doivent sortir. Orhan s'en servira aussi pour **ajuster son exportateur et ses données** (revoir les descriptions
  d'interfaces, par exemple) : les pages montrent la qualité des données autant que le graphe (rapport d'ingestion,
  descriptions non parsables, désaccords, voisins non résolus, couverture). C'est un outil de lecture de B1, **pas le moteur de diagramme** : le pari « posséder la toile » reste
  ouvert. **Parqués jusqu'au premier rendu** : H2, `docs/06` (table MAC), le reste de B1 étape 2 (R5, golden).
- **B1 branché** (2026-09-20, première brique de la tranche visible ; annoncé avant le code). `ingest.py` appelle B1
  après `archive.store` (`backend/src/ld_backend/snapshots.py`), `snapshot.json` se range à côté du bundle,
  `GET /api/snapshot?infrastructure=&run_id=` le sert, `ld correlate` le recalcule. Deux décisions : **un échec de B1
  ne fait jamais échouer l'ingestion** (201, `correlation.status = "failed"`, trace au journal seulement, 404 explicite
  sur le GET) ; **le snapshot est un produit dérivé, donc remplaçable** (seul fichier de l'archive qui l'est : une
  livraison identique ne le recalcule pas, `ld correlate` l'écrase, mêmes octets à code égal). Le rapport archivé garde
  `correlation: null` : il décrit l'ingestion. OpenAPI : les deux contrats générés en une passe. **Revue indépendante
  le même jour** (`docs/revues/2026-09-20-branchement-b1.md`, 2 hauts, 4 moyens, 4 bas, tout traité) : **le snapshot se
  calcule toujours sur le bundle archivé**, jamais sur une livraison qui ne l'est pas (l'enveloppe est hors empreinte
  mais recopiée dans `snapshot.source`) ; archive corrompue isolée par `ld correlate` ; journal d'échec en deux lignes,
  la première sans valeur ; snapshot vide ou tronqué = absent (`fsync`, `has_snapshot` sans lecture) ; coûts remesurés
  (4 s à 512 devices, timeout client ≥ 60 s). Backend 220 tests, 99 %.
- **Pages HTML de lecture : `ld render`, incrément A écrit** (2026-09-20, « go » d'Orhan sur trois décisions
  annoncées). `backend/src/ld_backend/render/` : un fichier HTML autonome par run, **sans librairie ni ressource
  externe**. `ld render bundle.json --out page.html` valide, corrèle et dessine **sans archive ni serveur** (boucle de
  mise au point de l'exportateur : pas de 409) ; `ld render --infrastructure --run-id` dessine une run archivée. Quatre
  vues : graphe (câbles par statut, clic ⇒ sources / contrôles / ports), contrôles, **qualité des données** (couverture
  device × topic, constats d'ingestion, descriptions non lues, voisins non résolus, normalisations), sources. Placement
  force-dirigé écrit à la main, déterministe (0,2 s à 500 nœuds), nœuds sans câble rangés sous le graphe, stubs masqués
  par défaut, deux câbles entre les mêmes équipements tracés séparément. **Chaînes hostiles** : JSON embarqué échappé,
  jamais de HTML écrit depuis une donnée (test sur les sources du visualiseur), CSP par empreinte, test « aucune URL ».
  **La page est aussi sensible que le bundle** (anonymiser puis `ld render` pour sortir une capture). État de vue dans
  le fragment d'URL. Visualiseur testé sous Node (faux DOM, lancé par pytest) **et rendu réel vérifié par captures**
  (Chromium headless du cache Playwright, `~/.cache/ms-playwright/`). **Revue indépendante consignée et traitée**
  (`docs/revues/2026-09-20-pages-ld-render.md` : sécurité validée sous bundle hostile dans un vrai navigateur ; 1 haut,
  4 moyens, 5 bas) : un contrôle de port n'est compté que sur le câble que ses détails désignent ; la page ne dit plus
  « concordent » (confirmé = observé et documenté, pas plus) ; `#link=` porte l'identité du câble, pas son rang ;
  fragment illisible ignoré ; sélection centrée ; ports up sans câble signalés ; test de fumée dans Chromium.
  Backend 235 tests, 99 %. **`QUICKSTART.md` à la
  racine** (demande d'Orhan) : pas à pas condensé, commandes et API, vérifié sur instance réelle. Reste : page servie
  par le backend (`/view`), incrément B (agrégats, clusters HA ⇒ partie de R4), premier bundle réel.
- **Descriptions de production peu fiables ; LLDP jamais activé sur les firewalls** (Orhan, 2026-09-20) : LLDP n'est
  pas activé et ne le sera pas sur les firewalls, tous constructeurs confondus ; ils sont majoritairement raccordés
  en port-channel. Leurs câbles sont donc aujourd'hui `documented_only`, fondés sur une source peu fiable. Ne plus
  investir dans la grammaire des descriptions (question 6 de `docs/05` sans objet pour l'instant).
- **Topic `mac_table` : décidé sur le principe, à concevoir** (2026-09-20, remarque d'Orhan : aucun topic MAC ni ARP
  dans le contrat d'entrée). Révision du classement de `docs/04` (« overlays L2 / L3, plus tard ») : la table MAC est
  la seule source **observée** du L1 pour un équipement sans LLDP / CDP. **Rangs validés : `lldp` / `cdp` > `mac_table`
  > `description`** (une entrée MAC dit « joignable par ce port », pas « voisin » : elle ne dessine que sur un port de
  bordure). Le topic entre avec sa règle, pas comme donnée « utile à l'avenir ». Plan validé : finir la revue de B1 →
  `docs/06-evidence-table-mac.md` à faire valider → code après l'étape 2 de B1 (l'évidence arrive au niveau agrégat),
  avant la première ingestion réelle. **ARP : plus tard, avec la vue L3** (aucune règle du L1 ne le consomme ; ajout
  additif). À traiter dans `docs/06` : MAC apprise sur le Po et non sur ses membres (firewalls en Po ⇒ lien au niveau
  agrégat seulement ; piste : partenaire LACP par membre), MAC virtuelles des clusters HA, vieillissement et diff,
  volume. En attente chez Orhan : nombre d'entrées MAC (infra, plus gros cœur), rétention des collections amont.
- **R1-bis : port distant annoncé par le nom d'un agrégat** (2026-09-22, cas réel d'Orhan : le seul firewall de
  son infra avec LLDP, un FortiGate, annonce en port-id le nom de son agrégat sur chaque membre ; « Go » sur la
  règle annoncée). **Contrat inchangé** : `neighbor_interface` reste brut, l'exportateur ne traduit jamais (le switch
  ne sait pas sur quel membre il tombe). Avant : câble jusqu'à l'agrégat, 4 faux `description_disagrees_with_observed`
  et 2 faux `multiple_observed_neighbors`. Maintenant (`backend/src/ld_backend/correlate/aggregates.py`, entre
  `collect_claims` et `build_links`) : un claim observé visant un agrégat du voisin collecté désigne **un de ses
  membres**, cherché dans l'ordre des rangs (observation inverse depuis un membre > membre unique > description du
  témoin ou d'un membre), premier qui parle décide, plusieurs candidats = personne ; membre trouvé ⇒ claim reciblé,
  compteur `aggregate_port_to_member` ; sinon câble arrêté à l'agrégat, **nouveau code `remote_port_is_aggregate`**
  (warning, `details` = `neighbor`, `aggregate`, `members`), bout agrégat jamais un hub et concordant avec tout
  membre. Même famille que H2 (MAC de l'agrégat), à résoudre par la même voie ; cas indéterminé résorbable par le
  partenaire LACP (`docs/06`). `cisco.py` extrait d'`ifnames.py` (feuille sans contexte). Rendu vérifié en Chromium :
  la source affiche « agg-core → x1 ». Détail : `docs/05` R1-bis. **Revue indépendante consignée et traitée le même
  jour** (`docs/revues/2026-09-22-r1-bis-agregat-port-id.md` : 0 critique, 1 haut, 2 moyens, 4 bas) : agrégat et
  membre concordent **dans les deux sens** (une description `C2|fw|agg-core|`, ce que `show lldp neighbors` affiche,
  n'est pas un désaccord) ; une auto-observation n'est jamais reciblée ; un bout agrégat est un hub au-delà d'un voisin
  par membre. Parqués, comportement visible : deux bouts annoncés par leur agrégat (une passe), membre pris deux fois
  par description. **À dire à Orhan** : `aggregates[]` fait foi quand le topic est en succès, un `aggregates[]`
  incomplet rend R1-bis aveugle. Backend 248 tests, `correlate/` 100 %.
  Au passage, confirmé avec Orhan : un voisin sans capacités annoncées ⇒ `neighbor_capabilities: []`
  (ni `null`, ni `unknown` : le champ est requis, une liste vide est un fait, un jeton inventé polluerait l'union) ;
  la page `ld render` masque aujourd'hui **tous** les stubs, le filtre par capacité de `docs/05` §2.1 reste à écrire.
  **En attente chez Orhan** : le FortiGate remonte-t-il ses propres voisins dans le topic `lldp` (rang 1 de R1-bis).
- **B1 embarque la liste devices lue** dans le snapshot ; **B2 archive le bundle brut** :
  historique et rejeu indépendants de la rétention amont.

## Questions ouvertes (2026-09-10)

- Sorties réelles de la librairie pour lldp, cdp, aggregates, ha (écart à marquer).
- Tasks : valeurs de `status`, début/fin par subject, forme d'un device injoignable.
- Topic `system` à créer côté collecte (modèle : `contracts/CONTRAT.md` § system).
- VSX : un document devices par passerelle ou par Virtual System ; VS0 seul ou tous.
- Énumérations réelles de `type`, `admin_status`, `oper_status`, `duplex` (interfaces) ;
  `site` libre ou référentiel ; échantillon de descriptions réelles anonymisées.
- Le pari « posséder la toile » (décision ③ de l'artefact) n'est pas tranché.
- Zones fonctionnelles : inférées faute de source (CMDB disparue).

## Séquencement

Phase 0 contrat pivot **livrée le 2026-09-20** (RunBundle v1 et Snapshot v1 dans `ld-contracts`, `CONTRAT.md`
en deux parties entrée / sortie, `docs/05` validé) → **Phase 1a, la tranche visible (révision du 2026-09-20)** : B1
étape 1 (fait) → branchement de B1 (fait) → pages HTML (incrément A fait : `ld render`) de visualisation avec les sources → premier bundle réel (exportateur
minimal d'Orhan) → on regarde, on corrige → Phase 1b : B1 étape 2 (R4 / R5, golden), table MAC (`docs/06`), B2, B3,
en TDD sur fixtures au format réel des collections → Phase 2 socle toile (jauge
de perf 500 nœuds / 1 500 liens) → Phase 3 placement → Phase 4 timeline + diff peint →
Phase 5 intention + réconciliation → Phase 6 LOD complet, vues nommées, overlays L2/L3.
Détail : `docs/00-analyse-fondation.md` §10.

## Repo

- `QUICKSTART.md` — **démarrage rapide** (2026-09-20) : un bundle → une page HTML, en ligne de commande et par l'API ;
  à tenir à jour à chaque nouvelle commande ou route
- `docs/00-analyse-fondation.md` — analyse et thèses (2026-08-13)
- `docs/01-…04-…` — revues du modèle amont et modèles cibles (2026-09-08 → 10)
- `docs/05-snapshot-et-correlation.md` — **conception du snapshot (second contrat) et des règles de
  B1** (2026-09-10) : modèle, règles R0 à R6, codes de contrôle, dix scénarios de la fixture, huit
  questions. **Validé par Orhan le 2026-09-20 (sept questions sur huit tranchées, la 6 non bloquante).**
- `docs/revues/` — rapports de revue indépendante consignés tels que rendus, avec leur suivi (2026-09-20 :
  `2026-09-20-b1-etape-1.md`, sa contre-revue, `2026-09-20-branchement-b1.md`, `2026-09-20-pages-ld-render.md` ; 2026-09-22 : `2026-09-22-r1-bis-agregat-port-id.md`) et leurs sondes rejouables
- `docs/living-diagram-v12.html` — source de l'artefact d'architecture (v5 du 2026-09-10 : lane
  exportateur séparée, route d'ingestion, tableau d'avancement, renvoi vers docs/05)
- `prompts.md` — échanges bruts du propriétaire (historique)
- `prototype_v11.5.html` — prototype analysé, pas une base
- `contracts/` — paquet **`ld-contracts`** (2026-09-10) : **référence du modèle de données =
  `contracts/CONTRAT.md`** (générée depuis les modèles, `ld-contracts docs --out`, test de
  dérive) ; **guide de démarrage dans `contracts/README.md`** (ce que c'est, entrée / sortie, arborescence, cinq commandes,
  usage depuis l'exportateur). Python **3.14** via `uv`,
  Pydantic 2.13. Modèles du RunBundle v1, JSON Schema versionné dans
  `src/ld_contracts/schema/`, contrôles référentiels, anonymiseur, CLI
  (`uv run ld-contracts validate|schema|anonymize`), fixture `fixtures/bundle-minimal.json`.
  Tests : `cd contracts && uv run pytest --cov=ld_contracts && uv run ruff check src tests`
  (état 2026-09-20 : 398 tests, 98 %, deux refus ajoutés après la contre-revue de B1, contrat Snapshot v1 en partie B de `CONTRAT.md`, `schema --contract snapshot --out` ;
  2026-09-19 : 291 tests, 97 %, clé nullable absente lue comme `null` et comptée, `vrf` `"default"` = table globale, une passe de revue indépendante appliquée ; 2026-09-18 : 246 tests, `lldp` / `cdp` réduits à six champs et MAC reconnue à sa forme, une
  passe de revue indépendante appliquée ;
  2026-09-16 : `allowed_vlans` en liste d'intervalles (chevauchements refusés), `access_vlan` ajouté avec refus de cohérence VLAN / mode, `last_change_age_seconds` en `entier ≥ 0 | "never" | null`
  et protégé dans l'anonymiseur ; 2026-09-14 : `platform` retiré de `system`, `infrastructure` retiré des
  topics, `local_*` retirés de `ha` ; trois passes de revue de code indépendantes appliquées ; les
  rapports de validation ne contiennent aucune valeur sans `--show-values` ; la graine de
  l'anonymiseur passe par `LD_CONTRACTS_SEED` ou `--seed-file`). Le schéma versionné doit être
  régénéré (`ld-contracts schema --out`) à chaque changement de modèle : un test le vérifie.
- `backend/` — paquet **`ld-backend`** (2026-09-10) : la porte d'entrée. `POST /api/ingest/bundles`
  (valider via ld-contracts → archiver brut → rapport ; 201 / 200 identique / 409 différent / 422 /
  401 / 413 / 415), trois GET de lecture adressés par paramètres de requête, `/api/health`, CLI `ld ingest | runs | serve` sur le même code.
  Archive disque `archive/<infra>/<run>/` derrière `BundleArchive` (début de B2, Mongo plus tard).
  Jeton `LD_API_TOKEN` obligatoire au démarrage. Guide : `backend/README.md`. Tests :
  `cd backend && uv run pytest --cov=ld_backend` (83 tests, 97 %, test de bout en bout sur instance réelle le 2026-09-19 et corrections appliquées, corps du 422 sans valeur du bundle, trois passes de revue appliquées : écriture atomique, jeton en schéma de sécurité
  OpenAPI `HTTPBearer` (bouton Authorize dans `/docs`), corps du POST déclaré depuis le contrat,
  empreinte sur les données hors enveloppe, corps lu en flux avec limite, archive corrompue
  isolée). **B1 se branche dans `ingest.py` après `archive.store`.** **B1 étape 1 écrite le 2026-09-20**
  (`src/ld_backend/correlate/` : R0 à R3 et R6 ; scénarios 1, 2, 4, 5, 6, 7 et 10 de `docs/05` vérifiés ; état après
  la revue de l'étape 1 et sa contre-revue : 187 tests verts, `correlate/` couvert à 100 % ; R1-bis le 2026-09-22) ;
  étape 2 = R4 / R5 + golden `snapshot-minimal.json` ; **étape 3 = branchement, fait le 2026-09-20** (`snapshots.py`,
  `GET /api/snapshot`, `ld correlate` ; revue appliquée ; 220 tests, 99 %).
- À venir : fin de la tranche visible (page servie par le backend, incrément B : agrégats et clusters HA, premier
  bundle réel), puis B1 étape 2, table MAC, B2 → B4
  dans `backend/`, `engine/` (moteur TS), `shell/` (React).

## Conventions de code (rappel des règles globales)

Python 3.14 partout côté backend. Immutabilité (modèles `frozen`, jamais de mutation
d'entrée), fichiers < 400 lignes, fonctions < 50 lignes, erreurs explicites, validation
aux frontières (Pydantic strict : champs inconnus refusés, entiers stricts). TDD : tests
d'abord, couverture ≥ 80 %. Revue de code après chaque écriture.
