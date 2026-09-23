# Revue du modèle de collecte `interfaces` (entrée de B1)

> **Statut (2026-09-10)** : revue historique, conservée pour le raisonnement. La référence
> normative du modèle de données est `contracts/CONTRAT.md`, générée depuis les modèles ;
> en cas d'écart, c'est elle qui fait foi.

> 2026-09-08. Revue des trois exemples fournis (switch Cisco physique, sous-interface
> Fortinet, agrégat Fortinet). Objectif : rendre la collecte suffisante et stable pour la
> corrélation (B1), le diff (B3) et les contrôles d'intégrité prévus. Ordre : bloquant,
> important, souhaitable. Les exemples sont des sorties Python (`None`), pas du JSON : la
> revue des types est à confirmer sur un export réel de la base.

## 0. Lecture au 2026-09-10 : qui porte chaque demande

La librairie de collecte produit un modèle **par topic, par commande**, et n'agrège pas
(précision d'Orhan). Les demandes ci-dessous se répartissent donc en trois familles,
détaillées dans `03-b0-lecture-assemblage.md` §4 :

- **normalisation de valeurs dans la commande existante** (énumérations, entiers, MAC,
  `oper_reason`, `vlan_id`, `last_change`, compteurs) → librairie ;
- **nouveaux topics à une commande** (agrégats avec état par membre, transceivers,
  switchport, adresses secondaires) → librairie, joints par B0 ;
- **clé de run** → retirée des documents (elle est dans le nom de la collection) ;
  `collected_at` attendu par (device, topic) dans `collector_run_tasks_<id>`.

## 1. Bloquant : sans cela B1 ne peut ni rejouer ni differ

### 1.1 Aucun rattachement au run, aucune date de collecte
Le document ne porte ni `run_id` ni `collected_at`. B1 travaille par (infrastructure,
run) ; sans clé de run il ne peut pas sélectionner un état cohérent ni le rejouer.
`last_change` ("13week(s) 3day(s)") est relatif à un instant de collecte qui n'est
écrit nulle part : la valeur est inexploitable.

**Demande** : `run_id` (référence au document `collector_run`), `collected_at` (ISO 8601
UTC) sur chaque document, index unique `(run_id, hostname, name)`.

### 1.2 Le modèle n'est pas vendor-agnostic : les énumérations fuient
Même fait, deux encodages selon le vendeur :

| Champ | Cisco | Fortinet | Attendu |
|---|---|---|---|
| `duplex` | `full-duplex` | `full` | `full \| half \| unknown` |
| `type` | `physical` | `VLAN` (majuscules) | énumération fermée en minuscules |
| `oper_status` agrégat | ? | `None` | toujours renseigné |
| `counters` vide | `[]` | `None` | une seule représentation |

Si ces écarts atteignent B1, la normalisation par vendeur que le modèle devait supprimer
revient dans Living Diagram. Elle doit être faite côté collecte, une fois, par un
modèle Pydantic strict.

### 1.3 Types instables
`address` est une chaîne dans un exemple et un littéral non quoté dans l'autre ;
`port_speed` est une chaîne (`"10000"`) pour un nombre ; `counters` alterne liste et
null. Un nombre en chaîne casse comparaisons et tris (`"1000" > "10000"` est vrai).

**Demande** : schéma Pydantic côté collecte, exporté en JSON Schema, avec un champ
`schema_version` sur chaque document (ou sur le run). Ce schéma est le contrat que
l'adaptateur B0 de Living Diagram consomme ; il est versionné et testé.

## 2. Important : les contrôles prévus sont impossibles en l'état

### 2.1 Agrégats : pas d'état par membre
`members: ["x1","x2"]` donne la configuration, pas la réalité. Le contrôle phare du brief
(« le Po20 est devenu mono-membre ») exige de distinguer un membre configuré d'un membre
effectivement agrégé (LACP collecting/distributing) d'un membre suspendu, en attente ou
down. Il manque aussi le protocole (LACP / statique / PAgP) : agrégat statique d'un côté
et LACP de l'autre est une erreur classique détectable à la corrélation.

**Demande** : `members: [{ "name": "x1", "status": "bundled|suspended|standby|down|individual" }]`
et `aggregation: { "protocol": "lacp|static|pagp", "mode": "active|passive|null" }`.
`oper_status` de l'agrégat toujours renseigné.

### 2.2 `oper_status` aplati perd la raison de la panne
Cisco distingue `err-disabled`, `sfpAbsent`, `xcvrAbsent`, `notconnect`, `suspended`
(membre LACP), `noOperMembers` (Po sans membre). Aplatir tout cela en `down` détruit
l'information la plus utile pour un diagramme vivant.

**Demande** : `oper_status` sur l'énumération standard RFC 2863 (`up, down, testing,
unknown, dormant, not_present, lower_layer_down`) plus `oper_reason` (chaîne brute
vendeur, nullable). Le premier champ est agnostique et comparable, le second garde la
nuance.

#### Précision sur `oper_reason` (retour du 2026-09-09)

Définition : **la raison textuelle que le vendeur donne à l'état opérationnel**, copiée
telle quelle, sans reformulation ni traduction. `null` quand l'interface est `up`, ou
quand le vendeur ne donne aucune raison. Le collecteur ne l'interprète pas ; c'est B1 qui
y applique une table de motifs pour ses contrôles (err-disabled, transceiver absent,
membre LACP suspendu), et l'inspecteur l'affiche brute. Deux champs, deux rôles :
`oper_status` est comparable entre vendeurs et entre runs ; `oper_reason` garde la nuance
sans contraindre le modèle.

Valeurs attendues :

| Vendeur | Sortie source | `oper_status` | `oper_reason` |
|---|---|---|---|
| Cisco IOS / IOS-XE | `... is down, line protocol is down (notconnect)` | `down` | `notconnect` |
| Cisco IOS / IOS-XE | `show interfaces status` → `err-disabled` | `down` | `err-disabled` |
| Cisco IOS / IOS-XE | `... is administratively down` | `down` (et `admin_status: down`) | `administratively down` |
| Cisco NX-OS | `Ethernet1/3 is down (SFP not inserted)` | `not_present` | `SFP not inserted` |
| Cisco NX-OS | `Ethernet1/4 is down (XCVR not inserted)` | `not_present` | `XCVR not inserted` |
| Cisco NX-OS | `Ethernet1/5 is down (suspended by LACP)` | `down` | `suspended by LACP` |
| Cisco NX-OS | `port-channel10 is down (No operational members)` | `down` | `No operational members` |
| Cisco NX-OS | `Ethernet1/7 is down (Link not connected)` | `down` | `Link not connected` |
| Cisco NX-OS | `Ethernet1/9 is down (errDisabled)` | `down` | `errDisabled` |
| Cisco NX-OS | `Ethernet1/10 is down (inactive)` | `down` | `inactive` |
| Fortinet | `get system interface physical` → `status: down` | `down` | `null` (aucune raison fournie) |
| Fortinet | membre d'agrégat non `distributing` | porté par `members[].status` sur l'agrégat, pas par `oper_reason` | |
| Checkpoint Gaia | `show interface eth1` → `link-state link down` | `down` | `null` |
| Tous | interface `up` | `up` | `null` |

Règle de mapping vers RFC 2863 pour le collecteur, volontairement minimale : `up` ;
`down` par défaut ; `not_present` uniquement quand le vendeur dit explicitement qu'un
module ou un transceiver manque ; `unknown` si l'état n'a pas pu être lu ;
`lower_layer_down` optionnel pour une sous-interface dont le parent est down (B1 sait le
dériver de `parent_interface`, donc `down` suffit si le collecteur ne croise pas).
`testing` et `dormant` ne sont pas utilisés en V1. Ne jamais deviner : en cas de doute,
`down` et la chaîne brute dans `oper_reason`.

### 2.3 L'adresse MAC est dans `extras`, au format vendeur
`extras.mac_address: "aaaa.bbbb.cccc"` (notation Cisco). Fortinet produira
`aa:aa:bb:bb:cc:cc`. La corrélation MAC/ARP prévue, et surtout la résolution d'un voisin
LLDP par son chassis-id (souvent la MAC de base du châssis) quand le system-name est
absent ou en FQDN, dépendent d'une MAC normalisée et de premier niveau.

**Demande** : `mac_address` au premier niveau, minuscules, séparateur `:`. `bia` peut
rester dans `extras`.

### 2.4 Vitesse : trois champs, sémantique floue, chaînes
`port_speed: "10000"`, `negotiated_port_speed: null`, `auto_negotiate: null`, plus
`extras.bandwidth: "10000000 Kbit"`. Pour les contrôles (vitesses hétérogènes dans un
canal, désaccord de vitesse aux deux bouts) il faut la vitesse **opérationnelle**.
`bandwidth` Cisco est une métrique de routage modifiable à la main : jamais utilisée
pour le L1.

**Demande** : `speed_mbps` (entier, opérationnel, null si down),
`configured_speed_mbps` (entier ou null = auto), `auto_negotiate` (booléen tri-état).

### 2.5 `last_change` en chaîne brute
Inexploitable tel quel. Normalisé en secondes, il ouvre un contrôle que le diff de
snapshots ne peut pas voir : un lien tombé puis remonté entre deux runs
(`collected_at - âge` postérieur au run précédent).

**Demande** : `last_change_age_seconds` (entier, nullable : âge du dernier changement
d'état opérationnel au moment de la collecte) au premier niveau ; la chaîne brute peut
rester dans `extras.last_change_raw`.

**Révision 2026-09-16 — trois faits, pas deux.** « never » (NX-OS « Last link flapped: never »,
IF-MIB `ifLastChange = 0`) n'est pas « inconnu » : c'est l'assertion qu'aucun changement d'état
n'a eu lieu depuis le dernier démarrage (RFC 2863 : état pris avant la dernière réinitialisation
de l'agent ; une interface qui a flappé avant le reboot et plus depuis est bien `"never"`). Le champ devient `entier ≥ 0 | "never" | null`.
Sentinelle `-1` écartée : la règle ci-dessus (`collected_at - âge`) l'aurait lue comme un flap
une seconde après la collecte, sans erreur ; `"never"` fait échouer la soustraction bruyamment.
B1 lit `"never"` comme un âge ≥ `system.uptime_seconds` : pas de flap depuis le boot, et un
reboot entre deux runs est déjà un événement de `system`. Détail : `contracts/README.md` § Décisions.

**Pourquoi au premier niveau et pas dans `extras`** (objection du 2026-09-09 : « valeur
issue de `show interfaces`, spécifique Cisco »). Le critère pour `extras` n'est pas
« tous les vendeurs le fournissent-ils aujourd'hui ? » mais « le concept est-il
vendeur-agnostique ? ». Le temps écoulé depuis le dernier changement d'état est
`ifLastChange` de l'IF-MIB (RFC 2863) : tout vendeur l'expose, au moins en SNMP. Que la
collecte ne le parse aujourd'hui que chez Cisco est une limite de couverture, pas de
concept. C'est la même situation que LLDP, présent sur une partie du parc : le champ est
nullable, le contrôle ne s'émet que là où la donnée existe, et le snapshot enregistre la
couverture. Le mettre dans `extras` obligerait B1 soit à lire `extras` (règle §4 brisée,
et une chaîne vendeur à parser côté Living Diagram), soit à renoncer au contrôle.

Le même critère justifie `vrf` et `virtual_context` (§3) : tous les vendeurs ne les ont
pas, mais le concept est commun, donc premier niveau, nullable.

**Règle générale, à écrire dans le schéma** : un champ est au premier niveau si (a) le
concept existe indépendamment du vendeur, (b) il a un type et une énumération
normalisés, (c) B1 ou un contrôle prévu le consomme. Sinon `extras`, où nom et format
sont libres et où B1 ne lit rien hors clés déclarées (`vpc`).

### 2.6 Sous-interfaces et VLAN : le type est ambigu et le tag manque
`type: "VLAN"` couvre deux objets différents : la sous-interface 802.1Q (enfant d'un port
physique, `parent_interface` renseigné) et la SVI (interface routée d'un VLAN, sans
parent unique). Et le VLAN 400 n'apparaît que dans le nom libre `SUB-INTF-VL400`.

**Demande** : `type` sur `physical | aggregate | subinterface | svi | loopback | tunnel |
management | other` ; `vlan_id` (entier, nullable) pour `subinterface` et `svi`.
`parent_interface` réservé à la relation sous-interface → parent ; l'appartenance d'un
port physique à un agrégat se déduit de `members` (ne pas surcharger `parent_interface`).

## 3. Souhaitable : peu coûteux à la collecte, très rentable ensuite

- **Adresses IP en liste** : `ip_addresses: [{address, prefix, family, role}]`. Une
  seule adresse ignore les secondaires, IPv6, les VIP VRRP/HSRP. Bonus : deux interfaces
  sur le même /31 ou /30 sont voisines L3, troisième source d'évidence pour plus tard.
- **Média / transceiver** : `extras.media_type: "10G"` promu en `media` de premier
  niveau. Le désaccord SR / LR aux deux bouts d'une fibre est un contrôle L1 pur.
- **Mode L2** : `switchport_mode: access|trunk|routed|none`, `access_vlan` (port access,
  ajouté le 2026-09-16), `native_vlan`, `allowed_vlans` (trunk ; liste d'intervalles `{first, last}`
  d'entiers depuis le 2026-09-16, plus de chaîne brute). Désaccord de VLAN natif aux
  deux bouts : contrôle classique. B1 compare le VLAN non tagué des deux bouts du câble,
  `access_vlan` ou `native_vlan` selon le mode (depuis le 2026-09-18 il lit les `interfaces[]` des
  deux bouts ; le `neighbor_native_vlan` de CDP est retiré du contrat). Un VLAN renseigné hors de son mode (`null` compris) est refusé. `switchport_mode`
  est le mode configuré résolu, jamais « down » : un port access `notconnect` garde son VLAN.
- **Compteurs structurés** : `counters: { in_errors, out_errors, crc, in_discards,
  out_discards }` ou null. Entre deux snapshots, des CRC qui augmentent signalent un
  câble ou un transceiver dégradé : le contrôle le plus « vivant » du lot.
- **`vrf`** : nom conservé. Instance de routage L3 de l'interface, concept commun (VRF
  Cisco et Fortinet, VRF Gaia R81+). Documenter que `null` vaut table globale (ou écrire
  `"default"`, au choix, mais un seul des deux).
- **`domain` → `virtual_context`** (retour du 2026-09-09 : « domain est trop vague »).
  Définition : la partition virtuelle du châssis physique qui possède l'interface : VDOM
  (Fortinet), Virtual System (Checkpoint VSX), VDC (Nexus), context (ASA), vsys (Palo
  Alto). `null` = châssis non partitionné, ou interface de portée globale. Alternative
  acceptable : `virtual_system`. Écartés : `vdom` et `vsys` (jargon d'un seul vendeur),
  `partition` et `tenant` (ne disent pas de quoi). Question de couverture : le collecteur
  voit-il toutes les VDOM ou seulement celle de connexion ? Une VDOM non vue produit de
  faux « ports libres ». Question d'identité, plus importante : sur un Nexus en VDC ou un
  VSX, la collection devices déclare-t-elle un device par contexte ou un par châssis ? Le
  nœud L1 est le châssis physique ; si la collecte produit un `hostname` par contexte, B1
  devra les regrouper et il lui faut la clé du châssis (serial ou hostname parent) dans
  devices.
- **`infrastructure` dupliqué sur l'interface** : mieux qu'un index. La liste devices
  étant une table de référence qui représente le présent (revue devices §1.1), ce champ
  est la mémoire de l'appartenance du device **au moment de la collecte**. B1 scope le
  run sur ce champ, et compare avec la table devices lue au même moment ; un désaccord
  (device changé d'infra entre la collecte et la corrélation) est signalé, jamais résolu
  en silence.
- **Nom de collection** : `l1_interfaces` contient des objets L3 (SVI, sous-interfaces).
  `interfaces` serait plus honnête ; B1 filtre par `type`.

## 4. À ne pas changer

- **`description` reste brute.** Le parseur du format `criticité|device|port|options`
  vit dans B1, versionné et rejouable sur les snapshots. La collecte ne parse rien.
- **`extras` reste la soupape** pour le détail vendeur (vPC Nexus y compris, comme
  décidé). Règle : B1 ne lit dans `extras` que des clés déclarées ; tout ce qu'il consomme
  vraiment est au premier niveau et normalisé.
- **Identité `(hostname, name)`** et documents plats, un par interface.

## 5. Questions ouvertes sur ces exemples

1. Énumérations exactes produites aujourd'hui pour `type`, `admin_status`, `oper_status`,
   `duplex`.
2. Descriptions : **précisé le 2026-09-09** : le premier champ avant `|` est le niveau de
   criticité de l'interface, le reste sera précisé plus tard. Le parseur V1 découpe donc
   sur `|`, garde le champ 0 tel quel (vocabulaire non figé), lit le device voisin et le
   port voisin en champs 1 et 2, et conserve le reste en options. La forme courte/longue
   du port distant (`Ten1/1/1` vs `TenGigabitEthernet1/1/1`) reste à calibrer sur des
   descriptions réelles ; B1 prévoit la normalisation court ↔ long pour Cisco.
3. Exemples manquants pour figer le schéma : Port-channel Cisco (nom long ? membres en
   nom long ?), port membre d'un Po (que contient `parent_interface` ?), sous-interface
   Cisco `Gi0/0.10`, SVI `Vlan100`, loopback, `mgmt0`, et un Checkpoint.
4. Un export réel (`mongoexport`) pour vérifier les types effectivement stockés.
5. Les documents `collector_run` et `devices` (cf. revue précédente : statut de collecte
   par device et par table, liste des devices telle qu'elle était à chaque run).

## 6. Schéma cible proposé (v1, une interface physique)

> Exemple du 2026-09-08, conservé pour l'historique : il porte encore `schema_version`, `run_id`,
> `collected_at`, `infrastructure` et `aggregation`, retirés depuis. La référence est
> `contracts/CONTRAT.md`.

```json
{
  "schema_version": "1.0",
  "run_id": "66db3f0e9a1c2b0012f4a7d1",
  "collected_at": "2026-09-08T02:03:41Z",
  "hostname": "MON_SWITCH",
  "infrastructure": "infra_01",
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
  "aggregation": null,
  "ip_addresses": [ { "address": "4.4.4.4", "prefix": 31, "family": 4, "role": "primary" } ],
  "vrf": null,
  "virtual_context": null,
  "switchport_mode": "routed",
  "access_vlan": null,
  "native_vlan": null,
  "allowed_vlans": null,
  "counters": { "in_errors": 0, "out_errors": 0, "crc": 0, "in_discards": 0, "out_discards": 0 },
  "extras": {
    "hardware_type": "10/100/1000/25000 Ethernet",
    "bia": "aaaa.bbbb.cccc",
    "bandwidth": "10000000 Kbit",
    "delay": "10 usec",
    "encapsulation": "ARPA",
    "last_change_raw": "13week(s) 3day(s)"
  }
}
```

Variante agrégat : `type: "aggregate"`, `members: [{"name":"x1","status":"bundled"},
{"name":"x2","status":"suspended"}]`, `aggregation: {"protocol":"lacp","mode":"active"}`,
`speed_mbps` = somme des membres `bundled` (ou null si la collecte ne le donne pas : B1
le dérive). Variante sous-interface : `type: "subinterface"`, `parent_interface: "x2"`,
`vlan_id: 400`.

## 7. Ce que B1 fera de ces champs (rappel, pour juger l'utilité)

| Champ | Usage B1 |
|---|---|
| `run_id`, `collected_at` | sélection d'un état cohérent, rejouabilité, datation du snapshot |
| `description` brute | source « documenté » : claims de lien par parsing versionné |
| `members[].status`, `aggregation` | agrégats, contrôle mono-membre / membre suspendu / protocole asymétrique |
| `oper_status` + `oper_reason` | état du lien, contrôles err-disabled, transceiver absent |
| `speed_mbps`, `duplex`, `media` | contrôles d'homogénéité dans un canal et aux deux bouts |
| `mac_address` | résolution d'un voisin LLDP par chassis-id ; corrélation MAC/ARP future |
| `last_change_age_seconds` | détection d'un flap entre deux runs |
| `type`, `parent_interface`, `vlan_id`, `ip_addresses` | filtrage L1 (physique + agrégat) ; overlay L3 |
| `switchport_mode`, `access_vlan`, `native_vlan`, `allowed_vlans` | VLAN non tagué comparé entre les deux bouts du câble (`native_vlan_mismatch`) ; vue L2 |
| `counters` | dégradation physique entre snapshots |

## 8. Journal des retours

- **2026-09-10 (Orhan)** : un topic = une commande, la librairie n'agrège pas ⇒
  répartition des demandes en §0 ; `run_id` par document retiré ; `collected_at` déplacé
  vers les tasks.
- **2026-09-09 (Orhan, 3)** : descriptions : champ 0 = criticité, le reste plus tard
  (§5.2) ; énumérations de `type` et statuts toujours attendues.
- **2026-09-09 (Orhan, 2)** : accord pour `run_id` et `collected_at` sur chaque document
  de run ; remarque sur `infrastructure` dupliqué corrigée (§3) : c'est la mémoire de
  l'appartenance au moment de la collecte, pas un simple index.
- **2026-09-09 (Orhan)** : `oper_reason` précisé avec définition, exemples par vendeur et
  règle de mapping RFC 2863 (§2.2) ; `last_change` maintenu au premier niveau, renommé
  `last_change_age_seconds`, brut conservé dans `extras`, règle « premier niveau ou
  extras » formalisée (§2.5) ; `domain` renommé `virtual_context`, `vrf` conservé,
  question d'identité châssis / contexte ajoutée (§3).
