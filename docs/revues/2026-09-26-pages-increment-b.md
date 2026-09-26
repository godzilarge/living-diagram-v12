# Revue indépendante : pages `ld render`, incrément B, les structures de R4 (2026-09-26)

Rapport consigné tel que rendu par le relecteur (agent indépendant, lecture seule, aucun fichier du dépôt modifié hors
ce rapport), avant toute correction. Périmètre : `backend/src/ld_backend/render/assets/js/model.js`, `graph.js`,
`structures.js` (nouveau), `inspect.js`, `tables.js`, `main.js`, `layout.js`, `viewer.css`, `page.html`, `page.py`,
`tests/js/viewer.test.js`, `tests/test_render.py`. Hors périmètre : B1 (`correlate/structures.py`, `ha.py`, revus le
même jour dans `2026-09-26-b1-r4-structures.md`), ce que la revue du 2026-09-20 a déjà relu. Les chemins de source sont
relatifs à `backend/`. État constaté : `uv run pytest tests/test_render.py` vert (15 tests, dont les 18 tests Node et le
test de fumée Chromium).

Sondes : sept variantes du bundle minimal construites en mémoire (mutations recopiées en annexe A, helpers de
`tests/correlate/conftest.py`, pages produites par `ld_backend.render.page_from_bundle`), lues sous Node dans le faux DOM
(`tests/js/fakedom.js`, annexe B), et un **hit-testing réel dans Chromium** (`chrome-headless-shell` piloté par CDP,
`document.elementFromPoint` et `Input.dispatchMouseEvent`, annexe C). Captures citées `<S>/…` : scratchpad de la session,
non conservé.

---

**Verdict.** Montrable après correction du constat 1 (une phrase fausse sur le cas nominal du premier bundle réel) et,
de préférence, des constats 2 à 5. La sécurité tient : rien n'entre dans le DOM autrement que par un nœud texte ou un
attribut de classe / de géométrie ; vérifié sous une `cluster_name` hostile dans un vrai navigateur. Les jetons d'adresse
sont traités comme une entrée non fiable et ne peuvent que désigner un élément existant ou rien. Ce qui reste relève de
la fidélité de lecture (une structure affirmée, deux perdues, une invisible) et d'une interaction annoncée qui ne marche
pas à la souris sur le cas nominal.

## a. Sécurité : aucun constat

- **Chaîne hostile dans `cluster_name`** (`</script><script>document.title="PWNED"</script><img src=x onerror=alert(1)>`,
  variante `hostile`, page ouverte dans Chromium avec `#cluster=…`) : `<title>` de la page intact, la charge n'apparaît
  que comme texte échappé dans l'étiquette du cadre (`<text class="cluster-label">HA · &lt;/script&gt;…`) et dans le
  panneau ; 0 `<img>`, 2 `<script>`, aucune ligne `CONSOLE` ni `Refused` sur stderr (`<S>/hostile.png`).
- **Rien n'entre dans le DOM par un chemin nouveau.** `structures.js` et les réécritures passent par `LD.dom.h` / `s`
  (nœuds texte, `setAttribute`) ; les seules valeurs de donnée posées en attribut sont des classes (`pill("member",
  status)`, `pill("mode", mode)`, énumérations du contrat) et des nombres de géométrie ; `data-link` / `data-beam` /
  `data-cluster` sont des rangs écrits par le code. `els.label.textContent = beamLabel(...)` est du texte. Le grep
  anti-HTML de `test_render.py` couvre `structures.js` (glob `*`).
