# 06 — L'évidence table MAC : conception (2026-10-03)

**Statut : proposition à valider avant toute ligne de code.** En une phrase : **la table MAC des switches sert à
dessiner les câbles des équipements qui ne parlent ni LLDP ni CDP, les firewalls d'abord.** Aujourd'hui ces câbles
n'existent que par les descriptions (`documented_only`, orange pointillé), source jugée peu fiable.

Référence d'entrée : `contracts/CONTRAT.md` partie A. Règles de B1 : `docs/05`. Doctrine : `CLAUDE.md`. Rangs validés
le 2026-09-20 : `lldp` / `cdp` > `mac_table` > `description`.

---

## 0. Ce que ce document décide

1. **Un nouveau topic d'entrée, `mac_table`, dynamique et restreint au parc** : une entrée par (switch, VLAN, MAC)
   dont la MAC est celle d'une interface d'un device du bundle. Le volume est borné par les ports du parc, jamais par
   les hôtes (§2).
2. **Une règle R7 dans B1** : une entrée dessine un câble **observé** (`source = mac_table`) seulement depuis un
   **port de bordure** : aucun voisin LLDP / CDP, et les MAC du parc apprises sur ce port appartiennent à un seul
   device, ou aux membres d'un seul cluster HA (§3).
3. **R3 ne change pas** : `mac_table` + description = `confirmed`, `mac_table` seule = `observed_only`, description
   qui contredit = `description_disagrees_with_observed`. La table MAC devient l'arbitre annoncé le 2026-09-20.
4. **Une MAC apprise sur un port-channel ne dit que le faisceau.** Le câble membre à membre vient de la résolution
   de R1-bis, appliquée des deux côtés ; sinon un lien entre les deux agrégats, `mac_learned_on_aggregate` (§3.4).
5. **Cluster HA à MAC virtuelle partagée** : la table MAC prouve le chemin du membre qui émet. En actif-passif, c'est
   le membre primaire ; les câbles du membre passif restent `documented_only`, la table MAC ne peut pas les prouver
   (§4). Prémisse à vérifier par Orhan en une commande (Q2).
6. **Hors périmètre** : ARP (ports routés, vue L3), partenaire LACP par membre, tables MAC des firewalls, entrées
   statiques, endpoints (§6).
7. **Versions** : RunBundle 1.0.0 modifié en place (avant le gel) ; Snapshot 1.0.0 → 1.1.0 (une source, une
   résolution, trois codes, une clé de couverture), snapshots recalculés par `ld correlate` (§5).

---

## 1. Ce qu'une entrée de table MAC dit, et ne dit pas

Une entrée `(VLAN v, MAC m, port p)` sur le switch S dit : **les trames de m arrivent sur S par p.** Rien de plus.

| Fait | Conséquence pour B1 |
|---|---|
| « Joignable par ce port », pas « voisin » | Un câble n'est dessiné que si p est un **port de bordure** : rien d'autre qu'un équipement terminal derrière. Un uplink vers un autre switch apprend toutes les MAC du parc : il ne dessine rien. |
| Une MAC s'apprend là où son propriétaire **émet** | Un équipement silencieux est invisible : membre passif d'un cluster, port en veille. Son câble reste `documented_only`. |
| Une MAC s'apprend sur le **port-channel**, jamais sur un membre | Pour un firewall en Po, l'entrée donne le faisceau ; le membre vient d'ailleurs (R1-bis, §3.4). |
| La table MAC est une table **L2** | Un port routé vers un firewall n'y apprend rien ; ce cas relève d'ARP, hors V1 (Q1). |
| Une entrée par VLAN | La même MAC apprise sur le même port dans dix VLAN est un seul fait pour le L1 ; B1 fusionne. |

---

## 2. Le topic `mac_table` (contrat d'entrée)

### 2.1 Le document

