// Généré par engine/types.mjs depuis contracts/src/ld_contracts/schema/intent-v1.schema.json : ne pas éditer.
// Référence : contracts/CONTRAT.md. Régénérer avec `npm run types` dans engine/.

/**
 * La couche d'intention d'une infrastructure : ses patchs keyés par identité stable, avec leur auteur et leur date.
 *
 * Le document ne s'écrit que par opérations (`pin`, `unpin`) ; chaque requête acceptée incrémente `revision`.
 * Il n'est lu ni par B1 ni par B3 : `rendu = f(snapshot ⊕ intent, vue)`, `diff = snapshot ↔ snapshot`.
 */
export interface Intent {
  /**
   * Version semver du contrat Intent, indépendante des trois autres contrats.
   */
  intent_version: string;
  /**
   * Infrastructure du document : une épingle ne vaut que pour elle.
   */
  infrastructure: string;
  /**
   * Nombre de requêtes d'écriture acceptées ; 0 = jamais écrit.
   */
  revision: number;
  /**
   * Date UTC de la dernière écriture ; null si et seulement si `revision` vaut 0.
   */
  updated_at: string | null;
  /**
   * Les épingles, triées par `hostname`, uniques ; 10 000 au plus (`too_long`).
   *
   * @maxItems 10000
   */
  pins: Pin[];
}
/**
 * Une épingle : la place voulue d'un équipement sur le dessin, par qui, quand.
 */
export interface Pin {
  /**
   * Identité stable du nœud épinglé (`nodes[].hostname` du snapshot), à l'octet ; 253 caractères au plus, sans caractère de contrôle.
   */
  hostname: string;
  /**
   * Abscisse en unités du dessin, entière, bornée à ±1 000 000.
   */
  x: number;
  /**
   * Ordonnée en unités du dessin, entière, bornée à ±1 000 000.
   */
  y: number;
  /**
   * Qui a posé ou déplacé l'épingle (nom déclaré dans la page), 80 caractères au plus, blancs de bord retirés, sans caractère de contrôle.
   */
  author: string;
  /**
   * Quand : date UTC écrite par le serveur à l'application de l'opération.
   */
  at: string;
}