- **Jetons d'adresse.** `parseToken` : `JSON.parse` sous `try`, tableau de chaînes exigé, longueur fixée par sorte ;
  l'identité reconstruite ne sert qu'à une recherche dans une `Map`. Un jeton mal formé (`#beam=[1,2,3,4]`,
  `#cluster={}`, `#aggregate=["a"]`, `#cluster=[]`) donne `null` et la vue d'ensemble. Un jeton de cluster à un seul
  élément contenant `\u0000` désigne le cluster à deux membres (alias inoffensif, l'adresse est réécrite canonique).
- **CSP inchangée**, `page.py` n'ajoute que `structures.js` à la concaténation, dans un ordre qui satisfait les
  références (`LD.structures` et `LD.inspect` ne sont lus qu'à l'appel).

## Constats

### Défauts purs

**1. HAUT : la page affirme « Protocoles différents : inconnu / lacp » quand un bout du faisceau n'a pas de document
`aggregates`** (`structures.js:81-83`, `beamWhy`)

- **Scénario.** Variante `nodoc` : topic `aggregates` de `fw-edge-01` en `failed`, son document retiré ; B1 lit
  l'appartenance dans `interfaces[].members` (repli du 2026-09-20), les câbles `x1` / `x2` portent `aggregate_a =
  "agg-core"` mais `aggregates[]` n'a pas d'entrée `fw-edge-01 · agg-core`. C'est le cas nominal du premier bundle
  réel : firewalls en port-channel, topic `aggregates` FortiOS pas encore écrit, cœurs Cisco documentés.
- **Preuve.** Panneau du faisceau `agg-core ⇄ port-channel20` : « 1 câble entre les membres de agg-core et de
  port-channel20. **Protocoles différents : inconnu / lacp.** Un des deux faisceaux du domaine MLAG 20, vers fw-edge-01. »
  Le snapshot ne porte aucun `aggregate_protocol_mismatch` (0), et B1 dit explicitement (`structures.py`,
  `_protocol_checks`) : « un bout sans document `aggregates[]` n'a pas de protocole connu : rien à comparer ».
- **Pourquoi ça compte.** Même famille que « les deux concordent » (revue du 2026-09-20, constat 2), en pire : la page
  invente un désaccord, et enverra l'auteur de l'exportateur chercher une erreur qui n'existe pas.
- **Correction proposée.** Ne comparer que quand les deux documents existent : « Protocole lacp des deux côtés » /
  « Protocoles différents … (voir `aggregate_protocol_mismatch`) » ; sinon « Protocole lacp côté sw-core-01 ; pas de
  document aggregates côté fw-edge-01 (appartenance lue dans interfaces[].members) ». Mieux : ne dire « différents »
  que si un `aggregate_protocol_mismatch` est accroché au faisceau. Test Node sur la variante `nodoc`.

**2. MOYEN : un équipement décrit dans deux clusters n'en montre qu'un** (`model.js:128`, `clusterByHost` ;
`structures.js:150-154`, `nodeStructures` ; `graph.js:261-270`, `relatedTo`)

- **Scénario.** Variante `twoclusters` : `sw-core-01` livre un document `ha` (`CORE-HA`, `active_active`) dont les
  membres sont `sw-core-01` et `fw-edge-01`. B1 produit deux clusters (`fw-edge-01+fw-edge-02`, `fw-edge-01+sw-core-01`)
  et deux `ha_view_mismatch` ; c'est exactement le désaccord que R4 veut rendre visible.
- **Preuve.** `clusterByHost.get("fw-edge-01")` = `fw-edge-01+fw-edge-02` ; la fiche de `fw-edge-01` cite
  `EDGE-CLUSTER` et **pas** `CORE-HA` ; sélectionner le nœud n'éclaire qu'un cadre sur les deux dessinés.
- **Cause.** `if (!model.clusterByHost.has(host)) model.clusterByHost.set(host, cluster)` : le premier gagne, en silence.
- **Correction proposée.** `clustersByNode` (liste, `pushTo`), la fiche énumère « Clusters HA : 2 » avec un bouton par
  cluster, `relatedTo` éclaire tous les cadres. Test sur la variante.

**3. MOYEN : un faisceau qui appartient à deux domaines MLAG n'en garde qu'un, et la phrase se trompe de domaine**
(`model.js:110`, `mlag: (aggregates.find(...) || {}).mlag`, `graph.js:44-49`, `structures.js:85`)

- **Scénario.** vPC dos à dos, variante `backtoback` : les FortiGate forment leur propre domaine 30 (`agg-core` sur
  `fw-edge-01` et `fw-edge-02`, `mlag_id: 30`), câblé au domaine 20 des cœurs. B1 produit deux domaines. Deux paires
  Nexus reliées en vPC double face, ou un cluster de firewalls en LAG vers un vPC, c'est une topologie standard.
- **Preuve.** Les deux faisceaux `agg-core ⇄ port-channel20` sont étiquetés `MLAG 30` (`<S>/backtoback.png`) alors que
  chacun de leurs agrégats est dans un domaine différent (`[30, 20]`) ; le panneau dit « Un des deux faisceaux du
  domaine MLAG 30 » : le domaine 30 a `downstream: null` (il mène à deux cœurs) et n'a pas « deux faisceaux », et le
  domaine 20, dont ce faisceau est bien l'une des deux pattes, a disparu de la phrase.
- **Correction proposée.** `beam.mlags` = domaines des deux agrégats, dédoublonnés ; étiquette « MLAG 20 · MLAG 30 »
  (ou « vPC 20 ⇄ vPC 30 ») ; phrase par domaine : « patte du domaine MLAG 20 (vers fw-edge-01) ; patte du domaine 30 ».
  Ne dire « un des deux faisceaux » que si le domaine a un `downstream`.

**4. MOYEN : les câbles arrêtés à l'agrégat lui-même (R1-bis indéterminé) sont invisibles depuis l'agrégat**
(`structures.js:50-59`, `aggregateWhy` ; `:29-36`, `memberRows` ; `model.js:83`, `entry.cables`)

- **Scénario.** Variante `aggstop` : le FortiGate annonce `agg-core` en port-id sur les deux cœurs, sans description
  pour départager (le cas réel du 2026-09-22 quand la description manque). B1 trace deux câbles observés dont le bout
  est `(fw-edge-01, agg-core)`, hors de `aggregates[].cables` par décision, avec deux `remote_port_is_aggregate`.
- **Preuve.** Panneau de `fw-edge-01 · agg-core` : « 2 membres dont 2 bundled … **Aucun câble tracé sur ses
  membres.** » ; table des membres : `x1 —`, `x2 —` ; aucun `remote_port_is_aggregate` dans ses contrôles (ils visent
  les ports des cœurs) ; `model.linksByIface.get("fw-edge-01\0agg-core").length === 2`. La phrase est vraie mot à mot et
  l'agrégat paraît décâblé ; c'est précisément la question que se pose l'auteur de l'exportateur (« pourquoi mes câbles
  ne tombent-ils pas sur les membres ? »). La colonne « câbles » de la fiche d'équipement et de la vue Structures dit
  `0` pour la même raison.
- **Correction proposée.** Sans rien inventer : joindre `linksByIface` sur le nom de l'agrégat, section « Câbles
  arrêtés à l'agrégat lui-même : 2 (port distant annoncé par le nom de l'agrégat, membre indéterminé) » avec les deux
  câbles cliquables, et les inclure dans ce que la sélection de l'agrégat éclaire (`relatedTo`) ; en contrôles, joindre
  les `remote_port_is_aggregate` dont `details.neighbor` / `details.aggregate` désignent cet agrégat.

**5. MOYEN : la bande d'un faisceau à deux câbles n'est cliquable qu'au pixel près, celle d'un faisceau à un câble sur
une marge de 4 unités** (`viewer.css:108`, `:136`, `:139` ; `graph.js:56-59`, couches)

- **Cause.** La couche des câbles est au-dessus de celle des bandes ; `link-hit` fait 12 unités (±6), la bande 18
  (±9), `beam-hit` 22 (±11). Deux câbles parallèles s'écartent de ±7 (`FAN 14`), donc leurs zones de clic couvrent
  [−13, +13] : la bande du peer-link ne reste atteignable que sur l'axe, entre les deux.
- **Preuve (hit-testing réel, Chromium, zoom d'ajustement 1,6).** Faisceau à un câble : `link-hit` de 0 à ±5,
  `beam-hit` de ±7 à ±10, fond au-delà de ±12. Peer-link à deux câbles : `beam-hit` à 0 seulement, `link-hit` ou
  `link-mark` de ±3 à ±12, fond à ±15. Clics dispatchés sur le peer-link : axe → `beam` ; +8 unités → `null`
  (désélection) ; +16 → `null`. À `k = 0,8` (zoom minimal de `centerOn`), la strie utile fait moins de 2 pixels.
- **Conséquence.** La décision « clic sur une bande = panneau du faisceau » est vraie dans le faux DOM (le test fire
  sur `beam-hit` sans hit-testing) et fausse à la souris sur le cas nominal. Le panneau reste atteignable par la vue
  Structures, la fiche d'un câble (« faisceau ») et l'adresse.
- **Au passage.** À +8 le clic tombe sur `link-mark` (la pastille warning), qui n'a pas de `data-link` : cliquer une
  pastille **désélectionne** au lieu d'ouvrir le câble (antérieur à l'incrément, trouvé par la même sonde).
- **Correction proposée.** Faire dépendre la bande de l'éventail : largeur `18 + spacing × (n − 1)` pour `n` câbles,
  `beam-hit` = bande + 2 × 8, pour garder ≥ 8 unités de marge visible et cliquable de chaque côté du câble extérieur ;
  poser `pointer-events: none` sur `link-mark` (ou lui donner le `data-link`). Vérifier dans Chromium avec
  `elementFromPoint` (annexe C), pas dans le faux DOM.

**6. BAS : un contrôle de membre sur un port qui porte deux câbles est attribué aux deux, par coïncidence de noms**
(`model.js:145-151`, `concerns`)

- **Scénario.** Variante `hubmember` : le membre suspendu `sw-core-02 · Ethernet1/2` voit aussi `rt-wan-01 ·
  Ethernet1/2`. `aggregate_member_not_bundled` a `details = {member: "Ethernet1/2", status: "suspended"}`.
- **Preuve.** Les deux câbles du port portent `aggregate_member_not_bundled` dans `checks` (pas `portChecks`),
  `worst = warning` sur les deux : `found.names` contient `"Ethernet1/2"` (le port **local**) et `concerns` le lit comme
  le nom du port **d'en face**, qui s'appelle pareil sur les deux câbles (les ports symétriques sont la norme entre
  cœurs).
- **Correction proposée.** Dans `concerns`, ignorer les valeurs de `details` égales au port local (`ref.name`) ; ou ne
  regarder que des clés qui désignent l'autre bout (`neighbor`, `observed`, `documented`, `resolved`, `port`,
  `neighbors`), pas `member`.

**7. BAS : un faisceau entre deux agrégats du même équipement est compté, adressable, étiqueté « peer-link », et jamais
dessiné, sans le dire** (`model.js:97-120`, `buildBeams` ; `graph.js:75-78`, `visibleBeams`)

- **Scénario.** Variante `selfbeam` : LLDP `sw-core-01 · Ethernet1/3 → sw-core-01 · Ethernet1/1` (boucle entre un membre
  de `port-channel20` et un membre de `port-channel10`).
- **Preuve.** 3 faisceaux au modèle, 2 bandes dessinées, la vue d'ensemble annonce « 5 · 3 (bandes sous les câbles) » ;
  `#beam=["sw-core-01","port-channel10","sw-core-01","port-channel20"]` ouvre un panneau qui dit « **C'est le peer-link
  d'un domaine MLAG.** » (`peerLink = aggregates.some(agg => agg.raw.mlag_peer_link)` : `port-channel10` est marqué
  peer-link, donc tout faisceau qui le touche l'est) ; aucun élément `selected` sur le graphe ; `beamsByNode
  (sw-core-01)` contient le faisceau deux fois (`ends.forEach(pushTo)`).
- **Règle douteuse, au-delà de la boucle.** `peerLink` et `degraded` sont des propriétés d'un **agrégat** étendues au
  faisceau : un agrégat marqué `mlag_peer_link` dont les câbles mènent ailleurs que chez le pair (erreur de
  configuration, précisément ce qu'on veut voir) donne un faisceau étiqueté « peer-link » vers un équipement aval ; la
  pastille « dégradé » d'un faisceau veut dire « un de ses agrégats est dégradé », membres hors faisceau compris.
- **Correction proposée.** Dessiner la boucle (la courbe des câbles locaux existe déjà, `curve` l.13-16) ou l'écrire dans
  le panneau (« faisceau local, non dessiné ») ; dédoublonner `beamsByNode` ; libeller « agrégat peer-link » / « agrégat
  dégradé » plutôt que d'en faire une propriété du faisceau.

**8. BAS : une adresse aux bouts inversés ne désigne rien** (`model.js:276-284`, `selectionFromToken`)

- **Preuve.** `#beam=["sw-core-02","port-channel10","sw-core-01","port-channel10"]`, `#cluster=["fw-edge-02","fw-edge-01"]`
  et `#link=["sw-core-02","Ethernet1/2","sw-core-01","Ethernet1/2"]` donnent `selection = null`. L'ordre attendu est
  l'ordre de tri de la clé interne (`hostname\0agrégat` en ordre de chaîne pour un faisceau, qui n'est pas celui de B1,
  en ordre naturel), que rien ne documente ; une adresse recopiée à la main depuis la vue Structures (« sw-core-01 ·
  port-channel20 + sw-core-02 · port-channel20 ») ne tombe juste que par chance.
