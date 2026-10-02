# Collecte FortiOS : le topic `interfaces` en CLI

> 2026-09-24. Guide **producteur** : quelles commandes FortiOS lancer, dans quel ordre, pour remplir un document
> [`Interface`](../../contracts/CONTRAT.md#interface) du contrat RunBundle v1 sur un FortiGate. Périmètre demandé par
> Orhan : **le vital pour Living Diagram d'abord** ; une clé nullable à `null` n'est pas une faute, elle est comptée
> (`nullable_key_absent`) et doit tendre vers zéro avec le temps. Ce guide ne change rien au contrat : ce qui se passe
> dans le collecteur (driver, parseur) ne regarde pas Living Diagram, mais le contrat dit ce que B1 consomme, et c'est
> ce que ce guide traduit en commandes.
>
> Vérifié sur : fixtures FortiOS 5.6 → 7.4 de ntc-templates, articles de la base de connaissances Fortinet, référence
> `config system interface` du module Ansible officiel. **Non vérifié sur un FortiGate réel** : les extraits marqués
> « forme » sont reconstitués, pas capturés.

## 1. Pourquoi ce n'est pas « un `show interface` »

Sur NX-OS, `show interface` porte à la fois la configuration (description, vitesse configurée), l'état (link, vitesse
négociée, duplex, MAC) et les compteurs ; `show interface transceiver` complète le média. FortiOS sépare ces trois
choses dans trois familles de commandes :

| Famille | Ce qu'elle sait | Commandes |
|---|---|---|
| configuration | ce que l'admin a écrit : type, VDOM, statut administratif, description, parent / VLAN, membres, vitesse configurée, IP, VRF | `show full-configuration system interface`, `get system interface [<nom>]` |
| état noyau | ce que le noyau voit, pour **toutes** les interfaces (physiques, VLAN, agrégats, loopback, tunnels) : flags up / running, MTU, MAC courante, compteurs | `diagnose netlink interface list` |
| état du port physique | ce que le driver voit : link, vitesse négociée, duplex, MAC gravée, transceiver | `get system interface physical`, `diagnose hardware deviceinfo nic <port>`, `get system interface transceiver` |

Le besoin de B1 (contrat, § Interface : `name`, `type`, `description`, `admin_status`, `oper_status`, `oper_reason`,
`speed_mbps`, `duplex`, `mac_address`, `parent_interface`, `virtual_context`, plus `members` en repli) touche les trois
familles, d'où **trois commandes vitales**, pas une.

## 2. Avant la première commande

1. **Contexte VDOM.** `get system status` → ligne `Virtual domain configuration: disable | multiple | split-task`.
   Si ce n'est pas `disable`, entrer dans `config global` avant tout : les interfaces sont des objets globaux, et les
   trois commandes vitales s'exécutent là. Un `get system interface` lancé depuis une VDOM ne voit que cette VDOM.
