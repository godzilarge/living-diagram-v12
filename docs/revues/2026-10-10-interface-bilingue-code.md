# Revue indépendante — interface bilingue (lots 1 à 8), relecture du code — 2026-10-10

Rapport rendu par l'agent de revue de code (audit demandé par Orhan à la livraison de la fonction), consigné tel quel
avant toute correction. Sonde Chromium rejouable : `sondes-2026-10-10-interface-bilingue/test_probe_lang.py`
(`cd backend && PYTHONPATH=. uv run pytest ../docs/revues/sondes-2026-10-10-interface-bilingue/test_probe_lang.py`).
Un second rapport (usage dans un navigateur) est consigné à part : `2026-10-10-interface-bilingue-usage.md`.

---

## Synthèse

En une phrase : **le socle tient (catalogues alignés, pluriels CLDR, codes d'API, `/view` resté en français), aucun
défaut critique ni haut ; mais la promesse « aucune chaîne française en dur » et « tout texte suit un changement de
langue » n'est pas tenue** : une chaîne française est livrée en anglais et le détecteur `strings.mjs` ne la voit pas, et
une bascule de langue laisse du texte dans l'ancienne langue (vérifié dans Chromium).

Vérifié et vert : `npm run check` (tsc strict, dérive build/types, `strings.mjs --check`), `node --test
tests/js/i18n.test.js` (8 tests), `pytest` sur `test_problems.py`, `test_i18n_checks.py`, `test_journal.py`,
`test_api*.py`, `test_openapi.py`, `test_render.py`, et le test Chromium anglais de `test_app.py`.

Ce qui est bien fait : noyau sans React qui n'embarque que `common` fr pour `/view` ; `labelMap` paresseux ; parité
testée via `Intl.PluralRules` (le `_many` du français) ; règle « pas de `{{count}}` hors pluriel » testée ;
`skipOnVariables` (vérifié : un nom saisi `$t(...)` ou `{{count}}` n'est ni interprété ni imbriqué) ; registres
`problems.py` ↔ catalogues tenus par un test ; cache de recherche avec la langue dans la clé ; formateurs `Intl` en
cache par locale ; aucun `innerHTML` dans `src/`.

---

## Constats

### M1 (moyen) — `strings.mjs` laisse passer du français, et une chaîne fuit déjà
**Où** : `engine/strings.mjs:15-16` ; preuve : `engine/src/app/state/journal-commands.ts:81`.
**Quoi** : le détecteur ne reconnaît que les lettres accentuées et une liste fermée de mots outils. Angles morts : mot
français seul sans accent (`toutes`, `Diagramme`, `supprimer`, `masquer`, `nom`), mot outil absent de la liste (`au` :
« retour au journal » passe), typographie française (`" : "`, `« »`). **Preuve livrée** : `journal-commands.ts:81` écrit
`filters.infrastructure === "*" ? "toutes" : …` — la chaîne part dans le bundle et `strings.mjs --check` passe.
**Sonde** :
```
cd engine && node -e 'import("./strings.mjs").then(({looksFrench})=>{for (const s of ["toutes","retour au journal","Diagramme"," : "]) console.log(s, looksFrench(s))})'
# → false ×4
```
**Correctif suggéré** : construire au chargement le lexique « mots présents dans `locales/fr/*.json` et absents de
`locales/en/*.json` » (≥ 3 lettres) et signaler toute chaîne livrée contenant un de ces mots (mot entier) ; ajouter `au`
et la règle `\s[:;!?]\s|«|»`.

### M2 (moyen) — un changement de langue ne garantit pas le re-rendu, et des textes rangés dans l'état restent dans l'ancienne langue
**Où** : `engine/src/app/components/Shell.tsx:97-101` (`setLanguage` dans un `useEffect`), `engine/src/app/state/store.tsx:296`
(`setPrefs`) ; `engine/src/app/api/client.ts:49-58`, `engine/src/app/state/reducer.ts:25,35,38` (textes rangés) ;
affichés par `engine/src/app/components/TopBar.tsx:65-68`.
**Quoi** — deux mécanismes :
1. `setLanguage` est appelé dans un effet, donc *après* le rendu déclenché par `dispatch({type:"prefs"})`. Seuls les
   composants qui écoutent `useTranslation` se redessinent sur `languageChanged` ; ceux qui lisent le `t` du noyau sans
   le hook (`Shell` : zone `#live`, pastille « retour au journal » ; `Toast` ; `ContextMenu` ; `Canvas`) restent dans
   l'ancienne langue jusqu'au prochain `dispatch`. **Vérifié dans Chromium** (fr-FR, `infra-lab`) : sélection de
   `sw-core-01`, menu, choix English → la barre dit `Diagram`, mais `#live` vaut encore
   `'équipement sw-core-01 sélectionné'` (menu ouvert, 1 s après).
2. Des messages sont rangés dans l'état comme texte déjà traduit : `run.warnings` (diff / intention / placement / runs
   indisponibles), `runsMessage`, `run.failed.message`, `journal.failed.message`. Un navigateur français ouvre une run
   dont le diff est indisponible : « diff indisponible : … » ; passer en anglais : l'avertissement reste en français
   jusqu'au rechargement de la run. Contredit la règle écrite dans `engine/README.md` § La langue (« un texte rangé dans
   l'état se range sans langue […] il suit un changement de langue »).
**Correctif suggéré** : appeler `setLanguage` (et poser `document.documentElement.lang`) **dans `setPrefs`, avant le
`dispatch`** ; ranger avertissements et échecs comme `{ key, values }` (ou statut + corps) et appeler `explain` à
l'affichage (patron de `history.Label`) ; ajouter au test Chromium anglais une assertion sur `#live` et sur un
avertissement après bascule.

### B1 (bas) — le nom du fichier CSV est en français en anglais
**Où** : `journal-commands.ts:81` → `journal-csv.ts:42-47`. La vue « Toutes » passe le littéral `"toutes"` comme `scope`,
le repli `t("journal:csv.all")` n'est jamais atteint (code mort de fait).
**Sonde** : `LDApp.i18n.setLanguage("en"); LDApp.journalCsv.csvName("toutes", new Date(2026,9,10,9,5))` →
`journal-toutes-20261010-0905.csv`.
**Correctif** : passer `""` (ou `"*"`) et laisser `csvName` faire `t("journal:csv.all")` ; test du cas `*` dans les deux
langues.

### B2 (bas) — typographie française en dur dans le code livré
`engine/src/app/components/journal/Row.tsx:157` (`<> :<Hosts…` → en anglais « placed 3 devices : ») ;
`engine/src/app/ui/inspector.tsx:320, 337, 368` (`label + " : " + …`, en anglais « default : blue ») ;
`engine/src/app/components/TopBar.tsx:68, 104` (`" : "` et `" ; "` dans les textes pour lecteur d'écran).
**Correctif** : le catalogue a déjà `journal:fieldsSep` (`": "` en, `" : "` fr) ; ajouter une clé `common:colon` (ou
équivalent) et l'utiliser partout ; la règle de M1 les détecterait.

### B3 (bas) — `subjectLabel` traduit un nom saisi
**Où** : `engine/src/app/state/journal-text.ts:76-80`. Tout morceau de libellé (découpé sur `" → "`) égal à l'un des huit
mots français du serveur est traduit, y compris un nom choisi par l'utilisateur. Dans un registre d'audit, cela
contredit la règle « le nom saisi ne se traduit jamais » qu'affirme le test Node.
**Sonde** : un groupe nommé « point libre » par l'utilisateur, `group_delete`, en anglais → `"deleted the group free point"`.
**Correctif** : le serveur marque structurellement le nom d'un objet sans nom (`subjects[].unnamed: true`, ou morceaux
typés `[{unnamed:"group"}, {text:"sw-1"}]` pour un bout de connecteur) et la page ne traduit plus par comparaison de
texte. Contrat de la réponse du journal : champ ajouté (additif).

### B4 (bas, accessibilité) — textes de React Flow en anglais dans la page française
**Où** : `engine/src/app/canvas/Flow.tsx:148, 159, 166` (arêtes sans `ariaLabel`), avec `edgesFocusable={false}`
(ligne 562). React Flow pose alors `role="img"` + `aria-label="Edge from X to Y"` sur **chaque** câble, faisceau,
étiquette et vitesse, et `aria-roledescription="node"` / `"edge"` en anglais. `strings.mjs` ne scanne que `src/` et ne
peut pas le voir. **Vérifié dans Chromium (page fr)** : `["img","Edge from fw-edge-01 to sw-core-01","edge"]` ×15 sur
infra-lab ; roledescription des nœuds = `"node"`.
**Correctif** : `ariaLabel: t("shell:canvas.cable", {a, b})` sur les câbles ; `domAttributes: {"aria-hidden": "true"}`
sur les arêtes décoratives (étiquettes, vitesses) ; `domAttributes: {"aria-roledescription": t(…)}` sur nœuds et
arêtes (React Flow les étale après ses propres attributs).

### B5 (bas) — `<noscript>` en français pour tout le monde
**Où** : `backend/src/ld_backend/render/app.py:47-48`. Un navigateur anglophone sans JavaScript lit « Cette application a
besoin de JavaScript… ». La page est servie `lang="fr"` (défendable : le script la corrige), mais le `noscript` n'a pas
de script.
**Correctif** : une phrase par langue, chacune avec son `lang`.

### B6 (bas) — 422 dont le code de champ est inconnu : la raison se perd ; aucune garde contre une collision de codes
**Où** : `engine/src/shell/http.ts:58-63`, `backend/src/ld_backend/bodies.py:71-82`.
- Pour un code du contrat (`patch_after_update`…) ou de Pydantic (`missing`, `too_long`), la page n'affiche que
  « corps de requête invalide » / « invalid request body » : `errors[0].message`, seule explication (en français pour
  le contrat), est jeté. Sonde : `problemText({code:"invalid_body", errors:[{code:"patch_after_update", message:"…"}]})`
  → `"corps de requête invalide"`. Pas une régression (avant le lot 7, seul `detail` était lu).
- `ownText("field", …)` cherche le code de champ dans `common:http.field` sans savoir s'il vient de l'API, du contrat
  ou de Pydantic. Si demain le contrat lève `PydanticCustomError("too_many_pins", …)` sans `params.limit`, la page
  écrira « plus de {{limit}} épingles ». Aucune collision aujourd'hui (vérifié : aucun code de `FIELD_CODES` dans
  `contracts/src`), mais aucun test ne l'interdit.
