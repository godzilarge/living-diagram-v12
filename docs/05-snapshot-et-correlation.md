# 05 — Le snapshot et la corrélation B1 : conception (2026-09-10)

**Statut : proposition à valider avant toute ligne de code.** Ce document décrit la sortie de
B1 (le snapshot, second contrat du projet) et les règles qui la produisent à partir d'un
RunBundle. Chaque règle est rattachée au scénario de `contracts/fixtures/bundle-minimal.json`
qui la testera. Les questions ouvertes sont en §8 ; le plan de tests en §7.

Référence d'entrée : `contracts/CONTRAT.md` (RunBundle v1). Doctrine : `CLAUDE.md`.

> **Vocabulaire, pour lever une confusion légitime.** Le *snapshot* est un **objet** : le graphe d'une
> run, tel que B1 l'a calculé. **B1** est la fonction qui le fabrique. **B2 (Archive)** est l'étagère
> qui range chaque snapshot, immuable, à côté du bundle dont il vient. **B3** compare deux snapshots.
> Analogie : B1 est l'appareil photo, le snapshot est la photo, B2 est l'album, B3 met deux photos côte
> à côte. Ce document décrit la photo et l'appareil, pas l'album.

---

## 0. Ce que ce document décide

1. **Le snapshot est un contrat**, au même titre que le RunBundle : modèles Pydantic figés,
   JSON Schema versionné, documentation générée, fixture de référence. Il vit dans le paquet
   `ld-contracts`, module `snapshot`, et `CONTRAT.md` gagne une seconde partie « Sortie ».
   Votre exportateur n'importe jamais ce module (recommandation, §6).
2. **B1 est une fonction pure** `correlate(bundle) -> Snapshot`, déterministe à l'octet : même
   bundle, même snapshot ; bundle dont on permute les sections, même snapshot.
3. **Un seul graphe, des arêtes typées.** La V1 ne produit que des câbles (L1). Les autres
   types d'arête (segment L2, adjacence L3, session BGP) sont réservés dans l'énumération,
   pas produits.
4. **Rien d'inventé, rien de résolu en silence.** L'observé (LLDP, CDP) dessine le câble ; le
   documenté (description) le confirme ou le commente ; tout désaccord devient un contrôle
   d'intégrité porté par le snapshot.

---

## 1. Position dans la chaîne

```
RunBundle (validé, archivé)  ──►  B1 correlate()  ──►  Snapshot + contrôles + rapport
                                                         │
                                          B2 Archive range (immuable, par run) · B3 diffe · API sert
                                                         │
                                          moteur TS : B5 analyse · B6 scène · B7 placement …
```

Le snapshot est la **couche C0** de l'artefact : immuable, par run, seule chose que le diff
compare. Une fois rangé par B2, il ne change plus. Il embarque ce qu'il faut pour être lu sans
le bundle : les devices du périmètre, le statut de collecte par device et par topic, la
provenance (run, empreinte du bundle).

---

## 2. Le modèle du snapshot

```
Snapshot
├── snapshot_version           semver du contrat de sortie, indépendant de celui du RunBundle
├── source                     infrastructure · collector_run_id · bundle_sha256 · produced_at · run (début, fin, statut)
├── nodes[]                    device | external | stub          clé : hostname (ou nom annoncé pour un stub)
├── interfaces[]               une par (hostname, name) du bundle, description parsée, appartenance à un agrégat
├── links[]                    arêtes typées ; V1 : kind = cable  clé : paire d'endpoints triée
├── aggregates[]               (hostname, name) : membres et états, protocole, mlag
├── mlag_domains[]             paires d'agrégats liées par un mlag_id                   clé : (mlag_id, hostnames triés)
├── ha_clusters[]              membres, mode, rôles, états, interfaces de heartbeat    clé : hostnames des membres triés
├── checks[]                   contrôles d'intégrité : code, sévérité, références, détails
├── coverage[]                 par device : statut de collecte et statut par topic
└── report                     comptes, normalisations résiduelles (B0) et appliquées (B1), noms non résolus
```

Aucun horodatage propre à B1, aucun identifiant synthétique, aucune coordonnée : tout ce qui
est dans le snapshot vient du bundle ou d'une règle déterministe.

### 2.1 Nœuds

