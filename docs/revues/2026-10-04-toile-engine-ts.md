# Revue indépendante — La toile : portage de la page `ld render` en TypeScript (`engine/`) (2026-10-04)

Rapport rendu tel quel ; le suivi des corrections est tenu à la fin du fichier.

---

**Périmètre.** Le paquet `engine/` : `package.json`, `package-lock.json`, `tsconfig.json`, `build.mjs`, `types.mjs`,
`README.md`, `src/index.ts`, `src/canvas/{types,model,layout,geometry,graph,tip,icons,dom}.ts`,
`src/shell/{main,inspect,structures,tables,shell,apps}.ts`, les types générés `src/contracts/{snapshot,diff}.ts` ; le
fichier construit `backend/src/ld_backend/render/assets/js/viewer.js` ; les modifications de `render/page.py`,
`render/shell.py`, `.gitignore`, `.gitattributes`, `backend/tests/test_render.py`, `backend/tests/test_view.py`,
`backend/tests/js/viewer.test.js`. Comparé module par module aux douze fichiers d'origine lus dans le dernier commit
avant le portage (`a277b38`, `backend/src/ld_backend/render/assets/js/*.js`). Lu en contexte, non modifié : `CLAUDE.md`
(règles, journal, décision ③), `render/assets/page.html`, `render/assets/viewer.css`, `backend/tests/js/fakedom.js`,
`backend/src/ld_backend/schemas.py`, `backend/README.md`, `QUICKSTART.md`.

**État constaté** (sources lues entre 18:00 et 18:21, `viewer.js` de 18:15 : 144 146 octets, 2 820 lignes, quatorze
blocs `// src/…`). Node 20.20.2, npm 10.8.2 ; `node_modules/` présent avec esbuild 0.28.2, typescript 5.9.3,
json-schema-to-typescript 15.0.4, conformes au `package-lock.json` (v3, empreintes d'intégrité, les 26 binaires
`@esbuild/*` listés). `npx tsc --noEmit` : **0 erreur** en 2,3 s. `node build.mjs --check` et `node types.mjs --check` :
**à jour**, depuis `engine/`, depuis `/` et depuis `/tmp` (le chemin de travail ne change rien ; aucun chemin absolu dans
`viewer.js` ; IIFE, `"use strict"` en ligne 2, aucun `import`/`export` résiduel). `cd backend && uv run pytest
tests/test_render.py tests/test_view.py` : **26 verts** à 18:20, dont les 50 tests Node et les trois rendus Chromium.
Les 50 tests Node passent aussi contre des pages où l'ancien script a été substitué au nouveau (sonde A).

**Avertissement sur l'arbre de travail.** À partir de 18:25, un travail parallèle (B4 intention) a modifié l'arbre
pendant la revue : `contracts/src/ld_contracts/schema/intent-v1.schema.json` (18:25), `engine/src/contracts/intent.ts`
(18:28), `engine/src/shell/intent.ts` (18:32), `graph.ts`, `model.ts`, `types.ts`, `index.ts`, `apps.ts`, `inspect.ts`,
`main.ts`, `shell.ts` retouchés (18:29–18:32), `viewer.js` reconstruit (18:32, 157 087 octets), ainsi que
`page.html`, `viewer.css`, `api.py`, `cli.py`, `schemas.py`, `build.py`, `fakedom.js`, `viewer.test.js`,
`test_render.py`, `test_review_e2e.py`, `browser.py` et plusieurs fichiers de `contracts/`. **Ce rapport porte sur
l'état lu avant 18:25, c'est-à-dire sur le portage tel quel** ; rien de ce qui a été ajouté ensuite n'est relu ici.
À 18:35, `build --check`, `types --check` et `tsc` sont de nouveau verts sur l'arbre modifié.

**Sondes exécutées**, scripts rejouables dans `docs/revues/sondes-2026-10-04-toile/` (commande en tête de fichier,
sorties dans `tmp/`, hors dépôt) :
- **A** `probe_pages.py` : fabrique, pour les sept pages des tests du dépôt (`page`, `hub`, `aggstop`, `unread`, `diff`,
  `unreachable`, `shell`) et pour toute page `ld render` passée en argument, un jumeau `-old.html` où le bloc
  `<script id="ld-viewer">` est remplacé par la concaténation des anciens modules (ordre de l'ancien `JS_FILES`,
  `shell.js` en plus pour la coquille) et où l'empreinte CSP est recalculée ; tout le reste est identique à l'octet.
- **B** `probe_dom.js` : sous le faux DOM des tests, la même suite d'interactions des deux côtés (démarrage, chaque
  onglet, bascules stubs / ports, `reveal` d'un élément de chaque sorte, sélection de chaque nœud et de chaque câble,
  pastilles d'en-tête, recherche, survol, glissé, focus / blur, deux adresses), puis l'arbre entier sérialisé (balises,
  attributs triés, texte, `hidden`, `checked`) comparé ligne à ligne ; les lignes de bulle de tous les câbles, nœuds,
  faisceaux, clusters ; les positions du placement ; un résumé du modèle (combos, comptes, contrôles par câble,
  faisceaux, agrégats, clusters).