- `json_invalid` insère la raison anglaise de l'analyseur JSON dans la phrase française (« JSON invalide : Expecting
  value (ligne 1) »).
**Correctif** : en repli, ajouter le chemin du champ et, en français, son `message` ; un test qui croise les clés de
`FIELD_CODES` avec les codes du contrat (`PydanticCustomError` dans `ld_contracts`, `intent/codes.py`) et refuse toute
intersection.

### B7 (bas) — faits du Journal : valeurs de style brutes et « 50 % » en anglais
**Où** : `engine/src/app/state/journal-text.ts:213, 217-223`. Sonde : `factsOf({op:"annotation_update",
style:{fill_opacity:50, stroke_style:"dashed"}})` en anglais → `"fill 50 %, border dashed"` : espace avant `%` à la
française, énumérations du contrat (`dashed`, `bold`, `mono`, `top_left`) brutes dans les deux langues, alors que
l'inspecteur les traduit (`cards/style.tsx` `WORDS`, `canvas/groups.ts` `STYLE_LABEL`).
**Correctif** : réutiliser `STYLE_LABEL` / `WORDS` et une clé `common:format.percent`.

### B8 (bas) — la garde « `tsc` refuse une clé inconnue » est contournée par endroits
`journal-text.ts:31` (`tx = (key: string) => t(("journal:"+key) as never …)`, ~60 appels sans typage),
`state/context.ts:21` (clés du menu en `string`), `describe.ts:25`, `checks.ts:9`, `http.ts:51`. Une faute de frappe
dans une clé statique du Journal compile et affiche la clé brute. Vérifié par script : toutes les clés statiques
existent aujourd'hui, les dynamiques sont bornées par des ensembles (`STYLE_KEYS`, `SIDES`, `FORMS`, `CATEGORY_KEYS`) ;
mais la promesse du README est plus forte que la réalité.
**Correctif** : typer `tx(key: ParseKeys<"journal">)` et `item(id, key: ParseKeys<"shell", {}, "context">)` ; garder
`as never` aux seuls préfixes dynamiques, derrière un ensemble fermé.

