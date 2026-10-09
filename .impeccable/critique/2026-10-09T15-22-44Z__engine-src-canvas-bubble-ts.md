---
target: la bulle au survol (bubble.ts, tip.ts, canvas.css)
total_score: 19
max_score: 32
na_heuristics: 5,10
p0_count: 0
p1_count: 2
target_identity: "file:/home/otosun/development/applications/demo/living-diagram-v12-biturbo/engine/src/canvas/bubble.ts"
target_fingerprint: "sha256:fca1f565364be5a166f42bf3ff41b25f87e398081059b811f6c47df0bfa32dfb"
target_path: /home/otosun/development/applications/demo/living-diagram-v12-biturbo/engine/src/canvas/bubble.ts
timestamp: 2026-10-09T15-22-44Z
slug: engine-src-canvas-bubble-ts
---
Method: dual-agent (A : revue de design isolée · B : détecteur + preuves Chromium par CDP) + un troisième agent pour l'audit technique.

## Score de santé design (bulle au survol, après la seconde passe du 2026-10-09)

| # | Heuristique | Score | Enjeu clé |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | Points d'état, collecte, diff présents ; le diff en chemins de contrat (`aggregate_a, evidence, oper`) |
| 2 | Correspondance avec le monde réel | 2 | « lien up », `success`, `ACTIVE_PASSIVE`, « absent de interfaces[] » : des jetons là où l'inspecteur parle en mots |
| 3 | Contrôle et liberté | 2 | La bulle suit le pointeur sans temporisation, pas d'Échap (WCAG 1.4.13 non tenu) |
| 4 | Cohérence et standards | 2 | Icône de type + pastille de type ; nature du faisceau en rangée, celle du cluster en en-tête ; 11,5 / 12,5 là où l'inspecteur dit 12 / 13 / 15 ; `≡` lu comme un menu |
| 5 | Prévention des erreurs | n/a | Aucune action possible dans la bulle |
| 6 | Reconnaissance plutôt que rappel | 3 | Codes de contrôle sans leur sens ; quatre « — » demandent de deviner |
| 7 | Flexibilité et efficacité | 2 | Balayer dix câbles lève dix bulles ; pas de forme courte des ports |
| 8 | Esthétique et minimalisme | 3 | Aérée et structurée ; restent des redondances (absence dite trois fois, HA + mode) |
| 9 | Reconnaître et diagnostiquer | 2 | `link_speed_mismatch` trois lignes sous les deux vitesses qu'il vise ; sévérité par la couleur d'un point |
| 10 | Aide et documentation | n/a | Sans objet pour une bulle |
| **Total** | | **19 / 32** | **Acceptable (59 %)** |

Audit technique (cinq dimensions, après les correctifs du jour) : accessibilité 2 · performance 3 · thématisation 3 · responsive 3 · intégrité 3 = **14 / 20, « bon »** (12 / 20 avant les correctifs).

## Verdict de spécificité

Écrite pour ce produit : deux colonnes « un bout par colonne, un fait par ligne » (un câble est symétrique), les deux points de l'icône aux teintes des deux équipements, LLDP + CDP + Description, rôle HA avec priorité, PEER-LINK / MLAG n, la vue Diagramme qui tait le verdict. Là où elle est la plus spécifique elle est la moins dessinée : `success`, `active_passive`, « lien up », « absent de interfaces[] » sont des jetons du snapshot recopiés. Et le tableau ne fait pas tout ce qu'il promet : il juxtapose `1 Gb/s` et `10 Gb/s` sans marquer le désaccord.

Détecteur : exit 2, cinq constats, tous dans `viewer.css` hors du bloc de la bulle (deux `side-tab` sur `.diff-note` / `.intent-note`, trois `border-accent-on-rounded` dont trois faux positifs : onglet à bordure transparente, échantillons de légende à hauteur 0). `--scope layout` et `--scope type` : vides. Zéro constat sur `bubble.ts`, `tip.ts`, `canvas.css`.

Overlay navigateur : impossible dans l'application (CSP `script-src 'self'` refuse le script injecté ; évalué par DevTools, son cœur WebAssembly est refusé faute de `wasm-unsafe-eval`). Preuves prises par CDP : styles calculés, contrastes, `getBBox`, journal des attributs, émulation `prefers-reduced-motion`.

