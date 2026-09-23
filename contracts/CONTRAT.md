# Contrats Living Diagram — référence

> **Document généré** depuis les modèles du paquet `ld-contracts` par `ld-contracts docs --out`.
> Ne pas l'éditer à la main : modifier les modèles (descriptions comprises), régénérer, un test vérifie
> qu'il n'a pas dérivé. Deux contrats : la **partie A** décrit ce qui entre (le RunBundle produit par
> l'exportateur B0), la **partie B** ce qui sort (le Snapshot produit par la corrélation B1).

## Partie A — Entrée : RunBundle v1.0.0

Le RunBundle est ce que l'exportateur B0 produit et ce que Living Diagram ingère : une run, une
infrastructure, un document JSON validé. C'est la référence sur laquelle l'exportateur s'appuie pour fournir,
adapter ou challenger les données ; les documents `docs/01`, `02` et `04` sont l'historique du raisonnement.

### Le document RunBundle

Le document unique échangé entre l'exportateur B0 et Living Diagram : une run, une infrastructure.

Toute section de topic peut être vide : un bundle se construit progressivement (devices, run, tasks,
interfaces d'abord ; un topic de plus à chaque étape).

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `contract_version` | texte, motif `^\d+\.\d+\.\d+$` | oui | Version semver du contrat ; la version majeure doit être supportée. |
| `produced_at` | date-time ISO 8601 avec fuseau | oui | Date de production du bundle par l'exportateur, ISO 8601 avec fuseau. |
| `exporter_version` | texte non vide | oui | Version de l'exportateur B0 qui a produit le bundle. |
| `infrastructure` | texte non vide | oui | Infrastructure dessinée, écrite une seule fois : les documents de topic ne la répètent pas. Le périmètre est celui de `devices` au moment de l'export ; seule `devices` déborde sur d'autres infrastructures. |
| `run` | [RunInfo](#runinfo) | oui | La run amont dont les topics sont extraits. |
| `devices` | liste de [Device](#device) | oui | Table de référence **complète**, toutes infrastructures, telle que lue au moment de l'export. |
| `tasks` | liste de [DeviceTask](#devicetask) | oui | Statut de collecte par device et par topic, pour l'infrastructure. |
| `interfaces` | liste de [Interface](#interface) | oui | Topic `interfaces`, filtré sur l'infrastructure. |
| `aggregates` | liste de [Aggregate](#aggregate) | oui | Topic agrégats, filtré sur l'infrastructure. |
| `lldp` | liste de [LldpNeighbor](#lldpneighbor) | oui | Topic `lldp_neighbors`, filtré sur l'infrastructure. |
| `cdp` | liste de [CdpNeighbor](#cdpneighbor) | oui | Topic `cdp_neighbors`, filtré sur l'infrastructure. |
| `system` | liste de [SystemInfo](#systeminfo) | oui | Topic `system`, filtré sur l'infrastructure. |
| `ha` | liste de [HaStatus](#hastatus) | oui | Topic `ha`, filtré sur l'infrastructure. |
| `residual_normalizations` | objet clé → entier | non (défaut) | Compteur par règle de normalisation que B0 a dû appliquer faute de normalisation amont (`duplex_vendor_form`, `mac_dotted_to_colon`…). Doit tendre vers zéro. |

### Documents

#### RunInfo

La run de collecte amont dont le bundle est extrait (document `collector_runs`).

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `collector_run_id` | texte non vide | oui | Identifiant de la run amont. Avec `infrastructure`, clé d'idempotence de l'ingestion. |
| `collection_name` | texte \| null | non (null si absente) | Nom libre de la campagne de collecte, tel que saisi à son lancement ; null si absent. |
| `start_datetime` | date-time ISO 8601 avec fuseau | oui | Début de la run, ISO 8601 avec fuseau (UTC recommandé). |
| `end_datetime` | date-time ISO 8601 avec fuseau \| null | non (null si absente) | Fin de la run ; null si elle n'est pas terminée. B0 n'exporte que des runs terminées. |
| `status` | [RunStatus](#runstatus) | oui | État global de la run. |

#### Device

Un équipement de la table de référence `devices`.

Un document par châssis physique : un stack est un seul document. La table **complète**
(toutes infrastructures) est fournie dans le bundle : B1 y résout les voisins d'une autre
infrastructure (« externes connus ») et ne classe en stub que les noms qu'elle ignore.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Clé d'identité du device dans toutes les collections. C'est le nom configuré sur l'équipement, sans domaine DNS, et il est copié tel quel dans chaque document de topic. |
| `infrastructure` | texte non vide | oui | Infrastructure d'appartenance ; un device n'en a qu'une. |
| `site` | texte \| null | non (null si absente) | Site géographique, partition de placement ; null si inconnu. |
| `type` | [DeviceType](#devicetype) | oui | Nature du boîtier. Ce n'est pas le rôle topologique (spine, cœur, accès), qui est inféré par B5. |
| `vendor` | texte \| null | non (null si absente) | Constructeur en minuscules (`cisco`, `fortinet`, `checkpoint`) ; null si inconnu. |
| `model` | texte \| null | non (null si absente) | Référence matérielle (`N9K-C93180YC-FX`, `FGT-600F`) ; null si inconnue. |
| `os_name` | texte \| null | non (null si absente) | Nom de l'OS tel que fourni par l'inventaire, non normalisé, pour affichage seulement. Aucune règle de B1 ne s'appuie sur une famille d'OS : un nom d'interface distant est résolu par recherche dans les `interfaces[]` du device résolu, sinon sur évidence CDP / LLDP / `vendor` (R1 de docs/05). |
| `os_version` | texte \| null | non (null si absente) | Version d'OS selon l'inventaire ; null si inconnue. |
| `serial_number` | texte \| null | non (null si absente) | Serial du châssis (membre maître pour un stack) ; null si inconnu. Identité de secours, jamais clé de jointure. |
| `extras` | objet clé → libre | non (défaut) | Attributs libres de l'inventaire ; jamais lus par B1. |

#### DeviceTask

Statut de collecte d'un device pour la run (document `collector_run_tasks_<id>`).

Un topic **absent** de `status_per_subject` signifie « non supporté par la plateforme ou non
sélectionné pour cette run » : B1 n'attend alors aucune donnée de ce device pour ce topic et
n'émet aucun contrôle de réciprocité à son encontre (par exemple « lien vu d'un seul côté »).

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du device, identique octet pour octet à `devices[].hostname`. |
| `status` | [DeviceTaskStatus](#devicetaskstatus) | oui | Résultat global de la collecte sur ce device. |
| `status_per_subject` | objet clé → [SubjectStatus](#subjectstatus) | oui | Résultat par topic. Clé = nom du topic : `interfaces`, `aggregates`, `lldp`, `cdp`, `system`, `ha`, ou leurs alias amont (`lldp_neighbors`, `cdp_neighbors`, `system_info`, `port_channels`). Vide pour un device injoignable. |
| `error` | texte \| null | non (null si absente) | Erreur globale (connexion, authentification) ; null sinon. |

#### SubjectStatus

Résultat de la collecte d'un topic sur un device.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `status` | [TaskStatus](#taskstatus) | oui | Succès ou échec de la collecte de ce topic sur ce device. |
| `started_at` | date-time ISO 8601 avec fuseau \| null | non (null si absente) | Début de la collecte de ce topic sur ce device ; null si non horodaté. |
| `ended_at` | date-time ISO 8601 avec fuseau \| null | non (null si absente) | Fin de la collecte ; null si non horodaté. Tient lieu de `collected_at` aux documents du topic. |
| `error` | texte \| null | non (null si absente) | Message d'erreur brut du collecteur ; null si succès. Texte libre, nettoyé par l'anonymiseur. |

#### Interface

Une interface du topic `interfaces`, physique ou logique.

Sources typiques : `show interfaces` (IOS / IOS-XE), `show interface` (NX-OS), `get system interface`
et `get system interface physical` (FortiOS), `show interface <nom>` (Gaia). Un document par interface.
Pour dessiner un L1, B1 n'a besoin que de : `name`, `type`, `description`, `admin_status`, `oper_status`,
`oper_reason`, `speed_mbps`, `duplex`, `mac_address`, `parent_interface`, `virtual_context`.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du device, identique octet pour octet à `devices[].hostname`. |
| `name` | texte non vide | oui | Nom canonique de l'interface, identique dans tous les topics (`Ethernet1/1`, `port-channel10`, `x1`, `Vlan100`). Forme longue chez Cisco. |
| `description` | texte \| null | non (null si absente) | Description configurée, **brute**, jamais parsée par la collecte. Format attendu `criticité|device_voisin|port_voisin|options` ; null si vide. Le parseur vit dans B1. |
| `type` | [InterfaceType](#interfacetype) | oui | Nature de l'interface. `subinterface` a un parent ; `svi` n'en a pas. |
| `admin_status` | [AdminStatus](#adminstatus) | oui | État administratif configuré. |
| `oper_status` | [OperStatus](#operstatus) | oui | État opérationnel selon RFC 2863. `down` par défaut ; `not_present` seulement si un transceiver ou un module manque explicitement ; `unknown` si non lu ; `lower_layer_down` optionnel pour une sous-interface dont le parent est down (B1 sait le dériver). |
| `oper_reason` | texte \| null | non (null si absente) | Raison textuelle **brute** donnée par le vendeur (`notconnect`, `err-disabled`, `SFP not inserted`, `suspended by LACP`, `No operational members`…) ; null si `up` ou si le vendeur n'en donne pas. |
| `speed_mbps` | entier \| null | non (null si absente) | Vitesse **opérationnelle** en Mbit/s, entier ; null si down ou inconnue. |
| `configured_speed_mbps` | entier \| null | non (null si absente) | Vitesse configurée en Mbit/s ; null = auto ou non lue. |
| `auto_negotiate` | booléen \| null | non (null si absente) | Autonégociation active ; null si inconnu. |
| `duplex` | [Duplex](#duplex) \| null | non (null si absente) | Duplex opérationnel ; null si non applicable ou non lu. |
| `mtu` | entier \| null | non (null si absente) | MTU en octets ; null si non lu. |
| `mac_address` | texte, motif `^[0-9a-f]{2}(:[0-9a-f]{2}){5}$` \| null | non (null si absente) | MAC de l'interface, normalisée `aa:bb:cc:dd:ee:ff` minuscules ; null si absente. |
| `media` | texte \| null | non (null si absente) | Média ou transceiver (`10Gbase-SR`, `1000base-T`), chaîne brute ; null si inconnu. |
| `last_change_age_seconds` | entier ≥ 0 \| `never` \| null | non (null si absente) | Âge du dernier changement d'état opérationnel au moment de la collecte, en secondes (IF-MIB `ifLastChange`) ; `"never"` si l'état n'a pas changé depuis le dernier démarrage (RFC 2863 : `ifLastChange = 0`, état pris avant la dernière réinitialisation de l'agent ; NX-OS « Last link flapped: never ») ; null si non lu. Trois faits distincts : B1 lit `"never"` comme un âge ≥ `system.uptime_seconds`. Jamais de sentinelle numérique. Sert à détecter un flap entre deux runs. |
| `parent_interface` | texte non vide \| null | non (null si absente) | Pour une sous-interface : nom canonique du parent ; null si sans objet ou non lu. Jamais utilisé pour l'appartenance à un agrégat (voir `aggregates`). |
| `vlan_id` | entier ≥ 1 ≤ 4094 \| null | non (null si absente) | VLAN d'une sous-interface ou d'une SVI ; null si sans objet ou non lu. |
| `members` | liste de texte non vide | oui | Pour un agrégat sans topic `aggregates` : noms canoniques des membres configurés, sans état. Liste vide sinon. `aggregates` fait foi quand il existe. |
| `ip_addresses` | liste de [IpAddress](#ipaddress) | oui | Adresses portées ; liste vide si aucune. |
| `vrf` | texte non vide \| null | non (null si absente) | Instance de routage de l'interface, trois cas. `"default"` : la **table globale**, nom réservé du contrat, en minuscules exactes ; c'est le nom natif sur NX-OS, EOS et IOS-XR, et la librairie de collecte y traduit les autres plateformes (tableau sous « `null` et valeurs réservées »). Tout autre texte : le nom de la VRF tel que configuré, casse conservée (`PROD`, `management`, `Mgmt-vrf`, `10`). null : non lu, ou sans objet (un port commuté `access` / `trunk` n'est dans aucune table de routage) ; **null ne veut jamais dire table globale**. Chaîne vide refusée. Une valeur égale à `default` à la casse ou aux blancs près est acceptée (sur NX-OS, `Default` est une VRF utilisateur légitime), jamais normalisée, et signalée (`vrf_default_case`). B1 s'en sert comme clé `(hostname, vrf)` : la table globale est une instance comme les autres, sans cas particulier. |
| `virtual_context` | texte \| null | non (null si absente) | Partition virtuelle du châssis qui possède l'interface (VDOM, Virtual System VSX, VDC, context) ; null si le châssis n'est pas partitionné, ou si non lu : null ne distingue pas les deux (jeton réservé à décider avec la modélisation VSX). |
| `switchport_mode` | [SwitchportMode](#switchportmode) \| null | non (null si absente) | Mode L2 **configuré, résolu** : `access` ou `trunk` (port commuté), `routed` (`no switchport`, port L3), `none` (lu, mais aucun des trois ne s'applique : `dot1q-tunnel`, `fex-fabric`, `private-vlan`, interface non Ethernet ; le mode brut va dans `extras`) ; null si non lu. Port en négociation DTP : le résultat négocié quand le lien est up, le mode administratif quand il est down. Jamais « down » : un port down garde son mode et ses VLAN (IOS affiche « Operational Mode: down », c'est « Administrative Mode » qui compte). |
| `access_vlan` | entier ≥ 1 ≤ 4094 \| null | non (null si absente) | VLAN d'un port `access` ; null sinon. Un trunk ne le porte pas, même si l'équipement affiche une valeur configurée inactive (IOS / NX-OS « Access Mode VLAN ») : renseigné hors mode `access` (`null` compris), le document est refusé. B1 y lit le VLAN non tagué du port (en trunk : `native_vlan`), comparé à celui de l'autre bout du câble. |
| `native_vlan` | entier ≥ 1 ≤ 4094 \| null | non (null si absente) | VLAN natif d'un trunk ; null sinon (renseigné hors mode `trunk`, `null` compris, le document est refusé). |
| `allowed_vlans` | liste de [VlanRange](#vlanrange) \| null | non (null si absente) | VLAN autorisés sur un trunk : liste d'intervalles `{first, last}` d'entiers, VLAN unique = `first == last`, `all` = `[{"first": 1, "last": 4094}]`, `[]` = aucun (`switchport trunk allowed vlan none`) ; null sinon (renseigné hors mode `trunk`, `null` compris, le document est refusé). Ni ordre ni fusion des adjacents imposés au producteur (B1 canonise, R6) ; doublons et chevauchements refusés. |
| `counters` | [Counters](#counters) \| null | non (null si absente) | Compteurs d'erreurs ; null si non collectés. |
| `extras` | objet clé → libre | non (défaut) | Détail brut vendeur (`bia`, `bandwidth`, `encapsulation`…) ; jamais lu par B1. |

#### IpAddress

Une adresse IP portée par une interface.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `address` | texte | oui | Adresse sans masque, en texte : IPv4 pointée ou IPv6. |
| `prefix` | entier | oui | Longueur de préfixe : 0 à 32 en IPv4, 0 à 128 en IPv6. |
| `family` | `4` \| `6` | oui | Famille, cohérente avec `address`. |
| `role` | [IpRole](#iprole) | oui | `primary`, `secondary`, ou `virtual` pour une VIP VRRP / HSRP. |

#### VlanRange

Un intervalle de VLAN autorisés sur un trunk, bornes incluses ; VLAN unique = `first == last`.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `first` | entier ≥ 1 ≤ 4094 | oui | Premier VLAN de l'intervalle, inclus. |
| `last` | entier ≥ 1 ≤ 4094 | oui | Dernier VLAN de l'intervalle, inclus ; égal à `first` pour un VLAN unique. |

#### Counters

Compteurs d'erreurs au moment de la collecte, cumulés depuis le dernier reset ; null par champ si non lu.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `in_errors` | entier \| null | non (null si absente) | Erreurs en entrée. |
| `out_errors` | entier \| null | non (null si absente) | Erreurs en sortie. |
| `crc` | entier \| null | non (null si absente) | Erreurs CRC en entrée ; leur hausse entre deux runs signale un câble ou un transceiver dégradé. |
| `in_discards` | entier \| null | non (null si absente) | Rejets en entrée. |
| `out_discards` | entier \| null | non (null si absente) | Rejets en sortie. |

#### Aggregate

Un agrégat (Port-channel, bond, aggregate) et l'état de chacun de ses membres.

Sources typiques : `show port-channel summary` + `show vpc` (NX-OS), `show etherchannel summary` (IOS),
`diagnose netlink aggregate name <nom>` (FortiOS), `show bonding group <id>` (Gaia). Un document par agrégat.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du device, identique octet pour octet à `devices[].hostname`. |
| `name` | texte non vide | oui | Nom canonique de l'agrégat, identique à `interfaces[].name`. |
| `oper_status` | [LinkStatus](#linkstatus) | oui | État opérationnel de l'agrégat. |
| `protocol` | [AggregationProtocol](#aggregationprotocol) | oui | Protocole d'agrégation. Statique d'un côté et LACP de l'autre : contrôle. |
| `lacp_mode` | [LacpMode](#lacpmode) \| null | non (null si absente) | Mode LACP ; null si non LACP ou non lu. |
| `min_links` | entier \| null | non (null si absente) | Nombre minimal de membres actifs configuré ; null si non configuré ou non lu. |
| `members` | liste de [AggregateMember](#aggregatemember) | oui | Membres configurés avec leur état effectif. |
| `mlag_id` | entier \| null | non (null si absente) | Identifiant vPC / MLAG / MC-LAG ; null si l'agrégat n'en fait pas partie, ou si non lu. |
| `mlag_peer_link` | booléen | oui | true si l'agrégat est le peer-link du MLAG. |
| `extras` | objet clé → libre | non (défaut) | Détail brut vendeur (drapeaux, cohérence vPC…) ; jamais lu par B1. |

#### AggregateMember

Un membre d'agrégat et son état effectif.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `name` | texte non vide | oui | Nom canonique du membre, identique à `interfaces[].name`. |
| `status` | [MemberStatus](#memberstatus) | oui | État effectif. `bundled` = trafic agrégé (P Cisco, collecting + distributing LACP) ; `suspended` (s) ; `standby` (H) ; `individual` (I) ; `down` (D, module retiré) ; `not_in_use` (M / w : min-links non atteint). |

#### LldpNeighbor

Un voisin vu par LLDP sur un port local (`show lldp neighbors detail`).

Un document par (port local, voisin vu). Les identifiants **distants** restent bruts : B1 les
normalise. Les identifiants **locaux** sont canoniques.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du device local, identique octet pour octet à `devices[].hostname`. |
| `local_interface` | texte non vide | oui | Port local, nom canonique identique à `interfaces[].name`. |
| `neighbor` | texte non vide | oui | System-name annoncé par le voisin, **domaine DNS retiré**, sans autre normalisation. Peut être inconnu de `devices` (stub) ; peut être une MAC (normalisée) ou une IP si le voisin n'annonce pas de nom. |
| `neighbor_interface` | texte non vide | oui | Port-id annoncé, **brut** : forme courte sur IOS (`Gi1/0/1`), longue sur NX-OS. Si le voisin annonce une MAC, elle est normalisée (`aa:bb:cc:dd:ee:ff`) : B1 la reconnaît à sa forme et la joint à `interfaces[].mac_address`. Seules trois notations sont reconnues comme MAC (`aa:bb:…`, `aa-bb-…`, `aabb.ccdd.eeff`) et refusées si non normalisées ; douze chiffres hexadécimaux sans séparateur restent un nom. |
| `neighbor_capabilities` | liste de texte, motif `^[a-z0-9_]+$` | oui | Capacités annoncées, jetons en minuscules `[a-z0-9_]` (`bridge`, `router`, `station`, `wlan_access_point`, `telephone`…). Seule information sur la nature d'un voisin non collecté. |
| `extras` | objet clé → libre | non (défaut) | Détail brut vendeur ; jamais lu par B1. |

#### CdpNeighbor

Un voisin vu par CDP (Cisco, `show cdp neighbors detail`). Un document par (port local, voisin).

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du device local, identique octet pour octet à `devices[].hostname`. |
| `local_interface` | texte non vide | oui | Port local, nom canonique identique à `interfaces[].name`. |
| `neighbor` | texte non vide | oui | Device-id annoncé, **domaine DNS retiré** et serial retiré (`HOSTNAME(SERIAL)` sur Nexus donne `HOSTNAME`). |
| `neighbor_interface` | texte non vide | oui | Port distant annoncé, brut (forme longue chez Cisco). |
| `neighbor_capabilities` | liste de texte, motif `^[a-z0-9_]+$` | oui | Capacités annoncées, jetons en minuscules `[a-z0-9_]` (`switch`, `router`, `igmp`…). |
| `extras` | objet clé → libre | non (défaut) | Détail brut vendeur ; jamais lu par B1. |

#### SystemInfo

Ce que l'équipement dit de lui-même (topic `system`).

Sources typiques : `show version`, `show switch`, `show inventory` (Cisco) ; `get system status`
(FortiOS) ; `show version all`, `show asset all`, `vsx stat -v` (Gaia). Un document par device.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du device, identique octet pour octet à `devices[].hostname`. |
| `reported_hostname` | texte \| null | non (null si absente) | Nom que l'équipement affiche de lui-même (prompt, `show hostname`), tel quel ; null si non lu. Un écart avec `hostname` (hors casse) est un constat, jamais une correction. |
| `vendor` | texte \| null | non (null si absente) | Constructeur selon l'équipement ; null si non lu. |
| `model` | texte \| null | non (null si absente) | Référence matérielle selon l'équipement ; null si non lue. |
| `os_version` | texte \| null | non (null si absente) | Version d'OS selon l'équipement ; null si non lue. |
| `serial_number` | texte \| null | non (null si absente) | Serial du châssis selon l'équipement ; null si non lu. |
| `uptime_seconds` | entier \| null | non (null si absente) | Temps écoulé depuis le dernier redémarrage, en secondes ; null si non lu. Un reboot entre deux runs est un événement. |
| `chassis_members` | liste de [ChassisMember](#chassismember) | oui | Membres d'un stack, un par châssis ; liste vide pour un standalone. Source du badge ×N. |
| `virtual_contexts` | liste de texte | oui | Contextes virtuels hébergés (Virtual Systems VSX, VDOM…) ; liste vide sinon. |
| `extras` | objet clé → libre | non (défaut) | Détail brut vendeur ; jamais lu par B1. |

#### ChassisMember

Un châssis membre d'un stack (topic system, `show switch` / `show version`).

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `slot` | entier | oui | Numéro de membre dans le stack (switch number). |
| `serial` | texte \| null | non (null si absente) | Serial du membre ; null si non lu. |
| `model` | texte \| null | non (null si absente) | Référence matérielle du membre ; null si non lue. |
| `role` | [ChassisRole](#chassisrole) | oui | Rôle du membre dans le stack. |
| `state` | [ChassisState](#chassisstate) | oui | État du membre. `removed` ou `provisioned` = membre attendu mais absent. |
| `priority` | entier \| null | non (null si absente) | Priorité d'élection ; null si non lue. |

#### HaStatus

État de haute disponibilité vu depuis un membre (topic `ha`).

Sources typiques : `get system ha status` + `show system ha` (FortiOS) ; `cphaprob state` + `cphaprob -a if`
(Gaia ClusterXL). Un document par device membre d'un cluster.

Le rôle et l'état du device local se lisent dans `members`, où il figure obligatoirement : pas de champ à
part (2026-09-14). Un device sans HA peut ne pas émettre de document ; s'il en émet un, il est `standalone`
et se liste seul.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du device local, identique octet pour octet à `devices[].hostname`. |
| `mode` | [HaMode](#hamode) | oui | Mode du cluster. |
| `cluster_name` | texte \| null | non (null si absente) | Nom ou identifiant de groupe du cluster ; null si absent. |
| `members` | liste de [HaMember](#hamember) | oui | Tous les membres du cluster, device local compris : `hostname` figure dans `members[].name`, octet pour octet et une seule fois, sinon le document est refusé. `standalone` : exactement un membre, le device lui-même, `role = member` (`state = up` s'il répond). |
| `heartbeat_interfaces` | liste de texte non vide | oui | Interfaces locales dédiées au heartbeat ou à la synchronisation, noms canoniques ; liste vide si non lu. Rend le peering HA dessinable comme un lien documenté. |
| `extras` | objet clé → libre | non (défaut) | Détail brut vendeur (état de synchronisation…) ; jamais lu par B1. |

#### HaMember

Un membre du cluster tel que vu depuis le device local.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `name` | texte non vide | oui | Hostname du membre, clé de `devices` (les membres sont des devices). |
| `serial` | texte \| null | non (null si absente) | Serial du membre ; null si non lu. Recoupe `devices[].serial_number`. |
| `role` | [HaRole](#harole) | oui | Rôle du membre dans le cluster ; celui du device local se lit ici. |
| `state` | [HaState](#hastate) | oui | État du membre, celui du device local compris. `down`, ou absent alors qu'il était listé au run précédent : membre mort. |
| `priority` | entier \| null | non (null si absente) | Priorité HA ; null si non lue. |

### Énumérations

#### AdminStatus

`up` \| `down`

#### AggregationProtocol

`lacp` \| `static` \| `pagp`

#### ChassisRole

`active` \| `standby` \| `member` \| `master`

#### ChassisState

`ready` \| `removed` \| `provisioned` \| `version_mismatch`

#### DeviceTaskStatus

`success` \| `partial` \| `failed` \| `unreachable`

#### DeviceType

`switch` \| `router` \| `firewall` \| `load_balancer` \| `wireless_controller` \| `server` \| `other`

#### Duplex

`full` \| `half` \| `unknown`

#### HaMode

`active_passive` \| `active_active` \| `standalone` \| `other`

#### HaRole

`primary` \| `secondary` \| `active` \| `standby` \| `member`

#### HaState

`up` \| `down` \| `unknown`

#### InterfaceType

`physical` \| `aggregate` \| `subinterface` \| `svi` \| `loopback` \| `tunnel` \| `management` \| `other`

#### IpRole

`primary` \| `secondary` \| `virtual`

#### LacpMode

`active` \| `passive`

#### LinkStatus

`up` \| `down`

#### MemberStatus

`bundled` \| `suspended` \| `standby` \| `individual` \| `down` \| `not_in_use`

#### OperStatus

`up` \| `down` \| `testing` \| `unknown` \| `dormant` \| `not_present` \| `lower_layer_down`

#### RunStatus

`completed` \| `partial` \| `failed` \| `running`

#### SwitchportMode

`access` \| `trunk` \| `routed` \| `none`

#### TaskStatus

`success` \| `failed`

### Règles transverses

Vérifiées par le validateur, au-delà des types de chaque champ :

- `null` n'affirme jamais un fait : il veut dire « pas de valeur » (non lu, sans objet, non fourni). Un fait
  s'écrit avec une valeur (`"never"`, `"default"`, `[]`, `none` : voir « `null` et valeurs réservées ») ;
- un champ nullable absent est lu comme `null` et **compté** (constat `nullable_key_absent`, un par champ) ;
  le défaut n'est jamais une valeur. Tout autre champ est requis. La forme canonique, celle qui est archivée,
  écrit toutes les clés : clé absente et `null` explicite donnent le même bundle ;
- un champ inconnu au premier niveau est refusé (une faute de frappe ne devient donc jamais un `null`), `extras`
  est le seul endroit libre ;
- types stricts : un entier en chaîne, une MAC non normalisée, une date sans fuseau ou en nombre sont refusés ;
- `hostname` identique octet pour octet à `devices[].hostname` dans toutes les sections ; deux hostnames ne
  différant que par la casse sont un doublon ;
- identités uniques : `(hostname, name)` pour `interfaces` et `aggregates`, `(hostname, local_interface,
  neighbor, neighbor_interface)` pour `lldp` et `cdp`, un document par hostname pour `tasks`, `system`, `ha` ;
- le périmètre est un fait du bundle, écrit une fois : aucun document de topic ne porte `infrastructure` ;
  chacun vise un device qui, selon `devices` (lue au moment de l'export), appartient à l'infrastructure du
  bundle. Seule `devices` couvre d'autres infrastructures. `infrastructure` se compare octet pour octet,
  comme `hostname` ;
- un document `ha` liste son propre device dans `members`, octet pour octet et une seule fois : le rôle et
  l'état du device local s'y lisent, il n'y a pas de champ à part. `standalone` : exactement un membre,
  le device lui-même, rôle `member`.

#### `null` et valeurs réservées

`null` n'affirme jamais un fait : il veut dire « pas de valeur » (non lu, sans objet, non fourni). Quand l'absence
de quelque chose est elle-même un fait, le contrat lui donne une valeur. B1 ne tire aucune conclusion d'un `null`.

| Champ | Valeur | Ce qu'elle affirme | Ce que `null` veut dire |
|---|---|---|---|
| `interfaces[].vrf` | `"default"` | l'interface est dans la table de routage globale | non lu, ou sans objet (port commuté) |
| `interfaces[].last_change_age_seconds` | `"never"` | aucun changement d'état depuis le dernier démarrage | non lu |
| `interfaces[].switchport_mode` | `none` | mode lu, aucun de `access` / `trunk` / `routed` ne s'applique | non lu |
| `interfaces[].allowed_vlans` | `[]` | aucun VLAN autorisé | non lu |
| `interfaces[].allowed_vlans` | `[{"first": 1, "last": 4094}]` | tous les VLAN (`all`) | non lu |

**`vrf` : ce que le producteur écrit, par plateforme.** La traduction vers `"default"` est une normalisation de
valeur : elle se fait dans la librairie de collecte, pas dans B0.

| Plateforme | La table globale sur l'équipement | Valeur dans le bundle |
|---|---|---|
| NX-OS, EOS, IOS-XR | VRF `default`, nom natif et réservé | `"default"` |
| IOS, IOS-XE | pas de nom : interface L3 sans `vrf forwarding` | `"default"` |
| Junos | instance de routage `master` | `"default"` |
| FortiOS | vrf `0` | `"default"` ; les autres identifiants en texte (`"10"`) |
| Checkpoint Gaia | une seule table (le VSX relève de `virtual_context`) | `"default"` |
| toutes | VRF nommée (`PROD`, `management`, `Mgmt-vrf`) | le nom tel que configuré, casse conservée |
| toutes | port commuté `access` / `trunk` : aucune table de routage | `null` |
| toutes | instance non lue | `null` |

**Quand écrire `"default"`.** Quand la table globale est un fait établi, de l'une de ces deux façons : la commande
est bornée à la table globale par construction (`show ip route` sans `vrf`) ; ou l'appartenance aux VRF a été lue et
l'interface L3 n'est dans aucune VRF nommée (NX-OS : `show vrf interface` répond `default` ; IOS-XE : `show vrf` lu,
interface absente de toutes les VRF). Une commande muette sur la VRF (`show interfaces`, `show ip interface brief`)
ne prouve rien : `null`. Sinon l'interface de management (`management` sur NX-OS, `Mgmt-vrf` sur IOS-XE) serait
déclarée dans la table globale : un fait faux, pire qu'un `null`. Si l'appartenance aux VRF n'a pas été collectée,
`null` partout.

Le nom réservé s'écrit en minuscules exactes. `Default`, `DEFAULT` ou ` default` sont acceptés tels quels (les noms
de VRF sont sensibles à la casse : sur NX-OS, `Default` est une VRF utilisateur distincte), jamais normalisés, et
signalés par le constat `vrf_default_case`. Une chaîne vide est refusée. L'anonymiseur conserve `default` et
pseudonymise les autres noms. **Collision assumée** : une plateforme qui autoriserait une VRF utilisateur nommée
exactement `default`, distincte de la table globale, ne peut pas l'exprimer ; à signaler si le cas se présente.

#### Erreurs de contrat (bloquantes)

| Type | Signification |
|---|---|
| `duplicate_identity` | deux documents portent la même identité dans une section (hostnames comparés sans la casse) |
| `hostname_not_in_devices` | un document de topic cite un hostname absent de `devices` |
| `hostname_outside_infrastructure` | le device visé par un document de topic est d'une autre infrastructure |
| `contract_major_unsupported` | la version majeure de `contract_version` n'est pas celle du validateur |
| `datetime_numeric` | une date est donnée en nombre (epoch) au lieu d'ISO 8601 avec fuseau |
| `ip_invalid` | une adresse IP n'est pas analysable |
| `ip_family_mismatch` | `family` ne correspond pas à la version de l'adresse |
| `ip_prefix_out_of_range` | `prefix` hors plage pour la version de l'adresse |
| `mac_not_normalized` | un nom ou un port de voisin en forme de MAC n'est pas au format `aa:bb:cc:dd:ee:ff` |
| `ha_local_not_in_members` | un document `ha` ne liste pas son propre device dans `members` |
| `ha_member_duplicate` | un document `ha` liste un même membre plusieurs fois |
| `member_in_several_aggregates` | un port est membre de plusieurs agrégats du même device (`aggregates[].members` ou `interfaces[].members`) |
| `chassis_member_slot_duplicate` | deux `chassis_members` d'un document `system` portent le même `slot` |
| `ha_standalone_not_alone` | un document `ha` en mode `standalone` ne liste pas exactement lui-même, rôle `member` |
| `access_vlan_outside_access_mode` | une interface porte un `access_vlan` alors que `switchport_mode` n'est pas `access` |
| `vlan_range_inverted` | un intervalle d'`allowed_vlans` a `first` supérieur à `last` |
| `vlan_ranges_overlap` | deux intervalles d'`allowed_vlans` se recouvrent ou sont en double |
| `trunk_vlans_outside_trunk_mode` | une interface porte `native_vlan` ou `allowed_vlans` alors que `switchport_mode` n'est pas `trunk` |
| `extra_forbidden` | un champ inconnu est présent au premier niveau d'un document (utiliser `extras`) |

Les messages ne contiennent jamais de valeur ; les valeurs sont dans le détail, affiché avec `--show-values`.

#### Constats (non bloquants, remontés à B1)

| Code | Signification |
|---|---|
| `nullable_key_absent` | un champ nullable est absent du bundle et a été lu comme `null` ; un constat par champ, avec le nombre d'occurrences et de devices. Doit tendre vers zéro, comme `residual_normalizations` |
| `parent_interface_unknown` | le parent d'une sous-interface n'existe pas dans les interfaces du device |
| `interface_member_unknown` | un membre listé dans `interfaces[].members` n'existe pas |
| `aggregate_interface_unknown` | un agrégat n'a pas d'interface du même nom |
| `aggregate_member_unknown` | un membre d'agrégat n'existe pas dans les interfaces du device |
| `local_interface_unknown` | un voisin LLDP / CDP cite un port local absent des interfaces |
| `ha_member_unknown` | un membre HA n'est pas dans `devices` |
| `heartbeat_interface_unknown` | une interface de heartbeat n'existe pas dans les interfaces du device |
| `vrf_default_case` | un `vrf` vaut `default` à la casse ou aux blancs près : VRF utilisateur légitime, ou table globale mal écrite |
| `reported_hostname_differs` | le nom rapporté par l'équipement diffère du hostname (hors casse) |
| `device_without_task` | un device de l'infrastructure n'a pas de statut de collecte |
| `documents_without_task` | des documents d'un topic existent sans statut de collecte pour ce topic |

### Exemple : le plus petit bundle valide

`fixtures/bundle-skeleton.json`, à copier comme point de départ :

```json
{
  "contract_version": "1.0.0",
  "produced_at": "2026-09-10T02:20:11Z",
  "exporter_version": "0.1.0",
  "infrastructure": "infra_01",
  "run": {
    "collector_run_id": "66db3f0e9a1c2b0012f4a7d1",
    "collection_name": "infra_01 nightly",
    "start_datetime": "2026-09-10T02:00:00Z",
    "end_datetime": "2026-09-10T02:14:32Z",
    "status": "completed"
  },
  "devices": [
    {
      "hostname": "MON_SWITCH",
      "infrastructure": "infra_01",
      "site": "new-york",
      "type": "switch",
      "vendor": "cisco",
      "model": "N9K-C93180",
      "os_name": "nxos",
      "os_version": "10.4.2",
      "serial_number": "XXXXXXXXXX",
      "extras": {}
    }
  ],
  "tasks": [
    {
      "hostname": "MON_SWITCH",
      "status": "success",
      "status_per_subject": {
        "interfaces": {
          "status": "success",
          "started_at": "2026-09-10T02:03:10Z",
          "ended_at": "2026-09-10T02:03:41Z",
          "error": null
        }
      },
      "error": null
    }
  ],
  "interfaces": [
    {
      "hostname": "MON_SWITCH",
      "name": "Ethernet1/1",
      "description": "CRITICAL|TODEVICE|TO_INTERFACE",
      "type": "physical",
      "admin_status": "up",
      "oper_status": "up",
      "oper_reason": null,
      "speed_mbps": 10000,
      "configured_speed_mbps": null,
      "auto_negotiate": null,
      "duplex": "full",
      "mtu": 9000,
      "mac_address": "aa:aa:bb:bb:cc:cc",
      "media": "10G",
      "last_change_age_seconds": 8121600,
      "parent_interface": null,
      "vlan_id": null,
      "members": [],
      "ip_addresses": [
        {
          "address": "4.4.4.4",
          "prefix": 31,
          "family": 4,
          "role": "primary"
        }
      ],
      "vrf": "default",
      "virtual_context": null,
      "switchport_mode": "routed",
      "access_vlan": null,
      "native_vlan": null,
      "allowed_vlans": null,
      "counters": null,
      "extras": {
        "hardware_type": "10/100/1000/25000 Ethernet",
        "bia": "aaaa.bbbb.cccc",
        "bandwidth": "10000000 Kbit"
      }
    }
  ],
  "aggregates": [],
  "lldp": [],
  "cdp": [],
  "system": [],
  "ha": [],
  "residual_normalizations": {}
}
```

Le bundle de référence complet (deux Nexus en vPC, cluster Fortinet, voisin externe, stub, désaccord
description / LLDP) est `fixtures/bundle-minimal.json`. Le JSON Schema équivalent est
`src/ld_contracts/schema/runbundle-v1.schema.json`.

## Partie B — Sortie : Snapshot v1.0.0

Le snapshot est le graphe d'une run : ce que B1 produit à partir d'un RunBundle, ce que l'archive (B2)
range, ce que le diff (B3) compare, ce que l'API sert et ce que le moteur de diagramme dessine. Tout ce qu'il
contient vient du bundle ou d'une règle déterministe : aucun horodatage propre à B1, aucun identifiant
synthétique, aucune coordonnée. Sa version suit son propre semver, indépendant de celui du RunBundle.

### Le document Snapshot

Le graphe d'une run : nœuds, interfaces, arêtes typées, structures, contrôles, couverture, rapport.

Tout vient du bundle ou d'une règle déterministe de B1 : aucun horodatage propre, aucun identifiant
synthétique, aucune coordonnée. Même bundle ⇒ même snapshot, à l'octet (`canonical_json`).

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `snapshot_version` | texte, motif `^\d+\.\d+\.\d+$` | oui | Version semver du contrat Snapshot, indépendante de celle du RunBundle. |
| `source` | [Source](#source) | oui | Le bundle d'origine. |
| `nodes` | liste de [Node](#node) | oui | Nœuds, triés par (sorte, hostname) ; hostname unique sans la casse. |
| `interfaces` | liste de [SnapshotInterface](#snapshotinterface) | oui | Interfaces, triées par (hostname, nom naturel). |
| `links` | liste de [Link](#link) | oui | Arêtes, triées par paire d'endpoints. |
| `aggregates` | liste de [SnapshotAggregate](#snapshotaggregate) | oui | Agrégats, triés par (hostname, nom naturel). |
| `mlag_domains` | liste de [MlagDomain](#mlagdomain) | oui | Domaines MLAG, triés par (mlag_id, membres). |
| `ha_clusters` | liste de [HaCluster](#hacluster) | oui | Clusters HA, triés par membres. |
| `checks` | liste de [Check](#check) | oui | Contrôles, triés par (code, références, détails). |
| `coverage` | liste de [Coverage](#coverage) | oui | Un élément par nœud `device`, triés par hostname. |
| `report` | [Report](#report) | oui | Comptes et normalisations. |

### Documents

#### Source

D'où vient le snapshot : le bundle, identifié par son empreinte. Aucun horodatage propre à B1.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `infrastructure` | texte non vide | oui | Infrastructure dessinée. |
| `collector_run_id` | texte non vide | oui | Run amont. |
| `bundle_sha256` | texte, motif `^[0-9a-f]{64}$` | oui | Empreinte SHA-256 du bundle archivé (hexadécimal minuscule). |
| `contract_version` | texte, motif `^\d+\.\d+\.\d+$` | oui | Version du contrat RunBundle du bundle. |
| `produced_at` | date-time ISO 8601 avec fuseau | oui | `produced_at` du bundle. |
| `exporter_version` | texte non vide | oui | `exporter_version` du bundle. |
| `run` | [RunSummary](#runsummary) | oui | Début, fin et statut de la run. |

#### RunSummary

La run amont, telle que le bundle la décrit.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `start_datetime` | date-time ISO 8601 avec fuseau | oui | Début de la run. |
| `end_datetime` | date-time ISO 8601 avec fuseau \| null | oui | Fin de la run ; null si absente. |
| `status` | [RunStatus](#runstatus) | oui | État global de la run. |

#### Node

Un nœud du graphe. `device` : en périmètre, décrit par `devices` et `system` ; `external` : présent dans
`devices` mais d'une autre infrastructure, matérialisé parce qu'un voisin le cite ; `stub` : cité par une
évidence, inconnu de `devices`. Les stubs restent dans le snapshot, la vue décide de les montrer.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `kind` | [NodeKind](#nodekind) | oui | Sorte de nœud ; conditionne les champs admis. `device` : `collection` renseigné, `evidence` null, `type` renseigné. `external` : `evidence` renseigné, `collection` null, `type` renseigné, rien de `system` (`reported_hostname`, `uptime_seconds`, `stack` null, `virtual_contexts` vide). `stub` : `evidence` renseigné, tout le reste null ou vide, `hostname` en `casefold`. |
| `hostname` | texte non vide | oui | Clé, unique toutes sortes confondues (comparée sans la casse). Pour un stub : le nom annoncé, après `casefold`. |
| `type` | [DeviceType](#devicetype) \| null | oui | De `devices` ; null pour un stub, requis sinon. |
| `vendor` | texte \| null | oui | De `devices` ; null pour un stub ou si inconnu. |
| `model` | texte \| null | oui | De `devices` ; null pour un stub ou si inconnu. |
| `site` | texte \| null | oui | De `devices` ; null pour un stub ou si inconnu. |
| `os_name` | texte \| null | oui | De `devices`, chaîne d'affichage ; null pour un stub ou si inconnu. |
| `os_version` | texte \| null | oui | De `devices` ; null pour un stub ou si inconnue. |
| `serial_number` | texte \| null | oui | De `devices` ; null pour un stub ou si inconnu. |
| `reported_hostname` | texte \| null | oui | De `system[]` ; null si non collecté. |
| `uptime_seconds` | entier \| null | oui | De `system[]` ; null si non collecté. |
| `virtual_contexts` | liste de texte | oui | De `system[]`, triés, sans doublon ; vide sinon. |
| `stack` | [Stack](#stack) \| null | oui | Depuis `system[].chassis_members` ; null si standalone ou non collecté. |
| `collection` | [CollectionStatus](#collectionstatus) \| null | oui | Statut de collecte, pour un `device` seulement (`not_collected` = en périmètre sans task). |
| `evidence` | [NodeEvidence](#nodeevidence) \| null | oui | Témoignages, pour `external` et `stub` seulement. |

#### Stack

Le stack d'un nœud : source du badge ×N.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `member_count` | entier ≥ 1 | oui | Nombre de membres, égal à la taille de `members`. |
| `members` | liste de [StackMember](#stackmember) (au moins 1) | oui | Membres triés par `slot`. |

#### StackMember

Un châssis membre d'un stack, recopié de `system[].chassis_members` ; toutes les clés écrites.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `slot` | entier | oui | Numéro de membre dans le stack. |
| `serial` | texte \| null | oui | Serial du membre ; null si non lu. |
| `model` | texte \| null | oui | Référence matérielle du membre ; null si non lue. |
| `role` | [ChassisRole](#chassisrole) | oui | Rôle du membre dans le stack. |
| `state` | [ChassisState](#chassisstate) | oui | État du membre. |
| `priority` | entier \| null | oui | Priorité d'élection ; null si non lue. |

#### NodeEvidence

Ce que les voisins disent d'un nœud `external` ou `stub` : la seule information disponible sur lui.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `seen_by` | liste de [SeenBy](#seenby) | oui | Témoignages, triés par (hostname, port, source). |
| `capabilities` | liste de texte, motif `^[a-z0-9_]+$` | oui | Union des capacités annoncées (`bridge`, `router`, `station`…), triée, sans doublon. |

#### SeenBy

Un témoignage sur un nœud non collecté : qui l'a vu, sur quel port, par quelle source.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Device qui a vu le nœud. |
| `interface` | texte non vide | oui | Port local du témoin. |
| `source` | [EvidenceSource](#evidencesource) | oui | Source du témoignage. |

#### SnapshotInterface

Une interface, clé `(hostname, name)`. Les champs recopiés gardent le sens du RunBundle ; `null` y veut
dire « pas de valeur ». Aucun `extras`, aucun compteur : le snapshot dessine, il n'audite pas.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du nœud, clé de `nodes[]`. |
| `name` | texte non vide | oui | Nom canonique. |
| `description` | texte \| null | oui | Description brute, conservée telle quelle ; null si vide. |
| `description_parsed` | [ParsedDescription](#parseddescription) \| null | oui | Description lue par R2 ; null si non parsable. |
| `type` | [InterfaceType](#interfacetype) | oui | Nature de l'interface. |
| `admin_status` | [AdminStatus](#adminstatus) | oui | État administratif. |
| `oper_status` | [OperStatus](#operstatus) | oui | État opérationnel (RFC 2863). |
| `oper_reason` | texte \| null | oui | Raison vendeur brute ; null si `up` ou non donnée. |
| `speed_mbps` | entier \| null | oui | Vitesse opérationnelle en Mbit/s ; null si down ou inconnue. |
| `duplex` | [Duplex](#duplex) \| null | oui | Duplex opérationnel ; null si sans objet ou non lu. |
| `mac_address` | texte, motif `^[0-9a-f]{2}(:[0-9a-f]{2}){5}$` \| null | oui | MAC normalisée ; null si absente. |
| `media` | texte \| null | oui | Média ou transceiver, brut ; null si inconnu. |
| `parent_interface` | texte non vide \| null | oui | Parent d'une sous-interface ; null sinon. |
| `virtual_context` | texte \| null | oui | Partition virtuelle propriétaire ; null si aucune ou non lue. |
| `last_change_age_seconds` | entier ≥ 0 \| `never` \| null | oui | Âge du dernier changement d'état ; `"never"` = aucun depuis le démarrage ; null si non lu. |
| `vlan_id` | entier ≥ 1 ≤ 4094 \| null | oui | VLAN d'une sous-interface ou d'une SVI ; null sinon. |
| `switchport_mode` | [SwitchportMode](#switchportmode) \| null | oui | Mode L2 configuré résolu ; null si non lu. |
| `access_vlan` | entier ≥ 1 ≤ 4094 \| null | oui | VLAN d'un port `access` ; null sinon. |
| `native_vlan` | entier ≥ 1 ≤ 4094 \| null | oui | VLAN natif d'un trunk ; null sinon. |
| `allowed_vlans` | liste de [VlanRange](#vlanrange) \| null | oui | VLAN autorisés sur un trunk, forme canonique (R6) : intervalles triés par `first`, disjoints, adjacents fusionnés ; `[]` = aucun ; null si sans objet ou non lu. |
| `ip_addresses` | liste de [IpAddress](#ipaddress) | oui | Adresses portées, triées par (famille, adresse, préfixe). |
| `vrf` | texte non vide \| null | oui | `"default"` = table globale ; autre = VRF nommée ; null = non lu ou sans objet. |
| `aggregate` | [AggregateMembership](#aggregatemembership) \| null | oui | Agrégat dont l'interface est membre ; null sinon. |
| `roles` | liste de [InterfaceRole](#interfacerole) | oui | Rôles déduits par B1, triés, sans doublon ; vide sinon. |

#### ParsedDescription

La description `criticité|voisin|port|options` lue par B1 (R2) ; absente si non parsable.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `criticality` | texte \| null | oui | Champ 1, tel quel (vocabulaire non figé) ; null si vide. |
| `neighbor` | texte non vide | oui | Champ 2 : nom du voisin documenté, brut. |
| `port` | texte \| null | oui | Champ 3 : port du voisin, brut ; null si absent. |
| `options` | texte \| null | oui | Champ 4 : options, brutes ; null si absentes. |

#### AggregateMembership

Appartenance d'une interface à un agrégat.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `name` | texte non vide | oui | Nom canonique de l'agrégat sur le même device. |
| `member_status` | [MemberStatus](#memberstatus) \| null | oui | État effectif selon `aggregates[]` ; null si l'appartenance vient de `interfaces[].members`. |

#### Link

Une arête. V1 : `cable` seulement ; les autres sortes sont réservées aux vues L2 / L3.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `a` | [Endpoint](#endpoint) | oui | Premier bout, le plus petit dans l'ordre (hostname, nom naturel du port). |
| `b` | [Endpoint](#endpoint) | oui | Second bout, strictement après `a`. |
| `kind` | [LinkKind](#linkkind) | oui | Sorte d'arête. |
| `status` | [EvidenceStatus](#evidencestatus) | oui | `confirmed` = observé et documenté ; `observed_only` ; `documented_only`. Dérivé des évidences. |
| `evidence` | liste de [LinkEvidence](#linkevidence) (au moins 1) | oui | Témoignages, triés par (source, témoin, voisin résolu). |
| `oper` | [LinkOper](#linkoper) | oui | `up` si les deux bouts sont up, `down` si l'un l'est, `unknown` sinon. |
| `speed_mbps` | entier \| null | oui | Vitesse commune aux deux bouts ; null si différente ou inconnue. |
| `aggregate_a` | texte non vide \| null | oui | Agrégat du bout `a` ; null sinon. |
| `aggregate_b` | texte non vide \| null | oui | Agrégat du bout `b` ; null sinon. |

#### Endpoint

Un bout de lien : un port d'un nœud. Pour un stub, le nom annoncé et le port annoncé (MAC comprise).

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du nœud, clé de `nodes[]`. |
| `interface` | texte non vide | oui | Nom canonique du port ; pour un stub ou un port non résolu, tel qu'annoncé. |

#### LinkEvidence

Un témoignage à l'origine du lien : une opinion datée d'une source, jamais un lien à elle seule.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `source` | [EvidenceSource](#evidencesource) | oui | `lldp` et `cdp` = observé ; `description` = documenté. |
| `witness` | [Endpoint](#endpoint) | oui | Le bout qui témoigne ; l'un des deux bouts du lien. |
| `remote_raw` | [RemoteRaw](#remoteraw) | oui | Ce que le témoin annonce, brut. |
| `remote_resolved` | [ResolvedRemote](#resolvedremote) | oui | Le voisin après résolution (R0) et normalisation (R1). |
| `resolution` | [Resolution](#resolution) | oui | Niveau de R0 qui a résolu le nom. |

#### RemoteRaw

Le voisin tel qu'annoncé par la source, avant résolution et normalisation.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `name` | texte non vide | oui | Nom (ou MAC, ou IP) du voisin, brut. |
| `port` | texte non vide \| null | oui | Port du voisin, brut ; null si la source n'en donne pas. |

#### ResolvedRemote

Le voisin après résolution (R0) et normalisation (R1) : toujours le device du bout opposé au témoin.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Device résolu ; celui du bout opposé au témoin. |
| `interface` | texte non vide \| null | oui | Port résolu ; null quand la description ne nomme pas de port (`C1|voisin|`) : l'accord avec l'observé se juge alors sur le device seul (R3), comme pour un port distant resté en MAC. |

#### SnapshotAggregate

Un agrégat, clé `(hostname, name)`, recopié de `aggregates[]` avec ses câbles et son état dégradé.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du nœud. |
| `name` | texte non vide | oui | Nom canonique de l'agrégat. |
| `oper_status` | [LinkStatus](#linkstatus) | oui | État opérationnel de l'agrégat. |
| `protocol` | [AggregationProtocol](#aggregationprotocol) | oui | Protocole d'agrégation. |
| `lacp_mode` | [LacpMode](#lacpmode) \| null | oui | Mode LACP ; null si non LACP ou non lu. |
| `min_links` | entier \| null | oui | Minimum de membres actifs configuré ; null si non lu. |
| `members` | liste de [AggregateMember](#aggregatemember) | oui | Membres et états, triés par nom naturel. |
| `mlag_id` | entier \| null | oui | Identifiant vPC / MLAG ; null sinon. |
| `mlag_peer_link` | booléen | oui | true si l'agrégat est le peer-link du MLAG. |
| `cables` | liste de [LinkKey](#linkkey) | oui | Clés des câbles de ses membres, triées ; forment un faisceau. |
| `degraded` | booléen | oui | true si au moins un membre n'est pas `bundled`. |

#### LinkKey

La clé d'un lien : ses deux bouts, triés. Jamais d'identifiant synthétique.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `a` | [Endpoint](#endpoint) | oui | Premier bout, le plus petit dans l'ordre (hostname, nom naturel du port). |
| `b` | [Endpoint](#endpoint) | oui | Second bout, strictement après `a`. |

#### MlagDomain

Deux agrégats de deux devices distincts portant le même `mlag_id` (vPC, MC-LAG).

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `mlag_id` | entier | oui | Identifiant partagé. |
| `members` | liste de [MlagMember](#mlagmember) (exactement 2) | oui | Les deux agrégats, triés par hostname. |
| `peer_link` | [MlagMember](#mlagmember) \| null | oui | L'agrégat `mlag_peer_link` d'un des deux devices ; null si absent. |
| `downstream` | texte non vide \| null | oui | Device au bout des câbles des deux agrégats s'il est unique ; null sinon (contrôle). |

#### MlagMember

Un agrégat membre d'un domaine MLAG.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Device de l'agrégat. |
| `aggregate` | texte non vide | oui | Nom canonique de l'agrégat ; clé de `aggregates[]`. |

#### HaCluster

Un cluster HA, clé = hostnames des membres triés.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `members` | liste de [HaClusterMember](#haclustermember) (au moins 1) | oui | Membres, triés par hostname. |
| `mode` | [HaMode](#hamode) | oui | Mode du cluster. |
| `cluster_name` | texte \| null | oui | Nom du cluster ; null si absent. |
| `heartbeat_interfaces` | liste de [HeartbeatInterface](#heartbeatinterface) | oui | Interfaces de heartbeat des membres, triées par (hostname, nom naturel). |

#### HaClusterMember

Un membre de cluster HA, vu par les documents `ha[]` qui le décrivent.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Hostname du membre, clé de `nodes[]`. |
| `role` | [HaRole](#harole) | oui | Rôle retenu. |
| `state` | [HaState](#hastate) | oui | État retenu. |
| `priority` | entier \| null | oui | Priorité HA ; null si non lue. |
| `reported_by` | liste de texte non vide (au moins 1) | oui | Devices dont le document `ha` décrit ce membre, triés. |

#### HeartbeatInterface

Une interface de heartbeat d'un membre, et le câble qui la porte s'il est connu.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Membre propriétaire. |
| `interface` | texte non vide | oui | Nom canonique de l'interface. |
| `cable` | [LinkKey](#linkkey) \| null | oui | Clé du câble observé ou documenté ; null si aucun (jamais inventé). |

#### Check

Un contrôle : ce que B1 a constaté, ou un constat du contrat d'entrée recopié (`origin = bundle`).

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `code` | [CheckCode](#checkcode) | oui | Code du catalogue (docs/05 §4 et constats du RunBundle). |
| `severity` | [Severity](#severity) | oui | `error` (réseau cassé ou incohérent), `warning` (la donnée se contredit), `info`. |
| `origin` | [CheckOrigin](#checkorigin) | oui | `correlation` = émis par B1 ; `bundle` = constat du contrat recopié. |
| `refs` | liste de [NodeRef](#noderef) \| [InterfaceRef](#interfaceref) \| [LinkRef](#linkref) \| [AggregateRef](#aggregateref) \| [ClusterRef](#clusterref) (au moins 1) | oui | Éléments concernés, triés par (sorte, identité). |
| `details` | objet clé → valeur JSON | oui | Détail structuré propre au code (cibles, statuts, topics) ; valeurs JSON seulement. |

#### NodeRef

Référence à un nœud.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `kind` | `node` | oui | Discriminant. |
| `hostname` | texte non vide | oui | Clé de `nodes[]`. |

#### InterfaceRef

Référence à une interface.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `kind` | `interface` | oui | Discriminant. |
| `hostname` | texte non vide | oui | Hostname de l'interface. |
| `name` | texte non vide | oui | Nom canonique de l'interface ; clé `(hostname, name)` de `interfaces[]`. |

#### LinkRef

Référence à un lien, par sa clé.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `kind` | `link` | oui | Discriminant. |
| `a` | [Endpoint](#endpoint) | oui | Premier bout du lien référencé. |
| `b` | [Endpoint](#endpoint) | oui | Second bout, strictement après `a`. |

#### AggregateRef

Référence à un agrégat.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `kind` | `aggregate` | oui | Discriminant. |
| `hostname` | texte non vide | oui | Hostname de l'agrégat. |
| `name` | texte non vide | oui | Nom canonique de l'agrégat ; clé `(hostname, name)` de `aggregates[]`. |

#### ClusterRef

Référence à un cluster HA, par ses membres.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `kind` | `cluster` | oui | Discriminant. |
| `members` | liste de texte non vide (au moins 1) | oui | Hostnames des membres, triés, sans doublon ; clé de `ha_clusters[]`. |

#### Coverage

Ce qui a été collecté sur un device en périmètre : « pas vu parce que non collecté », pas « n'existe pas ».

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Device en périmètre, clé de `nodes[]` (sorte `device`). |
| `status` | [CollectionStatus](#collectionstatus) | oui | Statut de la task, égal à `nodes[].collection` du device ; `not_collected` si aucune task. |
| `topics` | [TopicCoverage](#topiccoverage) | oui | Statut par topic ; tous `absent` si `unreachable` ou `not_collected`. |

#### TopicCoverage

Résultat de collecte par topic sur un device : `absent` = non demandé, rien à attendre.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `interfaces` | [TopicStatus](#topicstatus) | oui | Topic `interfaces`. |
| `aggregates` | [TopicStatus](#topicstatus) | oui | Topic agrégats. |
| `lldp` | [TopicStatus](#topicstatus) | oui | Topic `lldp`. |
| `cdp` | [TopicStatus](#topicstatus) | oui | Topic `cdp`. |
| `system` | [TopicStatus](#topicstatus) | oui | Topic `system`. |
| `ha` | [TopicStatus](#topicstatus) | oui | Topic `ha`. |

#### Report

Le rapport de corrélation. Les clés nullables absentes du bundle n'y sont pas : elles décrivent la
livraison et vivent dans le rapport d'ingestion (décision 2026-09-19).

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `counts` | [SectionCounts](#sectioncounts) | oui | Comptes par section. |
| `residual_normalizations` | objet clé → entier | oui | Recopié du bundle : ce que B0 a dû normaliser. |
| `applied_normalizations` | objet clé → entier | oui | Compteur par règle de B1 (`ifname_short_to_long`…) ; doit rester explicable. |
| `unresolved_names` | liste de texte non vide | oui | Noms de voisins finis en stub, triés, sans doublon. |
| `unparseable_descriptions` | entier ≥ 0 | oui | Descriptions non vides que R2 n'a pas su lire. |

#### SectionCounts

Taille de chaque section, vérifiée à la validation.

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `nodes` | entier ≥ 0 | oui | Nombre de nœuds. |
| `interfaces` | entier ≥ 0 | oui | Nombre d'interfaces. |
| `links` | entier ≥ 0 | oui | Nombre de liens. |
| `aggregates` | entier ≥ 0 | oui | Nombre d'agrégats. |
| `mlag_domains` | entier ≥ 0 | oui | Nombre de domaines MLAG. |
| `ha_clusters` | entier ≥ 0 | oui | Nombre de clusters HA. |
| `checks` | entier ≥ 0 | oui | Nombre de contrôles. |

Types partagés avec le RunBundle, définis en partie A : [VlanRange](#vlanrange), [IpAddress](#ipaddress), [AggregateMember](#aggregatemember).

### Énumérations

#### CheckCode

`neighbor_name_case_differs` \| `neighbor_resolved_by_reported_hostname` \| `neighbor_resolved_by_address` \| `neighbor_name_ambiguous` \| `neighbor_unknown` \| `remote_port_is_mac` \| `remote_port_is_aggregate` \| `description_unparseable` \| `description_disagrees_with_observed` \| `multiple_observed_neighbors` \| `one_way_observation` \| `self_observation` \| `documented_not_observed` \| `aggregate_member_not_bundled` \| `aggregate_below_min_links` \| `aggregate_protocol_mismatch` \| `mlag_downstream_inconsistent` \| `mlag_pair_direct_link` \| `ha_member_down` \| `ha_view_mismatch` \| `heartbeat_link_not_observed` \| `link_oper_mismatch` \| `link_speed_mismatch` \| `native_vlan_mismatch` \| `link_down` \| `documented_port_without_transceiver` \| `device_unreachable` \| `device_partial_collection` \| `parent_interface_unknown` \| `interface_member_unknown` \| `aggregate_interface_unknown` \| `aggregate_member_unknown` \| `local_interface_unknown` \| `ha_member_unknown` \| `heartbeat_interface_unknown` \| `vrf_default_case` \| `reported_hostname_differs` \| `device_without_task` \| `documents_without_task`

#### CheckOrigin

`bundle` \| `correlation`

#### CollectionStatus

`success` \| `partial` \| `failed` \| `unreachable` \| `not_collected`

#### EvidenceSource

`lldp` \| `cdp` \| `description`

#### EvidenceStatus

`confirmed` \| `observed_only` \| `documented_only`

#### InterfaceRole

`heartbeat` \| `mlag_peer_link`

#### LinkKind

`cable` \| `l2_segment` \| `l3_adjacency` \| `bgp_session`

#### LinkOper

`up` \| `down` \| `unknown`

#### NodeKind

`device` \| `external` \| `stub`

#### Resolution

`hostname` \| `hostname_casefold` \| `reported_hostname` \| `address` \| `stub`

#### Severity

`error` \| `warning` \| `info`

#### TopicStatus

`success` \| `failed` \| `absent`

Types partagés avec le RunBundle, définis en partie A : [AdminStatus](#adminstatus), [AggregationProtocol](#aggregationprotocol), [ChassisRole](#chassisrole), [ChassisState](#chassisstate), [DeviceType](#devicetype), [Duplex](#duplex), [HaMode](#hamode), [HaRole](#harole), [HaState](#hastate), [InterfaceType](#interfacetype), [IpRole](#iprole), [LacpMode](#lacpmode), [LinkStatus](#linkstatus), [MemberStatus](#memberstatus), [OperStatus](#operstatus), [RunStatus](#runstatus), [SwitchportMode](#switchportmode).

### Règles transverses

Vérifiées à la validation d'un snapshot, au-delà des types de chaque champ. Un snapshot qui les viole est
**refusé** : un bundle incohérent est de la donnée à signaler, un snapshot incohérent est un bug de B1.

- **Toutes les clés sont écrites.** Aucun champ n'a de défaut ; une clé absente est une erreur (`missing`),
  même pour un champ nullable. `null` garde le sens « pas de valeur ». Il n'y a pas d'`extras`.
- **Ordre canonique (R6), vérifié par le type.** `nodes` par (sorte, hostname) ; `interfaces` et `aggregates`
  par (hostname, nom naturel : `Ethernet1/2` avant `Ethernet1/10`) ; `links` par paire d'endpoints ;
  `mlag_domains` par (`mlag_id`, membres) ; `ha_clusters` par membres ; `checks` par (code, références,
  détails) ; `coverage` par hostname. Les listes internes de même : évidences, membres, câbles, rôles,
  capacités, `allowed_vlans` (intervalles triés, disjoints, adjacents fusionnés), adresses IP. Un doublon ou
  un désordre est refusé (`duplicate_identity`, `not_canonical_order`). La clé naturelle est
  `ld_contracts.snapshot.order.natural_key`, partagée avec B1.
- **Un lien n'a pas d'identifiant** : sa clé est la paire d'endpoints `(a, b)`, `a` strictement avant `b`.
- **Toute référence désigne un élément du document** : hostname d'une interface, d'un agrégat, d'un bout de
  lien, d'un membre HA ou d'un `downstream` → `nodes` ; câble d'un agrégat ou d'un heartbeat → `links` ;
  membres et `peer_link` d'un domaine MLAG → `aggregates` ; chaque `refs[]` d'un contrôle → sa section.
  Exception voulue : `interfaces[].aggregate` peut citer un agrégat absent d'`aggregates[]` (appartenance
  lue dans `interfaces[].members` faute de topic). Un bout de lien peut désigner une interface absente
  (device injoignable, stub, externe) : le nœud doit exister, pas l'interface.
- **`coverage` liste exactement les nœuds `device`**, et `report.counts` la taille de chaque section.
- **Le statut d'un lien se déduit de ses évidences** ; le témoin de chaque évidence est l'un des deux bouts.
- **Sérialisation canonique** : `ld_contracts.snapshot.serialize.canonical_json` (clés triées, UTF-8 sans
  échappement, indentation 2, fin de ligne unique). Deux snapshots égaux sont égaux à l'octet.

### Codes de contrôle

Catalogue fermé : `code` est une énumération, `severity` doit être admise pour le code, `origin` vaut
`correlation` (émis par B1, règle R0 à R5 de docs/05) ou `bundle` (constat du contrat d'entrée recopié).
`nullable_key_absent` n'est jamais recopié : il décrit la livraison, pas le contenu (rapport d'ingestion).

| Code | Sévérité | Origine | Règle | Signification |
|---|---|---|---|---|
| `neighbor_name_case_differs` | info | correlation | R0 | voisin résolu après repli de casse |
| `neighbor_resolved_by_reported_hostname` | warning | correlation | R0 | voisin résolu par le nom que l'équipement dit de lui-même : inventaire et équipement divergent |
| `neighbor_resolved_by_address` | warning | correlation | R0 | voisin résolu par une MAC ou une IP, faute de nom annoncé |
| `neighbor_name_ambiguous` | warning | correlation | R0 | plusieurs devices répondent au nom annoncé : aucun ne gagne, stub |
| `neighbor_unknown` | info | correlation | R0 | voisin inconnu de `devices` : nœud stub |
| `remote_port_is_mac` | info | correlation | R1 | port distant annoncé en MAC, non remplacé par un nom d'interface |
| `remote_port_is_aggregate` | warning | correlation | R1 | port distant annoncé par le nom d'un agrégat, membre non déterminé : le câble s'arrête à l'agrégat |
| `description_unparseable` | info | correlation | R2 | description non vide qui ne suit pas la grammaire |
| `description_disagrees_with_observed` | warning | correlation | R3 | la description d'un port cite un autre voisin que celui observé ; le câble suit l'observé |
| `multiple_observed_neighbors` | warning | correlation | R3 | deux voisins observés sur un même port ; les deux câbles sont dessinés |
| `self_observation` | warning | correlation | R3 | un port se désigne lui-même comme voisin (boucle, réflecteur, description) : aucun câble |
| `one_way_observation` | warning | correlation | R3 | observé d'un seul côté alors que l'autre a collecté le même protocole |
| `documented_not_observed` | info / warning | correlation | R3 | câble documenté sans observation : warning si les deux bouts ont collecté LLDP ou CDP, info sinon |
| `aggregate_member_not_bundled` | warning | correlation | R4 | un membre d'agrégat n'est pas `bundled` |
| `aggregate_below_min_links` | error | correlation | R4 | membres `bundled` sous `min_links` |
| `aggregate_protocol_mismatch` | error | correlation | R4 | protocoles d'agrégation différents aux deux bouts d'un faisceau |
| `mlag_downstream_inconsistent` | warning | correlation | R4 | les deux agrégats d'un domaine MLAG ne mènent pas au même device |
| `mlag_pair_direct_link` | warning | correlation | R4 | deux agrégats de même `mlag_id` se rejoignent : peer-link mal étiqueté |
| `ha_member_down` | error | correlation | R4 | un membre du cluster est `down` |
| `ha_view_mismatch` | warning | correlation | R4 | deux membres décrivent le cluster différemment |
| `heartbeat_link_not_observed` | info | correlation | R4 | interface de heartbeat sans câble observé ni documenté |
| `link_oper_mismatch` | warning | correlation | R5 | un bout `up`, l'autre `down` |
| `link_speed_mismatch` | warning | correlation | R5 | vitesses opérationnelles différentes aux deux bouts |
| `native_vlan_mismatch` | warning | correlation | R5 | VLAN non tagué différent aux deux bouts |
| `link_down` | info | correlation | R5 | les deux bouts sont `down` ; le câble reste dessiné |
| `documented_port_without_transceiver` | warning | correlation | R5 | port `not_present` dont la description cite un voisin |
| `device_unreachable` | error | correlation | R5 | device injoignable pendant la run |
| `device_partial_collection` | info | correlation | R5 | collecte partielle ; les topics en échec sont dans `details` |
| `parent_interface_unknown` | warning | bundle | contrat | le parent d'une sous-interface n'existe pas dans les interfaces du device |
| `interface_member_unknown` | warning | bundle | contrat | un membre listé dans `interfaces[].members` n'existe pas |
| `aggregate_interface_unknown` | warning | bundle | contrat | un agrégat n'a pas d'interface du même nom |
| `aggregate_member_unknown` | warning | bundle | contrat | un membre d'agrégat n'existe pas dans les interfaces du device |
| `local_interface_unknown` | warning | bundle | contrat | un voisin LLDP / CDP cite un port local absent des interfaces |
| `ha_member_unknown` | warning | bundle | contrat | un membre HA n'est pas dans `devices` |
| `heartbeat_interface_unknown` | warning | bundle | contrat | une interface de heartbeat n'existe pas dans les interfaces du device |
| `vrf_default_case` | info | bundle | contrat | un `vrf` vaut `default` à la casse ou aux blancs près : VRF utilisateur légitime, ou table globale mal écrite |
| `reported_hostname_differs` | warning | bundle | contrat | le nom rapporté par l'équipement diffère du hostname (hors casse) |
| `device_without_task` | warning | bundle | contrat | un device de l'infrastructure n'a pas de statut de collecte |
| `documents_without_task` | warning | bundle | contrat | des documents d'un topic existent sans statut de collecte pour ce topic |

### Erreurs de contrat (bloquantes)

| Type | Signification |
|---|---|
| `snapshot_major_unsupported` | la version majeure de `snapshot_version` n'est pas celle du validateur |
| `duplicate_identity` | deux éléments d'une liste ont la même clé |
| `not_canonical_order` | une liste n'est pas dans l'ordre canonique (R6) |
| `link_endpoints_equal` | les deux bouts d'un lien sont le même port |
| `link_endpoints_unordered` | les bouts d'un lien ne sont pas triés (`a` doit précéder `b`) |
| `node_fields_for_kind` | un nœud porte des champs que sa sorte n'admet pas, ou n'en porte pas un qu'elle exige |
| `stack_count_mismatch` | `member_count` d'un stack diffère du nombre de membres listés |
| `vlan_ranges_not_canonical` | `allowed_vlans` n'est pas trié par `first`, ou deux intervalles se touchent ou se recouvrent |
| `evidence_witness_not_endpoint` | le témoin d'une évidence n'est aucun des deux bouts du lien |
| `link_status_mismatch` | `status` ne correspond pas aux sources des évidences |
| `aggregate_degraded_mismatch` | `degraded` ne reflète pas l'état des membres |
| `mlag_domain_same_device` | les deux agrégats d'un domaine MLAG sont sur le même device |
| `heartbeat_not_a_member` | une interface de heartbeat appartient à un device qui n'est pas membre du cluster |
| `check_severity_not_allowed` | la sévérité d'un contrôle n'est pas celle que le catalogue admet pour son code |
| `check_origin_mismatch` | l'origine d'un contrôle (`bundle` / `correlation`) ne correspond pas à son code |
| `reference_unknown` | une référence (endpoint, câble, membre, `refs`) ne désigne aucun élément du snapshot |
| `reference_inconsistent` | une référence existe mais contredit la structure : câble d'agrégat qui ne touche aucun membre, câble de heartbeat qui ne touche pas l'interface, membre de domaine MLAG d'un autre `mlag_id`, `peer_link` non marqué `mlag_peer_link` ou d'un device tiers, `aggregate_a` / `aggregate_b` différent de `interfaces[].aggregate` |
| `evidence_resolved_not_endpoint` | le voisin résolu d'une évidence n'est pas le device du bout opposé au témoin |
| `reported_by_not_a_member` | un membre HA est rapporté par un device qui n'est pas membre du cluster |
| `coverage_status_mismatch` | `coverage[].status` diffère de `nodes[].collection` du même device |
| `coverage_topics_for_status` | un device `unreachable` ou `not_collected` a un topic qui n'est pas `absent` |
| `coverage_mismatch` | `coverage` ne liste pas exactement les nœuds `device` |
| `report_counts_mismatch` | un compte de `report.counts` diffère de la taille de la section |
| `extra_forbidden` | un champ inconnu est présent (le snapshot n'a pas d'`extras`) |
| `missing` | un champ est absent : toutes les clés du snapshot sont requises, `null` compris |

Hérités des types partagés avec la partie A (`IpAddress`, `VlanRange`, dates, règle VLAN / mode) :

| Type | Signification |
|---|---|
| `access_vlan_outside_access_mode` | une interface porte un `access_vlan` alors que `switchport_mode` n'est pas `access` |
| `trunk_vlans_outside_trunk_mode` | une interface porte `native_vlan` ou `allowed_vlans` alors que `switchport_mode` n'est pas `trunk` |
| `vlan_range_inverted` | un intervalle d'`allowed_vlans` a `first` supérieur à `last` |
| `ip_invalid` | une adresse IP n'est pas analysable |
| `ip_family_mismatch` | `family` ne correspond pas à la version de l'adresse |
| `ip_prefix_out_of_range` | `prefix` hors plage pour la version de l'adresse |
| `datetime_numeric` | une date est donnée en nombre (epoch) au lieu d'ISO 8601 avec fuseau |

### Exemple : le plus petit snapshot qui dit quelque chose

`fixtures/snapshot-skeleton.json`, deux devices reliés par un câble confirmé, écrit en forme canonique :

```json
{
  "aggregates": [],
  "checks": [],
  "coverage": [
    {
      "hostname": "sw-a",
      "status": "success",
      "topics": {
        "aggregates": "absent",
        "cdp": "absent",
        "ha": "absent",
        "interfaces": "success",
        "lldp": "success",
        "system": "absent"
      }
    },
    {
      "hostname": "sw-b",
      "status": "success",
      "topics": {
        "aggregates": "absent",
        "cdp": "absent",
        "ha": "absent",
        "interfaces": "success",
        "lldp": "success",
        "system": "absent"
      }
    }
  ],
  "ha_clusters": [],
  "interfaces": [
    {
      "access_vlan": null,
      "admin_status": "up",
      "aggregate": null,
      "allowed_vlans": [
        {
          "first": 10,
          "last": 20
        },
        {
          "first": 100,
          "last": 100
        }
      ],
      "description": "C1|sw-b|Ethernet1/1|",
      "description_parsed": {
        "criticality": "C1",
        "neighbor": "sw-b",
        "options": null,
        "port": "Ethernet1/1"
      },
      "duplex": "full",
      "hostname": "sw-a",
      "ip_addresses": [],
      "last_change_age_seconds": 3600,
      "mac_address": "00:00:5e:00:53:01",
      "media": "10Gbase-SR",
      "name": "Ethernet1/1",
      "native_vlan": 1,
      "oper_reason": null,
      "oper_status": "up",
      "parent_interface": null,
      "roles": [],
      "speed_mbps": 10000,
      "switchport_mode": "trunk",
      "type": "physical",
      "virtual_context": null,
      "vlan_id": null,
      "vrf": null
    },
    {
      "access_vlan": null,
      "admin_status": "up",
      "aggregate": null,
      "allowed_vlans": [
        {
          "first": 10,
          "last": 20
        },
        {
          "first": 100,
          "last": 100
        }
      ],
      "description": "C1|sw-a|Ethernet1/1|",
      "description_parsed": {
        "criticality": "C1",
        "neighbor": "sw-a",
        "options": null,
        "port": "Ethernet1/1"
      },
      "duplex": "full",
      "hostname": "sw-b",
      "ip_addresses": [],
      "last_change_age_seconds": 3600,
      "mac_address": "00:00:5e:00:53:02",
      "media": "10Gbase-SR",
      "name": "Ethernet1/1",
      "native_vlan": 1,
      "oper_reason": null,
      "oper_status": "up",
      "parent_interface": null,
      "roles": [],
      "speed_mbps": 10000,
      "switchport_mode": "trunk",
      "type": "physical",
      "virtual_context": null,
      "vlan_id": null,
      "vrf": null
    }
  ],
  "links": [
    {
      "a": {
        "hostname": "sw-a",
        "interface": "Ethernet1/1"
      },
      "aggregate_a": null,
      "aggregate_b": null,
      "b": {
        "hostname": "sw-b",
        "interface": "Ethernet1/1"
      },
      "evidence": [
        {
          "remote_raw": {
            "name": "sw-b",
            "port": "Ethernet1/1"
          },
          "remote_resolved": {
            "hostname": "sw-b",
            "interface": "Ethernet1/1"
          },
          "resolution": "hostname",
          "source": "description",
          "witness": {
            "hostname": "sw-a",
            "interface": "Ethernet1/1"
          }
        },
        {
          "remote_raw": {
            "name": "sw-a",
            "port": "Ethernet1/1"
          },
          "remote_resolved": {
            "hostname": "sw-a",
            "interface": "Ethernet1/1"
          },
          "resolution": "hostname",
          "source": "description",
          "witness": {
            "hostname": "sw-b",
            "interface": "Ethernet1/1"
          }
        },
        {
          "remote_raw": {
            "name": "sw-b",
            "port": "Ethernet1/1"
          },
          "remote_resolved": {
            "hostname": "sw-b",
            "interface": "Ethernet1/1"
          },
          "resolution": "hostname",
          "source": "lldp",
          "witness": {
            "hostname": "sw-a",
            "interface": "Ethernet1/1"
          }
        },
        {
          "remote_raw": {
            "name": "sw-a",
            "port": "Ethernet1/1"
          },
          "remote_resolved": {
            "hostname": "sw-a",
            "interface": "Ethernet1/1"
          },
          "resolution": "hostname",
          "source": "lldp",
          "witness": {
            "hostname": "sw-b",
            "interface": "Ethernet1/1"
          }
        }
      ],
      "kind": "cable",
      "oper": "up",
      "speed_mbps": 10000,
      "status": "confirmed"
    }
  ],
  "mlag_domains": [],
  "nodes": [
    {
      "collection": "success",
      "evidence": null,
      "hostname": "sw-a",
      "kind": "device",
      "model": "N9K-C93180YC-FX",
      "os_name": "NX-OS",
      "os_version": "10.4.2",
      "reported_hostname": "sw-a",
      "serial_number": "SN-A",
      "site": "paris-dc1",
      "stack": null,
      "type": "switch",
      "uptime_seconds": 9000,
      "vendor": "cisco",
      "virtual_contexts": []
    },
    {
      "collection": "success",
      "evidence": null,
      "hostname": "sw-b",
      "kind": "device",
      "model": "N9K-C93180YC-FX",
      "os_name": "NX-OS",
      "os_version": "10.4.2",
      "reported_hostname": "sw-b",
      "serial_number": "SN-B",
      "site": "paris-dc1",
      "stack": null,
      "type": "switch",
      "uptime_seconds": 9000,
      "vendor": "cisco",
      "virtual_contexts": []
    }
  ],
  "report": {
    "applied_normalizations": {},
    "counts": {
      "aggregates": 0,
      "checks": 0,
      "ha_clusters": 0,
      "interfaces": 2,
      "links": 1,
      "mlag_domains": 0,
      "nodes": 2
    },
    "residual_normalizations": {},
    "unparseable_descriptions": 0,
    "unresolved_names": []
  },
  "snapshot_version": "1.0.0",
  "source": {
    "bundle_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "collector_run_id": "66db3f0e9a1c2b0012f4a7d1",
    "contract_version": "1.0.0",
    "exporter_version": "0.1.0",
    "infrastructure": "infra-lab",
    "produced_at": "2026-09-10T02:20:11Z",
    "run": {
      "end_datetime": "2026-09-10T02:14:32Z",
      "start_datetime": "2026-09-10T02:00:00Z",
      "status": "completed"
    }
  }
}
```

Le JSON Schema équivalent est `src/ld_contracts/schema/snapshot-v1.schema.json`. Le snapshot de référence
de `bundle-minimal.json` sera produit par B1 (golden, test de dérive).
