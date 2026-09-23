# ld-contracts — guide de démarrage

## Ce que c'est, ce que ce n'est pas

`ld-contracts` est **le langage commun** entre votre exportateur B0 (zone sécurisée) et
Living Diagram, et **le contrôle à la porte** qui vérifie qu'un document le respecte.

- **C'est** : la définition des deux documents qui traversent la frontière, `RunBundle` (ce qui entre,
  produit par votre exportateur) et `Snapshot` (ce qui sort de la corrélation B1), en modèles Pydantic +
  JSON Schema ; un validateur qui dit exactement ce qui ne va pas, un anonymiseur pour partager un cas
  réel sans son contenu, et des fixtures de référence.
- **Ce n'est pas** : la porte elle-même. La route `POST /api/ingest/bundles` (réception,
  archivage, déclenchement de la corrélation B1) sera dans `backend/`, et s'appuiera sur
  ce paquet pour valider. B1 n'existe pas encore.

```
 votre zone                          frontière                    Living Diagram
 ───────────────────────────────     ────────────────────────     ──────────────────────────
 Mongo amont ─▶ exportateur B0 ─▶  bundle.json (RunBundle v1) ─▶ [validate] ─▶ archive ─▶ B1 ─▶ snapshot.json
                      │                       ▲                        │                   (Snapshot v1)
                      └── ld-contracts ───────┘── même paquet ─────────┘─────────────────────┘
                          (valider avant d'envoyer)   (valider à la réception)   (contrat de sortie)
```

## Entrée et sortie

| | Quoi | Forme |
|---|---|---|
| **Entrée** | un bundle par (run, infrastructure) | un fichier JSON, structure `RunBundle` ci-dessous |
| **Sortie de `validate`** | verdict + erreurs de contrat + constats de données | texte, code de sortie 0 (valide) / 1 (invalide) |
| **Sortie de `schema`** | le JSON Schema 2020-12 du bundle (`--contract bundle`, défaut) ou du snapshot (`--contract snapshot`) | JSON, pour un générateur de types ou un éditeur |
| **Sortie de `anonymize`** | un bundle pseudonymisé, toujours valide | un fichier JSON |
| **Sortie pour B1** | l'objet Python `RunBundle` | `from ld_contracts.bundle import RunBundle` |
| **Sortie de B1** (à venir) | l'objet Python `Snapshot`, sérialisé en forme canonique | `from ld_contracts.snapshot import Snapshot` ; `ld_contracts.snapshot.serialize.canonical_json` |

## Démarrer en cinq commandes

```
cd contracts
. .venv/bin/activate                                            # enable virtual environment
uv sync                                                         # Python 3.14 + dépendances, environnement local
uv run ld-contracts validate fixtures/bundle-minimal.json       # le bundle de référence, valide, 0 constat
uv run ld-contracts validate fixtures/bundle-skeleton.json      # le plus petit bundle valide : votre point de départ
cp fixtures/bundle-skeleton.json mon-bundle.json                # éditez, puis :
uv run ld-contracts validate mon-bundle.json --show-values
```

Lecture d'un rapport :

```
invalid: 2 error(s)
  interfaces.0.duplex: Input should be 'full', 'half' or 'unknown'
  interfaces.0.mac_address: String should match pattern '^[0-9a-f]{2}(:[0-9a-f]{2}){5}$'
```

Le chemin (`interfaces.0.duplex` = premier document de la section interfaces, champ duplex)
localise ; le message dit la règle. Aucune valeur n'est affichée sans `--show-values` :
un rapport se partage sans fuite. Après les erreurs viennent les **constats** (`finding`) :
des incohérences de données que le contrat accepte mais que B1 signalera (membre
d'agrégat inconnu, parent absent, device sans statut de collecte…). `--strict-findings`
les rend bloquants.

**Clé nullable absente.** Un champ `X | null` que le bundle ne fournit pas est lu comme `null`, et
l'oubli est **compté**, un constat par champ :

```
  finding nullable_key_absent: aggregates[].min_links : clé absente, lue comme null (312 occurrence(s), 4 device(s))
```

Les devices concernés s'affichent avec `--show-values`. Un compte égal à tous les documents d'un
constructeur désigne un driver incomplet, pas un aléa : ce constat doit tendre vers zéro, comme
`residual_normalizations`. **Dans les tests de l'exportateur, valider avec `--strict-findings`** : un
champ oublié y casse au premier bundle, comme avant. Une faute de frappe (`min_link`) reste refusée,
un champ non nullable reste requis, et le défaut n'est jamais une valeur (`allowed_vlans` absent
= `null`, jamais `[]`).

## Le document RunBundle, section par section

```json
{
  "contract_version": "1.0.0",          // semver du contrat, majeure vérifiée
  "produced_at": "2026-09-10T02:20:11Z",// ISO 8601 avec fuseau, obligatoire partout
  "exporter_version": "0.1.0",
  "infrastructure": "infra_01",         // le périmètre dessiné
  "run":        { "collector_run_id", "collection_name", "start_datetime", "end_datetime", "status" },
  "devices":    [ ... ],   // la table de référence COMPLÈTE (toutes infrastructures) : B1 y résout les voisins
  "tasks":      [ ... ],   // statut de collecte par device et par topic, pour l'infrastructure
  "interfaces": [ ... ],   // topic interfaces, filtré sur l'infrastructure
  "aggregates": [ ... ],   // topic agrégats (état par membre)
  "lldp":       [ ... ],   // topic lldp_neighbors
  "cdp":        [ ... ],   // topic cdp_neighbors
  "system":     [ ... ],   // topic system (plateforme, serial, stack, contextes virtuels)
  "ha":         [ ... ],   // topic ha
  "residual_normalizations": { "duplex_vendor_form": 0 }   // ce que B0 a dû normaliser lui-même
}
```