- **Correction proposée.** Trier les membres d'un cluster et les deux bouts d'un faisceau (et d'un câble) avant de
  reconstruire l'identité ; l'adresse réécrite est déjà canonique.

**9. BAS : `reveal(null)` lève une `TypeError`** (`graph.js:358-362`, `{...}[selection.kind]`). Atteignable depuis
`tables.js`, ligne d'un domaine MLAG dont `members` serait vide (`onSelect(null)`), ce que le contrat interdit
(`reference_unknown`). Garde d'une ligne : `if (!selection) return select(null)`.

### Règles douteuses, comportement visible

**10. BAS : les étiquettes complètes des faisceaux couvrent les noms de ports et de nœuds** (`graph.js:121-135`,
`placeBeam` ; `:44-49`)

- **Preuve.** `<S>/ports.png` (« noms des ports et des faisceaux ») : `agg-core ⇄ port-channel20 · MLAG 20` commence
  sous le rectangle `FW`, passe sur `x1` et `Ethernet1/3` ; `port-channel10 ⇄ port-channel10 · peer-link` traverse
  `Ethernet1/2` / `Ethernet1/1` des deux câbles et rejoint le nom `sw-core-02` ; `<S>/beam_peer.png` (faisceau
  sélectionné, forme complète) : même chose, l'étiquette est plus longue que la bande (≈ 200 px pour une bande de
  ≈ 250 px, deux `Port-channel100` feraient 330 px). Les étiquettes de port sont à `78 / longueur` de chaque bout,
  l'étiquette du faisceau centrée : elles se rencontrent par construction dès que la bande fait moins de ≈ 350 px.
