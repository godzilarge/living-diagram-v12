# Revue indépendante — `ld render`, incrément « bulles au survol, rôle HA » (2026-10-02)

Rapport rendu par l'agent de revue, consigné tel quel. Le suivi est en fin de document.

---

Périmètre lu en entier : `tip.js`, `geometry.js`, `graph.js`, `model.js`, `dom.js`, `inspect.js`, `main.js`, `structures.js`, `tables.js`, `layout.js`, `viewer.css`, `page.py`, `page.html`, `tests/js/viewer.test.js`, `tests/js/fakedom.js`, `tests/test_render.py`, plus les modèles Snapshot (`interfaces.py`, `nodes.py`, `structures.py`, `enums.py`). Exécuté : `pytest tests/test_render.py` (15 verts, Node 31 et Chromium compris), `ruff` propre ; 8 sondes Node sur le faux DOM et 4 sondes dans **Chromium 149 réel** piloté par CDP (`--remote-debugging-pipe`, souris, touch, clavier, arbre d'accessibilité, captures). Sondes rejouables, hors dépôt (brouillon de session : `probe.test.js`, `cdp.py`, `probe1..4.py`, captures `shot-*.png`). Rien n'a été écrit dans le dépôt.

| Sévérité | Nombre |
|---|---|
| Critique | 0 |
| Haut | 1 |
| Moyen | 5 |
| Bas | 8 |

---

### H1 — Un `pointercancel` laisse `dragging` (et `pan`) armés : bulle morte sur tout le canevas, nœud qui se déplace et vue qui panote sans appui

`backend/src/ld_backend/render/assets/js/graph.js:184-202` (nœud) et `:235-251` (fond).

`dragging = true` et `start = {…}` sont posés au `pointerdown`, remis à zéro **uniquement** au `pointerup` du groupe. Aucun écouteur `pointercancel` ni `lostpointercapture`, et aucun filtre sur `event.button`. Même structure pour `pan` côté canevas (préexistant, mais la bulle en dépend maintenant : `graph.js:254`).

**Vérifié dans Chromium 149** (`probe3.py` A/B, `probe4.py`) : `touchStart` sur un nœud puis `touchCancel` ⇒ séquence réelle `pointerdown → gotpointercapture → pointercancel → lostpointercapture`, **jamais de `pointerup`**. Ensuite : survol d'un câble ⇒ bulle `hidden` (morte jusqu'au prochain clic sur un nœud quelconque) ; un simple passage de la souris sur le nœud **le déplace** (`x: -149 → -136`, `pinned: 1`) ; même chose sur le fond : un simple déplacement de souris **panote la vue** (`tx 490 → 590`). Scénarios réels : écran tactile ou stylet (annulation système, rejet de paume, geste), fenêtre qui perd le focus pendant un glissé, nœud redessiné pendant un glissé (`hashchange` ⇒ `render` ⇒ groupe retiré, capture perdue). Le clic droit n'est pas filtré non plus (`probe3.py` D : il sélectionne le nœud et ouvre le menu contextuel ; sur les plateformes où le menu s'ouvre à l'appui, le relâchement n'est pas livré à la page — à vérifier, mais le filtre règle les deux).

Correction proposée :
```js
// bindNode
const end = () => { start = null; dragging = false; };
group.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  …
});
group.addEventListener("pointerup", () => { if (start && !start.moved) select(…); end(); });
group.addEventListener("pointercancel", end);
group.addEventListener("lostpointercapture", end);
// bindCanvas : même chose, if (event.button !== 0) return; et pan = null sur pointercancel / lostpointercapture
```
Test à ajouter sous Node : `pointerdown` puis `pointercancel` sur un nœud ⇒ un `pointermove` du canevas montre la bulle, et un `pointermove` du groupe ne déplace rien.

---

### M1 — Le regroupement `lead` / `follow` traduit en couleur l'« actif / passif » que le texte refuse de dire

`model.js:11` (`HA_ROLE_GROUP`), `viewer.css:134-136`, `main.js:50` (légende).

