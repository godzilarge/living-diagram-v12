# Revue du modèle de collecte `devices` (périmètre, remplace la CMDB)

> **Statut (2026-09-10)** : revue historique, conservée pour le raisonnement. La référence
> normative du modèle de données est `contracts/CONTRAT.md`, générée depuis les modèles ;
> en cas d'écart, c'est elle qui fait foi.

> 2026-09-09. Revue de l'exemple fourni (un switch Nexus). Même grille que
> `01-revue-collecte-interfaces.md` : bloquant, important, souhaitable, à ne pas changer,
> questions, schéma cible. Le document `collector_run` n'a toujours pas été vu ; une forme
> cible est proposée en §6 pour comparaison.

Exemple reçu :

```json
{
  "hostname": "my_test_switch",
  "os_name": "nxos",
  "os_version": "10.4.2",
  "infrastructure": "test",
  "brand": "cisco",
  "brand_model": "N9K-C93180",
  "site": "new-york",
  "serial_number": "XXXXXXXXXX",
  "type": "switch"
}
```

## 0. Ce qui est bon, et pourquoi

- **`serial_number`** : la clé d'identité de secours attendue depuis août. Permet de suivre
  un device renommé, de recouper la table HA (serials des membres) et de regrouper des
  contextes virtuels partageant un châssis.
- **`brand_model` + `os_name` + `os_version`** : au-delà de l'affichage, `os_name` dit à B1
  quelle normalisation appliquer aux descriptions (forme courte/longue des ports Cisco) et
  quelles sources d'évidence attendre (CDP n'existe que chez Cisco). `os_version` rend
  une mise à jour d'OS visible dans le diff (événement de timeline).
- **`site`** : la partition géographique pour le placement (B7), disponible sans CMDB.
- **`type`** : la nature du boîtier. Reste distinct du rôle topologique inféré par B5.

## 1. Bloquant

### 1.1 Lien temporel : résolu le 2026-09-09, demande retirée
Précision d'Orhan : la liste devices est une **table de référence**, indépendante des
runs, filtrable par `infrastructure`. Les runs (interfaces, lldp, cdp, arp, mac…) sont
incrémentaux, portent un `run_id`, et se fondent sur cette liste pour collecter. Modèle
classique inventaire + observations : il tient, et la demande de `run_id` sur devices est
**retirée**.

Une nuance de vocabulaire qui compte : la liste est *stable*, pas *immuable*. Elle
représente le présent ; des devices y entrent, en sortent ou changent d'infrastructure au
fil des mois, ce qui est exactement ce que la démo doit montrer. Personne en amont ne
garde « la liste telle qu'elle était au run N-1 ». C'est donc **Living Diagram qui la
fige**, et cela se traduit par deux règles de conception :

- **B1 embarque dans le snapshot la liste devices telle qu'il l'a lue** au moment de la
  corrélation. Le diff « device ajouté / retiré / changé d'infra » se calcule entre
  snapshots, jamais contre la table vivante.
- **B2 archive le bundle d'entrée brut** (devices lus + documents du run) à côté du
  snapshot. Rejouer un run ancien avec un corrélateur plus récent utilise le bundle
  archivé, jamais la table vivante. Le déterminisme reste « même bundle ⇒ même snapshot »,
  et Living Diagram devient indépendant de la rétention amont.

Corollaire opérationnel : la corrélation doit tourner peu après la collecte, avant que
la liste ne bouge. Et le champ `infrastructure` dupliqué sur chaque document de run
n'est pas qu'un index : c'est **la mémoire de l'appartenance au moment de la collecte**,
pour tout device effectivement collecté (correction de la revue interfaces §3). Seuls les
devices listés mais sans aucun document dans le run restent ambigus, d'où §1.2.

### 1.2 Statut de collecte : résolu le 2026-09-10 (voir `03-b0-lecture-assemblage.md`)
`collector_runs` (statut, début, fin) et `collector_run_tasks_<id>` (statut par device et
par topic) existent. Reste à voir l'énumération des statuts et la présence d'un
horodatage par task. Le texte ci-dessous est conservé comme justification.