- **Idem pour le cadre** : `clusterLabel` n'est jamais tronqué ; une `cluster_name` longue (ou hostile) traverse tout le
  canevas (`<S>/hostile.png`).
- **Proposition.** Forme complète sur deux ancrages : le nom de chaque agrégat près de son bout, du côté opposé aux
  noms de ports (l'autre signe de `anchor`), la nature (`peer-link`, `MLAG n`) seule au milieu ; ou garder la forme
  courte sur le graphe et laisser les noms au panneau. Tronquer les étiquettes à N caractères avec `…` (le `<title>`
  garde le texte entier).

**11. BAS : le cadre d'un cluster est une boîte englobante des centres, agrandie de 40** (`graph.js:34-37`, `hull` ;
`:319-323`, `layoutEdges`, renfort 2,5)

- **Preuve.** `<S>/graph.png` : pour deux firewalls dont l'un n'a aucun câble, le cadre fait ≈ 310 × 300 px sur un
  graphe de six nœuds ; le membre injoignable est bien à côté de son pair (le renfort fait son travail) mais à
  ≈ 1,4 × `IDEAL`. `<S>/longname.png` : le hostname `fw-edge-02-datacenter-paris-secondary-node` dépasse du cadre à
  gauche (marge 40, demi-largeur de l'étiquette ≈ 120). Une boîte englobante enferme aussi tout nœud placé entre deux
  membres éloignés (non reproduit sur six nœuds, certain sur cinquante).
- **Proposition.** Renfort plus fort ou longueur idéale propre aux arêtes de cluster (`IDEAL / 2`) ; marge horizontale
  fonction de la plus longue étiquette des membres ; à défaut de vraie enveloppe, dire dans le `<title>` du cadre
  combien de membres il contient. À regarder sur un vrai bundle avant de trancher (règle du 2026-09-20).

**12. BAS : la fiche d'un voisin inconnu ou d'un équipement d'une autre infra dit « aucun document aggregates pour cet
équipement »** (`structures.js:155-159`). Preuve : fiches de `srv-hyp-07` (stub) et `rt-wan-01` (externe). Aucun document
n'est attendu d'eux ; réserver la section aux `kind === "device"`, ou écrire « non collecté ».

**13. BAS : sélectionner un agrégat n'allume pas les voisins inconnus que ses câbles atteignent** (`graph.js:358-368`,
`reveal`, `needsStubs` ne regarde que `hostsOf`, soit l'équipement de l'agrégat). Un agrégat de firewall documenté vers
un voisin hors inventaire (stub) s'ouvre sur un graphe où rien ne s'éclaire, alors qu'ouvrir un de ses câbles rallume le
stub. Non sondé (déduit du code) ; même règle que pour un câble : `needsStubs` sur les bouts des `links` de la sélection.

