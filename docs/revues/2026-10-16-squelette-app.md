# Revue indépendante : squelette `app/` (d3937c3)

**0 critique, 4 hauts, 10 moyens, 10 bas**

Relecteur : agent `relecteur-ui`, qui n'a pas écrit le code. Étalon : `design/comps/shell/` (index.html, home.html,
shell-settings-1440.png), `DESIGN.md`, `docs/12-app-skeleton.md`. Suites rejouées : `npm run check` 34/34,
`npm run e2e` 12/12, `backend/tests/test_next.py` 7/7. `impeccable context` n'est pas installé sur la machine (non lancé).
Sondes : `docs/revues/2026-10-16-squelette-app-sondes/` (en-tête de chaque fichier : comment la rejouer ; les `.mjs`
attendent `vite preview` sur 127.0.0.1:4318).

## Hauts

- **Haut** · `app/src/shell/PrefsControls.tsx:25` · Le popover Réglages (coquille et page vivante) rend thème, accent et langue en `Segmented` (piste ground, segment papier ombré) ; la maquette approuvée `shell-settings-1440.png` les rend en boutons à **rail** (`.btn rail` + `aria-pressed`), avec une pastille de 12 px devant « cobalt » / « encre », en minuscules, Français avant English. Le segment papier est une seconde façon de dire « courant » (One Rail Rule). · `geometrie.mjs` : maquette `radiogroups 0, rails 6, swatches 2` ; coquille `radiogroups 3, rails 0, swatches 0`.
- **Haut** · `app/src/ui/Select.css:33` (et `:41`, `:45`) · Au clavier, l'option active d'une liste n'a aucun anneau (`outline: 0`) ; son seul indice est le fond hover (1,13:1 sur papier) ou, sur l'option choisie, accent-weak (1,08:1) : la position du focus est invisible à l'ouverture. DESIGN.md : anneau 2 px accent au focus clavier. · `clavier-mouvement.mjs` → `listbox: outline "none 0px", background rgb(235,240,254)`.
- **Haut** · `app/tests/guards/primitives-guard.ts:22` · La garde ne regarde `style=` que sur une balise minuscule : `<Button style={s}>`, `<IconButton style={{ width: 40 }}>` passent (et `ButtonProps`, `app/src/ui/Button.tsx:14`, n'omet pas `style`). `dangerouslySetInnerHTML` n'est vérifié par aucune garde alors que `.claude/rules/app.md` le range dans les « interdits mécaniques (testés) ». Un faux bouton `<div role="button" onClick>` passe aussi. · `gardes.test.ts`, bloc « primitives : ce qu'elle laisse passer ».
- **Haut** · `app/tests/guards/tokens-guard.ts:26` · Le lecteur de déclarations exige un `;` final : la dernière déclaration d'un bloc écrite sans `;` n'est pas lue, `.a { color: #ff0000 }` et `border-radius: 3px }` passent. · `gardes.test.ts`, « une déclaration sans point-virgule final ».

## Moyens

- **Moyen** · `app/tests/guards/tokens-guard.ts:13` · `TOKENISED` admet tout `calc(…)` : `font-size: calc(13px)`, `border-radius: calc(3px)`, `box-shadow: calc(4px) calc(4px) calc(8px)` passent ; un dégradé en couleurs nommées (`background-image`) et `fill="red"` dans un attribut SVG aussi ; graisses, interlignes et durées en dur ne sont pas regardés. · `gardes.test.ts`.
- **Moyen** · `app/tests/guards/strings-guard.ts:57` · Un mot visible seul passe s'il n'est pas déjà dans un catalogue : `<span>{"Topology"}</span>`, `{"Bonjour"}`, `label={"Dismiss"}`, `items=[{ label: "Topology" }]`, et deux mots anglais en minuscules (`message={"saved locally"}`). · `gardes.test.ts`, bloc « chaînes ».
- **Moyen** · `app/e2e/audit.ts:147` · La mesure laisse passer, par mutation sur la page vivante : un texte estompé (`opacity: 0.3`), l'anneau de focus supprimé partout, une infobulle collée à 2 px de son contrôle, un second lettrage d'infobulle (`letter-spacing` hors des propriétés comparées), un bord de champ à 1,2:1. Elle refuse bien un îlot à 8 px du bord, deux îlots à 8 px, un second padding d'infobulle, un texte à 2,6:1. Aucun test e2e ne touche le clavier ni `prefers-reduced-motion`. · `mesure-mutations.mjs`.
- **Moyen** · `DESIGN.md` (`line-2`) via `app/src/ui/Field.css:25` et `app/src/ui/Segmented.css:33` · Contours mesurés dans Chromium sous 3:1 (exigés par DESIGN.md, Do's) : bord de champ / papier 1,55:1 clair, 1,83:1 sombre ; segment choisi / sa piste 1,09:1 dans les deux thèmes. Anneau de focus 6,22 / 5,88:1 (conforme). La mesure n'a aucun contrôle de contraste non textuel. · `clavier-mouvement.mjs` → `contours-light`, `contours-dark`.
- **Moyen** · `app/src/ui/Panel.css:76` · Titre de section du panneau à 17 px ; la maquette (`.sec h3`) le pose à 15 px / 600 (DESIGN.md réserve 17 px au nom de l'élément et aux sections du mode focus). · `geometrie.mjs` → `sectionHeading` 15px (maquette) / 17px (page).
- **Moyen** · `app/src/ui/Panel.tsx:24` · L'en-tête du panneau n'a pas l'emplacement de la tuile 40 × 40 (icône du type d'équipement, `.p-head .tile`) de la maquette ; titre en 600 au lieu de 650 (DESIGN.md dit 600 : écart maquette / DESIGN.md non tranché). · `geometrie.mjs` → `panelTitle` ; comparer `shell-1440.png` et `e2e/captures/primitives-*.png`.
- **Moyen** · `app/src/ui/Tooltip.css:14` · Infobulle de 26,4 px (interligne 1,2 × 12 = 14,4 px, jeton `typography.tooltip`) contre 28 px dans la maquette (interligne 16 px, `letter-spacing: 0.005em`) ; la montée de 3 px de la maquette (`translate(-50%, -3px)` → 0) n'existe pas, seul le fondu reste. · `geometrie.mjs` → `tooltip.h` 28 / 26.39.
- **Moyen** · `app/src/ui/Toast.tsx:20` · DESIGN.md (Toast) : se masque seul après 6 s sauf survol, un seul à la fois ; aucune des trois règles n'est portée par la primitive ni testée.
- **Moyen** · `app/src/prefs.ts:44` · La v2 écrit la langue sous `lang`, la v1 la lit et l'écrit sous `language` dans le même `ld-prefs` (même origine) : la langue choisie dans l'une est ignorée par l'autre, et toute écriture de la v1 (`writePrefs` = `JSON.stringify` de ses seuls champs) efface l'accent et la langue de la v2, contrairement à l'en-tête du module (« next to the v1's own fields, which a write keeps »). · `preferences.test.ts` (vert = défaut présent).
- **Moyen** · `app/tests/ui.test.tsx` · Aucune règle de comportement n'est testée en interaction : un contrôle désactivé ou occupé n'appelle pas `onClick`, les flèches de `Rail` / `Segmented` sautent l'option désactivée, `Select` (Entrée, Échap, saisie directe), `Popover` (Échap, clic dehors, retour du focus), infobulle muette quand `aria-expanded`. Le fichier ne fait que du rendu statique. · lecture du fichier.
- **Moyen** · `app/src/ui/Table.tsx:61` · Une ligne cliquable (`onRowClick`) n'est pas atteignable au clavier (`tabIndex -1`, aucun rôle) : la ligne courante ne se choisit qu'à la souris. · `clavier-mouvement.mjs` → `tableRows`.

## Bas

- **Bas** · `app/src/ui/Shortcut.css:6` (et `:11`) · Puce de raccourci en 12 px, bord inférieur 1 px ; maquette `.kbd` 11,5 px, bord inférieur 2 px. · `geometrie.mjs` → `shortcut`.
- **Bas** · `app/src/ui/control.css:69` · Le rail d'onglet est à `bottom: 0`, 1 px au-dessus du filet de l'îlot ; maquette `.tab.rail::after { bottom: -1px; border-radius: 1px 1px 0 0 }`, posé sur le filet. · `geometrie.mjs` → `tab.railBottomFromTab` -1px / 0px.
- **Bas** · `app/src/ui/Popover.tsx:41` · Dans la coquille, le popover Réglages s'aligne sur son déclencheur : bord droit à 1416, soit 24 px du bord de la fenêtre ; maquette : aligné sur l'îlot, 1424 (16 px). · `geometrie.mjs` → `settings.right`.
- **Bas** · `app/src/ui/Segmented.css:46` · Anneau de focus redéfini avec `outline-offset: 0` (jeton : 2 px) : un second état focus. · `clavier-mouvement.mjs` → `segmentFocus.offset`.
- **Bas** · `app/src/ui/Rail.tsx:45` · Un onglet désactivé n'est pas focusable et les flèches le sautent : sa raison (infobulle) est inaccessible au clavier, alors qu'un `IconButton` désactivé reste focusable et la dit. · `clavier-mouvement.mjs` → `disabledTab`.
- **Bas** · `app/src/ui/geometry.ts:9` · 350 / 150 / 200 ms recopiés en dur à côté des jetons `motion.*` ; `--motion-tooltip-delay` est généré et inutilisé ; aucun test ne lie les deux. (Délai réel mesuré : ~360 ms, conforme.)
- **Bas** · `backend/src/ld_backend/api.py:220` · `If-None-Match` comparé à l'égalité stricte : la forme faible `W/"…"`, une liste et `*` rendent 200 ; `HEAD /next/` rend 405. · `test_next_sonde.py`.
- **Bas** · `app/vite.config.ts:12` · La CSP de `vite preview` est une copie littérale de `APP_CSP` ; égales aujourd'hui, aucun test ne les lie (la mesure pourrait tourner sous une autre politique que le backend).
- **Bas** · `app/src/primitives/sections/Surfaces.tsx:55` · La page vivante ne montre pas tous les états promis par docs/12 §4 : panneau large et focus, popover `elevation="layer"`, toasts ok / avertissement, survol de champ, focus de la liste.
- **Bas** · `app/src/ui/Select.tsx:45` · Les libellés de la saisie directe sont figés au montage (`useRef(options.map(…))`, `FloatingList` sans `useListItem`) : des options qui changent gardent l'ancienne saisie directe. · lecture du code.

## Vérifié sans constat

Mouvement réduit : infobulle, rail, popover, panneau à 1 ms, spinner arrêté (`clavier-mouvement.mjs`). Build
déterministe (deux `vite build`, sha256 identiques) ; `tokens.mjs` pur et `--check` effectif. Catalogues fr / en à
parité, pluriels `one` / `many` / `other` en français. `/next/` : `..`, `%2e%2e`, liens symboliques, types non servis
→ 404 `{code, detail}` comme le reste de l'API ; CSP `'self'` sur chaque fichier servi ; fichiers relus à la requête.
Hauteurs de barre (48), îlots à 16 / 12 px, une seule infobulle `[role=tooltip]` : conformes.