- **C** `probe_captures.sh` : Chromium headless 1440 × 900, capture PNG et `--dump-dom` (script et empreintes retirés),
  trois adresses par page (défaut, `#stubs=1`, un câble ouvert par son identité), comparés à l'octet.
- **D** `probe_parse_twice.js` : compte les appels à `JSON.parse` au démarrage d'une page et chronomètre une analyse.
- Inline : `npx tsc --noEmit --noUncheckedIndexedAccess` (compte des accès indexés non vérifiés) ; esbuild sur un
  fichier à erreur de type ; `ld-contracts generate --seed toile --devices 500 --runs 1` puis `ld render` pour une page
  à la jauge (1 338 nœuds, 2 140 câbles, 2 031 contrôles, 16,4 Mo de JSON).

## Lecture de la fidélité (avant les défauts)

**Vérifié, pas supposé.** Sonde B : sur les six pages à données et deux adresses, **DOM identiques** (43 000 à 56 000
lignes sérialisées par scénario), bulles identiques (101 à 130 lignes), positions identiques, modèle identique. Sonde C :
**21 paires** (7 pages × 3 adresses) : capture PNG et DOM **identiques à l'octet**, coquille comprise. À la jauge
(sonde A sur `big.html`, Chromium avec 60 s de temps virtuel) : DOM de 18 200 478 octets identique, capture de 383 274
octets identique, « 520 nœuds sur 1338 et 1038 câbles sur 2140 affichés · 818 voisins inconnus masqués » des deux côtés.
Les 50 tests Node passent contre les deux scripts.

**Par lecture, module par module** (ancien JS contre nouveau TS), aucune différence de comportement sur le chemin
nominal : mêmes ordres d'itération (`forEach`, `Map` en ordre d'insertion, tris par clé explicite), mêmes valeurs par
défaut, mêmes conditions, mêmes textes, mêmes classes et attributs, mêmes conversions (`String(x)` là où `setAttribute`
convertissait déjà, `"14"` pour `14`), même traitement de `null` / `undefined` (`ifaceKey(host, null)` donne toujours
`"host\u0000null"`, `endLabel` écrit `?`, `plain` écrit `—`). L'espace de noms `LD` expose les mêmes clés sur chaque
module (`model` 19 clés, `dom` 20, `tip` 5, `structures` 8…), plus `tables.setChecksSeverity: null` à l'initial (lu par
`if (tables.setChecksSeverity)`, comme avant). Ordre de démarrage identique : la page autonome puis la coquille.
Quatre divergences, toutes dans le sens de la robustesse, sur des chemins que rien n'atteint aujourd'hui : B6.

## Critique

Aucun. La fidélité du portage est établie par les sondes B et C au-delà de ce que les tests du dépôt couvrent, la CSP
et les trois garde-fous de `page.py` sont inchangés, le scan de sécurité couvre les sources TypeScript et le fichier
construit, et le déterminisme de `viewer.js` est vérifié depuis trois répertoires de travail.

## Haut

**H1 — Rien dans la suite ne vérifie les types : esbuild ne les lit pas, aucun test ne lance `tsc`.**
`engine/build.mjs:12-29` : esbuild transpile en retirant les annotations, sans jamais les vérifier. Vérifié : un fichier
`const x: number = "pas un nombre"` passe `npx esbuild --bundle` avec sortie 0 et aucun message. Le test de dérive
(`backend/tests/test_render.py:307-317`) ne lance que `build.mjs --check` et `types.mjs --check` ; `npm run typecheck`
(`engine/package.json:12`) n'est appelé par personne. **Pourquoi c'est un problème.** La promesse de la brique est
« TypeScript strict » (`engine/README.md` : « Types stricts sur le modèle ») ; aujourd'hui une erreur de type dans
`engine/src` laisse `viewer.js` se construire, le test de dérive vert, les 50 tests Node verts et la suite backend
verte. Le typage n'est garanti que par la discipline de lancer `npm run typecheck` à la main. **Vérification.**
Introduire `const n: number = "x";` dans `src/canvas/icons.ts`, `npm run build`, `uv run pytest tests/test_render.py` :
tout est vert. **Correction.** Dans `test_the_built_viewer_matches_the_engine_sources`, ajouter
`["node", ENGINE / "node_modules/typescript/bin/tsc", "--noEmit", "-p", ENGINE]` (2,3 s mesurées) sous la même
condition de saut ; ou faire de `build.mjs` un script qui refuse de construire si `tsc` échoue (`npm run build` =
`tsc --noEmit && node build.mjs`), ce qui protège aussi le `viewer.js` versionné.

## Moyen