## c. Robustesse : vérifié et trouvé correct

- **Clic sur une bande après un redessin** : `pointerdown` sur `beam-hit`, `render(true)` (la bande appuyée n'est plus
  dans le DOM), `pointerup` sur l'ancien élément ⇒ sélection `beam` juste. Le rang `data-beam` désigne le modèle, pas le
  DOM ; robuste par construction.
- **Faisceau dont tous les câbles sont masqués par statut** : bande non dessinée (cohérent), `reveal` du faisceau
  rallume le statut et la bande revient. Le `<title>` compte les câbles masqués (« 2 câble(s) ») : trivial.
- **Cluster dont un membre est un stub masqué** (variante `stubcluster`, `known_hosts` inclut les stubs) : pas de cadre
  par défaut (un seul membre visible), `reveal` rallume les stubs, cadre dessiné, panneau juste (« fw-edge-03 : aucun
  document ha »).
- **Snapshot sans structures** : couvert par le test existant (« snapshot vide ») ; `aggregates: []`, `mlag_domains:
  []`, `ha_clusters: []` sont requis par le contrat de sortie depuis le 2026-09-20, donc un `snapshot.json` archivé avant
  l'incrément se lit.
- **Adresse mal formée** : voir § a.
- **Déterminisme** : les faisceaux suivent l'ordre de `snapshot.links`, les arêtes de cluster passent par `uniqueEdges`
  triées ; même page, mêmes positions.

