# Revue indépendante — interface bilingue (lots 1 à 8), audit d'usage dans un navigateur — 2026-10-10

Rapport rendu par l'agent d'audit d'usage (audit demandé par Orhan à la livraison de la fonction), consigné tel quel
avant toute correction. Données : la série synthétique `samples/demo-dc` seulement. Scripts rejouables, comparaison de
texte HEAD / actuel et captures principales : `sondes-2026-10-10-interface-bilingue/usage/` (les 520 captures et les
vidages de texte complets sont restés dans le scratchpad de la session ; `$A` ci-dessous). Le rapport de relecture du
code est consigné à part : `2026-10-10-interface-bilingue-code.md`.

---

**Auditeur** : EvidenceQA (indépendant, sans écriture dans le dépôt). **Données** : `samples/demo-dc` (3 runs), intentions
semées par l'API (épingles, couleurs, 3 groupes dont un supprimé, une note, une forme, un tableau, une image PNG, un
connecteur).

## Ce qui a été fait
- **Parcours complet**, en anglais puis en français : accueil, mauvais jeton, barre, bascule des vues, comptes, recherche
  (5 requêtes), barre d'outils, Affichage, bande des runs, parcours erreurs / avertissements / changements, les huit
  fiches en Diagramme et en Contrôle (équipement, firewall injoignable, câble, faisceau, cluster HA, agrégat, groupe,
  note, forme, tableau, image, connecteur, sélection multiple), sept menus contextuels, palette des types, menu, bulles,
  Journal (facettes, recherche « deleted / colour / placed / supprimé / couleur », plage, aide, export CSV, détail,
  historique, lien copié), cas d'erreur (mauvais jeton, infrastructure inconnue, requête périmée sur un groupe supprimé
  ailleurs).
- **Largeurs et thèmes** : 1440×900 sombre (FR, EN) ; 1280×800 clair (FR, EN) ; 1024×768 sombre (FR, EN).
- **Bascule de langue à chaud** par le menu, sans recharger, depuis une fiche en Diagramme, en Contrôle, un cluster et
  le Journal, dans les deux sens.
- **Non-régression du français** : `app.js` de `HEAD` servi par un second serveur sur une archive identique, même parcours
  FR 1440 sombre, comparaison du texte des deux versions sur ~70 écrans (`head_vs_cur.txt`).
- **Mesure des débordements** dans le DOM (`overflow.py`) à 1440, 1280, 1024, deux langues.

## Ce qui tient (vérifié)
- **Aucune clé brute** (`shell:…`, `panel.xxx`, `{{var}}`) et **aucun texte français visible en anglais** sur tous les
  écrans vidés (`scan.py`), hors données (noms saisis) et catalogue des contrats laissé en français par décision.
- **La bascule à chaud fonctionne** : barre, fiches, toile, pastilles, bulle, Journal ; `<html lang>` suit.
- **Orthographe britannique cohérente** (colour, neighbour, centre), glossaire respecté dans le texte visible.
- **Pluriels justes** : aucun « 1 devices » ni « 0 équipements » ; `_zero` présents (`no device with errors`).
- **Erreurs d'API rédigées par la page** dans les deux langues (« not saved: the API answers 422: unknown group: deleted
  in the meantime, reload the document », « no archived run for this infrastructure », « token refused by the API »).
- **Recherche du Journal bilingue** côté serveur : « deleted » → 1 entrée, « colour » → 4, quelle que soit la langue.
- **Français inchangé hors corrections listées** : cinq écarts seulement (mode HA en mots ; « 6 erreurs ouvert(s) » →
  « 6 erreurs ouvertes » ; « 1 retiré(s) » → « 1 retiré » ; sorte d'annotation annoncée en français ; sélecteur de
  langue ajouté). Une régression en sort (B2).

## Constats

