# Sondes de la revue « réglages » (brique 5)

Rejouer : copier `*.spec.ts` dans `app/e2e/`, `playwright.revue.config.ts` dans `app/`, puis
`cd app && npx playwright test -c playwright.revue.config.ts e2e/<spec>` (port 4391, build dans `/tmp/ld-revue-dist`,
pour ne pas gêner la suite sur 4317). `partage-v1-nombres.test.ts` va dans `app/tests/` (`npx vitest run
tests/partage-v1-nombres.test.ts`) : ses deux cas échouent exprès pour afficher les valeurs (`Received`).
Les résultats bruts sont dans `resultats.txt`.