## d. Ce que les décisions donnent sous les yeux

- *Un faisceau = les câbles dont les deux bouts sont membres d'un agrégat.* Tient, à un trou près : le câble arrêté à
  l'agrégat lui-même (constat 4) n'est ni dans un faisceau ni dans l'agrégat, alors qu'il est le cas R1-bis.
- *Clic sur une bande = panneau du faisceau.* Vrai dans le faux DOM, faux à la souris sur le peer-link (constat 5).
- *L'agrégat n'a pas d'élément propre.* Lisible : le nœud prend le style « sélectionné », les câbles et le faisceau
  s'éclairent (`<S>/aggregate.png`). Rien à redire.
- *Un cluster à un seul membre visible n'a pas de cadre.* Juste ; un cluster `standalone` n'a donc jamais de trace sur
  le graphe, seulement dans la fiche : acceptable.
- *Étiquette courte par défaut.* Bonne lecture par défaut (`<S>/graph.png`) ; la forme complète est illisible (10).
- *Renfort 2,5.* Le membre injoignable reste près de son pair ; le cadre reste large (11).

## e. Tests

- **Le test de fumée Chromium ne regarde pas les structures** (`test_render.py:202-205` : nœuds, câbles, statut).
  Ajouter `dom.count('class="beam')`, `dom.count('class="cluster')`, et une page ouverte sur `#beam=…` (le chemin
  `reveal` → `centerOn` dans un vrai navigateur).
- **Les quatre tests Node de l'incrément ne couvrent que la fixture nominale.** Manquent : un bout sans document
  (constat 1), un équipement dans deux clusters (2), deux domaines sur un faisceau (3), un câble arrêté à l'agrégat (4),
  la boucle locale (7), les bouts inversés (8), le cluster au membre stub, un faisceau aux câbles masqués. Les mutations
  de l'annexe A suffisent.
- **Ce que le faux DOM ne peut pas voir, et qui a compté ici** : le hit-testing (constat 5). L'annexe C tient en 60
  lignes de Node (`--experimental-websocket` sur Node 20) sans dépendance ; ce serait un test `skipif` de plus.
- `test("le graphe dessine une bande par faisceau et un cadre par cluster, cliquables")` pose « cliquables » en tirant
  sur `beam-hit` : ce que le test prouve, c'est que la cible **existe**, pas qu'on l'atteint.

## Ce qui est bien fait