## Ce que les trois lectures ont trouvé, et ce qui est déjà corrigé

Cinq défauts purs, tous corrigés et remesurés le jour même :
1. **Les rôles « méta » ne sortaient pas en gris** (B) : `.tip text { fill: var(--ink) }` (0,1,1) l'emportait sur `.tip-label { fill: var(--ink-3) }` (0,1,0) ; tout était en encre pleine, la hiérarchie ne tenait que par la graisse (A l'avait noté sans en voir la cause). Corrigé dans les deux feuilles : mesuré `#7f90a6` / `#5a687a` sur libellés, ports, sous-titres.
2. **Mono rendue plus large que l'estimation** (audit, B) : la couche de la bulle n'était pas sous `.flow svg text { text-rendering: geometricPrecision }` ; avances entières (8,0 px au lieu de 7,75), marge droite 12,8 au lieu de 16, texte des pastilles à 2 px du bord. Corrigé : `.tip text` porte la règle ; marge droite remesurée 19 (câble) / 29 (équipement), gap pastille 6,6-6,9.
3. **La pastille collait au titre** (A) : l'Inter 600 est ~5 % plus large que l'estimation faite en 400 ; facteur `BOLD` 1,05 et espace de fin des pastilles retiré. Mesuré : 7,1 px entre titre et pastille.
4. **La bulle passait sous la bande, la barre et le panneau** (B, audit) : `place()` calait sur l'hôte entier. Corrigé : la zone visible vient des insets de la toile (barre 56, bande 84, panneau 348). Mesuré au coin bas-droit : bas de bulle 816 < bande 842, droite 1 040 < panneau 1 080.
5. **`/view` clair : pastilles du diff sous AA** (audit, B : AJOUTÉ 2,89, RETIRÉ 3,17, CHANGÉ 3,90) : texte tiré à 40 % vers l'encre ; calculé ≥ 4,78 partout (ajouté 5,38).
Au passage : carte `.tip-end-dot.hue-*` dupliquée supprimée (ordre des règles), règle redondante retirée, clé de survol qui porte la vue (`:control`), paramètre qui masquait un garde de type renommé.

## Ce qui marche

- **Le tableau symétrique** : un bout par colonne, libellés à gauche, chasse fixe et `tabular-nums` ; la comparaison est possible d'un coup d'œil (A, B : rythme 23 / 23 / 23 mesuré, aucun débordement, aucune sortie du canevas).
- **Contrastes solides** dans l'application : `--ink-3` 5,42 / 5,68 à 11 px, tous les tons de pastille ≥ 4,62 dans les deux thèmes, états toujours appariés à un mot (`up`, `down`, `success`).
- **Le mouvement** : arrivée 180 ms de caché à visible, jamais rejouée le long d'un câble (journal : zéro bascule de classe), sortie immédiate, fondu seul sous mouvement réduit (transform `none` sur 29 échantillons). Nuance (B) : d'un câble à son voisin React Flow émet `leave` puis `move`, l'arrivée est donc rejouée.
- CSP tenue, aucun style en ligne, zéro erreur console ; tsc strict, build à jour, tests Node verts.

## Problèmes prioritaires (ouverts)

**[P1] Le registre : des jetons là où l'inspecteur parle** — « lien up / unknown », `collecte ● success`, pastille `ACTIVE_PASSIVE`, « absent de interfaces[] », chemins du diff. Pourquoi : le même jour l'inspecteur est passé en mots (« injoignable », diff en mots) ; la bulle est la surface la plus vue. Fix : un dictionnaire partagé (collecte, état du lien, mode HA) dans `format.ts`, le code de contrôle sous une ligne en clair. `/impeccable clarify`.

**[P1] La bulle d'un câble ne marque pas le désaccord** — `1 Gb/s | 10 Gb/s` en encre neutre, `link_speed_mismatch` trois lignes plus bas. Pourquoi : les deux bouts côte à côte sont l'avantage unique de cette bulle. Fix : en Contrôle, teinter les deux valeurs de la rangée visée par un contrôle R5 (`link_speed_mismatch` → vitesse, `link_oper_mismatch` → état) et poser le point de sévérité devant le libellé. `/impeccable clarify` + `colorize`.

