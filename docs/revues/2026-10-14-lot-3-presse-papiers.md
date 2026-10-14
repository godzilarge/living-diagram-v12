# Revue indépendante — Lot 3 de docs/11 : le presse-papiers (copier, couper, coller, dupliquer, Alt + glissé) (2026-10-14)

Périmètre : `engine/src/app/state/clipboard.ts`, `state/clipboard-commands.ts`, `canvas/clone.tsx` (nouveaux) ; les
changements liés dans `components/Shell.tsx`, `state/store.tsx`, `canvas/Flow.tsx`, `components/Canvas.tsx`,
`canvas/toile.ts`, `canvas/undo.ts` (`chain`), `state/history.ts` (`absorb`, `createdItems`), `canvas/annotation.tsx`
(`Body` exporté), `api/client.ts` (`fetchAssetFile`), `state/context.ts`, `components/ContextMenu.tsx`, catalogues i18n ;
tests `backend/tests/test_api_intent.py` (identités), `backend/tests/test_app_clipboard.py`, `backend/tests/js/app.test.js` ;
`backend/README.md`. Hors périmètre : les lots 5, 1 et 2 non commités du même arbre (déjà relus), sauf là où le lot 3 s'y
appuie (`deleteSelection`, `IntentHost.apply`, écrivain).

Rapport consigné tel que rendu, avant toute correction. Sondes rejouables recopiées en annexe (Node sur le bundle livré ;
pytest + Chromium depuis `backend/`, `PYTHONPATH=. uv run pytest -p tests.conftest <fichier> -s`). Chaque sonde imprime
le constat tant que le défaut est présent. Vérifié au passage : `npm run check` propre, `node --test
tests/js/app.test.js` 29 / 29.

**Conclusion du relecteur** : la partie pure est propre et bien bornée (garde de forme, empreinte avant toute adresse,
aucun HTML depuis la charge, aucun hôte tiers, jeton jamais hors de l'origine, refus de plus de 500 éléments, 50 images
au plus) ; l'annulation composée fonctionne, rétablir compris (vérifié par sonde : les connecteurs recréés reprennent
les notes recréées). Les défauts sont dans l'orchestration asynchrone du collage : il n'est lié ni à l'infrastructure
où il a commencé ni à la réponse qu'il lit, et il n'est pas atomique. **0 critique, 1 haut, 5 moyens, 9 bas.**

## Haut