**M1 — La page autonome analyse deux fois son bloc JSON : la coquille embarquée relit `#ld-data` pour constater qu'elle
n'a rien à faire.** `engine/src/index.ts:22-23` appelle `startPage()` puis `startShell()` ; `shell/main.ts:249-258` et
`shell/shell.ts:160-169` font chacun `JSON.parse(document.getElementById("ld-data").textContent)` ; la condition de la
coquille (`view-shell` présent **et** `ld-data` présent) est vraie dans la page autonome, car `page.html:20` porte
`view-shell` pour les deux pages. Avant le portage, `shell.js` n'était pas dans la page autonome (`shell.py`,
`SHELL_SCRIPTS = (*JS_FILES, "shell.js")`), donc une seule analyse. **Mesuré** (sonde D, Node 20) : `page-old.html`
1 appel, `page-new.html` 2 appels ; à la jauge, `big.html` : 16,4 Mo de JSON, 2 appels, 32,8 Mo lus, ~100 ms par
analyse (et 16 Mo d'objets transitoires jetés aussitôt). **Pourquoi c'est un problème.** Un coût de démarrage et de
mémoire ajouté à la page la plus lourde, pour rien ; et une règle implicite (« la coquille démarre si pas de snapshot »)
réalisée par deux lectures indépendantes de la même donnée. **Correction.** Lire le bloc une fois dans `index.ts`
(`const data = readEmbedded()`), puis `if (data.snapshot) apps.app = boot(data); else if (shellRoot) apps.shellApp =
create(shellRoot, data)` ; les deux `autostart` deviennent des fonctions qui reçoivent `data`. Test Node : charger la
page autonome avec un `JSON` compteur et affirmer un seul appel (la sonde D fournit le gabarit).

**M2 — Des casts `as` tiennent lieu d'invariants, et `noUncheckedIndexedAccess` est désactivé en toutes lettres.**
`engine/tsconfig.json:9` (`"noUncheckedIndexedAccess": false`) ; relancé avec l'option : **71 erreurs** (layout 29, model
11, tip 7, graph 7, tables 5, shell 5, main 3, structures 1, inspect 1, icons 1, dom 1). Les 29 de `layout.ts` sont du
bruit (tableaux typés indexés par rang) ; les autres désignent les mêmes endroits que les casts : `graph.ts:59`
(`state.positions.get(h) as Point`, lu par `placeLink`, `midpoint`, `screenPoint`, `moveNode:227` : une position absente
devient `TypeError: Cannot read properties of undefined (reading 'x')`), `graph.ts:299-301` (`linkAt(Number(link)).id`,
`model.beams[Number(beam)].id` : un `data-*` hors bornes plante de la même façon), `graph.ts:308-311` et `369-382`
(`linkOf(...) as ModelLink`…), `model.ts:610` (`beamById.get(id) as Beam`), `model.ts:775-791` (cinq casts dans
`hostsOf` / `tokenOf`), `tables.ts:228` (`model.diff as Diff` : `diffView` appelé sans diff plante sur `d.summary`),
`main.ts:20` (`byId` rend `HTMLElement` même pour `null`), `main.ts:165-236` (sept `graph as Graph`, deux `as string`),
`tip.ts:45-46` (`counts.get(key) as number`), `shell.ts:118,138,140,144,152` (réponses de l'API posées en `Snapshot`,
`RunEntry[]`, `Diff` sans vérification). **Pourquoi c'est un problème.** Ce sont les mêmes plantages qu'en JS (aucune
régression, vérifié), mais le TypeScript ne les a pas fait disparaître : il les a rendus invisibles à `tsc`. Un cast
dit « je sais » ; ici il dit « comme avant ». **Correction.** Garder l'option désactivée (le bruit de `layout.ts` le
justifie) mais remplacer les `as` de lecture par deux aides nommées : `must<T>(value: T | undefined | null, what:
string): T` qui lève `new Error("invariant : " + what)`, et `expect<T>(value: unknown, guard: (v: unknown) => v is T)`
pour les réponses de l'API ; les casts restants (DOM, `kind as SelectionKind`) se comptent sur les doigts et se
commentent.

**M3 — Le `ref` d'un changement et d'un événement est une union à six sortes dans `diff.ts`, et le moteur le recadre à
la main dans dix casts.** `engine/src/contracts/diff.ts:365-369` et `1011-1016` (`ref: NodeRef | InterfaceRef |
LinkRef | AggregateRef | ClusterRef | MlagDomainRef`) ; `model.ts:539-554` (six casts, un par section),
`tables.ts:194,205,217,220,223,231,232,234` (huit de plus). **Pourquoi c'est un problème.** Le schéma Pydantic publie un
seul `$defs/EntityChange` partagé par les six sections : le type généré est fidèle au schéma, mais le schéma ne dit pas
ce que le contrat refuse (`change_ref_kind_mismatch`, partie C). Le moteur comble par des casts, qui ne vérifient
rien : un `ref` de la mauvaise sorte donnerait `undefined` dans une clé d'index, en silence. C'est un typage **imprécis
par rapport au contrat**, pas faux. **Correction.** Soit au contrat : un modèle de changement par section
(`NodeChange { ref: NodeRef }`…), ce qui précise aussi `CONTRAT.md` ; soit au moteur : une seule aide
`refOf(change, "node")` qui vérifie `ref.kind === kind` et lève sinon, utilisée par `indexDiff` et par les tables (les
dix casts disparaissent). La première option est la bonne si B4 ajoute des sections ; la seconde suffit aujourd'hui.

