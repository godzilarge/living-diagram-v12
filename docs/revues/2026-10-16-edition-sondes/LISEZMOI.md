# Sondes de la revue de la brique 6 (mode édition), 2026-10-16

- `sondes-node.test.ts` : copier dans `app/tests/`, puis `cd app && npx vitest run tests/sondes-node.test.ts`, puis
  retirer. Quatre cas, tous en échec tant que le défaut existe (H1, M1 Ctrl+B, M2 Ctrl+Maj+V, B1).
- `sondes.spec.ts` et `playwright.sondes.config.ts` : copier le premier dans `app/e2e/`, le second dans `app/`, puis
  `cd app && LD_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test -c playwright.sondes.config.ts sondes.spec.ts`,
  puis retirer les deux fichiers et `app/dist-sondes/`. Port 4391 (le 4317 peut être tenu par une autre suite).
  Les mesures sont dans la sortie ; captures `sonde-*.png` dans ce dossier.
- `sortie-chromium.txt` : la sortie de la passe complète des 16 premiers cas (7 en échec = constats, 9 verts = ce qui
  passe) ; les deux derniers cas (opacité du menu contextuel, clair et sombre) ont été ajoutés ensuite, verts.
- `fonctions-v1.sh` : depuis la racine, `bash docs/revues/2026-10-16-edition-sondes/fonctions-v1.sh` ; liste les
  fonctions d'édition de la v1 (fiches, palette des types) absentes de `app/src/`.
