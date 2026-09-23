# B0 · Lecture & assemblage — le module proposé par Orhan, cadré

> 2026-09-10. Réponse à la proposition « un module qui récupère les informations de
> chaque table de la dernière run et construit le modèle JSON ». Oui : c'est B0, déjà
> nommé « adaptateur » dans les revues, et il grossit un peu. Ce document fixe ce qu'il
> fait, ce qu'il ne fait pas, et ce que ça change pour la librairie de collecte.

## 1. Le workflow amont tel que décrit

- Une API lance une collecte sur un ensemble d'équipements (par exemple un tag
  d'infrastructure) et une liste de **topics** (interfaces, arp, cdp, lldp, system info,
  vrfs, bgp neighbors…).
- Au démarrage : une entrée dans `collector_runs` (`collection_name`, `collector_run_id`,
  `start_datetime`, `end_datetime`, `status`).
- Par topic : une collection `<topic>_<collector_run_id>` avec les résultats.
- Une collection `collector_run_tasks_<collector_run_id>` : statut par équipement et par
  topic.
- La librairie Python se connecte, exécute les commandes du topic, parse avec
  ntc-templates et renvoie un modèle « qui essaie d'être vendor-agnostic ».
  **Un topic = une commande (ou presque) = un modèle. La librairie n'agrège pas.**

Ce que cela ferme : le document de run existe ; le statut par device et par topic existe
(la demande centrale des revues 01 et 02) ; `run_id` sur chaque document devient inutile
(il est dans le nom de la collection) ; `collected_at` a sa place naturelle dans les
tasks, par (device, topic), sans toucher aux parseurs.

## 2. Ce que B0 fait

1. **Choisir la run** : la dernière `collector_runs` dont `status` vaut terminé, et non
   « la plus récente », qui peut être en cours d'écriture. Paramètre explicite `run_id`
   possible pour rejouer.
2. **Vérifier la couverture** : lire `collector_run_tasks_<id>` ; si aucun device de
   l'infrastructure ciblée n'a été tenté, la run ne convient pas (une run peut viser un
   sous-ensemble du parc). Le statut par device et par topic entre tel quel dans le
   bundle : c'est lui qui autorise ou interdit les contrôles de réciprocité dans B1.
3. **Lire la table devices** (référence, table complète, pas seulement l'infra : B1
   résout les voisins externes dessus) et la **figer** dans le bundle.