#### (historique) Toujours aucun statut de collecte
Avec une liste de référence et des runs sans statut, « device présent dans la liste mais
sans aucun document dans le run » a trois lectures : injoignable ce jour-là, ajouté à la
liste après le lancement du run, ou exclu volontairement. B1 ne peut pas les départager,
donc il ne peut ni distinguer « retiré » de « injoignable » dans le diff, ni savoir si
l'absence de LLDP chez un voisin est un défaut ou une limite de l'OS.

**Demande maintenue** : un document `collector_run` (ou une collection
`collection_status`) avec, par run, la liste des devices tentés et le résultat par device
et par table (§6). Il faut aussi pouvoir savoir qu'un run est **terminé** : « la dernière
run » ne doit jamais désigner une run en cours d'écriture.

## 2. Important

### 2.1 `hostname` doit être identique, octet pour octet, dans toutes les collections
Ici `my_test_switch` en minuscules ; l'exemple interfaces portait `MON_SWITCH` en
majuscules. Ce sont des exemples, mais la règle doit être écrite : le `hostname` stampé
sur interfaces, lldp, cdp, mac, arp, ha est **celui de devices (la clé CMDB), copié par
le collecteur au lancement**, jamais le nom que l'équipement rapporte de lui-même
(prompt, `show hostname`), qui peut différer en casse ou porter un domaine DNS.