**M4 — Le test de dérive a trois verdicts selon l'environnement, et sa cause peut être hors du backend : démontré en
direct.** `test_render.py:307-311` : sauté sans `engine/node_modules/esbuild`, vert sinon, rouge dès qu'un schéma de
`contracts/` change sans `npm run types`. `engine/types.mjs:11-15` listait `intent-v1.schema.json` **avant qu'il
existe** (ligne 45 : « un contrat pas encore écrit : rien à générer »). À 18:25, le travail parallèle a créé ce schéma ;
à 18:26, `uv run pytest tests/test_render.py -k built_viewer_matches` : **FAILED, « types désynchronisés :
…/engine/src/contracts/intent.ts »**, alors que ni le backend ni le moteur ne consommaient encore ce contrat ; à 18:28,
`intent.ts` généré, vert. **Pourquoi c'est un problème.** (a) Une personne sans Node voit la suite backend verte avec
un `viewer.js` périmé ; une personne avec Node la voit rouge pour un schéma que la toile ne lit pas ; le README
backend ne dit ni l'un ni l'autre. (b) Le message de `types.mjs` donne le chemin mais pas la commande (`build.mjs`
dit « lancer `npm run build` »). (c) La condition de saut ne regarde qu'`esbuild` : un `node_modules/` partiel (sans
`json-schema-to-typescript`) fait échouer `types.mjs` au lieu de sauter. **Correction.** Ne lister dans `CONTRACTS`
que les contrats que `engine/src` importe (le cas `intent` est maintenant consommé, la règle reste) ; condition de saut
sur les trois paquets (`esbuild`, `typescript`, `json-schema-to-typescript`) ; message « lancer `npm run types` dans
engine/ » ; une ligne dans `backend/README.md` § Tests : « sans `npm install` dans `engine/`, la dérive de `viewer.js`
n'est pas vérifiée (test sauté) ».

**M5 — La structure d'`engine/` ne suit pas encore ses propres coutures, et c'est le moment de les nommer.**
(a) `canvas/dom.ts:50-134` : la fabrique SVG `s()` et `clear()` sont de la toile, mais `h()`, `pill*`, `definition`,
`table`, `plain`, `brief`, `elapsedText` sont les widgets HTML de l'inspecteur et des tables : du shell dans `canvas/`
(le README annonce « canvas/ : la toile proprement dite, sans rien de la page »). (b) `canvas/types.ts:45-52` :
`IngestFinding`, `IngestData`, `CatalogueEntry`, `PageData` décrivent ce que la **page** embarque, pas le modèle.
(c) Cycle d'import `shell/inspect.ts:10` ↔ `shell/structures.ts:9` (`checkList` d'un côté, les panneaux de l'autre) :
esbuild le tolère, mais c'est le signe que `checkList` est un widget à part. (d) B6 « scène, LOD 3 paliers » n'a pas de
module : les trois paliers vivent dans `graph.ts:70-73` (`zoom-far` / rien / `zoom-near`) ; B9 porte B6. (e)
`tables.ts:68,267-270` : `setChecksSeverity` est un état mutable sur l'objet exporté, posé à l'exécution par
`checksView` ; `main.ts:18` : `TABS` est un `let` de module. **Pourquoi c'est un problème.** Le portage « tel quel » est
la bonne décision, et aucun de ces points ne change le rendu ; mais `engine/` est maintenant la base de la toile, de B4
et du shell React, et ces coutures seront plus chères à couper après. **Correction** (un commit à part, sans toucher au
comportement) : `shell/widgets.ts` (h, pills, definition, table, plain, brief, elapsedText) et `canvas/dom.ts` réduit à
`s`, `clear`, `fill` ; `shell/page-data.ts` pour les types de la page ; `shell/checks.ts` pour `checkList` (casse le
cycle) ; `setChecksSeverity` rendu par `checksView` plutôt que posé sur l'objet. Pas de module B6 tant que le LOD tient
en quatre lignes : le dire dans le README.

