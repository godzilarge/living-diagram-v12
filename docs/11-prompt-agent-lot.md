# Gabarit : lancer un agent sur un lot de `docs/11` (2026-10-13)

Deux textes à copier. Le premier ouvre la session qui orchestre (Opus suffit). Le second est le prompt qu'elle donne
à l'agent d'un lot (un agent Opus par lot, un seul à la fois dans l'arbre principal). Remplacer `{N}` par le numéro du
lot et compléter les crochets. Les lots 5 et 1 ont été lancés avec ce gabarit le 2026-10-13.

## 1. Prompt de reprise de la session qui orchestre

> Reprends le plan `docs/11-audit-ui-edition-et-plan.md` au **lot {N}**. Lis d'abord, dans cet ordre : `CLAUDE.md`
> (« Règles de travail », « Conventions de code », puis les entrées du journal datées du 2026-10-13 et après : elles
> disent quels lots sont livrés et ce qui est parqué), `docs/11` § Lot 0, § Lot {N} et §5 (les décisions tranchées :
> D1 à D5 le 2026-10-13, à la recommandation), `docs/11-prompt-agent-lot.md` (ce gabarit). Vérifie `git status` :
> l'arbre doit être propre ou son état connu (ne commite jamais sans qu'on te le demande ; pas de stash, checkout,
> reset). Puis lance **un agent Opus** sur le lot {N} avec le prompt du § 2 complété, en arrière-plan, et ne lance pas
> le lot suivant avant d'avoir relu sa livraison : `git diff --stat`, les tests qu'il cite (relance la suite complète
> si tu doutes : `cd backend && uv run pytest`, ~10 min), ses captures (ouvre les PNG), ses écarts. Ensuite : une
> entrée datée dans le journal de `CLAUDE.md` (courte, qui renvoie à `docs/11` § Lot {N} « Fait »), la mémoire, et un
> compte rendu à Orhan en français, synthétique : ce que ça change pour lui, ce qu'il doit juger sur capture, ce qui
> est parqué. Si Orhan a demandé de s'arrêter après un lot, arrête-toi là.

## 2. Prompt de l'agent d'un lot

