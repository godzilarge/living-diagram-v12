---
name: livraison
description: Clore un lot - suites complètes, reconstruction des bundles, captures, documentation, entrée de journal, docs/etat.md, message de commit. À charger à la fin de toute session qui a modifié du code ou des documents. Ne commite pas sans demande.
---

# Livraison d'un lot

Rien n'est livré tant que cette liste n'est pas vide. Dire explicitement ce qui n'a pas pu être fait.

## 1. Vérifier

```bash
cd engine && npm run build && npm run check
cd backend && uv run pytest --cov=ld_backend
cd contracts && uv run pytest --cov=ld_contracts && uv run ruff check src tests
```

- Reconstruire la toile **avant** la suite backend (le test de dérive ne voit qu'un bundle à jour).
- Un test instable se relance et se note dans `docs/etat.md` (nom, fréquence) ; il ne se désactive pas.
- Un changement de règle se vérifie par mutation. Une mesure de coût se refait si le code chaud a changé.

## 2. Montrer

- Captures des surfaces touchées (sombre et clair, 1440) dans `.impeccable/planche-<lot>/`, remises à Orhan avec
  `SendUserFile`. Une capture par retouche, jugée en une passe.

## 3. Documenter, en une passe, à la fin

- README du paquet touché et `QUICKSTART.md` si une commande ou une route change ; `contracts/README.md` § Décisions
  pour un contrat ; le document de conception (`docs/NN-*.md`) avec un paragraphe « Fait » ; `docs/a-juger-a-l-usage.md`
  pour ce qui se tranche à l'usage.
- **Entrée de journal** dans `docs/journal.md`, en tête de la section du jour : `- **Titre** (date, qui a demandé, ce
  qui a été validé) : une décision = une ligne, pointeurs vers les fichiers, le rapport de revue, les captures ;
  comptes de tests. Court : le détail vit dans les docs.
- **`docs/etat.md`** : déplacer les lignes (fait / en cours / à faire / parqué), mettre la date. C'est ce que la
  prochaine session lira en premier.
- Mémoire de l'agent : seulement ce qui concerne Orhan (préférence, correction de méthode). Un fait de projet va dans
  le dépôt, jamais dans la mémoire.

## 4. Proposer le commit

Message conventionnel en français (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`), un lot par commit,
corps = les décisions en une ligne chacune, **sans ligne d'attribution**. Le proposer ; ne commiter ni pousser que sur
demande d'Orhan.
