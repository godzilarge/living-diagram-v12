# Revue indépendante — B1 R5 : contrôles d'état, golden, `ld correlate` fichier (2026-09-26)

Rapport rendu tel quel par le relecteur (agent indépendant, sondes exécutées, aucun fichier du dépôt modifié
hors ce rapport). Suivi en fin de document.

---

Périmètre : `backend/src/ld_backend/correlate/state.py` (nouveau, R5) et son appel dans `correlate/__init__.py`,
`assemble.py` (paramètre `state`), `context.py` (`subject_for`) ; `snapshots.py` (`correlate_data`, `FileCorrelation`)
et `cli.py` (`ld correlate bundle.json --out`, `_read_json`) ; `contracts/fixtures/snapshot-minimal.json` (golden) et
`contracts/tests/test_skeleton.py` ; `render/assets/js/dom.js` (`endWithFacts`) ; tests `test_state.py`,
`test_determinism.py`, `test_cli.py`, `viewer.test.js`. Référence : `docs/05` R5, §4, §5 (scénarios 2, 8, 9), §6
« Précisions d'implémentation de R5 » ; `backend/README.md` § R5 ; contrat de sortie `contracts/src/ld_contracts/snapshot/`.

État constaté : `backend` **306 tests verts** (`correlate/` 167), couverture 99 %, `state.py` 100 %, `cli.py` 99 %,
`snapshots.py` 100 % ; `contracts` **400 tests verts** ; `ruff check src tests` propre des deux côtés ;
`tests/test_render.py` 15/15 dont les tests Node du visualiseur et le rendu réel sous Chromium. Le golden est
**identique à l'octet** à ce que `uv run ld correlate ../contracts/fixtures/bundle-minimal.json --out …` écrit (`cmp`),
et l'archive n'est pas touchée (`LD_ARCHIVE_DIR` pointé sur un dossier inexistant : il n'est pas créé).

Sondes exécutées depuis `backend/` avec `PYTHONPATH=. uv run python`, scripts dans le scratchpad de session
(`probe_r5_state.py` P1–P16, `probe_r5_more.py` Q1–Q11, `probe_r5_seed.py` déterminisme en sous-processus,
`probe_r5_viewer.test.js` V1–V4 sous `node --test` avec les pages produites par `ld render`, commandes CLI C1–C6 et
G1–G3 à la main). Chaque sonde Python est une mutation de `contracts/fixtures/bundle-minimal.json` via les helpers de
`tests/correlate/conftest.py` (`variant`, `run`, `interface`, `lldp_doc`, `checks`, `find_link`) ; les mutations sont
recopiées ci-dessous pour être rejouables. Chaque snapshot produit a été repassé dans `validate_snapshot_dict`.

## Critique

Aucun. **Aucun chemin trouvé vers un refus du contrat de sortie** (`reference_unknown`, `check_severity_not_allowed`,
`duplicate_identity`, `not_canonical_order`, `report_counts_mismatch`) : voir « Vérifié et trouvé correct ». Aucune
dépendance à l'ordre des documents ni à la graine de hachage.

## Haut

**H1 — Un câble arrêté à un agrégat (R1-bis) est jugé par R5 comme un câble entre deux ports : `link_speed_mismatch`
faux, `link_oper_mismatch` et `native_vlan_mismatch` dont un bout est l'agrégat.** `state.py:32-35` (`_ends`) cherche
les deux bouts dans `interfaces[]` sans regarder leur `type` ; un agrégat (`type = aggregate`) y est, donc
`_speed_checks` (`:63-69`), `_oper_checks` (`:47-60`) et `_vlan_checks` (`:81-92`) le comparent à un port physique.
Sonde P1 (la variante `_fortigate_aggregate` de `test_determinism.py` : membre indéterminé, câble arrêté à `agg-core`) :
```python
d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "fw-edge-01", "agg-core", ("router",)))
interface(d, "sw-core-02", "Ethernet1/4")["description"] = None
interface(d, "fw-edge-01", "x2")["description"] = "C2|sw-core-02|Ethernet1/4|"
interface(d, "fw-edge-01", "x1")["description"] = "C2|sw-core-02|Ethernet1/4|"
```
```
remote_port_is_aggregate [warning] refs=[interface sw-core-02/Ethernet1/4] details={neighbor: fw-edge-01, aggregate: agg-core, members: [x1, x2]}
link_speed_mismatch [warning] refs=[link fw-edge-01/agg-core ↔ sw-core-02/Ethernet1/4]
    details={speeds: [{fw-edge-01, agg-core, 20000}, {sw-core-02, Ethernet1/4, 10000}]}
```
20 000 est la somme des deux membres du FortiGate, 10 000 la vitesse du port d'en face : **il n'y a aucun désaccord de
vitesse**, c'est un warning inventé par la comparaison d'un faisceau avec un brin. P1b (`agg-core` passé `down`,
« No operational members ») donne un `link_oper_mismatch` dont le **témoin est l'agrégat**
(`refs=[interface fw-edge-01/agg-core, link …]`) ; P1c (`agg-core` en trunk natif 99, `Ethernet1/4` access 100) donne un
`native_vlan_mismatch` agrégat ↔ port. Le cas est **réel chez Orhan** (2026-09-22 : le seul firewall avec LLDP annonce
le nom de son agrégat sur chaque membre) et se produit dès que R1-bis ne trouve pas le membre.
Attendu : `docs/05` R5 parle des « deux bouts » d'un câble ; la décision du 2026-09-20 dit que seules les interfaces
`physical` / `management` produisent des claims de câble ; le catalogue dit déjà pour `remote_port_is_aggregate` « le
câble s'arrête à l'agrégat » : ce câble est un câble dégradé, déjà signalé, pas un câble dont on peut juger l'état aux
deux bouts. **Correction (vérifiée, sonde Q3, `probe_r5_more.py`)** : `_ends` ne conclut que si les deux bouts sont
des ports de câble :
```python
def _ends(ctx, link):
    a = ctx.interfaces.get((link.a.hostname, link.a.interface))
    b = ctx.interfaces.get((link.b.hostname, link.b.interface))
    if a is None or b is None or a.type not in CABLE_PORTS or b.type not in CABLE_PORTS:
        return None
    return (a, b)
```
P1 donne alors `link_speed_mismatch = 0`, un seul `link_oper_mismatch` (celui du scénario 2), `remote_port_is_aggregate`
inchangé ; les tests existants passent. Ajouter P1 en test (`test_a_cable_stopped_at_an_aggregate_has_no_state_check`).
**Défaut pur** pour la vitesse ; pour l'état et le VLAN, la même règle est la seule cohérente avec « le câble s'arrête à
l'agrégat » (à annoncer, pas à trancher). Note : `Link.speed_mbps` de R3 vaut déjà `null` sur ce câble (« différente
ou inconnue »), ce qui est acceptable ; R3 n'est pas en cause.

