# Revue indépendante : brique 4 de la migration v2, la recherche (2026-10-16)

**0 critique, 1 haut, 7 moyens, 13 bas.**

Relecteur : `relecteur-ui`, sans les conclusions de l'auteur. Rapport consigné tel que rendu, avant toute correction.
Étalon : `design/comps/shell/index.html` à `data-state="search"` (CSS l. 192-245, HTML l. 605-650, mesuré dans Chromium
à 1440 × 900), `shell-search-1440.png`, `DESIGN.md` § Search palette, Facts (`snug`), Alerts, jetons `palette.*`,
`docs/13-migration-plan.md` ligne 4, `.claude/rules/app.md`. Écarts validés par Orhan non relevés (onglet Notes,
actions limitées, frappe sans éclairage, Maj+Entrée / masquer / isoler / puces parqués, accueil à deux onglets, pied
sans « dans N infrastructures »).

**Suites** : `npm run check` vert (190 tests). `impeccable context` lancé. E2E non relancé en entier ; sondes Playwright
à part sur le build courant (`/next/`, archive `archive-six` en :8031, série de jauge en :8032).

**Ce qui passe les sondes** : palette 752 × (56 + 44 + 372 + 40), à 104 px, lignes 36 px, détail 288 px ; le scrim
couvre la carte et les îlots ; contraste mesuré dans Chromium, clair / sombre × cobalt / encre, tout ≥ 4,5:1 (détail
ink-3 sur survol 4,91 / 5,26 ; nom courant sur accent-weak 16,17 / 15,87 / 12,01 / 11,49 ; icône courante accent-ink
6,91 / 6,41 ; pied sur ground 5,13 / 6,85 ; erreur 5,3 / 4,98 ; bouton primaire 6,22 / 6,29 ; placeholder ink-3) ; les
contours line-2 (puces, bouton « Centrer ») à 1,55 / 1,83:1, déjà assumés par `DESIGN.md` § Inputs ; mouvement réduit :
`transition-duration` 1 ms sur la palette et le scrim ; Échap ne ferme ni la fiche compacte ni le focus (1408 px
gardé), le focus revient au bouton ; Ctrl+K depuis le champ de filtre de la fiche ouvre ; le popover Réglages se ferme
à Ctrl+K ; « Ouvrir la collecte du 9 oct. » change bien `run_id` ; un voisin non collecté (`ap-dc01-07`) s'ouvre centré ;
la ligne courante garde accent-weak sous le pointeur ; regex illisible dite en mots, sans le message du moteur.

Sondes (bloc-notes de session, non versionnées : seul ce fichier est créé) : `pw/gauge.cjs`, `pw/contrast.cjs`,
`pw/behave.cjs`, `pw/field.cjs`, `pw/compare.cjs` (Playwright de `app/node_modules`), `probe/search.probe.ts` (vitest,
config à part). Les commandes utiles sont recopiées sous chaque point.

## Haut