| Champ | Type | Requis | Signification |
|---|---|---|---|
| `hostname` | texte non vide | oui | Switch qui a appris l'entrée, identique octet pour octet à `devices[].hostname`. |
| `local_interface` | nom canonique | oui | Port d'apprentissage, `physical`, `management` ou `aggregate`, présent dans `interfaces[]` du switch (`local_interface_unknown` sinon, constat existant). |
| `mac_address` | MAC normalisée `aa:bb:cc:dd:ee:ff` | oui | Adresse apprise. |
| `vlan_id` | entier 1..4094 \| null | non (null si absente) | VLAN d'apprentissage ; `null` quand la plateforme n'en a pas (bridge-domain, table sans VLAN). |
| `extras` | objet libre | non | Détail brut vendeur (`age`, `secure`, `ntfy`…) ; jamais lu par B1. |

**Clé naturelle : `(hostname, vlan_id, mac_address)`.** Un switch apprend une MAC sur un seul port par VLAN ; deux
documents de même clé sont un bug de l'exportateur, **refus** `mac_entry_duplicate` (comme `duplicate_identity`).

### 2.2 Le périmètre du topic, qui est sa définition

Le contrat demande ce que B1 consomme, jamais ce qu'un producteur possède. B1 consomme deux sortes d'entrées, et
le topic se définit par elles :

- **dynamiques seulement** : une entrée statique est une configuration, pas une observation ; elle n'a pas de rang
  observé. Pas de champ `entry_type` : B1 ne le lirait pas. Perte assumée : les MAC « sticky » de port-security,
  affichées statiques, ne dessinent rien ;
- **restreintes au parc** : seules les entrées dont `mac_address` est le `mac_address` d'une interface présente dans
  `interfaces[]` du bundle (tous devices de la run confondus). C'est une jointure entre topics, donc le travail de
  B0 (`docs/03`) : l'ensemble des MAC du parc se construit en une passe sur `interfaces`, puis filtre chaque table.
  Une entrée qui échappe au filtre n'est pas refusée : constat **`mac_entry_without_owner`**, compté dans le rapport
  d'ingestion comme `nullable_key_absent`, doit tendre vers zéro (fuite du filtre, ou topic `interfaces` en échec
  chez le propriétaire : B1 l'ignore).

Ce que ça donne en volume : la table d'un cœur compte des dizaines de milliers d'entrées ; celles qui portent une
MAC du parc sont les interfaces des firewalls, des routeurs, les SVI des switches voisins, soit quelques dizaines par
switch, multipliées par les VLAN où elles apparaissent. **Le volume suit le nombre de ports du parc, pas le nombre
d'hôtes.** À calibrer sur le plus gros cœur (Q6).

**Recommandation au producteur, facultative, résultat identique** : ne pas envoyer les entrées des ports qui ont un
voisin LLDP / CDP dans la même run (uplinks, downlinks, peer-link). B1 les écarterait de toute façon (§3.2) ; les
retirer en amont divise encore le volume. B1 ne s'y fie jamais : s'il les reçoit, il les écarte lui-même.

Hors du topic, à retirer côté producteur : les entrées système dont le port n'est pas une interface (`sup-eth1`,
`CPU`, `Router`, `vPC Peer-Link` sur NX-OS, `Switch` sur IOS-XE).

### 2.3 Choix confrontés

- **`vlan_id` entre, bien que le L1 ne le consomme qu'en fusion.** C'est la clé de la table source, pas un champ
  « utile un jour » : sans lui, l'exportateur devrait dédoublonner lui-même et la clé changerait à l'arrivée du L2
  (VLAN, trunks), changement majeur du contrat. Alternative écartée : `(hostname, local_interface, mac_address)`
  dédoublonné en B0.
- **Pas de compte total de MAC par port.** Un critère « port à peu de MAC = bordure » demanderait au producteur de
  compter avant de filtrer. B1 juge la bordure avec ce qu'il a déjà : les voisins observés et le nombre de devices
  du parc derrière le port (§3.2). Perte assumée : un switch non géré, sans LLDP, qui ne porte qu'un firewall est
  indétectable ; le câble dessiné est alors « logique », ce que la description disait déjà.