Les sections sont des listes de documents plats. **Toute section peut être vide** : on
construit un bundle progressivement, d'abord `devices` + `run` + `tasks` + `interfaces`,
puis on ajoute un topic à la fois.

**La référence complète du modèle de données est un seul document :
[`CONTRAT.md`](CONTRAT.md).** Il décrit chaque document et chaque champ (type, requis,
signification, valeurs possibles), les énumérations, les règles transverses, les erreurs
et les constats, et le plus petit bundle valide. Il est **généré depuis le code des
modèles** (`ld-contracts docs --out`) et un test échoue s'il dérive : c'est sur lui que
l'exportateur se fonde pour fournir, adapter ou challenger les données. Les documents
`docs/01`, `02` et `04` sont l'historique du raisonnement, pas la référence.

Règles transverses, appliquées par le validateur :

- **Tout champ est présent**, `null` compris. Un champ inconnu au premier niveau est
  refusé ; `extras` est le seul endroit libre.
- **Types stricts** : un entier en chaîne (`"10000"`) est refusé, une MAC hors
  `aa:bb:cc:dd:ee:ff` minuscule est refusée, une date sans fuseau ou en nombre est refusée.
- **Énumérations fermées** en minuscules (`duplex` : `full | half | unknown` ;
  `oper_status` : RFC 2863 ; `type` d'interface, de device, statuts de membres…), listées
  dans `src/ld_contracts/enums.py`.
- **`hostname` identique octet pour octet** à celui de `devices` dans toutes les sections ;
  deux hostnames ne différant que par la casse sont un doublon.
- **Identités uniques** : `(hostname, name)` pour interfaces et aggregates, un document par
  hostname pour tasks, system, ha.
- **Le périmètre est écrit une fois**, dans `infrastructure` au premier niveau : les documents
  de topic ne le répètent pas (un champ `infrastructure` sur un document est refusé). Chaque
  document vise un device qui, selon `devices`, appartient à l'infrastructure du bundle ; seule
  la table `devices` peut couvrir d'autres infrastructures. `infrastructure` se compare octet
  pour octet, comme `hostname`.
- **Un document `ha` liste son propre device dans `members`** (octet pour octet, une seule
  fois) : le rôle et l'état du device local s'y lisent, il n'y a pas de champ à part. Sinon le
  document est refusé (`ha_local_not_in_members`, `ha_member_duplicate`). `standalone` :
  exactement un membre, le device lui-même, rôle `member` (`ha_standalone_not_alone`).

## Le document Snapshot, en bref

C'est la sortie de B1 : le graphe d'une run (`nodes`, `interfaces`, `links` aux arêtes typées, `aggregates`,
`mlag_domains`, `ha_clusters`, `checks`, `coverage`, `report`), décrit en partie B de `CONTRAT.md` et conçu
dans `docs/05`. Il ne concerne pas l'exportateur : module séparé, aucune dépendance de plus. Ce qui le
distingue du bundle, décidé le 2026-09-20 :

- **il se refuse, il ne se signale pas** : un bundle incohérent est de la donnée (constats), un snapshot
  incohérent est un bug de B1 (erreur). Toute référence doit désigner un élément du document ;
- **l'ordre canonique est une propriété du type** : listes triées (`Ethernet1/2` avant `Ethernet1/10`), doublons
  refusés, `canonical_json` pour les octets. Même bundle ⇒ même snapshot, à l'octet ;
- **toutes les clés sont écrites** : aucun défaut, pas d'`extras`, pas de clé nullable absente ;
- **catalogue fermé des contrôles** : `code` est une énumération (règles R0 à R5 de `docs/05` + constats du
  bundle recopiés avec `origin = bundle`), la sévérité est contrôlée contre le catalogue ;
- **types partagés** avec le bundle (énumérations, `VlanRange`, `IpAddress`, `AggregateMember`) : une seule
  définition, deux contrats ; `snapshot_version` suit son propre semver.

`fixtures/snapshot-skeleton.json` est le plus petit snapshot qui dit quelque chose (deux devices, un câble
confirmé), écrit en forme canonique. Le snapshot de référence de `bundle-minimal.json` viendra avec B1.

## Utiliser le paquet depuis votre exportateur

```python
import json

from ld_contracts.validate import validate_dict

report = validate_dict(bundle)          # bundle : dict Python prêt à sérialiser
if not report.ok:
    for issue in report.errors:
        print(issue.path, issue.message, issue.detail)   # detail : valeurs, à ne pas journaliser hors zone
    raise SystemExit(1)
for finding in report.findings:
    print(finding.code, finding.message)                 # message : sans valeur ; hostname / ref : dans la zone
payload = json.dumps(bundle)                            # ce qui part vers Living Diagram : ce que vous avez produit
```

**N'envoyez jamais la forme canonique** (`report.bundle.model_dump_json()`) : elle écrit toutes les clés,
donc efface les absences, et le constat `nullable_key_absent` vaudrait zéro côté Living Diagram dès le
premier jour alors que le driver est incomplet. Envoyez le dict que vous avez construit. Si vous construisez
avec les modèles (complétion et vérification par l'éditeur : `from ld_contracts.bundle import RunBundle`
puis `RunBundle(...)`), sérialisez avec `model_dump_json(exclude_unset=True)` : seules les clés que vous
avez écrites partent, l'empreinte côté Living Diagram est la même (testé).
Installation dans votre environnement : `pip install /chemin/vers/contracts` (ou un wheel
construit par `uv build`). Le paquet est Python pur : ni réseau, ni base.

## Anonymiser pour partager

```
LD_CONTRACTS_SEED='une-graine-secrète' uv run ld-contracts anonymize mon-bundle.json anon.json
uv run ld-contracts anonymize mon-bundle.json anon.json --seed-file seed.txt
```

Même graine ⇒ mêmes pseudonymes d'une run à l'autre (les runs anonymisées restent
comparables). Hostnames, serials, sites, VRF, contextes, clusters : pseudonymes HMAC ; le nom réservé
`default` de `vrf` (table globale) est conservé : c'est un fait du contrat, pas un libellé. IP :
bijection préservant les préfixes (deux adresses du même sous-réseau restent dans le même
pseudo-sous-réseau). MAC : espace `02:…`. Par défaut `extras` sont vidés et les champs
optionnels des descriptions supprimés (`--keep-extras`, `--keep-description-options` pour
les garder, nettoyés). La sortie est revalidée : une anonymisation douteuse s'arrête au lieu
d'écrire. **Les clés nullables absentes de l'entrée restent absentes de la sortie** : le bundle anonymisé
reproduit les mêmes constats `nullable_key_absent` que l'original (seul l'anonymisé sort de l'infra, un
driver incomplet doit s'y diagnostiquer).

## Arborescence

```
contracts/
├── pyproject.toml                 paquet ld-contracts, Python ≥ 3.14, Pydantic 2.13, ruff, pytest
├── README.md                      ce guide : démarrer, utiliser, faire évoluer
├── CONTRAT.md                     LA référence du modèle de données, générée depuis les modèles
├── fixtures/
│   ├── bundle-skeleton.json       le plus petit bundle valide : modèle à copier
│   ├── bundle-minimal.json        bundle de référence : 2 Nexus (peer-link Po10, vPC 20 vers le FortiGate),
│   │                              cluster Fortinet (1 membre injoignable), voisin d'une autre infra, stub
│   │                              serveur, désaccord description / LLDP, port sans SFP, tâche CDP en échec
│   └── snapshot-skeleton.json     le plus petit snapshot qui dit quelque chose, en forme canonique
├── src/ld_contracts/
│   ├── enums.py                   toutes les énumérations fermées
│   ├── common.py                  types de base : modèle strict et immuable, MAC, IP, dates, entiers stricts
│   ├── models_run.py              RunInfo · SubjectStatus · DeviceTask
│   ├── models_devices.py          Device · SystemInfo · ChassisMember
│   ├── models_interfaces.py       Interface · IpAddress · Counters · Aggregate · AggregateMember
│   ├── models_neighbors.py        LldpNeighbor · CdpNeighbor
│   ├── models_ha.py               HaStatus · HaMember
│   ├── bundle.py                  RunBundle : cohérence structurelle (unicité, périmètre, version)
│   ├── checks.py                  constats référentiels (Finding, FINDING_CODES), alias de topics amont
│   ├── defaults.py                clés nullables absentes : lues comme null, comptées (nullable_key_absent)
│   ├── validate.py                validate_dict / validate_file → ValidationReport
│   ├── snapshot/                  contrat de sortie Snapshot v1 (2026-09-20)
│   │   ├── enums.py               sortes de nœuds, statuts, sources, sévérités, origines
│   │   ├── order.py               natural_key + require_canonical : l'ordre canonique, partagé avec B1
│   │   ├── refs.py                Endpoint · LinkKey · références typées (node, interface, link, aggregate, cluster)
│   │   ├── codes.py               CheckCode (catalogue fermé), CATALOGUE (sévérités, origine, règle), erreurs
│   │   ├── nodes.py               Node (device | external | stub) · Stack · NodeEvidence
│   │   ├── interfaces.py          SnapshotInterface · ParsedDescription · AggregateMembership
│   │   ├── links.py               Link · LinkEvidence : statut déduit des évidences
│   │   ├── structures.py          SnapshotAggregate · MlagDomain · HaCluster
│   │   ├── checks.py              Check : code, sévérité admise, refs triées
│   │   ├── report.py              Source · Coverage · Report
│   │   ├── snapshot.py            Snapshot : version, ordre canonique, références, couverture, comptes
│   │   └── serialize.py           canonical_json · snapshot_sha256
│   ├── schema.py                  génération des JSON Schema (CONTRACTS : bundle, snapshot)
│   ├── docgen.py                  CONTRAT.md partie A (RunBundle) et assemblage
│   ├── docgen_snapshot.py         CONTRAT.md partie B (Snapshot)
│   ├── docgen_render.py           rendu Markdown commun (tables, documents, énumérations)
│   ├── schema/runbundle-v1.schema.json   schéma versionné (un test échoue s'il dérive des modèles)
│   ├── schema/snapshot-v1.schema.json    idem pour le snapshot
│   ├── anonymize.py               pseudonymisation
│   └── cli.py                     ld-contracts validate | schema [--contract] | docs | anonymize
└── tests/                         398 tests : modèles, bundle, constats, clés absentes, vrf, schéma, référence,
    └── snapshot/                  anonymiseur, CLI ; snapshot : ordre, refs, nœuds, interfaces, liens, structures,
                                   contrôles, document, schéma, partie B, squelette
```

## Vérifier et faire évoluer

```
uv run pytest --cov=ld_contracts        # tests + couverture (attendu ≥ 80 %, actuel 97 %)
uv run ruff check src tests             # lint
uv run ld-contracts schema --out                      # à relancer après tout changement de modèle du bundle
uv run ld-contracts schema --contract snapshot --out  # idem pour le snapshot
uv run ld-contracts docs --out                        # idem : régénère CONTRAT.md (parties A et B)
```

`contract_version` (bundle) et `snapshot_version` (snapshot) suivent chacun leur semver, indépendants :
les deux contrats évoluent à des rythmes différents. Champ optionnel ou valeur d'énumération ajoutés :
mineure. Champ obligatoire ajouté, renommé, ou sémantique changée : majeure, refusée par
B1 tant qu'il ne la supporte pas. Le contrat est **votre** standard autant que le mien :
challengez un champ, une énumération ou une règle, la modification se fait ici, avec son
test, et le schéma est régénéré.

## Décisions prises sur le contrat

- **2026-09-22** — **Code `remote_port_is_aggregate` ajouté au catalogue du Snapshot** (warning, R1-bis), pour le
  port distant annoncé par le nom d'un agrégat dont B1 ne détermine pas le membre (cas réel d'Orhan : un FortiGate
  avec LLDP annonce `agg-core` en port-id sur chacun de ses membres). **Le RunBundle ne change pas** :
  `neighbor_interface` reste brut, l'exportateur ne remplace jamais un nom d'agrégat par un membre qu'il ne connaît
  pas ; c'est une règle de corrélation (`docs/05` R1-bis). Confirmé le même jour : un voisin qui n'annonce aucune
  capacité s'écrit `neighbor_capabilities: []`, jamais `null` (champ requis) ni un jeton inventé (`unknown`).