**M6 — La documentation n'a pas suivi le portage.** `backend/README.md:317,415,431,437,457,490` citent `dom.js`,
`tip.js`, `geometry.js`, `icons.js`, `layout.js`, `shell.js` comme s'ils existaient (`:490` : « le visualiseur plus
`shell.js` ») ; `:208` dit « 46 tests du visualiseur » (50). `CLAUDE.md` n'a pas d'entrée de journal pour la brique
(règle « annoncer avant de coder, documenter en finissant » ; la dernière entrée est B3), et le § Repo ne mentionne
pas `engine/`. `QUICKSTART.md` et `backend/README.md` § Tests ne disent pas que Node et `npm install` dans `engine/`
sont nécessaires pour que la suite vérifie la dérive (voir M4). **Correction.** Remplacer les six références par
`engine/src/...ts` ; « 50 » ; une entrée de journal (décision ③ prise : la page devient `engine/`, portage tel quel,
`viewer.js` versionné, test de dérive, revue) ; `engine/` dans § Repo ; une phrase sur Node dans les deux guides.

## Bas

**B1 — `name in HANDLERS` regarde aussi le prototype.** `canvas/dom.ts:10,22` : `HANDLERS` est un objet littéral, et
`"constructor" in HANDLERS` est vrai ; les noms d'attributs viennent du code, jamais de la donnée, donc sans effet
aujourd'hui. L'ancien `dom.js:15-18` comparait quatre chaînes. **Correction.** `Object.hasOwn(HANDLERS, name)` ou une
`Map`.

**B2 — Chaîne de build : quatre petites choses.** (a) `engine/README.md:60` recommande `npm install` ; pour un
`package-lock.json` versionné, `npm ci` est la commande reproductible (elle refuse un lock désaccordé au lieu de le
réécrire). (b) Aucun `engines` dans `package.json`, aucun `.nvmrc` : `node --test` demande Node ≥ 18, `build.mjs` un Node
avec `await` de premier niveau ; le dire. (c) `.gitignore:21` ignore `engine/.tsbuildinfo` que rien ne produit
(`tsconfig` sans `incremental`). (d) `engine/README.md:69` dit « sauté si Node ou `node_modules/` manquent » ; la
condition réelle est `node_modules/esbuild` (M4-c). **Correction.** `npm ci` dans le README ; `"engines": { "node":
">=20" }` ; retirer la ligne morte ou passer en `incremental` ; aligner le README.