2. **Pagination.** La CLI interactive coupe la sortie avec `--More--`. Soit exécuter les commandes en mode non
   interactif (`ssh fw "get system interface physical"`), soit désactiver la pagination pour la session
   (`config system console` / `set output standard`, réglage global persistant : à restaurer si la politique l'exige).
3. **Cluster HA.** La connexion à l'adresse du cluster aboutit sur le **primaire**. Le secondaire est un device à part
   entière dans `devices[]` (deux nœuds + cartouche HA) : il faut rejouer toute la séquence sur lui, via son interface
   de management dédiée (`ha-mgmt-interfaces`) ou par `execute ha manage <index> <admin>`. Sans cela, le secondaire n'a
   ni topic `interfaces` ni `lldp`, et ses câbles finissent `documented_only` depuis l'autre bout, au mieux.
4. **`hostname`.** `get system status` → `Hostname:`, à recopier octet pour octet depuis `devices[]`. Sur un cluster,
   chaque membre a le sien.

## 3. Chronologie (rollout)

| Étape | Commande | Portée | Sert à | Vital |
|---|---|---|---|---|
| 1 | `show full-configuration system interface` | globale, toutes les interfaces | **inventaire** et configuration : `name`, `type`, `virtual_context` (`set vdom`), `admin_status` (`set status`), `description`, `parent_interface` + `vlan_id` (`set interface`, `set vlanid`), `members` (`set member`), `configured_speed_mbps` / `auto_negotiate` (`set speed`), `ip_addresses` (`set ip`, `config secondaryip`, `config ipv6`), `vrf` (`set vrf`), `mtu` configuré, `dedicated-to management` | oui |
| 2 | `get system interface physical` | globale, ports physiques seulement | `oper_status` (link), `speed_mbps`, `duplex` ; complète l'inventaire (un port membre d'un hardware switch peut manquer à l'étape 1) | oui |
| 3 | `diagnose netlink interface list` | globale, **toutes** les interfaces | `mac_address` (`hw_addr=`) pour tout type, `oper_status` des logiques (flag `run`), `mtu` effectif, `counters` (`rxe`, `txe`, `rxd`, `txd`, `re: rxc`) | oui |
| 4 | `diagnose hardware deviceinfo nic <port>` | globale, un port physique à la fois | `Permanent_HWaddr` (MAC gravée), `auto_negotiate` effectif, détail des erreurs ; **format dépendant du driver** (NP6, NP7, Intel / SoC) | non |
| 5 | `get system interface transceiver` | globale, ports SFP / SFP+ / QSFP | `media` (type + constructeur + référence), `oper_status: not_present` quand le vendeur dit « Transceiver is not detected » | non |

Pourquoi cet ordre : l'étape 1 donne la liste des interfaces et leur nature, ce qui fixe **qui porte un câble**
(`physical` / `management` seulement, `correlate/claims.py`, `CABLE_BEARING`) ; les étapes 2 et 3 se joignent sur
`name` ; l'étape 2 avant la 3 parce que, pour un port physique, la vitesse et le duplex n'existent que là. Les étapes
4 et 5 sont des raffinements, une commande par port, à ajouter quand le reste tient.

**Jointure.** La clé est le nom d'interface, identique dans les cinq sorties (`port1`, `x1`, `agg-core`, `vlan100`).
Sur FortiOS il n'y a pas de forme courte / longue : le nom est canonique tel quel, casse comprise.

## 4. Les champs vitaux, un par un

| Champ | Source | Valeur dans le bundle |
|---|---|---|
| `name` | étape 1 `edit "<nom>"` (∪ étape 2 pour les ports absents de la configuration) | le nom tel quel |
| `type` | étape 1 `set type` (+ `set dedicated-to`) | tableau § 5 |
| `description` | étape 1 `set description` | brute ; `null` si absente. Voir § 7 sur `alias` |
| `admin_status` | étape 1 `set status up \| down` (toujours écrit en `full-configuration`) | `up` / `down` |
| `oper_status` | port physique : étape 2 `status: up \| down` ; autres : étape 3, flag `run` présent ⇒ `up`, absent ⇒ `down` | `up` / `down` ; `not_present` seulement avec l'étape 5 ; jamais deviné |
| `oper_reason` | aucune source : FortiOS ne motive pas un `down` | `null` (étape 5 : `"Transceiver is not detected"`) |
| `speed_mbps` | étape 2 `speed: 1000Mbps (Duplex: full)` (7.x) ou `speed: 1000full` (≤ 6.x) | entier ; `n/a` ⇒ `null` ; agrégat, VLAN, loopback ⇒ `null` |
| `duplex` | étape 2, même ligne | `full` / `half` ; `n/a` ⇒ `null` |
| `mac_address` | étape 3 `hw_addr=` (tout type) ; ou étape 4 `Current_HWaddr` (physique) | `aa:bb:cc:dd:ee:ff` minuscules ; `00:00:00:00:00:00` (loopback, tunnel) ⇒ `null`. Voir § 7 sur la MAC virtuelle HA |
| `parent_interface` | étape 1 `set interface "<parent>"` sur un `type vlan` | le nom du parent ; `null` sinon |
| `vlan_id` | étape 1 `set vlanid` | entier ; `null` sinon |
| `virtual_context` | étape 1 `set vdom "<nom>"` | le nom de la VDOM si `Virtual domain configuration` ≠ `disable` ; `null` sinon (châssis non partitionné, `root` compris) |
| `members` | étape 1 `set member "x1" "x2"` sur `type aggregate` / `redundant` **uniquement** | liste des noms ; `[]` partout ailleurs (B1 s'en sert comme repli quand `aggregates` n'est pas en succès, `context.py` : des membres sur un hardware switch fabriqueraient un faux agrégat) |
| `ip_addresses` | étape 1 `set ip a.b.c.d masque`, `config secondaryip`, `config ipv6` / `set ip6-address` | liste ; `0.0.0.0 0.0.0.0` ⇒ `[]` ; mode `dhcp` / `pppoe` : l'adresse courante est dans l'étape 2 (`ip:`) ou `diagnose ip address list` |

## 5. `set type` FortiOS → `InterfaceType` du contrat (proposition, à valider)

| `set type` | Contrat | Remarques |
|---|---|---|
| `physical` | `physical` | porte le câble ; `mgmt`, `ha1`, `wan1`, `x1`, `port1`, `internal1`… |
| `physical` + `set dedicated-to management` | `management` | porte le câble aussi (`CABLE_BEARING`) |
| `aggregate` | `aggregate` | `members` = `set member` ; le topic `aggregates` (`diagnose netlink aggregate name`) fait foi quand il existe |
| `redundant` | `aggregate` | paire active / secours sans LACP ; dans `aggregates`, protocole `static`. Alternative : `other` sans membres, mais on perd R1-bis |
| `vlan` | `subinterface` | `parent_interface` = `set interface`, `vlan_id` = `set vlanid` ; le parent peut être un agrégat |
| `switch-vlan` | `subinterface` | VLAN d'un hardware switch : parent = le switch, `vlan_id` |
| `switch`, `hard-switch` | `other` | interface L3 d'un domaine commuté (`internal`, `lan`, `fortilink`) ; ses ports en `extras.switch_ports`, jamais dans `members` |
| `loopback` | `loopback` | |
| `tunnel`, `ssl`, `vxlan`, `geneve`, `hdlc` | `tunnel` | |
| `vdom-link`, `emac-vlan`, `vap-switch`, `wl-mesh`, `fext-wan`, `lan-extension` | `other` | le type brut dans `extras.fortios_type` |

Règle de sécurité : seuls `physical` et `management` produisent des claims de câble dans B1. Une erreur de
classement dans l'autre sens (un port physique rangé en `other`) fait disparaître ses câbles sans contrôle ; une
erreur vers `physical` (un tunnel rangé en physique) ne dessine rien tant qu'aucune évidence ne le cite. En cas de
doute sur un type exotique, `other`.

## 6. Le reste des champs (null accepté)

| Champ | Source possible | Recommandation V1 |
|---|---|---|
| `configured_speed_mbps`, `auto_negotiate` | étape 1 `set speed auto \| 1000full \| 10000full \| 1000auto…` | `auto` ⇒ `null` + `true` ; `<n>full` ⇒ `n` + `false` ; `<n>auto` ⇒ `n` + `true` ; gratuit, à prendre |
| `mtu` | étape 3 `mtu=` | gratuit, à prendre |
| `counters` | étape 3 : `in_errors` = `rxe`, `out_errors` = `txe`, `in_discards` = `rxd`, `out_discards` = `txd`, `crc` = `re: rxc` | gratuit, à prendre |
| `vrf` | étape 1 `set vrf 0` ⇒ `"default"`, `set vrf 3` ⇒ `"3"` (contrat, § `null` et valeurs réservées) | gratuit sur les interfaces L3 ; `null` sur un port sans IP est acceptable |
| `media` | étape 5 : `SFP/SFP+` + `Vendor Name` + `Part No.` en chaîne brute (`SFP/SFP+ FINISAR CORP. FCLF-8521-3`) | plus tard |
| `last_change_age_seconds` | **aucune commande CLI** ne le donne (ni `deviceinfo nic`, ni `netlink`). Existe en SNMP (`ifLastChange`, IF-MIB) et dans le journal d'événements (`logid 0100020099`, « Interface status changed ») | `null` |
| `switchport_mode`, `access_vlan`, `native_vlan`, `allowed_vlans` | un FortiGate n'a pas de port commuté au sens Cisco (hors hardware switch) | `null` ; `routed` serait défendable sur une interface L3, sans intérêt tant que R5 n'est pas codée |
| `extras` | `alias`, `role`, `snmp-index`, `devindex`, `Permanent_HWaddr`, type FortiOS brut, ports d'un switch | libre |

## 7. Points à confronter (décisions producteur, pas contrat)

1. **`description` ou `alias` ?** Le contrat lit `description` (`criticité|device|port|options`). Sur FortiOS, `alias`
   est limité à 25 caractères et `description` à 255 : la convention ne tient pas dans `alias`. Si la production a mis
   la convention dans `alias`, il faut le savoir maintenant ; `alias` va dans `extras` de toute façon.
   **Cluster HA** (2026-10-02, tranché) : la configuration est partagée, les membres portent la même description ;
   elle s'écrit en forme positionnelle, `criticité|device₁|port₁|device₂|port₂`, une paire par membre dans l'ordre des
   **priorités HA décroissantes** (`diagnose sys ha status`, `usr_priority=`), et l'exportateur la copie telle quelle
   sur chaque membre : B1 choisit la paire d'après `ha[].members[].priority` (`docs/05` R2). Priorités égales ou non
   lues ⇒ aucun câble, contrôle `description_ha_unresolved`. Standalone : forme V1.
2. **MAC courante ou MAC gravée ?** Sur un cluster HA, `Current_HWaddr` (et `hw_addr=` de netlink) est la **MAC
   virtuelle HA** (`00:09:0f:09:…`), qui suit le rôle au basculement ; `Permanent_HWaddr` est la MAC gravée, stable.
   Proposition : `mac_address` = courante (c'est ce que la table MAC du switch d'en face apprendra, `docs/06`),
   `extras.permanent_hwaddr` = gravée. Conséquence : un basculement HA change `mac_address` entre deux runs ; c'est un
   fait du cluster, pas un bruit à masquer.
3. **Ports d'un hardware switch.** Sur les modèles d'entrée de gamme (`internal`, `lan`, `fortilink`), les ports
   membres peuvent n'apparaître que dans `config system virtual-switch` et à l'étape 2, pas comme `edit` de
   `system interface`. L'inventaire est donc **étape 1 ∪ étape 2**, et un port présent seulement à l'étape 2 est
   `physical`, description `null`. À vérifier sur les modèles du parc.
4. **`get system interface physical` change de forme entre versions** : `speed: 1000full` (≤ 6.x), `speed: 1000Mbps
   (Duplex: full)` (7.x), `speed: n/a` (port down). Le parseur doit accepter les trois ; les fixtures ntc-templates
   5.6 / 6.0 / 6.2 / 7.4 servent de jeu de test gratuit.
5. **`diagnose hardware deviceinfo nic` a au moins trois dialectes** (NP6 plat : `Admin`, `netdev status`, `Speed`,
   `Duplex`, `link_status` ; NP7 segmenté : `Admin`, `link_status`, `dev_running`, `dev_carrier` ; sans ASIC :
   `State`, `Link`, `Speed`, `Duplex`, `Auto`). C'est pour cela qu'il n'est pas vital : les étapes 2 et 3 couvrent le
   besoin avec des formats stables.
6. **Alternative hors CLI.** L'API REST `GET /api/v2/monitor/system/interface` renvoie par interface `link`, `speed`,
   `duplex`, `mac`, `ip`, compteurs, en JSON, sans parseur. Si la librairie de collecte sait parler HTTPS aux
   FortiGate, c'est la voie la plus stable ; ce guide reste valable pour la configuration (`type`, `vdom`, `member`,
   `vlanid`), que l'API expose aussi (`/api/v2/cmdb/system/interface`).

