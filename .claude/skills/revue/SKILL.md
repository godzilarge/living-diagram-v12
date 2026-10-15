---
name: revue
description: Le rituel de revue indépendante d'une brique (backend, contrat, moteur, interface) - quand elle a lieu, qui la fait, le format du rapport, où il se consigne, comment ses points se trient et se traitent. À charger en fin de brique et pour relire un rapport.
---

# Revue indépendante

**Une revue par brique, consignée dès sa remise, traitée dans la foulée.** Pas de boucle revue → contre-revue →
re-revue. Pas de revue pour une règle de quelques lignes sans code modifié, ni pour une retouche visuelle.

## Qui

Un agent qui n'a pas écrit le code : `relecteur-backend` (Python, contrats, moteur pur) ou `relecteur-ui` (interface,
contre la maquette approuvée). Il reçoit le diff, le document de conception, les captures et `DESIGN.md` s'il y a lieu,
**jamais les conclusions de l'auteur** : la revue cherche ce que l'auteur n'a pas vu.

## Ce qu'elle cherche

- **Défauts purs** : un comportement contraire au document de conception, au contrat ou à `DESIGN.md` ; une règle qu'un
  test ne fige pas ; une valeur reçue dans un message ; un chemin non testé ; une mutation d'entrée.
- **Sondes rejouables** : chaque constat important vient avec une reproduction (un test, un script, une capture),
  recopiée dans `docs/revues/<date>-<brique>-sondes/`.
- Ce qu'elle ne fait pas : des cas limites abstraits pour Orhan, des recommandations de goût, un score.

## Le rapport

`docs/revues/AAAA-MM-JJ-<brique>.md`, écrit **tel que rendu**, avant toute correction, avec en tête :
`0 critique, n hauts, n moyens, n bas`, puis un point par ligne (sévérité, fichier:ligne, constat, sonde). Un
rapport de session coupée se reconstitue depuis la transcription `.jsonl`.

## Le tri et le traitement

- **Critique / haut / moyen** : corrigé dans la foulée par l'auteur, suivi écrit sous chaque point du rapport.
- **Bas** : corrigé si quelques lignes, sinon noté « parqué, motivé ».
- **Une recommandation de revue est une hypothèse** : avant de la coder, la confronter au produit (un registre
  d'audit, un éditeur qu'on opère) ; une recommandation qui crée un problème pour le relecteur suivant ne se code pas.
- **Règle douteuse** (deux lectures défendables) : comportement prudent, ligne dans `docs/a-juger-a-l-usage.md`, jamais
  une question bloquante à Orhan.
- Le rapport garde son suivi (fait / parqué / assumé, avec le motif) ; l'entrée de journal cite le rapport.
