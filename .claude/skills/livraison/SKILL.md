---
name: livraison
description: Clore un lot ou une session - suites complètes, captures, documentation, entrée de journal, docs/etat.md, prompt de reprise, message de commit. À charger à la fin de tout lot, et DÈS QU'ORHAN DIT QU'ON ARRÊTE (« on arrête », « on s'arrête là », « à demain », « stop »), même au milieu d'un lot. Ne commite pas sans demande.
---

# Livraison d'un lot, ou clôture d'une session

Rien n'est livré tant que cette liste n'est pas vide. Dire explicitement ce qui n'a pas pu être fait.

**Déclencheurs** : la fin d'un lot ; ou Orhan qui dit qu'on arrête, à n'importe quel moment. Dans ce second cas, on ne
finit pas le lot : on livre ce qui est fait (suites vertes sur ce qui existe), on note ce qui reste **au milieu**, et on
écrit le relais. Un agent de lot en cours est laissé finir s'il est à quelques minutes, sinon arrêté et noté.

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

## 4. Passer le relais

- Dans `docs/etat.md`, une ligne **« Prochaine session : `…` »** avec le prompt exact à coller, de la forme
  `/brique-ui <surface>` ou `<la tâche en une phrase>. Finis par /livraison.`, suivi de ce que cette session doit
  savoir et que les docs ne disent pas encore (un agent interrompu, un test instable, un choix en attente d'Orhan).
- Le même prompt, dans le dernier message à Orhan, dans un bloc de code qu'il peut copier tel quel.
- Ce qui attend sa décision est dit en une ligne, jamais enfoui dans un paragraphe.

## 5. Proposer le commit

Message conventionnel en français (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`), un lot par commit,
corps = les décisions en une ligne chacune, **sans ligne d'attribution**. Le proposer ; ne commiter ni pousser que sur
demande d'Orhan.