- **H1** `app/src/ui/Palette.tsx:83-125`, `app/src/search/SearchPalette.tsx:42-49,106` : la palette monte **toutes**
  les lignes trouvées, sans fenêtrage, et les reconstruit à chaque frappe et à chaque flèche. À la jauge du projet
  (500 équipements, 21 472 interfaces, celle de `backend/tests/test_app_gauge.py`), une lettre fige la page plusieurs
  secondes. Sonde `gauge.cjs` (série `ld-contracts generate --seed revue-recherche --devices 500 --runs 2`, ingérée,
  servie, palette ouverte, valeur posée puis deux images) : « core » 414 ms / 1 712 lignes ; « e » **5 215 ms** /
  21 448 lignes ; « port: » 3 551 ms / 21 461 ; « et » 4 211 ms / 19 690 ; une flèche ↓ sur « et » **964 ms**. La v1
  bornait à 8 par sorte ; la v2 ne borne plus (règle « un défaut n'est pas un plafond ») mais ne fenêtre pas non plus.
  Aucun test de jauge pour la palette.

## Moyens

- **M1** `app/src/search/SearchDetail.tsx:37`, `app/src/ui/Palette.css:195-206` : l'alerte du détail est dessinée avec
  `Mark` (les mots prennent la couleur d'état) puis retouchée en ligne d'alerte (retour à la ligne, marque alignée sur
  la première ligne) au lieu de réutiliser la primitive `Alerts`. Écart à la maquette : `.st` y garde la phrase en
  encre, seule la marque est rouge (mesuré : `rgb(20, 20, 20)`) ; ici la phrase est rouge (capture
  `recherche-francais-1440.png`, « 1 agrégat sans assez de membres actifs »). Sonde `compare.cjs` (`alertColor`).
- **M2** `app/src/ui/Palette.css:62-63,223-227`, `DESIGN.md:526,537` : deux tailles de la maquette réécrites sans être
  notées comme écart. Champ : maquette 17 px / 500 (`var(--t-l)`), rendu 15 px / 500. Nom du détail : maquette
  17 px / 650 / 22 px, rendu 15 px / 600 / 20 px (`subtitle-strong`), alors que `DESIGN.md` dit « subtitle size »
  (15 / 500) : trois valeurs pour un même élément. Sonde `compare.cjs` : `mockup {"input":"17px","detailName":
  "17px/650/22px"}`, `impl {"input":"15px","detailName":"15px/600/20px"}`.
- **M3** `app/src/ui/Palette.css:118-145` contre `app/src/ui/Select.css:24-53` : la ligne de résultat redéfinit la
  rangée d'option qui existe déjà (`.ui-option` : gap 12, rayon contrôle, survol `hover`, `aria-selected` sur
  accent-weak) ; deux définitions des mêmes états, et deux conventions pour « position clavier dans une liste »
  (fill de survol + anneau dans `Select`, accent-weak dans la palette). Sonde : `grep -n "accent-weak\|color-hover"
  app/src/ui/*.css`.
- **M4** `app/src/state/search.ts:293-294`, `app/src/search/SearchDetail.tsx:48-50,120` : `detailOf` dit « null when the
  model no longer holds it » mais renvoie `{ kind: "port", row: null }` pour un port disparu ; le détail affiche alors
  le titre, l'hôte et « Ouvrir la fiche » (et « Centrer ») sur un corps vide, au lieu de « Ce résultat n'est plus dans
  la collecte affichée ». Sonde `search.probe.ts` : `detailOf(model, { ...portHit, name: "Ethernet9/99" })` →
  `{"kind":"port","hostname":"dc01-acc-01","row":null}`. Le test « null when the model lost it » ne couvre que le groupe.
- **M5** `app/src/diagram/useSearch.ts:70` : la règle « Entrée sur un équipement retiré ou un voisin non collecté
  sélectionne **et centre** » et le bouton « Centrer la vue » n'ont aucun test (ni unitaire, la décision vit dans un
  hook, ni e2e). Vérifiés à la main seulement (sonde `behave.cjs`, B5 et B9 : `#node=ap-dc01-07`, vue déplacée).
- **M6** `app/src/diagram/useSearch.ts:66-67` : les actions de collecte (`openRun`, `compareRun`) n'ont pas de test ;
  seul « Masquer la grille » est joué (`e2e/search.spec.ts:180`). Sonde `behave.cjs` B6 : `run_id` passe de 7e4b07 à
  b427f1, `from` suit.
- **M7** `app/src/state/keys.ts:34`, `app/tests/keys.test.ts` (non modifié) : la seule touche à modificateur de la page
  (Ctrl+K et Cmd+K depuis un champ ou une couche ouverte, jamais avec Alt, donc pas AltGr+K) n'a aucun cas unitaire ;
  l'e2e ne la joue qu'au repos. Sonde : `shellKeyOf({ key: "k", ctrlKey: true, metaKey: false, altKey: false }, true)`.

## Bas

- **B1** `app/src/state/search.ts:243` : `break` sur la première correspondance vide arrête tout le marquage, y compris
  les correspondances réelles qui suivent. Sonde : `segmentsOf("dc01-core-01", parse("o*").terms)` →
  `[{"text":"dc01-core-01","hit":false}]` (les « o » ne sont pas marqués). Le test ne couvre que `x*` sur « abc ».
