// Les types de ce que la page lit de Prism 1.30.0 (prismjs, MIT) : `tokenize` et la table des grammaires. Écrits ici
// plutôt qu'une dépendance de plus (`@types/prismjs`) : la page n'en lit que ces quelques champs.
declare module "prismjs/components/prism-core" {
  export interface PrismToken { type: string; alias?: string | string[]; content: PrismNode; length: number }
  export type PrismNode = string | PrismToken | PrismNode[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type PrismGrammar = Record<string, any>;
  export interface PrismLib {
    languages: Record<string, PrismGrammar>;
    tokenize(text: string, grammar: PrismGrammar): PrismNode[];
    manual?: boolean;
  }
  const Prism: PrismLib;
  export default Prism;
}
declare module "prismjs/components/prism-python";
declare module "prismjs/components/prism-bash";
declare module "prismjs/components/prism-json";
declare module "prismjs/components/prism-yaml";