### B9 (bas) — la garde de dérive serveur ↔ catalogue ne couvre que verbes et noms
**Où** : `backend/tests/test_journal.py:369-389`, `backend/src/ld_backend/journal_words.py`. Le test vérifie le premier
mot de `say.*` et le couple verbe / nom de `batch.*`. `HUE_WORDS`, `TYPE_WORDS`, `FIELD_WORDS`, `CATEGORY_WORDS`,
`KIND_WORDS` ne sont confrontés à aucun catalogue (`common:hue`, `common:type`, `journal:field`, `journal:category`,
`common:annotationKind`). Ils concordent aujourd'hui (vérifié à la main), mais renommer « ciel » ou « ligne de rappel »
dans un catalogue recréerait sans bruit le faux négatif que la règle du 2026-10-10 voulait éliminer.
**Correctif** : un test qui lit ces cinq tables et exige, pour chaque langue, que le texte du catalogue figure dans le
vocabulaire (après `fold`).

### B10 (bas) — formulations anglaises
- `unnamed(s)` (`journal-text.ts:84`) : « deleted the group unnamed », « modified the note empty ». Construction
  française transposée. Correctif : une clé par phrase (« the unnamed group »), ou `unnamedRef.*` comme `ref`.
- `en/panel.json:17` : « {{count}} infos » (*info* est indénombrable).
- `en/journal.json:54` : « returned {{count}} device to their type colour » au singulier.
- `canvas/annotation.tsx:132` : `"image…"` / `"image"` en dur (mot identique dans les deux langues, mais hors catalogue).

