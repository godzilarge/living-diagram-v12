# Revue indépendante : lot 16, le bloc de code (Intent 1.6.0)

- **Date** : 2026-10-15
- **Périmètre** : `git diff 23f1aa0 dd4d5d1` (commit `dd4d5d1`, worktree `agent-a22f7fc3dd7c7866f`), hors bundles générés,
  polices et `.impeccable/`. Couvre le contrat (`contracts/src/ld_contracts/intent/*`, schéma, `CONTRAT.md`), le backend
  (`cli.py`, `journal*.py`), le moteur pur (`engine/src/app/code/*`), la toile et l'édition (`app/canvas/code*.tsx`,
  `annotation.tsx`), les commandes (`state/code-commands.ts`, `code-bar.ts`), la fiche, les volets, la recherche, le
  journal, le presse-papiers, les catalogues.
- **Méthode** : lecture du diff et du code qu'il touche ; spécification et écarts déclarés relus (`docs/11` § Lot 16,
  `CLAUDE.md`, `contracts/README.md` § Décisions). Sondes Node lancées sur le `app.js` livré (`LDApp.code`). Tests
  relancés : contrats **637 passés** ; backend `test_intent`, `test_api_intent`, `test_cli_intent`, `test_journal` :
  **64 passés** ; `node --test backend/tests/js/code.test.js` : **9/9** ; Chromium `tests/test_app_code.py` seul :
  **2 passés** ; `npm run check` propre (tsc, dérive des bundles et des types, `strings.mjs`). Chaque constat ci-dessous
  a été vérifié, par lecture ou par sonde. Aucune supposition n'est rapportée comme fait.
- Rapport consigné tel que rendu par le relecteur ; le suivi est à la fin.

## Synthèse

| Gravité | Nombre |
|---|---|
| Critique | 0 |
| Haut | 2 |
| Moyen | 5, dont 2 à juger par Orhan |
| Bas | 5 |
| Remarques | 4 |

Impression d'ensemble : le lot est propre et bien découpé.
- Le contrat est strictement additif. `upgraded()` relit un 1.5.x sans rien changer (testé). Les bornes et les refus sont
  portés par le type. Les 422 ne renvoient aucune valeur reçue (testé).
- Prism n'est servi que par `tokenize`. `manual: true` est posé **avant** le chargement du cœur : vérifié dans le `app.js`
  construit, `ON.Prism||(ON.Prism={manual:!0,…})` précède l'unique `require` du cœur.
- Aucun HTML n'est écrit depuis une donnée, aucun style en ligne n'est posé (variables CSS par le CSSOM). La grammaire
  tierce est vendue avec sa licence et son commit d'origine.
- Seules les lignes visibles sont dessinées. Le défilement vit dans un petit magasin à part (`code/view.ts`) et ne
  reconstruit pas la toile.
- Le texte d'un bloc n'est jamais un nom : vérifié pour les sujets du journal, `ld intent`, l'aide accessible et
  `summary()`.

Le point faible est **la promesse « ne jamais enregistrer un mot de passe sans l'avoir vu »** :
- la détection manque des secrets courants dans une configuration réseau ;
- « Retirer » peut laisser une partie de la valeur en clair ;
- plusieurs chemins enregistrent ou perdent du texte sans le dire.

## Constats

### H1 (haut) : la détection des secrets manque des formes courantes, et ne trouve qu'une valeur par règle et par ligne

`engine/src/app/code/secrets.ts:24-36` (règles), `:61-70` (une seule recherche `exec` sans `g` par règle).

**Ce qui manque**, mesuré par la sonde S1 sur le bundle livré (26 cas, 23 manqués en tout ou en partie) :
- **Cisco** :
  - `radius-server host … key <clair>` et `radius-server key <clair>` ;
  - `tacacs-server key <clair>`, et ` key <clair>` dans un bloc `tacacs server` (la règle `aaaKey` exige un type
    `0|6|7`) ;
  - `neighbor … password [7] …` (BGP) ;
  - `ip ospf message-digest-key 1 md5 …` et `ip ospf authentication-key …` ;
  - `standby … authentication md5 key-string …` (`keyString` est ancrée en début de ligne) ;
  - `snmp-server user … auth sha <p> priv aes 128 <p>` (IOS-XE et NX-OS) ;
  - la communauté de `snmp-server host … version 2c <communauté>` ;
  - `wpa-psk ascii 0 …`.
- **Bash** : `curl -H "Authorization: Bearer …"`, `curl -u user:pass`, `mysql -p…`, `sshpass -p '…'`.
- **YAML (Ansible)** : `ansible_ssh_pass:` et `ansible_become_pass:` (la règle générique connaît `password|passwd|pwd`,
  pas `pass`), `snmp_community:`.
- **JSON minifié sur une ligne** : `{"user":"a","password":"…","api_key":"…"}` ne trouve que le premier.
- `password=… token=…` sur une même ligne : seul le premier est trouvé.
- **FortiOS** : la communauté SNMP (`config system snmp community` → `set name "…"`).
- Une clé PGP (`-----BEGIN PGP PRIVATE KEY BLOCK-----`) n'est pas reconnue par `KEY_BEGIN`.