### 2.2 Clés de résolution des voisins : retirée le 2026-09-09
Précisions d'Orhan : le `hostname` des collections de run est copié depuis devices ; il
doit être identique au nom configuré sur l'équipement ; et le collecteur **retire le
domaine DNS** du nom des voisins LLDP/CDP avant injection, précisément pour que ce nom
corresponde à la clé de devices. La résolution est donc faite en amont, par construction.
`reported_hostname` et `management_ip` ne sont plus demandés (le second reste utile un
jour pour l'UI, sans urgence).

Ce que B1 garde malgré tout, parce que « doit normalement être identique » n'est pas une
garantie : résolution **exacte** d'abord ; repli **insensible à la casse** signalé par un
contrôle de qualité de données ; voisin toujours non résolu ⇒ stub + ligne dans le
rapport de corrélation du run. Rien n'est corrigé en silence.

### 2.3 Stacks : un seul document, un seul serial (précisé le 2026-09-09)
Un stack = un document devices, donc un `serial_number` et aucune liste de membres. La
décision d'août (1 nœud, badge ×N, contrôle « membre disparu ») n'a pas de donnée pour
le N ni pour l'état des membres. Trois options, à trancher :

- **(a) Rien en V1** : un stack se dessine comme un standalone. Honnête, sans coût.
- **(b) N déduit du nommage des interfaces** : sur Catalyst, `Gi<switch>/<module>/<port>`
  donne le numéro de membre ; B1 compte les valeurs distinctes sur les ports physiques et
  émet le badge avec provenance `inferred`. Ce n'est pas inventer, c'est déduire, mais
  c'est une règle Cisco dans B1 et elle ne dit pas si un membre est vivant.
- **(c) Une collection `hardware`** (équivalent de `show switch` / `show inventory` :
  membres, serials, rôles, états) comme source d'évidence supplémentaire, au même titre
  que la table HA. C'est la bonne cible : le badge et le contrôle « membre disparu »
  en découlent proprement.

Recommandation : (c) comme cible, (b) en attendant si le badge compte pour la démo,
sinon (a).

### 2.4 Contextes virtuels : pas de VDC, mais du VSX Checkpoint (précisé le 2026-09-09)
Le cas existe. Sur un VSX, les ports physiques (`eth*`, `bond*`) appartiennent à la
passerelle (VS0) ; chaque Virtual System porte des interfaces warp et des sous-interfaces
VLAN sur ces ports physiques. Le nœud L1 est la passerelle physique ; les VS sont des
partitions.

**Questions à fermer** :
- Un VSX est-il **un** document devices (la passerelle) ou un document **par Virtual
  System** ?
- Le collecteur se connecte à la passerelle : collecte-t-il les interfaces de **tous** les
  VS (`vsenv` sur chacun) ou seulement VS0 ?
- En cluster VSX (deux passerelles physiques), chaque membre a-t-il son document, comme
  pour les clusters Fortinet ?

**Règle proposée** : un document devices = une passerelle physique ; les interfaces de
tous les VS sont collectées et portent `virtual_context` = nom du VS (VS0 ou null pour
les ports physiques). Si la base a un document par VS, il faut `parent_hostname` pour
regrouper, sinon B1 dessinera plusieurs boîtiers pour un seul châssis.

### 2.5 Un device appartient à une seule infrastructure (précisé le 2026-09-09)
`infrastructure` reste une chaîne. B1 résout tout de même les voisins sur la table
devices **complète** pour distinguer trois statuts : voisin **interne** (même infra),
voisin **externe connu** (autre infra, dessiné en bordure avec son infra d'origine),
voisin **inconnu** (stub, à compléter par la couche d'intention). Gain direct de la
disparition de la CMDB : la table est locale et complète.

### 2.6 Énumérations (précisé le 2026-09-09)
- `type` : **figé** : `switch | router | firewall | load_balancer | wireless_controller |
  server | other`. Un Nexus utilisé en L3 pur reste `switch` (nature du boîtier) ; le
  rôle (spine, cœur) est inféré par B5.
- `os_name` : **non normalisé** en amont. B1 ne peut donc pas s'y fier pour une logique
  (expansion courte/longue des ports Cisco, sources d'évidence attendues). Proposition à
  faible coût : le collecteur choisit déjà un driver ou un parseur par équipement, il
  possède donc un identifiant de plateforme normalisé ; l'exposer tel quel dans un champ
  `platform` (convention netmiko : `cisco_nxos`, `cisco_ios`, `cisco_xe`, `fortinet`,
  `checkpoint_gaia`…). `os_name` reste brut pour l'affichage. À défaut, B1 se rabat sur
  `brand`, à condition qu'il soit normalisé (à confirmer : `cisco`, `fortinet`,
  `checkpoint` ?).
- `site` : libre ou référentiel ? Toujours ouvert. Si libre, `new-york` et `New York`
  feront deux partitions de placement.

## 3. Souhaitable

- **`vendor` plutôt que `brand`, `model` plutôt que `brand_model`** : vocabulaire de
  l'industrie (NetBox, Nautobot, SNMP `sysDescr`), et `brand_model` laisse croire à une
  concaténation.
- **`lifecycle`** (`production | staging | decommissioned`) si la CMDB le porte : un device
  décommissionné encore listé sera collecté en échec à chaque run.
- **`synced_at`** : date de la dernière synchronisation CMDB pour ce document, si la liste
  est globale (§1.1).

## 4. À ne pas changer

- **`hostname` reste la clé primaire** ; `serial_number` est un secours, jamais la clé de
  jointure entre collections.
- **`infrastructure` sur devices est la source de vérité** ; sa copie sur interfaces n'est
  qu'un index (revue interfaces §3).
- **`type` n'est pas le rôle** : ne pas ajouter de champ `role` ici, il serait figé à la
  main alors que B5 l'infère et que la couche d'intention le corrige.

## 5. Questions (état au 2026-09-09)

Fermées : liste de référence hors run ; hostname copié depuis devices et domaine DNS
retiré des voisins ; stack = un document ; pas de VDC ; un device = une infra ; `type`
figé ; descriptions : premier champ = criticité, le reste plus tard.

Ouvertes :
1. ~~Le document de run~~ : existe (`collector_runs` + `collector_run_tasks_<id>`).
   Reste : énumération des statuts de task, horodatage par task, exemples.
2. VSX : un document par passerelle ou par VS ; tous les VS collectés ou VS0 seul ;
   membres de cluster (§2.4).
3. Stacks : option (a), (b) ou (c) (§2.3). Le topic **system** (show version /
   inventory) porte peut-être déjà les membres : à vérifier, ce serait l'option (c)
   gratuite.
4. `brand` est-il normalisé ; un champ `platform` est-il envisageable (§2.6).
5. `site` libre ou référentiel.

## 6. Schémas cibles proposés

### `devices` (un châssis physique)

```json
{
  "schema_version": "1.0",
  "hostname": "my_test_switch",
  "vendor": "cisco",
  "platform": "cisco_nxos",
  "model": "N9K-C93180YC-FX",
  "os_name": "NX-OS",
  "os_version": "10.4.2",
  "type": "switch",
  "site": "new-york",
  "infrastructure": "test",
  "serial_number": "XXXXXXXXXX",
  "parent_hostname": null,
  "lifecycle": "production"
}
```

`platform` (§2.6) et `parent_hostname` (§2.4, VSX seulement) sont les deux seuls ajouts
encore proposés ; `lifecycle` est souhaitable. Les membres de stack relèvent d'une
collection `hardware` (§2.3, option c), pas de devices.

### `collector_run` (forme attendue, à comparer avec l'existant)

```json
{
  "schema_version": "1.0",
  "run_id": "66db3f0e9a1c2b0012f4a7d1",
  "infrastructure": "test",
  "started_at": "2026-09-09T02:00:00Z",
  "finished_at": "2026-09-09T02:14:32Z",
  "status": "completed",
  "collector_version": "3.2.0",
  "devices": [
    {
      "hostname": "my_test_switch",
      "status": "ok",
      "tables": { "interfaces": "ok", "lldp": "ok", "cdp": "ok", "mac": "ok", "arp": "ok", "ha": "not_applicable" },
      "duration_ms": 8420,
      "error": null
    },
    {
      "hostname": "my_test_firewall",
      "status": "partial",
      "tables": { "interfaces": "ok", "lldp": "not_supported", "cdp": "not_applicable", "mac": "failed", "arp": "ok", "ha": "ok" },
      "duration_ms": 12030,
      "error": "mac: command timeout"
    },
    {
      "hostname": "my_old_router",
      "status": "unreachable",
      "tables": null,
      "duration_ms": 30000,
      "error": "ssh: connect timeout"
    }
  ]
}
```

Statuts par table : `ok | failed | not_supported | not_applicable | skipped`. La
distinction `not_supported` (l'OS n'a pas LLDP) / `failed` (la commande a échoué) /
`not_applicable` (CDP sur un Fortinet, HA sur un switch) est exactement ce qui sépare un
contrôle légitime d'un faux positif. `status` global du run : `completed | partial |
failed`, dérivable des devices mais pratique à indexer.

La liste devices étant une table de référence (§1.1), `collector_run.devices[]` n'a pas
à la recopier : elle porte seulement les devices **tentés** et leur résultat. Un run peut
couvrir plusieurs infrastructures ; le filtrage se fait alors sur le champ
`infrastructure` des documents collectés.

## 7. Ce que B1 fera de ces champs

| Champ | Usage B1 |
|---|---|
| `hostname` | identité du nœud, clé de jointure de toutes les collections |
| `hostname` (voisins déjà normalisés en amont), MAC des interfaces | résolution exacte, repli insensible à la casse signalé, chassis-id en dernier recours |
| `serial_number` | identité de secours, recoupement table HA ; badge ×N et « membre disparu » attendent une collection hardware |
| `platform` (ou `brand` normalisé) | normalisation courte/longue des ports dans les descriptions ; sources d'évidence attendues |
| `type`, `model` | indices pour l'inférence de rôle (B5), affichage |
| `site`, `infrastructure` | partitions de placement ; scoping ; statut interne / externe / inconnu des voisins |
| `collector_run.devices[].tables` | activation ou non des contrôles de réciprocité ; « injoignable » ≠ « retiré » |

## 8. Journal des retours

- **2026-09-09 (Orhan)** : la liste devices est une table de référence hors run,
  filtrable par infrastructure ; les runs sont incrémentaux avec `run_id` ; accord pour
  `run_id` et `collected_at` sur toutes les collections de run. Demande de `run_id` sur
  devices retirée ; conséquence : B1 embarque la liste lue dans le snapshot, B2 archive le
  bundle brut (§1.1). Demande de statut de collecte par device et par table maintenue
  (§1.2).
- **2026-09-09 (Orhan, 2)** : hostname copié depuis devices, domaine DNS retiré des
  voisins LLDP/CDP en amont ⇒ `reported_hostname` et `management_ip` retirés (§2.2) ;
  stack = un document ⇒ trois options (§2.3) ; pas de VDC mais VSX Checkpoint (§2.4) ; un
  device = une infra (§2.5) ; `type` figé, `os_name` non normalisé ⇒ proposition
  `platform` (§2.6) ; une run couvre tout le parc, filtrage par `infrastructure`.
- **2026-09-10 (Orhan)** : workflow de collecte décrit (API, topics, `collector_runs`,
  `collector_run_tasks_<id>`, une collection par topic et par run) ⇒ statut de collecte
  résolu (§1.2) ; B0 cadré dans `03-b0-lecture-assemblage.md`.