- **Topic de switch.** `status_per_subject.mac_table` (alias amont à confirmer, Q5) n'existe que sur les plateformes
  qui ont une table MAC : NX-OS et IOS-XE (`show mac address-table dynamic`). Absent chez les firewalls et les
  routeurs : rien à attendre, aucune réciprocité (§3.5).

### 2.4 Commandes par plateforme, pour l'exportateur

Chronologie dans B0 : collecter `interfaces` d'abord (l'ensemble des MAC du parc en dépend), puis vider la table
dynamique de chaque switch, canonicaliser les noms de ports, normaliser les MAC, filtrer sur le parc, émettre. Les
entrées vieillissent (300 s par défaut sur IOS-XE, 1 800 s sur NX-OS) : collecter `mac_table` dans la même run,
après `interfaces`, pas dans une run à part.

| Plateforme | Commande | Ce qu'on en tire |
|---|---|---|
| **NX-OS** | `show mac address-table dynamic` (ou `… \| json` : `TABLE_mac_address.ROW_mac_address`, champs `disp_vlan`, `disp_mac_addr`, `disp_type`, `disp_port`) | une ligne par entrée dynamique ; ports en forme courte |
| **IOS-XE** (Catalyst) | `show mac address-table dynamic` (gabarit ntc-templates `cisco_ios_show_mac-address-table`) | une ligne par entrée dynamique ; ports en forme courte |
| **IOS-XR** (routeurs WAN) | aucune table MAC hors bridge-domains L2VPN | topic **absent** de `status_per_subject` : rien à attendre |
| **FortiOS** | `diagnose netlink brctl name host <switch>.b` n'existe qu'en hardware switch ou mode transparent | **hors V1** : un firewall ne produit pas `mac_table` |
| **Gaia** (Checkpoint) | routé, pas de table L2 ; `arp -an` est de l'ARP | **hors V1** |

Correspondance des colonnes :