**Scénario de défaillance** : Orhan colle un extrait IOS-XE (`radius server`, `key Radius-S3cret`, BGP `neighbor …
password`). La page ne dit rien, le bloc s'enregistre aussitôt (`code-commands.ts:88`, aucun secret trouvé ⇒
`codeCreate` direct). La valeur est alors lisible par tous ceux qui ouvrent l'infrastructure et reste dans le journal.
Les points rouges et l'alerte « gardé tel quel » reposent sur la même détection : ils manquent les mêmes valeurs.

**Correction proposée** :
1. Boucle `g` pour la règle générique, et pour les règles Cisco qui peuvent porter deux valeurs (SNMPv3 `auth` /
   `priv`), afin d'avoir toutes les valeurs d'une ligne.
2. Rendre le type facultatif dans `aaaKey` (`key[ \t]+(?:(?:0|6|7)[ \t]+)?`).
3. Règles non ancrées pour `neighbor \S+ password`, `message-digest-key \d+ md5`, `authentication-key`, `key-string`
   (précédé de `authentication md5`), `snmp-server user … auth \w+ (v) priv (?:\w+ )*(v)`, `snmp-server host …
   (?:version \S+ )?(v)`, `wpa-psk ascii \d (v)`.
4. Ajouter `pass\b` et `community` à la liste générique, et Bearer, `-u user:`, `-p…` pour le shell.
5. Ajouter les sondes S1 aux tests Node, en table de cas (avec une colonne « attendu manqué » assumée, si certains
   restent hors périmètre).

**Sonde S1** (`revue-lot16/secrets_probe.js` ; `load.js` en annexe) :
```js
"use strict";
const { code } = require("./load.js")();
const cases = {
  "radius key sans type": "radius-server host 10.0.0.5 key Radius-S3cret",
  "radius-server key nu": "radius-server key Radius-S3cret",
  "tacacs key sans type": "tacacs-server key Tac-S3cret",
  "tacacs server bloc key nu": " key Tac-S3cret",
  "bgp neighbor password": " neighbor 10.0.0.1 password 7 0822455D0A16",
  "bgp neighbor password clair": " neighbor 10.0.0.1 password Bgp-S3cret",
  "ospf md5": " ip ospf message-digest-key 1 md5 Ospf-S3cret",
  "ospf auth-key": " ip ospf authentication-key Ospf-S3cret",
  "hsrp key-string": " standby 1 authentication md5 key-string Hsrp-S3cret",
  "snmp v3 user": "snmp-server user netops grp v3 auth sha Auth-S3cret priv aes 128 Priv-S3cret",
  "snmp host community": "snmp-server host 10.0.0.9 version 2c Comm-S3cret",
  "nxos snmp user": "snmp-server user admin network-admin auth md5 Auth-S3cret priv Priv-S3cret",
  "wpa psk": " wpa-psk ascii 0 Wifi-S3cret",
  "bearer header": 'curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def" https://api',
  "curl -u": "curl -u admin:Curl-S3cret https://api",
  "mysql -p": "mysql -u root -pMy-S3cret db",
  "sshpass": "sshpass -p 'Ssh-S3cret' ssh admin@sw1",
  "export TOKEN": "export API_TOKEN=tok-S3cret",
  "ansible_ssh_pass": "ansible_ssh_pass: Ans-S3cret",
  "ansible_become_pass": "ansible_become_pass: Ans-S3cret",
  "yaml community": "snmp_community: Comm-S3cret",
  "json minifié": '{"user":"a","password":"P1-S3cret","api_key":"K2-S3cret"}',
  "deux clés = sur une ligne": "password=P1-S3cret token=T2-S3cret",
  "pem": "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----",
  "fortios snmp": "config system snmp community\n    edit 1\n        set name \"Comm-S3cret\"\n    next\nend",
  "fortios set password": "        set password ENC SH2vE9pQ1zR8tY4uI0oP3aS6dF7gH2",
};
for (const [name, text] of Object.entries(cases)) {
  const found = code.findSecrets(text);
  const values = found.map((f) => text.split("\n")[f.line].slice(f.start, f.end));
  const missed = (text.match(/[\w-]*S3cret|eyJ[\w.]+|b3BlbnNz\w+|0822455D0A16/g) || []).filter((v) => !values.some((x) => x.includes(v)));
  console.log((missed.length ? "MANQUÉ " : "ok     ") + name.padEnd(28) + " trouvés=" + JSON.stringify(values) + (missed.length ? " manqués=" + JSON.stringify(missed) : ""));
}
```
Résultat : `ok` seulement pour `export TOKEN`, `pem` et `fortios set password`. Tous les autres sont `MANQUÉ` ; pour les
deux cas sur une ligne, seul le premier secret est trouvé.

### H2 (haut) : « Retirer ces valeurs » laisse une partie du secret en clair

`engine/src/app/code/secrets.ts:35`. La valeur de la règle générique est `[^\s,#}]+` quand elle n'est pas entre
guillemets.

**Scénario de défaillance** : `password=Ab#Cd-S3cret` (un `#` dans un mot de passe est banal) devient
`password=<removed>#Cd-S3cret`. La page annonce « 1 valeur retirée du texte », mais la fin du mot de passe est
enregistrée en clair. Même chose pour :
- une phrase de passe YAML non citée : `db_password: correct horse battery S3cret` → `<removed> horse battery S3cret` ;
- une substitution Bash : `PASSWORD=$(cat /etc/S3cret)` → `<removed> /etc/S3cret)`.