### Moyen
**M1 — Les dates de la plage du Journal suivent la langue du navigateur, pas celle de l'application.** Journal > Plage :
les deux `<input type="date">` affichent `mm/dd/yyyy` en anglais (alors que l'anglais britannique est choisi), et aussi
en français sous un navigateur en-US ; « 03/04 » est ambigu dans un outil d'audit. Chromium ignore `lang` pour ces
champs. Preuves : `shots/en-dark-1440-j-range.png`, `shots/fr-in-en-US-j-range.png`. Source :
`engine/src/app/components/journal/Tools.tsx` (RangePanel).

**M2 — « (Intents tab) » renvoie à un onglet qui n'existe pas dans l'application.** Sans nom, glisser un équipement :
« local move of dc02-core-01: give your name (Intents tab) to save it », alors que la fiche dit « give your name (top
right) ». Défaut antérieur en français (« onglet Intentions »), reporté en anglais. Preuve :
`shots/en-dark-1440-noname-drag.png`, `noname.py`. Source : `common.json` `host.pinLocalNoName`, `shell/intent.ts:124`.

**M3 — Valeurs et chemins bruts dans la section « Changes / Changements » d'une fiche** (antérieur, deux langues). Fiche de
dc01-fw-01 : « collection success → unreachable » (la pastille dit UNREACHABLE, `common:collection` existe) ; libellés
`reported_hostname`, `virtual_contexts` coupés (« reported_h… ») ; « root → » sans rien après (liste vide non rendue
« — »). Preuves : `shots/en-dark-1440-ctl-card-node-fw.png`. Source : `cards/shared.tsx:190-191` (`changeText` :
`String([])` = "") et `f.path` affiché tel quel dans `NodeCard.tsx:94`, `NodeFacts.tsx:137`, `LinkCard.tsx:82`,
`LinkFacts.tsx:37`.

**M4 (hors i18n) — Un clic droit sur un connecteur modifie sa courbure et l'enregistre.** Avec un nom, clic droit au milieu
d'un connecteur : révision 20 → 21, `bend` 36 → 42, `route` `straight` → `curve` au premier clic ; un clic gauche
n'écrit rien. Le Journal montre « modified the connector uplink: bend, route ×6 ». Preuves : `rclick.py`,
`shots/rclick-connector.png`. Cause probable : `engine/src/app/canvas/connector.tsx:125-156` (`down()` ne teste pas
`event.button`, la branche `bend` de `up()` n'a pas de seuil de mouvement, contrairement aux bouts < 3 px).

**M5 (hors i18n, pire en français) — Les comptes de la barre débordent sous le groupe de droite en Contrôle**, à 1280 et
1024. Fin de `.counts` / début de `.bar-right` : EN 1280 1036 / 1006 px (30 px) ; FR 1280 1111 / 964 px (147 px) ;
1024, deux langues 856 / 850 px (6 px). FR 1280 clair : erreurs, avertissements et diff disparaissent
(`shots/fr-light-1280-control.png`) ; 1024 : « ~9 » coupé (`shots/en-dark-1024-control.png`). Source :
`components/TopBar.tsx` et la feuille de la barre.

### Bas
**B1 — Typographie française dans les textes pour lecteur d'écran en anglais** : « Connectors : », « Colours : »,
« All : 19 », « : walk through the changes », « ; » dans la liste des avertissements. Source : `journal/Row.tsx:181`,
`journal/Facets.tsx:52`, `TopBar.tsx:68`, `TopBar.tsx:104`.

**B2 — Régression : le lecteur d'écran lit le nombre deux fois dans les comptes de contrôles d'une fiche** : nombre
visible suivi d'un sr-only « 1 error » au lieu de « error » ⇒ « 1 1 error », « 2 2 infos » (HEAD disait « erreur »).
Source : `cards/shared.tsx:82`.

**B3 — Nom accessible des câbles : « Edge from dc01-acc-01 to dc01-core-01 »** (défaut de React Flow, anglais dans les
deux langues, « edge » au lieu de « cable »). Source : `Flow.tsx` (aucune arête n'a `ariaLabel`).

**B4 — Valeurs brutes résiduelles** (deux langues) : `aria-label` des nœuds « collection: success », « collecte :
unreachable », « HA primary » (`Flow.tsx:109`) ; `title` de la pastille de run « run 805d… · completed »
(`TopBar.tsx:148`) ; résultats de recherche : type d'interface « aggregate », « subinterface ». (PRIMARY / SECONDARY,
« lacp active », « bundled » : faits du device, admissibles, signalés pour cohérence.)

**B5 — Anglais incorrect ou maladroit** : « 2 infos » ; « returned 1 device to their type colour » ; calques : « sheet »
(fiche), « the API answers 422 », « intervention needed », « witness », « facing », « (sent again at the next
drawing) », « line without heads », type court « balancer ». Source : `locales/en/*.json`.

**B6 — Glossaire à arbitrer** : « Bundle » (faisceau) se heurte au RunBundle et à l'état LACP « bundled » (« Bundles 2 »
puis des membres « bundled ») ; section « Link » dans une fiche « Cable » ; « show in the diagram » face à
« Diagram » ; « see “Raw” » face à « see “raw” ».

**B7 — Palette des types : date coupée** (« amber · orhan, on 2026- / 10-10 20:42 UTC »). Source : `TypePalette.tsx`
(`white-space: nowrap`). Preuve : `shots/en-dark-1440-palette.png`.

**B8 — Page statique** : `<html lang="fr">` et `<noscript>` en français avant le JavaScript. Source :
`backend/src/ld_backend/render/app.py`.

**B9 — Accords français antérieurs** : « annotation forme sélectionné » (zone d'annonce) ; « annotation de orhan, le … »
(bulle, `common tip.annotationBy`, déjà à HEAD).

## Synthèse

| # | Sévérité | Constat | i18n ? |
|---|---|---|---|
| M1 | moyen | Champs de date au format du navigateur | oui |
| M2 | moyen | « (Intents tab) » vers un onglet absent | reporté du français |
| M3 | moyen | Diff de fiche brut | antérieur |
| M4 | moyen | Clic droit sur un connecteur écrit une courbure | hors i18n |
| M5 | moyen | Comptes masqués en Contrôle ≤ 1280 px | hors i18n |
| B1 | bas | « : » et « ; » français en sr-only anglais | oui |
| B2 | bas | Nombre lu deux fois | régression |
| B3 | bas | « Edge from … to … » | oui |
| B4 | bas | Énumérations brutes (aria, titres, recherche) | antérieur |
| B5 | bas | « infos », « their », calques | oui |
| B6 | bas | Ambiguïtés de glossaire | oui |
| B7 | bas | Date coupée dans la palette | mise en page |
| B8 | bas | `lang="fr"` et `<noscript>` statiques | oui |
| B9 | bas | Accords FR | antérieur |

**Comptes** : haut 0 · moyen 5 (dont 2 hors i18n) · bas 9.

**Évaluation** : le socle bilingue est bon (ni clé brute, ni français visible en anglais, bascule à chaud complète,
français non régressé visuellement). Pas encore « fini » : M1 et M2 avant de montrer l'anglais à un public ; B1, B2, B3,
B5 sont des retouches de catalogue. **Statut : à reprendre légèrement, puis re-tester.**

**Limites** : non-régression du français par comparaison de texte, pas pixel à pixel ; type `load_balancer` et `_zero` du
Journal relevés dans le catalogue seulement ; les intentions de l'archive d'audit ont été modifiées par M4 (sans effet
sur le dépôt).

---

## Suivi

Décisions d'Orhan (2026-10-10) : champs ISO AAAA-MM-JJ (M1) ; « sheet » → « panel », « answers » → « returned » ;
« bundle » gardé. Tout traité le même jour (captures `.impeccable/planche-langue/audit-*.png`) :

- **M1** : plage du Journal en champs texte ISO validés (`AAAA-MM-JJ` / `YYYY-MM-DD`), message de format.
- **M2** : message sans renvoi à un onglet (« donnez votre nom pour l'enregistrer »), commun aux deux pages.
- **M3** : section « Changements » : libellés des champs (`panel:diffField`), valeurs en mots (collecte, statut, type),
  liste vide = « — ».
- **M4** : clic droit sans effet sur les poignées (connecteur, annotation, ancres, frontières de tableau), courbure et
  redimensionnement sans écriture sous 3 px ; test Chromium vérifié par mutation.
- **M5** : barre compacte dès 1366 px (mots des bascules et des comptes en lecteur d'écran) ; mesuré sur captures à
  1280 FR clair et 1024.
- **B1** : ponctuation par le catalogue. **B2** : le nombre n'est lu qu'une fois. **B3** : nom accessible des câbles.
- **B4** : collecte en mots dans le nom accessible des nœuds ; types d'équipement et d'interface en mots dans la
  recherche ; rôles HA et état de run laissés tels qu'enregistrés (décision du 2026-10-02 ; donnée amont).
- **B5** : « info », « its », « LB », « returned », « administrator action needed », « remote end », « seen from »,
  « plain line (no arrowheads) », « panel ».
- **B6** : « bundle » gardé (décision) ; « Link » / « Raw » laissés. **B7** : date insécable dans la palette.
- **B8** : `<noscript>` bilingue ; `<html lang="fr">` gardé (le script le corrige avant le premier rendu).
- **B9** : « sélection : équipement X » (plus d'accord), « annotation · auteur, le … ».