## Moyen

**M1 — `device_partial_collection` avec `failed: []` : la raison du `partial` disparaît quand le topic en échec n'est
pas un topic de B1.** `state.py:127-135` (`_failed_topics`) ne parcourt que `sorted(SUBJECT_ALIASES)` ; tout autre
sujet de `status_per_subject` (clé libre dans le contrat, `models_run.py:54`) est ignoré. Sonde P8c :
```python
t = next(t for t in d["tasks"] if t["hostname"] == "sw-core-02")
t["status_per_subject"]["bgp"] = {"status": "failed", "started_at": None, "ended_at": None, "error": "no bgp"}
t["status_per_subject"]["cdp"].update(status="success", error=None)
```
```
device_partial_collection [info] refs=[node sw-core-02] details={"failed": []}
```
Le catalogue dit « collecte partielle ; **les topics en échec sont dans `details`** » : ici il y en a un et il n'y est
pas. Le collecteur d'Orhan collectera des topics que B1 ne consomme pas (`mac_table` est décidé, ARP viendra) ; un
`partial` muet oblige à retourner dans Mongo. **Défaut pur.** Correction : après la boucle sur les topics connus,
ajouter les sujets hors de tout alias sous leur nom brut, triés :
```python
known = set().union(*SUBJECT_ALIASES.values())
for name in sorted(set(task.status_per_subject) - known):
    if task.status_per_subject[name].status == TaskStatus.FAILED:
        out.append({"topic": name, "error": task.status_per_subject[name].error})
```
(les topics connus restent sous leur nom canonique, en tête ; ou trier l'ensemble par `topic`, au choix, mais fixer
l'ordre dans un test). Cas voisin, **sonde Q5**, à traiter à part (voir question Q-f) : `cdp` en `success` et son alias
`cdp_neighbors` en `failed` dans la même task ⇒ `failed: []` et couverture `success` : cohérent entre eux (le canonique
gagne, comme la couverture), mais l'échec sous l'alias est perdu en silence.

**M2 — Task `success` avec un topic `failed` : silence complet.** Sonde P8b :
```python
next(t for t in d["tasks"] if t["hostname"] == "sw-core-01")["status_per_subject"]["lldp"]["status"] = "failed"
```
```
coverage sw-core-01 lldp : failed ; aucun device_* sur sw-core-01 ; aucun constat du contrat d'entrée
```
La couverture dit `failed`, le nœud dit `success`, aucun contrôle ne dit que le document se contredit. Ni le contrat
d'entrée (`checks.py` n'a pas de règle statut global ↔ statuts par sujet) ni R5 (`state.py:144-147` ne regarde que
`unreachable` et `partial`). La conséquence est concrète : ce device sans LLDP collecté n'a pas de
`one_way_observation` contre lui (règle R3, `_both_collected_neighbors` lit la couverture) et rien ne le montre côté
contrôles. Doctrine du projet : « un désaccord devient un contrôle d'intégrité visible ». Les statuts des tasks sont
une question ouverte depuis le 2026-09-10 (« valeurs de `status` »), donc **règle douteuse quant à la forme**, mais le
silence est un défaut. Recommandation : un constat du **contrat d'entrée** `task_status_inconsistent` (warning,
`origin = bundle`, recopié dans le snapshot comme les autres ; principe « ce que B1 constate sur la forme du document
appartient au contrat ») : `success` avec un sujet `failed`, `partial` sans aucun sujet `failed` (sonde P8a : produit
aujourd'hui `failed: []`, visible mais muet sur la cause), `unreachable` avec `status_per_subject` non vide (sonde P8d :
accepté, couverture forcée à `absent`). À soumettre à Orhan avec la question des statuts (Q-c).

