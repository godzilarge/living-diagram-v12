// Prism 1.30.0 (prismjs, MIT), chargé dans un ordre écrit : les drapeaux d'abord (`manual: true`), le cœur, le global,
// puis les grammaires officielles (Python, Bash, JSON, YAML), la grammaire Cisco IOS / NX-OS recopiée de
// blakebratcher/obsidian-cisco-syntax 0.2.0 (MIT, `engine/vendor/obsidian-cisco-syntax/`, avec sa licence) et la
// grammaire FortiOS écrite ici (fortios.ts). La page ne sert de Prism que `Prism.tokenize` : un arbre de chaînes et de
// jetons, jamais de HTML ni de DOM (tokens.ts le range en familles, la toile le dessine en `tspan`).
import "./prism-manual";
import Prism from "prismjs/components/prism-core";
import "./prism-global";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "../../../vendor/obsidian-cisco-syntax/prism-cisco.js";
import { fortiosGrammar } from "./fortios";

Prism.languages.fortios = fortiosGrammar();

export { Prism };
