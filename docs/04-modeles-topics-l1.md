# Modèles de topics attendus pour le diagramme physique (L1)

> **Statut (2026-09-10)** : revue historique, conservée pour le raisonnement. La référence
> normative du modèle de données est `contracts/CONTRAT.md`, générée depuis les modèles ;
> en cas d'écart, c'est elle qui fait foi.

> 2026-09-10. Réponse à « donne-moi, comme pour les interfaces, les données dont tu as
> besoin pour commencer un diagramme de niveau 1 ». Un topic = une commande (ou presque)
> = un modèle, conformément à la librairie de collecte. Pour chaque topic : rôle dans le
> L1, exemple cible, champs, commandes source par vendeur (à confronter à ce que la
> librairie collecte déjà), usage dans B1. Les modèles `interfaces` et `devices` sont dans
> les revues 01 et 02 et ne sont pas répétés.

## 0. Vue d'ensemble : ce qu'il faut pour un L1, par priorité

| Priorité | Collection | Rôle pour le L1 | État côté collecte |
|---|---|---|---|
| référence | `devices` | qui est un nœud, qui est un stub, partitions | existe (revue 02) |
| P0 | `collector_runs`, `collector_run_tasks_<id>` | choisir la run, savoir ce qui a été collecté | existent (§1) |
| P0 | `interfaces_<id>` | ports, états, descriptions (source « documenté ») | existe (revue 01) |
| P0 | `lldp_neighbors_<id>` | source « observé » n°1 | existe, modèle à confronter (§2) |
| P0 | `cdp_neighbors_<id>` | source « observé » n°2, Cisco | existe, modèle à confronter (§3) |
| P0 | `aggregates_<id>` | Po/bond avec état par membre, MLAG | existe, complétude inconnue (§4) |
| P1 | `system_<id>` | nom rapporté, serial, stack, contextes virtuels | à créer (§5) |
| P1 | `ha_<id>` | clusters : membres, rôles, interfaces de heartbeat | existe, à confronter (§6) |
| réservé | `arp`, `mac`, `bgp_neighbors`, `vrfs` | overlays L2 / L3, pas le L1 | plus tard |

Conventions communes à tous les documents de run : `hostname` copié depuis devices ;
pas de `run_id` (dans le nom de la collection) ; `extras` libre, jamais lu par B1 hors clés
déclarées ; `infrastructure` et `schema_version`, copiés sur chaque document par convention
**amont**, ne sont pas repris dans le RunBundle (depuis le 2026-09-14, `infrastructure` n'existe
qu'au premier niveau du bundle et sur `devices`, voir `contracts/README.md` § Décisions) : les
exemples ci-dessous sont au format du RunBundle, sans ces deux champs (corrigés le 2026-09-14) ; noms d'interfaces **canoniques et identiques** à ceux de `interfaces` pour
tout champ `*_interface` ou `name` **local**. Les noms d'interfaces **distants** (annoncés
par le voisin) restent bruts : B1 les normalise.

## 1. `collector_runs` et `collector_run_tasks_<id>` (existants, à confirmer)