**B3 — Les types de l'API sont écrits à la main, à côté des contrats générés.** `shell/apps.ts:8-9` (`ShellState`,
`RunEntry`) et `canvas/types.ts:45-50` (`IngestFinding`, `IngestData`) recopient `backend/src/ld_backend/schemas.py`
(`RunEntry`, `IngestFinding`, `IngestReport`) ; ils sont justes aujourd'hui (vérifié champ à champ, `details:
dict[str, str | int]` compris) mais hors du circuit `types.mjs`, donc sans test de dérive. Au passage, `NodeRef`,
`JsonValue` et les autres `$defs` partagés existent en deux exemplaires, un par fichier généré (`snapshot.ts` et
`diff.ts`), structurellement identiques tant que les deux schémas le restent. **Correction.** Plus tard, générer les
types de l'API depuis `/openapi.json` (le backend l'expose déjà, les trois contrats y sont) ; en attendant, un
commentaire « recopie de `schemas.py`, à tenir à jour » sur les deux blocs.

**B4 — `samples/page.html` est hors suivi, porte l'ancien script, et n'est pas ignoré.** Fichier du 2 octobre
(178 919 octets, données `infra-lab` de la fixture, donc synthétiques), non suivi, non couvert par `.gitignore:14`
(`/*.html` ne vaut qu'à la racine). Un `git add -A` le versionnerait avec les douze modules JS que le portage vient de
retirer. **Correction.** L'ignorer (`samples/*.html`) ou le régénérer et le versionner sciemment.

**B5 — Tests : trois détails.** (a) `test_view.py:42` affirme la présence de la chaîne `TOKEN_KEY = "ld-api-token"` :
une chaîne de l'implémentation, fragile au renommage, qui dit « le code de la coquille est là » mais pas « il est inerte
sans snapshot » ; `viewer.test.js:77` (`LD.shellApp === undefined`) dit la seconde chose, c'est elle qui compte.
(b) `test_render.py:206-216` scanne aussi `engine/src/contracts/*.ts`, c'est-à-dire des commentaires copiés depuis les
descriptions des contrats : une description qui contiendrait « javascript: » ou « eval( » ferait échouer un test de
sécurité pour une raison étrangère à la page ; `viewer.js` ne contient pas ces commentaires. (c) La page autonome
contenant maintenant la coquille, le seul garde-fou contre un `fetch` est `default-src 'none'` : il est affirmé
(`test_render.py:227`) et un `fetch` refusé apparaîtrait dans le journal Chromium que les tests lisent (« Refused »),
mais aucun test ne le provoque. **Correction.** (a) Remplacer par une assertion exécutée (la page servie expose
`LD.shell.TOKEN_KEY`). (b) Scanner `src/canvas`, `src/shell`, `src/index.ts` et `viewer.js`, pas `src/contracts`.
(c) Un test Node : page autonome chargée avec un `fetch` compteur, zéro appel.

**B6 — Quatre divergences silencieuses, toutes vers plus de robustesse, aucune testée.** (a) `graph.ts:393-395` :
une sélection d'agrégat dont l'entité n'existe pas ne plante plus (`graph.js:360` déréférençait `null`). (b)
`inspect.ts:22` : `diffBlock` rend `null` sans `model.diff` (`inspect.js:17` lisait `model.diff.before`). (c)
`shell.ts:139-140` : un rapport `200` dont le corps n'est pas un objet donne `ingest: null` (`shell.js:130` fabriquait
`{summary: undefined, findings: []}`). (d) `main.ts:252` : un `#ld-data` vide donne « Unexpected end of JSON input »
au lieu de « Cannot read properties of null ». Aucun de ces chemins n'est atteignable depuis la page produite par le
backend (vérifié : `reveal` n'est appelé qu'avec des sélections validées par `selectionFromToken` ou issues des tables ;
les fantômes n'existent qu'avec un diff ; l'API répond en objet). Au passage, `inspect.ts:259` réexporte `EndLike` sans
raison. **Correction.** Rien à corriger ; les consigner dans l'entrée de journal (« portage fidèle, quatre durcissements
sur des chemins morts ») pour que la prochaine revue ne les redécouvre pas, et retirer le réexport.

**B7 — Fonctions longues héritées, et une anticipation.** `graph.ts:47-484` : `create` fait 437 lignes (450 avant ;
découpage parqué le 2026-10-02, B6 de cette revue-là, limite assouplie par Orhan) ; `main.ts:145-246` : `boot` 104
lignes (109 avant). Tous les fichiers sont sous 500 lignes. `types.mjs:14` nommait `intent` avant que le contrat
existe (M4) ; il est consommé depuis 18:32, la remarque devient sans objet mais la règle « on liste ce qu'on importe »
mérite un commentaire. **Correction.** Rien dans ce portage ; `create` se découpera avec B4 (épingles), qui va le
toucher de toute façon.

## Vérifié et trouvé correct

- **Fidélité, module par module.** `dom` (aplatissement récursif ≡ `flat(Infinity)`, `fill` identique, labels
  identiques) ; `geometry` (formules, ancrage, `hull`, `beamWidths`, étiquettes) ; `icons` (`path(null)` → « other »,
  `known` par `hasOwnProperty`) ; `layout` (spirale, arêtes dédoublonnées triées, pas, épingles, étagère ; mêmes
  `Float64Array` / `Int32Array`) ; `model` (`buildLinks` avec `indexInPair` / `pairCount` initialisés puis posés,
  fantômes, `interfaceAt`, `indexDiff` explicite ≡ table de clés, `distributeChecks`, `sourceCombos` tri par compte puis
  combo, `selectionFromToken` avec bouts inversés) ; `graph` (couches, `svgClasses` LOD, glissé / panoramique / annulé,
  survol, molette, `relatedTo`, `reveal`) ; `tip` (colonnes mesurées, placement dans le canevas, six lignes de contrôles
  puis compte) ; `inspect`, `structures`, `tables` (mêmes textes, mêmes en-têtes, mêmes `empty`, `asEntry` n'ajoute
  qu'un `index` que `checkRows` ne lit pas) ; `main` (en-tête, pastilles, barre d'outils, légende, onglets, adresse
  lue / écrite, `VIEWS` ≡ `LD.tables[id + "View"]`) ; `shell` (jeton, liste, ouverture, diff indisponible dit dans
  `origin`, adresse réécrite sans jeton).
- **Espace de noms `LD`.** Mêmes modules, mêmes clés, `LD.app` / `LD.shellApp` posés sur le même objet (`apps`),
  `LD.boot` et `LD.shell` présents ; `fakedom.js` lit toujours `<script id="ld-viewer">` et `context.LD`.
- **Chaîne de build.** esbuild 0.28.2, typescript 5.9.3, json-schema-to-typescript 15.0.4 figés à la version exacte ;
  lock v3 avec intégrité et les 26 binaires de plateforme (un `npm ci` sur une autre machine prend la même version) ;
  `absWorkingDir` : commentaires de modules relatifs, zéro chemin absolu ; `charset: utf8` (le français reste
  lisible) ; `legalComments: none` ; non minifié (le `viewer.js` versionné se relit et se diffère) ; `--check` lit le
  fichier versionné sans l'écrire ; `.gitattributes` force LF sur `*.ts`, `*.mjs`, `*.js`, `*.json` (le lock
  compris) ; `node_modules/` ignoré à toute profondeur ; `tsconfig` strict, `types: []` (aucune API Node ne peut
  entrer dans la page), `lib DOM`, `isolatedModules`.
- **`types.mjs`.** Les titres de propriétés retirés et les `$ref` décrits ramenés à la référence : aucun alias numéroté
  (`Hostname1`…) dans les deux fichiers générés (vérifié par `grep`) ; `additionalProperties: false` et
  `strictIndexSignatures` ; `Endpoint.interface: string`, `RemoteRaw.port: string | null`, `Check.details` en
  `JsonValue` : le modèle de lecture (`EndLike.interface?: string | null`) couvre bien le témoin, le `remote_resolved`
  et les bouts cités dans `details`.
- **Sécurité.** `page.py` : mêmes trois garde-fous, même CSP (`default-src 'none'; script-src 'sha256-…'; style-src
  'sha256-…'; base-uri 'none'; form-action 'none'`, plus `connect-src 'self'` pour la coquille seule) ; un seul bloc
  script, empreinte vérifiée (`test_view.py:37-40`, `test_render.py:218-228`) ; `test_the_viewer_never_writes_html_from_data`
  lit bien `engine/src/**/*.ts` **et** `viewer.js` (assertion « > 10 fichiers » qui empêche un glob vide), les douze
  mots interdits absents des deux ; aucun style en ligne (les 21 rendus Chromium sans « Refused ») ; la coquille dans
  la page autonome ne démarre pas (`viewer.test.js:77`) et, même démarrée, ne pourrait joindre personne
  (`default-src 'none'` sans `connect-src`) ; la page reste aussi sensible que le bundle, ni plus ni moins (le code de
  la coquille n'embarque aucun secret).
- **Tests.** `test_render.py` : chemins `ENGINE` / `VIEWER` justes (`parents[3]` = racine du dépôt), test de dérive avec
  délai de 120 s et sortie tronquée lisible ; `test_view.py` : empreintes, `connect-src` ; `viewer.test.js` : une
  assertion ajoutée, les 49 autres intactes et vertes des deux côtés ; les trois rendus Chromium inchangés et verts.
- **`page.py` / `shell.py`.** Changement minimal : `JS_FILES = ("viewer.js",)`, `SHELL_SCRIPTS = JS_FILES` ; `build.py`,
  `cli.py`, `api.py` non touchés par le portage (ils l'ont été ensuite par le travail parallèle, hors revue).

## Synthèse

| Sévérité | Nombre | Points |
|---|---|---|
| Critique | 0 | — |
| Haut | 1 | H1 aucun test ne vérifie les types (esbuild ne les lit pas) |
| Moyen | 6 | M1 double analyse JSON de la page autonome (2 × 16,4 Mo à la jauge) ; M2 casts qui tiennent lieu d'invariants, `noUncheckedIndexedAccess` off ; M3 `ref` en union à six sortes, dix casts ; M4 test de dérive à trois verdicts, rouge démontré sur `intent` ; M5 coutures d'`engine/` (dom.ts mixte, types de page, cycle, B6, état mutable) ; M6 documentation périmée ou absente |
| Bas | 7 | B1 `in` sur un littéral ; B2 chaîne de build (npm ci, engines, tsbuildinfo, README) ; B3 types de l'API à la main, `$defs` dupliqués ; B4 `samples/page.html` ; B5 tests (chaîne d'implémentation, scan des générés, fetch non provoqué) ; B6 quatre durcissements silencieux ; B7 fonctions longues héritées |

**Décompte : 0 critique, 1 haut, 6 moyens, 7 bas.**

**Défauts purs (à corriger sans discussion)** : H1, M1, M4-b/c, M6, B1, B2, B4, B5-a/b.
**À annoncer avant de corriger** : M2 (aides `must` / `expect` : une convention de code pour tout `engine/`), M3 (schéma
par section ou aide de recadrage : touche le contrat Diff ou seulement le moteur), M5 (découpage d'`engine/` : un commit
à part, avant B4 ou avec), B3 (génération des types de l'API depuis OpenAPI : plus tard).

**Appréciation.** Le portage est fidèle au sens le plus fort que je sache vérifier : DOM, bulles, placement, modèle et
captures identiques à l'octet sur sept pages, trois adresses, des dizaines d'interactions et la page à la jauge, et
aucune divergence de comportement trouvée par lecture hors quatre durcissements sur des chemins morts. Ce qui manque
n'est pas dans le code porté mais autour : la garantie « strict » n'est tenue par aucun test, la page autonome paie une
analyse JSON de trop, et les coutures du nouveau paquet sont celles de l'ancienne page. Base saine pour B4, à condition
de brancher `tsc` dans la suite avant d'y écrire la première ligne nouvelle.

## Ce qui est bien et à garder

- **Un fichier construit, versionné, et Python qui ignore Node** : la bonne frontière ; le test de dérive est la seule
  manière honnête de versionner un artefact construit, et il lit le fichier sans l'écrire.
- **Le portage tel quel, sans « améliorer en passant »** : c'est ce qui rend la sonde C possible et concluante ; les
  quatre durcissements sont les seules libertés prises, et elles sont défendables.
- **Les types des contrats générés depuis les schémas, jamais écrits à la main**, avec un ménage de titres qui évite les
  alias parasites et un `--check` qui tient le moteur accroché au contrat.
- `canvas/types.ts` : le modèle de lecture typé au-dessus des contrats (`ModelLink`, `Beam`, `Cluster`…) est la première
  spécification écrite de ce que la page indexe ; `tsc` à zéro erreur en mode strict sur 2 400 lignes portées en une
  session.
- Le `viewer.js` **lisible** (non minifié, commentaires de modules, noms conservés) : un diff de `viewer.js` dans une
  revue dit ce qui a changé.

---

## Suivi

À tenir ici par l'auteur, point par point, à mesure des corrections (format des rapports précédents : « traité / parqué /
tranché par Orhan », état des tests après traitement).

Traitement le 2026-10-04 (soir), en une passe avec la revue de B4 (qui lisait les mêmes fichiers). État après traitement :
contracts 601 tests, backend 450, 62 tests sous Node, `tsc` strict propre, `build.mjs --check` et `types.mjs --check`
verts, ruff propre.

- **H1 — traité.** `test_the_built_viewer_matches_the_engine_sources` lance maintenant `tsc --noEmit -p engine`, puis
  `build.mjs --check`, puis `types.mjs --check` ; `npm run check` fait les trois. Une erreur de type fait échouer la suite.
- **M1 — traité.** `index.ts` lit le bloc `#ld-data` une seule fois et le passe à `startPage(data)` ou `startShell(data)` ;
  les deux `autostart` qui relisaient le bloc ont disparu. Test Node : la page autonome n'appelle jamais `fetch` (B5).