En YAML comme en Bash, un `#` qui n'est pas précédé d'une espace **ne commence pas** un commentaire ; l'arrêt sur `#`
est donc faux dans les deux langages.

**Correction proposée** :
- valeur non citée jusqu'à `\s#` ou la fin de ligne en YAML ou `key: value` (`(?<v>[^\n]*?)(?=\s+#|\s*$)`) ;
- jusqu'au prochain blanc en `key=value`, sans exclure `#` ;
- `$(…)` traité comme une valeur entière ou comme une référence (dans `NOT_A_SECRET`, comme `$VAR`) ;
- un test qui vérifie qu'aucun fragment de la valeur ne survit à `maskSecrets`.

**Sonde S2** (`revue-lot16/mask_probe.js`) :
```js
"use strict";
const { code } = require("./load.js")();
for (const text of ["password=Ab#Cd-S3cret", "db_password: correct horse battery S3cret", "PASSWORD=$(cat /etc/S3cret)"])
  console.log(JSON.stringify(text), "→", JSON.stringify(code.maskSecrets(text)));
// "password=<removed>#Cd-S3cret" · "db_password: <removed> horse battery S3cret" · "PASSWORD=<removed> /etc/S3cret)"
```

### M1 (moyen) : une écriture démontée avec une valeur sensible est perdue sans rien dire, y compris une valeur déjà « gardée »

`engine/src/app/canvas/code-edit.tsx:52-57` et `engine/src/app/canvas/annotation.tsx` (`codeDone` : `if (text === null …)
return;`).

Le commentaire dit « rien ne s'écrit et la page le dit ». Pour un bloc existant, `onDone(null)` aboutit à `codeDone`, qui
ferme l'écriture **sans aucun message**. Seul le brouillon (`saveOnLeave=false` → `codeCancel`) le dit.

De plus, `findSecrets` retrouve aussi les valeurs déjà **gardées telles quelles** : pour un bloc qui porte une alerte
acceptée, **toute** écriture démontée est perdue.

**Scénario** :
1. Double-clic sur un bloc dont l'alerte a été acceptée.
2. Modification de dix lignes.
3. Zoom à la molette hors du champ (la molette ne retire pas le focus) : le nœud sort de l'écran et la culture
   (`onlyRenderVisibleElements`, `Flow.tsx:447`) le démonte.
4. Les modifications disparaissent sans message.

**Correction proposée** : au démontage avec secret, garder le texte en brouillon (`codeView.setDraft` avec l'identité du
bloc) et rouvrir l'avertissement au retour. À défaut, au minimum `codeSay(t("shell:code.notSaved"))`. Séparément : ne
compter que les valeurs **nouvelles** par rapport au texte enregistré, pour ne pas redemander pour une valeur déjà gardée
(voir aussi la question 3 pour Orhan).

### M2 (moyen) : un texte trop long ferme l'écriture puis refuse : le texte saisi est perdu