Ce que B0 lit. `status_per_subject` ne liste que les topics supportés par le type de
device et sélectionnés à la création de la run (précision d'Orhan) : **absent = pas de
donnée à attendre**, donc pas de contrôle de réciprocité contre ce device pour ce topic.

```json
{
  "collector_run_id": "66db3f0e9a1c2b0012f4a7d1",
  "collection_name": "infra_01 nightly",
  "start_datetime": "2026-09-10T02:00:00Z",
  "end_datetime": "2026-09-10T02:14:32Z",
  "status": "completed"
}
```

```json
{
  "hostname": "MON_SWITCH",
  "status": "success",
  "status_per_subject": {
    "interfaces": { "status": "success", "started_at": "2026-09-10T02:03:10Z", "ended_at": "2026-09-10T02:03:41Z", "error": null },
    "lldp":       { "status": "success", "started_at": "2026-09-10T02:03:41Z", "ended_at": "2026-09-10T02:03:52Z", "error": null },
    "cdp":        { "status": "failed",  "started_at": "2026-09-10T02:03:52Z", "ended_at": "2026-09-10T02:04:22Z", "error": "command timeout" },
    "aggregates": { "status": "success", "started_at": "2026-09-10T02:04:22Z", "ended_at": "2026-09-10T02:04:30Z", "error": null }
  },
  "error": null
}
```

À confirmer : les valeurs de `status` (run et subject) ; la présence de `started_at` /
`ended_at` par subject (sinon `collected_at` par document de topic) ; la valeur de
`status` d'un device injoignable (`unreachable` ? avec `status_per_subject` vide ?).

## 2. `lldp_neighbors_<id>` (P0)

**Rôle** : la réalité du fil, côté A. Un document par (port local, voisin vu).

> **Révision du 2026-09-18.** Le topic est réduit à ce que B1 consomme : « sur ce port local, je vois ce
> voisin, sur ce port ». Retirés : `neighbor_interface_subtype`, `neighbor_port_description`,
> `neighbor_chassis_id`, `neighbor_chassis_id_subtype`, `neighbor_management_ip`,
> `neighbor_system_description`, `ttl_seconds`. Motif : ce qu'un voisin collecté annonce de lui-même est
> déjà dans ses propres topics. Détail : `contracts/README.md` § Décisions, `docs/05` R0 à R3.

```json
{
  "hostname": "MON_SWITCH",
  "local_interface": "Ethernet1/1",
  "neighbor": "MON_SWITCH_02",
  "neighbor_interface": "Ethernet1/2",
  "neighbor_capabilities": ["bridge", "router"],
  "extras": {}
}
```

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| `local_interface` | ifName canonique | oui | identique à `interfaces.name` |
| `neighbor` | chaîne | oui | system-name annoncé, **domaine DNS retiré** (fait en amont) ; sinon brut |
| `neighbor_interface` | chaîne brute | oui | port-id TLV tel qu'annoncé : IOS annonce souvent la forme courte (`Gi1/0/1`), NX-OS la longue ; si c'est une MAC (`lldpd` : Gaia, Linux), normalisée `aa:bb:cc:dd:ee:ff`, B1 la reconnaît à sa forme |
| `neighbor_capabilities` | liste de chaînes | oui (`[]` si rien) | seule information sur la nature d'un voisin non collecté (serveur, téléphone, AP) : c'est sur elle que la vue réseau masque les stubs |

**Commandes source** : IOS / IOS-XE et NX-OS `show lldp neighbors detail` (ntc-templates
existants) ; FortiOS : réception LLDP à activer par interface, commande d'affichage à
vérifier dans la librairie ; Gaia : selon version, sinon `not_supported`.

**B1** : claim `observé` (local ↔ voisin résolu ou stub) ; réciprocité A→B et B→A
attendue seulement si `lldp` figure dans `status_per_subject` des deux devices.

## 3. `cdp_neighbors_<id>` (P0, Cisco)

**Rôle** : même chose que LLDP, souvent le seul protocole actif sur les Catalyst anciens.

> **Révision du 2026-09-18.** Même forme que `lldp`. Retirés : `neighbor_serial`, `neighbor_platform`,
> `neighbor_management_ip`, `neighbor_native_vlan`, `neighbor_duplex`, `neighbor_software_version`. Le
> VLAN natif et le duplex d'en face se lisent dans les `interfaces[]` de l'autre bout (`docs/05` R5).

```json
{
  "hostname": "MON_SWITCH",
  "local_interface": "GigabitEthernet1/0/1",
  "neighbor": "MON_SWITCH_02",
  "neighbor_interface": "GigabitEthernet1/0/24",
  "neighbor_capabilities": ["switch", "igmp"],
  "extras": {}
}
```

Notes : le Device ID CDP d'un Nexus est souvent `HOSTNAME(SERIAL)` : ne garder que `HOSTNAME`
dans `neighbor`. Domaine DNS retiré comme pour LLDP. `neighbor_interface` brut (CDP
annonce la forme longue chez Cisco, mais on ne normalise pas côté collecte).

**Commande** : `show cdp neighbors detail` (IOS, NX-OS ; ntc-templates existants).

**B1** : claim `observé` ; quand LLDP et CDP citent le même voisin sur le même port, un
seul lien avec provenance `{lldp, cdp}` ; s'ils divergent, contrôle.

## 4. `aggregates_<id>` (P0)

**Rôle** : la vérité d'un agrégat (Po, bond, aggregate) et surtout **l'état de chaque
membre**, que `interfaces.members` ne donne pas. Un document par agrégat.

```json
{
  "hostname": "MON_SWITCH",
  "name": "port-channel10",
  "oper_status": "up",
  "protocol": "lacp",
  "lacp_mode": "active",
  "min_links": 1,
  "members": [
    { "name": "Ethernet1/1", "status": "bundled" },
    { "name": "Ethernet1/2", "status": "suspended" }
  ],
  "mlag_id": 10,
  "mlag_peer_link": false,
  "extras": { "flags_raw": "Po10(SU)", "vpc_consistency": "success" }
}
```

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| `name` | ifName canonique | oui | identique à `interfaces.name` de l'agrégat |
| `oper_status` | `up \| down` | oui | |
| `protocol` | `lacp \| static \| pagp` | oui | statique d'un côté et LACP de l'autre : contrôle |
| `lacp_mode` | `active \| passive \| null` | souhaité | |
| `members[].name` | ifName canonique | oui | |
| `members[].status` | `bundled \| suspended \| standby \| individual \| down \| not_in_use` | oui | le contrôle « mono-membre » compare `bundled` au total ; `not_in_use` = min-links non atteint |
| `min_links` | entier | optionnel | |
| `mlag_id`, `mlag_peer_link` | entier / bool, nullables | souhaité | concept commun (vPC Nexus, MLAG, MC-LAG) ⇒ premier niveau selon la règle « concept agnostique » de la revue 01 ; remplace la décision d'août « vPC dans extras » |

**Commandes** : NX-OS `show port-channel summary` (+ `show vpc` pour `mlag_*`) ;
IOS / IOS-XE `show etherchannel summary` ; FortiOS `diagnose netlink aggregate name <nom>`
(mode LACP, `distributing` / `collecting` par membre) ; Gaia `show bonding groups` puis
`show bonding group <id>` (mode 802.3ad / active-backup, membres, état).

Mapping des drapeaux Cisco vers `members[].status` : `P` bundled · `s` suspended · `H`
standby · `I` individual · `D` down · `M` / `w` not_in_use (min-links / waiting) ·
`r` down (module retiré, raison dans `extras`).

**B1** : structure agrégat ; contrôles mono-membre, membre suspendu, protocole
asymétrique, `mlag_id` divergent aux deux bouts, vitesses hétérogènes (via interfaces).
Si ce topic manque pour un device, B1 se rabat sur `interfaces.members` sans états et le
note dans le rapport.

## 5. `system_<id>` (P1, à créer)

**Rôle** : ce que l'équipement dit de lui-même. Serial, membres de stack (option (c) de la
revue 02, obtenue gratuitement), contextes virtuels (VSX), et le nom rapporté pour vérifier
l'hypothèse « hostname devices = hostname configuré ».