- **M2 — parqué, motivé.** `noUncheckedIndexedAccess` reste désactivé (72 erreurs mesurées) : le portage est fidèle au
  JS d'origine, dont les invariants d'index sont ceux-là ; les activer d'un coup ajouterait des `!` sans ajouter de
  sûreté. À reprendre module par module quand B5-B9 évoluent (le premier module réécrit l'active). Les casts les plus
  parlants ont été retirés (M3).
- **M3 — traité.** `model.ts` (`indexDiff`) et `tables.ts` (lignes du diff, événements, couverture) narrowent `ref.kind`
  par un garde et ignorent une référence d'une autre sorte ; plus aucun `as NodeRef` / `as LinkRef`… sur les références.
- **M4 — traité.** Le test de dérive est sauté si Node ou l'un des trois outils (`typescript`, `esbuild`,
  `json-schema-to-typescript`) manque dans `node_modules/`, et son message d'échec donne la commande à relancer. La cause
  « schéma créé par un travail parallèle » était l'état transitoire de la session, pas un défaut du test.
- **M5 — traité pour l'essentiel.** `canvas/dom.ts` ne garde que la fabrique (`h`, `s`, `clear`) ; les libellés et formats
  sont dans `canvas/format.ts`, les widgets HTML dans `shell/widgets.ts` (`LD.dom` reste composé des trois pour les
  tests) ; la liste des contrôles vit dans `shell/checks.ts`, partagée par l'inspecteur et les structures : le cycle
  `inspect ↔ structures` est rompu ; `TABS` est local à `boot` ; `tables.setChecksSeverity` est devenu une poignée rendue
  par `checksView`. Parqués : B6 (LOD) sans module (dans `graph.ts`, à extraire avec la scène), les types de la page dans
  `canvas/types.ts` (c'est l'entrée du moteur ; à déplacer quand le shell sera un paquet).
