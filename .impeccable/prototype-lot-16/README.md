# Prototype du lot 16 : le bloc de code

Coller sur le diagramme un bout de configuration ou de code, lisible, coloré si on le veut, copiable, et ne jamais
enregistrer un mot de passe sans l'avoir vu. Page autonome, données factices (secrets inventés), aucun fichier de
l'application touché (`docs/11-audit-ui-edition-et-plan.md` § Lot 16).

## Ouvrir

`file:///home/otosun/development/applications/demo/living-diagram-v12-biturbo/.impeccable/prototype-lot-16/index.html`

Aucune ressource externe : polices, icônes Lucide et Prism sont dans la page (`vendor/` recopié, `scripts/build.mjs`
assemble).

## Quoi essayer

- **Cliquer un bloc.** La barre du lot 4 bis, même dessin, même grammaire : teinte | **langage** (son nom, un volet),
  **police** (son nom écrit dans la police, un volet : chaque police avec un échantillon dans son propre rendu),
  **coloration** (bascule, absente sur un texte brut), **numéros de ligne**, **ajuster la hauteur au contenu** (seulement si
  la boîte n'y est pas déjà ; 60 lignes au plus), **taille** (champ libre 8 à 24, glisser l'icône, valeurs proposées) | plan, verrou | dupliquer,
  supprimer. **Copier** est dans l'en-tête du bloc et dans la fiche. La fiche s'ouvre à droite : le titre (champ), le
  code en entier, puis « Affichage » (repliée) avec les mêmes réglages que la barre et la hauteur de la boîte.
- **Le bloc Bash** (`sauvegarde-configs.sh`) est coloré ; le bouton « coloration » de la barre la coupe (texte brut, pastille du langage en pointillé) ou la rend, bloc par bloc.
  La rallumer par la barre.
- **La configuration Cisco de 120 lignes** sous `DC01-ACC-01` tient dans une boîte de 25 lignes et **défile dedans** :
  la sélectionner, puis la molette sur son code ; ou glisser le pouce de la barre de défilement (fine, à droite, visible
  au survol), cliquer la piste (une page), Page préc. / Page suiv. / Origine / Fin au clavier. Le pied dit discrètement
  « lignes 34-58 sur 120 ». Les **huit poignées** redimensionnent la boîte (aimant à la grille de 20). Dans la fiche, le
  code se lit en entier.
- **Double-clic** (ou Entrée) sur un bloc : on écrit dans un `textarea` en chasse fixe posé sur le code, la gouttière
  des numéros gardée et défilant avec lui. **Ctrl+Entrée** enregistre, **Échap** annule, **Tab** insère 4 espaces, un
  clic dehors enregistre. Double-clic sur l'en-tête : le titre, dans la fiche.
- **Coller** : Ctrl+V sur la toile avec du code dans le presse-papiers, ou les boutons « coller » du panneau du
  prototype (en bas à droite). Un texte de code devient un bloc, langage reconnu et appliqué, modifiable dans la barre.
  Les deux exemples réseau portent des secrets : **l'avertissement** s'ouvre avant tout enregistrement, à côté du bloc :
  chaque valeur avec sa ligne et sa nature (hash, type 7 réversible, en clair, chiffrée ENC), un point rouge dans la
  gouttière, et un clic sur une ligne de la liste **sélectionne la valeur dans le texte**. Trois issues : « Retirer ces
  valeurs » (remplacées par `<removed>` dans le texte enregistré), « Garder tel quel » (la valeur reste visible en rouge
  souligné, une alerte reste sur le bloc et dans la fiche, qui propose encore de les retirer) ou « Modifier le texte »
  (amène sur la première valeur). Échap pendant l'avertissement revient au texte ; Échap encore abandonne le collage.
- **Le volet du langage** sur un bloc mal déclaré : passer le YAML en « Texte brut » ; le volet dit « Le contenu
  ressemble à YAML » avec « appliquer ». Le point d'accent sur le bouton de la barre dit la même chose sans l'ouvrir.
- **Glisser un équipement** : les blocs qui lui sont attachés le suivent (ligne de rappel en tirets).
- **Thème clair** dans le panneau du prototype ; **sans nom** : lecture seule, ni barre ni écriture.

## Ce qui a été choisi, et pourquoi