- **B2** `app/src/state/search.ts:240` : un terme `port:` trouvé par abréviation (« port:eth1/1 » trouve
  TenGigabitEthernet1/1/1 par « TenGigabitEth1/1/1 ») ne marque rien dans le nom ; `hostname:core` vise le nom mais
  n'est jamais marqué. Sonde : `segmentsOf("dc01-core-01", parse("hostname:core").terms)` → aucun segment trouvé.
- **B3** `app/src/ui/control.css:43-46` : bouton de recherche ouvert = encre seule, fond transparent (mesuré
  `rgba(0, 0, 0, 0)`) ; la maquette lui donne le fill de survol (`index.html:183`, `.search-trigger`).
- **B4** `app/src/ui/Palette.tsx:167-169` : icône de recherche du champ à 16 px, maquette 18 px (`.pal-input .ico`).
  Sonde `compare.cjs` (`icon.w`).
- **B5** `app/src/ui/Rail.tsx:50` : les comptes des onglets passent par `Count` (12 px / 600) ; maquette 13,5 px / 500
  (`.pal-scope .btn .n`). Premier mot d'onglet à 17 px du bord, maquette 20 px. Sonde `compare.cjs`.
- **B6** `app/src/diagram/useSearch.ts:54` : sur la page du diagramme les autres infrastructures n'ont pas de détail de
  ligne (`devices: null`) ; la maquette dit « 14 équipements ». La page ne lit que les noms.
- **B7** `app/src/state/keys.ts:34` : Ctrl+K avec une liste ouverte (infrastructure, collecte) ouvre la palette par-dessus
  sans la fermer ; après Échap la liste reste ouverte, le focus sur le bouton de recherche. Sonde `field.cjs` F2 :
  `["infrastructures"]` → `["infrastructures","palette"]` → `["infrastructures"]`, capture `f2.png`.
- **B8** `app/src/ui/Palette.tsx:220-223` : le focus rendu au bouton déclenche son infobulle « Rechercher partout
  Ctrl K » à chaque fermeture (Échap comme Entrée), posée sur le haut de la fiche ouverte (capture `f2.png`, y 64-92,
  fiche à y 76).
- **B9** `app/src/ui/Palette.tsx:138-140` : Tab ne quitte jamais le champ (sonde `behave.cjs` B7 : 9 Tab, focus
  toujours `INPUT`) ; « Ouvrir la fiche » et « Centrer la vue » du détail ne sont jamais atteints au clavier, centrer un
  résultat reste à la souris (lié à Maj+Entrée parqué).
- **B10** `app/src/ui/Palette.tsx:87-88,210` : ni le total ni « Rien ne correspond » / « Expression illisible » ne sont
  dans une région vivante ; un lecteur d'écran n'apprend pas le résultat d'une frappe. Les onglets (`role="tab"`) ne
  commandent aucun `tabpanel`.
- **B11** `app/src/shell/ShellTools.tsx:27` : `aria-controls="search-palette"` nomme un élément absent tant que la palette
  est fermée.
- **B12** `app/src/primitives/sections/Search.tsx:94` : le spécimen de la page vivante vide le texte à Échap (le
  contraire de la règle) et ne montre ni survol de ligne ni bouton ouvert.
- **B13** `app/src/ui/Palette.css:161,272` : `max-width: 45%` et `calc(var(--space-xs) + var(--space-2xs))` (6 px) hors
  jetons et hors grille de 8.

## Traitement (2026-10-16, le jour même, tout traité)

Sondes de la revue copiées dans `2026-10-16-recherche-sondes/` (`gauge.cjs`, `contrast.cjs`, `behave.cjs`, `field.cjs`,
`compare.cjs`, `search.probe.ts`).

- **H1** fait : fenêtre par groupe (`state/search.ts` : `SHOWN_IN_ALL` 8, `SHOWN_IN_KIND` 100, `SHOWN_STEP` 100,
  `groupsIn` / `rowsIn` avec `Shown`, une ligne « … et N de plus » que ↓ atteint et qu'Entrée ouvre d'une page ;
  jamais un plafond : le lecteur demande page par page). Jauge rejouée (`gauge.cjs`, 500 équipements) : « e »
  5 215 → 47 ms, « port: » 3 551 → 34-41 ms, ↓ 964 → 10-26 ms ; test Node de jauge (`tests/search.test.ts`, 500
  équipements × 48 ports, sous 1,5 s, lignes bornées) ; cas e2e sur « e » (la ligne « de plus », Entrée, la position
  gardée, le contraste dans cet état).