Le README affirme « aucune traduction en actif / passif (sur `active_active`, le `secondary` forwarde aussi) », mais la couleur fait exactement cette traduction : `secondary` est grisé comme `standby`, `primary` teinté comme `active`, quel que soit `mode`. `primary`/`secondary` (hiérarchie de configuration FGCP) et `active`/`standby` (état de forwarding) sont deux axes ; les fondre en « qui mène / qui suit » est un ajout de sens. Scénario : cluster FortiGate `active_active`, `fw-02` = `secondary` ⇒ nœud grisé, lu comme passif par qui regarde la démo, alors qu'il forwarde. C'est précisément la demande d'Orhan (« distinction visuelle actif / passif ») à laquelle le snapshot ne sait répondre que pour `active_passive`.

Correction : poser la famille seulement quand elle est vraie — `ha.cluster.raw.mode === "active_passive"` pour `primary/secondary` (les rôles `active/standby` sont des états de forwarding et peuvent rester teintés/grisés en tout mode) ; sinon rôle écrit sans fond. Ou deux teintes neutres sans « grisé ». Légende à aligner (« primary / active » laisse croire que ce sont des synonymes).

### M2 — La bulle d'un faisceau ne nomme pas les équipements : deux faisceaux distincts ont la même bulle

`tip.js:85` via `geometry.js:50-55` (`beamLabel(beam, true)` = `a.aggregate ⇄ b.aggregate · …`).

Sur la fixture, `beams[0]` et `beams[1]` (`fw-edge-01 · agg-core` vers `sw-core-01` et vers `sw-core-02`) donnent **mot pour mot** « faisceau agg-core ⇄ port-channel20 · MLAG 20 / 1 câble · lacp active » (`probe.test.js` P1). Le `aria-label` du même groupe, lui, porte les hostnames (`graph.js:122`). Correction : titre de la bulle = `endLabel({hostname, interface: aggregate})` des deux bouts, comme le `aria-label`.

### M3 — Les contrôles sont dédoublonnés par code sans compte : la bulle cache la multiplicité

`tip.js:27-36` (`checkLines`, `seen.has(severity + " " + code)`, puis `rows.length - MAX_CHECK_LINES`).

Sonde P4 : un nœud portant 9 `neighbor_unknown`, 1 `link_oper_mismatch`, 1 `documented_not_observed` et 7 codes `info` (18 contrôles) affiche 6 lignes puis « … et 4 autres » : le lecteur compte 10 contrôles, et ne sait pas que `neighbor_unknown` frappe 9 ports. Sur un vrai bundle (descriptions peu fiables, firewalls sans LLDP) c'est le cas courant. Correction : garder le dédoublonnage mais écrire le nombre, `warning · neighbor_unknown ×9`, et faire porter « … et N autres » sur le nombre de contrôles restants, pas de codes.

### M4 — « vitesse, duplex, média : non lus » et « — » affirment une raison que le snapshot ne donne pas

`tip.js:18-25` (`endFacts` : bout absent de `interfaces[]` ⇒ `null` partout) et `:53` (ligne « non lus »).

Le contrat dit `speed_mbps` « null si down ou inconnue », `duplex` « null si sans objet ou non lu », `media` « null si inconnu » ; doctrine du projet : `null` = « pas de valeur », jamais une raison. La bulle, elle, affirme « non lus ». Deux cas vérifiés (P6) : (a) stub en face d'un port `down` sans vitesse ⇒ « vitesse, duplex, média : non lus » alors que le stub n'a pas d'interface et que le port est down ; (b) **les deux bouts absents de `interfaces[]`** (port témoin non canonique, constat `local_interface_unknown` du contrat d'entrée, qui n'est pas un refus) ⇒ même phrase, et la ligne « état » disparaît sans explication. Par ailleurs « — » sert à la fois pour « bout absent de `interfaces[]` » et pour « valeur `null` d'un port présent », là où `portCard` (`inspect.js:43`) distingue explicitement « Port absent de interfaces[] ». Correction : « vitesse, duplex, média : — » ou « aucune valeur dans interfaces[] » ; pour un bout absent, une ligne « port absent de interfaces[] » sous le nom du port plutôt qu'un tiret indifférencié.

### M5 — Tests : `beamLines` et `clusterLines` ne sont exécutées par aucun test ; les chemins d'interaction réels ne sont pas couverts

`tests/js/viewer.test.js:495-562` (5 tests), `tests/test_render.py:236-237`.