**M3 — `--out` égal au fichier d'entrée écrase le bundle par le snapshot, sans avertissement.** `cli.py:67-88`
(`_correlate_file`) lit puis écrit, sans comparer les chemins ; `ld render` (`cli.py:113-142`) a le même défaut,
préexistant. Sonde C3 / C4 :
```
$ cp bundle-minimal.json same.json && uv run ld correlate same.json --out same.json
same.json	created	6 nœuds	6 câbles	error=2 warning=3 info=6      (exit 0)
$ python -c "…"  → contenu maintenant : snapshot
$ cp bundle-minimal.json same2.json && uv run ld render same2.json --out same2.json
page écrite : same2.json (6 nœuds, 6 câbles, 11 contrôles, 143 Ko)   (exit 0) → le fichier commence par <!doctype html>
```
Une faute de frappe dans la boucle de mise au point d'Orhan (`ld correlate export.json --out export.json`) détruit
l'export qu'il vient de produire, sur les deux commandes. **Défaut pur**, garde-fou à trois lignes, partagé par les
deux commandes : refuser quand `Path(args.out).resolve() == Path(args.file).resolve()` (« --out désigne le fichier
d'entrée : rien n'est écrit », `EXIT_USAGE`), avant toute écriture. Test à ajouter pour `correlate` et `render`.

## Bas

