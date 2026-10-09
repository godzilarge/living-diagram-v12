---
target: panneau-inspecteur (après refonte)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/otosun/development/applications/demo/living-diagram-v12-biturbo/engine/src/app/components/Panel.tsx"
target_fingerprint: "sha256:eb710ee390519012f1b13e3fec5924b46bd39c138c8f399a0d6d86228b9320f0"
target_path: /home/otosun/development/applications/demo/living-diagram-v12-biturbo/engine/src/app/components/Panel.tsx
timestamp: 2026-10-08T23-02-06Z
slug: engine-src-app-components-panel-tsx
---
# Critique — panneau-inspecteur après refonte, 2026-10-08 (2e passage)

Method: dual-agent (A: UI Designer · B: general-purpose, détecteur + DevTools)

## Score Nielsen : 25/40 — avant : 21/40
1 État 3 · 2 Réel 2 · 3 Contrôle 3 · 4 Cohérence 2 · 5 Prévention 3 · 6 Reconnaissance 2 · 7 Efficacité 3 · 8 Esthétique 3 · 9 Erreurs 2 · 10 Aide 2
Charge cognitive : 3 échecs sur 8 (avant 7).

## Verdict
Cohérence acquise, identité pas encore (inspecteur Figma générique). Détecteur CLI : 0 constat. Overlay : gpt-thin-border-wide-shadow sur le panneau, tiny-text 11 px sur un insp-hint.

## Mesures (B)
- Note 606/606 repliée, 918/766 dépliée ; équipement 1176/766 ; câble 842/766.
- Tailles 11, 12, 12.5, 13, 14, 15 ; hauteurs de contrôles 18 à 40 (neuf valeurs).
- Non textuel : champ / panneau 1,12:1 ; segment actif / piste 1,33 (sombre), 1,13 (clair).
- Bord gauche : titres repliables, listes (-6), description (-10) décalés.
- Troncatures : port distant (câbles), libellés « de · équipement » (connecteur).

## Problèmes prioritaires
- [P1] En-tête figé translucide : le texte défile visiblement dessous.
- [P1] Libellés de rangée qui mentent (« remplissage » contient la marge), préfixes en icône seule.
- [P2] Champs et segments quasi invisibles (1,1:1), surtout en clair.
- [P2] Titres de section non alignés, listes et description qui débordent du bord.
- [P2] Vocabulaire brut et bilingue (ERROR, CHANGED, COLLECTE UNREACHABLE, backticks, chemins, doublons).
- [P2] Listes qui tronquent l'utile (port distant), ports coupés au milieu.
- [P3] Panneau pleine hauteur, largeur 348 en dur (casse < 900 px), commentaires périmés.
