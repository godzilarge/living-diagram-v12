# Sondes de la revue de la brique 7 (Journal), 2026-10-20

Scripts Playwright (`*.probe.ts`) rendus par le `relecteur-ui`, à lancer depuis un dossier qui a `@playwright/test`
(`cd app && npx playwright test -c <ce dossier>/playwright.config.ts`, Chromium à
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, le build courant servi par `vite preview` ; `common.ts` sert
aussi HEAD pour comparer l'accueil). Résultats tels que rendus : `*.json`, `*.txt` ; captures dans `captures/`
(non versionnées). `e2e.config.ts` rejoue `app/e2e/journal.spec.ts` sur un autre port.