**H1. Un collage commencé dans une infrastructure s'écrit dans celle qu'on regarde à la fin**
(`clipboard-commands.ts:143-175`, `writers.ts:22`, `store.tsx:519`, `client.ts:72-75`). `paste()` capture `h = handle()`
au départ, puis attend : le renvoi des images (`carryImages`, jusqu'à 50 × 4 Mo, en série), la première requête, la
seconde. L'écrivain et `uploadAsset` lisent la session **au moment de l'envoi** (`session()` = `sessionRef.current`).
Si l'utilisateur change d'infrastructure pendant ce temps (menu, Retour du navigateur, « montrer » du Journal), les
images partent au magasin de la nouvelle, puis les opérations, calculées contre le modèle de l'ancienne (ancres,
`targetOf`, positions), s'écrivent dans la nouvelle, sous son nom ; la seconde requête relie des identités `a<rev>-<n>`
qui ne veulent rien dire là ; la ligne d'état dit « 2 éléments collés (orhan) » sans nommer l'infrastructure ; l'entrée
d'annulation tombe dans la pile de la nouvelle (le `history` est partagé, vidé au `connect`, puis rempli par l'ancien
observateur). **Sonde H1** (annexe B) : copie de deux annotations d'`infra-lab` (dont une image), collage dans
`infra-b`, GET d'image ralenti de 1,5 s, passage à `infra-lab` 0,3 s après Ctrl+V : `infra-lab` passe de 2 à 4
annotations, `infra-b` en a 0 ; le POST d'image et le POST d'opérations visent `infrastructure=infra-lab`. Le même
défaut existe pour toute écriture en vol (lots antérieurs), mais le lot 3 l'expose par une fenêtre de plusieurs
secondes et un geste en deux requêtes. **Correction** : figer l'infrastructure par toile — l'écrivain et l'hôte
d'images d'un `CanvasHandle` lisent le jeton vivant mais l'infrastructure de **leur** run (`makeWriter(() => ({ ...
session(), infrastructure: here }))`) ; dans `paste()`, après chaque `await`, abandonner si `handle() !== h` (« collage
abandonné : vous avez changé d'infrastructure »), sans envoyer la seconde requête. Test : la sonde H1 en parcours
Chromium, `infra-b` reçoit le collage ou rien, jamais `infra-lab`.

## Moyens

**M1. Un collage en deux requêtes n'est pas atomique, et la page le dit mal** (`clipboard-commands.ts:163-172`,
`clipboard.ts:98`). La garde ne vérifie que la forme ; le commentaire dit « un collage refusé l'est en entier, par un
422 ». Faux dès qu'il y a une seconde requête : les annotations sont créées, puis les connecteurs qui les visent sont
refusés. **Sonde M** (annexe B) : une charge dont le connecteur a `route: "zigzag"` → révision 1 → 2, la note
`PARTIEL` est créée (`a2-1`, sélectionnée), aucun connecteur, ligne d'état « non enregistré : l'API répond 422 : corps de
requête invalide (ops.0.connector_create.route) », entrée d'annulation « annotationCreated ». Même chemin pour une
charge légitime qui rencontre un refus de borne (`too_many_connectors`), une coupure réseau, ou un connecteur dont les
deux bouts visent la même annotation collée (sonde S3). L'utilisateur voit d'abord « n éléments collés » (n compte les
connecteurs), puis un message technique. **Correction** : si la seconde requête échoue, défaire la première par
l'entrée qu'elle a faite (`undo` ciblé, opérations `annotation_delete` sous le nom, l'entrée retirée de la pile) et dire
« collage annulé : <raison> » ; à défaut, dire « n annotations collées, m connecteurs refusés : <raison> » et compter
juste. Corriger le commentaire de `clipboard.ts:98`. Test : la sonde M, plus un 503 simulé sur la seconde requête.

**M2. Les identités collées se déduisent de `model.intent`, pas de la réponse ; rien ne les vérifie**
(`clipboard-commands.ts:163-171`, `shell/intent.ts:92-96` et `171-175`). `IntentHost.apply` rend `model.intent` après
`accept(outcome.intent)`, et `accept` **refuse** une réponse plus ancienne que le document déjà lu. Aujourd'hui seules
les écritures de la page touchent `model.intent`, sérialisées : le défaut est latent. Il devient réel avec le lot 12
(D9, relecture toutes les 15 s) : une relecture qui rapporte la révision R+2 d'un autre utilisateur avant la réponse R+1
de notre première requête fait calculer `a(R+2)-1` au lieu de `a(R+1)-1` ; la seconde requête relie alors nos
connecteurs **à l'annotation d'un autre**, en silence (le serveur ne vérifie pas qu'une annotation visée existe ;
sonde S2 : `resolve` avec la révision 8 rend `ref: "a8-1"`). `history.createdIds` (rétablir) a la même dépendance,
antérieure au lot. **Correction minimale, sans changer l'API** : `apply` rend le document de la **réponse** (le dernier
`outcome.intent`), jamais `model.intent` ; avant la seconde requête, vérifier que chaque identité calculée existe dans
cette réponse avec le contenu envoyé (même `content.kind`, mêmes `x`/`y`), sinon ne pas l'envoyer et le dire. **Sur la
question posée** : le test `test_a_batch_of_creations_gets_its_ids_in_the_order_of_its_operations` prouve bien la règle
(mêlées, trois sortes de positions, une seconde requête qui vise `a2-2` ; une numérotation globale ou inversée le ferait
échouer), et `backend/README.md` la nomme. Mais l'OpenAPI ne dit que « le serveur attribue l'identité `a<revision>-<n>` »
(`schemas.py:270`, `331`, `202`), pas ce qu'est `n` ; `CONTRAT.md` et `docs/10` non plus. La page dépend donc d'un
comportement à moitié écrit. Deux voies : (a) écrire l'engagement dans les descriptions des trois opérations `*_create`
de `schemas.py` (« n = rang de l'opération parmi les créations de sa sorte dans la requête, à partir de 1 ; `revision` =
celle du document rendu ») et dans `docs/10` ; (b) **additif** si l'on préfère ne pas figer une forme d'identité : un
en-tête de réponse `LD-Created: a7-1,a7-2,c7-1` (dans l'ordre des opérations de création), qui ne touche ni le contrat
`Intent` ni le corps. Recommandation : (a) maintenant, avec la correction côté page ; (b) seulement si une identité
change un jour de forme.

**M3. Une sélection de texte restée dans la page détourne Ctrl+C** (`Shell.tsx:97-101`, `flow.css:7`). Le gestionnaire
`copy` rend la main au navigateur dès que `getSelection()` n'est pas vide. Or un clic sur la toile (`user-select: none`)
**n'efface pas** une sélection de texte existante dans Chromium. **Sonde sel** (annexe C) : texte de la barre
sélectionné (107 caractères), clic sur une note (sélectionnée sur la toile), sélection de texte toujours de 107
caractères, Ctrl+C : le presse-papiers reçoit « Living Diagram / infra-lab / … », la ligne d'état ne dit rien de la copie,
et le Ctrl+V suivant crée une **note** avec ce texte. Scénario courant : copier un hostname dans la fiche, cliquer une
note, Ctrl+C. **Correction** : vider la sélection de texte au `pointerdown` sur `.flow-host`
(`getSelection().removeAllRanges()`), ou ne laisser la main au navigateur que si la sélection de texte est dans l'élément
focalisé / hors de la toile **et** que le focus n'est pas sur la toile. Test : la sonde, attendue « 1 élément copié ».

**M4. Couper supprime des groupes que copier n'emporte pas, sans le dire** (`clipboard-commands.ts:114-123`,
`store.tsx:339-361`, `selection.ts:113-118`). Écart (5) pris seul par l'implémenteur. `afterCopy(cut)` appelle
`deleteSelection(true)`, qui supprime toute la sélection vivante, groupes compris ; le message de copie qui disait
« groupes non copiés » est écrasé par « n éléments coupés ». **Sonde cut** (annexe B) : une note et un groupe
sélectionnés, Ctrl+X → 0 groupe, 0 annotation dans le document, messages vus : « enregistrement… », « 2 éléments coupés
(orhan) · Ctrl+Z pour annuler » ; le Ctrl+V suivant ne rendra que la note. Couper = retirer **exactement** ce qui part
dans le presse-papiers (tous les éditeurs du benchmark) ; un groupe coupé et non collable est une perte que seul un
Ctrl+Z remarqué rattrape. **Correction** : couper supprime les annotations et connecteurs de la charge, jamais les
groupes ; si la sélection contient des groupes, le dire (« 1 groupe gardé : un groupe ne se coupe pas »). Corollaire
(bas, même endroit) : le couper du menu (`copyFromMenu`, `clipboard-commands.ts:207-217`) supprime la sélection **au
retour** de la promesse d'écriture, qui a pu changer entre-temps ; calculer les opérations de suppression depuis la
charge prise, pas depuis `toile.state.multi`.

**M5. Collé au pointeur depuis une autre infrastructure, une annotation attachée tombe ailleurs**
(`clipboard.ts:178-183`). Pour une ancre gardée, `x, y` = écart relatif d'origine + `d`, avec `d = pointeur − boîte`
calculé dans le plan **d'origine**. Dans la destination, la position absolue vaut `pointeur + (ancre_destination −
ancre_origine)` : ni au pointeur, ni près de l'équipement si celui-ci n'est pas au même endroit dans les deux
infrastructures (cas général : placement mémorisé par infrastructure), avec une ligne de rappel qui traverse la toile ;
la sélection la désigne mais la vue ne la montre pas. Dans la même infrastructure, le calcul est juste (même ancre). Le
test d'une infrastructure à l'autre ne vérifie que l'ancre, pas la place. **Correction** : `Target` porte `anchorAt(kind,
ref)` (centre de la carte, coin du cadre, que la toile connaît) ; pour une ancre gardée, `x, y = frame.xy + d −
anchorAt(...)` ; l'ancre d'origine se déduit de la charge (`frame.xy − (x, y)`), aucune donnée de plus. Test Node :
deux ancres à des places différentes, la boîte collée sous le pointeur.

## Bas

- **B1.** Deux Ctrl+D rapprochés posent deux copies au **même** endroit (sonde : positions `(0,0), (20,20), (20,20)`) :
  la sélection ne devient la copie qu'à la réponse, le second Ctrl+D duplique encore l'original à +20. Tenir une
  duplication en vol (refuser, ou compter `n` comme pour les collages répétés) (`clipboard-commands.ts:252-262`).
- **B2.** D6 incohérent entre onglets : des noms d'équipements copiés n'ont pas de format propre (`copyEvent` ne pose
  `CLIP_MIME` que si `pastable`), donc un **autre** onglet les colle en note « sw-core-01 sw-core-02 », alors que le même
  onglet refuse (« les équipements ne se collent pas »). Et le menu écrit `CLIP_WEB` avec les noms en texte, pas une
  charge (`clipboard-commands.ts:213`). Poser la charge dans le format propre dans les deux chemins, toujours.
- **B3.** Alt + glissé reste actif sans nom (`Flow.tsx:594`, `enabled` n'inclut pas `editable`) : le fantôme suit, puis
  la relâche dit « sans nom ». Sur une carte ou un cadre, aucun fantôme, puis « rien à coller » — pour un groupe, le
  message dit « vide » au lieu de « un groupe ne se copie pas » (`clipboard-commands.ts:267`). Refuser au `pointerdown`
  avec le bon message, ou laisser le glissé normal.
- **B4.** `MAX_CLIP_CHARS` compte des caractères (2 M), la requête est bornée en octets (`LD_MAX_INTENT_BYTES`) : sonde
  S4, 400 notes de 1 990 « é » = 876 k caractères, 1,67 Mo, admis par la garde et par le plan, puis 413 « corps trop
  volumineux ». Borner la première requête en octets côté page (`new Blob([JSON.stringify(...)]).size`) et dire « collage
  trop gros » ; le commentaire `clipboard.ts:25` se contredit avec la constante.
- **B5.** `freed` (ancrages et bouts libérés) est calculé et jamais dit (`clipboard-commands.ts:160`) : un collage d'une
  autre infrastructure qui détache trois notes de leur groupe ne le signale pas. Ajouter « n ancrages libérés » à la
  ligne d'état.
- **B6.** `pasteFromMenu` (`clipboard-commands.ts:250`) : le `.catch` final dit « lecture refusée » pour toute erreur
  survenue **après** une lecture réussie (création d'un `File`, collage). Distinguer refus de lecture et échec de collage.
- **B7.** `Flow.tsx` passe à 622 lignes (571 à `HEAD`, lots 2 et 3), au-delà de la borne de 600 (`CLAUDE.md`,
  2026-10-02). Une couture existe : la souris (`usePointerPlan`, `useAltClone`, l'outil connecteur) hors du composant.
- **B8.** Trous de test : rétablir (Ctrl+Y) d'un collage en deux requêtes n'est pas dans le parcours Chromium (vérifié
  par la sonde C : correct, `c6-1` relié à `a6-1` / `a6-2`) ; aucune seconde requête refusée (M1) ; aucun changement
  d'infrastructure en vol (H1) ; la place d'une annotation attachée collée d'ailleurs (M5) ; le test backend n'exerce pas
  `n ≥ 10` (tri lexicographique des identités dans le document : `a2-10` avant `a2-2`, sans effet sur la règle mais
  piège pour un test qui lirait l'ordre de la liste).
- **B9.** Immutabilité : `toile.pointer` est muté depuis `clone.tsx:158-160` et `internal` est un état de module
  (`clipboard-commands.ts:54`) partagé par toute instance du Store ; acceptable pour une mémoire d'onglet, mais à
  ranger dans la toile (setter) et dans le Store (référence) pour suivre la règle et isoler les tests.

## Vérifié sans défaut

- **Charge non fiable** : version exacte, types, identités uniques entre annotations et connecteurs, empreinte `sha256`
  minuscule avant toute adresse (`../intent?x=1`, majuscules refusées), 2 M caractères au plus, 10 000 noms au plus ;
  au-delà de 500 éléments, refus avant toute requête (S5 : 9 000 annotations lues, `boundsOf` sans débordement de pile,
  `too_many`). Le contenu et le style passent tels quels au serveur, qui les valide (`extra="forbid"`) : rien de la
  charge n'est dessiné avant validation (le fantôme d'Alt + glissé vient du modèle de la page, pas de la charge).
- **Aucun HTML depuis la donnée** : textes par React, valeurs libres par attributs de présentation SVG ; aucun style en
  ligne ; aucune minuterie dans `clipboard.ts` ni `clone.tsx` ; `npm run check` (chaînes) propre.
- **Réseau** : routes relatives, même origine ; jeton en en-tête, `credentials: "omit"`, jamais dans une adresse ni dans
  la charge ; `infrastructure` d'une charge passe par `URLSearchParams` puis `_segment` côté serveur (S6 : `../../etc`
  inoffensif). Une charge peut faire lire au navigateur une image d'une autre infrastructure que l'utilisateur peut déjà
  lire avec le même jeton : aucune élévation. L'image renvoyée est vérifiée par son empreinte rendue
  (`receipt.asset !== asset` ⇒ note).
- **Événements natifs** : un champ (`typing`), le panneau, la bande, un dialogue gardent leur copier / coller ; la vue
  Journal est exclue ; `preventDefault` seulement quand la page a pris l'événement (sinon Ctrl+D garde le marque-page du
  navigateur s'il n'y a rien à dupliquer).
- **Lecture seule** : Contrôle et sans nom refusent coller / dupliquer avec le bon message, copier reste ; Ctrl+X en
  Contrôle copie et dit « lecture seule » ; Alt + glissé coupé en Contrôle.
- **Navigation D1 / D2 révisées** : Alt + glissé n'agit que sur un nœud (fond = panoramique inchangé), bouton du milieu
  et Espace + glissé gardent la vue, poignées et champs (`.nodrag`) gardent leur geste ; le `preventDefault` du
  `pointerdown` coupe les événements souris de compatibilité, donc le glissé de React Flow (vérifié par le parcours :
  l'original ne bouge pas).
- **Annulation composée** : `undo.chain` + `history.absorb` font une seule entrée, à sa place même si un autre geste
  s'est empilé ; Ctrl+Z la défait en une fois ; Ctrl+Y la refait et `relinkOps` relie les connecteurs aux annotations
  recréées (sonde C).
- **Décalages** : collages répétés +20 cumulés, au pointeur (aimanté si l'aimant est actif), Ctrl+D qui répète l'écart
  d'un Alt + glissé tant que la sélection est la copie ; connecteur dont aucun bout ne bouge libéré et décalé, fantôme
  cohérent avec le collage (S9).

## Suivi

Traité le 2026-10-14 par l'implémenteur du lot, sur les décisions de l'orchestrateur (chaque recommandation confrontée à
l'usage avant le code). Mutations : 35 attrapées (16 sous Node, 19 dans Chromium), aucune survivante ; les sondes H1 et
M sont rejouées en parcours Chromium (`backend/tests/test_app_clipboard_guards.py`).

- **H1 — corrigé.** L'écrivain et le placeur d'une run écrivent dans l'infrastructure de cette run, figée
  (`store.tsx` `makeHosts(infrastructure)`, `Canvas.tsx`) ; le collage lit et renvoie ses images avec cette session ;
  après chaque attente (lecture d'image, renvoi, chaque requête), si la toile a changé, il s'arrête sans rien écrire de
  plus et le dit (« collage abandonné… rien n'a été écrit dans <infra> », ou « interrompu » si une partie l'était)
  (`clipboard-commands.ts`, classe `Stop`, `alive`) ; une écriture qui revient après un changement d'infrastructure
  n'entre plus dans la pile de l'autre (`undo.ts`, `StackHolder.owner`). Test : la sonde H1, infra-lab garde 2
  annotations, infra-b 0, aucun POST.
- **M1 — corrigé, sans changer l'API.** Seconde requête impossible ou refusée : la première est défaite par l'entrée
  qu'elle a faite (`undo.revert` : opérations inverses, sans entrée, l'entrée retirée de la pile), un seul message
  « collage refusé : <raison> » ; défaire refusé aussi : « collage incomplet : … · Ctrl+Z pour défaire ce qui reste »,
  l'entrée reste. « n éléments collés » ne part qu'après le succès complet. Commentaire de `clipboard.ts` corrigé. Test :
  la sonde M (révision +2, ni note ni connecteur, pile vide, rien de sélectionné).
- **M2 — corrigé, voie (a).** Identités calculées sur la révision de la **réponse** de la première requête
  (`writers.ts` `AppWriter.outcomeOf`, par la première opération de la requête), vérifiées dans ce document avant la
  seconde (`clipboard.ts` `verifyCreated` : présentes, même sorte, même place ; bouts comparés sans l'ordre des clés) ; une
  seule manque : pas de seconde requête, la première est défaite. Le rétablir lit aussi sa réponse (`undo.ts`).
  Engagement écrit : `schemas.py` (trois opérations de création), `openapi.py` (route), `test_openapi.py`,
  `backend/README.md`, `docs/10` §6. Tests : Node (vérification, une place d'un autre refusée), backend (rangs ≥ 10).
- **M3 — corrigé.** Un appui sur la toile hors d'un champ efface la sélection de texte de la page (`clone.tsx`,
  `usePointerPlan`) ; un texte sélectionné dans une fiche garde la copie native. Test : la sonde (« 1 élément copié »,
  le presse-papiers porte la charge), puis le titre d'une fiche sélectionné et copié tel quel.
- **M4 — corrigé.** Couper = copier puis supprimer les annotations et connecteurs de la charge prise au clic
  (`clipboard-commands.ts` `cut`) : groupes et équipements restent, la page le dit (« 1 groupe gardé : un groupe ne se
  coupe pas », « masquer » proposé pour un équipement) ; le couper du menu supprime ce qui a été pris, pas la sélection
  au retour de l'écriture. `deleteSelection` rendu à son état du lot 2. Écart (5) de `docs/11` révisé.
- **M5 — corrigé.** `Target.anchorAt` (centre de la carte, coin du cadre d'un groupe, calculé comme Flow.tsx le
  dessine ; `app/canvas/clip-toile.ts`) ; une ancre gardée écrit `frame + d − ancre d'ici`, la boîte collée tombe sous le
  pointeur, ancrages libérés compris ; ancre non dessinée : l'écart d'origine. Test Node : deux ancres à deux places.