- **M1** fait : l'alerte du détail par la primitive `Alerts` (taille `snug` ajoutée : phrase en encre, marque
  colorée), le `Mark` retouché retiré.
- **M2** fait : champ 17 px / 500, nom du détail 17 / 600 / 1.3 ; `DESIGN.md` § Search palette donne une valeur par
  élément.
- **M3** fait : rangée d'option extraite dans `ui/Option.css`, partagée par `Select` et `Palette` ; convention unique
  écrite dans `DESIGN.md` (Colors, Rows) : la position clavier d'une liste est la rangée accent-weak, le pointeur le
  fond de survol, la valeur choisie d'un `Select` sa coche. Conséquence : la position clavier d'un `Select` passe du
  fond de survol à accent-weak.
- **M4** fait : `detailOf` d'un port disparu renvoie `null` (« Ce résultat n'est plus dans la collecte affichée ») ;
  `PortDetail.row` non nullable ; tests sur un port, une grappe et une note disparus.
- **M5, M6** faits en e2e : Entrée sur `ap-dc01-05` (voisin non collecté) déplace la vue ; Maj+Entrée et « Centrer la
  vue » aussi (transform de la toile avant / après) ; « Comparer avec la collecte du 5 janv. » change `from`,
  « Ouvrir la collecte du 12 janv. » change `run_id`.
- **M7** fait : cas unitaires de `shellKeyOf` (Ctrl+K, Cmd+K, depuis un champ ou une couche, jamais avec Alt).
- **B1** fait : une correspondance vide n'arrête plus le marquage (`segmentsOf("dc01-core-01", "o*")` marque le o).
- **B2** fait pour `hostname:` (marqué) ; un `port:` trouvé par abréviation ne marque rien : le nom montré est le long,
  assumé et dit dans le commentaire de `segmentsOf`.
- **B3** fait : le bouton ouvert prend le fond de survol (`ShellTools.css`), vérifié en e2e.
- **B4** fait : icône du champ à 18 px (jeton `palette.input-icon`).
- **B5** fait par une variante : la maquette donne 12 / 600 en couleur d'état aux comptes des vues et 13,5 / 500 ink-3
  à ceux de la palette (mesuré) ; variante propre à la palette, dite dans `DESIGN.md` ; premier mot d'onglet à 20 px.
- **B6** fait : `useInfrastructures` renvoie `{ name, devices }` ; les autres infrastructures ont leur compte.
- **B7** fait : `shell/closeLayers.ts` ferme les couches ouvertes avant d'ouvrir la palette ; `field.cjs` F2 rejouée :
  `["infrastructures"]` → `["palette"]` → `[]` ; cas e2e.
- **B8** fait : `quietFocus` (`ui/Tooltip.tsx`) : le focus rendu au bouton n'ouvre pas son infobulle ; e2e : zéro
  infobulle après Échap ; capture `recherche-fermee-1440.png`.
- **B9** fait : Maj+Entrée centre ; quatrième indice du pied (masqué sur l'accueil) ; `DESIGN.md` § Keys.
- **B10** fait : région vivante masquée (total ou message) ; la liste est un `tabpanel` nommé par l'onglet courant,
  `Rail` gagne `controls`.
- **B11** fait : `aria-controls` posé seulement quand la palette est ouverte.
- **B12** fait : le spécimen garde le texte à Échap, montre une ligne survolée, une ligne « de plus », le bouton ouvert.
- **B13** fait : jeton `palette.row-detail-max` (200 px) et `--space-sm` à la place des valeurs composées.

Suites après traitement : app check 193, e2e 58 ; détecteur impeccable sans point. Reste sans test automatique : la
jauge de la palette dans Chromium (la sonde `gauge.cjs` se rejoue à la main sur une série générée).