- **2026-09-20** — **Deux refus ajoutés au RunBundle, nés de la contre-revue de B1** (validés par Orhan) :
  `member_in_several_aggregates` (un port membre de deux agrégats du même device, dans `aggregates[].members` comme
  dans `interfaces[].members` : accepté, il rendait l'appartenance dépendante de l'ordre des documents, donc le
  snapshot non déterministe) et `chassis_member_slot_duplicate` (deux `chassis_members` au même `slot` : une
  contradiction, que le contrat de sortie refusait déjà, d'où une exception dans B1). Motif commun : **ce que le
  contrat de sortie refuse, le contrat d'entrée ne doit pas le laisser passer**, sinon B1 plante entre les deux. Non
  retenu comme refus : la même IP deux fois sur une interface (doublon strict, B1 le retire sans perte). Le même nom
  de port sur deux devices n'est évidemment pas un conflit. Contrat 1.0.0 modifié en place (archive vide).
- **2026-09-20** — **Contrat de sortie Snapshot v1** (`src/ld_contracts/snapshot/`, partie B de `CONTRAT.md`),
  après validation de `docs/05` par Orhan (sept questions sur huit tranchées ; la 6, grammaire des descriptions,
  n'est pas bloquante). Sept décisions d'implémentation, annoncées et validées avant le code : (1) l'ordre
  canonique de R6 est **refusé par le type** (`not_canonical_order`, `duplicate_identity`), clé naturelle dans
  `snapshot/order.py`, partagée avec B1 ; (2) une référence qui ne résout pas est un **refus**
  (`reference_unknown`), pas un constat : un snapshot incohérent est un bug de B1 ; exceptions voulues :
  `interfaces[].aggregate` (appartenance lue dans `interfaces[].members` sans topic) et l'interface d'un bout de
  lien (device injoignable, question 5) ; (3) **aucune clé nullable absente** : tous les champs requis, aucun
  défaut, pas d'`extras` (test garde-fou sur tous les modèles atteignables) ; (4) **catalogue fermé** des codes :
  `CheckCode` = §4 de `docs/05` ∪ `FINDING_CODES` moins `nullable_key_absent`, sévérité contrôlée
  (`documented_not_observed` admet warning et info ; constats du bundle recopiés en warning, `vrf_default_case`
  en info), `origin` est un champ du contrôle, pas une clé de `details` ; (5) énumérations et sous-modèles du
  bundle réutilisés (`VlanRange`, `IpAddress`, `AggregateMember`), sauf `ChassisMember` qui a des défauts
  (`StackMember` sans défaut) ; (6) golden différé à B1, `snapshot-skeleton.json` écrit en forme canonique et
  vérifié à l'octet ; (7) fixture corrigée (question 1) : `port-channel10` = peer-link, `port-channel20` = vPC 20
  vers `fw-edge-01` (`x1` / `x2`, agrégat `agg-core`), 18 interfaces, 5 agrégats. Détails d'implémentation :
  `witness` remplace `from` (mot réservé) dans les évidences ; `coverage[].topics` est un objet à six clés
  fixes ; le statut d'un lien est vérifié contre ses sources ; `degraded` contre ses membres ; un domaine MLAG
  a exactement deux membres sur deux devices ; `canonical_json` = clés triées, UTF-8, indentation 2, fin de
  ligne unique. `FINDING_CODES` déplacé de `docgen.py` vers `checks.py` (là où les constats sont émis) ;
  `docgen.py` scindé (`docgen_render.py`, `docgen_snapshot.py`) ; `schema --contract bundle|snapshot`.
  **Revue indépendante appliquée le même jour** (4 HAUT, 9 MOYEN, 11 BAS, tout traité) : `hostname` unique
  toutes sortes confondues sans la casse ; `coverage[].status` égal à `nodes[].collection` et topics tous
  `absent` sans collecte ; description sans port ⇒ `remote_resolved.interface = null`, accord sur le device
  (R3) ; voisin résolu = device du bout opposé au témoin ; `external` sans champ `system`, `device` /
  `external` avec `type`, stub en `casefold` ; règle VLAN / mode du bundle partagée avec le snapshot
  (`check_vlan_fields_for_mode`) ; cohérences structurelles (`reference_inconsistent`) : câble d'agrégat qui
  touche un membre, câble de heartbeat qui touche l'interface, membres MLAG de même `mlag_id`, `peer_link`
  marqué et sur un des deux devices, `aggregate_a` / `aggregate_b` égal à l'appartenance de l'interface ;
  `reported_by` ⊆ membres du cluster ; `details` en `JsonValue` ; `natural_key` ne parse que ce que `\d+`
  a capturé ; partie B sans doublon des types partagés (renvoi vers la partie A) et avec les erreurs héritées ;
  `ld-contracts validate --contract snapshot` ; squelette aux évidences réciproques ; fixture :
  `x1.400` → `agg-core.400` (parent `agg-core`), `vrf` null sur les membres `x1` / `x2` ; scénario 9 de
  `docs/05` corrigé (le contrat compare `reported_hostname` sans la casse : la fixture reste à zéro constat,
  la recopie `origin = bundle` se teste sur une fixture dédiée de B1). Différé, noté dans `docs/05` §2.3 : la clé
  d'un lien devra inclure `kind` avec les vues L2 / L3 (changement majeur).

- **2026-09-19** — **Rapport de validation : chemins situés, constat structuré** (test de bout en bout du
  backend sur une instance réelle). Une règle du bundle entier (`hostname_not_in_devices`,
  `hostname_outside_infrastructure`, `duplicate_identity`) n'a pas de `loc` Pydantic : son chemin valait `$`
  et obligeait à lire le détail. Il situe maintenant le document (`lldp.0.hostname`, `devices`). Une racine
  qui n'est pas un objet (`[]`, `null`) reçoit « un objet JSON est attendu à la racine du bundle » au lieu
  d'un message citant une classe interne. `Finding` gagne `details`, forme structurée **sans valeur** du
  message (`nullable_key_absent` : `{field, occurrences, devices}`) : l'API et le shell lisent des champs, pas
  de la prose. `hostname` et `ref` restent les seuls champs à valeur, affichés sur demande.

- **2026-09-19** — **`vrf` : `"default"` = table globale, `null` = non lu ou sans objet** (proposition
  d'Orhan). Avant : « null = table globale », seul champ où `null` affirmait un fait sans réserve ; avec les
  clés absentes lues comme `null`, le validateur aurait affirmé une table de routage que personne n'a lue.
  Trois cas : `"default"` (nom réservé, minuscules exactes), le nom de la VRF tel que configuré, `null`
  (non lu, ou port commuté : aucune table de routage). Pourquoi une valeur réservée passe ici alors que `-1`
  a été écarté pour `last_change_age_seconds` : B1 ne calcule rien sur `vrf`, il s'en sert comme clé
  `(hostname, vrf)` ; la table globale devient une instance comme les autres et un B1 qui ignorerait que
  `default` est réservé ne casse rien. `default` est le nom natif sur NX-OS, EOS, IOS-XR ; la librairie de
  collecte traduit les autres (IOS-XE : pas de `vrf forwarding` ; Junos : `master` ; FortiOS : vrf `0` ;
  Gaia : table unique). Tableau complet : `CONTRAT.md` § « `null` et valeurs réservées ». Casse exacte, jamais
  normalisée (sur NX-OS `Default` est une VRF utilisateur) : à la casse ou aux blancs près, constat
  `vrf_default_case`. Chaîne vide refusée (`texte non vide | null`) : ni un fait, ni `null`. Pas de refus d'un
  `vrf` renseigné sur un port commuté : aucune règle de B1 ne le consomme. Anonymiseur : `default` conservé,
  y compris si un autre libellé (site, contexte) s'écrit `default` ; les autres noms pseudonymisés ; le mot
  « default » n'est plus sur-nettoyé dans les textes libres. Fixtures : interfaces routées ou adressées en
  `"default"`, ports commutés à `null` (testé). **Collision assumée** : une plateforme qui autoriserait une
  VRF utilisateur nommée exactement `default`, distincte de la table globale, ne peut pas l'exprimer (à
  vérifier sur IOS-XE : `vrf definition default`). `virtual_context` a le même défaut (« null si non
  partitionné ») : description reformulée (« non partitionné, ou non lu »), jeton à choisir avec la
  modélisation VSX, faute de nom natif commun (`root`, VS0, `system`). Descriptions en « null sinon »
  alignées (`parent_interface`, `vlan_id`, `min_links`, `mlag_id`).

- **2026-09-19** — **Une clé nullable absente est lue comme `null` et comptée** (demande d'Orhan). Avant :
  tout champ `X | null` était requis, `null` s'écrivait explicitement, l'oubli était un 422. Motif du
  changement : cette rigidité ne protégeait pas. Face au 422, l'exportateur écrit `doc.get("min_links")`, le
  `null` arrive quand même et Living Diagram ne voit pas l'oubli. Désormais l'oubli est visible : constat
  agrégé `nullable_key_absent`, un par champ (`interfaces[].mtu`, `interfaces[].counters.crc`,
  `tasks[].status_per_subject{}.started_at`), avec occurrences et devices, trié par chemin donc indépendant
  de l'ordre des documents. Il figure dans le **rapport d'ingestion**, archivé avec le bundle, et l'API le
  servira avec le rapport de corrélation de la run ; il **n'entre pas dans le snapshot** : il décrit la
  livraison, pas le contenu, et ne se recalcule pas depuis la forme canonique archivée (`docs/05` §2.7,
  sinon ingestion et rejeu donneraient deux snapshots). Garde-fous : `extra="forbid"` refuse toujours une faute de frappe, qui ne
  devient donc jamais un `null` ; les champs non nullables restent requis ; le défaut est toujours `null`,
  jamais une valeur (`oper_status` absent n'est pas `unknown`, `allowed_vlans` absent n'est pas `[]`) ; un
  test parcourt le schéma et échoue si un champ nullable n'a pas `null` pour défaut ou si un autre champ
  devient optionnel. Déterminisme : la forme canonique (`model_dump`) écrit toutes les clés, et c'est elle
  que le backend archive et dont il prend l'empreinte ; clé absente et `null` explicite donnent donc le même
  `sha256` (200 « déjà présent », testé). `validate` ne réécrit pas le fichier du producteur. Ce qu'on perd :
  la fonction de forçage en développement, rendue par `--strict-findings`, à utiliser dans les tests de
  l'exportateur. Doctrine écrite dans `CONTRAT.md` : **`null` n'affirme jamais un fait**, il veut dire « pas
  de valeur » (non lu, sans objet, non fourni) ; un fait s'écrit avec une valeur (`"never"`, `[]`, `none`).
  Revue indépendante appliquée : la recette de l'exportateur envoyait la forme canonique et effaçait donc
  les absences (corrigé, § Utiliser le paquet) ; l'anonymiseur les conserve désormais ; le parcours ne
  descend que dans les champs qui portent un modèle, jamais dans `extras` (trois fois plus rapide, plus de
  `RecursionError` sur un `extras` très imbriqué) ; un test relie le schéma au parcours. **Exception à
  connaître** : `switchport_mode` oublié alors qu'un VLAN est fourni n'est pas « lu comme null et compté »
  mais refusé (`access_vlan_outside_access_mode`, `trunk_vlans_outside_trunk_mode`), et le message vise le
  VLAN : un mode `null` ne porte aucun VLAN, qu'il soit écrit ou absent. Côté backend, deux livraisons de
  même empreinte peuvent différer par leurs absences : la réponse du POST décrit la livraison reçue,
  `GET …/report` la première, celle qui est archivée (`backend/README.md`).

- **2026-09-18** — **`lldp` et `cdp` réduits à six champs identiques** : `hostname`, `local_interface`,
  `neighbor`, `neighbor_interface`, `neighbor_capabilities`, `extras`. Demande d'Orhan : le topic LLDP est
  trop lourd à construire, et ce qu'un voisin annonce de lui-même se retrouve dans ses propres topics dès
  lors que toute l'infrastructure est collectée dans la run. Retirés de `lldp` :
  `neighbor_interface_subtype`, `neighbor_port_description`, `neighbor_chassis_id`,
  `neighbor_chassis_id_subtype`, `neighbor_management_ip`, `neighbor_system_description`, `ttl_seconds` ;
  de `cdp` : `neighbor_serial`, `neighbor_platform`, `neighbor_management_ip`, `neighbor_native_vlan`,
  `neighbor_duplex`, `neighbor_software_version`. Un document dit une seule chose : « sur ce port local,
  je vois ce voisin, sur ce port ». L'argument ne vaut que pour un voisin **collecté** ; champ par champ,
  ce qui remplace (docs/05) : les jointures de secours par serial, chassis-id et IP de management deviennent
  une jointure sur `system[].reported_hostname` (R0 : les deux dernières exigeaient déjà les `interfaces[]`
  du voisin, donc un voisin collecté) ; l'évidence « Cisco » de R1 se réduit à la présence de CDP et à
  `devices[].vendor`, le reste se compare par équivalence de noms de ports ; le claim `remote_description`
  disparaît (la description d'un voisin collecté est dans ses `interfaces[]`) ; `native_vlan_mismatch` (R5)
  compare les `interfaces[]` des deux bouts, ce qui l'étend aux câbles vus par LLDP seul. `ttl_seconds`,
  `neighbor_duplex` et `neighbor_software_version` n'avaient aucun consommateur. **Pertes assumées** : le
  port d'en face d'un voisin non collecté qui annonce une MAC (`lldpd`) n'est plus nommé par l'observé
  (R3 juge l'accord sur le device, contrôle `remote_port_is_mac`) ; un stub n'a plus que son nom et ses
  capacités dans l'inspecteur ; un voisin de `devices` renommé **et** injoignable finit en stub. Acceptées
  parce que la cible du moment est la topologie réseau, pas les serveurs, téléphones et bornes : ces stubs
  restent dans le snapshot et la vue réseau les masque par défaut, d'où `neighbor_capabilities` conservé.
  **Sans sous-type, une MAC se reconnaît à sa forme** : une valeur de `neighbor` ou de `neighbor_interface`
  qui a entièrement la forme d'une MAC (trois notations, toute casse) doit être normalisée, sinon
  `mac_not_normalized` ; la règle vaut pour `lldp` et `cdp`. L'énumération `LldpIdSubtype` disparaît. Un
  champ retiré reviendra avec sa règle et son test si un besoin apparaît. Version 1.0.0 modifiée en place.
  **Revue de code du jour, appliquée** : (1) le refus est porté par le champ (`lldp.4.neighbor_interface`)
  et non plus par le document, sinon le 422 du backend, qui ne garde que le chemin, ne disait pas lequel
  des deux identifiants corriger ; les deux sont rapportés s'ils sont tous deux fautifs. (2) Une MAC
  entourée de blancs est refusée elle aussi. **Seules trois notations sont reconnues comme MAC** (`aa:bb:…`,
  `aa-bb-…`, `aabb.ccdd.eeff`) : douze chiffres hexadécimaux sans séparateur, ou la notation HP
  `aabbcc-ddeeff`, peuvent être un vrai nom ou un serial, ils sont acceptés et jamais lus comme MAC ; à la
  librairie de collecte de sortir l'une des trois formes, normalisée. (3) `neighbor_capabilities` devient une
  liste de **jetons `^[a-z0-9_]+$`** : le « en minuscules » de la description n'était pas vérifié, et
  l'anonymiseur ne touche plus ce champ (un voisin nommé `router` remplaçait toutes les capacités `router`
  du bundle par son pseudonyme, en silence, alors qu'elles nourrissent le filtre de la vue réseau). (4)
  Anonymiseur : une feuille égale à un nom connu est remplacée entière avant le découpage en adresses ; un
  nom annoncé contenant une adresse (`AP3c:ec:ef:12:34:56`) fuyait tel quel.
- **2026-09-16** — `allowed_vlans` (interfaces) **passe de chaîne brute à liste d'intervalles**
  `[{"first": 10, "last": 20}, {"first": 45, "last": 45}]`. Demande d'Orhan : plus de texte ; il
  proposait une liste de chaînes `"10-20"` / `"45"`. Écartée au profit d'entiers : `"45"` en texte à
  côté de `access_vlan: 45` en entier, c'est le même fait sous deux types, et `"10-20"` est deux
  entiers en costume que B1 devrait parser alors que le contrat refuse déjà `"8121600"` pour un âge.
  Précédent : `ip_addresses`, liste d'objets. Le parse « notation vendeur → bornes » se fait une fois,
  côté collecte (doctrine : les valeurs se normalisent dans la librairie). `first` et `last` entiers
  stricts 1..4094, `first ≤ last` sinon refus (`vlan_range_inverted`) ; VLAN unique = `first == last` ;
  `all`, quelle que soit la façon dont l'équipement l'imprime (« ALL » ou « 1-4094 » selon la commande)
  = `[{"first": 1, "last": 4094}]` ; `none` = `[]` ; non lu = `null` ; `[]` hors mode trunk refusé
  comme toute valeur non nulle. Ni ordre ni fusion des adjacents imposés au producteur : Cisco sort trié
  et disjoint, l'ordre canonique et l'union sont le travail de R6 dans B1. **Doublons et chevauchements
  refusés** (`vlan_ranges_overlap`, revue du jour) : aucun équipement n'imprime `10-20,15-25`, cette
  forme ne vient que d'un parseur cassé, et le contrat refuse déjà un membre HA en double. La protection de l'anonymiseur
  ajoutée le matin même pour la chaîne est retirée avec son test, sans objet sur des entiers. Le test
  d'invariant demandé par la revue (un device nommé `10` ne touche pas les entiers) a révélé un défaut
  préexistant de l'anonymiseur : un hostname court (`10`, `aa`) était remplacé à l'intérieur des IP et
  des MAC (`10.10.0.2` → `sw-….sw-….0.2`), sortie invalide donc refusée, bundle non anonymisable.
  Corrigé : les adresses sont des atomes, les littéraux ne s'appliquent qu'entre elles. Version 1.0.0
  modifiée en place.
- **2026-09-16** — `access_vlan` (interfaces) **entre au premier niveau** : `entier ≥ 1 ≤ 4094 | null`,
  « VLAN d'un port `access` ; null sinon ». Question d'Orhan : où va l'access VLAN ? Nulle part
  jusqu'ici : `vlan_id` est réservé à la sous-interface et à la SVI, `native_vlan` / `allowed_vlans` au
  trunk ; la fixture avait deux ports `access` sans VLAN. Réutiliser `vlan_id` a été écarté : le numéro
  n'y a pas le même sens (tag 802.1Q d'une sous-interface, VLAN dont la SVI est la face L3,
  appartenance non taguée d'un port access) et B1 devrait rebrancher sur `type` et `switchport_mode`
  pour le lire, le défaut refusé le matin même avec la sentinelle `-1`. Règle de B1 qui justifie le
  premier niveau : sur un port access, Cisco annonce l'access VLAN dans le TLV Native VLAN de CDP
  (`NATIVE_VLAN_MISMATCH` entre deux ports access) ; le contrôle « VLAN natif en désaccord aux deux
  bouts » (docs/01 §3) compare donc `neighbor_native_vlan` au VLAN non tagué local, `access_vlan` en
  access, `native_vlan` en trunk (révisé le 2026-09-18 : `neighbor_native_vlan` retiré, B1 compare les
  `interfaces[]` des deux bouts ; `access_vlan` garde sa raison d'être). Pas de champ `untagged_vlan` générique : la dérivation tient en une
  ligne dans B1 et le contrat garde le vocabulaire de la configuration. Dans la même passe :
  `native_vlan` et `neighbor_native_vlan` (CDP) bornés `1..4094` comme `vlan_id` (aucune borne avant) ;
  **cohérence avec le mode refusée à la validation** (`access_vlan_outside_access_mode`,
  `trunk_vlans_outside_trunk_mode`) : IOS et NX-OS affichent « Access Mode VLAN » et « Trunking Native
  Mode VLAN » sur tout port quel que soit le mode, le producteur met à null la valeur inactive ; c'est une
  incohérence interne du bundle, pas un désaccord réseau à rendre visible. Un seul sens : un mode connu
  n'oblige pas à connaître ses VLAN, mais un mode `null` n'en porte aucun. Revue : `switchport_mode`
  n'était qualifié nulle part ; c'est désormais le **mode configuré résolu** (DTP : le résultat négocié
  lien up, l'administratif lien down), jamais « down » : un port access `notconnect` garde `access` et
  son VLAN (IOS affiche « Operational Mode: down », c'est « Administrative Mode » qui compte) ; `none` =
  lu, aucun des trois modes ne s'applique (mode brut dans `extras`) ; `null` = non lu. `allowed_vlans`
  protégé dans l'anonymiseur (un voisin nommé `1000` corrompait `10,1000` en silence ; protection retirée
  le jour même, le champ étant passé en intervalles d'entiers, voir ci-dessus). Consommateur B1 :
  `native_vlan_mismatch` (docs/05 R5). Version 1.0.0 modifiée en place.
- **2026-09-16** — `last_change_age_seconds` (interfaces) **porte trois faits distincts** :
  entier ≥ 0 (âge connu), `"never"` (l'état n'a pas changé depuis le dernier démarrage : RFC 2863,
  `ifLastChange = 0`, état pris avant la dernière réinitialisation de l'agent ; NX-OS « Last link
  flapped: never »), `null` (non lu). Orhan proposait `-1` pour
  « never » ; écarté : le champ n'avait aucune borne, un `-1` passait déjà la validation et la règle
  de flap (`collected_at - âge`, docs/01 §2.5) l'aurait lu comme « a flappé une seconde après la
  collecte », sans erreur. Une sentinelle dans un champ arithmétique ment en silence ; `"never"` fait
  planter toute soustraction et le type TypeScript généré (`number | "never" | null`) oblige à traiter
  la branche. C'est un fait du domaine, pas une absence : il a son type, comme `family: 4 | 6`.
  **B1 interprète**, pas le parseur : `"never"` ⇒ âge ≥ `system.uptime_seconds`, donc pas de flap
  depuis le boot ; la jointure avec `system` appartient à B1, pas à une commande. Demander au
  producteur de convertir en uptime a été écarté (jointure `show interfaces` / `show version` dans le
  collecteur, et perte du fait « jamais »). Borne `ge=0` ajoutée ; `-1`, `-2`, toute autre chaîne
  refusés par test. Version 1.0.0 modifiée en place.
- **2026-09-14** — `local_role` et `local_state` **disparaissent de `HaStatus`** (demande
  d'Orhan). Le device local figure dans `members` : son rôle et son état s'y lisent, la copie
  n'apportait rien et personne ne la lisait (B1 construit le cluster depuis `members[]`,
  `ha_view_mismatch` compare les vues entre membres). `local_state` était déjà ambigu : l'exemple
  de `docs/04` y mettait `in_sync`, valeur hors de `HaState`, l'état de synchronisation restant dans
  `extras`. En contrepartie, un document `ha` dont le `hostname` n'est pas dans `members[].name`
  est **refusé** (`ha_local_not_in_members`), sans quoi la vue locale se perdrait en silence ; un
  membre listé deux fois aussi (`ha_member_duplicate`), `members` étant devenu la seule source de la
  vue locale. La convention `standalone` est imposée et non seulement écrite : exactement un membre,
  le device lui-même, rôle `member` (`ha_standalone_not_alone`) ; un device sans HA peut aussi
  n'émettre aucun document `ha`. Version 1.0.0 modifiée en place (archive vide au moment du
  changement).
- **2026-09-14** — `infrastructure` **disparaît des documents de topic** (`tasks`, `interfaces`,
  `aggregates`, `lldp`, `cdp`, `system`, `ha`). Il ne reste qu'au premier niveau du bundle et sur
  `devices`, la table de référence complète. Motif : le validateur imposait déjà l'égalité avec le
  bundle, la copie ne portait donc aucune information et n'était qu'une occasion d'être fausse ;
  pire, il vérifiait la copie et non `devices` (un document d'un device d'une autre
  infrastructure passait s'il affichait celle du bundle). Le contrôle `hostname_outside_infrastructure`
  passe désormais par `devices` : **le périmètre d'un bundle est celui de `devices` au moment de
  l'export**. Un device déplacé d'une infrastructure à l'autre entre la run et l'export sort dans le
  bundle de sa nouvelle infrastructure.
- **2026-09-14** — `platform` **retiré du topic `system`** (introduit le 2026-09-10 comme
  énumération fermée `cisco_ios | cisco_xe | cisco_nxos | cisco_xr | fortinet | checkpoint_gaia | other`).
  Critère posé par Orhan et retenu pour tout le contrat : **le contrat demande ce que B1 consomme,
  jamais ce qu'un producteur possède**. Ce qui se passe dans le collecteur (choix d'un driver, parseur,
  humain, API) ne regarde pas Living Diagram ; c'est précisément ce que le contrat isole. Or aucune
  règle de `docs/05` ne lit une famille d'OS : R1 résout les noms d'interfaces distants par recherche
  dans les `interfaces[]` du device résolu, et pour un stub ou un externe, qui n'ont pas de document
  `system`, s'appuie sur les évidences CDP / LLDP et `devices[].vendor`. Les agrégats et les topics
  attendus sont déjà normalisés par le contrat (`aggregates[]`, `status_per_subject`). Le champ n'avait
  aucun consommateur, ni dans le code ni dans les règles. Si une règle en a un jour besoin, il reviendra
  avec sa règle et son test, en version mineure. `os_name` (devices) reste une chaîne libre
  d'affichage ; `neighbor_platform` (CDP) n'est pas concerné : évidence brute, consommée par R1 et par l'`evidence` des stubs
  (retiré à son tour le 2026-09-18, voir plus haut).
- **Version du contrat** — `1.0.0` reste la version tant qu'aucun bundle réel n'a été ingéré : d'ici là,
  les changements se font en place et sont journalisés ici. Le gel commence au premier bundle réel ;
  ensuite, retirer ou renommer un champ = version majeure, ajouter un champ ou une valeur
  d'énumération = version mineure.
- **2026-09-10** — les noms `vendor` / `model` sont conservés (vos `brand` / `brand_model` sont
  renommés dans l'exportateur). Ils restent des **chaînes libres** ou `null` : la liste des
  modèles est ouverte. `vendor` n'entre dans une règle que comme évidence de R1 (`devices[].vendor =
  cisco`) pour l'expansion des noms chez un voisin sans `interfaces[]`. Seul `type` (devices) est figé.

## Limites connues de l'anonymiseur

- Un libellé à vocabulaire courant (VRF `management`, contexte `root`) est aussi remplacé
  dans les textes libres : sur-nettoyage, jamais fuite.
- Deux clés d'`extras` ne différant que par la casse fusionnent après pseudonymisation ; de même
  deux libellés (infrastructure, site, VRF…) ne différant que par la casse : un device dont
  `infrastructure` diffère de celle du bundle par la casse seule entre dans le périmètre une fois
  anonymisé. Le bundle reste valide, la forme n'est plus fidèle.
- L'injectivité est vérifiée pour les hostnames et les serials, pas pour les libellés.
- Les noms cités uniquement dans une description et plus courts que 4 caractères ne sont
  pas remplacés dans les autres textes libres (ils le sont dans la description).
- Les chemins des rapports contiennent des noms de champs et de clés, jamais de valeurs.