- **Une carte de la même famille que les équipements** : un rail de la teinte à gauche, un en-tête (titre, langage en
  pastille, copier), une gouttière, un fond un cran plus creux que la toile. Le titre est facultatif ; sans titre,
  l'en-tête dit le nombre de lignes.
- **Onze familles de jetons, une couleur chacune**, tirées des douze teintes de l'application et réglées pour le
  texte : commentaire, mot-clé, chaîne, nombre, fonction, type ou interface, propriété, ponctuation, variable, **secret**
  (rouge souligné en pointillés : une valeur sensible gardée se voit) et **retiré** (`<removed>` en italique discret).
  Pas de choix de thème par bloc : les couleurs suivent le thème de l'application. Chaque couleur tient **4,83:1 au
  moins** sur le fond du bloc, de l'en-tête et de la gouttière, dans les deux thèmes (`node scripts/contrast.mjs`).
- **SVG sans HTML** : `Prism.tokenize` rend un arbre de chaînes et d'objets `Token`, jamais de HTML ; la page range
  chaque jeton dans une famille et le dessine en `<tspan class="tk-…">` (toile) ou `<span class="tk-…">` (fiche), par
  `createElement` et `textContent`. Aucun `innerHTML` depuis une donnée, aucun style en ligne : la couleur vient des
  jetons de la feuille de style (règles de l'application tenues).
- **Chasse fixe calculée, jamais mesurée** : JetBrains Mono vaut 0,6 em par caractère ; une ligne trop longue est
  coupée au caractère près avec un repère « › ». Pas de retour à la ligne automatique (une configuration ne se coupe
  pas). Les ligatures de la police sont coupées (`->` restait une flèche). Un nombre collé derrière une lettre ou un
  tiret n'est pas un nombre (`dc01-acc-01`) : règle de la page, valable pour toutes les grammaires (Cisco et YAML le
  coloraient).
- **La boîte a une hauteur libre et le code défile dedans** (réponse d'Orhan à la question 5 : « une très grosse
  configuration, je ne veux peut-être pas l'afficher en entier »). Le défilement va par ligne entière (le dessin reste
  calculé, sans mesure) ; seules les lignes visibles sont dessinées : un bloc de 2 000 lignes coûte sa fenêtre, pas son
  texte. « Ajuster la hauteur au contenu » montre tout, 60 lignes au plus (au-delà, il défile). Un collage arrive à la
  hauteur de son contenu, 24 lignes au plus. Un objet plus haut que la vue reçoit sa barre **à côté** de lui, jamais
  dessus (règle du lot 4).
- **La molette** (D2 : elle zoome la toile). Règle retenue : **elle fait défiler le code quand le pointeur est sur un
  bloc sélectionné seul** (ou en cours d'écriture : le textarea défile de lui-même) ; sur un bloc non sélectionné, sur
  plusieurs blocs sélectionnés, ailleurs, elle zoome la toile ; **Ctrl + molette zoome toujours** ; arrivé en haut ou en
  bas du code, **rien ne passe à la toile** (pas de zoom surprise au bout du texte). C'est l'usage des éditeurs qui
  embarquent un contenu défilant : il reste inerte tant qu'on ne l'a pas « activé ». tldraw active un embed par un
  double-clic (mode édition, <https://tldraw.dev/sdk-features/embed-shape>) ; ici le double-clic sert déjà à écrire,
  donc l'activation est la sélection (un clic), qu'on voit déjà (cadre d'accent, barre contextuelle, barre de
  défilement affichée). Vérifié dans Chromium : six crans de molette sur le bloc sélectionné le font défiler de 33
  lignes, la vue ne bouge pas. Au clavier, sur le bloc sélectionné : Page préc., Page suiv., Origine, Fin.
- **La position de défilement est un état de vue** : ni dans le contrat, ni dans le journal, ni dans l'historique (elle
  n'est pas annulable) ; chacun lit où il veut. Un **export ou une impression** (lot 11) montre la fenêtre de la boîte
  telle qu'enregistrée, **depuis la première ligne**, et le pied « lignes 1-25 sur 120 » : la feuille dit qu'il y a une
  suite ; le code entier se lit dans l'application ou se copie. (Une option d'export « déplier les blocs de code »
  pourra venir au lot 11.)
- **L'écriture s'ouvre là où l'on lit** : le textarea reprend la position de défilement, curseur sur la première ligne
  visible.
- **Copier** copie le texte tel qu'enregistré : un `<removed>` reste retiré.
- **Le marqueur `<removed>`** : la convention de RANCID pour les sauvegardes de configurations, lisible par un ingénieur
  réseau, et neutre vis-à-vis de la langue de l'interface (le texte enregistré est partagé, l'interface est bilingue).