## 8. Extraits de référence

### Étape 1, forme (reconstituée)

```
config system interface
    edit "x1"
        set vdom "root"
        set type physical
        set alias "to-core-01"
        set description "C1|core-01|Ethernet1/49|"
        set speed auto
        set status up
        set vrf 0
        set snmp-index 5
    next
    edit "agg-core"
        set vdom "root"
        set ip 10.0.0.1 255.255.255.252
        set type aggregate
        set member "x1" "x2"
        set lacp-mode active
        set status up
        set vrf 0
    next
    edit "vlan100"
        set vdom "PROD"
        set ip 10.100.0.1 255.255.255.0
        set type vlan
        set interface "agg-core"
        set vlanid 100
        set status up
        set vrf 0
    next
end
```

### Étape 2, capturé (FortiOS 7.4, fixture ntc-templates)

```
== [onboard]
    ==[port1]
        mode: static
        ip: 0.0.0.0 0.0.0.0
        ipv6: ::/0
        status: up
        speed: 1000Mbps (Duplex: full)
        FEC: none
        FEC_cap: none
```

Port down : `status: down` puis `speed: n/a`. Forme ≤ 6.x : `speed: 1000full`.

### Étape 3, capturé (base de connaissances Fortinet, 2023)

```
if=port1 family=00 type=1 index=3 mtu=1500 link=0 master=0
flags=up broadcast run multicast
Qdisc=mq hw_addr=00:0c:29:fc:18:54 broadcast_addr=ff:ff:ff:ff:ff:ff
stat: rxp=61149 txp=81109 rxb=5839308 txb=52396373 rxe=0 txe=0 rxd=0 txd=0 mc=95 collision=0 @ time=1678486883
re: rxl=0 rxo=0 rxc=0 rxf=0 rxfi=0 rxm=0
te: txa=0 txc=0 txfi=0 txh=0 txw=0
misc rxc=0 txc=0
```