| Champ | Contenu |
|---|---|
| `kind` | `device` (dans l'infrastructure), `external` (présent dans `devices` mais d'une autre infrastructure, matérialisé seulement s'il est cité), `stub` (cité par une évidence, inconnu de `devices`) |
| `hostname` | clé. Pour un stub : le nom annoncé, tel quel, après `casefold` |
| `type`, `vendor`, `model`, `site`, `os_name`, `os_version`, `serial_number` | copiés de `devices` ; `null` pour un stub. `os_name` et `os_version` nourrissent l'inspecteur (« NX-OS 10.4(2) ») ; décision 2026-09-14 |
| `reported_hostname`, `uptime_seconds`, `virtual_contexts` | de `system[]` |
| `stack` | `{member_count, members[]}` depuis `system[].chassis_members` ; source du badge ×N |
| `collection` | `unreachable`, `partial`, `failed`, `success`, ou `not_collected` (device en périmètre sans task) ; égal à `coverage[].status` du même device (vérifié) |
| `evidence` (stub / external) | ce que les voisins en disent : `seen_by[]` (hostname, interface, source) et capacités annoncées. Rien d'autre depuis le 2026-09-18 : les topics `lldp` et `cdp` ne portent plus ni chassis-id, ni IP de management, ni system-description, ni plateforme |

**Champs par sorte, vérifiés par le contrat** (2026-09-20) : `device` = `collection` et `type` renseignés,
`evidence` null ; `external` = `evidence` et `type` renseignés, `collection` null, rien de `system`
(`reported_hostname`, `uptime_seconds`, `stack` null, `virtual_contexts` vide : un device d'une autre
infrastructure n'a aucun document de topic dans le bundle) ; `stub` = `evidence` renseigné, tout le reste
null ou vide, `hostname` en `casefold`.

**Les stubs restent dans le snapshot, la vue décide de les montrer** (2026-09-18). La cible du moment est la
topologie réseau : serveurs, téléphones et bornes ne sont pas dessinés. B1 ne filtre rien pour autant (pas
de disparition silencieuse, et la décision est réversible sans recalcul) : la vue réseau masque par défaut
les nœuds `stub`, avec un filtre sur `kind` et sur les capacités annoncées (`station`, `telephone`,
`wlan_access_point`…). C'est la raison d'être de `neighbor_capabilities` dans le contrat.

### 2.2 Interfaces

Une par document `interfaces[]` du bundle, clé `(hostname, name)`. B1 garde le sous-ensemble
utile au L1 (`type`, `admin_status`, `oper_status`, `oper_reason`, `speed_mbps`, `duplex`,
`mac_address`, `media`, `parent_interface`, `virtual_context`, `last_change_age_seconds`) plus
ce qui prépare les vues L2 / L3 (`vlan_id`, `switchport_mode`, `access_vlan`, `native_vlan`, `allowed_vlans`, `ip_addresses`,
`vrf`). `vrf` (2026-09-19) : `"default"` = table globale, nom réservé ; autre texte = VRF nommée ; `null` = non lu
ou sans objet (port commuté), jamais « table globale ». B1 s'en sert comme clé `(hostname, vrf)` sans cas
particulier. `last_change_age_seconds` vaut `entier ≥ 0 | "never" | null` (2026-09-16) : B1 lit
`"never"` comme un âge ≥ `uptime_seconds` du nœud, donc aucun flap depuis le boot ; `null` ne
permet aucune conclusion. `access_vlan` (2026-09-16) : VLAN d'un port access ; le VLAN non tagué d'un
port vaut `access_vlan` en access, `native_vlan` en trunk, et c'est lui que `native_vlan_mismatch`
(R5) compare entre les deux bouts d'un câble ; `allowed_vlans` (liste d'intervalles `{first, last}`, fusionnée et triée par B1 en R6) nourrit la
vue L2 (VLAN portés par un trunk). Il ajoute :

- `description_parsed` : `{criticality, neighbor, port, options}` ou `null` ; la description
  brute est conservée à côté.
- `aggregate` : `{name, member_status}` si l'interface est membre d'un agrégat (source :
  `aggregates[]`, sinon `interfaces[].members`).
- `roles` : ensemble parmi `heartbeat` (citée dans `ha[].heartbeat_interfaces`),
  `mlag_peer_link` (membre d'un agrégat peer-link).

### 2.3 Liens

| Champ | Contenu |
|---|---|
| `kind` | `cable` en V1. Réservés : `l2_segment`, `l3_adjacency`, `bgp_session` |
| `a`, `b` | endpoints `{hostname, interface}` **triés** ; la clé du lien est cette paire, jamais un id |
| `status` | `confirmed` (observé et documenté), `observed_only`, `documented_only` |
| `evidence[]` | chaque témoignage : `source` (`lldp`, `cdp`, `description`), `witness` (endpoint qui témoigne, l'un des deux bouts ; nommé `from` jusqu'au 2026-09-20, mot réservé en Python), `remote_raw` (`{name, port}` tels qu'annoncés, `port` null si la source n'en donne pas), `remote_resolved` (endpoint après résolution et normalisation), `resolution` (`hostname`, `hostname_casefold`, `reported_hostname`, `address`, `stub`). Le `status` du lien se déduit des sources présentes et le contrat le vérifie |
| `oper` | `up` si les deux bouts sont `up`, `down` si l'un est `down`, `unknown` sinon |
| `speed_mbps` | commune si égale aux deux bouts, sinon `null` et contrôle |
| `aggregate_a`, `aggregate_b` | nom de l'agrégat de chaque bout, `null` sinon ; les câbles d'un même agrégat forment un faisceau (B8) |

Un lien vers un stub a pour endpoint `{hostname: <nom annoncé>, interface: <port annoncé>}` ; si le port
annoncé est une MAC, elle reste le nom du port (R1).

**Clé sans `kind` en V1** (2026-09-20) : deux arêtes de sortes différentes entre les mêmes ports (un câble et
un segment L2) seraient un doublon. Quand `l2_segment` / `l3_adjacency` seront produits, la clé devra inclure
`kind` : changement majeur de `snapshot_version`, à prévoir avec les vues L2 / L3.

### 2.4 Agrégats et domaines MLAG

`aggregates[]` reprend `aggregates[]` du bundle (membres et états, protocole, `min_links`,
`mlag_id`, `mlag_peer_link`) et y ajoute `cables[]` (les liens de ses membres) et `degraded`
(au moins un membre non `bundled`).

`mlag_domains[]` : deux agrégats de deux devices distincts portant le même `mlag_id` forment
un domaine `{mlag_id, members: [(hostname, aggregate)], peer_link: (hostname, aggregate) | null,
downstream: hostname | null}`. `downstream` est le device au bout des câbles des deux agrégats
s'il est unique ; sinon contrôle.

### 2.5 Clusters HA

Un cluster par ensemble de membres (clé : hostnames triés), construit depuis tous les documents
`ha[]` qui le décrivent (un par membre joignable). Champs : `mode`, `cluster_name`, `members[]`
(`hostname`, `role`, `state`, `priority`, `reported_by[]`), `heartbeat_interfaces[]`
(`{hostname, interface, cable: clé du lien | null}`). **Aucun câble n'est créé** pour un
heartbeat qui n'est ni observé ni documenté : le cartouche du cluster relie les membres, et un
contrôle signale le heartbeat sans câble.

### 2.6 Contrôles

`{code, severity, origin, refs[], details}` avec `severity ∈ {error, warning, info}`, `origin ∈ {correlation,
bundle}` et `refs` typées (`node`, `interface`, `link`, `aggregate`, `cluster`), triées. Les constats du contrat
(`ld_contracts.checks`, par exemple `reported_hostname_differs`) sont recopiés avec `origin = bundle`
(champ à part, pas une clé de `details` ; 2026-09-20). **Une référence désigne toujours un élément du
snapshot** : quand un témoin `lldp` / `cdp` cite un port local absent de `interfaces[]` (constat
`local_interface_unknown`, ou topic `interfaces` en échec alors que `lldp` a réussi), la référence se replie sur
le **nœud** et le nom du port passe dans `details.interface` (revue du 2026-09-20, C1). `code` est une énumération fermée
(`ld_contracts.snapshot.codes.CheckCode`), la sévérité doit être admise par le catalogue, `details` ne contient
que des valeurs JSON (`pydantic.JsonValue`). Les codes de B1
sont listés en §4 avec leur règle.

### 2.7 Couverture et rapport

`coverage[]` : par device en périmètre, `status` de la task (`not_collected` sans task) et `topics`, objet à six
clés fixes (`interfaces`, `aggregates`, `lldp`, `cdp`, `system`, `ha`) valant `success | failed | absent`. C'est ce qui permet de dire « ce câble n'est pas vu parce que LLDP n'a pas été
collecté », et non « il n'existe pas ». Un topic se lit sous son **nom canonique d'abord, puis sous ses alias par
ordre alphabétique** (`aggregates`, puis `etherchannels`, `port_channels`) : le premier présent dans la task donne le
statut. L'ordre est écrit, jamais celui d'un ensemble, qui change d'un processus Python à l'autre (contre-revue du
2026-09-20, H1 : le même bundle donnait deux snapshots selon `PYTHONHASHSEED`).

`report` : comptes par section, `residual_normalizations` recopié du bundle, `applied_normalizations`
(compteur par règle de B1, par exemple `ifname_short_to_long`), `unresolved_names[]` (noms de
voisins finis en stub, **dans l'écriture annoncée** : `SRV-Z` et `srv-z` y figurent tous deux alors qu'ils désignent
le même stub, replié en `srv-z`), `unparseable_descriptions` (compte).

**Clés nullables absentes (2026-09-19) : hors du snapshot, à côté de lui.** Une clé nullable absente du
bundle est lue comme `null` et comptée par le validateur (constat `nullable_key_absent`, un par champ,
`contracts/README.md` § Décisions). Ce compte **n'entre pas dans le snapshot** : il décrit la livraison
(les octets reçus), pas le contenu du bundle. L'archive garde la forme canonique, où toutes les clés sont
écrites ; un bundle relu depuis l'archive ne sait plus ce qui manquait. Si B1 le recopiait, ingestion et
rejeu donneraient deux snapshots différents pour le même bundle : le déterminisme est la condition du
diff, il prime. Le compte vit donc dans le **rapport d'ingestion**, archivé avec le bundle
(`report.json`), et l'API sert les deux rapports ensemble pour une run : l'inspecteur de run affiche
« ingestion » (clés absentes, constats du contrat) puis « corrélation » (`report` ci-dessus). Même statut
que `residual_normalizations` : doit tendre vers zéro. À l'inverse, les constats de
`ld_contracts.checks` se recalculent depuis le contenu : eux restent recopiés dans les contrôles (§2.6).

---

## 3. Règles de corrélation, dans l'ordre d'exécution

### R0 — Identité et résolution des voisins

Les devices en périmètre deviennent des nœuds `device`. Un nom de voisin (LLDP `neighbor`,
CDP `neighbor`, champ 1 d'une description) est résolu dans cet ordre, et le premier niveau qui
répond gagne :

| Ordre | Méthode | Contrôle émis si c'est ce niveau qui résout |
|---|---|---|
| 1 | égalité octet pour octet avec `devices[].hostname` | aucun |
| 2 | égalité après `casefold` | `neighbor_name_case_differs` (info) |
| 3 | égalité avec `system[].reported_hostname` d'un device, octet pour octet puis après `casefold` | `neighbor_resolved_by_reported_hostname` (warning : l'inventaire et l'équipement ne portent pas le même nom) |
| 4 | le nom annoncé **est** une adresse (voisin sans system-name) : MAC = `interfaces[].mac_address` d'un device, IP = une `ip_addresses[].address` d'un device, **comparée sur sa valeur** et non sur son écriture (`2001:DB8:0::1` = `2001:db8::1`) ; un stub nommé par une IP porte la forme canonique | `neighbor_resolved_by_address` (warning) |
| 5 | rien | nœud `stub`, `neighbor_unknown` (info), nom ajouté à `report.unresolved_names` |

Un voisin résolu vers un device d'une **autre infrastructure** devient un nœud `external`.
Un nom en forme de MAC ou d'IP est **d'abord un nom** : les niveaux 1 et 2 sont essayés sur l'écriture annoncée
puis sur la forme canonique de l'adresse (un device inventorié sous son IP annonce cette IP ; contre-revue du
2026-09-20, H3), puis il passe directement au niveau 4, puis stub. Aux niveaux 3 et 4, si
**plusieurs devices** répondent (nom d'usine partagé, MAC virtuelle, VIP), aucun ne gagne : stub et
contrôle `neighbor_name_ambiguous` (warning).

**Révision du 2026-09-18.** Les anciens niveaux 3 à 5 joignaient sur ce que le voisin annonçait de
lui-même (serial CDP, chassis-id LLDP, IP de management), champs retirés du contrat. Les niveaux par
chassis-id et par IP exigeaient les `interfaces[]` du voisin, donc un voisin collecté, et un voisin
collecté a aussi son `reported_hostname` : le nouveau niveau 3 les remplace sans perte. Seule perte
assumée : un voisin présent dans `devices`, dont le nom annoncé diffère de l'inventaire **et** injoignable
à cette run (le serial CDP le rattrapait sans collecte) ; il finit en stub visible, à côté de son nœud
`unreachable`.

### R1 — Normalisation des noms d'interfaces distants

Les noms **locaux** sont canoniques par contrat. Les noms **distants** sont bruts. B1 les
ramène à la forme canonique du device résolu :

- si le device résolu a des `interfaces[]`, la forme retenue est celle qui existe chez lui,
  en essayant le nom brut puis son expansion Cisco (`Gi` → `GigabitEthernet`, `Te` →
  `TenGigabitEthernet`, `Twe` → `TwentyFiveGigE`, `Fo` → `FortyGigabitEthernet`, `Hu` →
  `HundredGigE`, `Eth` → `Ethernet`, `Po` → `port-channel`, `Fa` → `FastEthernet`, `Lo` →
  `Loopback`, `Vl` → `Vlan`, `Tu` → `Tunnel`, `Mgmt` / `mgmt` → `mgmt0`) ;
- si le device résolu n'a pas d'interfaces (externe, injoignable) ou est un stub, l'expansion
  Cisco n'est appliquée que si une évidence dit Cisco : un document CDP vu sur le même port
  local, ou `devices[].vendor` qui **commence par `cisco` sans la casse** (`vendor` est une chaîne libre
  d'inventaire : « cisco », « Cisco », « Cisco Systems »). Sinon le nom reste brut, et R3 compare les ports par
  **équivalence** : deux noms désignent le même port s'ils sont égaux, ou égaux après expansion ;
  quand les deux formes sont en présence, l'endpoint retient la forme longue, attestée par l'un
  des claims (rien n'est inventé) ;
- un port distant **en forme de MAC** (le contrat la garantit normalisée, `mac_not_normalized`
  sinon ; il n'y a plus de sous-type annoncé) est remplacé par l'interface du voisin qui porte
  cette MAC, si **exactement une** la porte dans ses `interfaces[].mac_address`. Sinon (stub,
  externe, injoignable, aucune ou plusieurs interfaces) la MAC reste le nom du port et un
  contrôle `remote_port_is_mac` (info) l'indique. Cas visé : `lldpd` (Checkpoint Gaia, serveurs
  Linux), qui annonce la MAC en port-id par défaut ; il suppose `mac_address` renseigné sur les
  interfaces du voisin collecté.

Chaque expansion appliquée incrémente `report.applied_normalizations.ifname_short_to_long`.

**R1-bis — Port distant annoncé par le nom d'un agrégat** (Orhan, 2026-09-22 ; cas réel : un FortiGate dont
LLDP est activé annonce en port-id le nom de son agrégat, `agg-core`, sur chacun de ses membres). Le contrat ne
change pas : `neighbor_interface` reste brut, l'exportateur ne le traduit jamais (le switch ne sait pas sur quel
membre il tombe). Quand le port distant résolu d'un claim **observé** est un agrégat du voisin collecté (interface
de type `aggregate`, ou nom d'agrégat dans `aggregates[]` / `interfaces[].members`, même source que R4), le claim dit
« un des membres », jamais l'agrégat. B1 cherche le membre dans l'ordre des rangs, le premier qui parle décide, à
plusieurs candidats aucun ne gagne :

1. **observation inverse** : un membre observe lui-même le port témoin (`lldp` / `cdp` depuis `fw/x1` vers
   `sw/Ethernet1/3`) ;
2. **agrégat à un seul membre** ;
3. **description** : celle du port témoin cite un membre (`C2|fw-edge-01|x1`), ou celle d'un membre cite le port
   témoin ; elle **précise** l'observé, elle ne le contredit pas.

Membre trouvé : le claim est reciblé (`remote_raw.port = agg-core`, `remote_resolved.interface = x1`), compteur
`applied_normalizations.aggregate_port_to_member`, et R3 s'applique normalement (une description qui cite un autre
membre que celui observé en retour est un désaccord ordinaire). Membre indéterminé : le câble s'arrête à l'agrégat,
contrôle `remote_port_is_aggregate` (warning, sur le port témoin, `details` = `neighbor`, `aggregate`, `members`, la
liste pouvant être vide si les membres sont inconnus). **Agrégat et membre concordent dans les deux sens** (revue du
2026-09-22, H1) : un bout resté agrégat concorde avec la description d'un de ses membres (description ambiguë absorbée,
pas de désaccord), et un membre observé concorde avec une description qui cite l'agrégat (`C2|fw-edge-01|agg-core|`,
ce que `show lldp neighbors` affiche : la description rejoint les évidences du câble avec `remote_resolved.interface =
agg-core`, comme une description sans port). Un bout resté agrégat n'est un hub que s'il a **plus de voisins que de
membres** (`multiple_observed_neighbors`, M2 : entrée LLDP périmée pendant un recâblage) ; membres inconnus, muet.
Une auto-observation (`A/Po → A/Po`) n'est jamais reciblée (M1). Même famille que H2 (membres qui annoncent la MAC de
l'agrégat, à traiter par la même résolution) ; le cas indéterminé sera résorbé par le partenaire LACP par membre
(`docs/06`). Les descriptions qui citent un agrégat ne sont pas reciblées (elles ne dessinent que sans observation).
**Parqué** (revue du 2026-09-22, rapport dans `docs/revues/`) : les deux bouts qui s'annoncent chacun par leur agrégat
(une seule passe, hors infra actuelle : Cisco n'annonce jamais un Po en port-id ; résultat visible, hub +
`one_way_observation`) ; un membre désigné deux fois par le rang 3 (deux câbles et un hub, visible ; arbitre : table
MAC ou LACP) ; membres inconnus et description citant un membre = désaccord (prudent). **Pour l'exportateur** :
`aggregates[]` fait foi quand le topic est en succès ; un `aggregates[]` incomplet rend R1-bis aveugle
(`members: []`), les `interfaces[].members` ne sont lus qu'en repli.