> Tu codes le **lot {N} — [titre]** du document `docs/11-audit-ui-edition-et-plan.md` dans le dépôt
> `/home/otosun/development/applications/demo/living-diagram-v12-biturbo` (application Living Diagram : backend Python
> FastAPI dans `backend/`, moteur et application React dans `engine/`, contrats dans `contracts/`). Tout se passe en
> français (rapport, documentation, commentaires de code, comme le reste du dépôt).
>
> **À lire d'abord, dans cet ordre, avant toute ligne de code**
> 1. `docs/11-audit-ui-edition-et-plan.md` : la section « Lot 0 — Règles communes à tous les lots » (obligatoire, ce
>    sont tes règles de travail), puis « Lot {N} » (ta spécification), puis [les paragraphes de §3, §4 et §5 qui
>    motivent ce lot].
> 2. `CLAUDE.md` : « Règles de travail (non négociables) », « Conventions de code », et les dernières entrées du
>    journal (les lots déjà livrés dans le même arbre : ne défais rien de ce qu'ils ont fait).
> 3. `engine/README.md` § « L'application » et § « Règles ».
> 4. `docs/revues/2026-10-13-inventaire-ui-commandes.md` et `…-inventaire-ui-toile.md` : les `fichier:ligne` de ce
>    que tu touches.
>
> **Décisions prises par Orhan** : [les lignes de §5 qui concernent ce lot, avec l'option retenue, en toutes lettres].
>
> **Le reste de la spécification, à appliquer telle quelle** : [recopier la section du lot, ou la citer si elle se
> suffit ; dire explicitement ce qui est hors périmètre parce qu'un autre lot le fait].
>
> **Méthode imposée**
> - Annonce ton plan avant de coder : en tête de ton rapport final, les fichiers touchés et les décisions non
>   triviales. Pas de question à Orhan en cours de route : s'il faut trancher un détail, option prudente, dite dans le
>   rapport.
> - Pur d'abord, puis React, puis Chromium : toute règle nouvelle dans un module `.ts` sans DOM, testé sous Node
>   (`backend/tests/js/app.test.js`, ou `viewer.test.js` pour `engine/src/canvas/`), vérifié par mutation ; puis le
>   branchement React ; puis un parcours Chromium dans `backend/tests/test_app.py` (pilote `backend/tests/browser.py`,
>   serveur `tests.test_view._serve`, aides `_click`, `_press`, `_shift_rectangle`, `_settled`, `_node`, `_anchor`).
>   Attendu en Chromium : [la liste du lot].
> - Interdits : style en ligne (CSP ; attributs de présentation SVG ou variables CSS par le CSSOM), HTML depuis une
>   donnée, minuterie dans un module du moteur (la page la fournit), chaîne française en dur dans l'application
>   (`strings.mjs` refuse : tout texte passe par `engine/src/i18n/locales/{fr,en}/*.json`, parité testée par
>   `backend/tests/js/i18n.test.js`), nouvelle dépendance sans décision écrite dans le lot, modification de `/view`,
>   `ld render`, `viewer.js` hors correctif mécanique d'un module partagé, modification du snapshot, du diff, de B1 ;
>   contrats `Intent` : additif seulement, `upgraded()`, schéma et `CONTRAT.md` régénérés, tests contrats + store + API
>   + CLI.
> - Commandes : `cd engine && npm ci && npm run build && npm run check` ; `cd backend && uv run pytest` (suite complète
>   une fois, à la fin, ~10 min ; pendant le travail `uv run pytest tests/test_app.py -k nom`) ; `uv run ruff check src
>   tests` ; `cd contracts && uv run pytest` si le contrat bouge ; reconstruire (`npm run build`) juste avant la suite
>   complète (bundles versionnés, test de dérive). Un échec se dit tel quel avec sa sortie ; un test fragile se relance
>   isolé et se dit.
> - Captures : 1440 × 900 sombre (1280 clair pour la mise en page) ; scripts modèles
>   `.impeccable/planche-audit/scripts/capture_audit.py` et `.impeccable/planche-lot-5/scripts/capture_lot5.py`
>   (depuis `backend/`, `PYTHONPATH=. uv run python …`) ; copie adaptée dans `.impeccable/planche-lot-{N}/scripts/` ;
>   captures attendues dans `.impeccable/planche-lot-{N}/` : [la liste du lot]. Une capture par retouche, pas de
>   variantes. Regarde tes captures (outil Read sur le PNG) avant de livrer.
> - Documentation en une passe à la fin : `engine/README.md` § L'application (quelques phrases) et, dans `docs/11`, un
>   paragraphe « **Fait le [date]** : … » à la fin de la section du lot (fait, écarts, parqués, mesures). Ne touche pas à
>   `CLAUDE.md` (l'orchestrateur écrit le journal). Aucun commit ni commande git qui modifie l'arbre (pas de stash,
>   checkout, reset ; `git diff` et `git status` sont admis).
> - Détecteur Impeccable sur les fichiers touchés en fin de lot, si le skill est disponible.
>
> **Rapport final attendu** (en français, c'est tout ce que l'orchestrateur lira) : 1. le plan annoncé ; 2. ce qui a
> changé, fichier par fichier, une ligne chacun ; 3. [les mesures, si le lot en demande] ; 4. les tests : commandes et
> résultats avec les nombres, mutations vérifiées, échecs tels quels ; 5. les captures : chemins et ce que tu y as vu ;
> 6. écarts à la spécification, décisions prises seul, ce qui est parqué.

## 2 bis. Lot de design d'interface : prototype d'abord (règle d'Orhan, 2026-10-14)

Pour un lot qui dessine de l'interface (lot 4 barre contextuelle, lot 14 passe visuelle, tout nouveau panneau), deux
agents en séquence, jamais un seul :

1. **Agent prototype** : charge les skills `frontend-design:frontend-design` et `impeccable:impeccable`, lit le lot et
   les captures actuelles, et produit dans `.impeccable/prototype-lot-{N}/` une page HTML autonome (données factices,
   jetons de `engine/src/app/styles/tokens.css` recopiés, aucune ressource externe) qui montre le rendu et les états
   (repos, survol, sélection de chaque sorte, sombre et clair, 1440 et 1280), plus ses captures. **Il ne touche ni
   `engine/` ni `backend/`.** L'orchestrateur remet le prototype à Orhan et attend son verdict.
2. **Agent d'implémentation**, après l'accord d'Orhan : le prompt du § 2, avec en plus « le prototype validé
   `.impeccable/prototype-lot-{N}/` fait foi pour le rendu » et les skills `frontend-design` et `impeccable` chargés
   pour la finition et le détecteur.

## 3. Quand reprendre un modèle plus fort que l'implémenteur

Pas pour coder un lot : la spécification est écrite. Utile aux points de jugement : trancher D6 à D12 avant la vague 2
(les recommandations sont dans `docs/11` §5), la revue indépendante des lots qui touchent le contrat ou l'API (9, 12),
la critique Impeccable en fin de lot 4, et toute remarque de fond d'Orhan sur le modèle (qui passe avant le code, règle
du 2026-09-20).

## 4. Reprise du 2026-10-14 au soir (session coupée par la limite de contexte)

> Reprends l'orchestration du plan `docs/11-audit-ui-edition-et-plan.md`. Lis d'abord `CLAUDE.md` (« Règles de
> travail », puis les entrées du journal du 2026-10-14), `docs/11` § Lot 8 (« Prototype validé »), § Lot 16 (décisions,
> « Prototype validé », versions du contrat), § Lot 4 (« Retours d'Orhan à l'usage », « Prototype du lot 4 bis jugé »),
> et ce gabarit. **État à la coupure** :
> - Dernier commit poussé : `23f1aa0` (lot 13). Aucun commit sans demande d'Orhan ; pas de stash, checkout, reset.
> - **Lot 8** (repères d'alignement, aimant aux objets, mettre en grille ; couleur des repères au choix) : codé par un
>   agent dans l'**arbre principal**, non commité. S'il n'a pas rendu son rapport, son travail est peut-être incomplet :
>   `git status`, `git diff --stat`, chercher le paragraphe « Fait » à la fin de `docs/11` § Lot 8 ; s'il manque, relancer
>   un agent Opus avec le prompt du § 2 (prototype `.impeccable/prototype-lot-8/` qui fait foi) en lui disant de **reprendre
>   le travail en place** (lire le diff existant, finir, tester, documenter).
> - **Lot 16** (bloc de code, `Intent` 1.6.0, Prism 1.30.0) : codé par un agent dans le **worktree**
>   `.claude/worktrees/agent-a22f7fc3dd7c7866f` (branche `worktree-agent-a22f7fc3dd7c7866f`, partie de `23f1aa0`), non
>   commité. Même vérification (paragraphe « Fait » de sa section Lot 16 dans `docs/11` du worktree) ; sinon relancer un
>   agent **dans ce worktree** pour finir. Prototype qui fait foi : `.impeccable/prototype-lot-16/` (arbre principal).
> - **Ordre de fin demandé par Orhan** : (1) relire le lot 8 (diff, suite complète `cd backend && uv run pytest`, captures
>   `.impeccable/planche-lot-8/` comparées au prototype), journal, commit + push sur demande ; (2) fusionner le lot 16 sur
>   `main` (commit sur la branche du worktree, puis merge ; conflits attendus : `docs/11` § Lot 16 existe des deux côtés,
>   bundles `backend/src/ld_backend/render/assets/app/*` à **reconstruire** par `npm run build`, i18n, `Flow.tsx`,
>   `FloatingBar.tsx`), suite complète, **revue indépendante consignée** dans `docs/revues/` (le lot touche le contrat et
>   l'API), corrections, journal ; (3) **revue de code de toute la session** (lots 2, 3, 4, 13, 8, 16 : bugs, performance,
>   cohérence, dette) par un agent indépendant, rapport consigné dans `docs/revues/`, puis une passe **impeccable**
>   (critique + audit sur captures, « pas d'AI slop ») ; chaque recommandation est une hypothèse à confronter à l'usage
>   avant de la coder (règle du 2026-10-10) ; présenter à Orhan les constats avec avis, corriger ce qu'il retient.
> - Ensuite : lot 4 bis (barre de texte complète, `Intent` 1.7.0, prototype `.impeccable/prototype-lot-4-bis/`, retirer
>   les graisses du volet police, cinq questions à la recommandation), puis lot 7. Lot 6 parqué.
> - Piège : une interruption de la session par Orhan peut tuer les agents en arrière-plan ; vérifier après chaque
>   interruption (transcription de l'agent sans « Request interrupted », fichier qui avance).