- `grep beamLines|clusterLines|focus|blur|pointercancel tests/js/` : rien. Deux des quatre fabriques de lignes n'ont jamais tourné en test (elles tournent, P1, mais rien ne le fige).
- Le test de survol passe par `canvas.fire` : le faux DOM ne propage pas, donc la coopération groupe → svg (stopPropagation du nœud, capture, `dragging`) n'est pas exercée ; le chemin `pointerdown` nœud → `pointermove` svg → `pointerup` nœud → survol de nouveau, le focus/blur, le `render()` pendant un survol, la bulle large, l'équipement dans deux clusters avec deux rôles ne sont pas testés.
- Le test Chromium vérifie seulement `'class="tip"' in dom` : il ne survole rien. CLAUDE.md dit « rendu vérifié en Chromium (survol simulé par des pages de brouillon, hors dépôt) » : rien dans le dépôt ne rejoue cela. Le pilotage par `--remote-debugging-pipe` (cf. `cdp.py`, 60 lignes, sans dépendance) permettrait un vrai test de survol/clavier dans `test_render.py` sans Playwright.

Correction : 1 test par fabrique (`beamLines` sur `beams[2]` : « peer-link · 2 câbles · un agrégat dégradé » + `aggregate_member_not_bundled` ; `clusterLines` : deux lignes membres + `ha_member_down`), 1 test « glissé puis relâchement puis survol », 1 test « focus montre, blur cache », 1 test « pointercancel » (H1), et le survol réel dans Chromium.

---

### B1 — Le `focus` défait le `tip.hide()` de l'appui : la bulle clignote à chaque clic sur un nœud

`graph.js:186-187` vs `:205-208`. Vérifié Chromium (`probe1.py` : « après appui : active = fw-edge-01, tip: visible », cachée au premier mouvement). Un `tabindex` reçoit le focus à l'appui, après `pointerdown`. Correction : `if (dragging) return;` en tête du `focus` (le drapeau est déjà à `true` à cet instant).

### B2 — `place()` ne borne qu'en haut / à gauche : la bulle d'un nœud hors écran au clavier est coupée

`tip.js:127-131` (`Math.max(0, …)` seulement), `graph.js:205-208`. Capture `shot-focus-tip.png` : Tab vers `rt-wan-01` (à ~1260 px, canevas de 1000) ⇒ bulle de 900 à 1286, tronquée. Correction : `Math.min(rect.width - size.width, …)` et `Math.min(rect.height - size.height, …)`, et au focus clavier appeler `centerOn` (déjà écrit) quand le nœud est hors du rectangle.

### B3 — Le rôle à 6,5 px n'est pas lisible dès que k ≤ 1 : seule la couleur porte l'information

`viewer.css:133`, `graph.js:159-160`. Mesuré : hauteur à l'écran 8 px à k = 0,93, 5 px à k = 0,6 (captures `shot-k1.0.png`, `shot-k0.6.png`) ; à k = 1,6 c'est lisible. Avec M1, la couleur est aussi ce qui est discutable. Décision visuelle pour Orhan (captures à comparer) : 8 px avec un tag `FW` plus petit, ou rôle masqué sous un seuil de zoom (comme `port-label`).

### B4 — Équipement dans deux clusters : l'état `down` du second cluster est invisible sur le nœud

`model.js:136-137` (premier cluster, c'est-à-dire premier dans l'ordre canonique des membres, pas un « premier » signifiant), `graph.js:154-155`. Sonde P3 : `fw-edge-01` `primary · up` dans EDGE-CLUSTER et `standby · down` dans ODD ⇒ nœud `ha-lead ha-state-up`, rien de rouge. Documenté comme décision, mais l'état `down` est un fait d'alerte : proposer `ha-state-down` dès qu'un cluster le dit, et lister les deux clusters dans la bulle (`clustersByHost` existe).

### B5 — Duplications : `haText` recopie `clusterLabel`, le suffixe « priorité » est écrit deux fois, `LD.graph` ré-exporte `LD.geometry`

`tip.js:59-63` et `:94-95` vs `geometry.js:57-59` ; `graph.js:394`. Deux surfaces pour les mêmes fonctions (`structures.js` et `tip.js` passent par `LD.graph.beamLabel`, `graph.js` par `LD.geometry`). `haText` = `clusterLabel(ha.cluster) + " · " + memberText(member)` avec un seul `memberText` partagé avec `clusterLines`.

### B6 — `graph.js` à 395 lignes, `create()` une fermeture de ~370 lignes

`graph.js:19-392`. L'extraction de `geometry.js` a juste ramené le fichier sous 400 ; l'incrément a ajouté ~45 lignes d'interaction. La prochaine retouche franchit la limite : sortir `bindNode`, `bindCanvas`, `entityAt`, `tipLines` dans `interact.js` (ou `pointer.js`).

