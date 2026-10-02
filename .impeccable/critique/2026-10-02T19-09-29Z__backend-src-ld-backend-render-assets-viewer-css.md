---
target: page ld render (viewer.css)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/otosun/development/applications/demo/living-diagram-v12-biturbo/backend/src/ld_backend/render/assets/viewer.css"
target_fingerprint: "sha256:0543ead06a132ad0f92fb76fd28d5f1a71f0997cb74ade15412ff68214bda6e2"
target_path: /home/otosun/development/applications/demo/living-diagram-v12-biturbo/backend/src/ld_backend/render/assets/viewer.css
timestamp: 2026-10-02T19-09-29Z
slug: backend-src-ld-backend-render-assets-viewer-css
closed: true
---
## Critique Impeccable — page `ld render`, « Living Diagram · lecture d'un snapshot » (2026-10-02)

Méthode : deux agents isolés en parallèle (A : revue de design, 31 captures · B : détecteur impeccable-engine 0.1.11 + 21 captures + mesures DOM par DevTools). Mode : Operate. Cible : backend/src/ld_backend/render/assets/viewer.css (la page assemblée : page.html + viewer.css + js/*.js).

### Score de santé (heuristiques de Nielsen, 0-4)

| # | Heuristique | Score | Point clé |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | ligne d'état et estompage ; aucun compte sur les onglets, recherche muette |
| 2 | Correspondance avec le monde réel | 3 | vocabulaire réseau ; énumérations anglaises dans des phrases françaises |
| 3 | Contrôle et liberté | 2 | pas d'Échap, pas d'annulation d'un déplacement, pas de retour arrière |
| 4 | Cohérence et standards | 2 | le bleu porte cinq sens ; l'orange trois |
| 5 | Prévention des erreurs | 3 | lecture seule ; « replacer » détruit sans confirmer |
| 6 | Reconnaissance plutôt que rappel | 2 | bande dégradée, stub, « non collecté », règles R0-R5 absents de la légende |
| 7 | Flexibilité et efficacité | 2 | adresse partageable ; clavier limité aux nœuds, pastilles inertes, contrôles non triés |
| 8 | Esthétique et minimalisme | 3 | sobre ; en-tête replié, légende-paragraphe, vue d'ensemble redondante |
| 9 | Récupération des erreurs | 3 | états vides honnêtes ; recherche sans résultat muette |
| 10 | Aide et documentation | 2 | « confirmé », « faisceau », R4 non expliqués |
| Total | | 25 / 40 | Acceptable |

Aucune heuristique n/a. Maximum applicable : 40.

### Verdict de spécificité
Ancré là où ça compte (provenance des câbles, cartes d'évidence, bulle en colonnes), générique autour (en-tête, pastilles, légende). Occasions manquées : nœud qui met le type en gras et l'identité en petit ; pas de famille chromatique pour les structures HA / MLAG.
Scan déterministe : 5 constats sur viewer.css (side-tab ×2 sur les cartes d'évidence, border-accent-on-rounded ×3 = faux positifs). Mode navigateur : low-contrast (--documented 3,6:1 et --warning 3,1:1 sur --raised, placeholder 4,2:1), tiny-text 11 px (bulle), flat-type-hierarchy (inspecteur 11/13/16 px), line-length 89-127 c/l (Structures, Qualité) ; text-occlusion ×7 = faux positif (glossaire replié). Overlay non injecté (pas de navigateur mutable). 0 console, 0 Refused, 0 défilement horizontal.

### Problèmes prioritaires
- [P1] Le bleu porte cinq sens (--accent = --observed) et les oranges sont sous AA (documented 3,9/3,6:1, warning 3,4/3,1:1). Fix : token --structure (violet) pour cluster / peer-link / rôle / heartbeat / pastilles role-mode ; sélection en encre ; --documented #965a00, --warning #915c08 en clair. /impeccable colorize
- [P1] Les défauts ne sont ni en tête ni accessibles : Contrôles triés par code (errors aux lignes 4 et 7), pastilles d'en-tête inertes, onglets sans comptes. Fix : tri sévérité puis code, pastilles en boutons filtrants, comptes sur les onglets. /impeccable layout
- [P2] Étiquettes du graphe : rôle 6,5 px illisible dès k ≤ 1 (3,4 px à 420), étiquette de faisceau longue qui traverse les nœuds à la sélection, 4 chevauchements de noms de ports, hostnames jamais tronqués. Fix : nœud 54×34, rôle 8 px plancher, étiquette courte sur la toile, classes zoom-far / zoom-near dans applyView(), nom dominant. /impeccable typeset
- [P2] En-tête et légende sans hiérarchie ni regroupement : en-tête sur 2 lignes (4 à 420), marque 14 px, 8 pastilles identiques, placeholder coupé, légende 3 lignes incomplète avec une phrase d'aide. Fix : marque 15 px, run sur deux lignes, pastilles en trois groupes, légende en quatre groupes nommés avec nuanciers. /impeccable layout
- [P2] Largeurs étroites et clavier : inspecteur hors écran sous 900 px, onglets qui débordent sans indice à 420, dd à 0 px dans Contrôles (un caractère par ligne, page 6 167 px), câbles / faisceaux / clusters inaccessibles au clavier, aria-live sur tout l'inspecteur, onglets sans aria-controls. (Corrigé entre-temps : role=group sur le svg, role=button sur les nœuds, bulle role=tooltip.) /impeccable adapt puis audit

### Charge cognitive
Trois échecs (découpage, regroupement, choix > 4) et trois partiels (focus unique, hiérarchie, mémoire de travail) : modérée à élevée.

### Personas
Alex : pastilles inertes, erreurs enterrées, onglets sans comptes, « replacer » ambigu, recherche sans compte. Sam : câbles inaccessibles au clavier, aria-live global, oranges sous AA, confirmé / observé seul par la teinte seule. Riley : panneau hors écran < 900 px, hostnames longs, 400 nœuds sans palier, deux « Ethernet1/2 » d'un même côté, libellés cassés au « · ».

### Observations mineures
Singulier « 1 voisins » ; libellés français pour sévérité et collecte ; casse des commandes ; vue d'ensemble redondante ; TYPE_TAG.other = « · » ; « La livraison » en vidage alphabétique ; inspecteur figé à 400 px ; nuancier documenté à deux tirets ; bulle 11 px ; p.muted 127 c/l ; .evidence à bordure gauche signalée par le détecteur mais porteuse de sens.

### Questions
1. Fonction ou identité sur le nœud ? 2. Quelle porte d'entrée : le graphe ou les défauts ? 3. Bulle ou inspecteur ?