Selon la version, une ligne `ref=… state=start present fw_flags=0` précède `flags=`. `up` = administrativement
actif, `run` = porteuse présente (IFF_RUNNING) ; `master=` ≠ 0 = l'interface est esclave d'un agrégat ou d'un switch.

### Étape 5, capturé (FortiOS 7.x)

```
Interface port9 - SFP/SFP+
    Vendor Name  : FINISAR CORP.
    Part No.     : FCLF-8521-3
    Serial No.   : XXXXXXXXXX

Interface port10 - Transceiver is not detected.
```

Suivi d'un tableau optique (température, tension, Tx bias, Tx / Rx power) ; `N/A` partout pour un DAC ou un SFP
cuivre sans DDM, ce qui est normal.

## 9. Les autres topics, pour mémoire

- `aggregates` : `diagnose netlink aggregate list` puis `diagnose netlink aggregate name <nom>` (statut, mode LACP,
  membres avec `actor state` / `partner state` `ASAIEE` ⇒ `bundled` quand collecting et distributing sont `E`,
  `partner MAC address` = système LACP d'en face, utile à `docs/06`).
- `lldp` : `diagnose lldprx neighbor summary` et `diagnose lldprx port neighbor details <port>` (template
  ntc-templates existant) ; `set lldp-reception enable` doit être actif sur le port ou la VDOM.
- `ha` : `get system ha status`, `show system ha` (`hbdev` ⇒ `heartbeat_interfaces`).
- `system` : `get system status` (hostname, version, serial), `get system performance status` (uptime).

## Sources

- [Troubleshooting Tip: Network Interface Card NIC commands](https://community.fortinet.com/t5/FortiGate/Troubleshooting-Tip-Network-Interface-Card-NIC-commands/ta-p/195577)
- [Technical Tip: Understanding 'diagnose netlink interface list' full options](https://community.fortinet.com/fortigate-3/technical-tip-understanding-diagnose-netlink-interface-list-full-options-210867)
- [Technical Tip: How to check interface information via CLI](https://community.fortinet.com/fortigate-3/technical-tip-how-to-check-interface-information-for-example-link-status-via-cli-119340)
- [Technical Tip: Behavior of HA cluster unit Current_HWaddr and Permanent_HWaddr](https://community.fortinet.com/fortigate-3/technical-tip-behavior-of-ha-cluster-unit-current-hwaddr-and-permanent-hwaddr-181243)
- [Technical Tip: Initial troubleshooting steps for LACP](https://community.fortinet.com/fortigate-3/technical-tip-initial-troubleshooting-steps-for-lacp-link-aggregation-802-3ad-99760)
- [Technical Tip: Understanding the log message 'Interface status changed'](https://community.fortinet.com/fortigate-3/technical-tip-understanding-the-log-message-interface-status-changed-194382)
- [Technical Tip: How to check SFP transceiver module serial number and power](https://community.fortinet.com/fortigate-3/technical-tip-how-to-check-sfp-transceiver-module-serial-number-and-power-96380)
- [diagnose hardware deviceinfo nic : the complete field reference (InfoSec Monkey)](https://infosecmonkey.com/diagnose-hardware-deviceinfo-nic-the-complete-field-reference/)
- [get system interface transceiver : deep dive (InfoSec Monkey)](https://infosecmonkey.com/what-your-optics-are-trying-to-tell-you-a-deep-dive-into-get-system-interface-transceiver/)
- [ntc-templates, fixtures `fortinet_get_system_interface_physical_*.raw`, `fortinet_get_system_interface_*.raw`, `fortinet_get_hardware_nic_nic-name.raw`](https://github.com/networktocode/ntc-templates/tree/master/tests/fortinet)
- [Module Ansible `fortios_system_interface` (énumérations de `type`, `speed`, `dedicated-to`…)](https://github.com/fortinet-ansible-dev/ansible-galaxy-fortios-collection/blob/main/plugins/modules/fortios_system_interface.py)
- [napalm-fortios, `get_interfaces` (parse `Current_HWaddr`, `Admin`, `PHY Status`, `Speed`)](https://github.com/napalm-automation-community/napalm-fortios/blob/develop/napalm_fortios/fortios.py)
- [Virtual Domains, FortiOS 7.0 (valeurs de `Virtual domain configuration`)](https://docs.fortinet.com/document/fortigate/7.0.0/administration-guide/109991/virtual-domains)