### B7 — Accessibilité : les `<g tabindex>` sont exposés comme « group » alors qu'Entrée les active ; la bulle n'est reliée à rien

`graph.js:156-157`, `page.html:22`. Arbre AX réel (Chromium 149) : `('group', 'fw-edge-01 · équipement collecté · … · HA primary', focusable)`. Un lecteur d'écran annonce un groupe, pas un bouton ; `role="button"` serait juste (Entrée sélectionne). La bulle n'a ni `role="tooltip"` ni `aria-describedby` depuis le nœud focalisé. Le `<svg role="img">` a, selon ARIA, des enfants « presentational » : Chrome 149 les expose quand même (vérifié), d'autres combinaisons navigateur / AT peuvent les cacher ; `role="group"` ou `role="application"` sur le `<svg>` est plus sûr.

### B8 — L'arbre de travail mélange deux changements

`git status` : `contracts/models_ha.py`, `tests/correlate/test_structures.py`, `test_descriptions.py`, `docs/04`, `docs/05`, `fortios-interfaces.md` (standalone ⇒ `members` vide) sont dans le même état non commité que la page de démonstration. Deux commits (`feat(contracts)` puis `feat(render)`), sinon la revue de l'un se perd dans l'autre.

---

### Points vérifiés sans constat

- **Sécurité** : aucun `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `DOMParser` / `eval` dans les sources (test `test_the_viewer_never_writes_html_from_data` vert, nouveaux fichiers inclus par le glob) ; les seuls `setAttribute` sont `class, d, x, y, cx, cy, width, height, transform, visibility, text-anchor, aria-*` ; aucun attribut `style`, aucune URL, aucune ressource externe (tests verts) ; `data-node = hostname` et `aria-label` posés par `setAttribute` sont sûrs (valeur d'attribut jamais interprétée comme HTML, nom d'attribut fixe) ; les classes construites depuis la donnée (`ha-…`, `collection-…`) ne prennent que des valeurs d'énumérations fermées du contrat ; CSP par empreinte intacte (test), **aucun « Refused » ni erreur console dans Chromium** sous la CSP pendant toutes les sondes ; JSON embarqué échappé (test chaîne hostile vert).
- **Ordre des scripts** (`page.py:23-34`) : `geometry.js` avant `graph.js` (destructuration au chargement), `tip.js` avant `main.js` (appelé au `boot`), `dom.js` avant `tip.js`.
- **Mesure du texte** : avance réelle 6,62 px/caractère (mono 11 px) < `CHAR_W` 6,8 ; « ↔ », « · », « — » rendus à chasse fixe ; boîte 366,8 px pour un texte dont le bord droit est à 347,8 px ; une bulle de 90 caractères (747 px) reste dans le canevas ; coin bas droit : bulle à (966, 785) pour un canevas de (1000, 818).
- **Boucle** (câble entre deux ports du même équipement) : tracé sans `NaN`, bulle « A · p1 ↔ A · p2 », câble compté une fois sur le nœud. **Hub** : un groupe par câble, remontée des parents correcte. **Cluster d'un membre** : aucun cadre, rôle affiché (fidèle). **Membre absent de `nodes[]`** : impossible par contrat (`reference_unknown`).
- **Rendu pendant un survol** : `tip.hide()` avant le redessin, `shownFor` remis à `null`, bulle rétablie au mouvement suivant sur le nouveau groupe.
- **Glissé réel** (Chromium) : relâchement hors du nœud et hors du canevas ⇒ `pointerup` livré par la capture, `dragging` revient à `false`, `pinned = 1`, survol fonctionnel ensuite.
- **Molette pendant un survol** : zoom ancré au pointeur, même élément sous le pointeur, bulle cohérente (clé inchangée).
- **Tap tactile** : sélection puis bulle par le focus (`probe3.py` C). **Tabulation réelle** : la bulle suit le focus de nœud en nœud.
- **CSS** : `.link:hover .link-line` (0,3,0) perd contre `.link.selected .link-line` (0,3,0, plus bas) ; `.node.match` gagne sur `.ha-lead` ; `.ha-state-down .node-role` gagne sur `.ha-lead .node-role` ; `has-selection` + survol cohérents. **Mode sombre** : `color-mix` résolu (`color(srgb …)`), bulle et fonds lisibles (capture `shot-dark-tip.png`).
- **`speedText`** : 2500 → « 2,5 Gb/s », 1234 → « 1,234 Gb/s », 100 → « 100 Mb/s », `null` → `null` ; `inspect.js` l'utilise aux deux endroits.
- **Déterminisme** : rien d'aléatoire dans la bulle ni le rôle ; page identique à l'octet (test).
- **Faux DOM** : `fire` ne propage pas, mais `parentNode` est posé par `appendChild`, donc `entityAt` remonte réellement du `link-hit` au groupe ; ce chemin-là est bien celui du navigateur.
- Node 31 tests verts, `ruff` propre, `test_render.py` 15 verts.

Prochaine étape suggérée : H1 et B1 en une passe (même fonction, quinze lignes), M1 à trancher avec Orhan sur capture (décision visuelle), M2–M4 sont des corrections de texte sans décision, M5 fige le tout.

---

## Suivi (2026-10-02, même jour)

| Point | Sort | Ce qui a été fait |
|---|---|---|
| H1 | traité | `pointercancel` et `lostpointercapture` libèrent le glissé du nœud et le panoramique du fond ; `event.button > 0` (clic droit, central) ignoré sur les deux. Test Node « un appui annulé libère le glissé ». |
| M1 | traité | `haRoleGroup(mode, role)` dans `model.js` : fond « forwarde » pour `active`, ou `primary` en `active_passive` ; « en attente » pour `standby`, ou `secondary` en `active_passive` ; sinon `plain`, rôle écrit sans fond. Légende alignée. Test Node. |
| M2 | traité | Le titre de la bulle d'un faisceau nomme les deux équipements (`endLabel` des deux bouts) ; test : autant de titres distincts que de faisceaux. |
| M3 | traité | Une ligne par (sévérité, code) avec `×n`, « … et N autres contrôles » compte des contrôles. Test sur 18 contrôles. |
| M4 | traité | « vitesse, duplex, média : aucune valeur » (plus de « non lus ») ; un bout absent de `interfaces[]` a sa ligne « … : absent de interfaces[] » ; le tiret ne porte plus de raison. Tests mis à jour. |
| M5 | traité | Tests Node : `beamLines`, `clusterLines`, pointercancel, glissé puis relâchement puis survol, focus / blur, deux clusters, familles de rôle, comptes des contrôles (32 tests). **Survol réel dans Chromium** : `tests/browser.py`, pilote DevTools par `--remote-debugging-pipe` sans dépendance (adapté de la sonde du relecteur), test `test_hover_and_keyboard_focus_in_a_real_browser` (survol d'un tracé, focus clavier, `aria-describedby`, console sans « Refused »). |
| B1 | traité | `if (dragging) return;` en tête du `focus`. Test. |
| B2 | traité | `place()` borne des quatre côtés ; au focus clavier, un nœud hors cadre est amené en vue par `centerOn`. |
| B3 | traité (passe de finition) | Rôle à 7,5 px sous une icône de type, nœud 48 × 40 ; classes `zoom-far` / `zoom-near` posées sur le `svg` par `applyView` : de loin, rôle, ports et étiquettes de faisceau sont masqués, la teinte reste. Jugé sur captures à 1024, 1440 et 1920 px. |
| B4 | traité | `haMembershipsByHost` : le nœud porte le rôle de la première appartenance et l'état `down` de n'importe laquelle ; la bulle liste tous les clusters. Test. |
| B5 | traité | `memberText` partagé, `haText` = `clusterLabel` + `memberText` ; `LD.graph` ne ré-exporte plus la géométrie, `structures.js`, `tip.js` et les tests passent par `LD.geometry`. |
| B6 | **parqué** | Orhan a assoupli la limite le même jour (jusqu'à ~600 lignes si plus propre) ; `create()` reste une grande fermeture : à découper sur une vraie couture (interaction) si `graph.js` dépasse ~500 lignes. |
| B7 | traité | `role="button"` sur les nœuds, `role="tooltip"` + `id="ld-tip"` sur la bulle, `aria-describedby` posé au focus et retiré au blur, `role="group"` sur le `<svg>`. Câbles et faisceaux au clavier : non fait ici (critique design, P1 Sam). |
| B8 | **à Orhan** | Deux commits : `feat(contracts)` (standalone ⇒ `members` vide) puis `feat(render)` (page de démonstration). Aucun commit fait sans sa demande. |
