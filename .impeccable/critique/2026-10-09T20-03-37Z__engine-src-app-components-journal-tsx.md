---
target: vue Journal (Journal.tsx)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/otosun/development/applications/demo/living-diagram-v12-biturbo/engine/src/app/components/Journal.tsx"
target_fingerprint: "sha256:cc4139ca65851446e9f9e7b5d53c63bfb6623c945855f942f4b335e7d3cc15b6"
target_path: /home/otosun/development/applications/demo/living-diagram-v12-biturbo/engine/src/app/components/Journal.tsx
timestamp: 2026-10-09T20-03-37Z
slug: engine-src-app-components-journal-tsx
---
Method: dual-agent (A : revue de design · B : détecteur, navigateur, audit technique)

# Critique et audit — vue Journal (2026-10-09)

Corrigé pendant la séance : facettes stables (univers des valeurs fixe, trié par nom, zéro grisé ; « Autres » stable ; dernières facettes gardées pendant une lecture ; en-tête qui ne pousse plus la recherche). Mesuré : 0 px de mouvement sur 10 clics.

## Nielsen : 24/40 (Acceptable)
1 Visibilité 3 (total périmé pendant la lecture) · 2 Monde réel 2 (r998, c984-1, « tableau 3 × 2 » comme nom) · 3 Contrôle 2 (Retour ne ramène pas, contexte perdu à l'aller-retour) · 4 Cohérence 3 (deux styles de sélection) · 5 Prévention 2 (liens morts, recherche sur le nom de l'infra) · 6 Reconnaissance 3 · 7 Flexibilité 2 (pas de clavier entre entrées, pas d'export) · 8 Minimalisme 3 (répétitions, infra ×3) · 9 Erreurs 2 (message brut) · 10 Aide 2 (limites du journal non dites)

## Audit : 13/20 (Acceptable)
A11y 3 (contrastes ≥ 4,5 ; focus perdu après « plus ancien ») · Perf 3 (17 k nœuds, 57 ms par dépliage à 998 entrées) · Thème 3 · Responsive 2 (bascule de vue masquée < 900 px : pas de sortie) · Intégrité 2.

## Détecteur
0 constat CLI. En page (CSP contournée pour l'essai) : 2 text-occlusion, faux positifs (toile inerte sous le Journal).

## Problèmes prioritaires
1. [P1] Facettes qui bougent — CORRIGÉ.
2. [P1] Aller-retour Journal → Diagramme : Retour quitte la page ; pages chargées, dépliés, défilement perdus ; liens morts vers objets supprimés.
3. [P1] Clavier / lecteur d'écran : focus perdu après « plus ancien » ; « déplier : 1 opération » sans dire laquelle ; catégorie non annoncée ; ~200 Tab sans lien d'évitement.
4. [P2] Bruit : positions ~69 % des lignes, suites identiques, rafale de 500 en 50 phrases, catégorie de la 1re opération ; détail d'une seule op = JSON.
5. [P2] Recherche matche le nom de l'infra ; aucun surlignage.

## Mineurs
`.app` défile de 39 px ; jour collant sur la ligne ; nom d'auteur long coupé net ; pastille de run et « Contrôle 6 » hors sujet en Journal ; heures sans fuseau ; état d'erreur (« · » orphelin, « aucun » auteur) ; cibles 22 / 16 px ; bascule de vue masquée < 900 px ; pas de fenêtrage.