- **M6 — traité.** README backend (arborescence, toile, Node nécessaire aux tests, vérifier), `CLAUDE.md` (entrée de
  journal, `engine/` dans § Repo), `QUICKSTART.md` § 6, `engine/README.md`.
- **B1 — traité.** `HANDLERS` est une `Map`.
- **B2 — traité.** `npm ci`, `engines.node >= 20`, `.tsbuildinfo` retiré du `.gitignore`, condition de saut décrite
  exactement dans le README.
- **B3 — parqué.** Les trois formes de l'API lues par la page restent écrites à la main (`RunEntry`, `IngestFinding`,
  `IngestData`) ; un générateur depuis `/openapi.json` viendra quand le shell lira plus de formes. Les `$defs` partagés
  dupliqués entre `snapshot.ts` et `diff.ts` sont inhérents à une génération par schéma.
- **B4 — traité.** `samples/*.html` ignoré.
- **B5 — traité pour deux points sur trois.** L'assertion sur `TOKEN_KEY` a disparu (la CSP et les tests Node de la
  coquille servie tiennent la garantie) ; test Node « la page autonome n'appelle jamais `fetch` ». Le scan de sécurité lit
  aussi les commentaires des types générés : conservé, c'est un faux positif possible, jamais un faux négatif.
- **B6 — traité.** Réexport `EndLike` retiré ; les quatre durcissements restent (des gardes, pas des comportements).
- **B7 — parqué.** `create` (graph) et `boot` restent longs ; `boot` a perdu le câblage de l'intention, parti dans
  `intent.ts` (`createIntentHost`).