**B1 — Options des deux modes mélangées, ignorées en silence.** Sondes C1 et C2 :
```
$ uv run ld correlate b.json --out s.json --infrastructure infra-x --run-id r1   → mode fichier, exit 0, options ignorées
$ uv run ld correlate --infrastructure infra-lab --out s.json                   → mode archive, --out ignoré, s.json absent
```
`cli.py:91-96` : `if args.file:` décide tout. Un utilisateur qui croit « corréler la run r1 archivée et l'écrire dans
s.json » obtient autre chose sans le savoir. `ld render` a la même forme (fichier ou `--infrastructure --run-id`) et
le même silence. Proposer un refus `EXIT_USAGE` quand un fichier est donné avec `--infrastructure` / `--run-id`, et
quand `--out` est donné sans fichier à `correlate` (« --out ne vaut qu'avec un fichier bundle »). Défaut pur, mineur.

**B2 — La ligne de sortie du mode fichier emprunte le vocabulaire de l'archive.** `cli.py:87` réutilise
`_correlation_line(args.out, summarize(...))`, qui écrit le statut `CorrelationSummary.status` :
```
/…/snapshot.json	created	6 nœuds	6 câbles	error=2 warning=3 info=6
```
Rien n'est « créé » dans une archive ; `ld render` dit « page écrite : … (6 nœuds, 6 câbles, 11 contrôles, 143 Ko) ».
Proposer la même forme : « snapshot écrit : <chemin> (6 nœuds, 6 câbles, error=2 warning=3 info=6) ». Le test
`test_correlate_file_writes_the_canonical_snapshot_without_archive` s'appuie sur `"created" in line` : à adapter.

**B3 — `device_partial_collection` ne porte pas l'erreur globale de la task.** `state.py:146-147` passe seulement
`failed=…` ; `device_unreachable` (`:145`) porte `error=task.error`. Sonde Q1 :
```python
next(t for t in d["tasks"] if t["hostname"] == "sw-core-02")["error"] = "2 topics timed out after 30s"
```
```
device_partial_collection details={"failed": [{"topic": "cdp", "error": "command timeout on sw-core-02 (10.10.0.2)"}]}   # l'erreur globale a disparu
```
Le contrat dit de `DeviceTask.error` « erreur globale (connexion, authentification) ; null sinon » : quand elle est
lue sur un `partial`, elle est la seule explication possible d'un `failed: []` (P8a). Ajouter `error=task.error`
(additif ; change le golden si la fixture en a une, ce n'est pas le cas). Défaut pur, petit.

**B4 — Le golden dépend de la fin de ligne du poste, sans garde.** Le dépôt n'a pas de `.gitattributes` ; le test
`test_golden_snapshot_matches_byte_for_byte` (`test_determinism.py:65-67`) compare `read_bytes()`. Sur un poste où
`core.autocrlf = true` (Windows par défaut), le fichier est extrait en CRLF et le test échoue, et son message
(`REGENERATE`, `:14-17`) dit que « le snapshot de référence a changé » et invite à régénérer, ce qui est faux (B1 n'a
pas changé) et remplacerait un fichier LF par un fichier LF, sans effet sur la cause. Vérifié ici : LF seul, aucun
caractère non ASCII dans le golden (`ensure_ascii=False` est donc sans risque aujourd'hui, et robuste par `read_bytes`
demain). Proposer `.gitattributes` à la racine : `*.json text eol=lf` (ou `contracts/fixtures/*.json -text`), et un
mot dans le message : « (fin de ligne LF attendue) ». Le projet tourne sous Linux : bas.
Au passage, le message est juste sur ce qu'il décrit : la même commande, depuis `backend/`, produit bien les mêmes
octets (G1). Rappeler dans `contracts/README.md` que le golden change aussi quand **le contrat d'entrée** change (le
`bundle_sha256` est l'empreinte de la forme canonique du bundle, `archive.fingerprint`) : c'est voulu (le golden fige
fixture ⊕ contrat ⊕ B1), mais il faut le savoir pour lire la différence.

**B5 — L'ordre des faits d'un bout suit l'ordre alphabétique des clés JSON, pas le sens.** `dom.js:60-64`
(`endWithFacts`) parcourt `Object.entries(value)` ; le snapshot est écrit à clés triées (`canonical_json`), d'où
« sw-core-02 · Ethernet1/2 (oper_reason suspended by LACP, oper_status down) » (la raison avant l'état) et
« (switchport_mode trunk, vlan 99) ». Sonde V4 : le même objet dans l'ordre inverse donne l'ordre inverse. Lisible,
mais l'assertion du test (`viewer.test.js:129`) fige un ordre qui n'a pas été choisi. Proposer un ordre préféré
(`oper_status`, `oper_reason`, `speed_mbps`, `switchport_mode`, `vlan`, puis le reste trié). Cosmétique.

**B6 — Petites choses.** (a) `contracts/tests/test_skeleton.py:18` : `validate_file(...).bundle` sans `assert
report.ok` : si `bundle-minimal.json` devenait invalide, le test échouerait par `AttributeError: 'NoneType'` au lieu
d'un message, et avant le test du golden. (b) `docs/05` ligne 560 cite encore `GET /api/snapshots/{infrastructure}/{run_id}`,
route remplacée par `GET /api/snapshot?infrastructure=&run_id=` le 2026-09-19 (dérive préexistante, à corriger au
passage puisque le paragraphe voisin vient d'être réécrit). (c) `state.py:72` : `untagged_vlan` est le seul nom public
du module, sans usage externe (`grep` : `test_state.py` seulement, dans un nom de test) : `_untagged_vlan`, ou
l'exposer sciemment (il servira à la vue L2).

**B7 — Couverture de tests.** Non couverts : H1 (câble arrêté à un agrégat : aucun contrôle R5), M1 (topic inconnu en
échec ; alias en échec à côté du canonique, comportement figé), M3 (`--out` = entrée, `correlate` et `render`), B1
(options mélangées), B3 (`task.error` sur `partial`), un hub dont le port est `down` (sonde P5 : deux
`link_oper_mismatch`, un par câble, même témoin : la clé `(code, refs, details)` les distingue — à figer, c'est ce qui
évite la perte par `_unique_sorted_checks`), les deux bouts `not_present` sur un câble documenté (sonde P10 :
`link_down` + deux `documented_port_without_transceiver`), `management` `not_present` (sonde Q9). Le déterminisme de
R5 sous plusieurs graines n'est couvert que par la variante `r4` de `test_review2.py` : ajouter une variante qui
déclenche les sept codes (la sonde `probe_r5_seed.py` en fournit une : `lldp_neighbors`, `system_info`, `ha_status`
en échec, hub down, vitesse et VLAN différents, transceiver documenté).

## Vérifié et trouvé correct

- **Conformité à `docs/05` R5, code par code.** `link_oper_mismatch` : warning, refs câble + port down, câbles
  `confirmed` / `observed_only` seulement (P14 : `observed_only` ⇒ contrôle ; test : `documented_only` ⇒ rien) ;
  `link_down` : info, ref câble seul, tous statuts (P10, P16) ; `link_speed_mismatch` : warning, deux vitesses lues et
  différentes, tous statuts, `null` ne conclut rien ; `native_vlan_mismatch` : warning, câble observé, deux interfaces
  présentes, access ↔ access, access ↔ trunk (test), trunk ↔ trunk (P6b aux bornes 1 / 4094), `none` (P6) et `routed`
  (test) ne concluent rien ; `documented_port_without_transceiver` : warning, `not_present` + description parsée, ports
  `physical` (test) et `management` (Q9), pas `aggregate` (test) ni `subinterface` (P15), description non lue ⇒ rien +
  `description_unparseable` (Q7), description sans port (`C3|sw-dist-01|`) ⇒ contrôle avec `port: null` (Q8) ;
  `device_unreachable` : error, ref nœud, `details.error` (P8i : `null` recopié tel quel) ; `device_partial_collection` :
  info, ref nœud, alias lus dans l'ordre de la couverture (test ; P8e : `cdp` failed + `cdp_neighbors` success ⇒ `cdp`
  listé, couverture `failed`, cohérents). Sévérités = colonne §4. Ce que le code fait et que la spec ne dit pas :
  « down » = tout état ≠ `up` (P11 : `dormant` ↔ `testing` ⇒ `link_down`), `unknown` ⇒ rien (Q10 : `unknown` ↔ `down`
  ⇒ ni l'un ni l'autre), restriction de `documented_port_without_transceiver` aux ports physiques : les trois sont
  annoncés dans `docs/05` §6 et `backend/README.md` § R5, et raisonnables (voir Q-d).
- **Contrat de sortie, par contrainte.** `link_check` et `interface_check` passent par `port_ref`, mais aucun repli sur
  le nœud n'est possible en R5 : `_ends` exige les deux bouts dans `interfaces[]`, `_transceiver_checks` itère
  `interfaces[]`. Un bout absent (P7 : `sw-core-02/Ethernet1/2` retiré ; P13 : port distant `Ethernet1/9` inconnu ;
  P9 : stub à port MAC ; test : externe `rt-wan-01`) ⇒ `Link.oper = unknown` par R3 et aucun contrôle R5 : cohérent.
  Les tasks visent toujours un nœud : `TOPIC_FIELDS` inclut `tasks` (`bundle.py:28`), donc `hostname_not_in_devices`
  et `hostname_outside_infrastructure` refusent le reste, et `_check_unique_topic_keys` refuse deux tasks pour un
  hostname (P8h : `duplicate_identity`) : la docstring de `_device_checks` est exacte. Sévérité unique pour les sept
  codes (`sole_severity`). Un hub à trois câbles sur un port down (Q6) donne trois `link_oper_mismatch` distincts (le
  `LinkRef` diffère) et `report.counts.checks == len(checks)`. Tous les snapshots des sondes passent
  `validate_snapshot_dict`.
- **Déterminisme.** `probe_r5_seed.py` : variante qui déclenche les sept codes R5 (dont trois alias de topics en échec),
  permutation de **toutes** les sections et des clés de `status_per_subject`, `PYTHONHASHSEED` ∈ {0, 1, 42, 12345,
  random}, trois permutations chacune, en sous-processus ⇒ **une seule empreinte**. Lecture du code : `_link_checks`
  trie par `link_key`, `_device_checks` par hostname, `_failed_topics` par nom canonique, `_transceiver_checks` suit
  l'ordre du bundle mais l'assemblage retrie par `check_key` ; `subject_for` lit les alias dans un ordre écrit.
- **Le golden.** Identique à l'octet à la sortie de la commande du message (`cmp`, G1) ; pas d'horloge, pas de chemin,
  pas de nom de machine dedans (`source` = enveloppe du bundle + `bundle_sha256` calculé sur la forme canonique hors
  enveloppe) ; LF, ASCII pur, `}\n` final ; `write_bytes` sans conversion. Le test `contracts` vérifie ce qui est
  utile de son côté : validité au contrat de sortie (ce qui couvre « aucun code hors catalogue » par l'énumération
  `CheckCode`, « `report.counts` cohérent » par `report_counts_mismatch`, ordres canoniques, références), même
  infrastructure et run que le bundle, mêmes devices en périmètre, fin de ligne. L'égalité à l'octet est du côté qui
  sait la calculer (`backend`). Rien d'important ne manque, hors B4 et B6-a.
- **Le mode fichier de `ld correlate`.** Même chemin que l'archive (`validate_dict` → `fingerprint` → `correlate`), donc
  mêmes octets (test) ; l'archive n'est jamais construite (`BundleArchive` n'apparaît pas dans `_correlate_file` ;
  `LD_ARCHIVE_DIR` sur un dossier inexistant : il n'est pas créé, G2) ; `--out` requis (exit 2) ; fichier illisible /
  UTF-16 / JSON invalide (exit 1, même message que `ld ingest` et `ld render`, `_read_json` partagé) ; bundle hors
  contrat (C5 : « bundle hors contrat » + liste `error_payload`, la même forme que `ld render` et que l'API, exit 1,
  rien d'écrit) ; dossier de sortie absent (exit 1, « snapshot non écrit ») ; sans fichier ni `--infrastructure` (exit 2).
  Un bug de B1 remonte avec sa trace, comme `ld render` (annoncé). `_read_json` retiré de trois endroits, une seule
  copie. Docstrings de `correlate_data`, `_correlate_file`, `_cmd_correlate` exactes.
- **Le visualiseur.** V1 (page produite par `ld render` sur une fixture hostile : `oper_reason` =
  `<img src=x onerror=alert(1)>"<b>gras</b>`, `error` de task = `<script>alert('cdp')</script>`) : dans l'onglet
  Contrôles et dans l'inspecteur du câble, la chaîne est écrite **telle quelle comme texte**, aucun élément `img`,
  `script`, `b` n'existe dans l'arbre : `plain` ne rend que des chaînes, `definition` les met dans un `dd` via `h`, qui
  ne crée que des nœuds texte (`dom.js:20`) ; le faux DOM n'a pas d'`innerHTML` et le test
  `test_the_viewer_never_writes_html_from_data` garde la source. V2 : `link_oper_mismatch` (refs câble + port) est
  porté **une fois** par le câble nommé (`distributeChecks` : `named.length` ⇒ `continue`, la branche par port n'est
  pas consultée), une fois par nœud (`attachChecks` : `hosts` est un `Set`), jamais en `portChecks` ; `device_*` une
  fois sur leur nœud. V3 (hub, port down, deux câbles observés) : chaque câble porte exactement le `link_oper_mismatch`
  qui le nomme, 3 sur le nœud `sw-core-01` (deux du hub + celui d'Eth1/2). `mentioned` voit bien les bouts de `states`
  (`hostname` + `interface`) mais n'est jamais sollicité pour ces contrôles.
- **Qualité.** Fonctions toutes < 30 lignes, module de 153 lignes ; aucune mutation d'entrée (tuples, dicts neufs) ;
  docstrings exactes (`_oper_checks` : « `down` = aucun bout `unknown`, pas tous `up` » correspond à `merge._oper`) ;
  `subject_for` partagé entre couverture et R5, ce qui garantit la cohérence P8e ; `assemble` inchangé hors le paramètre
  `state`. Documentation à jour : `docs/05` §6 (arborescence `state.py`, précisions R5, golden), `backend/README.md`
  § R5, `QUICKSTART.md` (mode fichier), `contracts/README.md` (golden « généré, jamais édité »).

## Questions pour Orhan (règles douteuses, pas des défauts)

- **Q-a — Vitesse lue sur un port `down` : la comparer ?** Sonde P3 (`sw-core-01/Ethernet1/2` à 1 000, l'autre bout
  `down` « suspended by LACP » à 10 000) ⇒ `link_oper_mismatch` **et** `link_speed_mismatch`. Le contrat dit
  `speed_mbps` « null si down », mais la fixture elle-même garde 10 000 sur le port suspendu par LACP (physiquement up,
  protocole down : la vitesse est réelle). Recommandation : garder tel quel, visible, un écart de vitesse est une cause
  classique de port down ; le dire dans `docs/05` R5.
- **Q-b — Duplex différent à vitesse égale : rien.** Sonde P4 (`half` ↔ `full`, 10 000 des deux côtés) ⇒ aucun
  contrôle, aucun code au catalogue. C'est le défaut L1 le plus classique après le câblage. Recommandation : un code
  `link_duplex_mismatch` (warning, R5, additif) si le duplex remonte de façon fiable (Cisco oui ; FortiOS : `get system
  interface physical` le donne, guide 2026-09-24) ; sinon parquer explicitement.
- **Q-c — Statuts des tasks : quel champ fait foi ?** (M2, P8a, P8d) `success` avec un sujet `failed`, `partial` sans
  sujet `failed`, `unreachable` avec sujets. Recommandation : refus ou constat dans le **contrat d'entrée**
  (`task_status_inconsistent`), B1 continuant à lire `status` ; à décider avec les valeurs réelles de `status` du
  collecteur (question ouverte du 2026-09-10).
- **Q-d — `dormant` et `testing` comptés « down ».** Annoncé et testé ; RFC 2863 : `dormant` = attend un événement
  externe (interface à la demande), `testing` = en test, aucun trafic. Pour un diagramme L1, « pas up » est le bon
  résumé. Recommandation : garder ; le mot « down » des `details.states` reste l'état brut, donc rien n'est perdu.
- **Q-e — Port `not_present` avec description et LLDP réciproque.** Sonde P2 ⇒ `documented_port_without_transceiver`
  **et** `link_oper_mismatch` (témoin le port `not_present`) sur le même port. La donnée se contredit (un voisin LLDP
  sur un port sans SFP). Recommandation : garder les deux, ils disent deux choses ; c'est l'onglet Qualité des données
  qui doit le faire voir.
- **Q-f — Alias en échec à côté du canonique en succès** (M1, sonde Q5 : `cdp: success` et `cdp_neighbors: failed`
  dans la même task) : le canonique gagne partout (couverture, R5), l'échec disparaît. Deux clés pour le même topic
  dans une task est un défaut du producteur : refus d'entrée (`subject_alias_conflict`) ou constat ? Recommandation :
  refus, même famille que `member_in_several_aggregates` (une chose, une clé).

## Classement

**Défauts purs (à corriger sans discussion)** : H1 (R5 ne juge que des câbles entre ports `physical` / `management`),
M1 (topics inconnus en échec listés sous leur nom brut), M3 (`--out` = entrée refusé, `correlate` et `render`), B1
(options mélangées refusées), B2 (ligne de sortie), B3 (`task.error` sur `partial`), B4 (`.gitattributes`), B6, B7.

**Règles douteuses (comportement prudent et visible, à soumettre à Orhan)** : M2 / Q-c (statuts des tasks), Q-a
(vitesse d'un port down), Q-b (duplex), Q-d (`dormant` / `testing`), Q-e (double contrôle sur `not_present` observé),
Q-f (alias en conflit), B5 (ordre des faits : à trancher sur capture).

---

## Suivi

**Traitement le jour même (2026-09-26), lot 1 : tous les défauts purs corrigés.** Backend 315 tests (`correlate/` 174,
à 100 %), contracts 400, ruff propre, golden régénéré (B3 ajoute `details.error`).

- **H1 — corrigé.** `state.py` `_ends` ne conclut que si les deux bouts sont des ports `physical` / `management`
  (`CABLE_PORTS`) : un câble arrêté à un agrégat n'a aucun contrôle R5, `remote_port_is_aggregate` reste seul. Test
  `test_a_cable_stopped_at_an_aggregate_has_no_state_check` (la sonde P1 avec l'agrégat down, trunk natif 99). Règle
  ajoutée à `docs/05` §6 et `backend/README.md` § R5.
- **M1 — corrigé.** `_failed_topics` liste aussi, sous leur nom brut, les sujets de la task hors de tout alias de B1
  (`KNOWN_SUBJECTS`) ; l'ensemble est trié par `topic`. Test `test_partial_collection_lists_topics_b1_does_not_consume…`
  (`bgp` en échec, `arp` en succès). Le cas voisin Q5 (alias en échec à côté du canonique en succès) reste figé tel quel
  par `test_alias_failed_beside_its_canonical_name_in_success_is_lost`, parqué (Q-f).
- **M2 — parqué**, comportement inchangé (silence), à soumettre à Orhan avec Q-c : proposition d'un constat du contrat
  d'entrée `task_status_inconsistent` (`success` avec un sujet `failed`, `partial` sans sujet `failed`, `unreachable`
  avec sujets), recopié dans le snapshot avec `origin = bundle`.
- **M3 — corrigé**, pour `ld correlate` et `ld render` : `_file_mode_problem` refuse (`EXIT_USAGE`, rien d'écrit) un
  `--out` qui résout sur le fichier d'entrée. Test `test_correlate_and_render_refuse_to_overwrite_their_input`
  (chemin avec `/./` pour vérifier la résolution).
- **B1 — corrigé.** Un fichier avec `--infrastructure` / `--run-id` est refusé (`correlate` et `render`) ; `--out` sans
  fichier est refusé (`correlate`). Test `test_file_mode_refuses_archive_options_and_vice_versa`.
- **B2 — corrigé.** « snapshot écrit : <chemin> (6 nœuds, 6 câbles, error=2 warning=3 info=6, 40 Ko) », même forme
  que `ld render` ; test adapté (`created` absent).
- **B3 — corrigé.** `device_partial_collection` porte `details.error` (erreur globale de la task) ; golden régénéré
  (`"error": null` sur `sw-core-02`).
- **B4 — corrigé.** `.gitattributes` à la racine (`*.json`, `*.md`, `*.py`, `*.js`, `*.html` en `text eol=lf`) ; message
  `REGENERATE` complété (LF attendue ; le golden fige fixture ⊕ contrat d'entrée ⊕ B1) ; `contracts/README.md` le dit.
- **B5 — corrigé** (choix fait sans capture, cosmétique) : `endWithFacts` ordonne `oper_status`, `oper_reason`,
  `speed_mbps`, `switchport_mode`, `vlan`, puis le reste trié ; l'assertion du test Node fige cet ordre choisi.
- **B6 — corrigé** : (a) `assert source.ok` avant de lire le bundle dans le test contracts ; (b) `docs/05` cite
  `GET /api/snapshot?infrastructure=&run_id=` ; (c) `_untagged_vlan` privé (à exposer avec la vue L2, le jour venu).
- **B7 — corrigé** : tests ajoutés pour H1, M1, M3, B1, B3, le hub sur un port down (deux `link_oper_mismatch`, câbles
  distincts), les deux bouts `not_present` d'un câble documenté (`link_down` + deux transceivers), un port `management`
  `not_present` ; variante `_r5_state` (les sept codes, trois alias en échec, un topic hors B1) dans le test de
  déterminisme sous plusieurs `PYTHONHASHSEED` (`test_review2.py`).

**Lot 2, questions à soumettre à Orhan** (comportement prudent et visible en attendant) : Q-a vitesse lue sur un port
down comparée (recommandation : garder) ; Q-b duplex sans code (`link_duplex_mismatch` proposé si le duplex remonte de
façon fiable) ; Q-c / M2 statuts des tasks (constat d'entrée `task_status_inconsistent`) ; Q-d `dormant` / `testing`
comptés « pas up » (garder) ; Q-e port `not_present` observé par LLDP : deux contrôles (garder) ; Q-f alias en conflit
dans une task (refus d'entrée `subject_alias_conflict` proposé).