**[P2] Aucune borne de largeur** — deux hostnames de 40 caractères : 748 px ; de 63 : 1 102 px ; le contrat admet 253 ; une liste de capacités ou une note font 450-760 px. Fix : largeur maximale nommée, raccourcissement au milieu des noms (comme `card.ts`), plafond des chemins. `/impeccable adapt`.

**[P2] Une bulle qui suit le curseur, sans temporisation** — `place()` à chaque mouvement, aucune attente avant la première apparition, pas d'Échap. Pourquoi : en balayant la toile on fait « pop-corn », et la bulle glisse pendant qu'on lit. Fix : 80-120 ms avant la première apparition (instantané ensuite), bulle posée (immobile tant que la clé ne change pas), Échap la cache. `/impeccable animate` + `harden`.

**[P2] Pas de chemin clavier dans l'application** — couche `aria-hidden`, le focus d'une carte ne montre rien (mesuré), alors que `/view` branche focus → bulle → `aria-describedby`. Soit la parité, soit la décision écrite « la fiche suffit » (Entrée ouvre la fiche). `/impeccable harden`.

**[P2] Redondances** — icône de type + pastille SWITCH / FIREWALL ; `HA` + `ACTIVE_PASSIVE` ; nature du faisceau sur sa propre rangée ; absence d'un bout dite trois fois (nom estompé, quatre « — », note). `/impeccable distill`.

**[P2] Le dessin n'est pas testé** — seuls les mots (`text()`) servent d'oracle ; `draw`, `measure`, `columns`, `place` n'ont aucun test ; une régression du dessin passe tout. `/impeccable harden`.

**[P2] La gravité d'un contrôle n'est dite que par la couleur** (WCAG 1.4.1) — un point de 3 px ; c'est la grammaire de la barre et de l'inspecteur, à décider une fois pour l'application entière. `/impeccable clarify`.

## Drapeaux par persona

- **Alex (expert)** : veut `Te1/1/1` dans la bulle (nom complet dans la fiche) ; le désaccord marqué ; est agacé par la bulle qui glisse sous sa lecture ; apprécie que Diagramme ne verdicte pas.
- **Sam (clavier, lecteur d'écran)** : dans l'application la bulle est souris seule (couche `aria-hidden`) ; dans `/view` le SVG se lit « vitesse 1 Gb/s 1 Gb/s » sans savoir quel bout, et la sévérité n'est pas lue.
- **L'ingénieur qui audite le câblage** : la bulle répond à « pourquoi ce câble est tracé » (sources) ; pas à « que dit la description » ni à « qu'est-ce qui a changé » (chemins de contrat) ; « CONFIRMÉ » au-dessus de `neighbor_unknown` demande une explication.

## Observations mineures

Échelle typographique en cinq tailles dans 2,5 px (11, 11,5, 12, 12,5, 13,5) contre 12 / 13 / 15 dans l'inspecteur ; `≡` du faisceau lu comme un menu, bouclier coché du cluster qui connote un verdict ; « câbles 1 » (pluriel figé) ; point de la rangée `rôle` coloré par l'état et placé devant le rôle ; `fortinet` en minuscules ; `1 Gb/s` ici, `1G` sur les pastilles de vitesse de la toile ; `wireless_controller` dépasse `PILL_MAX` ; durées et graisse claire hors jetons ; lignes de base en nombres littéraux ; pas de `dispose()` ; bloc `/view` quasi dupliqué ; tactile sans bulle (non documenté) ; deux captures de la planche montrent un faisceau au lieu du câble documenté (DOCUMENTÉ SEUL non vérifié sur capture).

## Questions à se poser

1. Si la bulle est le coup d'œil et l'inspecteur la lecture, pourquoi porte-t-elle encore le diff et jusqu'à six contrôles ? Une seule ligne de verdict (« confirmé · 1 avertissement : vitesses différentes ») dirait-elle tout ce qu'un survol doit dire ?
2. Quatre « — » pour un bout absent : une information, ou le gabarit qui se montre ?
3. Une bulle qui suit le pointeur est-elle encore une bulle ? Ancrée au câble, elle deviendrait une étiquette, et pourrait rester quand on relâche.