| Colonne | NX-OS | IOS-XE | Champ du contrat |
|---|---|---|---|
| VLAN | `400`, `-` pour une MAC routée | `100`, `All` pour une entrée système | `vlan_id` ; `-` et `All` n'arrivent jamais sur une entrée dynamique d'un port |
| MAC | `0009.0f09.0004` | `0009.0f09.0004` | `mac_address` = `00:09:0f:09:00:04` (normalisation `mac_dotted_to_colon`, comptée dans `residual_normalizations` si elle n'est pas faite par la librairie) |
| Type | `dynamic` ; drapeaux `G` (passerelle), `C` (control-plane), `O` (overlay), suffixe `(R)` | `DYNAMIC` / `STATIC` | pas de champ : seul `dynamic` est émis |
| Port | `Po20`, `Eth1/41`, `sup-eth1(R)`, `vPC Peer-Link`, `nve1` | `Gi1/0/1`, `Po1`, `CPU`, `Switch`, `Drop` | `local_interface` canonique : `port-channel20`, `Ethernet1/41` ; `Port-channel1`, `GigabitEthernet1/0/1`. Un port qui n'est pas une interface du device ne s'émet pas |

Forme reconstituée, NX-OS :

```
   VLAN     MAC Address      Type      age     Secure NTFY Ports
---------+-----------------+--------+---------+------+----+------------------
*  400     0009.0f09.0004   dynamic  0         F      F    Po20        ← émise : port-channel20
+  400     0009.0f09.0005   dynamic  0         F      F    Po21        ← émise : apprise par le pair vPC, portée par le Po local
G    -     5c71.0d7a.1234   static   -         F      F    sup-eth1(R) ← jamais émise
```

Le `+` (« primary entry using vPC Peer-Link ») est **conservé** : les deux pairs d'un vPC portent la MAC sur leur
propre `Po`, que la trame soit arrivée par l'un ou l'autre ; c'est ce qui donne à chaque cœur le câble de son membre
(§3.4, rang 1). Le filtre « MAC du parc » se fait **après** le vidage complet, en B0, jamais par une commande par MAC
(`show mac address-table address …` multiplierait les appels).

Forme reconstituée, IOS-XE :

```
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
 100    0009.0f09.0004    DYNAMIC     Gi1/0/1    ← émise : GigabitEthernet1/0/1
 100    0009.0f09.0006    DYNAMIC     Po1        ← émise : Port-channel1 (uplink : B1 l'écartera, ou le filtre facultatif)
```

---

## 3. R7 — De la table MAC aux claims (B1)

**Place dans la chaîne** : après `collect_claims` (R0 à R2) et **avant** `resolve_aggregate_ports` (R1-bis), qui
reciblera les claims `mac_table` visant un agrégat comme il recible ceux de LLDP. R7 a besoin des claims observés
par port pour juger la bordure.

### 3.1 Propriétaire d'une MAC

Index `MAC → interfaces du parc qui la portent` (`Context.ports_by_mac` existe déjà pour R1). Pour une entrée
`(S, p, m)` : propriétaires = interfaces portant `m`, **hors S lui-même**. Aucun : entrée sans propriétaire,
comptée, rien d'autre.

### 3.2 Port de bordure

Les entrées sont groupées par port témoin `(S, p)`. Le port est de bordure si :

1. aucun claim observé (`lldp`, `cdp`) ne part de `p`, ni d'un membre de `p` si `p` est un agrégat, ni de l'agrégat
   de `p` si `p` est un membre, **vers un autre device que le propriétaire** ; un voisin LLDP qui est le propriétaire
   lui-même (FortiGate avec LLDP, cas R1-bis) ne disqualifie pas : l'entrée rejoint le même câble ;
2. les propriétaires des MAC du parc apprises sur `p` forment **un seul device**, ou **les membres d'un seul cluster
   HA** (clé de cluster de R4, §4).

Sinon : voisin observé différent ⇒ rien, c'est un uplink ordinaire ; plusieurs devices sans voisin observé ⇒ contrôle
**`mac_port_sees_several_devices`** (info, sur le port témoin, `details.devices` triés) : un switch inconnu, sans
LLDP, est probablement derrière.

### 3.3 Port cible chez le propriétaire

Parmi les interfaces du propriétaire qui portent `m` :

- une seule, `physical` ou `management` : c'est le bout d'en face ;
- un agrégat et ses membres (FortiGate : les membres portent la MAC de l'agrégat, la famille H2) : le claim vise
  **l'agrégat**, R1-bis le ramène au membre par ses rangs (observation inverse, membre unique, description) ou
  arrête le câble à l'agrégat avec `remote_port_is_aggregate` ;
- aucune interface physique (MAC d'une SVI, d'un loopback) : la MAC ne dit rien du câble, pas de claim, rien ;
- plusieurs interfaces physiques sans agrégat commun : contrôle **`mac_owner_ambiguous`** (warning, sur le port
  témoin, `details.mac`, `details.candidates`), aucun câble.

### 3.4 Port témoin agrégat

Quand `p` est un port-channel (le cas des firewalls en vPC), le claim doit partir d'un membre pour donner un câble :

1. **membre unique** de `p` sur S (un vPC a un membre par cœur) : le témoin devient ce membre ;
2. **description** d'un membre de `p` citant le device propriétaire et un port : chaque membre qui cite prend sa paire ;
3. sinon le témoin reste l'agrégat : **un lien entre les deux agrégats**, `observed_only`, contrôle
   **`mac_learned_on_aggregate`** (warning, `details.aggregate`, `details.members` des deux côtés). Il sera résorbé
   par le partenaire LACP par membre, hors V1.

R3 doit accepter un témoin de type agrégat (aujourd'hui seul le bout distant peut l'être, R1-bis) : point
d'implémentation, pas de design.

### 3.5 Le claim, et ce que R3 en fait

Claim `source = mac_table`, témoin `(S, p)` résolu, `remote_raw = {name: m, port: null}`, `remote_resolved` = le bout
d'en face, `resolution = mac_address` (nouveau niveau). Puis R3 inchangé :

| Situation | Résultat |
|---|---|
| `mac_table` seule | câble `observed_only` |
| `mac_table` + description concordante (même device, et même port, ou port non cité, ou agrégat ↔ membre) | câble `confirmed` |
| description du port témoin vers un **autre** device ou port | câble observé dessiné, `description_disagrees_with_observed` sur le port qui documente |
| `lldp` / `cdp` déjà présents sur le même câble | une évidence de plus, même câble |
| description seule, MAC jamais apprise sur S | `documented_only`, inchangé : silence du propriétaire ou description fausse, indécidable |

**Pas de réciprocité** : la table MAC est à sens unique par nature, `one_way_observation` ne la concerne jamais.
`documented_not_observed` garde sa sévérité actuelle. Device propriétaire injoignable : ses `interfaces[]` manquent,
ses MAC sont inconnues, ses entrées sont sans propriétaire ; ses câbles restent `documented_only` depuis l'autre bout
(docs/05 §8, question 5), cohérent.

**Rapport** : `report.mac_table = {entries, drawn, non_border, without_owner}`. Déterminisme : propriétaires et ports
parcourus triés, jamais un ensemble.

---

## 4. Cluster HA à MAC virtuelle partagée : ce que la table MAC prouve

Sur un cluster FortiGate (FGCP), chaque interface porte une **MAC virtuelle identique sur tous les membres** ;
`interfaces[].mac_address` = cette MAC courante (guide FortiOS, validé le 2026-10-03). En actif-passif, seul le
primaire émet sur ses ports de données : le cœur apprend la MAC virtuelle **sur le port câblé au primaire**, et rien
sur le port câblé au secondaire.

**Règle** : quand les propriétaires d'une MAC sont plusieurs devices, tous membres d'un même cluster (R4) :

1. cluster en `active_passive` et **exactement un** membre de rôle `primary` ou `active` (vue propre de R4) : c'est
   lui, par la physique du mode ; une description du port témoin qui nomme l'autre membre est un désaccord ordinaire,
   visible ;
2. sinon (`active_active`, rôles non lus, deux primaires) : la **description du port témoin** nomme un membre, c'est
   lui ;
3. sinon `mac_owner_ambiguous`, `details.candidates` = les membres, aucun câble.

**Conséquences à assumer, dites à Orhan** : les câbles du membre passif restent `documented_only` tant qu'il n'émet
pas ; après une bascule, l'évidence `mac_table` change de membre d'une run à l'autre, et B3 le montrera. C'est le
chemin actif qui est prouvé, pas le câblage complet. Le câblage complet viendra du partenaire LACP (hors V1).

**Prémisse à vérifier (Q2)** : la table MAC du port-channel vers le secondaire est vide. Si elle ne l'est pas
(secondaire qui émet), le rang 1 saute et la description décide seule ; le code sera écrit avec ce rang isolé.

Checkpoint ClusterXL : les interfaces physiques gardent chacune leur MAC, seules les VIP ont une MAC de cluster ;
aucune ambiguïté attendue, à confirmer (Q4).

---

## 5. Ce qui change dans les contrats

| Contrat | Changement | Nature |
|---|---|---|
| RunBundle | section `mac_table[]` (liste, requise, vide acceptée), modèle `MacEntry`, refus `mac_entry_duplicate`, constat `mac_entry_without_owner`, alias de topic, `TOPIC_FIELDS` | 1.0.0 modifié en place : avant le gel, les exportateurs ajoutent `"mac_table": []` |
| Snapshot | `EvidenceSource.mac_table` (observé), `Resolution.mac_address`, codes `mac_owner_ambiguous` (warning), `mac_learned_on_aggregate` (warning), `mac_port_sees_several_devices` (info), `TopicCoverage.mac_table`, `report.mac_table` | 1.0.0 → **1.1.0** ; le snapshot est dérivé : `ld correlate` recalcule l'archive |
| Fixture et golden | `bundle-minimal.json` gagne une `mac_table` sur `sw-core-01` seulement (Po20 apprend la MAC de `agg-core` en VLAN 400 ⇒ `Ethernet1/3 ↔ x1` passe `confirmed`, scénario 12) ; `sw-core-02` sans le topic garde `Ethernet1/4 ↔ x2` en `documented_only` (scénario 4 conservé, et la couverture testée) | golden régénéré, jamais édité |
| Anonymiseur | rien : les MAC sont déjà remplacées de façon cohérente entre topics | |

Page `ld render` : « table MAC » comme source dans le panneau d'un câble, l'onglet Sources et la légende des
sources ; colonne `mac_table` dans la couverture ; compteurs du rapport dans Qualité des données. Couleurs par statut
inchangées.

Générateur : émission de `mac_table` par l'exportateur parfait sur NX-OS et IOS-XE (filtre du parc seul, pour exercer
la règle de bordure) ; **MAC virtuelle HA partagée** entre les membres FortiGate et MAC de l'agrégat sur ses membres,
apprise sur le vPC du primaire seulement ; `ha_failover` déplace alors l'évidence, ce que les tests de B3 liront dans
le manifeste.

---

## 6. Hors périmètre, volontairement

- **ARP** : seule évidence sur un port routé ; entre plus tard, au même rang que `mac_table`, avec la même forme de
  règle, additif (Q1 dit si le besoin est réel).
- **Partenaire LACP par membre** (`show lacp neighbor`) : donne le membre à membre même sur un membre passif ;
  résorbe `mac_learned_on_aggregate` et le câblage du membre HA passif. Topic à concevoir après le premier retour.
- **Tables MAC des firewalls** (mode transparent, hardware switch) : B1 ne consomme rien de tel.
- **Entrées statiques**, **endpoints** (V1 sans endpoints, 2026-10-03) : rien.
- **VLAN dans l'évidence** : non reporté dans le snapshot en V1 ; reviendra avec la vue L2.

---

## 7. Plan, après validation (chaque étape annoncée avant le code)

1. **Contrat** : `MacEntry`, validateur, schéma régénéré, `CONTRAT.md`, fixture, README § Décisions ; tests.
2. **B1** : `correlate/mac.py` (R7, §3), R3 acceptant un témoin agrégat, codes du Snapshot, golden régénéré ; tests
   sur la fixture (scénarios 4 et 12) et sur les séries du générateur.
3. **Page** : source, couverture, compteurs ; capture Chromium.
4. **Générateur** : émission `mac_table`, MAC virtuelle HA, MAC d'agrégat sur les membres.
5. **Une revue indépendante**, consignée dans `docs/revues/` et traitée.

---

## 8. Questions pour Orhan (réponses en mots, aucun bundle)

1. **Raccordement des firewalls** : toujours en L2 (trunk ou vPC, SVI côté cœur) ? Existe-t-il des ports **routés**
   vers un firewall ? Si oui, ARP entre au plan.
2. **Prémisse de §4** : sur un cœur, `show mac address-table interface port-channel<N>` vers le membre
   **secondaire** d'un cluster FortiGate actif-passif : vide ?
3. **MAC des membres d'agrégat FortiGate** : sur un membre, `diagnose netlink interface list x1` montre-t-il la même
   `hw_addr` que `agg-core` ?
4. **Checkpoint** : les interfaces physiques de deux membres ClusterXL ont-elles des MAC distinctes, et l'exportateur
   met-il bien la MAC physique dans `interfaces[].mac_address` ?
5. **Nom amont du topic** dans la librairie de collecte : `mac_table`, `mac_address_table`, autre ? (alias du
   contrat.)
6. **Volume**, non bloquant : sur le plus gros cœur, `show mac address-table dynamic | count` et le nombre d'entrées
   dont la MAC est dans le parc.

Les questions 1 et 2 changent une règle (ARP au plan ; rang 1 de §4). Les autres changent des noms ou confirment des
hypothèses déjà prudentes.