- **Les valeurs sensibles se repèrent quel que soit le langage choisi** (une config Cisco déclarée « texte brut » est
  quand même lue) ; les motifs Cisco sont ceux de la grammaire `obsidian-cisco-syntax`, complétés pour FortiOS
  (`set password|psksecret|… [ENC] …`), Junos (`$9$…`), les clés privées (`-----BEGIN … PRIVATE KEY-----`) et les
  paires clé = valeur (YAML, JSON, Python, Bash : `password`, `secret`, `token`, `api_key`…, sauf une référence `$VAR`,
  `{{ vault_… }}`). Ancrés au début de la ligne pour les configurations : `description … password …` n'est pas un secret.
  L'avertissement montre la ligne, la valeur remplacée par des points : on ne la revoit jamais en clair dans la page.
- **Rien n'est envoyé ailleurs** : la détection est dans la page, sur le texte local.

## La police d'un bloc (retour d'Orhan)

Une entrée « police » dans la barre (le volet du lot 4 bis, **sans les graisses** : le gras se règle par B) et dans la
fiche. Chaque police est montrée dans son propre rendu : son nom, puis `interface Gi1/0/1  0O 1lI {}`, l'échantillon qui
départage ce qui compte dans une configuration (zéro et O, un, l et I, accolades).

**Chasse fixe seulement.** Une configuration s'aligne en colonnes (indentation des sous-commandes, tableaux de `show`,
listes de VLAN) ; une police proportionnelle les casse, et la toile ne pourrait plus calculer où couper une ligne sans
mesurer le texte. Inter n'est donc pas proposée pour le code.

| Police | Licence | Paquet (version exacte) | Poids, regular 400, latin + latin étendu | Chasse mesurée |
|---|---|---|---|---|
| **JetBrains Mono** (défaut) | OFL 1.1 | `@fontsource-variable/jetbrains-mono` 5.3.0, déjà dans `app.js` | 55,6 Ko (variable 100-800, **déjà servie** : 0 Ko de plus) | 0,600 em |
| IBM Plex Mono | OFL 1.1 | `@fontsource/ibm-plex-mono` 5.3.0 (2026-07-19) | 28,1 Ko (14,7 + 13,3) | 0,600 em |
| Source Code Pro | OFL 1.1 | `@fontsource/source-code-pro` 5.3.0 (2026-07-19 ; la 5.3.1 a moins de deux semaines) | 29,4 Ko (11,7 + 17,7) | 0,600 em |
| Cascadia Mono | OFL 1.1 | `@fontsource/cascadia-mono` 5.3.0 (2026-07-19) | 37,3 Ko (16,8 + 20,5) | **0,590 em** |