- **B1 — corrigé.** Un Ctrl+D encore en vol compte : le suivant pose sa copie un pas plus loin (`flying`). Test
  Chromium : (0,0), (20,20), (40,40).
- **B2 — assumé (décision de l'orchestrateur).** Des noms d'équipements collés dans un autre onglet arrivent comme un
  texte brut venu d'ailleurs et deviennent une note (comportement d'avant) ; dans le même onglet, la mémoire de l'onglet
  les reconnaît. Écrit dans `docs/11`.
- **B3 — corrigé.** Alt + glissé n'est pas pris sans nom (`Flow.tsx`, `enabled: editable && …`) ; un cadre seul dit
  « un groupe ne se copie pas » (`groupsIn`). Test Chromium : sans nom, ni fantôme ni écriture.
- **B4 — corrigé.** `bytesOf` (octets UTF-8, sans `TextEncoder` : le module reste pur sous Node) ; une requête de collage
  au-delà de `MAX_REQUEST_BYTES` (1 Mio moins l'enveloppe, le défaut de `LD_MAX_INTENT_BYTES`) est refusée avant l'envoi
  (« collage trop gros ») ; le commentaire de `MAX_CLIP_CHARS` dit ce qu'il garde. Test Node.
- **B5 — corrigé.** « n ancrages libérés » dans la ligne d'état du collage.
- **B6 — corrigé.** Le menu « coller » : un refus de lecture tombe sur la mémoire de l'onglet ou « lecture refusée » ;
  un échec après une lecture réussie dit « … n'a pas pu être collé » (`pasteRead`).
- **B7 — corrigé.** `Flow.tsx` 622 → 431 lignes : le calcul des nœuds et arêtes (une fonction de la toile) sorti dans
  `app/canvas/flow-build.ts` (211 lignes) ; la couture « ce qui se calcule / ce qui réagit aux gestes ».
- **B8 — corrigé.** Rétablir d'un collage en deux requêtes (parcours principal), seconde requête refusée, changement
  d'infrastructure en vol, ancre d'ici (Node), rangs au-delà de neuf lus par identité (backend).
- **B9 — en partie.** La mémoire de l'onglet vit maintenant dans les commandes (une par Store), plus dans le module.
  `toile.pointer` reste un champ posé par la toile React Flow, comme `frames`, `ends`, `boxes` : la toile tient l'état
  mutable de la vue, React n'en lit qu'une version ; un setter n'ajouterait rien.

## Annexe A — Sonde Node (`probe1.js`)

Lancement : `node probe1.js backend/src/ld_backend/render/assets/app/app.js`. Sortie au moment de la revue :

```
S1 parse: payload
S1 first: [ 'annotation_create' ] later: [ 'connector_create route=zigzag' ]
S2 resolve with revision 8: {"kind":"annotation","ref":"a8-1","side":"auto"}
S3 parse: payload later: 1
S4 chars: 876376 utf8 bytes: 1672376 parse: payload plan ok: true
S5 chars: 1537976 parse: payload bounds: {"x":0,"y":0,"w":1,"h":1} plan: {"ok":false,"reason":"too_many"}
S6 parse: payload infra: ../../etc
S7 op keys: op,content,anchor,x,y,w,h,z,locked,leader,style
S9 ghost: [{"x":40,"y":20},{"x":140,"y":20}] paste: [{"kind":"free","x":40,"y":20},{"kind":"free","x":140,"y":20}]
```

```js
// Sondes pures sur LDApp.clipboard (bundle livré).
const fs = require("fs"), vm = require("vm");
const APP = process.argv[2];
const ctx = vm.createContext({ console, URLSearchParams });
vm.runInContext(fs.readFileSync(APP, "utf8"), ctx, { filename: "app.js" });
const c = ctx.LDApp.clipboard;
const S = { hue: "slate" };
const ann = (id, extra = {}) => ({ id, anchor: { kind: "free", ref: null }, x: 0, y: 0, w: 100, h: 40, z: "front", leader: false, content: { kind: "note", text: "n" }, style: S, frame: { x: 0, y: 0, w: 100, h: 40 }, ...extra });
const con = (id, start, end, extra = {}) => ({ id, start, end, heads: { start: "none", end: "arrow" }, route: "straight", bend: 0, label: "", z: "front", style: S, a: { x: 0, y: 0 }, b: { x: 9, y: 9 }, ...extra });
const payload = (annotations, connectors, infrastructure = "lab") => ({ "living-diagram": 1, infrastructure, annotations, connectors, hosts: [] });
const T = { infrastructure: "lab", hasHost: () => true, hasGroup: () => true, hasAnnotation: () => true };

// S1 : un connecteur hors contrat (têtes vides, tracé inconnu) qui vise une annotation collée passe la garde et part
// dans la SECONDE requête : la première (l'annotation) réussit, la seconde est refusée par 422 -> collage partiel.
const bad = payload([ann("x1")], [con("y1", { kind: "free", x: 0, y: 0 }, { kind: "annotation", ref: "x1", side: "auto" }, { heads: {}, route: "zigzag", style: { evil: 1 } })]);
const parsed = c.parse(JSON.stringify(bad));
console.log("S1 parse:", parsed.kind);
const plan = c.pastePlan(parsed.payload, T, { x: 20, y: 20 }).plan;
console.log("S1 first:", plan.first.map((o) => o.op), "later:", plan.later.map((o) => o.op + " route=" + o.route));

// S2 : identités supposées : si la révision rendue n'est pas celle de la requête, la seconde requête vise d'autres annotations.
const ids = c.createdIds(plan.annotations, plan.connectors, 8);
console.log("S2 resolve with revision 8:", JSON.stringify(c.resolve(plan.later, ids)[0].end));

// S3 : un connecteur avec les deux bouts sur la MÊME annotation collée (refusé par le contrat) : même chemin, 422 en seconde requête.
const loop = payload([ann("x1")], [con("y1", { kind: "annotation", ref: "x1", side: "n" }, { kind: "annotation", ref: "x1", side: "s" })]);
const p3 = c.parse(JSON.stringify(loop));
console.log("S3 parse:", p3.kind, "later:", c.pastePlan(p3.payload, T, { x: 0, y: 0 }).plan.later.length);

// S4 : bornes : 2 M caractères admis par la garde, alors qu'une requête de l'API est bornée (LD_MAX_INTENT_BYTES).
const big = payload(Array.from({ length: 400 }, (_, i) => ann("x" + i, { content: { kind: "note", text: "é".repeat(1990) } })), []);
const text = JSON.stringify(big);
console.log("S4 chars:", text.length, "utf8 bytes:", Buffer.byteLength(text), "parse:", c.parse(text).kind, "plan ok:", c.pastePlan(c.parse(text).payload, T, { x: 0, y: 0 }).ok);

// S5 : nombre d'éléments sans borne dans la garde (la borne de 500 n'arrive qu'au plan, après boundsOf).
const many = payload(Array.from({ length: 9000 }, (_, i) => ({ id: "" + i, anchor: { kind: "free", ref: null }, x: 0, y: 0, w: 1, h: 1, z: "back", leader: false, content: { kind: "note" }, style: {}, frame: { x: 0, y: 0, w: 1, h: 1 } })), []);
const t5 = JSON.stringify(many);
const p5 = c.parse(t5);
console.log("S5 chars:", t5.length, "parse:", p5.kind, "bounds:", JSON.stringify(c.boundsOf(p5.payload)), "plan:", JSON.stringify(c.pastePlan(p5.payload, T, { x: 0, y: 0 })));

// S6 : `infrastructure` d'une charge : aucune borne, aucune forme ; c'est elle qui choisit le magasin lu pour les images.
const p6 = c.parse(JSON.stringify(payload([ann("x1", { content: { kind: "image", asset: "a".repeat(64), alt: "" } })], [], "../../etc")));
console.log("S6 parse:", p6.kind, "infra:", p6.payload.infrastructure);

// S7 : une charge avec des clés en plus (auteur, verrou, __proto__) : passées telles quelles au plan ? 
const extra = payload([ann("x1", { locked: true, author: "mallory", __proto__x: 1 })], []);
const p7 = c.parse(JSON.stringify(extra));
console.log("S7 op keys:", Object.keys(c.pastePlan(p7.payload, T, { x: 0, y: 0 }).plan.first[0]).join(","));

// S8 : ancre « device » non trouvée : libre ; x/y = frame décalée. Ancre d'annotation hors infra : libre.
// S9 : ghostOf vs pastePlan : un connecteur entre deux équipements restés : le fantôme bouge-t-il comme le collage ?
const between = payload([], [con("y1", { kind: "device", ref: "sw-01", side: "auto" }, { kind: "device", ref: "sw-02", side: "auto" }, { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } })]);
const g = c.ghostOf(between, T, { x: 40, y: 20 }), pl = c.pastePlan(between, T, { x: 40, y: 20 }).plan.first[0];
console.log("S9 ghost:", JSON.stringify([g.lines[0].a, g.lines[0].b]), "paste:", JSON.stringify([pl.start, pl.end]));
```

## Annexe B — Sondes Chromium H1, M1, M4 (`test_probe_lot3.py`)

Lancement : `cd backend && PYTHONPATH=. uv run pytest -p tests.conftest test_probe_lot3.py -s`. Sortie au moment de la revue :

```
PROBE H1 fetches: [["GET","/api/intent/assets?infrastructure=infra-lab&asset=52aa…"], …ouverture d'infra-lab…, ["GET","/api/intent/assets?infrastructure=infra-lab&asset=52aa…"],["POST","/api/intent/assets?infrastructure=infra-lab"],["POST","/api/intent/patches?infrastructure=infra-lab"]]
PROBE H1 note: 2 éléments collés (orhan) · Ctrl+Z pour annuler
PROBE H1 infra-lab annotations before / after: 2 4
PROBE H1 infra-b annotations: 0
PROBE M revision: 1 -> 2
PROBE M annotations 'PARTIEL': ['a2-1']
PROBE M connectors: 0
PROBE M note: non enregistré : l'API répond 422 : corps de requête invalide (ops.0.connector_create.route)
PROBE M undo: {"undo":{"key":"annotationCreated"},"redo":null}
PROBE M picked: {"hosts":[],"annotations":["a2-1"],"connectors":[],"groups":[]}
PROBE cut groups left: 0 annotations left: 0
PROBE cut notes seen: ["enregistrement…","2 éléments coupés (orhan) · Ctrl+Z pour annuler"]
```

```python
"""Sondes de la revue du lot 3 (presse-papiers), rejouables :
cd backend && PYTHONPATH=. uv run pytest -p tests.conftest <ce fichier> -s
"""
import base64
import json
import threading

import httpx
import pytest

from tests.test_app import _PASTE_TEXT, READY, NOTE
from tests.test_render import CHROMIUM
from tests.test_app_clipboard import _open, _grant, _post, _move, _copy, _paste, OUTSIDE, _wait_note

DELAY_ASSET_GET = (
    "(() => { const real = window.fetch; window.__probeFetch = [];"
    " window.fetch = (url, init) => { const u = String(url); window.__probeFetch.push([(init && init.method) || 'GET', u]);"
    " const slow = u.includes('/api/intent/assets') && !(init && init.method === 'POST');"
    " return slow ? new Promise((ok) => setTimeout(ok, 1500)).then(() => real(url, init)) : real(url, init); }; return true; })()"
)
SWITCH = (
    "(() => {{ history.pushState(null, '', location.pathname + '?infrastructure=' + {0});"
    " window.dispatchEvent(new PopStateEvent('popstate')); return true; }})()"
)


def _doc(base, auth, infra):
    return httpx.get(f"{base}/api/intent", params={"infrastructure": infra}, headers=auth).json()


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_probe_switch_infrastructure_during_a_paste(settings, bundle_dict):
    """H1 : on colle dans infra-b une copie d'infra-lab qui porte une image ; pendant le renvoi de l'image (lent), on
    passe à infra-lab ; où le collage s'écrit-il ?"""
    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_api_assets import png
    from tests.test_review_e2e import _relabel
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        other = _relabel(bundle_dict, "infra-b", "run-b")
        assert httpx.post(f"{base}/api/ingest/bundles", json=other, headers=auth, timeout=60).status_code == 201
        sent = httpx.post(f"{base}/api/intent/assets", params={"infrastructure": "infra-lab"},
                          headers={**auth, "Content-Type": "image/png"}, content=png(48, 32), timeout=30)
        asset = sent.json()["asset"]
        _post(base, auth, [{"op": "annotation_create", "content": {"kind": "image", "asset": asset, "alt": "Baie"},
                            "x": 0, "y": 0, "w": 96, "h": 64},
                           {"op": "annotation_create", "content": {"kind": "note", "text": "SONDE"}, "x": 200, "y": 0}])
        lab_before = _doc(base, auth, "infra-lab")
        with Chrome(CHROMIUM) as chrome:
            _grant(chrome, base)
            tab = _open(chrome, base, f"{base}/?infrastructure=infra-lab")
            _wait(tab, "!!document.querySelector('.react-flow__node[data-id=\"annotation:a1-2\"]')")
            tab.js("LDApp.debug.handle().toile.selectItems([{kind:'annotation',id:'a1-1'},{kind:'annotation',id:'a1-2'}])")
            _wait(tab, "LDApp.debug.state().picked.annotations.length === 2")
            _move(tab, *OUTSIDE)
            _copy(tab)
            _wait_note(tab, "2 éléments copiés")
            tab.navigate(f"{base}/?infrastructure=infra-b")
            _wait(tab, READY)
            tab.js(DELAY_ASSET_GET)
            _move(tab, *OUTSIDE)
            _paste(tab)
            threading.Event().wait(0.3)
            tab.js(SWITCH.format(json.dumps("infra-lab")))
            _wait(tab, "LDApp.debug.state().address.infrastructure === 'infra-lab'")
            threading.Event().wait(4)
            lab = _doc(base, auth, "infra-lab")
            b = _doc(base, auth, "infra-b")
            print("\nPROBE H1 fetches:", tab.js("JSON.stringify(window.__probeFetch)"))
            print("PROBE H1 note:", tab.js(NOTE))
            print("PROBE H1 infra-lab annotations before / after:", len(lab_before["annotations"]), len(lab["annotations"]))
            print("PROBE H1 infra-b annotations:", len(b["annotations"]))
    finally:
        server.should_exit = True
        thread.join(timeout=10)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_probe_second_request_refused(settings, bundle_dict):
    """M : un connecteur qui vise une annotation collée part en seconde requête ; refusé (422), la première reste."""
    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        _post(base, auth, [{"op": "annotation_create", "content": {"kind": "note", "text": "x"}, "x": 0, "y": 0}])
        style = _doc(base, auth, "infra-lab")["annotations"][0]["style"]
        with Chrome(CHROMIUM) as chrome:
            tab = _open(chrome, base, f"{base}/?infrastructure=infra-lab")
            payload = {"living-diagram": 1, "infrastructure": "infra-lab", "hosts": [],
                       "annotations": [{"id": "n1", "anchor": {"kind": "free", "ref": None}, "x": 0, "y": 0, "w": 100,
                                        "h": 40, "z": "front", "leader": False,
                                        "content": {"kind": "note", "text": "PARTIEL"}, "style": style,
                                        "frame": {"x": 0, "y": 0, "w": 100, "h": 40}}],
                       "connectors": [{"id": "k1", "start": {"kind": "free", "x": 0, "y": 0},
                                       "end": {"kind": "annotation", "ref": "n1", "side": "auto"},
                                       "heads": {"start": "none", "end": "arrow"}, "route": "zigzag", "bend": 0,
                                       "label": "", "z": "front", "style": {"hue": "slate"},
                                       "a": {"x": 0, "y": 0}, "b": {"x": 9, "y": 9}}]}
            rev = _doc(base, auth, "infra-lab")["revision"]
            tab.js(_PASTE_TEXT.format(json.dumps(json.dumps(payload))))
            threading.Event().wait(2)
            doc = _doc(base, auth, "infra-lab")
            print("\nPROBE M revision:", rev, "->", doc["revision"])
            print("PROBE M annotations 'PARTIEL':", [a["id"] for a in doc["annotations"] if a["content"].get("text") == "PARTIEL"])
            print("PROBE M connectors:", len(doc["connectors"]))
            print("PROBE M note:", tab.js(NOTE))
            print("PROBE M undo:", tab.js("JSON.stringify(LDApp.debug.state().history)"))
            print("PROBE M picked:", tab.js("JSON.stringify(LDApp.debug.state().picked)"))
    finally:
        server.should_exit = True
        thread.join(timeout=10)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_probe_cut_with_a_group(settings, bundle_dict):
    """M : Ctrl+X d'une note et d'un groupe : le groupe n'est pas copié mais il est supprimé ; que dit la page ?"""
    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_app_clipboard import _key
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        _post(base, auth, [{"op": "group_create", "label": "Cœurs", "members": ["sw-core-01", "sw-core-02"]},
                           {"op": "annotation_create", "content": {"kind": "note", "text": "x"}, "x": 0, "y": 0}])
        with Chrome(CHROMIUM) as chrome:
            tab = _open(chrome, base, f"{base}/?infrastructure=infra-lab")
            _wait(tab, "!!document.querySelector('.react-flow__node[data-id=\"annotation:a1-1\"]')")
            tab.js("LDApp.debug.handle().toile.selectItems([{kind:'annotation',id:'a1-1'},{kind:'group',id:'g1-1'}])")
            _wait(tab, "LDApp.debug.state().picked.groups.length === 1")
            _move(tab, *OUTSIDE)
            notes = []
            tab.js("window.__notes = []; setInterval(() => { const n = LDApp.debug.state().note; if (n && !window.__notes.includes(n.text)) window.__notes.push(n.text); }, 20)")
            _key(tab, "x", 88, 2)
            threading.Event().wait(1.5)
            doc = _doc(base, auth, "infra-lab")
            print("\nPROBE cut groups left:", len(doc["groups"]), "annotations left:", len(doc["annotations"]))
            print("PROBE cut notes seen:", tab.js("JSON.stringify(window.__notes)"))
            print("PROBE cut clipboard:", tab.js("navigator.clipboard.readText().catch(() => 'refused')")[:120])
    finally:
        server.should_exit = True
        thread.join(timeout=10)
```

## Annexe C — Sondes Chromium M3, B1 (`test_probe_lot3_b.py`)

Sortie au moment de la revue :

```
PROBE sel: text selected before click 107 after click 107
PROBE sel: clipboard starts with "Living Diagram\n/\ninfra-lab\n2026-09-10 02:00\n\nDiagramme\n\nCont" note: 5 équipements placés et mémorisés
PROBE ctrl+d x2 positions: [(0, 0), (20, 20), (20, 20)]
```

```python
"""Sondes de la revue du lot 3, suite (rejouables comme la première)."""
import json
import threading

import httpx
import pytest

from tests.test_app import NOTE, _click
from tests.test_render import CHROMIUM
from tests.test_app_clipboard import _open, _grant, _post, _move, _copy, _key, OUTSIDE, _note_center


def _doc(base, auth, infra="infra-lab"):
    return httpx.get(f"{base}/api/intent", params={"infrastructure": infra}, headers=auth).json()


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_probe_stale_text_selection_and_double_ctrl_d(settings, bundle_dict):
    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        _post(base, auth, [{"op": "annotation_create", "content": {"kind": "note", "text": "Baie"}, "x": 0, "y": 0, "w": 160, "h": 60}])
        with Chrome(CHROMIUM) as chrome:
            _grant(chrome, base)
            tab = _open(chrome, base, f"{base}/?infrastructure=infra-lab")
            _wait(tab, "!!document.querySelector('.react-flow__node[data-id=\"annotation:a1-1\"]')")
            threading.Event().wait(0.4)
            # (1) une sélection de texte laissée dans la page (le nom d'un équipement dans la barre), puis un clic sur
            # la note de la toile, puis Ctrl+C : qu'est-ce qui part ?
            tab.js("(() => { const el = document.querySelector('.topbar, header, .bar') || document.body;"
                   " const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return String(s).length; })()")
            before = tab.js("String(getSelection()).length")
            _click(tab, *_note_center(tab, "a1-1"))
            _wait(tab, "LDApp.debug.state().picked.annotations.join() === 'a1-1'")
            after = tab.js("String(getSelection()).length")
            _move(tab, *OUTSIDE)
            _copy(tab)
            threading.Event().wait(0.5)
            got = tab.js("navigator.clipboard.readText()")
            print("\nPROBE sel: text selected before click", before, "after click", after)
            print("PROBE sel: clipboard starts with", json.dumps(got[:60]), "note:", tab.js(NOTE))
            # (2) deux Ctrl+D rapprochés sur la même sélection
            tab.js("getSelection().removeAllRanges()")
            _click(tab, *_note_center(tab, "a1-1"))
            _wait(tab, "LDApp.debug.state().picked.annotations.join() === 'a1-1'")
            _key(tab, "d", 68, 2)
            _key(tab, "d", 68, 2)
            threading.Event().wait(1.5)
            xs = sorted((a["x"], a["y"]) for a in _doc(base, auth)["annotations"])
            print("PROBE ctrl+d x2 positions:", xs)
    finally:
        server.should_exit = True
        thread.join(timeout=10)
```

## Annexe D — Sonde Chromium : rétablir un collage en deux requêtes (`test_probe_lot3_c.py`, sans défaut)

Sortie au moment de la revue :

```
PROBE redo annotations: ['a1-1', 'a1-2', 'a6-1', 'a6-2']
PROBE redo connector c2-1 {'kind': 'annotation', 'ref': 'a1-1', 'side': 'e'} {'kind': 'annotation', 'ref': 'a1-2', 'side': 'w'} ends exist: True True
PROBE redo connector c6-1 {'kind': 'annotation', 'ref': 'a6-1', 'side': 'e'} {'kind': 'annotation', 'ref': 'a6-2', 'side': 'w'} ends exist: True True
PROBE redo undo label: {"undo":{"key":"createdItems","count":3},"redo":null}
```

```python
"""Sonde : Ctrl+Z puis Ctrl+Y d'un collage en deux requêtes (non couvert par le parcours Chromium du lot)."""
import threading

import httpx
import pytest

from tests.test_render import CHROMIUM
from tests.test_app_clipboard import _open, _grant, _post, _move, _copy, _paste, _key, OUTSIDE, _wait_note


def _doc(base, auth):
    return httpx.get(f"{base}/api/intent", params={"infrastructure": "infra-lab"}, headers=auth).json()


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_probe_redo_of_a_two_request_paste(settings, bundle_dict):
    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        _post(base, auth, [{"op": "annotation_create", "content": {"kind": "note", "text": "A"}, "x": 0, "y": 0},
                           {"op": "annotation_create", "content": {"kind": "note", "text": "B"}, "x": 300, "y": 0}])
        _post(base, auth, [{"op": "connector_create", "start": {"kind": "annotation", "ref": "a1-1", "side": "e"},
                            "end": {"kind": "annotation", "ref": "a1-2", "side": "w"}}])
        with Chrome(CHROMIUM) as chrome:
            _grant(chrome, base)
            tab = _open(chrome, base, f"{base}/?infrastructure=infra-lab")
            _wait(tab, "!!LDApp.debug.handle() && LDApp.debug.handle().toile.ends.has('c2-1')")
            tab.js("LDApp.debug.handle().toile.selectItems([{kind:'annotation',id:'a1-1'},{kind:'annotation',id:'a1-2'},{kind:'connector',id:'c2-1'}])")
            _wait(tab, "LDApp.debug.state().picked.connectors.length === 1")
            _move(tab, *OUTSIDE)
            _copy(tab)
            _wait_note(tab, "3 éléments copiés")
            _paste(tab)
            _wait_note(tab, "3 éléments collés")
            _wait(tab, "LDApp.debug.handle().toile.model.intent.connectors.length === 2")
            _key(tab, "z", 90, 2)
            _wait_note(tab, "annulé")
            _wait(tab, "LDApp.debug.handle().toile.model.intent.connectors.length === 1")
            _key(tab, "y", 89, 2)
            threading.Event().wait(1.5)
            doc = _doc(base, auth)
            ids = {a["id"] for a in doc["annotations"]}
            print("\nPROBE redo annotations:", sorted(ids))
            for c in doc["connectors"]:
                print("PROBE redo connector", c["id"], c["start"], c["end"], "ends exist:", c["start"].get("ref") in ids, c["end"].get("ref") in ids)
            print("PROBE redo undo label:", tab.js("JSON.stringify(LDApp.debug.state().history)"))
    finally:
        server.should_exit = True
        thread.join(timeout=10)
```
