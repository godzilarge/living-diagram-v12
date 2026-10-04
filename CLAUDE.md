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
- **Être synthétique** (Orhan, 2026-10-03). Une réponse commence par ce que la chose fait, en une phrase qu'il peut
  répéter (« un générateur d'infrastructures pour faire des tests »), puis le strict nécessaire. Pas de roman : les
  détails vivent dans `docs/`, les README et ce journal, on les référence. Une brique qu'on ne peut pas nommer en une
  phrase est suspecte d'« usine à gaz ».
- **Périmètre V1 : l'infrastructure, jamais les endpoints** (Orhan, 2026-10-03). Téléphones, serveurs, bornes et
  tout autre endpoint ne sont pas dessinés en V1 ; la V1 est la documentation de l'infrastructure, couche physique (L1).
  À garder en tête : L2 (VLAN, trunks, spanning-tree) puis L3 (routage, BGP, OSPF, routes statiques), vues du même graphe
  à arêtes typées, topics additifs. B1 ne filtre toujours rien (2026-09-18) : les stubs restent dans le snapshot, les
  pages les masquent ; H2 (téléphones) quitte le chemin critique, un bruit de contrôles dû aux stubs se traite par un
  filtre de page.
- **Aucun bundle réel, jamais** (Orhan, 2026-10-03). Pour des raisons de sécurité, aucun bundle d'un vrai environnement,
  même anonymisé ; Orhan est l'intermédiaire entre ce qu'il voit en production et ce qui est à coder. Les retours passent
  par des rapports sans valeurs (`validate`, onglet Qualité des données, réponses en mots) ; à envisager : un résumé texte
  du snapshot sans identifiant, à coller tel quel.
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
`docs/living-diagram-v12.html`, à republier **par `url`** pour garder le lien ; v20 du 2026-10-04 soir ; second artefact
« Le chemin d'un bundle », <https://claude.ai/artifact/FFYf3L28NTfCZmfbZcS4TU>, copie locale `docs/chemin-d-un-bundle.html`, v18 du 2026-10-04 soir : son
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
  `standalone` = `members` vide, obligatoirement (`ha_standalone_with_members`, révision du 2026-10-02 ; de
  2026-09-14 à cette date : exactement un membre, lui-même, rôle `member`).
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
- **Guide de collecte FortiOS pour `interfaces`** (2026-09-24, question d'Orhan : quelles commandes, dans quel ordre,
  pour remplir le contrat en CLI ; périmètre réduit par lui au **vital**, clés à `null` acceptées).
  `docs/guides-collecte/fortios-interfaces.md` : trois commandes vitales en `config global`
  (`show full-configuration system interface` = inventaire et configuration ; `get system interface physical` = link,
  vitesse, duplex ; `diagnose netlink interface list` = MAC, état des logiques, MTU, compteurs), deux optionnelles
  (`diagnose hardware deviceinfo nic`, trois dialectes selon l'ASIC ; `get system interface transceiver`).
  **Propositions à valider par Orhan** : table `set type` → `InterfaceType` ; `mac_address` = MAC courante (virtuelle
  HA sur un cluster), gravée dans `extras` ; `members` réservé à `aggregate` / `redundant` (un hardware switch
  fabriquerait un faux agrégat dans le repli de B1) ; la séquence se rejoue sur **chaque membre** d'un cluster HA ;
  `description` (255 car.) porte la convention, pas `alias` (25 car.). `last_change_age_seconds` : aucune source CLI,
  `null`. Rien de vérifié sur un FortiGate réel : fixtures ntc-templates 5.6 → 7.4 et base de connaissances Fortinet.
- **B1 R4 écrite, pages incrément B, page servie par le backend** (2026-09-26 ; Orhan : « mon exportateur est
  toujours en cours, avançons sur tout ce qu'on peut » ; trois briques annoncées avec leurs décisions avant le code,
  chacune revue indépendamment). **R4** (`correlate/structures.py`, `correlate/ha.py`, après la fusion, avant
  l'assemblage) : `aggregates[]` du snapshot ne reprend que les documents `aggregates[]` du bundle (un agrégat connu
  par `interfaces[].members` seul n'a ni protocole ni statut : pas d'entrée, appartenance visible sur interfaces et
  câbles) ; **la paire MLAG se reconnaît à son peer-link câblé** vers un device porteur de documents `aggregates[]`
  (un numéro de vPC est local à son domaine, deux paires d'une même infra peuvent avoir chacune un vPC 20 ; repli :
  même `mlag_id` sur exactement deux devices hors de toute paire ; un peer-link marqué n'est jamais candidat) ; HA :
  un cluster par ensemble de membres, la vue propre d'un membre prime, mode et nom au premier rapporteur, désaccord
  entre valeurs **lues** ⇒ `ha_view_mismatch` (`null` ne contredit rien), `ha_member_down` dès qu'un rapporteur le dit
  (split-brain visible), membre d'une autre infrastructure ⇒ nœud `external` sans témoin, `standalone` conservé ;
  heartbeat = l'unique câble du port, sinon `null` + `heartbeat_link_not_observed` (avec `candidates` si ambigu).
  **Refus ajouté au contrat d'entrée** : `aggregate_member_duplicate` (le Snapshot refuse une liste de membres en
  double). Revue consignée et traitée (`docs/revues/2026-09-26-b1-r4-structures.md` : 0 critique, 1 haut, 3 moyens,
  7 bas). **Parqués, comportement prudent, à trancher avec Orhan** : même `mlag_id` deux fois sur un device ⇒ aucun
  domaine (refus d'entrée `mlag_id_duplicate` proposé) ; peer-link marqué d'un seul côté ; une patte du vPC sans
  câble ; `aggregate_protocol_mismatch` reste `error` sur un faisceau purement documenté (`details.cable_statuses`).
  **Pages, incrément B** (`render/assets/js/structures.js`, modèle et graphe étendus) : une bande par faisceau
  d'agrégat sous ses câbles (étiquette courte `peer-link` / `MLAG n`, complète quand éclairée), un cadre par cluster
  HA (les membres s'attirent dans le placement, renfort 2.5), un halo par heartbeat, onglet **Structures**, panneaux
  agrégat / faisceau / cluster avec leurs sources (document `aggregates` ou `ha`, couverture du topic), adresses
  `#aggregate=` `#beam=` `#cluster=` par identité (bouts dans un ordre ou l'autre) ; rendu vérifié en Chromium. Revue
  consignée et traitée (`docs/revues/2026-09-26-pages-increment-b.md` : 0 critique, 1 haut, 4 moyens, 8 bas ; sécurité
  sans constat) : la page ne dit plus « protocoles différents » quand un bout n'a pas de document `aggregates`, un
  équipement dans deux clusters les montre tous, un faisceau porte tous ses domaines MLAG, les câbles arrêtés à
  l'agrégat lui-même se lisent depuis l'agrégat, la bande couvre l'éventail de ses câbles et l'étiquette est cliquable
  au-dessus des câbles. **`GET /view`** (`render/shell.py`,
  `shell.js`) : la même page sans donnée, servie sans jeton comme `/docs` ; **le jeton se saisit dans la page**
  (`sessionStorage`, jamais dans l'adresse), snapshot et rapport lus par l'API, liste des runs sans `run_id`,
  `connect-src 'self'` seule différence de CSP (la page autonome n'a aucun réseau, testé) ; testé sous Node avec un
  `fetch` simulé et servi par uvicorn dans Chromium. Contrats 399 tests, backend 279, `correlate/` à 100 %.
  **Organisation actée en fin de session** : Orhan se concentre sur les données de son exportateur et valide avec la
  boucle de `QUICKSTART.md` (`ld-contracts validate --strict-findings`, `ld render`, onglet Qualité des données
  d'abord) ; en parallèle, sans attendre le bundle réel : **B1 R5 + golden** (spécifiés, aucune décision de design),
  puis le **générateur de topologies synthétiques** à graine avec scénarios d'évolution (condition de B3 et de la
  jauge de performance), puis la **conception de B3** (document à valider comme `docs/05`, puis TDD sur le générateur).
  Aussi possibles : `docs/06` (principe sans les volumes), guides de collecte par plateforme. Déconseillé avant le
  premier bundle réel : moteur TS, archive Mongo, intention. Vraiment bloqué : gel du contrat, VSX, statuts des tasks.
- **B1 R5 écrite, golden écrit, `ld correlate` en mode fichier : B1 est complet, R0 à R6** (2026-09-26, « Go pour la
  suite ? » d'Orhan ; annoncé avant le code, aucune décision de design, six précisions consignées dans `docs/05` §6 et
  `backend/README.md` § R5). `correlate/state.py` (nommé ainsi, `checkbuild.py` étant déjà la fabrique) : les sept
  contrôles d'état lisent l'état que R3 a dérivé sur le câble ; « down » = tout état autre que `up`, `unknown` d'un bout
  ne conclut rien ; `link_oper_mismatch` et `native_vlan_mismatch` seulement sur un câble observé (une description ne
  fonde pas un « mal câblé »), `link_down` et la vitesse pour tous les statuts ; `documented_port_without_transceiver`
  sur les ports `physical` / `management` ; `device_partial_collection` liste `details.failed` (`{topic, error}`) et
  `details.error`. **Golden** `contracts/fixtures/snapshot-minimal.json` = ce que B1 produit sur la fixture, à l'octet
  (`test_determinism.py`), validé côté contracts, **jamais édité** : régénéré volontairement par
  `cd backend && uv run ld correlate ../contracts/fixtures/bundle-minimal.json --out ../contracts/fixtures/snapshot-minimal.json`
  (nouveau mode fichier, sans archive ni serveur, mêmes octets que l'archive ; `QUICKSTART.md` à jour). Il fige fixture
  ⊕ contrat d'entrée ⊕ B1 (`bundle_sha256` = forme canonique du bundle). `.gitattributes` fixe LF. **Revue indépendante
  consignée et traitée le même jour** (`docs/revues/2026-09-26-b1-r5-etat-et-golden.md` : 0 critique, 1 haut, 3 moyens,
  7 bas) : **R5 ne juge que des câbles entre ports `physical` / `management`** (un câble arrêté à un agrégat, R1-bis
  indéterminé, cas réel du FortiGate, inventait un `link_speed_mismatch` : la vitesse d'un agrégat est la somme de ses
  membres) ; `details.failed` liste aussi les sujets hors de B1 sous leur nom brut (la raison d'un `partial` peut être
  `bgp` ou demain `mac_table`) ; `ld correlate` et `ld render` refusent un `--out` égal au fichier d'entrée et le mélange
  des deux modes. La page montre un bout porteur de faits avec ses faits (« sw-core-02 · Ethernet1/2 (oper_status down,
  oper_reason suspended by LACP) »). **Parqués, à trancher avec Orhan avec les statuts des tasks** : task `success` avec
  un sujet `failed` (silence ; constat d'entrée `task_status_inconsistent` proposé), alias en échec à côté du canonique
  en succès (le canonique gagne ; refus `subject_alias_conflict` proposé), vitesse lue sur un port down (comparée),
  duplex différent (aucun code, `link_duplex_mismatch` proposé), `dormant` / `testing` comptés « pas up ». Backend 315
  tests (`correlate/` 174, à 100 %), contracts 400. **Suite : le générateur de topologies synthétiques** (graine,
  scénarios d'évolution), puis la conception de B3.
- **`mlag_peer_link` nullable, `null` = non lu seulement ; refus `mlag_peer_link_with_id`** (2026-10-02, remarque
  d'Orhan sur le contrat, traitée avant tout code : « si un port-channel n'a pas de `mlag_id`, `mlag_peer_link` devrait
  être nullable »). Conclusion retenue, prémisse corrigée et confrontée : le peer-link lui-même n'a pas de `mlag_id`
  (NX-OS `vpc peer-link` exclut `vpc <n>` ; fixture, scénario 3), donc « pas de `mlag_id` ⇒ pas de MLAG » est faux ; un
  agrégat hors de tout MLAG est `false`, un fait (un booléen a toujours une réponse), jamais `null` pour « sans objet »
  (deux écritures du même fait, refusé pour `access_vlan`). La vraie raison : le champ vient de `show vpc`, pas de la
  commande qui fait le document ; `false` par défaut affirmerait un fait non vérifié (même argument que `-1`). B1
  inchangé (`null` n'est pas un drapeau : aucun rôle, aucune paire par peer-link, repli par `mlag_id`), Snapshot
  nullable aussi (la page dit « peer-link non lu », vérifié en Chromium). **Refus ajouté aux deux contrats** : un
  peer-link porteur d'un `mlag_id` (point B1 de la revue R4 : B1 l'ignorait en silence ; règle partagée
  `check_peer_link_without_id`). Orhan : le cas « non lu » n'arrive pas dans son exportateur, nullabilité juste sur le
  principe. Fixture et golden inchangés. Motifs : `contracts/README.md` § Décisions ; `docs/05` §2.4. **Revue
  indépendante consignée** (`docs/revues/2026-10-02-mlag-peer-link-nullable.md` : 0 critique, 0 haut, 2 moyens, 6 bas ;
  moyens et trois bas traités, B1 / B2 / B6 parqués sur décision d'Orhan : le rituel complet, revue et capture
  comprises, est disproportionné pour un champ ; règle de calibrage à acter). Contracts 413 tests, backend 316,
  `correlate/` à 100 %.
- **R2, forme HA positionnelle des descriptions** (2026-10-02, cas réel d'Orhan traité comme remarque de modèle, plan
  annoncé et validé avant le code : la configuration d'un cluster FortiGate est partagée, les deux membres portent la
  même description, et la forme V1 donnait au second membre un faux câble `documented_only` vers le port du premier,
  invisible faute de LLDP sur les firewalls). Convention d'Orhan `C1|monswitch1|Eth1/1|monswitch2|Eth1/2`, lue comme
  **positionnelle** : exactement une paire par membre, dans l'ordre des **priorités HA décroissantes**
  (`ha[].members[].priority`, fait de configuration propre à chaque unité, vérifié par Orhan avec
  `diagnose sys ha status`, `usr_priority=`) ; le rôle courant est écarté (sur FGCP, override désactivé par défaut,
  l'ancien secondaire reste primaire après bascule alors que les câbles ne bougent pas) ; **pas de repli sur l'ordre
  des hostnames** (deux règles de rang seraient un piège). **Contrat d'entrée inchangé** (description brute, grammaire
  dans B1) ; **code `description_ha_unresolved` ajouté au catalogue du Snapshot** (warning, R2, ports `physical` /
  `management`, `details.reason` ∈ `field_count_mismatch`, `device_not_a_name`, `priority_undecided`,
  `cluster_ambiguous` : aucun câble). B1 : `descriptions.py` (`parse_description(text, place)`, `ha_places`),
  `context.py`, `claims.py` ; la forme HA n'est lue que sur un membre de cluster (clé de cluster de R4), ailleurs tout
  est V1 ; scénario 11 en mémoire (`ha_pair_variant`), golden intact ; page : code dans Qualité des données, rendu
  vérifié en Chromium ; guide FortiOS et `docs/05` R2 à jour. **Revue indépendante consignée et traitée le même jour**
  (`docs/revues/2026-10-02-r2-forme-ha-descriptions.md` : 0 critique, 3 hauts, 4 moyens, 7 bas) : hors cluster tout
  est V1 (H1) ; nombre de champs exact, l'option après les paires abandonnée, un membre disparu de `members` ou inconnu
  de `devices` ne décale plus les rangs en silence (H3, M2) ; deux priorités lues différentes sans vue propre ne
  tranchent rien (M1) ; cas réel R1-bis + forme HA figé par un test (câbles `confirmed`). **Parqué, comportement
  documenté, une question pour Orhan** : la forme se reconnaît sans marqueur, donc sur un membre une V1 dont l'option
  contient `|` est lue comme une HA (H2) et une HA tronquée à quatre champs comme une V1 (M3) ; convention à tenir :
  jamais de `|` dans une option sur un membre ; un marqueur explicite lèverait l'ambiguïté. Backend 351 tests,
  `correlate/` à 100 %, contracts 413.
- **`HaStatus` : `standalone` ⇒ `members` vide, imposé** (2026-10-02, remarque de contrat d'Orhan traitée avant tout
  code : « si c'est un firewall standalone, autoriser `members` en liste vide » ; avis rendu, plan validé). L'entrée
  « lui-même » exigée depuis le 2026-09-14 ne portait rien que B1 lise (rôle forcé à `member`, état `up` tautologique,
  priorité sans pair, serial recopié de `devices`) : l'exportateur devait l'inventer, et le contrat demande ce que B1
  consomme. **Imposé plutôt qu'autorisé** : `[self]` et `[]` auraient donné deux snapshots pour un même fait (cluster
  d'un membre, aucun cluster), même règle que pour `access_vlan` et `mlag_peer_link`. Refus `ha_standalone_with_members`
  remplace `ha_standalone_not_alone` ; hors standalone, rien ne change (`ha_local_not_in_members`, `ha_member_duplicate` ;
  un FortiGate en `a-p` dont le pair a disparu se liste seul : cluster d'un membre, pas un standalone) ; `cluster_name`
  et `heartbeat_interfaces` restent admis (FortiOS garde `group-name` et `hbdev` quel que soit le mode ; le rôle
  `heartbeat` est posé depuis tous les documents `ha`, testé). **B1 : un standalone ne produit plus aucun cluster**
  (`ha.py` inchangé, clé vide ; test « cluster d'un seul » inversé). Perte assumée : « HA lu, mode standalone » ne se
  distingue plus, dans le snapshot, d'un topic `ha` sans document ; si l'inspecteur doit le dire, champ additif sur le
  nœud, à voir au premier rendu. Renverse une règle du 2026-09-14 qu'un test figeait. Fixture, golden et page inchangés.
  **Calibrage acté : pas de revue indépendante** pour un changement de règle de quelques lignes sans code B1 modifié
  (question laissée ouverte sur `mlag_peer_link`) ; le rituel complet reste celui des briques. Motifs :
  `contracts/README.md` § Décisions ; `docs/05` §2.5. Contracts 415 tests, backend 351.
- **Page `ld render` de démonstration : bulles au survol, rôle HA sur les nœuds** (2026-10-02, demande d'Orhan : une
  bulle sur les liens avec duplex, vitesse, média quand on les connaît, une distinction visuelle actif / passif des
  firewalls, « booster » la page pour une première démonstration sans attendre le front ; plan et décisions annoncés
  avant le code, session autonome). `render/assets/js/tip.js` (nouveau) : une bulle **SVG en coordonnées d'écran**,
  jamais un style en ligne (la CSP par empreinte n'en admet aucun, et le faux DOM des tests la voit) ; câble = bouts,
  statut, sources, puis **par bout** vitesse, duplex, média, état lus dans `interfaces[]` (« — » pour un bout absent,
  « vitesse, duplex, média : non lus » si aucun bout n'a rien), contrôles un par ligne (six au plus) ; équipement =
  fiche courte avec rôle HA ; faisceau, cluster. `<title>` natifs remplacés par `aria-label`. **Rôle HA écrit tel
  qu'enregistré** (`primary`, `secondary`, `active`, `standby`, `member`) sous l'étiquette de type, fond teinté pour
  `primary` / `active`, grisé pour `secondary` / `standby`, rouge si `state = down` ; **pas de traduction en
  actif / passif** (sur `active_active` le `secondary` forwarde aussi) ; un équipement dans deux clusters porte le rôle
  du premier. `geometry.js` extrait de `graph.js` (règle des 400 lignes). Média sur la fiche du port, vitesses en Gb/s,
  légende complétée, survol qui épaissit le tracé. **Revue indépendante consignée et traitée le même jour**
  (`docs/revues/2026-10-02-pages-demo-bulles-role-ha.md` : 0 critique, 1 haut, 5 moyens, 8 bas) : un appui annulé
  (`pointercancel`, `lostpointercapture`, clic droit) libère toujours le glissé (H1) ; **le fond du rôle ne dit
  « forwarde / en attente » que là où le snapshot le dit** (`active` / `standby`, ou `primary` / `secondary` en
  `active_passive` ; sans fond ailleurs, M1) ; bulle de faisceau avec les deux équipements (M2), contrôles comptés par
  code (M3), « aucune valeur » et « absent de interfaces[] » au lieu de « non lus » (M4, `null` n'est pas une raison) ;
  état `down` de n'importe quel cluster (B4) ; `role="button"` / `role="tooltip"` / `aria-describedby` (B7) ;
  **`tests/browser.py`** : pilote DevTools de Chromium sans dépendance, test de survol réel et de focus clavier (M5).
  Parqués : découpage de `create()` (B6, limite assouplie par Orhan le même jour), deux commits séparés (B8, à Orhan).
- **Critique design Impeccable et passe de finition** (2026-10-02, demande d'Orhan : « un agent UI avec les skills
  impeccable pour vérifier les typo, les arrangements », puis « bien réfléchir au poids des éléments, du texte, des
  polices : esthétique, moderne, pas d'AI slop »). Deux évaluations isolées (A : revue design, B : détecteur + 21 captures
  + mesures DevTools), synthèse : **25 / 40**, deux P1 (bleu à cinq sens et oranges sous AA ; défauts ni en tête ni
  cliquables), trois P2 (étiquettes du graphe, en-tête et légende, largeurs étroites et clavier) ; snapshot dans
  `.impeccable/critique/`. **Quatre décisions d'Orhan** : le nom domine avec une icône de type ; famille violette pour
  les structures et oranges AA ; graphe d'abord, défauts à un clic ; périmètre P1 + P2 bureau (1024 à 1920 px, pas le
  420 px). Fait : `icons.js` (icônes SVG dessinées par `type`), nom en 12,5 px semi-gras raccourci au-delà de 22
  caractères, rôle 7,5 px sous l'icône, `--structure`, sélection en encre, tiret long sur l'observé seul, contrôles triés
  par sévérité, pastilles d'en-tête en boutons, comptes sur les onglets, en-tête sur deux lignes, légende en carte
  flottante masquable (repliée sous 1200 px), paliers de zoom par classe sur le `svg`, clavier sur câbles / faisceaux /
  clusters, zone live, `aria-controls`, panneau amené en vue sous 900 px, surfaces du navigateur thématisées. Rendu jugé
  sur captures en deux tours (1440, 1024, 1920, sombre, survol). Trois faux positifs du détecteur assumés. Reste visible :
  chevauchement des noms de ports sur une paire de câbles (option « noms des ports »), et le style « pastilles partout »
  si Orhan le juge daté. Backend 352 tests, 37 sous Node.
- **Générateur de topologies synthétiques écrit : `ld-contracts generate`** (2026-10-03, « Go » d'Orhan sur le plan
  annoncé le même jour, session autonome ; brique prévue en phase 1b). `contracts/src/ld_contracts/synth/` (spec,
  catalogue, world, naming, build, emit, mutations, series) ; `ld-contracts generate --seed S --devices N --runs R --out DIR
  [--scenario a,b] [--mutations-per-run k] [--infrastructure] [--start]`. Cinq décisions : (1) **dans `ld-contracts`**,
  pas dans les tests du backend : il produit des bundles validés par le contrat, le backend en dépend déjà, B3 et la jauge
  l'importeront ; (2) **un monde immuable (vérité terrain), puis une projection « exportateur parfait »** : LLDP et CDP
  aux deux bouts d'un câble Cisco ↔ Cisco (IOS-XE annonce la forme courte en LLDP, NX-OS la longue, CDP toujours la
  longue), **rien d'observé vers un firewall**, descriptions V1 partout, forme HA positionnelle sur les FortiGate, topics
  par plateforme ; (3) **motif par site** : deux cœurs NX-OS en vPC (peer-link `port-channel10`), accès Catalyst en stack
  double-attachés (un vPC par accès), cluster FortiGate actif-passif en `agg-core` (un vPC par membre, heartbeat `ha1`),
  routeur WAN vers un PE d'une autre infrastructure, stubs serveur / téléphone / borne ; sites chaînés par les cœurs ;
  `--devices` exact (≥ 6, ~25 par site) ; Ethernet1/44-48 en réserve ; (4) **14 mutations nommées** (`catalogue.py`),
  trois transitoires effacées à chaque run (`device_unreachable`, `topic_failed`, `ha_member_down` : le membre mort a ses
  câbles tombés aux deux bouts pour la run), `reboot` qui date le démarrage sur le device (l'uptime recompte ensuite), les
  autres persistantes ; première run jamais mutée ; `--scenario` imposé à chaque run suivante, sorte inapplicable =
  erreur, jamais un silence ; `manifest.json` = l'oracle (kind, subject, details, comptes) que les tests de B3 liront ;
  (5) **trois garanties testées** : mêmes octets entre processus sous trois `PYTHONHASHSEED` (monde trié par clé
  naturelle, jamais parcouru par un ensemble), chaque bundle à **zéro constat strict** (`check_series` dans la CLI :
  les problèmes sont dans la topologie, jamais dans la forme), et les invariants du monde après chaque run
  (`check_world`, levé en `GenerationError`). Mesuré : 500 devices × 3 runs en ~5 s validation comprise, ~310 Mo,
  20,5 Mo par bundle, 21 000 interfaces, 1 038 câbles plus ~500 stubs (jauge 500 / 1 500 atteinte) ; construction
  linéaire après revue (1 000 devices en 0,5 s).
  Vérifié dans B1, `ld render` et Chromium (accès injoignable en rouge, désaccords listés, couverture ; capture :
  `--virtual-time-budget=15000`, 3 000 ms donne une page blanche). `backend/tests/correlate/test_synth.py` : B1 avale les
  14 mutations en une run, codes attendus présents, snapshot déterministe. **Découverte : H2 n'est plus abstrait.** Un
  téléphone IP annonce sa MAC comme port-id LLDP et « Port 1 » en CDP ⇒ B1 produit deux câbles observés et deux
  `multiple_observed_neighbors` par téléphone (40 sur 24 devices, run de base). Le générateur reste fidèle à ce que les
  équipements annoncent ; c'est à B1 de réconcilier (R3 ou `docs/06`), **à trancher avec Orhan**. Hors périmètre,
  volontairement : table MAC, FortiGate avec LLDP (R1-bis), VSX, désordres d'exportateur. Docs : `contracts/README.md`
  § Générer des bundles synthétiques, `QUICKSTART.md` § 1 bis. **Revue indépendante consignée et traitée le même
  jour** (`docs/revues/2026-10-03-generateur-synthetique.md` : 0 critique, 2 hauts, 6 moyens, 8 bas ; sondes rejouables
  recopiées) : numéros de stubs jamais réutilisés (compteur du monde), `reboot` daté sur le device (uptime continu,
  `"never"` émis), `description_changed` sur un câble observé seulement, `check_world` (invariants du monde, vérifiés
  après chaque run), construction linéaire (un brouillon par site), `build.py` découpé en quatre, vérités de plateforme
  dans `naming.py`, manifeste avec `stubs_by_kind`. **Lecture choisie pour `ha_member_down`, à confirmer par Orhan** : le
  membre meurt pour la run (câbles tombés aux deux bouts à l'émission, membre tiré au hasard) ; l'autre lecture est
  `device_unreachable`. Parqué : `run.status` toujours `completed` (avec les statuts des tasks). Contracts 543 tests,
  backend 357.
- **Réponses d'Orhan aux questions en attente** (2026-10-03) : **aucun Fortinet avec LLDP, à terme** (le rang 1 de
  R1-bis est sans objet pour Fortinet, la règle reste, générique ; les câbles des firewalls dépendent des descriptions
  jusqu'à `mac_table`, qui devient le chemin critique) ; **table MAC : crainte du volume sur de grosses infrastructures**,
  traitée comme contrainte de conception de `docs/06` (le contrat ne demande que ce que B1 consomme : les entrées dont la
  MAC est celle d'un port d'un device collecté, filtrées en B0 par jointure sur `interfaces` ; volume borné par les ports
  du parc, pas par les hôtes) ; **guide FortiOS `interfaces` validé** (cinq propositions) ; forme HA et statuts des tasks :
  exemples demandés, donnés en session ; **aucun bundle réel ne sortira** (sécurité) : un premier extrait passe le contrat
  « pas trop mal », les retours se feront sur le rapport de `validate` (sans valeurs) et sur l'onglet Qualité des données.
- **Premier rendu réel** (2026-10-03) : Orhan a passé `ld render` sur une de ses infrastructures, « la première page HTML
  est vraiment pas trop mal ». Fin de la tranche visible côté rendu ; la boucle de correction de l'exportateur continue
  chez lui. Recadrage le même jour (règles de travail) : V1 sans endpoints, aucun bundle réel jamais, rigueur à conserver.
  Ordre proposé pour la suite : `docs/06` table MAC sur le principe (avant le gel du contrat d'entrée) → conception de B3.
- **`docs/06-evidence-table-mac.md` écrit, à valider** (2026-10-03, « Go » d'Orhan sur la brique « table MAC pour
  les câbles des firewalls », document d'abord, code après). Décide : topic `mac_table` **dynamique et restreint au
  parc** (entrées dont la MAC est celle d'une interface du bundle, filtre en B0, clé `(hostname, vlan_id, mac_address)`,
  refus `mac_entry_duplicate`, constat `mac_entry_without_owner`) ; règle **R7** : câble observé depuis un **port de
  bordure** seulement (aucun voisin LLDP / CDP vers un autre device, un seul propriétaire ou un seul cluster) ; R3
  inchangé ; Po ⇒ faisceau, membre par R1-bis des deux côtés sinon `mac_learned_on_aggregate` ; cluster à MAC virtuelle
  partagée ⇒ membre primaire en actif-passif (prémisse à vérifier : table vide vers le secondaire), sinon description,
  sinon `mac_owner_ambiguous` ; câbles du passif restent `documented_only`. Snapshot 1.0.0 → 1.1.0. Hors périmètre :
  ARP, partenaire LACP, entrées statiques, endpoints. Six questions en §8, réponses en mots.
- **Table MAC déprioritisée ; cap : diff, intention, puis moteur et front** (2026-10-04, Orhan : « pas une priorité
  pour le moment », les diagrammes actuels « sont pas mal du tout » ; il veut pousser des bundles, comparer des runs d'une
  infra par le diff, éditer et repositionner lui-même). `docs/06` reste **conçu, non validé, parqué** (topic additif :
  ne bloque pas le gel du contrat d'entrée) ; les câbles des firewalls restent `documented_only`. **Avis rendu le même
  jour, à trancher** : le diff et l'intention ne débloquent pas le moteur, c'est la toile qui les rend visibles ; la
  décision ③ « posséder la toile » (`docs/00` §10 Q5, ouverte depuis août) se prend maintenant, recommandation : la page
  `ld render` (2 400 lignes de JS sans framework, placement déterministe, SVG, LOD, tests Node + Chromium) devient
  l'embryon d'`engine/` en TS plutôt qu'une feuille blanche ; B4 se conçoit avec la toile (premier patch = épingle), pas
  avant. Ordre proposé : B3 diff (prêt : fonction pure sur deux snapshots, oracle = `manifest.json` du générateur,
  peint dans la page actuelle) → toile → B4 épingles. Hors chemin : B2 Mongo (le disque suffit), table MAC, H2 téléphones.
- **B3, le diff typé : contrat `Diff` v1, moteur, API, CLI, page** (2026-10-04, « d'accord avec ton plan » d'Orhan sur
  l'ordre diff → toile → B4 et sur six décisions, session autonome ; `docs/07-diff.md` écrit avant le code). **Contrat**
  `contracts/src/ld_contracts/diff/`, partie C de `CONTRAT.md`, `diff-v1.schema.json`, `validate|schema --contract diff` :
  une identité par entité, celle du snapshot ; `added` / `removed` entité complète, `changed` référence + champs
  `(path, before, after)` ; deux volatils déclarés (`uptime_seconds`, `last_change_age_seconds`), exclus et comptés ;
  événements `rebooted` (uptime < écart) et `flapped` (âge < écart, même `oper_status`) ; contrôles `(code, refs)` en
  multi-ensemble ; résumé et écart vérifiés par le type. **B3** `backend/src/ld_backend/diff/` (fields, sections, events,
  engine ; 100 % couvert), fonction pure, `DiffError` sans valeur sur deux infrastructures ; **jamais stocké** :
  `GET /api/diff?infrastructure=&from=&to=` calcule à la demande (404 qui nomme le côté), `ld diff` en deux modes (fichiers
  bundles ou snapshots ; archive, par défaut les deux dernières runs), `ld render --from` et `/view?…&from=` embarquent le
  diff dans la page : **fantômes** (câbles, équipements, interfaces retirés, lus dans le diff, jamais comptés, sans
  contrôle de cette run), halo sous un câble ajouté / changé, couronne autour d'un nœud, bascule « changements »
  (`#diff=0`), onglet Diff, fiches avant → après, bulle, « avec la précédente » dans la liste des runs. Oracle = le
  `manifest.json` du générateur, une sorte par run ; deux vérités apprises : un switch retiré **survit en stub** (la
  description périmée des cœurs le cite encore ; `docs/07` §6 corrigé), les port-channels des cœurs s'ajoutent ou se
  retirent, pas les ports de réserve. Rendu vérifié par captures Chromium. **Parqués, comportement prudent** (`docs/07`
  §7) : identité d'un cluster par ses membres (Q1), interfaces d'un nœud ajouté ou retiré listées une à une (Q2), gros diff
  d'un device injoignable (Q3), le mot `flapped` (Q4). **Revue indépendante consignée et traitée le même jour**
  (`docs/revues/2026-10-04-b3-diff.md` : 0 critique, 1 haut, 5 moyens, 8 bas ; sept sondes rejouables) : les interfaces
  retirées ont leurs propres index dans la page, un équipement injoignable ne montre plus les faits de la run d'avant
  comme actuels (H1) ; trois refus que la partie C annonçait sans les appliquer (`events_without_elapsed`,
  `identity_in_several_parts`, `field_change_volatile`, la déclaration des volatils vit dans le contrat), détails
  d'événement typés, `path` en identifiants pointés, validateurs partagés avec le snapshot (membres MLAG, majeure) ;
  fantômes comptés à part de l'en-tête et de l'état du graphe, « était confirmé » pour un câble retiré ; `DiffError`
  traduite en 500 dans l'API, exception ordinaire, snapshot `to` lu une fois ; `--from` égal à la run : avertissement.
  **Tranché par la spécification, à confirmer** : un nœud `rebooted` n'a aucun port `flapped` (le redémarrage explique
  ses ports, `docs/07` §6 l'annonçait). **Mesure** : à la jauge, `GET /api/diff` coûte ~3,2 s dont ~2,2 s à relire et
  revalider les deux snapshots (« quelques millisecondes » retiré partout). **Parqués, questions Q5 à Q7 de `docs/07`** :
  identité à l'octet alors que le snapshot compare sans la casse (un test fige le comportement), revalidation à chaque
  appel ou diff N-1 stocké, sévérité hors de l'identité d'un contrôle. Contracts 579 tests, backend 422, 50 sous Node.
- **La toile : décision ③ tranchée, la page `ld render` devient `engine/` en TypeScript** (2026-10-04, « Commit et Go, je
  valide le plan » d'Orhan ; son objectif : « rapidement » un front qui affiche les diagrammes avec le diff et les intentions,
  pour voir un rendu et faire ses retours). Portage **fidèle, pas réécriture** : douze modules JS → `engine/src/canvas/`
  (model = B5 analyse, layout = B7, geometry = B8, graph + tip + icons + dom = B9 renderer SVG) et `engine/src/shell/` (main,
  inspect, structures, tables, shell API, apps) ; types des contrats **générés** des schémas JSON (`engine/types.mjs`,
  `src/contracts/*.ts`, titres de propriétés retirés pour ne pas fabriquer un alias par champ) ; bundle esbuild 0.28.2 en
  **un seul fichier `viewer.js` versionné** dans les assets du backend (`absWorkingDir` fixé : mêmes octets d'où que vienne
  le build) ; **Python n'a jamais besoin de Node** ; test de dérive (`build.mjs --check`, `types.mjs --check`, sauté sans
  `node_modules`). Preuve de fidélité : 50 tests Node, tests Chromium, **quatre captures identiques à l'octet** avant et
  après ; la revue (`docs/revues/2026-10-04-toile-engine-ts.md`, 0 critique, 1 haut, 6 moyens, 7 bas) l'a reconfirmé sur
  21 paires DOM + PNG et une page à la jauge (500 devices) ; **traitée le même soir** : `tsc` strict dans le test de dérive
  (H1), bloc JSON lu une fois (M1), gardes au lieu de casts sur les références du diff (M3), coutures nommées (`dom.ts`
  fabrique seule, `format.ts`, `widgets.ts`, `checks.ts`, cycle `inspect ↔ structures` rompu, M5), `npm ci` et
  `engines` (B2) ; **parqués, motivés** : `noUncheckedIndexedAccess` (72 erreurs, à activer module par module quand
  B5-B9 évoluent, M2), types de l'API écrits à la main (B3), module LOD (B6 de l'architecture). **Pas de React maintenant** : le shell reste du TS sans
  framework dans `engine/src/shell/` ; déclencheur pour `shell/` React : des panneaux d'édition d'intention au-delà des
  épingles. La coquille servie est dans le même bundle, inactive quand la page embarque un snapshot (la CSP sans
  `connect-src` reste la garantie « aucun réseau »). Guide : `engine/README.md`. `node_modules/` hors dépôt,
  `package-lock.json` versionné (déterminisme, comme `uv.lock`).
- **B4, la couche d'intention, épingles d'abord : contrat `Intent` v1, store, API, CLI, page** (2026-10-04, même session,
  `docs/08-intention.md` écrit avant le code). **Contrat** `contracts/src/ld_contracts/intent/`, partie D de `CONTRAT.md`,
  `intent-v1.schema.json`, `validate|schema --contract intent`, fixture `intent-skeleton.json` : un document **par
  infrastructure, jamais par run** ; patchs keyés par identité stable (`hostname` à l'octet), jamais par coordonnée ni run ;
  une seule sorte en V1, l'épingle `{hostname, x, y, author, at}` (entiers stricts bornés ±1 000 000, auteur ≤ 80) ; `pins`
  triées et uniques, refusé par le type ; `revision` ↔ `updated_at` (`revision_update_mismatch`) ; le document vide est
  valide. **Store** `backend/src/ld_backend/intent.py` : `<archive>/_intent/<infra>/intent.json` + `journal.jsonl` (qui,
  quand, quoi), écrit **par opérations seulement** (`pin`, `unpin`, appliquées dans l'ordre, dernier écrivain gagne par
  épingle), atomique sous verrou `fcntl` + fil (aucune écriture perdue à deux fils), document corrompu isolé jamais écrasé.
  **API** : `GET /api/intent?infrastructure=` (document, vide si jamais écrit), `POST /api/intent/patches?infrastructure=`
  `{author, ops}` (404 sans run archivée, 422 à la forme sans valeur), `Intent` dans OpenAPI ; **CLI** `ld intent` (lecture) ;
  `ld render --infrastructure` embarque le document (lecture seule), le mode fichier non. **Page** : épingles = contraintes
  dures du placement, glyphe sur le nœud épinglé, glisser-déposer = `pin` à la relâche (coordonnées arrondies) quand la page
  a un écrivain avec un **nom** (saisi dans `/view`, `localStorage`), sinon déplacement local dit tel ; onglet
  **Intentions** (liste, auteur, date, **orphelines** = équipement absent de la run, listées et jamais effacées en silence,
  retirer une, retirer les orphelines ou toutes avec confirmation dans la page, le nom) ; fiche d'un équipement avec son
  épingle ; pastille d'en-tête « n épingles · k orphelines » ; « replacer » garde les épingles enregistrées. **Décisions** :
  dernier écrivain gagne + journal = réponse V1 à la question 6 de `docs/00` (pas de comptes : auteur déclaratif) ; le diff
  ne lit jamais l'intention ; **limite connue** : seuls les équipements épinglés sont stables entre deux runs (placement
  seedé N-1 = phase 3). Tests : contracts `tests/intent/`, backend store / API / CLI, 56 tests Node, Chromium (glyphe par
  la feuille de style, glissé réel), **bout en bout** uvicorn + Chromium : un glissé dans `/view` enregistre l'épingle par
  l'API sous le nom saisi, rien dans l'adresse. **Revue indépendante consignée et traitée le même soir**
  (`docs/revues/2026-10-04-b4-intention.md` : 0 critique, 2 hauts, 3 moyens, 7 bas ; sondes rejouables) : envois de la
  page **sérialisés** et réponse périmée ignorée (H1), corps borné `LD_MAX_INTENT_BYTES`, `hostname` ≤ 253 et `author`
  ≤ 80 sans caractère de contrôle, `pins` ≤ 10 000, opérations de l'API typées par le contrat (H2), journal ouvert avant
  l'écriture (M1), messages 422 sans la valeur reçue (M2), fusion des épingles locales après une réponse (M3), fantôme
  jamais placé par une épingle, « retirer toutes » par paquets de 500, boutons désactivés au clic (B3), `ld render`
  ouvre la run sans intention si le document est corrompu, comme `/view` (B5). **Parqués, à trancher** : précondition
  `expected_revision` (409) côté serveur (`docs/08` Q5) ; casse du hostname, épingle sur un stub, auteur déclaratif
  (Q1-Q3). Contracts 601 tests, backend 450, 62 tests sous Node, `tsc` strict propre.
- **B1 embarque la liste devices lue** dans le snapshot ; **B2 archive le bundle brut** :
  historique et rejeu indépendants de la rétention amont.

## Questions ouvertes (2026-09-10)

- Sorties réelles de la librairie pour lldp, cdp, aggregates, ha (écart à marquer).
- Tasks : valeurs de `status`, début/fin par subject, forme d'un device injoignable.
- Topic `system` à créer côté collecte (modèle : `contracts/CONTRAT.md` § system).
- VSX : un document devices par passerelle ou par Virtual System ; VS0 seul ou tous.
- Énumérations réelles de `type`, `admin_status`, `oper_status`, `duplex` (interfaces) ;
  `site` libre ou référentiel ; échantillon de descriptions réelles anonymisées.
- ~~Le pari « posséder la toile » (décision ③ de l'artefact) n'est pas tranché.~~ **Tranché le 2026-10-04** : la page
  `ld render` est devenue `engine/` (TypeScript pur, sans librairie de toile).
- Zones fonctionnelles : inférées faute de source (CMDB disparue).

## Séquencement

Phase 0 contrat pivot **livrée le 2026-09-20** (RunBundle v1 et Snapshot v1 dans `ld-contracts`, `CONTRAT.md`
en deux parties entrée / sortie, `docs/05` validé) → **Phase 1a, la tranche visible (révision du 2026-09-20)** : B1
étape 1 (fait) → branchement de B1 (fait) → pages HTML (incréments A et B faits : `ld render`, `/view` ; R4 de B1
tirée dans la tranche le 2026-09-26) de visualisation avec les sources → premier bundle réel (exportateur
minimal d'Orhan) → on regarde, on corrige → Phase 1b : B1 R5 et golden (faits le 2026-09-26), générateur synthétique
(fait le 2026-10-03), **B3 diff (fait le 2026-10-04)**, table MAC (`docs/06`, parquée), B2,
en TDD sur fixtures au format réel des collections → Phase 2 socle toile (**`engine/` depuis la page, 2026-10-04** ; jauge
de perf 500 nœuds / 1 500 liens tenue par la page) → Phase 3 placement (seedé N-1) → Phase 4 timeline + diff peint (le diff
est peint depuis le 2026-10-04) → Phase 5 intention + réconciliation (**épingles et orphelines faites le 2026-10-04**) →
Phase 6 LOD complet, vues nommées, overlays L2/L3.
Détail : `docs/00-analyse-fondation.md` §10.

## Repo

- `QUICKSTART.md` — **démarrage rapide** (2026-09-20) : un bundle → une page HTML, en ligne de commande et par l'API ;
  à tenir à jour à chaque nouvelle commande ou route
- `docs/00-analyse-fondation.md` — analyse et thèses (2026-08-13)
- `docs/01-…04-…` — revues du modèle amont et modèles cibles (2026-09-08 → 10)
- `docs/05-snapshot-et-correlation.md` — **conception du snapshot (second contrat) et des règles de
  B1** (2026-09-10) : modèle, règles R0 à R6, codes de contrôle, dix scénarios de la fixture, huit
  questions. **Validé par Orhan le 2026-09-20 (sept questions sur huit tranchées, la 6 non bloquante).**
- `docs/07-diff.md` — **conception du diff B3** (2026-10-04) : contrat `Diff` v1, règles D0 à D6, branchement, oracle du
  générateur, quatre questions parquées. Validé sur le principe par Orhan le jour même, codé le jour même.
- `docs/08-intention.md` — **conception de la couche d'intention B4** (2026-10-04) : contrat `Intent` v1, règles I0 à I6,
  branchement (store, API, CLI, page), quatre questions parquées. Codé le jour même.
- `docs/06-evidence-table-mac.md` — **conception de l'évidence table MAC** (2026-10-03) : topic `mac_table` restreint au
  parc, règle R7 (port de bordure), clusters à MAC virtuelle, six questions. **À valider par Orhan.**
- `docs/guides-collecte/` — guides **producteur** par plateforme (2026-09-24 : `fortios-interfaces.md`, commandes et chronologie
  pour le topic `interfaces` sur FortiGate ; 2026-10-02 : convention de description d'un cluster HA)
- `docs/revues/` — rapports de revue indépendante consignés tels que rendus, avec leur suivi (2026-09-20 :
  `2026-09-20-b1-etape-1.md`, sa contre-revue, `2026-09-20-branchement-b1.md`, `2026-09-20-pages-ld-render.md` ; 2026-09-22 : `2026-09-22-r1-bis-agregat-port-id.md` ;
  2026-09-26 : `2026-09-26-b1-r4-structures.md`, `2026-09-26-pages-increment-b.md`, `2026-09-26-b1-r5-etat-et-golden.md` ;
  2026-10-02 : `2026-10-02-mlag-peer-link-nullable.md`, `2026-10-02-r2-forme-ha-descriptions.md`,
  `2026-10-02-pages-demo-bulles-role-ha.md` ; 2026-10-03 : `2026-10-03-generateur-synthetique.md` ; 2026-10-04 :
  `2026-10-04-b3-diff.md`, `2026-10-04-toile-engine-ts.md`, `2026-10-04-b4-intention.md`) et leurs sondes rejouables
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
  (état 2026-10-04 : 579 tests, **contrat `Diff` v1** `diff/` en partie C de `CONTRAT.md`, `validate|schema --contract diff`, fixtures `diff-skeleton.json` et `snapshot-skeleton-cable-down.json`, revue de B3 traitée (détails d'événements typés, trois refus ajoutés, `VOLATILE_PATHS` déclaré ici) ; 2026-10-03 : 543 tests, 97 %, **générateur de topologies synthétiques** `synth/` et commande `generate`, revue traitée ; 2026-10-02 : 415 tests, `standalone` ⇒ `members` vide imposé (`ha_standalone_with_members`), `mlag_peer_link` nullable et refus `mlag_peer_link_with_id`, code Snapshot `description_ha_unresolved` ; 2026-09-26 : 400 tests, refus `aggregate_member_duplicate` ajouté avec B1 R4, golden `snapshot-minimal.json` de B1 validé ; 2026-09-20 : 398 tests, 98 %, deux refus ajoutés après la contre-revue de B1, contrat Snapshot v1 en partie B de `CONTRAT.md`, `schema --contract snapshot --out` ;
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
  étape 2 = R4 / R5 + golden `snapshot-minimal.json` : **R4 et R5 écrites le 2026-09-26** (`structures.py`, `ha.py`,
  `state.py`, revues traitées), golden écrit et régénérable par `ld correlate bundle.json --out` ; **étape 3 =
  branchement, fait le 2026-09-20** (`snapshots.py`, `GET /api/snapshot`, `ld correlate` ; revue appliquée). Pages :
  incrément B et `GET /view` faits le 2026-09-26 (`render/shell.py`, `assets/js/structures.js`, `shell.js`). **R2 forme HA
  des descriptions le 2026-10-02** (`descriptions.py`, scénario 11 en mémoire, revue traitée) ; un `ha` standalone ne
  produit plus de cluster (même jour). État 2026-10-02 : 351 tests, 99 %, `correlate/` à 100 % ; page de démonstration le même jour (`tip.js`, `icons.js`, `geometry.js`, `tests/browser.py`, 37 tests sous Node, 352 tests) ; **2026-10-03 : 357 tests**, dont `tests/correlate/test_synth.py` (B1 sur les séries du générateur, compte exact des téléphones) ; **2026-10-04 : 422 tests** (B3 `diff/` à 100 %, `diffs.py`, `GET /api/diff`, `ld diff`, `ld render --from`, page avec fantômes et onglet Diff, revue traitée le même jour, 50 tests sous Node).
- `engine/` — **la toile** (2026-10-04) : moteur de diagramme TypeScript pur, zéro framework, `src/canvas/` (modèle,
  placement, géométrie, renderer SVG, bulle) et `src/shell/` (page, inspecteur, tableaux, intentions, coquille API), types
  des contrats générés (`npm run types`), bundle `npm run build` → `backend/src/ld_backend/render/assets/js/viewer.js`
  (versionné, test de dérive). Guide : `engine/README.md`. Node et `npm ci` seulement pour modifier la toile.
- À venir (cap du 2026-10-04 ; B3 diff, toile et B4 épingles faits le jour même) : les retours d'Orhan sur le rendu du front
  (`/view` : diagrammes, diff, épingles), puis selon ses axes : autres sortes d'intention (masquer, annoter), placement seedé
  N-1 (phase 3), `shell/` React quand les panneaux d'édition le justifient, timeline. Parqués : `docs/06` table MAC (conçu,
  non validé), B2 Mongo, H2 téléphones.

## Conventions de code (rappel des règles globales)

Python 3.14 partout côté backend. Immutabilité (modèles `frozen`, jamais de mutation
d'entrée), fichiers autour de 400 lignes (**jusqu'à 600 si la cohésion le justifie**, Orhan, 2026-10-02 : « on peut
agrandir un peu la limite si c'est pour avoir quelque chose de plus propre » ; on découpe sur une vraie couture, jamais
pour le compte), fonctions < 50 lignes, erreurs explicites, validation
aux frontières (Pydantic strict : champs inconnus refusés, entiers stricts). TDD : tests
d'abord, couverture ≥ 80 %. Revue de code après chaque écriture.