- Le modèle **lit** : `entry.cables` et `heartbeats[].link` viennent des clés du snapshot, jamais recalculés ; un
  heartbeat sans câble le dit (« rien n'est inventé »).
- Les identités d'adresse portent les bouts et les membres, jamais un rang ; une adresse qui ne désigne rien laisse la
  page intacte.
- Le clic après redessin est robuste par construction (rang vers le modèle).
- Les sources d'un cluster distinguent le rapporteur des membres muets, avec l'état de collecte du muet (« collecte :
  unreachable »).
- La vue Structures est une table fidèle : membres avec statut, câbles, peer-link, équipement aval, heartbeats « sans
  câble ».
- `layoutEdges` avec renfort : le membre injoignable d'un cluster n'est plus rangé sur l'étagère.
- `reveal` d'un faisceau rallume les statuts de ses câbles.

**Non reproduit, non testé :** le glisser d'un membre de cluster (le cadre suit, `follow`, lu mais non piloté) ;
Firefox ; une infra à cinquante clusters (coût de `follow`, linéaire en clusters à chaque `pointermove`, sans doute
négligeable).

---

## Annexe A : les variantes (mutations du bundle minimal, helpers de `tests/correlate/conftest.py`)

```python
FW, C1, C2 = "fw-edge-01", "sw-core-01", "sw-core-02"

def nodoc(d):        # constat 1 : agrégat du FortiGate connu par interfaces[].members seulement
    task_subject(d, FW, "aggregates", "failed")
    d["aggregates"] = [a for a in d["aggregates"] if a["hostname"] != FW]

def twoclusters(d):  # constat 2 : fw-edge-01 décrit dans deux clusters
    d["ha"].append({"hostname": C1, "mode": "active_active", "cluster_name": "CORE-HA", "heartbeat_interfaces": [],
        "extras": {}, "members": [{"name": C1, "serial": None, "role": "member", "state": "up", "priority": None},
                                  {"name": FW, "serial": None, "role": "member", "state": "up", "priority": None}]})
    task_subject(d, C1, "ha", "success")

def selfbeam(d):     # constat 7 : câble entre deux membres d'agrégats du même équipement
    d["lldp"].append(lldp_doc(C1, "Ethernet1/3", C1, "Ethernet1/1"))

def backtoback(d):   # constat 3 : vPC dos à dos, domaine 30 des FortiGate câblé au domaine 20 des cœurs
    next(a for a in d["aggregates"] if a["hostname"] == FW)["mlag_id"] = 30
    for name in ("x1", "x2", "agg-core"):
        c = copy.deepcopy(interface(d, FW, name)); c["hostname"] = "fw-edge-02"; c["description"] = None
        d["interfaces"].append(c)
    agg = copy.deepcopy(next(a for a in d["aggregates"] if a["hostname"] == FW)); agg["hostname"] = "fw-edge-02"
    d["aggregates"].append(agg)
    for topic in ("interfaces", "aggregates"): task_subject(d, "fw-edge-02", topic, "success")

def aggstop(d):      # constat 4 : R1-bis indéterminé, câble arrêté à l'agrégat
    d["lldp"].append(lldp_doc(C1, "Ethernet1/3", FW, "agg-core", ("router",)))
    d["lldp"].append(lldp_doc(C2, "Ethernet1/4", FW, "agg-core", ("router",)))
    for h, n in ((C1, "Ethernet1/3"), (C2, "Ethernet1/4"), (FW, "x1"), (FW, "x2")): interface(d, h, n)["description"] = None

def stubcluster(d):  # robustesse : un membre du cluster est un voisin inconnu
    d["lldp"].append(lldp_doc(C1, "Ethernet1/5", "fw-edge-03", "port1", ("router",)))
    d["ha"][0]["members"][1]["name"] = "fw-edge-03"

def hubmember(d):    # constat 6 : le membre suspendu voit deux voisins
    d["lldp"].append(lldp_doc(C2, "Ethernet1/2", "rt-wan-01", "Ethernet1/2", ("router",)))

def hostile(d):      # sécurité
    d["ha"][0]["cluster_name"] = '</script><script>document.title="PWNED"</script><img src=x onerror=alert(1)>'

# longname : json.dumps(bundle).replace("fw-edge-02", "fw-edge-02-datacenter-paris-secondary-node")
# page : page_from_bundle(variant(load_minimal(), fn), origin=fn.__name__).page
```

## Annexe B : lecture sous Node (extraits, `tests/js/fakedom.js`)

```js
const { readPage, load } = require("./tests/js/fakedom.js");
const page = readPage("pages/nodoc.html");
const { LD, document } = load(page, page.data);            // ou load(page, page.data, "#beam=" + encodeURIComponent(JSON.stringify([...])))
const m = LD.app.model;
m.beams.map((b) => [b.a.aggregate, b.b.aggregate, b.aggregates.map(Boolean)]);   // nodoc : [false, true]
LD.app.graph.select({ kind: "beam", id: m.beams[0].id });
document.getElementById("inspector").withClass("why")[0].textContent;           // « Protocoles différents : inconnu / lacp. »
m.clusterByHost.get("fw-edge-01").hosts;                                        // twoclusters : un seul des deux
m.beams.map((b) => LD.graph.beamLabel(b));                                      // backtoback : « … · MLAG 30 » deux fois
m.aggregateByKey.get("fw-edge-01\u0000agg-core").cables.length;                 // aggstop : 0, contre linksByIface : 2
m.linksByIface.get("sw-core-02\u0000Ethernet1/2").map((l) => l.checks.map((c) => c.code)); // hubmember
```

## Annexe C : hit-testing réel (Chromium, CDP, Node 20 `--experimental-websocket`)

Lancer `chrome-headless-shell --no-sandbox --disable-gpu --window-size=1440,900 --remote-debugging-port=0
--remote-allow-origins=* about:blank`, lire `DevTools listening on ws://…` sur stderr, ouvrir le WebSocket de la page
(`GET /json`), puis `Page.navigate` sur la page et, après 1,5 s, `Runtime.evaluate` :

```js
(() => { const s = LD.app.graph.state, rect = document.getElementById("canvas").getBoundingClientRect(), out = [];
  for (const beam of LD.app.model.beams) {
    const p = s.positions.get(beam.a.hostname), q = s.positions.get(beam.b.hostname);
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
    const at = (off) => document.elementFromPoint(rect.left + s.view.tx + (mx - dy / len * off) * s.view.k,
                                                  rect.top + s.view.ty + (my + dx / len * off) * s.view.k);
    out.push([beam.links.length, [0, 3, 5, 7, 8, 10, 12, 15].map((o) => o + ":" + (at(o) || {}).getAttribute?.("class"))]);
  } return out; })()
```

puis `Input.dispatchMouseEvent` (`mousePressed` / `mouseReleased`) aux mêmes points et lecture de
`LD.app.graph.state.selection`. Résultat sur la fixture (zoom 1,6) : un câble → `link-hit` jusqu'à ±5, `beam-hit` de
±7 à ±10 ; deux câbles → `beam-hit` à 0 seulement, `link-hit` / `link-mark` de ±3 à ±12 ; clic à +8 sur le peer-link ⇒
`selection = null`.

---

## Traitement

Traité le jour même (2026-09-26), backend 279 tests verts (Node : 24 tests dont un sur une page R1-bis indéterminé,
fumée Chromium avec compte de bandes et de cadres), ruff propre.

**Défauts purs, corrigés :**
- **1** — `beamWhy` ne compare plus quand un bout n'a pas de document `aggregates` : « fw-edge-01 · agg-core n'a pas
  de document aggregates (appartenance lue dans interfaces[].members) : B1 ne compare pas les protocoles ». Test Node
  (page nominale privée du document du FortiGate).
- **2** — `clustersByHost` (liste) remplace `clusterByHost` ; la fiche d'un équipement liste tous ses clusters, la
  sélection éclaire tous ses cadres. Test Node (cluster ODD ajouté).
- **3** — `beam.mlags` = domaines des deux agrégats, dédoublonnés ; étiquette « MLAG 20 · MLAG 30 », une phrase par
  domaine (« Patte du domaine MLAG 20 (vers fw-edge-01) »), « vers » seulement si le domaine a un aval.
- **4** — le panneau d'un agrégat liste les câbles arrêtés à l'agrégat lui-même (section dédiée, phrase, renvoi au
  contrôle `remote_port_is_aggregate`). Test Node sur une page R1-bis indéterminé (`LD_PAGE_AGGSTOP`).
- **5** — la bande couvre l'éventail de ses câbles (`beamWidths` : `18 + 2 × écart du câble extérieur`, zone de clic
  + 8 de chaque côté) ; l'étiquette porte sa propre zone de clic, dans une couche **au-dessus** des câbles, décalée
  au-delà de la bande : cliquer le nom d'un faisceau l'ouvre toujours ; `link-mark` en `pointer-events: none` (cliquer
  une pastille ouvre le câble). Vérifié à l'œil en Chromium ; le hit-testing réel par CDP reste à rejouer (annexe C)
  si un doute subsiste.
- **6** — `mentioned` ignore les clés qui nomment le port local (`member`, `interface`).
- **7** — une boucle entre deux agrégats du même équipement ne fabrique plus de faisceau (ses agrégats se lisent sur
  la fiche du câble) ; `peerLink` = tous les agrégats connus marqués ; pastille « un agrégat dégradé ».
- **8** — `selectionFromToken` accepte les bouts dans l'autre ordre (lien, faisceau), trie les membres (cluster). Test.
- **9** — `reveal(null)` désélectionne sans lever. Test.

**Règles douteuses, comportement prudent adopté :**
- **10** — étiquette complète seulement sur le faisceau sélectionné (plus avec « noms des ports » ni sur les faisceaux
  voisins) ; forme courte ailleurs.
- **11** — cadre élargi au plus long hostname de ses membres (`hull(points, longest)`).
- **12** — la section « Agrégats » n'apparaît que sur la fiche d'un équipement collecté.
- **13** — `reveal` d'un agrégat (ou d'un faisceau) rallume les voisins inconnus que ses câbles atteignent.
- Tests : fumée Chromium compte bandes et cadres ; quatre tests Node de plus, dont deux sur des variantes.
