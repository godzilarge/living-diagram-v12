# Revue indépendante — Générateur de topologies synthétiques, `ld-contracts generate` (2026-10-03)

Rapport rendu tel quel ; le suivi des corrections est tenu à la fin du fichier.

---

**Périmètre.** `contracts/src/ld_contracts/synth/` (`spec.py`, `catalogue.py`, `world.py`, `naming.py`, `build.py`,
`emit.py`, `mutations.py`, `series.py`, `__init__.py`), la sous-commande `generate` de `contracts/src/ld_contracts/cli.py`
(`_parse_start`, `_cmd_generate`, `build_parser`), les tests `contracts/tests/synth/*.py` et les quatre `test_generate_*`
de `contracts/tests/test_cli.py`. Lu en contexte, non modifié : `CLAUDE.md`, `contracts/CONTRAT.md` (partie A, règles
transverses, `null` et valeurs réservées), `docs/05` (R0 à R6, §2.1 à 2.3), `docs/guides-collecte/fortios-interfaces.md`,
`backend/tests/correlate/test_synth.py` (non tracé, il lit les séries dans B1), les ajouts de `contracts/README.md`.

**État constaté.** `tests/synth` + `test_cli.py` : **85 tests verts**, `ruff check src tests` propre, couverture de
`ld_contracts.synth` 98 % (`series.py` 86 % : les branches d'échec de `_pick_applicable` et de `check_series` ne sont
jamais exécutées ; `build.py` 99 % : boucle de `distribute_access` et branche « aucun port libre » de `add_stub` mortes).
Test le plus long : `test_scale_target_is_reached`, 3,2 s.

**Sondes exécutées** depuis `contracts/` avec `uv run python`, scripts dans le scratchpad de session (`probe_synth.py`
P1–P6, `probe_interactions.py` I1–I6, `probe_scale.py`, `probe_hashseed.sh`), jamais dans le dépôt ; les extraits utiles
sont recopiés ci-dessous pour être rejouables. Série de référence : `generate --seed x --devices 24 --runs 3`, chaque run
passée dans B1 par `cd backend && uv run ld correlate run-NN.json --out snap-NN.json`, codes comptés sur `snapshot.checks`.

## Lecture de la série de référence par B1 (avant les défauts)

Run de base (24 devices, 48 câbles, 35 stubs dont 12 téléphones) : 60 nœuds (24 `device`, 1 `external`, 35 `stub`),
95 liens (66 `confirmed`, 24 `observed_only`, 5 `documented_only`), 21 domaines MLAG, 1 cluster HA, 65 agrégats ;
contrôles : `neighbor_unknown` × 35 (info), `remote_port_is_mac` × 24 (info : 12 serveurs + 12 téléphones),
`documented_not_observed` × 5 (info : quatre uplinks firewall + heartbeat), **`multiple_observed_neighbors` × 24
(warning : deux par téléphone)**. Aucun `one_way_observation`, `description_unparseable`, `description_ha_unresolved`,
`heartbeat_link_not_observed`, `remote_port_is_aggregate`. `ifname_short_to_long = 40` = les formes courtes LLDP d'IOS-XE
(19 accès × 2 uplinks + 2 ports du routeur). Tout se recompte à partir du monde : 95 = 48 câbles + 35 stubs + 12 doublons
de téléphones ; 66 = 43 câbles observés + 12 serveurs (port en MAC, accord jugé sur le device) + 11 bornes.
**Les 24 seuls warnings de la run de base sont le bruit des téléphones** (voir « Point de design »).

Run 2 (`device_unreachable`, `topic_failed system`, `cable_down` sur un uplink) : `device_unreachable` (error),
`device_partial_collection` (info), `link_down` (info), `documented_not_observed` en **warning** sur le câble tombé (les
deux bouts Cisco avec LLDP en succès), `aggregate_below_min_links` (error : la patte vPC à membre unique du cœur) et
`aggregate_member_not_bundled` × 2. Run 3 (`description_changed`, `stub_added`, `cable_moved`) :
`description_disagrees_with_observed` × 3 = la description réécrite + les deux descriptions périmées que `cable_moved`
laisse (côté accès et ancien port du cœur). Chaque mutation se lit, et rien d'autre ne sort.

## Critique

Aucun. Les deux garanties annoncées tiennent : **mêmes octets** (quatre `PYTHONHASHSEED` — 0, 1, 999, random — sur un
scénario qui passe par les 14 mutations, trois runs, 30 devices : quatre fois les mêmes empreintes SHA-256 des quatre
fichiers), **zéro constat** sur 125, 250, 500 et 1 000 devices et après chaque mutation. Aucune horloge, aucun chemin,
aucune variable d'environnement dans `synth/` (`grep now(|time()|getcwd|os.environ` : rien).

## Haut