> **2026-09-14** : `platform` (énumération fermée, clé du driver de collecte) figurait ici et
> a été **retiré** : aucune règle de `docs/05` ne le consommait, et le choix d'un driver est
> une affaire du producteur, pas du contrat. Décision et critère dans `contracts/README.md`
> § Décisions.

```json
{
  "hostname": "MON_STACK",
  "reported_hostname": "MON_STACK",
  "vendor": "cisco",
  "model": "C9300-48P",
  "os_version": "17.9.4a",
  "serial_number": "FOC1111AAAA",
  "uptime_seconds": 8123456,
  "chassis_members": [
    { "slot": 1, "serial": "FOC1111AAAA", "model": "C9300-48P", "role": "active",  "state": "ready", "priority": 15 },
    { "slot": 2, "serial": "FOC2222BBBB", "model": "C9300-48P", "role": "standby", "state": "ready", "priority": 14 },
    { "slot": 3, "serial": "FOC3333CCCC", "model": "C9300-48P", "role": "member",  "state": "removed", "priority": 1 }
  ],
  "virtual_contexts": [],
  "extras": { "config_register": "0x102" }
}
```

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| `reported_hostname` | chaîne brute | oui | le nom affiché par l'équipement ; ≠ `hostname` ⇒ contrôle de qualité de données, pas une correction |
| `serial_number` | chaîne | oui | châssis ou membre actif |
| `chassis_members` | liste, vide pour un standalone | oui | stacks Catalyst ; `state` : `ready \| removed \| provisioned \| version_mismatch` ; le contrôle « membre disparu » compare deux runs |
| `virtual_contexts` | liste de chaînes | oui | VSX : noms des Virtual Systems vus ; vide sinon |
| `uptime_seconds` | entier | souhaité | un reboot entre deux runs est un événement de timeline |

**Commandes** : IOS-XE `show version` (+ `show switch` pour les membres et états, `show
inventory` pour les serials) ; NX-OS `show version` + `show inventory` ; FortiOS
`get system status` ; Gaia `show version all` + `show asset all`, VSX `vsx stat -v`
(liste des VS).