### R2 — Des évidences aux claims

Chaque témoignage devient un claim `(from: (h, i), to: (h', i'), source)` :

- `lldp[]` et `cdp[]` : un claim par document, `to` résolu par R0 et R1 ;
- `interfaces[].description` : grammaire `criticité|voisin|port|options`, séparateur `|`,
  champs 3 et 4 optionnels. Champ 2 vide ou description nulle : pas de claim. Description non
  vide qui ne contient aucun `|` ou dont le champ 2 n'est pas un nom : contrôle
  `description_unparseable` (info) et pas de claim, **sur les seuls ports `physical` et `management`**
  (2026-09-20 : le texte libre d'un Loopback ou d'un Vlan n'est pas une anomalie du L1 ; il reste copié, et
  parsé s'il se parse). En V1 un champ 2 vide (`C1||`) est traité comme non parsable : la distinction est
  abandonnée tant que les descriptions de production ne sont pas fiabilisées (Orhan, 2026-09-20). La criticité
  est conservée telle quelle (vocabulaire non figé). **Champ 3 absent** (`C1|sw-b|`, 2026-09-20) : le claim vise le device seul,
  `remote_resolved.interface = null` ; il ne crée jamais de câble (un câble a deux ports) mais confirme un
  câble observé depuis le même port local vers ce device (R3, accord jugé sur le device comme pour un port
  distant en MAC) ; sans observé, pas de câble et pas de contrôle `documented_not_observed` (rien à dessiner).

B1 ne lit aucune description d'en face dans LLDP (claim `remote_description` retiré le 2026-09-18) :
la description du port d'un voisin collecté est dans ses propres `interfaces[]` et y produit déjà son
claim `description`, groupé par R3 sur la même paire d'endpoints.

Un claim n'est jamais un lien : c'est une opinion datée d'une source.

### R3 — Fusion des claims en câbles

Les claims sont groupés par paire d'endpoints non ordonnée. Un groupe donne un lien :

- `status = confirmed` si au moins un claim observé (`lldp`, `cdp`) et au moins un documenté
  (`description`) ; `observed_only` ou `documented_only` sinon.
- **Port distant observé resté en MAC** (R1, `remote_port_is_mac`) : l'observé ne nomme pas le port
  d'en face. L'accord avec un claim documenté depuis le même port local se juge alors sur le
  **device** seul : même device, le lien est `confirmed`, son endpoint reste `(voisin, MAC)`, stable
  d'une run à l'autre que la description existe ou non, et le port documenté (`eno1`) est porté par
  l'évidence `description` ; device différent, désaccord comme ci-dessous.
- **Rang des sources** (Orhan, 2026-09-20) : l'observé (`lldp`, `cdp`) gagne toujours ; la description n'arrive
  qu'en dernier lieu, quand aucune autre source ne parle. Les descriptions de production sont peu fiables. Rangs
  validés pour la suite : `lldp` / `cdp` > `mac_table` (à concevoir, `docs/06`) > `description`.
- **Placement d'une description** : l'observé est groupé en entier d'abord ; chaque description est ensuite placée
  par rapport aux câbles observés **à ses deux bouts** (le port qui documente, et le port qu'elle cite), quel que
  soit le device qui a observé. Un port physique ne porte qu'un câble :
  - un seul câble observé concorde (même device, et même port, ou port non cité, ou port observé resté en MAC) :
    la description le **confirme**, si elle témoigne depuis l'un de ses bouts ;
  - plusieurs concordent (description sans port derrière un hub) : elle ne confirme **rien**, sans contrôle de
    plus, `multiple_observed_neighbors` dit déjà l'anomalie ;
  - aucun ne concorde alors que l'un des deux bouts a un câble observé : **désaccord**, aucun câble ; contrôle
    `description_disagrees_with_observed` (warning) sur le port qui documente, `details` = `documented`,
    `observed_at` (le bout qui porte l'observation) et `observed` (ce qui y est vu). C'est le cas d'un firewall
    sans LLDP dont la description contredit ce que le switch d'en face observe ;
  - aucun des deux bouts n'a de câble observé : câble `documented_only`, si la description cite un port.
- **Descriptions contradictoires entre elles, sans aucune observation** (trois descriptions en cercle, deux
  descriptions vers le même port) : chaque câble `documented_only` est dessiné, sans contrôle de plus que
  `documented_not_observed` (Orhan, 2026-09-20). Les descriptions de production sont peu fiables ; l'arbitre viendra
  de la table MAC (`docs/06`), pas d'un contrôle de cohérence entre textes.
- **Accord jugé depuis l'autre bout** : `A/p` observe `B` par une MAC qu'aucune interface de `B` ne porte, et la
  description de `B/x` cite `A/p`. Même device : ni second câble ni désaccord. La description est **absorbée** et
  non rattachée, car une évidence témoigne depuis un bout du lien (`evidence_witness_not_endpoint`) et le bout reste
  `(B, MAC)` ; elle reste lisible sur l'interface `B/x`, et `remote_port_is_mac` signale le trou de collecte.
- **Un port qui se désigne lui-même** (`A/p → A/p` : bouchon de boucle, réflecteur, convertisseur de média
  qui renvoie les trames, ou description qui cite son propre port) : aucun câble, un lien n'a pas deux bouts
  égaux ; contrôle `self_observation` (warning, `details.source` = `lldp` / `cdp` / `description`). Un câble
  entre deux ports **différents** du même device reste un câble ordinaire.
- **Deux voisins observés sur un même port** (switch non géré ou hub entre les deux) : contrôle
  `multiple_observed_neighbors` (warning) ; les deux câbles sont dessinés, chacun portant le contrôle
  (question 3, §8). Le contrôle référence le câble et **le port qui observe**, et `details.neighbors` liste
  **tous** les voisins vus sur ce port, triés ; une paire signalée depuis ses deux bouts porte deux contrôles.
  Chaque câble garde le statut que ses évidences imposent : `observed_only`, ou `confirmed` si une description
  concorde avec l'un des voisins.
- **Un port ne porte qu'un câble, qu'il observe ou qu'il soit vu** : le contrôle `multiple_observed_neighbors` vise
  tout bout à plusieurs câbles observés, donc aussi un port muet vu par deux témoins (N serveurs nommés `localhost`
  port `eth0`, ou un firewall sans LLDP cité par deux switches) ; le port référencé est alors le port vu.
- **Port local sous deux écritures équivalentes** (`Eth1/5` dans `lldp`, `Ethernet1/5` dans `interfaces[]` : le
  contrat d'entrée en fait un constat, `local_interface_unknown`) : un seul bout, nommé par l'écriture que
  `interfaces[]` connaît ; le témoin de chaque évidence porte le nom du bout, et deux documents qui ne diffèrent
  que par cette écriture sont une seule évidence.
- **Nom d'un endpoint** : canonique si le port témoigne lui-même, sinon la forme longue attestée, sinon la plus
  petite des formes brutes ; jamais « celle du premier document », dans un lien comme dans un détail de contrôle.
- **Réciprocité** : un claim observé de A vers B sans claim observé de B vers A donne
  `one_way_observation` (warning) **seulement si** B est un device en périmètre dont la task
  porte le topic correspondant en `success`. Si le topic est absent ou `failed` chez B, rien :
  on ne reproche pas à un device ce qu'on ne lui a pas demandé.
- **Documenté sans observation** : `documented_only` est un statut légitime, dessiné en trait
  distinct. Il porte `documented_not_observed` en **warning** si les deux bouts sont des devices
  en périmètre dont LLDP ou CDP est en `success`, en **info** sinon (Fortinet sans LLDP, stub,
  externe).

### R4 — Structures : agrégats, MLAG, HA

- Appartenance : `aggregates[].members` fait foi ; `interfaces[].members` ne sert que si le
  topic `aggregates` **n'est pas en `success`** pour ce device (absent, ou `failed` : l'appartenance est alors
  portée avec `member_status = null`, « statut non lu »). Topic en `success` sans document : le device n'a pas
  d'agrégat, rien n'est déduit de `interfaces[].members`. Un port membre de deux agrégats du même device est
  **refusé par le contrat d'entrée** (`member_in_several_aggregates`, 2026-09-20) : B1 n'a pas à choisir. Membre cité mais interface absente : constat du
  contrat, recopié.
- Agrégat : `degraded` si un membre n'est pas `bundled` → `aggregate_member_not_bundled`
  (warning, avec le statut). `min_links` non atteint par les membres `bundled` →
  `aggregate_below_min_links` (error). Protocole différent aux deux bouts d'un même faisceau →
  `aggregate_protocol_mismatch` (error).
- MLAG : même `mlag_id` sur deux devices distincts → domaine. Si les câbles des deux agrégats
  ne mènent pas au même device tiers → `mlag_downstream_inconsistent` (warning). Deux agrégats
  de même `mlag_id` dont les câbles se rejoignent l'un l'autre → ce sont en réalité un
  peer-link mal étiqueté : `mlag_pair_direct_link` (warning). Un `mlag_peer_link` sans domaine
  ne pose pas de problème.
- HA : cluster construit par R2.5 ; membre en `state = down` → `ha_member_down` (error) ;
  membre listé absent de `devices` → constat du contrat ; heartbeat sans câble →
  `heartbeat_link_not_observed` (info) ; deux membres décrivant le cluster différemment (mode,
  rôles) → `ha_view_mismatch` (warning).

### R5 — Contrôles d'état

- `link_oper_mismatch` (warning) : un bout `up`, l'autre `down` sur un câble confirmé ou observé.
- `link_down` (info) : les deux bouts `down` ; le câble reste dessiné (il est documenté ou
  a été observé).
- `link_speed_mismatch` (warning) : vitesses opérationnelles différentes aux deux bouts.
- `native_vlan_mismatch` (warning, ajouté le 2026-09-16, réécrit le 2026-09-18) : sur un câble
  confirmé ou observé dont les **deux bouts sont collectés**, le VLAN non tagué d'un bout
  (`access_vlan` si `access`, `native_vlan` si `trunk`, sinon aucune conclusion) diffère de celui de
  l'autre bout. Les trois combinaisons se comparent : access ↔ access, access ↔ trunk, trunk ↔ trunk
  (celles où Cisco lève `%CDP-4-NATIVE_VLAN_MISMATCH`). La comparaison lit les `interfaces[]` des
  deux bouts et non plus le `neighbor_native_vlan` de CDP, retiré du contrat : elle vaut donc aussi
  pour un câble vu par LLDP seul (Cisco ↔ Fortinet). Un bout non collecté, un VLAN `null` ou un mode
  sans VLAN non tagué : aucune conclusion.
- `documented_port_without_transceiver` (warning) : `oper_status = not_present` avec une
  description qui cite un voisin.
- `device_unreachable` (error) : task `unreachable`. Les câbles documentés depuis l'autre
  bout restent dessinés en `documented_only` (question 5, §8).
- `device_partial_collection` (info) : task `partial`, avec la liste des topics en échec.

### R6 — Ordre canonique et sérialisation

Nœuds triés par `(kind, hostname)`, `hostname` unique toutes sortes confondues (sans la casse) ; interfaces
par `(hostname, name)` avec tri naturel des nombres (`Ethernet1/2` avant `Ethernet1/10`) ; liens par la
paire d'endpoints ; contrôles par `(code, refs, details)` (2026-09-20 : `details` sérialisé en clés triées
départage deux contrôles de même code et mêmes références) ; listes internes triées de même ; `allowed_vlans` : union des intervalles, fusion des
adjacents (`10-20, 21-30` → `10-30`), tri par `first` (les chevauchements sont refusés par le contrat,
`vlan_ranges_overlap`) : `[{10, 20}, {21, 30}]` et `[{10, 30}]` donnent le même snapshot, sinon B3
verrait un diff factice à chaque changement de mise en forme amont. Sérialisation : clés triées, UTF-8 sans
échappement, séparateurs fixes, fin de ligne unique. Deux snapshots égaux sont égaux à
l'octet ; c'est ce que le diff (B3) et l'archive (B2) supposent.

---

## 4. Codes de contrôle de B1, récapitulatif

| Code | Sévérité | Règle |
|---|---|---|
| `neighbor_name_case_differs` | info | R0 |
| `neighbor_resolved_by_reported_hostname` / `_by_address` | warning | R0 |
| `neighbor_name_ambiguous` | warning | R0 |
| `neighbor_unknown` | info | R0 |
| `remote_port_is_mac` | info | R1 |
| `remote_port_is_aggregate` | warning | R1-bis |
| `description_unparseable` | info | R2 |
| `description_disagrees_with_observed` | warning | R3 |
| `multiple_observed_neighbors` | warning | R3 |
| `one_way_observation` | warning | R3 |
| `self_observation` | warning | R3 |
| `documented_not_observed` | warning / info | R3 |
| `aggregate_member_not_bundled` | warning | R4 |
| `aggregate_below_min_links` | error | R4 |
| `aggregate_protocol_mismatch` | error | R4 |
| `mlag_downstream_inconsistent` / `mlag_pair_direct_link` | warning | R4 |
| `ha_member_down` | error | R4 |
| `ha_view_mismatch` | warning | R4 |
| `heartbeat_link_not_observed` | info | R4 |
| `link_oper_mismatch` / `link_speed_mismatch` | warning | R5 |
| `native_vlan_mismatch` | warning | R5 |
| `link_down` | info | R5 |
| `documented_port_without_transceiver` | warning | R5 |
| `device_unreachable` | error | R5 |
| `device_partial_collection` | info | R5 |

Les codes du contrat (`ld_contracts.checks`) sont recopiés tels quels avec `origin = bundle`, en **warning**
(la donnée se contredit), sauf `vrf_default_case` en **info** (2026-09-20 ; le catalogue fait foi :
`CATALOGUE` dans `snapshot/codes.py`, table « Codes de contrôle » de `CONTRAT.md` partie B).

---

## 5. Les scénarios de la fixture, et ce que B1 doit en faire

| # | Scénario dans `bundle-minimal.json` | Résultat attendu |
|---|---|---|
| 1 | `sw-core-01 Ethernet1/1` ↔ `sw-core-02 Ethernet1/1` : LLDP dans les deux sens, CDP depuis 01, descriptions concordantes | câble `confirmed`, `oper = up`, `aggregate_a = aggregate_b = port-channel10`, cinq évidences (deux `lldp`, une `cdp`, deux `description`) — **vérifié par l'étape 1** |
| 2 | `Ethernet1/2` : LLDP réciproque dit 01/Eth1/2 ↔ 02/Eth1/2 ; la description de `sw-core-02 Ethernet1/2` dit `sw-core-01\|Ethernet1/9` | câble `confirmed` (documenté par 01), contrôle `description_disagrees_with_observed` sur `sw-core-02 Ethernet1/2` ; `link_oper_mismatch` (01 up, 02 down « suspended by LACP ») ; `aggregate_member_not_bundled` sur 02 |
| 3 | `port-channel10` peer-link entre les cœurs (`mlag_peer_link = true`) ; `port-channel20` avec `mlag_id = 20` sur les deux cœurs, un membre chacun (`sw-core-01 Ethernet1/3`, `sw-core-02 Ethernet1/4`) vers `fw-edge-01` `x1` / `x2`, agrégat FortiGate `agg-core` (fixture corrigée le 2026-09-20, question 1) | domaine MLAG 20 `{members: [(sw-core-01, port-channel20), (sw-core-02, port-channel20)], peer_link: (sw-core-01, port-channel10), downstream: fw-edge-01}`, aucun contrôle MLAG ; rôle `mlag_peer_link` sur `Ethernet1/1` et `Ethernet1/2` des deux cœurs ; `mlag_pair_direct_link` testé sur une fixture dédiée de B1 |
| 4 | `sw-core-01 Ethernet1/3` ↔ `fw-edge-01 x1` : descriptions concordantes, aucun LLDP (Fortinet sans topic lldp), LLDP de 01 en succès sans entrée pour Eth1/3 | câble `documented_only`, `documented_not_observed` en **info** (le bout Fortinet n'a pas de LLDP collecté) |
| 5 | `sw-core-01 Ethernet1/4` ↔ `rt-wan-01` (infra-wan) : LLDP port-id `Gi0/0/0`, CDP `GigabitEthernet0/0/0`, description concordante | nœud `external`, R1 étend `Gi0/0/0` (évidence Cisco : CDP sur le même port, `vendor = cisco`), câble `confirmed` avec trois évidences (`lldp`, `cdp`, `description`), `applied_normalizations.ifname_short_to_long = 1` |
| 6 | `sw-core-02 Ethernet1/3` ↔ `srv-hyp-07` : inconnu de `devices`, port LLDP en forme de MAC, description `srv-hyp-07\|eno1` | nœud `stub` avec capacités `station` (masqué par défaut dans la vue réseau) ; câble `confirmed` vers `(srv-hyp-07, 3c:ec:ef:12:34:56)`, accord jugé sur le device, `eno1` porté par l'évidence `description` ; `neighbor_unknown`, `remote_port_is_mac` |
| 7 | `sw-core-01 Ethernet1/5` : `not_present`, « SFP not inserted », sans description, `last_change_age_seconds` = `"never"` | aucun lien, aucun contrôle ; « never » lu comme âge ≥ `uptime_seconds` |
| 8 | `fw-edge-02` injoignable ; cluster `EDGE-CLUSTER` vu depuis `fw-edge-01` avec 02 `secondary/down` ; heartbeat `ha1` | nœud `device` avec `collection = unreachable`, `device_unreachable`, cluster à deux membres, `ha_member_down`, `heartbeat_link_not_observed` ; `extras.sync_status` jamais lu |
| 9 | `sw-core-02` : task `partial`, CDP `failed` ; `reported_hostname = SW-CORE-02` | `device_partial_collection`, aucun `one_way_observation` fondé sur CDP contre 02 ; **aucun** `reported_hostname_differs` (le contrat compare sans la casse ; la fixture de référence reste à zéro constat). La recopie des constats du contrat (`origin = bundle`) se teste sur une fixture dédiée de B1 (`reported_hostname` réellement différent) |
| 10 | Déterminisme | sections du bundle permutées → snapshot identique à l'octet ; deux exécutions → identiques |

---

## 6. Où vit le code

```
contracts/src/ld_contracts/snapshot/      ÉCRIT le 2026-09-20 : enums · order (natural_key, require_canonical) ·
                                          refs · codes (CheckCode, CATALOGUE) · nodes · interfaces · links ·
                                          structures · checks · report · snapshot · serialize (canonical_json)
contracts/src/ld_contracts/schema/snapshot-v1.schema.json   schéma versionné (test de dérive)
contracts/CONTRAT.md                       partie A « Entrée : RunBundle », partie B « Sortie : Snapshot » (générées)
contracts/fixtures/snapshot-skeleton.json  le plus petit snapshot qui dit quelque chose, en forme canonique
contracts/fixtures/snapshot-minimal.json   À VENIR avec B1 : snapshot de référence de bundle-minimal.json (golden)

backend/src/ld_backend/correlate/         ÉTAPE 1 ÉCRITE le 2026-09-20 (R0 à R3, R6) ; R4 et R5 à l'étape 2
├── context.py         index immuables sur le bundle : devices, interfaces, MAC, IP, noms rapportés,
│                      couverture par device, appartenance aux agrégats, heartbeats, ports CDP
├── checkbuild.py      fabrique des contrôles : référence repliée sur le nœud si le port est inconnu,
│                      sévérité unique exigée
├── identity.py        R0 : résolution ordonnée d'un nom (exact, casse, adresse ou nom rapporté, stub)
├── cisco.py           formes courte / longue Cisco, équivalence de deux formes (sans contexte)
├── ifnames.py         R1 : expansion Cisco, port en MAC
├── aggregates.py      R1-bis : port distant annoncé par le nom d'un agrégat → membre (2026-09-22)
├── descriptions.py    R2 : grammaire des descriptions (V1, isolée pour changer avec l'échantillon)
├── claims.py          R2 : évidences → claims résolus, contrôles R0 / R1 / R2, normalisations comptées
├── merge.py           R3 : claims → câbles, désaccords, deux voisins, réciprocité, documenté sans observation
├── structures.py      R4 : agrégats, MLAG, HA — étape 2
├── checks.py          R5 : contrôles d'état — étape 2
├── assemble.py        R6 : nœuds, interfaces, contrôles recopiés du contrat, couverture, rapport, tris
└── __init__.py        correlate(bundle, bundle_sha256) -> Snapshot
backend/tests/correlate/                   un module de tests par règle + scénarios + déterminisme
```

**Précisions d'implémentation de l'étape 1** (2026-09-20) : `correlate` reçoit l'empreinte du bundle archivé en
argument (elle est une entrée, pas un calcul de B1) ; les évidences d'un lien sont triées par le contrat, source
en tête (`cdp` < `description` < `lldp`) ; les bouts `a` / `b` sont triés par (hostname, nom naturel), donc
`fw-edge-01 x1` précède `sw-core-01 Ethernet1/3` ; seules les interfaces `physical` et `management` produisent des
claims de câble, la description d'un agrégat est parsée mais ne dessine rien, et **seuls ces ports sont signalés
`description_unparseable`** (un Loopback `MGMT` ou un Vlan `USERS` n'est pas une anomalie du L1 ; 2026-09-20) ; une
description sans port confirme un câble observé vers le même device, s'il est seul candidat, et n'en crée jamais ; le contrôle `multiple_observed_neighbors` est porté par
chaque câble, dont le statut reste celui que ses évidences imposent (confirmé si une description concorde).

Branchement : dans `ingest.py`, après `archive.store`, le snapshot est calculé et écrit à côté
du bundle (`snapshot.json`), puis servi par `GET /api/snapshots/{infrastructure}/{run_id}`.
Un échec de B1 n'annule pas l'archivage du bundle : il est signalé dans la réponse et rejouable.

Pourquoi le snapshot dans `ld-contracts` et non dans `backend` : c'est la frontière avec le
moteur TypeScript (types générés depuis le JSON Schema), le même outillage de génération et
de test de dérive s'applique, et un seul document de référence reste vrai. Le coût pour votre
exportateur est nul : module séparé, aucune dépendance supplémentaire.

---

## 7. Plan de tests (TDD, écrits avant le code)

- `test_identity.py` : les cinq niveaux de R0, chacun avec son contrôle ; externe ; stub ;
  voisin annoncé par MAC.
- `test_ifnames.py` : table d'expansion Cisco ; nom absent chez le voisin gardé brut ; pas
  d'expansion sur un stub non Cisco ; port-id MAC ramené au nom de l'interface qui porte cette MAC.
- `test_descriptions.py` : grammaire, champs optionnels, criticité libre, cas non parsables.
- `test_merge.py` : les trois statuts ; désaccord ; deux voisins observés ; réciprocité
  conditionnée par la couverture ; sévérité de `documented_not_observed`.
- `test_structures.py` : appartenance, dégradé, min-links, MLAG (domaine, downstream,
  peer-link mal étiqueté), HA (membre down, vues divergentes, heartbeat).
- `test_scenarios.py` : les dix lignes de §5 sur la fixture, une fonction par ligne.
- `test_determinism.py` : permutations, double exécution, égalité à l'octet avec le golden.
- Couverture visée ≥ 90 % sur `correlate/` ; revue de code indépendante avant livraison.

---

## 8. Questions à trancher avant le code

1. **Fixture** : `port-channel10` relie les deux cœurs entre eux avec `mlag_id = 10`, ce qui
   décrit un peer-link, pas un vPC. Je propose de corriger la fixture : `port-channel10` devient
   le peer-link (`mlag_peer_link = true`, `mlag_id = null`) et un vrai vPC 20 est ajouté vers
   `fw-edge-01` (agrégat FortiGate à deux membres, un par cœur). Le scénario 3 devient alors un
   test positif du domaine MLAG, et `mlag_pair_direct_link` est testé sur une fixture dédiée.
   **Tranchée le 2026-09-20 (Orhan)** : correction validée. `port-channel10` = peer-link ;
   `port-channel20` (`mlag_id = 20`) sur chaque cœur, un membre chacun (`sw-core-01 Ethernet1/3`,
   `sw-core-02 Ethernet1/4`) vers `fw-edge-01 x1` / `x2`, agrégat FortiGate à deux membres ;
   scénario 4 (`Ethernet1/3` ↔ `x1` en `documented_only`) inchangé ; `mlag_pair_direct_link` sur une
   fixture dédiée.
2. **Résolution des voisins** : ~~garder les cinq niveaux de R0, ou seulement nom et serial ?~~
   **Tranchée le 2026-09-18** par la réduction des topics `lldp` / `cdp` : nom, nom replié,
   `reported_hostname`, puis adresse quand le nom annoncé en est une. Le risque de faux positif sur
   une VIP ou une MAC virtuelle est traité par `neighbor_name_ambiguous` (plusieurs devices
   répondent : aucun ne gagne).
3. **Deux voisins observés sur un port** : ~~dessiner les deux câbles avec contrôle (proposé),
   ou aucun câble et un contrôle ?~~ **Tranchée le 2026-09-20 (Orhan)** : les deux câbles sont
   dessinés en `observed_only`, avec le contrôle `multiple_observed_neighbors` (R3).
4. **Sévérités** : ~~la grille proposée est error (le réseau est cassé ou incohérent), warning
   (la donnée se contredit), info (à savoir). Votre grille ?~~ **Tranchée le 2026-09-20 (Orhan)** :
   grille proposée retenue (error / warning / info, §4).
5. **Device injoignable** : ~~ses câbles documentés depuis l'autre bout restent dessinés en
   `documented_only` ; ses propres descriptions sont inconnues. D'accord ?~~ **Tranchée le
   2026-09-20 (Orhan)** : oui, câbles `documented_only` depuis l'autre bout.
6. **Descriptions** : le champ 2 est-il toujours un hostname court, ou parfois un libellé
   (`WAN-PROVIDER`, `UPLINK`) ? Y a-t-il un format pour le champ 4 (`clé=valeur;…`) ? Un
   échantillon anonymisé de descriptions réelles tranchera la grammaire.
7. **Emplacement** : ~~snapshot dans `ld-contracts` (recommandé) ou paquet séparé ?~~ **Tranchée
   le 2026-09-20 (Orhan)** : dans `ld-contracts`, module `snapshot`, `CONTRAT.md` en deux parties.
8. **Version** : ~~semver du snapshot indépendant du RunBundle (recommandé : les deux évoluent
   à des rythmes différents).~~ **Tranchée le 2026-09-20 (Orhan)** : semver indépendant,
   `snapshot_version` distinct de `contract_version`.

Aucune de ces questions ne bloque la rédaction des modèles ; les questions 1, 2 et 3 changent
des tests, les autres changent des noms ou des sévérités.

**État au 2026-09-20** : sept questions tranchées ; reste la question 6 (échantillon de
descriptions, non bloquant : le parseur de B1 porte la grammaire et s'ajuste sans toucher au
snapshot). **Document validé, les modèles du snapshot peuvent être écrits.**