**H1 — Un stub retiré rend son numéro, donc son nom et sa MAC, à un stub encore présent : deux stubs homonymes sur deux
ports.** `build.py:394-395` (`_next_stub_number`) compte les stubs **présents** de la sorte sur le site et ajoute 1 ;
`build.py:348-350` (`make_stub`) dérive le nom (`srv-dc01-NN`) et la MAC de ce numéro. Après `stub_removed` (ou
`device_removed`, qui emporte les stubs du switch), le compte baisse d'une unité alors que le dernier numéro est toujours
pris. Sonde P1 (`seed="p1"`, 10 devices : serveurs `srv-dc01-01..03`) :
```python
w2 = with_stubs(w, remove=["srv-dc01-01"]) ; w2 = with_ports(w2, {victim.attached: replace(..., state="down")})
w3, rec = apply_mutation("stub_added", w2, random.Random("z"), 1, spec)
# rec.subject = 'srv-dc01-03' ; Counter(names) → {'srv-dc01-03': 2} ; même MAC 94:c1:a3:98:99:77 sur
# dc01-acc-01/Gi1/0/11 et dc01-acc-05/Gi1/0/10 ; validate_dict : ok, zéro constat
```
Sonde P1b (scénario `device_removed, stub_added × 3`, 12 devices) : doublons pour les quatre graines essayées (`a`, `b`,
`c`, `d`). Sonde I3 (série aléatoire, 16 devices, 12 runs × 4 mutations) : `srv-dc01-05` en double dès la run 9,
`srv-dc01-06` à la run 10. **Pourquoi c'est un défaut** : le bundle passe le contrat (un stub n'est pas un device, rien
ne vérifie son unicité), mais le monde ment : deux équipements physiques différents portent le même nom et la même MAC.
B1 en fait **un** stub à deux câbles, donc un `multiple_observed_neighbors` sur le port vu — une anomalie fabriquée par le
générateur, pas par la topologie ; le manifeste donne un `subject` (`srv-dc01-03`) qui désigne déjà un autre stub ; et
pour B3, « stub ajouté » devient « stub déplacé + dédoublé ». Le projet a déjà tranché le principe pour les devices
(`Device.index`, « jamais réutilisé », `world.py:37` ; `_free_access_numbers` exclut un port à description périmée).
**Correction** : un compteur par `(site, sorte)` porté par le monde et jamais décrémenté (comme `next_index`), ou plus
simplement numéroter les stubs sur `next_index` du monde (un rang global, comme les devices) ; ajouter l'unicité des noms
et des MAC de stubs à un contrôle d'invariants du monde (M3) et un test « retrait puis ajout ⇒ noms tous distincts ».

**H2 — `reboot` est transitoire au sens du drapeau, mais le fait ne l'est pas : à la run suivante l'uptime repart à
plusieurs centaines de jours.** `mutations.py:286-289` pose `rebooted`, `world.py:212-215` (`clear_transients`) l'efface,
et `emit.py:65-68` (`Emission.uptime`) recalcule `(uptime_days + 7 × run) × 86400` dès que le drapeau est parti. Sonde P2
(scénario `reboot`, 4 runs, uptimes en jours) :
```
run 1 : dc01-core-02 384.0   run 2 : rebooted=dc01-core-02 → 0.08   run 3 : dc01-core-02 398.0   run 4 : 405.0
```
Un uptime qui passe de 0,08 à 398 jours en sept jours est impossible. **Pourquoi c'est un défaut** : le générateur est
« la condition de B3 » (CLAUDE.md), et le contrat dit de `uptime_seconds` « un reboot entre deux runs est un événement » :
B3 détectera un reboot par la régression de l'uptime, puis trouvera à la run suivante une **progression** de 398 jours,
c'est-à-dire une donnée qu'aucun équipement ne produit. Le drapeau peut rester transitoire (c'est l'événement), l'état
qu'il crée doit persister dans `Device`. Même effet sur `last_change_age_seconds` (`emit.py:70-76`, plafonné par l'uptime
de la run, donc cohérent dans la run et incohérent entre runs). **Correction** : `reboot` remplace le device par une
copie dont le démarrage est daté (par exemple `boot_run: int | None` sur `Device`, ou `uptime_days` recalculé pour que
l'uptime à cette run vaille `REBOOT_UPTIME`) ; `Emission.uptime` lit `(run_index − boot_run) × 7 jours + reste` ;
`rebooted` ne sert plus qu'au manifeste. Test : uptime strictement croissant de 7 jours entre deux runs sans reboot,
régression à la run du reboot, reprise depuis le reboot ensuite.

## Moyen

**M1 — `description_changed` promet « un désaccord avec l'observé » mais tire aussi parmi des ports que personne
n'observe.** `mutations.py:201-208` : les candidats sont tous les ports physiques Cisco décrits et câblés, sans exiger
qu'un bout soit observé. Sonde P3 (8 devices) : 25 candidats dont les **quatre ports cœur face aux firewalls**
(`core-01/Ethernet1/41 → fw-01/x1`…) ; graine 6 ⇒ `C1|dc01-fw-02|x2|` devient `C1|dc01-fw-02|ha1|`. Un câble que
`cable_down` vient de tomber reste candidat aussi (sonde P3, dernier point). Dans ces deux cas rien n'est observé à aucun
bout : B1 dessine **deux câbles `documented_only` contradictoires** (docs/05 R3, « descriptions contradictoires entre
elles ») et n'émet **aucun** `description_disagrees_with_observed`. Le manifeste ne ment pas (`before` / `after` sont
justes) mais le catalogue (`catalogue.py:13`) et le README si. **Correction** : restreindre les candidats aux câbles
observés (deux bouts Cisco en périmètre, tous deux `up`, comme `aggregate_member_suspended` le fait déjà), ou documenter
deux effets et porter dans `details` lequel se produit (`observed: true | false`). La première option est la plus simple
et garde une sorte = un effet.