`engine/src/app/state/code-commands.ts:93-96` (`codeView.setDraft(null)` **avant** `ready(text)`) et `:115` (`codeSave` :
l'éditeur a déjà appelé `finish`, `setEditing(false)` a fermé le champ). Le `textarea` n'a pas de `maxLength`
(`code-edit.tsx:123`), et le collage dans le champ (`code-edit.tsx:102-111`) ne vérifie pas la longueur.

**Scénario** :
1. Insérer un bloc.
2. Coller 25 000 caractères dans le brouillon.
3. Ctrl+Entrée.
4. « bloc de code trop long » s'affiche, et le brouillon a disparu avec tout ce qui avait été écrit ou retouché.

Même chose en éditant un bloc existant.

**Correction proposée** : vérifier la longueur dans `commit()` de `CodeEditor`, avant `finish`. Le champ reste ouvert,
le dépassement est dit, `maxLength={CODE_MAX}` est posé sur le `textarea`. Dans `codeCreate`, ne vider le brouillon
qu'après `ready`.

### M3 (moyen) : deux chemins d'enregistrement sans avertissement

1. **Un collage court devient une note.** `state/store.tsx` (`paste`) passe à `createAnnotation({kind:"note"…})` quand
   `pastedAsCode` rend `null`, c'est-à-dire sous trois lignes ou sans langage reconnu. Les notes n'ont aucune détection.
   Sonde S3 : `enable secret 0 …\nusername admin password 0 …` (2 lignes, 2 secrets) ou `snmp-server community … RO`
   (1 ligne) s'enregistrent en note, en silence.
2. **Le presse-papiers du lot 3, d'une infrastructure à l'autre.** `state/clipboard-commands.ts` ne passe pas par
   `findSecrets` (vérifié : aucune occurrence). Un bloc dont la valeur a été « gardée » dans l'infrastructure A, copié
   puis collé dans B, est écrit dans B sans avertissement. Or l'avertissement nomme justement l'audience (« lu par tous
   ceux qui ouvrent {{infrastructure}} »), et B est une autre audience.

**Correction proposée** :
- pour le premier chemin : tout texte collé dont `findSecrets` trouve quelque chose passe par le brouillon de bloc de
  code (ou par l'avertissement), quel que soit le nombre de lignes ;
- pour le second : avant un collage dont l'infrastructure d'origine diffère, lister les blocs du collage qui portent des
  valeurs sensibles et proposer de les retirer.

**Sonde S3** (`revue-lot16/paste_probe.js`) :
```js
const { code } = require("./load.js")();
const t = "enable secret 0 Cl34r-S3cret\nusername admin password 0 Adm-S3cret";
console.log(!!code.pastedAsCode(t), code.findSecrets(t).length); // false 2
```

### M4 (moyen, à juger par Orhan) : un texte qui n'est pas du code devient un bloc de code au collage

`engine/src/app/code/languages.ts:183-188`. `pastedAsCode` accepte toute détection autre que `plain`, même `sure=false`
(le seuil est 0,2).

Sonde S4, sur des textes qu'on collerait en note :

| Texte collé | Devient |
|---|---|
| Liste à puces de trois lignes | bloc **YAML** (score 0,3, non sûr) |
| « Intervention prévue : / Début: 22h / Fin: 23h » | bloc YAML |
| Adresse avec « Contact: … » | bloc YAML |
| Tableau texte à `\|` | bloc **Bash**, « sûr » (`.*\|\s*\w` sur chaque ligne) |

Avant le lot, ces textes devenaient des notes.

**Proposition** : exiger `sure` pour le collage, et retirer `.*\|\s*\w` et `.*&&` des marqueurs Bash forts (ou les
pondérer). La règle validée était « trois lignes et un langage reconnu » ; c'est donc à Orhan de dire si « reconnu » veut
dire « sûr ».

**Sonde S4** (`revue-lot16/detect_probe.js`) :
```js
const { code } = require("./load.js")();
for (const t of ["- vérifier le cœur\n- remplacer l'optique\n- appeler le NOC", "site | baie | U\ndc01 | 4 | 22\ndc02 | 7 | 10"])
  console.log(code.pastedAsCode(t)); // {id:"yaml",sure:false,…} · {id:"bash",sure:true,…}
```

### M5 (moyen, à juger par Orhan) : une valeur retirée après coup reste lisible dans le journal, l'export et l'API ; chaque réglage réécrit tout le texte au journal

- `code-commands.ts:150-155` (`codeSet`) et `:119` envoient `content: {...found.c, …}`, c'est-à-dire **tout le texte**,
  jusqu'à 20 000 caractères, pour changer une police, la coloration ou les numéros. Chaque clic ajoute ce texte au
  `journal.jsonl`.
- `GET /api/intent/journal` renvoie les `ops` brutes (`journal.py`, `JournalEntry(ops=ops)`).
- La vue Journal les affiche dans « Brut » (`components/journal/Row.tsx:67-72`, `JSON.stringify`).
- L'export CSV les écrit (`state/journal-csv.ts:32`).
- La recherche du journal les indexe (`texts_of(ops)`).

**Scénario** : un bloc gardé avec un secret, puis « Retirer ces valeurs » depuis la fiche. La fiche dit « 1 valeur
retirée du texte », mais le secret reste en clair dans « Brut », dans le CSV remis à un auditeur et dans l'API, jusqu'à
une purge par catégorie et par date (`ld journal prune`), qui emporterait aussi toutes les autres annotations de la
période.

L'avertissement initial dit bien « reste dans le journal », mais le message de retrait ne le rappelle pas. L'écart
déclaré (8), « jamais dans le journal », vaut pour les **noms**, pas pour le contenu.

**Options** :
- (a) le dire dans le message de retrait (« retirée du bloc ; l'historique la garde ») ;
- (b) un patch partiel du contenu d'un bloc (`code_set` sans `text`), qui supprime aussi la réécriture de 20 Ko par
  clic ;
- (c) masquer `text` dans « Brut » et dans le CSV (longueur et empreinte), le journal disque restant la trace complète.

### B1 (bas) : Home, Fin, Page préc. et Page suiv. sont capturés partout dès qu'un bloc est sélectionné seul, même s'il ne défile pas

`engine/src/app/canvas/code.tsx:171-183`. L'écouteur est posé sur `window` en capture, avec ce sélecteur d'exclusion :
`.panel, .fvolet, .search, .journal, [role=dialog], [role=menu]`. La barre contextuelle (`.fbar`, `role="toolbar"`) n'y
est pas, alors qu'elle utilise justement Home et Fin pour son focus itinérant (`FloatingBar.tsx:403-404`).

Par ailleurs, `keyScroll` (`geometry.ts:99-103`) rend 0 pour Home ou Fin même quand le bloc ne défile pas : la touche est
donc prise (`preventDefault` et `stopPropagation`) sans aucun effet.

**Scénario** : bloc sélectionné, Alt+T, Fin : le focus ne va pas au dernier bouton de la barre.

**Correction** : ajouter `[role=toolbar]` (ou `.fbar`) au sélecteur, et sortir quand `!now().scrolls`.

### B2 (bas) : des lignes vides en tête décalent les numéros de l'avertissement, le point rouge et la sélection

`code-edit.tsx:76-95`. `findSecrets` travaille sur `normalizeCode(el.value)`, qui retire les lignes vides de bord et
convertit les tabulations. Mais `select(f)` et la gouttière (`flagged`) indexent `el.value` brut.

**Scénario** : deux lignes vides puis `enable secret 0 x` en ligne 3. L'avertissement dit « ligne 1 », le point rouge est
sur la ligne 1, et le clic sélectionne le début de la ligne 1.

Une tabulation peut aussi entrer par glisser-déposer : `onPaste` est contourné, et les colonnes se décalent.

**Correction** : remplacer d'abord `el.value` par le texte normalisé (`el.value = text`) avant d'ouvrir l'avertissement.

### B3 (bas) : coûts de tokenisation à surveiller

Mesures sur le bundle livré, 20 000 caractères (sonde S5) :
- configuration Cisco réaliste : 33 ms ; Python 27 ms ; YAML 25 ms ; JSON 39 ms ; FortiOS 13 ms ;
- `findSecrets` : moins de 5 ms ; `detectLanguage` : moins de 14 ms.

Trois points :
1. **Pire cas quadratique** de la grammaire Bash officielle : `\b[\w-]+(?=\s*\(\s*\)\s*\{)` (profil CPU) donne **1,2 s**
   sur une ligne `a-a-a-…` de 20 000 caractères. La grammaire YAML donne 1,0 s, Python sur `'\'\…` 0,65 s. Le résultat
   est mis en cache, mais il est recalculé à chaque montage après purge du cache (400 entrées), et ce texte est partagé
   avec tous les lecteurs. Des entrées réalistes (base64 de 20 Ko, hexadécimal, PEM) restent sous 45 ms : risque faible.
2. **La fiche retokenise tout le texte à chaque rendu** : `CodeCard.tsx:29` appelle `codeLines` sans le cache `linesOf`,
   et la fiche se redessine à chaque `dispatch` du store. Proposé : `linesOf(a.id + "-card", …)`.
3. **Collage d'un très gros texte** : `pastedAsCode`, puis `normalizeCode`, puis la borne. Sur 3,9 M caractères : 0,48 s
   puis 0,23 s, avant de dire « trop long ». Proposé : vérifier la longueur brute d'abord (avec une marge pour les
   tabulations).

**Sonde S5** (`revue-lot16/perf_probe.js`, `redos_probe.js`, `dash_probe.js`, extrait) :
```js
const { code } = require("./load.js")();
for (const n of [5000, 10000, 20000]) { const t = "a-".repeat(n / 2); const t0 = Date.now(); code.codeLines(t, "bash", true); console.log(n, Date.now() - t0, "ms"); }
// 5000 78 ms · 10000 302 ms · 20000 1204 ms (quadratique : grammaire Prism « bash », function-name)
```

### B4 (bas) : contrôles bidirectionnels et séparateurs Unicode admis dans le texte

`languages.ts:147-156` garde tout caractère ≥ U+0020 sauf U+007F. Le motif `MULTILINE` du contrat admet donc U+202E et
voisins (contrôles bidi), U+2028 et U+0085.

Pour un référentiel lu par des auditeurs, un contrôle bidi peut faire lire une ligne de configuration autrement qu'elle
n'est (attaque dite « Trojan Source ») ; U+2028 rend mal en SVG. Ce n'est pas propre au bloc, mais le bloc est la
première sorte faite pour coller du texte venu d'ailleurs.

**Proposition** : retirer U+202A-U+202E, U+2066-U+2069 et U+2028-U+2029 dans `normalizeCode`, ou les refuser dans
`CodeText`.

### B5 (bas) : la hauteur saisie dans la fiche ne suit pas les bornes des poignées

`CodeCard.tsx:70` : `NumberField` borné à `min={80}`, sans `minHeight(size)` ni grille. Les poignées, elles, appliquent
`boundedBox` et l'aimant de 20. Avec une taille de 18, 80 donne une fenêtre d'une ligne sur laquelle le pied empiète.
Proposé : `min={minHeight(a.style.text_size)}` et un arrondi à 20 au moment de l'envoi.

### Remarques (sans gravité)

- Nombres magiques et défauts répétés : `codeInsert` (largeur 480, `fitHeight(12, 13)`) alors que `DEFAULT_SIZE.code`
  existe ; `"jetbrains_mono"`, `highlight: true` et `line_numbers: true` sont écrits à la fois dans `codeCreate` et dans
  `code-draft.tsx`. Une constante `DEFAULT_CODE_CONTENT` suffirait.
- Fonctions longues : `CodeBody` (environ 65 lignes, à découper en en-tête, gouttière et texte) ; `CodeEditor` (environ
  100 lignes) ; la fabrique `codeCommands` (environ 115 lignes, qui suit le modèle des autres fabriques de commandes).
- `let drafts` au niveau du module (`code-commands.ts:49`) : un état mutable global. Il est sans conséquence ici, mais
  `codeView` pourrait porter le compteur.
- Une regex tapée dans la recherche s'applique maintenant au texte entier de chaque bloc, jusqu'à 20 000 caractères par
  bloc, à chaque frappe (`search.ts`, `notes()`) : une regex catastrophique saisie par l'utilisateur coûte plus qu'avant.
  Le résultat montre aussi la ligne trouvée, donc éventuellement une valeur gardée, mais seulement à l'écran de celui qui
  la cherche.

## Points vérifiés sans constat

- **Contrat** : `CodeContent` à tout écrire, avec `extra="forbid"`, `StrictBool` et les énumérations ; tabulation, CR et
  ESC refusés (`string_pattern_mismatch`), 20 001 caractères refusés ; `upgraded()` sur 1.5.0 testé ; défauts identiques
  entre contrat et moteur (`DEFAULT_ANNOTATION_STYLE.code` = `DEFAULT_STYLE.code`) ; schéma et `CONTRAT.md` régénérés
  (test de dérive vert).
- **API** : 422 sans écho, testés sur six formes. `ld intent` n'imprime jamais le texte (testé). Les sujets du journal
  sont nommés par le titre, et « bloc de code sans titre » est cherchable dans les deux langues.
- **Prism** : `manual` et `disableWorkerMessageHandler` sont posés avant le cœur (ordre vérifié dans `app.js`) ; aucun
  `highlightAll` n'est atteint ; licence MIT et commit d'origine dans `engine/vendor/`.
- **Rendu** : aucun `dangerouslySetInnerHTML` ni `innerHTML` dans les fichiers du lot ; le texte passe par React
  (`tspan`, `span`).
- **Molette** : défilement actif seulement si le bloc est sélectionné seul (`active && !data.multi`) ; Ctrl ou Méta
  laissés au zoom ; butée sans fuite vers la toile ; reste de la molette accumulé en lignes entières ; parcours vérifié
  dans Chromium (`test_app_code.py`, 2 passés).
- **Défilement** : il ne touche que `codeView` (`useSyncExternalStore` par bloc), jamais la toile ; la barre contextuelle
  n'est recalculée qu'au changement de version.
- **Chaînes** : `strings.mjs` est propre ; les deux exceptions ajoutées sont motivées.

## Questions pour Orhan

1. **M4** : un collage devient-il un bloc dès qu'un langage est « proposé », ou seulement quand il est « sûr » ?
2. **M5** : après « Retirer » sur un bloc gardé, que dit la page du journal (a), et faut-il un réglage partiel du bloc
   pour ne pas réécrire 20 Ko par clic (b) ?
3. **M1** : faut-il redemander pour une valeur **déjà gardée** à chaque nouvelle écriture du même bloc ? Recommandé :
   non, seulement pour les valeurs nouvelles.

## Annexe : chargeur des sondes

`/tmp/claude-1000/-home-otosun-development-applications-demo-living-diagram-v12-biturbo/c8b981c0-e3cd-44a9-b24e-bf0652ca56b3/scratchpad/revue-lot16/load.js`
(chemin du worktree du lot 16 ; pour rejouer sur `main`, pointer `WT` vers la racine du dépôt) :
```js
"use strict";
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const WT = "/home/otosun/development/applications/demo/living-diagram-v12-biturbo/.claude/worktrees/agent-a22f7fc3dd7c7866f";
module.exports = function loadApp() {
  const context = vm.createContext({ console, URLSearchParams });
  vm.runInContext(fs.readFileSync(path.join(WT, "backend/src/ld_backend/render/assets/app/app.js"), "utf8"), context, { filename: "app.js" });
  return context.LDApp;
};
```
Les sondes se trouvent dans le même dossier : `secrets_probe.js`, `mask_probe.js`, `paste_probe.js`, `detect_probe.js`,
`perf_probe.js`, `redos_probe.js`, `dash_probe.js`. Pour les rejouer : `node <sonde>.js` depuis ce dossier.

## Suivi

Corrections du 2026-10-15 (agent Opus, arbre principal, sans commit), avec quatre constats de la revue de session
(`2026-10-15-revue-session-lots-2-3-4-13-8-16.md` : B2 = B1 ici, J3 = M3 (2) ici, B6, J2). Tout est corrigé ; trois
points restent à trancher par Orhan (en fin de section), avec un comportement prudent en attendant.

- **H1, corrigé.** Les motifs sortent dans `engine/src/app/code/secret-rules.ts` (la table seule) ; `secrets.ts` garde
  la lecture ligne à ligne et ce qui demande un contexte. Chaque motif se cherche sur toute la ligne (drapeau `g`) et
  nomme toutes ses valeurs (`v`, `v2`, `v3`) : SNMPv3 `auth` et `priv`, JSON minifié, deux `clé=valeur` sur une ligne.
  Ajouts : RADIUS / TACACS sans type et `key` seul dans un bloc `tacacs server` / `radius server` (jamais `key chain`
  ni le numéro d'une clé de trousseau), `key config-key password-encrypt`, `ppp … password`, `ip ftp password`, BGP
  `neighbor … password`, OSPF `message-digest-key` et `authentication-key`, HSRP / VRRP (`key-string` ou texte), IS-IS,
  SNMPv3 (IOS-XE et NX-OS, clés localisées `0x…` dites « hash »), communauté de `snmp-server host` en v1 / v2c (en v3 le
  dernier mot est un utilisateur : rien), `wpa-psk`, FortiOS `config system snmp community` → `set name` (lu dans son
  contexte), Junos `set snmp community` ; en ligne de commande : en-tête `Authorization` / `Bearer`, `curl -u` (jamais
  `-u 1000:1000`), adresse `scheme://user:pass@`, `mysql -p…`, `sshpass -p`, options `--password` / `--token`,
  `snmpwalk -c / -A / -X` ; clé générique : `*_pass`, `community` (`snmp_community`, `ro_community`…), `passphrase`,
  `credentials` ; clés privées PGP. Six sortes nouvelles dans `panel:code.secretKind` (fr / en) : `snmpUser`, `routing`,
  `wifi`, `token`, `commandLine`, `url`. Garde-fous contre les faux positifs : une valeur Cisco n'est jamais `:` ni `=`
  (`password = "x"` en Python n'est plus lu « password <removed> ») ; `password encryption aes`, `password
  strength-check` ; références (`$VAR`, `${VAR}`, `{{ jinja }}`, `!vault`, `%s`) pour les seules règles de fichier et de
  commande (un `$1$…` Cisco reste un hash) ; gabarits entiers (`<…>`, `{nom}`, vide, booléens, `null`, `~`, étoiles,
  communauté BGP `65000:100`). Tests : `backend/tests/js/code.test.js`, une table de 43 cas (les 26 de S1, chaque valeur
  trouvée en entier et le nombre exact de valeurs) et 31 lignes qui ne doivent rien donner (description, `no password`,
  `key chain`, ` key 1`, HSRP `key-chain`, `snmp-server host … version 3 …`, `$DB_PASS`, `<removed>`, `!vault`,
  `bypass: true`, `ssh -p 2222`, `mysql -p` seul, `docker run -u 1000:1000`, f-string…). **Aucun manqué assumé.**
- **H2, corrigé.** Valeur générique selon le séparateur : collée (`KEY=value`, `"k":"v"`), le mot entier jusqu'au blanc
  (`#` compris) ; après un blanc (`key: value`, `key = value`), une chaîne citée (et ses concaténations `'a' + 'b'`), sinon
  le reste de la ligne jusqu'à ` #`, la clé suivante d'un objet sur une ligne, ou le guillemet qui ferme la chaîne où la
  clé est écrite ; `$(…)` est une valeur entière (le texte peut contenir le secret, une alerte de trop coûte un clic). Un
  bloc YAML `password: |` : ses lignes plus indentées sont les valeurs. Test : sur les 43 cas, aucun morceau de deux
  caractères ou plus d'une valeur ne survit à `maskSecrets`, et le texte retiré ne réveille plus l'alerte.
- **M1, corrigé (décision prise à la recommandation, question 3 ci-dessous).** Seules les valeurs **nouvelles** par
  rapport au texte enregistré sont signalées (`newSecrets(text, saved)`) : une valeur gardée telle quelle ne se redemande
  pas, et ne bloque plus l'enregistrement d'un champ démonté. Un champ démonté avec une valeur nouvelle jamais vue rend son
  texte à la page : il attend dans `codeView` (identité du bloc dans son infrastructure), la ligne d'état le dit, et
  l'écriture se rouvre avec l'avertissement quand le bloc revient à l'écran. Testé sous Node (`newSecrets`) ; le
  démontage par la culture n'a pas de parcours Chromium (M2 en a un, comme demandé).
- **M2, corrigé.** La borne se vérifie dans `commit()` avant de fermer le champ (le champ reste ouvert, la ligne d'état
  dit « trop long »), `maxLength` sur le `textarea`, un collage dans le champ qui dépasserait est refusé et le dit ;
  `codeCreate` ne vide le brouillon qu'après la borne et rend faux sinon (le brouillon se rouvre alors avec son texte) ;
  un champ démonté avec un texte trop long attend dans le bloc comme en M1 (il serait refusé, donc perdu).
  Parcours Chromium : 19 996 caractères tapés dont cinq tabulations, normalisés à 20 009, Ctrl+Entrée le dit, le
  brouillon reste avec ses 20 009 caractères, rien n'est écrit, Échap l'abandonne.
- **M3, corrigé.** (1) Tout texte collé dont `findSecrets` trouve quelque chose passe par le brouillon de bloc de code et
  l'avertissement, quels que soient sa longueur et son langage (langage proposé par la détection, même non sûr) ;
  parcours Chromium sur deux lignes Cisco. (2) **Revue de session J3** : une charge Living Diagram venue d'une autre
  infrastructure dont des blocs de code portent des valeurs sensibles ne s'écrit pas tout de suite : la ligne d'état le
  dit (« collage depuis X : n valeurs sensibles… rien n'est collé avant votre choix ») et propose **retirer ces valeurs**
  ou **coller tel quel** ; cette ligne ne s'efface pas d'elle-même ; un autre collage ou une autre ligne la remplace (rien
  n'est alors écrit). La même infrastructure, une duplication, un clone ne demandent rien (même audience). L'avertissement
  du bloc n'a pas été réutilisé : il porte un seul texte en écriture, un collage en porte plusieurs, avec des connecteurs.
  Fonctions pures `secretsOf` / `withoutSecrets` (`state/clipboard.ts`, testées sous Node) ; parcours Chromium dans le
  test d'une infrastructure à l'autre (rien d'écrit avant le choix, puis retiré, puis tel quel).
- **M4, comportement prudent (question 1).** Un collage ne devient un bloc que si la détection est **sûre** ; les tubes
  ou `&&` quelconques ne comptent plus que pour 0,3 (un tube vers un filtre connu, `grep`, `wc`, `sort`…, et les commandes
  courantes, `ssh`, `curl`, `git`…, restent des marqueurs Bash forts) ; `show ` devient un marqueur Cisco (des commandes
  `show … | include …` collées restent un bloc Cisco). Les quatre textes de S4 et « a && b » deviennent des notes ;
  CISCO, FortiOS, Python, Bash, YAML, JSON de la fixture, trois `ip route`, trois `show … | include` et trois tubes Bash
  restent des blocs sûrs (Node).
- **M5, option (a) seulement (question 2).** « Retirer ces valeurs » depuis la fiche dit « n valeurs retirées du bloc ;
  le journal des modifications garde l'ancien texte ». (b) et (c) ne sont pas codées.
- **B1, corrigé** (= B2 de la revue de session). `.fbar`, `.band` et `[role=toolbar]` dans le sélecteur d'exclusion ; la
  touche n'est prise que si le bloc défile.
- **B2, corrigé.** Avant d'ouvrir l'avertissement, le champ reçoit le texte normalisé (numéros, points rouges et
  sélection justes) ; une tabulation, un CR ou un caractère interdit qui entre par dépôt ou par frappe est nettoyé tout de
  suite (`cleanTyped`, le curseur gardé), les colonnes restent justes.
- **B3, corrigé.** (1) Une ligne de plus de 2 000 caractères (`LONG_LINE`, `tokens.ts`) se dessine sans coloration, les
  autres gardent la leur (les suites de lignes ordinaires sont colorées ensemble). (2) La fiche passe par `linesOf`
  (`a.id + "-card"`). (3) Un collage de plus de 80 000 caractères bruts (quatre fois la borne, marge des tabulations) est
  refusé avant d'être normalisé ou lu. En corrigeant H1, deux motifs quadratiques ont été introduits puis retirés (un
  regard en arrière non borné, une fin de valeur cherchée à chaque blanc) : mesurés par sonde, corrigés, gardés par un
  test de temps sur quatre lignes démesurées. Une ligne sans aucun mot déclencheur (`TRIGGER`) n'est plus lue par la table.
- **B4, corrigé.** `normalizeCode` et `cleanTyped` retirent C0 (hors tabulation), C1 (U+0080-U+009F, dont U+0085),
  U+061C, U+200E-U+200F, U+2028-U+2029, U+202A-U+202E, U+2066-U+2069 ; test Node.
- **B5, corrigé.** La hauteur saisie dans la fiche est bornée à `minHeight(taille)` et arrondie à 20 seulement si l'aimant
  est mis (règle du lot 8).
- **Remarques.** `DEFAULT_CODE_CONTENT` (`code/languages.ts`) remplace les défauts répétés ; l'insertion lit
  `DEFAULT_SIZE.code.w` et douze lignes à `DEFAULT_STYLE.code.text_size` ; le compteur des brouillons vit dans `codeView`
  (`nextKey`). `CodeBody` et `CodeEditor` ne sont pas découpés : aucune vraie couture (le champ, sa gouttière et son
  avertissement partagent le même état). La regex de la recherche sur le texte des blocs n'a pas été touchée (hors
  périmètre).
- **Revue de session B6, corrigé.** Un brouillon porte l'infrastructure où il est né : ailleurs il n'est pas montré et
  s'abandonne en le disant, et `codeCreate` refuse d'écrire dans une autre toile. (La toile démontée, l'écriture démontée
  l'abandonnait déjà.)
- **Revue de session J2, comportement prudent (question 4).** Annuler ou rétablir ne réécrit jamais dans un bloc de code
  une valeur sensible qu'il ne porte plus : la clé est retenue (`Plan.withheld`, `history.ts`), l'entrée sort de la pile
  si rien d'autre n'est rejoué, et la ligne d'état dit « non annulé : …, cela rétablirait des valeurs sensibles
  retirées ». Un bloc supprimé qui revient par Ctrl+Z revient tel qu'il était. Test Node.

**Mesures.** S1 (26 cas) : 3 trouvés en entier avant, 26 après. S5, tokenisation (sonde de la revue) : Bash `a-a-…`
20 000 caractères 1 209 ms → 0,1 ms ; YAML 1 020 ms → 0,0 ms ; Python `'\'\…` 656 ms → 0,0 ms ; Cisco guillemets
197 ms → 0,1 ms ; à la borne (lignes de 2 000 caractères jusqu'à 20 000), pire cas 110-120 ms (Bash, YAML) ; textes
réalistes inchangés (13 à 45 ms). `findSecrets` sur 20 000 caractères : < 5 ms avant, < 15 ms après sur les textes
réalistes, < 35 ms sur les lignes pathologiques sondées.

**Questions ouvertes pour Orhan.**
1. M4 : un collage devient un bloc seulement quand le langage est « sûr » (en attendant) ; ou dès qu'il est « proposé » ?
2. M5 : (b) un réglage partiel du contenu d'un bloc (`code_set` sans `text`, plus de 20 Ko au journal par clic) ;
   (c) masquer `text` dans « Brut » et le CSV de la vue Journal (longueur et empreinte), le journal disque restant la
   trace complète ?
3. M1 : une valeur déjà gardée ne se redemande pas (en attendant) ; faut-il redemander à chaque écriture ?
4. J2 : Ctrl+Z après « retirer » ne rétablit pas les valeurs (en attendant) ; faut-il pouvoir les rétablir, après un
   avertissement ?