4. **Lire les topics** de la run filtrés sur le périmètre : les hostnames des devices dont `infrastructure` est celle du bundle, dans la table `devices` **lue au moment de l'export** (`tasks` compris). Ne pas filtrer sur une copie d'`infrastructure` portée par les documents amont : un device déplacé entre la run et l'export ferait refuser le bundle (`hostname_outside_infrastructure`). **Acquis 2026-09-20 (Orhan)** : les collections de topics amont portent bien la clé `infrastructure`. La règle ne change pas : cette copie peut servir d'index à la requête Mongo, jamais de périmètre ; le périmètre est la jointure sur `devices`.
5. **Joindre les topics qui décrivent le même objet** : l'état des membres d'un agrégat
   (topic agrégats, s'il existe) greffé sur l'interface agrégat ; les membres de stack
   (topic system, s'il les porte) greffés sur le device ; les VRF par interface si elles
   viennent d'un topic séparé. Jointure sur `(hostname, name)`, jamais sur autre chose.
6. **Normaliser ce que la librairie ne normalise pas encore**, et **le tracer** : chaque
   règle de normalisation résiduelle est nommée et comptée dans le rapport
   (`residual_normalizations: {duplex_vendor_form: 412, …}`). Objectif : ce compteur
   tend vers zéro à mesure que la librairie normalise ses topics.
7. **Produire le RunBundle** : documents plats, JSON pur, schéma versionné (contrat v1),
   sans rien de la base (ni noms de collections, ni ObjectId, ni curseurs).

Le bundle est ensuite **archivé par B2** avec le snapshot : rejeu et historique sans la
base amont.

## 3. Ce que B0 ne fait pas

- **Aucune corrélation** : B0 ne relie jamais deux devices. Résolution des voisins,
  fusion des claims, désaccords, contrôles : B1.
- **Aucune inférence de vendeur** : B0 s'appuie sur un identifiant de plateforme
  normalisé (`platform`, proposé dans la revue 02) ou renonce à la normalisation
  concernée en le signalant. Il ne devine pas un vendeur à partir d'un nom d'interface.
- **Aucune lecture d'`extras`** hors clés déclarées (vPC).
- **Pas un modèle par niveau de diagramme.** Un seul bundle, un seul snapshot aux arêtes
  typées (câble L1, segment L2, adjacence L3, session BGP) ; les diagrammes L1, L2, L3
  sont des vues du même graphe. Trois modèles séparés donneraient trois identités à
  réconcilier, trois diffs et trois couches d'intention divergentes.

## 4. Ce que ça change pour les demandes des revues 01 et 02

L'objection « ton modèle exige d'agréger plusieurs commandes » est juste sur le
principe et fausse sur l'essentiel : la majorité des demandes de la revue 01 sont des
**normalisations de valeurs à l'intérieur d'une seule commande**, celle qui produit déjà
le document actuel (`show interfaces` / `show interface` / `get system interface`) :

| Demande (revue 01) | Source | Où |
|---|---|---|
| `duplex` full/half, `type` en énumération, statuts RFC 2863, `oper_reason` | même commande (la raison est entre parenthèses sur la ligne d'état) | librairie |
| `speed_mbps` entier, `mtu` entier, types stables (`address` chaîne), `schema_version` | même commande | librairie |
| `mac_address` normalisée au premier niveau | même commande (déjà dans `extras`) | librairie |
| `last_change_age_seconds` | même commande (« Last link flapped » NX-OS) | librairie |
| `vlan_id` de sous-interface | même commande (encapsulation 802.1Q ; `vlanid` FortiOS) | librairie |
| `counters` structurés (CRC, erreurs) | même commande | librairie |
| `members[].status`, `aggregation.protocol` | `show port-channel summary` / `show etherchannel summary` / `diagnose netlink aggregate` | **nouveau topic** à une commande, joint par B0 |
| `media` / transceiver | `show interface transceiver` | nouveau topic, joint par B0 (souhaitable) |
| `switchport_mode`, `access_vlan`, `native_vlan`, `allowed_vlans` | `show interfaces switchport` (IOS), `show interface switchport` (NX-OS) | nouveau topic, joint par B0 (souhaitable) |
| `ip_addresses` secondaires | `show ip interface` | nouveau topic, joint par B0 (souhaitable) |
| membres de stack, `platform`, serial | `show version` / `show inventory` : probablement déjà le topic **system** | topic system, joint par B0 |

Rien n'exige que la librairie agrège. Ce qui lui est demandé : normaliser les valeurs
dans les topics existants (c'est la définition de « vendor-agnostic »), et ajouter des
topics à une commande là où une information manque.

## 5. Remarque sur « une collection par topic et par run »

Choix amont, pas le nôtre ; B0 l'absorbe. Deux effets à connaître : MongoDB paie chaque
collection en fichiers et en index (un an de runs quotidiens sur dix topics ≈ 3 600
collections), et aucune requête inter-runs n'est possible sans itérer les noms. Living
Diagram n'en dépend pas : B2 archive ce dont il a besoin, et la rétention amont peut
rester courte.

## 6. Questions ouvertes après cette description

1. Énumération des statuts dans `collector_run_tasks_<id>` : distingue-t-elle « échec »,
   « non supporté par la plateforme » et « topic non sélectionné pour cette run » ?
2. Les tasks portent-elles un début / fin par (device, topic) ? Sinon, `collected_at`
   par document reste demandé.
3. Contenu du topic **system** : plateforme, version, serial, uptime, membres de stack ?
4. Existe-t-il un topic agrégats / port-channel ? Sinon, d'où viennent les `members` de
   l'exemple Fortinet ?
5. Sens de `collection_name` : nom de campagne, tag, libre ?
6. Un document de chaque collection restante : `collector_runs`, `collector_run_tasks`,
   `lldp_neighbors`, `cdp_neighbors`, `arp`, `mac`, `ha`, `system`.

## 7. Frontière B0 → B1 : contrat, transport, où vit B0 (proposé puis **validé** le 2026-09-10)

Contexte : Orhan code B0 lui-même dans l'environnement qui a accès aux équipements, pour
éviter toute fuite. La frontière entre « son côté » et « le côté Living Diagram » devient
donc B0 → B1. Question posée : JSON pur ? base de données ? module dans B1 ? endpoints
dans la FastAPI de collecte ?

### 7.1 Le contrat d'abord, le transport ensuite

Ce qui doit être figé n'est pas un transport, c'est **le document** : un `RunBundle` JSON
validé par un **JSON Schema versionné**, publié dans le repo Living Diagram avec des
fixtures et un validateur. B1 ne connaît que ce document. B0 est alors remplaçable,
B1 est testable hors ligne, et l'écart entre les deux se mesure par une validation, pas
par un débogage à distance.

### 7.2 Les quatre options, jugées

| Option | Verdict | Pourquoi |
|---|---|---|
| **B0 = module importé par B1** (la donnée vient de la librairie) | **non** | couple Living Diagram au cycle de release de la librairie et à l'accès réseau aux équipements ; B1 devient intestable sans la librairie ; c'est précisément le vecteur de fuite à éviter |
| **Endpoints par besoin dans la FastAPI de collecte** (`cdp_neighbors_<id>`, `aggregates_<id>`…) | **non** | N contrats à versionner et sécuriser ; la sélection de la run, la couverture et les jointures reviennent côté Living Diagram, donc B0 revient de ce côté ; interface bavarde et incohérente si la run change entre deux appels ; surface supplémentaire sur un outil qui détient des identifiants d'équipements |
| **Écriture dans une base lue par Living Diagram** | **acceptable comme zone d'atterrissage, pas comme contrat** | une base ne versionne pas un schéma et rend la dérive invisible ; les deux côtés doivent y accéder ; les tests exigent une base. Si le document stocké est un RunBundle validé, c'est l'option 4 avec Mongo comme transport |
| **Sortie JSON pure, un document par (run, infrastructure)** | **oui** | contrat unique, validable des deux côtés, archivable tel quel par B2, rejouable, diffable, transportable par fichier ou HTTP sans changer une ligne de B1 |

### 7.3 Transport recommandé : B0 **pousse** vers Living Diagram

- **Direction** : la zone sécurisée initie la connexion vers Living Diagram (egress
  contrôlable, aucune entrée vers le collecteur, aucun identifiant du collecteur côté
  Living Diagram). Living Diagram ne tire jamais.
- **Point d'entrée unique** : `POST /api/ingest/bundles` (jeton d'API), qui valide le
  document contre le schéma, l'archive brut (B2), lance B1, stocke le snapshot et renvoie
  le rapport de corrélation. Idempotent sur `(collector_run_id, infrastructure)`.
- **Équivalent hors ligne** : `ld ingest bundle.json`, même chemin de code. Un fichier
  déposé et un POST sont strictement le même document.
- **Déclencheur naturel** : fin de run côté collecte → B0 assemble, valide, pousse. Pas
  de polling. Un cron ou un hook post-run suffit.
- **Taille** : 500 devices × 50 interfaces ≈ 25 000 documents d'interfaces, soit 10 à
  20 Mo de JSON ; gzip en transport. Si cela grossit, sections en NDJSON, même schéma.

**Réalisé le 2026-09-10** : `backend/` expose `POST /api/ingest/bundles` (201 créé, 200 déjà
présent à l'identique, 409 contenu différent, 422 contrat violé, 401, 413), trois routes de
lecture, et `ld ingest` sur le même code. Archive disque derrière une interface. Guide :
`backend/README.md`.

### 7.4 Où vit B0 : un exportateur séparé, pas dans la FastAPI de collecte

Un petit outil dédié dans l'environnement sécurisé, `living-diagram-export`, en CLI et
appelable par hook :

```
living-diagram-export --run <collector_run_id> --infrastructure <infra> --out bundle.json
living-diagram-export --latest --infrastructure <infra> --push https://ld.internal/api/ingest/bundles
```

Il lit la Mongo amont, joint les topics, applique la normalisation résiduelle tracée,
**valide contre le schéma avant d'envoyer**, et pousse. Cycle de vie séparé de l'API de
collecte (qui reste un outil opérationnel), testable seul, rejouable à la demande pour
une run ancienne. Il peut importer les modèles de la librairie de collecte s'ils
existent ; il n'expose rien.

### 7.5 L'artefact partagé entre les deux côtés : un paquet `ld-contracts`

Le seul code qui traverse la frontière, dans les deux sens, est un paquet Python pur,
sans accès réseau ni base :

- modèles Pydantic du RunBundle et des documents de topics (docs 01, 02, 04) ;
- JSON Schema généré, versionné en semver (`contract_version`) ; B1 refuse une version
  majeure inconnue ;
- fixtures synthétiques de référence ;
- `ld-contracts validate bundle.json` : rapport d'erreurs structurel (champ, raison),
  partageable sans fuite puisqu'il ne contient pas de données ;
- `ld-contracts anonymize bundle.json` : pseudonymes cohérents pour hostnames, IP, MAC,
  serials, y compris à l'intérieur des descriptions, en préservant la structure. Permet
  de partager la forme d'un cas réel sans son contenu. **Réalisé le 2026-09-10** : IP par
  bijection préservant les préfixes (Crypto-PAn avec HMAC), nettoyage de toutes les
  feuilles texte (hostnames et serials connus, MAC en trois formats, IPv4, IPv6), graine
  par variable d'environnement ou fichier, rapports de validation sans valeurs par
  défaut. Revue de code indépendante appliquée (fuites de bits d'hôte, double
  pseudonymisation, champs oubliés, collisions de casse).

Sens de la dépendance : l'exportateur d'Orhan dépend de `ld-contracts` ; Living Diagram
ne dépend de rien côté collecte.

### 7.6 Le mode hybride, concrètement

| Côté Orhan (accès équipements) | Frontière | Côté Living Diagram (sans accès) |
|---|---|---|
| Mongo amont, librairie, exportateur B0 | `ld-contracts` (modèles, schéma, validateur, anonymiseur) | B1 → B9, API, shell, générateur de fixtures |
| exécute l'exportateur sur une run réelle, valide, ingère dans son instance Living Diagram | erreurs de validation, rapports de corrélation (des comptes), bundles anonymisés | développe et teste sur fixtures synthétiques au même schéma ; corrige le contrat ou B1 à partir des retours |
| peut aussi lancer son exportateur contre la **Mongo factice** peuplée par le générateur (schéma amont répliqué) | | le générateur écrit à la fois le schéma amont (pour tester B0 chez Orhan) et des bundles (pour tester B1 ici) |

### 7.7 Ce que B1 exige du bundle, en résumé

1. Un document par `(collector_run_id, infrastructure)`, `contract_version`,
   `produced_at`, `exporter_version`.
2. `run`, `devices` (table complète), `tasks` (filtrées sur l'infra), puis une clé par
   topic : `interfaces`, `aggregates`, `lldp`, `cdp`, `system`, `ha` ; les documents sont
   les modèles cibles des docs 01 et 04, sans artefact Mongo (`_id`, ObjectId,
   dates natives) : chaînes, entiers, booléens, listes, `null`, dates ISO 8601 UTC.
   **Sans `infrastructure` ni `schema_version` sur les documents** (2026-09-14) : le périmètre
   est écrit une fois au premier niveau du bundle, et `devices` fait foi pour l'appartenance.
3. `residual_normalizations` : les règles appliquées par B0 et leurs comptes.
4. Tableaux triés de façon stable (par `hostname`, puis `name` ou `local_interface`) :
   souhaitable, B1 canonicalise de toute façon.
5. Aucune corrélation : jamais un lien, jamais un voisin résolu. Des documents plats.

### 7.8 « Actualiser le diagramme » avec un point d'entrée en push (question du 2026-09-10)

Le bouton existe ; il faut dire ce qu'il déclenche. Trois niveaux, cumulables :

| Niveau | Ce que fait le bouton | Mécanisme | Coût |
|---|---|---|---|
| **1 · Afficher la dernière version ingérée** | charge le snapshot le plus récent de l'infra | `GET` sur B2, rien à ajouter | nul ; avec le push automatique en fin de run, le diagramme est à jour dès que la run est terminée. Le bouton affiche « dernière run ingérée : il y a 3 h » |
| **2 · Demander un nouvel export de la dernière run** | crée une **demande d'actualisation** côté Living Diagram | l'exportateur B0, dans la zone sécurisée, **interroge** `GET /api/ingest/requests` (sortie réseau depuis l'intérieur, comme le push), exécute la demande, pousse le bundle ; l'UI suit l'état : demandée → export en cours → ingérée, ou échec avec raison | une file de demandes + une boucle de polling dans l'exportateur ; aucun accès entrant vers la zone sécurisée |
| **3 · Lancer une nouvelle collecte** | même file, la demande porte « collecter puis exporter » | l'exportateur appelle l'API de collecte pour la liste de topics utile au L1, attend la fin de run, exporte, pousse | idem, plus un appel à l'API de collecte : touche l'outil opérationnel, à réserver à une phase ultérieure et à un rôle |

Règles qui tiennent dans les trois cas :
- **Une actualisation produit toujours une nouvelle version** (un snapshot par run ingérée).
  Le diagramme ne se met jamais à jour « en place » : c'est ce qui rend la timeline et le
  diff possibles. Un export refait sur la même run est idempotent : aucune version créée
  (précision 2026-09-10 : l'empreinte porte sur les **données**, pas sur l'enveloppe
  `produced_at` / `exporter_version` ; des données différentes pour la même run ⇒ 409).
- **La direction des connexions réseau ne dicte pas qui décide.** Une file de demandes
  interrogée depuis l'intérieur donne la sémantique « à la demande » avec une posture
  réseau purement sortante.
- **Si Living Diagram tourne dans le même environnement que la collecte**, le niveau 2 se
  simplifie : l'API Living Diagram appelle l'exportateur directement (HTTP local ou
  sous-processus) et le bouton devient synchrone. Le document échangé ne change pas.

Décisions du 2026-09-10 (Orhan) : découpage validé ; Living Diagram dans la même zone
que l'API de collecte, avec possibilité de lui parler ⇒ transport par défaut HTTP local
ou fichier, appel direct de l'exportateur possible ; bouton d'actualisation V1 = niveaux
1 et 2 ; **niveau 3 certain** (déclencher une run puis afficher le diagramme mis à jour),
à prévoir dans la file de demandes dès la conception.