**M2 — `"never"` n'est jamais émis : 206 interfaces sur 272 sont down depuis le démarrage et portent un âge chiffré.**
`emit.py:70-76` (`age`) renvoie `uptime − 300` pour tout port sans `changed_run`, état `up` ou `down` confondus
(sonde P4 : types d'âge `{int: 272}`, 206 ports down sans description). Le contrat (`last_change_age_seconds`) et la
décision du 2026-09-16 font de `"never"` le fait « aucun changement depuis le dernier démarrage » (RFC 2863, `ifLastChange
= 0` ; NX-OS « Last link flapped: never ») : un port jamais monté depuis le boot l'écrit, un port monté cinq minutes après
le boot écrit `uptime − 300`. Le générateur écrit la seconde valeur pour les deux. **Pourquoi c'est un défaut** : la
troisième valeur du contrat, celle que B1 lit « comme un âge ≥ uptime », n'est exercée par aucune donnée synthétique ; les
tests de B3 sur le flap ne verront jamais le cas. **Correction** : `"never"` quand `changed_run is None` et
`port.state == "down"` (et pour tout port down d'un device redémarré) ; le type de retour devient `int | str` ; test sur un
port d'accès libre.

**M3 — Les mutations ne sont vérifiées que par le validateur du bundle, qui ne connaît pas les invariants du monde.**
`tests/synth/conftest.py:13` (`assert_strictly_valid`) est le seul oracle de `test_every_kind_keeps_the_bundle_strictly_valid`
(`test_mutations.py:34`) ; H1 passe au travers, par construction. Le monde a des invariants que le contrat ne peut pas
voir : câble → deux ports existants (hors externe), `Port.aggregate` ⇔ `Aggregate.members` dans les deux sens (deux
sources de vérité, `world.py:53` et `:79`, tenues à la main par `cable_moved` et `device_removed`), aucun agrégat sans
membre, stub sur un port `access` et `up`, noms et MAC de stubs uniques, MAC de ports uniques, membres de cluster présents.
Sonde I2 / I3 : un `check_world` de 25 lignes écrit pour la revue tient sur `cable_moved` deux fois et sur 12 runs × 4
mutations, sauf les stubs (H1). **Correction** : `world.check_world(world) -> list[str]` (ou lever), appelé dans les tests
après chaque mutation et sur une longue série aléatoire ; en option dans `generate_series` derrière un paramètre (coût
linéaire, négligeable).

**M4 — La construction est quadratique : `_replace_ports`, `free_access_port` et `_next_stub_number` rebalayent tout le
monde à chaque switch et à chaque stub.** `build.py:328-330` (`kept = [p for p in draft.ports …]` à chaque appel),
`:333-345` (tri de tous les ports du brouillon pour trouver un port libre), `:394-395`, `:602` (`base` reconstruit à
chaque itération de `chain_sites`), appelés depuis `:318`, `:320`, `:376`. Mesure (`probe_scale.py`, un seul run) :
```
devices  125 : build 0.15 s   250 : 0.49 s   500 : 1.72 s   1000 : 7.36 s      (× 4,3 par doublement)
             emit 0.03 / 0.09 / 0.17 / 0.34 s   validate 0.15 / 0.28 / 0.65 / 1.38 s   (linéaires)
```
500 × 3 runs : `generate_series` 3,0 s, `check_series` 1,9 s, `write_series` 0,5 s, 304 Mo résidents — conforme à
l'annonce, et acceptable pour la jauge. Mais la jauge est un plancher (des séries longues pour B3, 1 000 devices pour
un test de charge du moteur), et le coût caché est dans la seule brique qui ne devrait rien coûter. **Correction** :
construire les ports de chaque device dans une liste locale et les ajouter d'un coup, et ne remplacer que les ports du
cœur (quatre par accès) via un `dict[PortRef, Port]` porté par `Draft` au lieu d'un tuple ; `free_access_port` sur les
ports du device seulement ; `base` hors de la boucle de `chain_sites`. Le test d'échelle peut alors compter plutôt que
chronométrer, comme le projet l'a fait pour B1.

**M5 — `ha_member_down` (« un membre HA mort ») laisse ses câbles up chez tout le monde.** `mutations.py:228-232` pose
`unreachable` et `cluster.down`, rien d'autre. Sonde P5 : `dc01-fw-02` mort, `dc01-core-01/Ethernet1/42`,
`dc01-core-02/Ethernet1/42` et leurs `port-channel21` restent `up` ; le `ha1` du survivant aussi. Un châssis mort a ses
liens tombés : les cœurs voient `Link not connected`, leur vPC 21 `No operational members`, le survivant son `ha1` down.
B1 dessine aujourd'hui des câbles `documented_only` **up côté cœur** vers un nœud `unreachable` — le scénario de la question
5 de `docs/05` §8 (« device injoignable ⇒ câbles `documented_only` depuis l'autre bout ») est celui d'un device
**injoignable**, pas mort, et c'est déjà `device_unreachable`. La mutation ne fait donc rien que `device_unreachable` ne
fasse, sinon l'état `down` dans le document `ha` du survivant. Au passage, `:230` tue toujours le `secondary` : la mort du
primaire après une bascule est inatteignable. **Correction** : soit renommer et documenter « membre injoignable, vu `down`
par le survivant » (comportement actuel, honnête), soit faire mourir le membre à l'émission : `Emission` considère down
tout port dont le câble mène à un membre listé dans `cluster.down` (côté cœur et côté heartbeat), ce qui reste transitoire
sans toucher aux ports du monde ; tirer le membre au hasard. La seconde option donne le scénario que les pages de
démonstration attendent (rôle rouge, câbles tombés).

**M6 — `build.py` dépasse la limite et quatre fonctions font 66 à 107 lignes.** 655 lignes (règle : ~400, jusqu'à ~600
« si la cohésion le justifie ») ; `add_cores` 66 (`:117-182`), `add_access_switch` 78 (`:244-321`), `add_firewalls` 107
(`:398-504`), `add_router` 83 (`:507-589`) pour une règle à 50. Le gros de chaque fonction est une liste littérale de
`Port(...)` à neuf arguments positionnels. **Correction, sur une vraie couture** : `build_site.py` (cœurs, firewalls,
routeur, chaînage) et `build_access.py` (accès + stubs), `build.py` gardant `distribute_access`, `build_world`, `Draft`,
`draft_of` / `world_of` ; dans chaque constructeur, extraire la fabrique des ports (`_core_ports(device, other)`,
`_firewall_ports(device, rank, ha_form)`) et passer les arguments de `Port` par nom (les `Port(host, "x1", "physical",
"fw_uplink", 10000, "10Gbase-SR", mac, desc, "agg-core")` se lisent mal).

## Bas

**B1 — `--out` sur un fichier existant : trace Python.** `cli.py:141` (`any(out.iterdir())`) lève `NotADirectoryError`,
non rattrapé. Sonde : `generate --seed c --devices 6 --out afile.json` ⇒ traceback. Ajouter `not out.is_dir()` au refus
d'usage (« output path is not a directory »).

**B2 — `apply_mutation` sans `spec` invente une graine `"-"` : même nom, autre identité.** `mutations.py:318`. Sonde I4 :
`stub_added` avec et sans `spec` sur le même monde ⇒ même nom `srv-dc01-04`, MAC `21:38:6c:…` contre `ed:56:85:…`. Les
tests de `test_mutations.py` passent tous par ce chemin : ce qu'ils vérifient n'est pas tout à fait ce que la série
produit, et un test B3 qui comparerait un monde muté « à la main » à la série verrait un stub changer de MAC. Rendre
`spec` obligatoire, ou porter `seed` dans `World` (il y est déjà implicitement par les serials) et retirer le paramètre.

**B3 — Serials de membres de stack : trois lettres tirées d'un condensé hexadécimal, donc dans `A-F`, 216 combinaisons,
mêmes chiffres que le châssis.** `naming.py:47` (`isalpha()` sur un hex), `emit.py:351`. Sonde I6 (500 devices, 150
stacks) : `dc11-acc-16` membres `FOC0277DFB, FOC0277DFB, FOC0277CAE` ; deux stacks sur 150 ont deux membres au même
serial. Deux châssis au même serial sont une donnée fausse qu'un diff ou un inventaire relèvera. Tirer les lettres par
`digest_bytes[i] % 26`, ou inclure le `slot` dans la partie chiffrée.

**B4 — Code mort et branches jamais exécutées.** `build.py:55-57` : la boucle `while access_total < sites` est
inatteignable pour `devices ≥ 6` (sonde I5 : totaux exacts de 6 à 3 000, au plus 20 accès par site) ; `build.py:377-378`
(`add_stub` sans port libre) jamais atteint ; `series.py:45-47` (`_pick_applicable` qui saute une sorte inapplicable, puis
« aucune mutation applicable ») et `series.py:112-118` (`check_series` qui refuse un bundle) jamais testés : la garantie
« zéro constat » n'est prouvée que par l'absence de constat, pas par un cas où `check_series` attrape quelque chose.
Retirer la boucle (ou la remplacer par une assertion), tester `check_series` avec une `Series` dont un bundle est altéré
(une clé nullable retirée, un membre d'agrégat renommé) et `_pick_applicable` sur un monde où une sorte est inapplicable
(six devices sans stub : `stub_removed` doit être sautée, la série continuer).

**B5 — Tests plus faibles que leur nom.** `test_mutations.py:152` (`test_stub_added_then_removed`) retire un stub tiré
avec la graine `"x"`, pas celui qui vient d'être ajouté : le nom promet « ajouté puis retiré », le test vérifie « un stub
retiré n'est plus vu » et laisse passer H1 ; `:92` (`test_cable_down_…`) tolère un bout absent de `interfaces[]`
(`if port in docs`) alors que les deux bouts d'un câble candidat sont toujours en périmètre ; `:103` ne regarde que le
monde, pas ce que le bundle dit ; `:34` (`test_every_kind_…`) fixe la graine `"m"` par sorte, donc **un** sujet par sorte,
sans le dire. Manquent : une série où un retrait précède un ajout (H1), l'uptime entre runs (H2), `"never"` (M2),
`description_changed` sur un port face à un firewall (M1), la forme HA relue sur les deux membres **après**
`ha_failover` (le test de `test_series.py:42` ne regarde que les rôles), le chemin `--start` de la CLI (`_parse_start`,
`cli.py:131`, et sa branche `ValueError`). `test_series.py:111` (3,2 s, 500 devices) est le test le plus long de
`contracts` : à marquer ou à garder sciemment (il est la jauge).

**B6 — Réalisme de la projection, petites choses.** (a) `emit.py:232` : un port SFP vide (`Link not connected`) porte
`media: 10Gbase-SR` ou `100Gbase-SR4` (`Ethernet1/44`, `1/51`, `1/53`) : sans optique, NX-OS n'affiche rien, `null` serait
vrai ; (b) `GigabitEthernet0/0` des accès : `up`, `Mgmt-vrf`, **sans adresse** (`build.py:231-240`), alors que cœurs,
firewalls et routeur ont une IP de management : par où le collecteur joint-il l'accès ? ; (c) `allowed_vlans` identiques
(10-20, 100, 200-210) sur le peer-link (qui porte tout en réalité), les uplinks et les trunks vers les firewalls, dont la
sous-interface `agg-core.400` utilise un VLAN que son trunk n'autorise pas (`emit.py:245`, `build.py:28`) : sans effet en
L1, faux pour la vue L2 à venir ; (d) `run.status` toujours `completed` (`emit.py:95`) même avec un device injoignable : à
aligner le jour où les statuts de `collector_runs` sont tranchés (question ouverte du 2026-09-10) ; (e) un membre
`suspended by LACP` écrit `speed_mbps: null` (`emit.py:180-181`) alors qu'il est physiquement up et que la fixture garde
10 000 (revue R5, Q-a) ; (f) `speed_degraded` date le changement côté accès seulement (`mutations.py:264`) : un bout a
flappé, l'autre non.

**B7 — Organisation du code.** `mutations.py:122` importe `TOPICS` dans le corps de la fonction par crainte d'un cycle qui
n'existe pas (`emit` n'importe pas `mutations`) : `TOPICS` et `TRUNK_VLANS` sont des faits de plateforme, leur place est
`naming.py` (« ce que chaque constructeur écrit »), ce qui dénoue aussi `emit → build`. `cli.py:131` : `_parse_start` sans
annotation de retour, import dans la fonction. `Mutation.details: dict` : champ mutable dans un dataclass gelé (égalité
ok, hachage impossible ; un `Mapping` ou un tuple de paires). Valeurs sans nom : `range(1, 55)`, `n > 48`, `range(1, 5)`
(`build.py:128-130`, `:214`), `400` et `29` (`:446-453`), `20 + rank`, `30` ; `9216` / `1500`, priorités `15` / `14` / `1`,
facteur `4` d'un sujet en échec, `"Port 1"` (`emit.py:230`, `:355`, `:142`, `:336`).

**B8 — Le manifeste ne dit pas combien de téléphones il y a.** `series.py:66-77` (`_counts`) compte les stubs en bloc.
Pour servir d'oracle à B3 et aux comptes de contrôles, il faut au moins `stubs_by_kind` (et `sites`) : c'est ce qui permet
d'écrire « attendu : `multiple_observed_neighbors` = 2 × téléphones » tant que H2 n'est pas résolue (voir ci-dessous), et
« liens = câbles + stubs + téléphones ».

## Point de design : les téléphones IP et la question H2

Les faits. Un téléphone Cisco annonce en LLDP-MED sa MAC comme port-id et en CDP « Port 1 » : `emit.py:333-337` est
fidèle. B1 (R1 : une MAC de port distant reste le nom du port si le voisin n'est pas collecté) en fait deux endpoints
différents, `(SEP…, aa:bb:…)` et `(SEP…, Port 1)`, donc deux câbles `observed_only` depuis le même port d'accès et deux
`multiple_observed_neighbors` (un par câble, même port témoin). Sur la série de référence ce sont **100 % des warnings
de la run de base** (24 sur 24) et 12 liens sur 95 ; à 500 devices, 252 téléphones, donc ~504 warnings et 252 faux câbles
par run (`probe_scale`, `lldp` 2 637 documents dont 252 `SEP*`). `backend/tests/correlate/test_synth.py:16` a déjà rangé
`multiple_observed_neighbors` dans `BASELINE_CODES`.

Les trois options. **Garder tel quel** : le générateur dit vrai, et H2 cesse d'être abstraite — c'est l'esprit de « voir
avant de trancher », et le README le revendique. Coût : chaque série porte un bruit stable qui n'est pas un événement
(B3 ne le verra pas en diff, les téléphones ne bougent pas), mais qui fausse les comptes de contrôles et les goldens que
B3 figera, et qui restera dans la jauge de performance (un quart de liens en trop). **Le rendre optionnel** : un drapeau
dans la spécification (`phones_announce_cdp`) crée deux vérités, et les fixtures finiront par prendre la silencieuse :
c'est exactement le « désaccord résolu en silence » que le projet refuse. À écarter. **Faire bouger B1** : R3 contient
déjà la règle qu'il faut, pour une description : « port distant observé resté en MAC : l'accord se juge sur le device
seul ». Deux claims **observés** depuis le **même port témoin** vers le **même device résolu**, dont l'un a un port en forme
de MAC et l'autre un nom, désignent le même câble — une MAC ne nomme pas un port, elle ne peut pas en contredire un.
Résultat : un câble `(acc/Gi, SEP…/Port 1)`, `observed_only`, deux évidences (`lldp` avec `remote_raw.port` = la MAC, `cdp`),
plus de `remote_port_is_mac` sur ce port (le port est nommé par l'autre source), aucun `multiple_observed_neighbors`.
La règle est bornée au port témoin : elle ne touche pas le cas FortiGate de H2 (des membres qui annoncent la MAC de
l'agrégat depuis des ports **différents**), ni un vrai hub (deux devices résolus différents).

Recommandation : **le générateur ne bouge pas, pas de drapeau ; B1 prend la règle bornée ci-dessus avant la conception de
B3**, puisque le générateur en sera la fixture et que des goldens de diff figés avec deux câbles par téléphone graveraient
l'artefact. En attendant, B8 (compte des téléphones dans le manifeste) rend le bruit prévisible, et `test_synth.py` doit
affirmer le compte exact (`= 2 × téléphones`) plutôt que de tolérer le code. C'est une décision d'Orhan : la capture est
disponible (`ld render run-01.json`), stubs affichés.

## Vérifié et trouvé correct

- **Déterminisme, par lecture.** Tout tirage se fait dans des listes construites depuis des tuples triés
  (`world.devices`, `.ports`, `.cables`, `.aggregates`, `.clusters`, `.stubs`, `MUTATION_KINDS`) ; les ensembles ne
  servent qu'à l'appartenance (`own`, `gone`, `taken`) et tout `with_*` retrie ; `dict.fromkeys(own)` de
  `device_removed` passe par `_sorted_ports`. `random.Random(str)` est seedé par SHA-512 (version 2), indépendant de
  `PYTHONHASHSEED`. Le nombre d'appels au générateur ne dépend que de l'état du monde : `_pick` lève avant tout tirage,
  `rng.shuffle` précède les essais. `cached_property` sur `World` (`world.py:106`, gelé **sans** `slots`) est valide :
  `__dict__` existe, l'égalité ne compare que les champs, et chaque `replace` repart d'un cache vide (jamais périmé).
  `Cable.__post_init__` trie ses bouts sous `slots=True` par `object.__setattr__`, correct. Entre processus : voir
  « Critique ».
- **Fidélité au contrat et à B1.** Formes LLDP / CDP : IOS-XE `Te1/1/1` / `Gi0/0/0` en LLDP, `TenGigabitEthernet1/1/1`
  en CDP ; NX-OS et IOS-XR longues partout ; capacités `bridge, router` / `switch, igmp` / `router` ; téléphone `host,
  phone`, borne `trans_bridge`, serveur `station` sans CDP. Rien d'observé vers un firewall, dans les deux sens. Forme HA :
  ordre des priorités (fw-01 à 200 prend la première paire), texte identique sur les deux membres, `ha1` croisé, relue par
  B1 sans `description_ha_unresolved` ; `ha_failover` ne touche pas les priorités. vPC : peer-link `port-channel10` sans
  `mlag_id`, une patte par accès (`mlag_id` 100+n) et par firewall (20, 21), 21 domaines trouvés. FortiOS :
  `switchport_mode` et VLAN `null`, `vrf` `"default"` sur les interfaces à IP seulement, `virtual_context: root`,
  `members` sur `agg-core` : conforme au guide du 2026-09-24. Cisco : `mgmt0` en `management`, `GigabitEthernet0/0`
  en `Mgmt-vrf`, loopback `none` + `default`, NX-OS `mtu 9216`, `access_vlan 1` sur les ports `notconnect` (le contrat le
  demande), `oper_reason` par constructeur, `suspended by LACP` / `No operational members`. Toutes les clés nullables
  écrites ; `interfaces[].members` écrit aussi quand `aggregates` est en succès (le contrat dit « liste vide sinon », B1
  ne le lit qu'en repli : sans effet, à harmoniser un jour dans le texte du contrat plutôt qu'ici).
- **Mutations et interactions.** `device_removed` puis `device_added` sur le même site ne réutilise pas le numéro (sonde
  I1 : `acc-02` retiré, `acc-06` ajouté, la description périmée exclut 2) ; `cable_moved` deux fois sur le même accès est
  cohérent (I2 : `Ethernet1/2` périmé décrit, `1/44` libéré sans description, `1/45` seul membre de `port-channel102`) ;
  `aggregate ⇔ port` tient sur 12 runs × 4 mutations (I3) ; `stub_removed` laisse le port en `access` down décrit, jamais
  réutilisé ; les transitoires s'effacent et se recombinent sans conflit (`ha_member_down` + `device_unreachable` : union) ;
  les candidats évitent peer-link et intersite pour `cable_down`, les membres déjà suspendus, les câbles déjà tombés, le
  câble WAN dont le bout externe n'a pas de port. `aggregate_member_suspended` reste observé en LLDP (port physiquement
  up), le vPC à membre unique passe down.
- **Immutabilité.** Aucune mutation d'entrée : `replace` partout, dictionnaires locaux seulement (`ports` dans
  `add_access_switch`), `_pick` copie la liste, `Draft` et `World` gelés, `Series` gelée.
- **CLI.** Répertoire non vide refusé (exit 2), spécification fausse (exit 2, message qui nomme le champ), `--start` naïf
  ou illisible refusé explicitement, `--scenario "reboot, ha_failover"` refusé en nommant `' ha_failover'` (pas de
  strip silencieux : bien), `--mutations-per-run 0` produit des runs identiques (utile pour B3 : diff vide).
- **Documentation.** Docstrings de modules qui disent le pourquoi (`world.py` : « l'ordre du monde est l'ordre du bundle »,
  `emit.py` : « aucune horloge, aucun tirage »), README exact sur les mesures (5,7 s, 20 Mo), catalogue et `MUTATORS`
  verrouillés un pour un par assertion.

## Synthèse

| Sévérité | Nombre | Points |
|---|---|---|
| Critique | 0 | — |
| Haut | 2 | H1 numéros de stubs réutilisés (nom + MAC en double) ; H2 uptime qui repart après `reboot` |
| Moyen | 6 | M1 `description_changed` sans observé ; M2 `"never"` jamais émis ; M3 pas d'invariants du monde ; M4 construction quadratique ; M5 `ha_member_down` laisse les câbles up ; M6 `build.py` 655 lignes, quatre fonctions > 50 |
| Bas | 8 | B1 `--out` fichier ; B2 graine `"-"` ; B3 serials de membres ; B4 code mort / branches non testées ; B5 tests faibles ; B6 réalisme ; B7 organisation ; B8 manifeste sans compte par sorte |

**Défauts purs (à corriger sans discussion)** : H1, H2, M1, M2, M3, M4, M6, B1, B2, B3, B4, B5, B7, B8.
**À annoncer avant de corriger** : M5 (deux lectures possibles de « mort »), B6-d (statuts de run, question ouverte),
le point de design H2 (décision d'Orhan).

## Ce qui est bien et à garder

- La séparation monde / projection : le bundle est une **fonction** d'un monde trié ; c'est ce qui rend le déterminisme
  démontrable par lecture et non par chance, et ce qui permettra à B3 d'avoir un oracle (le monde) au lieu d'un golden.
- La fidélité aux constructeurs là où elle compte pour B1 : formes courte / longue par protocole, firewalls muets, forme
  HA par priorité, vPC par patte, téléphones qui annoncent leur MAC — la run de base se recompte à la main et B1 y lit
  exactement ce que `docs/05` prédit, `ifname_short_to_long = 40` compris.
- `NotApplicableError` plutôt qu'un monde inchangé, et un scénario inapplicable qui échoue au lieu de se taire.
- Le test de déterminisme en sous-processus sous plusieurs `PYTHONHASHSEED`, hérité de la contre-revue de B1 : la bonne
  leçon, appliquée au bon endroit.
- `--devices N` exact, sites déduits, descriptions périmées conservées par `device_removed` et `cable_moved` : les
  scénarios de données de production (CLAUDE.md, 2026-09-20) sont déjà dans le générateur.

---

## Suivi


Traitement le jour même, après lecture complète du rapport. Règle du projet : les défauts purs se corrigent sans
discussion, ce qui engage une lecture se parque avec un comportement prudent et s'annonce à Orhan.

| Point | Décision | Ce qui a été fait |
|---|---|---|
| **H1** numéros de stubs réutilisés | corrigé | `World.next_stub` et `Draft.next_stub`, compteur global jamais décrémenté ; un stub retiré (seul ou avec son switch) ne rend ni son nom ni sa MAC. `check_world` refuse un nom ou un port-id de stub en double. Test : quatre retraits, un `device_removed`, huit ajouts ⇒ noms et MAC tous distincts. |
| **H2** uptime qui repart après `reboot` | corrigé | `Device.boot_run` : le redémarrage est daté sur le device, `Emission.uptime` compte depuis ce run (`REBOOT_UPTIME + 7 jours × runs écoulés`) ; `reboot` n'est plus dans `TRANSIENT_KINDS`, le drapeau `rebooted` a disparu. Les âges des ports suivent (`"never"` pour un port resté down depuis le boot, plafond `uptime − 300` sinon). Test : +7 jours par run sans reboot, régression au reboot, reprise ensuite. |
| **M1** `description_changed` sans observé | corrigé | Les candidats sont les bouts physiques décrits des câbles **observés** (`_observed_cables` : deux bouts Cisco du périmètre, aucun bout down) : jamais un port face à un firewall ni un câble tombé. Test sur six graines : le port est vu en LLDP, le voisin n'est pas un firewall. Catalogue et README précisent « port observé ». |
| **M2** `"never"` jamais émis | corrigé | `Emission.age` rend `"never"` pour un port `down` sans changement daté (ou dont le changement précède le dernier boot) ; un port monté porte un entier. Tests : ports libres = `"never"`, ports up = entier, port tombé pendant la run = daté. |
| **M3** pas d'invariants du monde | corrigé | `world.check_world(world) -> list[str]` : ports uniques et de devices connus, MAC uniques sur physique / management, câbles vers des ports existants (hors externe) et un câble par port, agrégat ⇔ membres dans les deux sens, aucun agrégat sans membre ni sans port, stubs sur un port d'accès monté avec noms, port-id et ports uniques, membres et heartbeats de cluster présents. Appelé après la construction et après chaque run dans `generate_series` (`GenerationError`), dans le test de chaque sorte (trois graines) et sur une série de douze runs × quatre mutations. |
| **M4** construction quadratique | corrigé | Un brouillon **par site**, concaténés à la fin (`build._merge`) ; `Draft.replace_ports` une fois par device ; `free_access_port` sur les ports du device ; `base` hors de la boucle de `chain_sites`. Mesuré : construction 0,07 / 0,13 / 0,28 / 0,54 s pour 125 / 250 / 500 / 1 000 devices (avant : 0,15 / 0,49 / 1,72 / 7,36). |
| **M5** `ha_member_down` laisse les câbles up | **lecture choisie, à confirmer par Orhan** | Seconde option du rapport : le membre meurt pour la run. `emit.as_seen` tombe, à l'émission seulement, tout port dont le câble mène à un membre listé dans `cluster.down` (pattes vPC des cœurs, heartbeat du survivant) ; le monde durable ne change pas, la run suivante le retrouve. Le membre est tiré au hasard parmi les deux (`details.role` le dit). B1 lit maintenant `ha_member_down`, `device_unreachable`, deux `aggregate_below_min_links` ; la page montre le membre en rouge et ses câbles tombés (capture vérifiée). Si Orhan préfère la lecture « injoignable mais vivant », c'est `device_unreachable`. |
| **M6** `build.py` 655 lignes | corrigé | Découpé sur la couture proposée : `draft.py` (brouillon, `new_device`, `draft_of` / `world_of`), `build_site.py` (cœurs, firewalls, routeur, chaînage, fabriques de ports), `build_access.py` (accès et stubs), `build.py` (répartition et assemblage). Plus aucune fonction au-delà de 50 lignes ; fichier le plus long : `emit.py`, 440. Arguments de `Port` passés par nom dans les fabriques. |
| **B1** `--out` sur un fichier | corrigé | Refus d'usage explicite (« output path is not a directory »), testé. |
| **B2** graine `"-"` sans spec | corrigé | Le monde porte sa graine (`World.seed`) ; `apply_mutation(kind, world, rng, run_index)` n'a plus de paramètre `spec` : un monde muté à la main et la série produisent le même stub. |
| **B3** serials de membres | corrigé | `naming.serial(prefix, seed, index, slot)` : quatre chiffres du rang, le numéro de membre, deux lettres tirées dans tout l'alphabet depuis les octets du condensé : unique par (rang, membre) par construction. |
| **B4** code mort, branches non testées | corrigé | La boucle inatteignable de `distribute_access` est devenue une vérification qui lève ; `pick_applicable(kinds=…)` testé en sautant une sorte inapplicable et en échouant quand aucune ne l'est ; `check_series` testé sur une clé nullable retirée et sur une énumération fausse. La branche « aucun port libre » de `add_stub` reste (garde-fou), non atteinte. |
| **B5** tests faibles | corrigé | Trois graines par sorte, dites dans le test ; `test_stub_added_then_the_same_stub_removed` retire bien le stub ajouté ; `cable_down` exige les deux bouts dans le bundle ; tests ajoutés : retrait puis ajout (H1), uptime entre runs (H2), `"never"` (M2), `description_changed` observé (M1), `ha_member_down` aux deux bouts (M5), `--start` valide, naïf et illisible, `--out` fichier, série longue (M3). Le test à 500 devices est gardé sciemment : c'est la jauge. |
| **B6** réalisme | a, b, c, e, f corrigés ; **d parqué** | (a) cages SFP vides sans média (cuivre gardé) ; (b) `GigabitEthernet0/0` des accès avec une IP de management, uniques sur le site ; (c) VLAN de trunk par rôle (`naming.TRUNK_VLANS_BY_ROLE` : peer-link = tout, uplinks = VLAN utilisateurs, trunk firewall = 100 et 400, le VLAN de `agg-core.400`) ; (e) un membre suspendu garde sa vitesse et son duplex ; (f) `speed_degraded` date les deux bouts. (d) `run.status` reste `completed` : à aligner avec les statuts réels des tasks (question ouverte du 2026-09-10). |
| **B7** organisation | corrigé | `TOPICS`, VLAN, VRF de management, port-id des téléphones dans `naming.py` ; `_parse_start` typé, import en tête ; `Mutation.details: Mapping` ; constantes nommées (`CORE_PORT_COUNT`, `FW_UNUSED_PORTS`, `JUMBO_MTU`, `FAILED_SUBJECT_FACTOR`, `STACK_PRIORITY`, `REBOOT_UPTIME`…). |
| **B8** manifeste sans compte par sorte | corrigé | `counts.stubs_by_kind` et `counts.sites` ; `backend/tests/correlate/test_synth.py` affirme le compte exact : warnings de la run de base = 2 × téléphones, liens = câbles + stubs + téléphones. |
| **Point H2** téléphones | **décision d'Orhan** | Générateur inchangé, pas de drapeau (deux vérités, les fixtures prendraient la silencieuse). Recommandation portée à Orhan : règle bornée dans B1 (deux claims observés depuis le même port témoin vers le même device résolu, l'un en MAC, l'autre nommé, sont un seul câble), à écrire avant la conception de B3. En attendant, le bruit est compté et affirmé par le test backend. |

État après traitement : contracts 543 tests (synth 97 % et plus par module, `world.py` 94 % : branches d'erreur de
`check_world`), backend 357, ruff propre des deux côtés, format ruff sur `synth/` et `tests/synth/`. Série de
démonstration repassée dans B1 et dans la page (Chromium) : le membre HA mort apparaît en rouge, ses câbles tombés,
les trois désaccords de description sont listés.