**B1** : badge ×N depuis `chassis_members` (plus d'option (b)) ; regroupement VSX ;
identité de secours par serial.

## 6. `ha_<id>` (P1, existant, à confronter)

**Rôle** : regrouper les membres d'un cluster, détecter un membre mort et une bascule
entre deux runs. Et **combler le trou signalé en août** : les interfaces de heartbeat
sont dans la sortie des mêmes commandes.

```json
{
  "hostname": "MON_FW_01",
  "mode": "active_passive",
  "cluster_name": "FW-CLUSTER-A",
  "members": [
    { "name": "MON_FW_01", "serial": "FGT1111", "role": "primary",   "state": "up",   "priority": 200 },
    { "name": "MON_FW_02", "serial": "FGT2222", "role": "secondary", "state": "up",   "priority": 100 }
  ],
  "heartbeat_interfaces": ["ha1", "ha2"],
  "extras": { "sync_status": "synchronized" }
}
```

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| `mode` | `active_passive \| active_active \| standalone \| other` | oui | |
| `members[].name` | hostname (clé devices) | oui | confirmé en août : match la table devices |
| `members[].role` | `primary \| secondary \| active \| standby \| member` | oui | |
| `members[].state` | `up \| down \| unknown` | oui | membre mort = `down` ou absent alors qu'il était listé au run précédent |
| `members[].serial` | chaîne | souhaité | recoupe `devices.serial_number` |
| `heartbeat_interfaces` | liste d'ifNames canoniques **locaux** | souhaité | le peering HA devient un câble documenté, plus une relation « logique » ; recoupé avec `interfaces` et, s'il existe, LLDP sur ces ports |

**Commandes** : FortiOS `get system ha status` (membres, rôles, serials) + `show system ha`
(hbdev) ; Gaia ClusterXL `cphaprob state` (membres, états) + `cphaprob -a if`
(interfaces `sync`) ; Cisco : sans objet pour les switches (vPC ≠ HA), `show failover`
pour un ASA si un jour il y en a.

**B1** : cartouche cluster ; contrôle membre mort ; événement de bascule entre deux runs ;
lien de heartbeat dessiné avec provenance `ha`.

**Contrat (2026-09-14)** : pas de `local_role` ni `local_state` dans le RunBundle. Le rôle et
l'état du device local se lisent dans `members`, où il doit figurer octet pour octet
(`ha_local_not_in_members`, refus) ; un device `standalone` se liste lui-même. Les deux champs
n'avaient aucun lecteur, et `local_state` mélangeait déjà l'état de membre (`up | down`) avec
l'état de synchronisation (`in_sync`), qui reste dans `extras`. Un membre listé deux fois est
refusé ; `standalone` liste exactement le device lui-même, rôle `member`. Voir
`contracts/README.md` § Décisions.

## 7. `interfaces_<id>` : le sous-ensemble strictement nécessaire au L1

Le modèle complet est dans la revue 01 §6. Pour dessiner un L1 il faut, dans l'ordre :
`name`, `type`, `description`, `admin_status`, `oper_status`, `oper_reason`,
`speed_mbps`, `duplex`, `mac_address`, `parent_interface`, `virtual_context` ; et
`members` seulement si le topic `aggregates` manque. Tout le reste (IP, VLAN, MTU,
compteurs, switchport, média) sert aux overlays et aux contrôles suivants, pas au tracé.

## 8. Le RunBundle que B0 assemble (contrat v1, esquisse)

```json
{
  "contract_version": "1.0",
  "run": { "collector_run_id": "…", "collection_name": "…", "start_datetime": "…", "end_datetime": "…", "status": "completed" },
  "infrastructure": "infra_01",
  "devices": [ "… table devices complète, telle que lue …" ],
  "tasks": [ "… collector_run_tasks filtrées sur l'infrastructure …" ],
  "interfaces": [ "…" ],
  "aggregates": [ "…" ],
  "lldp": [ "…" ],
  "cdp": [ "…" ],
  "system": [ "…" ],
  "ha": [ "…" ],
  "residual_normalizations": { "duplex_vendor_form": 0 }
}
```

Les tableaux sont exactement les documents des topics, sans transformation autre que la
normalisation résiduelle tracée. `arp`, `mac`, `bgp`, `vrfs` s'ajouteront comme des clés
supplémentaires sans toucher à B1.

## 9. Ce que j'attends en retour

Pour chaque topic de §2 à §6 : la sortie actuelle de la librairie sur un équipement
(comme vous l'avez fait pour interfaces et devices), pour que je marque l'écart champ par
champ. Les topics `system` et `aggregates` sont ceux qui débloquent le plus : le premier
donne le nom rapporté, le serial et les stacks, le second le contrôle phare du brief.