---

## Tests manquants (à ajouter avec les corrections)
- Un balayage anglais dans Chromium : ouvrir une run en `en-US`, une fiche de chaque sorte, la vue Contrôle, le Journal,
  la bulle ; refuser toute lettre accentuée du français dans `document.body.innerText` hors données (hostnames, noms
  saisis). Aurait attrapé M1, B1, B2, B4.
- La bascule de langue avec `#live` et un avertissement de barre (M2).
- `csvName` en vue « Toutes » (B1).
- La garde de collision `FIELD_CODES` ∩ codes du contrat (B6).
- Les tables de mots du Journal contre les catalogues (B9).

## Décompte et classement

| Sévérité | Nombre |
|---|---|
| critique | 0 |
| haut | 0 |
| moyen | 2 |
| bas | 10 |

Ordre suggéré : **M2** (setLanguage dans `setPrefs`, puis messages sans langue) → **M1** (lexique des catalogues dans
`strings.mjs`, ferme aussi B1 et B2) → **B4** (lecteur d'écran en anglais : ~1 500 « images » nommées en anglais sur une
grosse infra) → **B3** (nom saisi traduit dans un registre d'audit) → **B6, B9** (gardes de tests) → **B5, B7, B8, B10**
(finitions).

---

## Suivi

Décisions d'Orhan (2026-10-10) : le serveur marque les objets sans nom (B3) ; « sheet » → « panel », « answers » →
« returned » ; « bundle » gardé (terme réseau, « RunBundle » n'apparaît jamais à l'écran). Tout traité le même jour :

- **M1** : `strings.mjs` apprend à chaque lancement le lexique « mots du français des catalogues absents de l'anglais »
  (mots du code exclus : noms d'espaces, clés), la typographie française et `au` ; listes de classes CSS ignorées ;
  garde-fou de bon sens étendu (« toutes », « Diagramme », « nom : x »). A trouvé « toutes » (nom du CSV), corrigé.
- **M2** : `applyLanguage` posé dans `setPrefs` **avant** l'état ; avertissements, échecs de run, de liste et du Journal
  rangés sans langue (`state/said.ts`), écrits à l'affichage. Test Chromium : `#live` et « diff indisponible » suivent la
  bascule dans le même rendu.
- **B1** : le CSV de « Toutes » se nomme `journal-toutes-…` / `log-all-…` (préfixe aussi dans la langue), testé.
- **B2** : ponctuation par le catalogue (`punct.colon`, `punct.semicolon`), plus aucun `" : "` en dur dans l'application.
- **B3** : `subjects[].unnamed` et `subjects[].parts` (ajout seulement) ; la page lit le marqueur, jamais le texte ; deltas
  de purge marqués, anciens relus. Tests serveur et Node (« point libre » saisi reste « point libre »).
- **B4** : rôles des nœuds et des arêtes, nom d'un câble et d'un faisceau dans la langue ; étiquettes et vitesses
  `aria-hidden`.
- **B5** : `<noscript>` dans les deux langues (`lang` sur chaque phrase).
- **B6** : repli d'un 422 avec le chemin du champ ; test de non-collision `FIELD_CODES` ∩ codes du contrat.
  `json_invalid` garde la raison anglaise de l'analyseur (jamais produit par la page).
- **B7** : faits de style du Journal en mots (`STYLE_LABEL`, mots d'annotation), pourcentage par `common:punct.percent`.
- **B8** : `tx(clé: ParseKeys<"journal">)`, huit clés composées derrière `dyn` ; `context.ts` laissé en `string` (ensemble
  fermé).
- **B9** : test « les mots de recherche disent ce que la page montre » (teintes, types, catégories, sortes, champs).
- **B10** : « (unnamed) », « (empty) » en anglais ; « {{count}} info » ; « its type colour » ; image en chargement au
  catalogue.
