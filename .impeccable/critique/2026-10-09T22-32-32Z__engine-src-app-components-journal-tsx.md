---
target: vue Journal (Journal.tsx)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/otosun/development/applications/demo/living-diagram-v12-biturbo/engine/src/app/components/Journal.tsx"
target_fingerprint: "sha256:2063419427980b5f4b5298dc8583faaa54a226e573a0871175e21acf05fbd938"
target_path: /home/otosun/development/applications/demo/living-diagram-v12-biturbo/engine/src/app/components/Journal.tsx
timestamp: 2026-10-09T22-32-32Z
slug: engine-src-app-components-journal-tsx
---
Method: dual-agent (A : revue de design · B : détecteur, navigateur, audit technique)

# Critique et audit — vue Journal, après la reprise visuelle (2026-10-10)

## Nielsen : 26/40 (Acceptable ; 24 avant)
1 Visibilité 3 (export : retour en sr-only seulement) · 2 Monde réel 2 (identifiants a980-1, sep40f597a6540b, g187-1 comme noms) · 3 Contrôle 3 · 4 Cohérence 3 (survol ≈ sélection ; casse tout / Toutes) · 5 Prévention 3 · 6 Reconnaissance 2 (raccourcis invisibles, réserve en bas de page) · 7 Flexibilité 3 (pas de plage absolue, outils hors vue au défilement, pages de 100) · 8 Minimalisme 3 (mur de « placé n équipements ») · 9 Erreurs 2 (état vide sans rappel des filtres, échec d'export muet) · 10 Aide 2 (auteur déclaratif non dit)

## Audit : 17/20 (Good ; 13 avant)
A11y 3 (contrastes ≥ 4,5 partout ; focus perdu au retour du Diagramme ; lien d'évitement inutile ; cible 22 px) · Perf 4 (1 300 nœuds / 100 entrées, filtres 39-130 ms, aucune tâche longue) · Thème 4 · Responsive 3 (facettes décalées ≤ 860 px ; phrase tronquée à 1000 px avec la colonne infra) · Intégrité 3 (trait de chargement 2-5 images sur l'en-tête au rechargement).

## Détecteur
CLI : 0 constat. En page (CSP contournée pour l'essai) : 0 constat sur quatre vues. Console : 0 erreur.

## Problèmes prioritaires
1. [P1] « supprimé » se mêle à la phrase (« modifié la forme a980-1 supprimé : position ») et une suppression est la ligne la plus éteinte.
2. [P1] Identifiants internes affichés comme noms (formes, images, connecteurs, ancrages).
3. [P1] Retour de l'export CSV invisible pour un voyant (échec, troncature).
4. [P2] Outils d'audit : pas de plage du … au …, en-tête d'outils non figé, pagination par 100.
5. [P2] Raccourcis et réserves invisibles (« o », auteur déclaratif, avant-valeur non gardée).
Défauts techniques P2 : trait de chargement sur l'en-tête au rechargement (Shell.tsx:113), focus perdu au retour (Journal.tsx:68), facettes ≤ 860 px (journal.css:39/205). P3 : lien d'évitement, effacer 22 px, aria-keyshortcuts, colonne infra à 1000 px, radiogroup, trois valeurs en dur.