Fichiers recopiés dans `vendor/fonts/<police>/` avec la licence OFL de chacune (celle du paquet), jamais chargés depuis
un CDN. Pourquoi ces trois-là : **IBM Plex Mono** (dessin sobre, très lisible en petit, la plus légère),
**Source Code Pro** (l'une des plus répandues dans les éditeurs, Adobe), **Cascadia Mono** (la police du Terminal
Windows, familière à qui vit dans des sessions SSH ; la variante « Mono » n'a pas de ligatures). **Fira Code écartée** :
son seul atout, ce sont ses ligatures, qu'on doit couper (`->` deviendrait une flèche, faux dans du code) ; elle vaudrait
alors Fira Mono.

**Poids dans l'application** : chaque police est un fichier à part de `app.js`, servi par le backend comme Inter et
JetBrains aujourd'hui (`/assets/app/fonts/…`, `font-src 'self'`), déclaré par `@font-face` avec `unicode-range` :
le navigateur ne le télécharge **que si un bloc affiché l'utilise**, et seulement la plage de caractères rencontrée.
Une infrastructure sans bloc en Plex ne paie rien. Ici, dans le prototype autonome, tout est embarqué dans la page.

**La chasse, mesurée dans Chromium** (`python3 scripts/chasse.py` : l'avance de chaque caractère d'un échantillon
réseau, accents compris, à 100 px) : JetBrains Mono, IBM Plex Mono et Source Code Pro valent exactement 0,600 em,
Cascadia Mono **0,590 em**. L'estimation de 0,6 tient pour les trois premières ; pour Cascadia elle serait un peu large
(une ligne de 100 caractères coupée 1,7 caractère trop tôt : sans danger, le texte ne déborde jamais), mais le prototype
porte la valeur exacte par police (`CODE_FONTS[].em`), qui règle coupure et gouttière.

**« Monospace du système » : pas recommandé.** Aucun poids, mais la police change d'un poste à l'autre (DejaVu Sans Mono
ici, 0,600 em ; Consolas sous Windows, 0,55 em ; Menlo sous macOS, 0,602 em) : deux personnes ne voient pas le même
bloc, la coupure calculée sur 0,6 tombe faux (trop tôt avec Consolas, et une police plus large que 0,6 déborderait), et
l'export PNG / SVG (lot 11) dépendrait de la machine. Le contraire de ce que fait le reste de la toile.

Sources : <https://www.npmjs.com/package/@fontsource/ibm-plex-mono> · <https://www.npmjs.com/package/@fontsource/source-code-pro>
· <https://www.npmjs.com/package/@fontsource/cascadia-mono> · <https://www.npmjs.com/package/@fontsource-variable/jetbrains-mono>
· <https://openfontlicense.org> (OFL 1.1 ; texte complet dans chaque `vendor/fonts/*/LICENSE`).

## La bibliothèque : Prism, mesurée

Mesures faites ici (esbuild 0.28.2, minifié, avec Python, Bash, JSON et YAML ; `gzip -9`) :

| | Prism | highlight.js | Shiki |
|---|---|---|---|
| Version retenue | **1.30.0** (2025-03-10) | 11.12.0 (2026-08-12) | 4.4.3 (2026-08-10), la 4.5.0 a moins de deux semaines |
| Licence | MIT | BSD-3-Clause | MIT |
| Sortie | **`Prism.tokenize(texte, grammaire)` : un arbre de jetons, pur, sans DOM ni HTML** | une chaîne HTML (`hljs.highlight(...).value`) ; l'arbre interne (émetteur) n'est pas une API documentée | `codeToTokens` : des jetons avec une **couleur en hexadécimal** (thème), utilisable en SVG mais il faut un thème détourné ou les portées TextMate pour retrouver nos classes |
| Poids (4 langages) | **18,1 Ko / 7,7 Ko gzip** ; + Cisco 7,4 / 3,2 ; + FortiOS 1,1 / 0,6 | 30,4 Ko / 11,9 Ko | 294 Ko / 73 Ko (moteur d'expressions JavaScript, sans WASM) |
| Démarrage | synchrone | synchrone | asynchrone (chargement des grammaires, conversion des expressions Oniguruma) |
| Déterminisme | expressions JavaScript, ordre des règles écrit : même texte ⇒ mêmes jetons | idem | idem, mais deux moteurs possibles (Oniguruma WASM ou JS) qui peuvent différer |
| Grammaires réseau | Cisco réutilisable (ci-dessous) ; FortiOS et Junos à écrire | deux Cisco (ci-dessous) | aucune parmi les ~360 grammaires de `@shikijs/langs` ; mais **les grammaires TextMate des extensions VS Code se chargent** (Cisco, FortiOS) |
| Maintenance | 1.x en maintenance (dernière publication mars 2025), 2.0.0-alpha.1 publiée le 2026-09-08 ; grammaires stables depuis des années ; CVE-2024-53382 (DOM clobbering de `currentScript`) corrigée en 1.30.0 et sans objet ici (`manual: true`, jamais de recherche de `<code>` dans la page) | active | très active |

**Recommandation : Prism 1.30.0**, cœur et grammaires recopiés tels quels (`prism-core.min.js` et quatre grammaires du
paquet `prismjs`), `manual: true`. C'est la seule des trois dont la sortie se dessine en SVG sans détour, la plus
légère (environ 12 Ko gzip avec Cisco et FortiOS, à comparer aux ~855 Ko d'`app.js`), synchrone et testable sous Node
sans DOM (vérifié : `Prism.tokenize` tourne dans `vm`). Une grammaire Prism est une table de règles (expression,
`lookbehind`, `greedy`, `alias`), l'ordre faisant la priorité : en écrire une pour FortiOS a pris 25 lignes. Le jour où
Prism 2 sort en stable, la migration touche le chargement, pas nos grammaires ni notre rendu (à vérifier sur la 2.0
finale). Écarté : highlight.js (sortie HTML : il faudrait reparser son HTML ou dépendre d'une API interne) ; Shiki
(16 fois plus lourd, asynchrone, couleurs en ligne) malgré son vrai atout, les grammaires TextMate réseau déjà écrites.
`refractor` (Prism enveloppé, sortie hast, MIT, 5.0.0) n'apporte rien de plus que `Prism.tokenize`.

Sources : <https://www.npmjs.com/package/prismjs> · <https://prismjs.com/docs/Prism.html#.tokenize> ·
<https://github.com/PrismJS/prism/blob/v1.30.0/LICENSE> · <https://www.npmjs.com/package/highlight.js> ·
<https://github.com/highlightjs/highlight.js/blob/main/LICENSE> · <https://www.npmjs.com/package/shiki> ·
<https://shiki.style/guide/install> · <https://advisories.gitlab.com/npm/prismjs/CVE-2024-53382/> ·
<https://security-tracker.debian.org/tracker/CVE-2024-53382>

## Les grammaires réseau : ce qui existe, sous quelle licence

| Plateforme | Grammaire | Format | Licence (fichier LICENSE lu) | État | Verdict |
|---|---|---|---|---|---|
| Cisco IOS / IOS-XE / IOS-XR / NX-OS | [blakebratcher/obsidian-cisco-syntax](https://github.com/blakebratcher/obsidian-cisco-syntax) 0.2.0 (commit `14aa5b5`, 2026-07) | **Prism** | MIT, © 2026 Blake Bratcher | un auteur, peu d'étoiles, testée (`test/tokenize.test.ts`), 14 Ko de source | **reprise** : `vendor/prism-cisco.js`, recopiée telle quelle (types retirés), licence dans `vendor/LICENSE-obsidian-cisco-syntax` ; elle porte déjà un jeton `secret` |
| Cisco | [BMatheas/highlightjs-cisco-cli](https://github.com/BMatheas/highlightjs-cisco-cli) | highlight.js | MIT, © 2020 | inactive depuis 2020 | utile en lecture seulement (autre format) |
| Cisco (config + `show`) | [sudormvrf/highlightjs-cisco](https://github.com/sudormvrf/highlightjs-cisco) | highlight.js | MIT, © 2026 John Hudgins | récente, 68 Ko | idem ; ses règles `show` seraient une source d'idées |
| Cisco IOS, NX-OS, ASA, IOS-XR | [heyglen/network_tech](https://github.com/heyglen/network_tech) | Sublime (`.sublime-syntax`, 157 Ko pour IOS) | Apache-2.0 | 2024 | trop lourde à porter ; ASA un jour, peut-être |
| Cisco | [woodjme/vscode-cisco-syntax](https://github.com/woodjme/vscode-cisco-syntax), [Y-Ysss/vscode-cisco-config-highlight](https://github.com/Y-Ysss/vscode-cisco-config-highlight) | TextMate | MIT, MIT | actives | pour Shiki seulement |
| FortiOS | [GSGBen/fortigate-fortios-syntax](https://github.com/GSGBen/fortigate-fortios-syntax) (1,2 Ko), [testpilot031/fortios-config-studio](https://github.com/testpilot031/fortios-config-studio) (3,9 Ko) | TextMate | MIT, MIT | petites | **aucune grammaire Prism** : écrite ici, `src/prism-fortios.js`, 25 lignes, mêmes règles (config / edit / set / next / end, attributs, chaînes, adresses, `ENC`) |
| Junos | [nprintz/junos-sublime-pkg](https://github.com/nprintz/junos-sublime-pkg) | TextMate | **aucune licence** (dépôt sans fichier LICENSE : tous droits réservés) | 2016 | **non réutilisable** ; ses dérivés Atom (`language-juniper-junos`, MIT) en descendent, la chaîne de licence est douteuse |

**Coût d'une grammaire à écrire** (Junos) : une table de 15 à 20 règles (`set` / `delete` / `deactivate`, accolades et
`;`, `#` et `/* */`, `inactive:`, interfaces `ge-0/0/0.0`, adresses, `$9$…`), une demi-journée avec ses tests sur des
extraits factices. Pas de moteur à écrire.

Deux défauts de la grammaire Cisco, vus sur capture : un nombre collé derrière un tiret se colorait comme un nombre
(`dc01-acc-**01**` ; la grammaire YAML de Prism faisait de même sur `core-**02**`), **corrigé par une règle de la page**
(`codeLines`, toutes grammaires) sans toucher au fichier recopié ; beaucoup de mots-clés violets (la liste en compte
337, plus 88 protocoles), laissé à l'usage. La correction peut aussi être proposée à l'auteur.

## Ce que le contrat devra porter

Une cinquième sorte d'annotation, additive, dans la même mineure `Intent` que le lot 4 bis
(`contracts/src/ld_contracts/intent/annotations.py`) :

```
CodeContent
  kind          "code"
  text          1 à 20 000 caractères, multiligne ; ni tabulation ni retour chariot (la page les normalise au
                collage : CRLF → LF, tabulation → espaces à 4 colonnes) ; refus `code_text_too_long`
  language      plain | python | bash | json | yaml | cisco_ios | fortios   (énumération ; junos, une mineure plus tard)
  title         0 à 80 caractères, une ligne (PRINTABLE_OR_EMPTY)
  highlight     booléen (coloration)
  font          jetbrains_mono | ibm_plex_mono | source_code_pro | cascadia_mono   (défaut jetbrains_mono ;
                chasse fixe seulement ; séparé de `style.text_font`, qui reste sans | mono pour les autres sortes)
  line_numbers  booléen
```

- Le reste est celui de toute annotation (boîte, ancrage libre / équipement / groupe, plan, verrou, ligne de rappel,
  auteur, date, identité `a<révision>-<n>`) : connecteurs, presse-papiers (lot 3), Ctrl+Z, journal, sans exception.
- `h` : **libre**, comme toute annotation (20 à 4 000) ; à la création, la page l'écrit à la hauteur du contenu (24
  lignes au plus pour un collage). `folded` et `fold_lines` sont **retirés** (réponse 5). La position de défilement
  n'est pas dans le contrat : état de vue.
- Le style reprend `AnnotationStyle` ; défauts de la sorte `code` : `slate`, `text_size` 13 (bornée à 8-24 par
  l'interface), `text_font` mono imposé, `radius` 8.
- **Les secrets ne sont pas dans le contrat** : le serveur ne juge pas, la page avertit. Mais le texte enregistré entre
  dans `journal.jsonl` à chaque modification, en entier : retirer une valeur après coup ne l'efface pas du journal (seule
  `ld journal prune` le ferait). D'où l'avertissement **avant** l'enregistrement.
- Le texte d'un bloc entre dans la recherche (lot 2), comme celui d'une note.

## Les réponses d'Orhan (2026-10-14)

1. **Langages de la V1** : Python, Bash, JSON, YAML, Cisco IOS / NX-OS, FortiOS ; Junos plus tard. **À la
   recommandation.**
2. **Collage** : un texte de code (trois lignes au moins, langage reconnu) devient un bloc avec le langage appliqué,
   modifiable, annulable par Ctrl+Z ; sinon une note. **À la recommandation.**
3. **Valeurs sensibles** : avertir et proposer (« Retirer ces valeurs » en premier, « Garder tel quel » possible, une
   alerte reste). **À la recommandation.**
4. **Grammaire Cisco** : recopiée (MIT), corrigée chez nous au besoin, corrections proposées à l'auteur. **À la
   recommandation.**
5. **Hauteur** : **recommandation refusée.** Orhan : « une très grosse configuration, je ne veux peut-être pas l'afficher
   en entier dans Living Diagram, donc pouvoir scroller dans la fenêtre de code ». Fait : hauteur libre, le code défile
   dans la boîte, le repli disparaît, « ajuster la hauteur au contenu » (60 lignes au plus) le remplace ; règle de la
   molette ci-dessus.
6. **Polices** : JetBrains Mono par défaut, IBM Plex Mono, Source Code Pro, Cascadia Mono ; chasse fixe seulement ; pas
   de « monospace du système ». **À la recommandation.** Le volet ne montre plus le poids des fichiers (information de
   développeur, gardée ici dans le tableau des polices).

Pris sans question, réversible : coloration allumée à la création ; pas de retour à la ligne ; tabulation = 4 espaces ;
couleurs liées au thème de l'application, pas de thème par bloc ; copier sans raccourci clavier propre (Ctrl+C copie
déjà l'annotation entière, lot 3 ; Ctrl+Maj+C ouvre l'inspecteur de Chrome).

À juger à l'usage (pour `docs/a-juger-a-l-usage.md`) : la lisibilité au zoom d'ouverture (0,55 : du code de 13 px fait
7 px à l'écran ; le bloc se lit zoomé ou dans la fiche ; piste : de loin, l'en-tête seul et des barres à la place des
lignes) ; la densité de violet de la grammaire Cisco ; la largeur du panneau pour la fiche d'une configuration (560 px
sur les captures : la poignée de l'application le permet déjà).

## Captures

1440 × 900, thème sombre, sauf la 10. `1-python-colore` (bloc attaché au routeur, barre, « coloration » survolée,
fiche), `2-bash-colore` (Bash coloré ; le bouton « coloration » coupe ou rend la couleur par bloc), `3-yaml-json` (deux blocs attachés, lignes de rappel), `4-cisco-defile`
(120 lignes dans une boîte de 25, sélectionnée, défilées à la molette au milieu : barre visible, pouce survolé, « lignes
34-58 sur 120 », vue inchangée),
`6-fiche` (panneau élargi, titre, code coloré défilé jusqu'aux interfaces, « Affichage » ouverte : les réglages),
`7-volet-langage` (YAML déclaré texte brut, la détection propose YAML), `8-secrets` (collage d'une config Cisco : cinq
valeurs avec leur nature, points dans la gouttière, avertissement avant enregistrement), `8b-secrets-aller-a-la-valeur`
(clic sur la communauté SNMP : la valeur sélectionnée dans le texte), `9-secrets-retires` (collage FortiOS, valeurs
retirées : `<removed>` dans le bloc et la fiche), `11-secrets-gardes` (« Garder tel quel » : valeurs en rouge
soulignées, alerte sur le bloc et dans la fiche), `10-clair-1280` (FortiOS attaché au firewall, volet des tailles, la police dans la fiche), `12-volet-police` (le bloc
Cisco en IBM Plex Mono, Source Code Pro survolée ; la fiche montre la même liste).

## La revue de design

Une revue indépendante (skill impeccable, sur les captures et les sources) : **29 / 40**, « propre à ce produit, pas
d'AI slop », détecteur sans constat, contrastes tenus (4,83:1 au plus bas). **Ses quatre P1, corrigés** : les noms
coloriés à moitié (`dc01-acc-01`) ; la barre qui couvrait l'en-tête d'un bloc plus haut que la vue (posée à côté) ;
l'éditeur sans numéros ni repère alors que l'avertissement cite des lignes (gouttière gardée, point sur les lignes
signalées, clic qui sélectionne la valeur, « Modifier le texte ») ; « Masquer » ambigu (« Retirer ces valeurs »,
une ligne qui dit ce que fait le retrait, marqueur `<removed>` au lieu d'un littéral français). **Corrigés aussi** :
un seul nom par langage (« Cisco IOS / NX-OS », « Texte brut » ; la pastille dit `CISCO`, `TEXTE`) ; la fiche a de
vrais contrôles (langage, coloration, numéros, hauteur, taille) et un **titre** éditable ; titre de
fiche en Inter ; copier retiré de la barre (il était à côté de dupliquer, icône presque identique) ; « ajuster » absent
quand la boîte est déjà à la hauteur du contenu (jamais grisé) ; coloration absente sur un texte brut ; le choix du volet du langage
marqué par la coche seule ; « reconnu » retiré (deux signaux suffisent) ; la nature de chaque valeur sensible ;
l'avertissement aligné sur le haut du bloc ; capture de l'état « gardé tel quel » ; méta de la fiche raccourcie ; titre
du bloc à 13. **Laissés** : le volet des tailles posé loin de son bouton quand la place manque (placement hérité du lot
4 bis, à régler dans le lot) ; la barre posée sous le bloc Bash, sur le titre du bloc voisin (même placement) ; la
densité de violet de la grammaire Cisco (à l'usage).

Refaire : `node scripts/icons.mjs` (si la liste d'icônes change), `node scripts/build.mjs`, `python3 scripts/capture.py`,
`node scripts/contrast.mjs`, `python3 scripts/chasse.py`. Sources : `src/` (gabarit, trois feuilles de style, modules), `vendor/` (Prism et la
grammaire Cisco, avec leurs licences) ; `index.html` est construit. Repris du prototype du lot 4 bis : la barre, les
volets, le champ numérique, la toile factice.
