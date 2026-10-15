// Avant Prism (prism.ts l'importe en premier) : `manual: true`, jamais de `highlightAll` sur la page (aucune recherche
// de `<code>` dans le document : la CVE-2024-53382, DOM clobbering de `currentScript`, est sans objet ici), ni de
// gestionnaire de messages de worker. Prism lit ces deux drapeaux sur le global au chargement.
const g = globalThis as unknown as { Prism?: { manual?: boolean; disableWorkerMessageHandler?: boolean } };
if (!g.Prism) g.Prism = { manual: true, disableWorkerMessageHandler: true };
export {};
