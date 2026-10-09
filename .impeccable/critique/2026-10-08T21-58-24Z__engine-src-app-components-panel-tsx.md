---
target: panneau latéral d édition (panel-scroll)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/otosun/development/applications/demo/living-diagram-v12-biturbo/engine/src/app/components/Panel.tsx"
target_fingerprint: "sha256:686a98aa19c6e95ca07222bd7e070451a419c553b174dc82c6bc4597abc4d745"
target_path: /home/otosun/development/applications/demo/living-diagram-v12-biturbo/engine/src/app/components/Panel.tsx
timestamp: 2026-10-08T21-58-24Z
slug: engine-src-app-components-panel-tsx
---
# Critique — panneau latéral d'édition (.panel / .panel-scroll), 2026-10-08

Method: dual-agent (A: UI Designer · B: general-purpose, détecteur + DevTools)

## Score Nielsen : 21/40 (Acceptable)
1 État 2 · 2 Réel 3 · 3 Contrôle 3 · 4 Cohérence 1 · 5 Prévention 3 · 6 Reconnaissance 2 · 7 Efficacité 2 · 8 Esthétique 1 · 9 Erreurs 2 · 10 Aide 2

## Verdict
Pas de système de contrôles : primitives natives (range, select), trois générations de composants côte à côte, prose d'aide partout. Charge cognitive : 7 échecs sur 8.

## Mesures (B)
- Défilement : note 1348 px, groupe 1304, équipement 1156 pour 766 visibles (57 % de la note sous la ligne de flottaison).
- 10 à 20 couples typographiques distincts par fiche ; tailles 10.34 / 10.5 / 11 / 12 / 13 / 14 / 16 ; graisses 400-700.
- Hauteurs de contrôles : 22, 24, 28, 29, 30, 31, 32.8.
- Rayons 6 / 10 / 14 / 999 / 50 % ; « défaut » en capsule (règle capsule = fait violée).
- Écarts verticaux : 0, 2, 3, 4, 5, 6, 8.8, 12.
- Bordures --line 1,34:1 sur le panneau. Contrastes texte : aucun échec.
- Cibles < 24 px : teintes 22, grille de position 26×22, retirer 22.
- Détecteur CLI : 0 constat. Overlay (CSP contournée en onglet de test) : gpt-thin-border-wide-shadow sur le panneau, tiny-text / 10.5 px sur câble et équipement.

## Problèmes prioritaires
- [P1] Aucun système de contrôles (8 hauteurs, natifs, 3 typos de champ, segmented sans piste).
- [P1] Tout empilé et déplié (libellé au-dessus, 14 réglages de style d'un bloc, aucune section repliable).
- [P1] Actions et en-têtes : rangées de boutons bordés qui se replient, 4 modèles d'en-tête, primaire cyan plein.
- [P2] Prose et débogage dans l'interface (« Boîte : -1220, -980 · 220 × 80… », « Pour ajouter : … »).
- [P2] Règles maison violées : mono pour des titres non identifiants, pastille redondante, bords gauches décalés (title-input 8 px, btn-ghost 10 px), 10.5 / 13 px en dur, échelle d'espacement hors grille de 4.

## Direction
Inspecteur de propriétés (Figma / Linear / Framer) : en-tête unique sticky avec actions en icônes + menu « … », rangées propriété / valeur 72 px + contrôle, une hauteur de 28, champ numérique « scrub » à la place des curseurs, segmented à piste et icônes sans accent, teinte en champ + menu, sections repliables (Position, Forme, Texte), 3 tailles / 2 graisses, capitales réservées aux pastilles, mono réservée aux identifiants, grille 4/8/12/16/24.
