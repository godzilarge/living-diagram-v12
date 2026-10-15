# Critique de design : lots 8, 16 et barre contextuelle (2026-10-15)

⚠️ DEGRADED: single-context (méthode imposée par l'orchestrateur : un seul agent prend ses captures et juge ; le détecteur
a tourné après le jugement visuel, pour ne pas l'orienter).

**Périmètre** : repères d'alignement et « mettre en grille » (lot 8), bloc de code (lot 16), barre contextuelle et ses
volets avec ces deux nouveautés (lot 4). Sombre 1440 × 900, clair 1280 × 800, `demo-dc`, gestes réels.
**Captures** : `.impeccable/critique-2026-10-15/design/captures/` (`lot8/1` à `8`, `lot16/1` à `7`, trois agrandissements
`zoom-*`). Scripts : `design/scripts/` (copies adaptées des planches 8 et 16 ; seul `session.py` change, le chemin de la
racine). Référence : prototypes validés `.impeccable/prototype-lot-8/`, `.impeccable/prototype-lot-16/`.

## Score : 30 / 40 (bon ; les écarts sont de finition, pas de fond)

| # | Heuristique | Note | Constat principal |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | Pastille du geste, « 12 → 4 × 3 », « lignes 33-56 sur 120 » : exemplaire. Mais la taille du code ne se lit plus dans la barre. |
| 2 | Correspondance au monde réel | 4 | « type 7 : réversible », « hash », « en clair », aperçu `interface Gi1/0/1 O0 1lI {}` : écrit pour un ingénieur réseau. |
| 3 | Contrôle et liberté | 3 | Ctrl libère, Échap, Ctrl+Z d'un geste entier. « défaut » (couleur des repères) se lit comme un état. |
| 4 | Cohérence et standards | 2 | Volet du langage détaché de son bouton ; bouton de taille différent du prototype ; deux actions en texte gris nu. |
| 5 | Prévention des erreurs | 3 | Avertissement des secrets solide, mais le focus n'est pas sur la décision. |
| 6 | Reconnaissance plutôt que rappel | 3 | Volet des polices avec aperçu, aperçu de grille nommé ; taille du code cachée derrière « AA ». |
| 7 | Flexibilité et efficacité | 4 | Alt+G, Ctrl, Page suiv. / Origine, molette qui défile sur un bloc sélectionné. |
| 8 | Esthétique et sobriété | 3 | Sobre et fidèle au prototype ; quelques marques qui se superposent (croix, poignées, épingle). |
| 9 | Récupération des erreurs | 3 | « Retirer / Garder / Modifier », clic qui va à la valeur, Ctrl+Z. |
| 10 | Aide et documentation | 2 | Raccourcis montrés en édition et dans le volet ; « Ctrl = libre » et la règle de la molette ne se découvrent qu'en essayant. |

## Verdict de spécificité

Le travail est fidèle aux deux prototypes validés, et c'est l'un des lots les plus « propres au produit » de l'application :
le chartreuse des repères choisi parce que les autres teintes ont déjà un sens sur cette toile, les cotes d'écart en
capsules, les équerres de la sélection, l'aperçu de grille qui nomme chaque équipement, les grammaires Cisco / FortiOS,
la nature des secrets (« type 7 : réversible »). Rien d'interchangeable. Comparaison capture à capture : repères
(1 ↔ proto 2, 2 ↔ proto 4), volet de grille (5 ↔ proto 7), bloc Python (1 ↔ proto 1), défilement Cisco (3 ↔ proto 4),
secrets (4 ↔ proto 8), volet des polices (5 ↔ proto 12) : conformes, aux écarts près listés ci-dessous.

**Détecteur Impeccable** (13 fichiers de la session : `GuideLayer.tsx`, `code*.tsx`, `CodeVolets.tsx`, `Display.tsx`,
`FloatingBar.tsx`, `FloatingVolet.tsx`, `CodeCard.tsx`, `code.css`, `guides.css`, `fonts.css`) : 2 constats
« overused-font » sur Inter (`fonts.css` l. 5 et 10). Faux positif au regard du projet : police décidée le 2026-10-06,
antérieure à la session. Rien d'autre.

## Ce qui marche

- **Les repères ne crient pas** : trait de 1 px, interrompu sur les cartes, cartes alignées rendues à pleine opacité
  pendant que les autres s'estompent (`lot8/1`, `lot8/2`). On voit à quoi on s'aligne sans lire une légende.
- **« Mettre en grille » se juge avant de cliquer** : en-tête « 12 → 4 × 3 », places nommées en contour cyan
  (`lot8/5`), résultat net et sélectionné (`lot8/6`).
- **Le bloc de code est un objet de documentation, pas un widget** : titre, pastille du langage, coupure `›`, pied
  « 64 plus bas · lignes 33-56 sur 120 » (`lot16/3`) ; l'avertissement des secrets parle le métier et ne montre jamais la
  valeur (`lot16/4`).

## Constats

### Défauts purs (écart au prototype, accessibilité, collision)

**[P2] La taille du code ne se lit plus dans la barre.** `captures/zoom-1-barre-python.png` contre
`zoom-proto-barre-python.png`. Le prototype validé montre « AA 13 ⌄ » ; l'application montre « AA » seul, à volet
(`state/code-bar.ts` l. 34, `face: { kind: "icon" }`). Pourquoi : visibilité de l'état et reconnaissance ; pour savoir
si deux blocs sont à la même taille, il faut ouvrir deux volets. Recommandation : rendre la face du prototype (la valeur
dans le bouton) ; à aligner sur ce que le lot 4 bis prévoit pour la taille libre du texte, pour que note et code aient la
même commande.

**[P2] Le volet du langage s'ouvre loin de son bouton.** `captures/lot16/7-clair-1280.png` : bouton « FortiOS » à
x ≈ 260, volet à x ≈ 613-849, sans flèche ; dans le prototype (`prototype-lot-16/7-volet-langage.png`), le volet est
au-dessus du bouton avec sa flèche. La règle « un volet ne masque jamais l'objet » est tenue, mais le lien
bouton → volet est perdu (cohérence : partout ailleurs, `lot16/5`, le volet est sur son bouton). Recommandation : quand
la place manque au-dessus, garder l'alignement horizontal sur le bouton et choisir le côté libre du bloc, toujours avec
la flèche ; à défaut, raccourcir le volet (liste qui défile) pour qu'il tienne au-dessus. À traiter avec le placement
déjà parqué pour le lot 4 bis (`docs/11` § Lot 16, « Parqués »).

**[P2] L'avertissement des secrets n'a pas le focus.** `captures/lot16/4-secrets.png` : curseur dans le texte ligne 1,
aucun anneau sur « Retirer ces valeurs » ; le prototype (`prototype-lot-16/8-secrets.png`) met le focus sur l'action
principale. Cause lue dans le code : `code-warn.tsx` l. 42 donne le focus au bouton, puis l'effet du parent
`code-edit.tsx` l. 79 (`if (warn) el.focus()`) le reprend pour le champ (les effets d'un enfant passent avant ceux du
parent). Pourquoi : un `alertdialog` sans focus n'est pas annoncé au lecteur d'écran, et Entrée ajoute une ligne au lieu
de décider. Recommandation : retirer la reprise du focus quand `warn` est posé ; garder celle de la fermeture (l. 170).

**[P3] Les marques des repères se posent sur d'autres marques.** `captures/lot8/4-redimension.png` : la croix de coin
aligné se superpose aux deux poignées cyan du bord droit de la note ; `lot8/3-guide-bord.png` : la croix du haut tombe
sur l'épingle violette de DC01-ACC-03, et la pastille « 2360, -640 » touche le trait. Pourquoi : sobriété ; trois
symboles au même pixel ne se lisent plus. Recommandation : pas de croix sur un coin qui porte déjà une poignée de la
sélection (la poignée marque le coin) ; pastille du geste à 8 px au moins d'un repère, comme le prototype le prévoit.

**[P3] Deux actions écrites en texte gris nu.** `captures/lot8/7-affichage-couleur-reperes.png` (« défaut », agrandi dans
`zoom-7-couleur-reperes.png`) et `lot16/6-fiche.png` (« ajuster au contenu »). « défaut » à droite du titre, alors que le
turquoise est choisi, se lit « la couleur actuelle est celle par défaut ». Le prototype disait « rétablir », souligné.
Recommandation : un verbe (« rétablir », « ajuster ») en `pbtn ghost` avec son icône, comme les autres actions
secondaires de l'inspecteur.

**[P3] Pastilles de couleur des repères sous la cible de 24 px.** `zoom-7-couleur-reperes.png` : 16 px au pas de 22
(`guides.css` l. 75-76) ; l'exception d'espacement de WCAG 2.5.8 ne joue pas (les cercles de 24 se chevauchent).
Recommandation : zone de clic de 24 × 24 avec la pastille de 16 dessinée dedans (pas de 28), ou pastilles de 20.

**[P3] Point rouge collé aux numéros à deux chiffres.** `captures/lot16/4-secrets.png` : « ●10 », « ●12 » dans la
gouttière de l'éditeur. Présent aussi dans le prototype, mais c'est une collision, pas un choix. Recommandation : élargir
la gouttière de la largeur du point dès qu'une ligne est marquée, ou poser le point dans le rail gauche.

### Choix de goût (à présenter à Orhan comme options)

**Palette des repères.** `zoom-7-couleur-reperes.png` : la palette offre rouge, rose, ambre et ciel, que la toile emploie
déjà pour erreur, changé, avertissement et sélection (c'est pourquoi le prototype a choisi le chartreuse), et le
chartreuse par défaut côtoie un lime presque identique. Le choix libre de la couleur est validé ; options :
(a) laisser les onze ; (b) retirer le lime, doublon visuel ; (c) garder les onze et dire au survol quelles teintes ont
déjà un sens sur la toile.

## Personas

- **Ingénieur réseau qui documente (utilisateur principal)** : rien de bloquant. Il colle une configuration, l'avertissement
  arrive, mais son prochain Entrée écrit une ligne au lieu de retirer les valeurs (focus).
- **Auditeur qui lit une capture** : les repères disparaissent à la relâche, rien ne pollue l'export ; un bloc de code
  tronqué se dit (« 64 plus bas ») : bon. Il ne voit pas la taille de police des blocs pour juger leur homogénéité.
- **Utilisateur au clavier ou au lecteur d'écran** : l'avertissement des secrets n'est pas annoncé (focus) ; pastilles de
  couleur petites.

## Observations mineures

- Pastille de langage du bloc neutre (`PYTHON`, `CISCO` en gris) là où le prototype la teintait : cohérent avec la teinte
  par défaut du bloc (ardoise), pas un défaut.
- Les captures montrent un message d'annulation resté à l'écran (`lot8/2`, `lot8/3`, `lot8/7`) : artefact du script
  (Ctrl+Z juste avant), pas de l'application.
- Le texte de la note de la scène est coupé sans signe (« avant 6 h » disparaît, `lot8/3`) : antérieur à la session, hors
  périmètre ; à voir avec la règle « n plus bas » du bloc de code, qui fait mieux.

## Questions pour Orhan

Questions skipped: sous-agent ; les questions passent par l'orchestrateur. À lui soumettre : l'option (a), (b) ou (c) pour
la palette des repères ; corriger les trois P2 dans la foulée (défauts purs, aucune décision de design) et les P3 avec le
lot 4 bis.

Snapshot `.impeccable/critique/` non écrit : le rapport vit dans le dossier demandé.
