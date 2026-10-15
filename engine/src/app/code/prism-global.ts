// Les grammaires de Prism (`prismjs/components/prism-*.js`) et la grammaire Cisco recopiée s'enregistrent dans le
// `Prism` global. Le navigateur l'a (Prism le pose sur `window`) ; le contexte sans DOM des tests sous Node ne l'a pas :
// posé ici, entre le cœur et les grammaires (prism.ts tient l'ordre des imports, esbuild le garde).
import Prism from "prismjs/components/prism-core";
(globalThis as unknown as { Prism: typeof Prism }).Prism = Prism;
export {};
