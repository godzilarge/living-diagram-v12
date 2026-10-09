// Généré par engine/types.mjs depuis contracts/src/ld_contracts/schema/intent-v1.schema.json : ne pas éditer.
// Référence : contracts/CONTRAT.md. Régénérer avec `npm run types` dans engine/.

export type DeviceType =
  "switch" | "router" | "firewall" | "load_balancer" | "wireless_controller" | "server" | "other";
/**
 * Les douze teintes nommées d'une couleur d'intention ; le moteur donne à chacune sa valeur sombre et sa valeur
 * claire, le contrat ne connaît que le nom (jamais une valeur libre : docs/10, décision 4).
 */
export type Hue =
  "blue" | "sky" | "indigo" | "violet" | "pink" | "red" | "orange" | "amber" | "lime" | "green" | "teal" | "slate";
export type GroupShape = "rectangle" | "ellipse";
export type StrokeStyle = "solid" | "dashed" | "dotted" | "none";
export type LabelPosition =
  "top_left" | "top" | "top_right" | "left" | "center" | "right" | "bottom_left" | "bottom" | "bottom_right";
export type LabelPlacement = "inside" | "outside";
export type LabelWeight = "regular" | "semibold" | "bold";
export type LabelFont = "sans" | "mono";
export type LabelColor = "hue" | "ink";
export type AnchorKind = "free" | "device" | "group";
export type ZOrder = "back" | "front";
export type ShapeKind = "rectangle" | "ellipse";
export type TextAlign = "left" | "center" | "right";
export type TextValign = "top" | "middle" | "bottom";
/**
 * L'ancre d'un bout attaché : le contour vers l'autre bout (`auto`), ou le milieu d'un côté (1.5.0).
 */
export type Side = "auto" | "n" | "e" | "s" | "w";
export type Head = "none" | "arrow";
export type Route = "straight" | "elbow" | "curve";
export type LineStyle = "solid" | "dashed" | "dotted";

/**
 * La couche d'intention d'une infrastructure : ses patchs keyés par identité stable, avec leur auteur et leur date.
 *
 * Le document ne s'écrit que par opérations (`pin`, `unpin`, `color`, `uncolor`, `color_type`, `uncolor_type`,
 * `group_create`, `group_update`, `group_add`, `group_remove`, `group_delete`, `annotation_create`,
 * `annotation_update`, `annotation_delete`, `connector_create`, `connector_update`, `connector_delete`) ; chaque
 * requête acceptée incrémente
 * `revision`. Il n'est lu ni par B1 ni par B3 : `rendu = f(snapshot ⊕ intent, vue)`, `diff = snapshot ↔ snapshot`.
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
  /**
   * La palette des types : une couleur par type au plus, triées par `type`, uniques (docs/10).
   *
   * @maxItems 7
   */
  type_colors:
    | []
    | [TypeColor]
    | [TypeColor, TypeColor]
    | [TypeColor, TypeColor, TypeColor]
    | [TypeColor, TypeColor, TypeColor, TypeColor]
    | [TypeColor, TypeColor, TypeColor, TypeColor, TypeColor]
    | [TypeColor, TypeColor, TypeColor, TypeColor, TypeColor, TypeColor]
    | [TypeColor, TypeColor, TypeColor, TypeColor, TypeColor, TypeColor, TypeColor];
  /**
   * Les couleurs par équipement, triées par `hostname`, uniques ; 10 000 au plus (`too_long`).
   *
   * @maxItems 10000
   */
  device_colors: DeviceColor[];
  /**
   * Les groupes (docs/10 §5), triés par `id`, uniques ; 1 000 au plus.
   *
   * @maxItems 1000
   */
  groups: Group[];
  /**
   * Les annotations (docs/10 §6 : notes, formes, tableaux, images), triées par `id`, uniques ; 2 000 au plus.
   *
   * @maxItems 2000
   */
  annotations: Annotation[];
  /**
   * Les connecteurs (docs/10 §6 : lignes et flèches à deux bouts), triés par `id`, uniques ; 2 000 au plus.
   *
   * @maxItems 2000
   */
  connectors: Connector[];
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
/**
 * La couleur voulue pour tous les équipements d'un type (la palette des types de l'infrastructure), par qui,
 * quand.
 */
export interface TypeColor {
  type: DeviceType;
  hue: Hue;
  /**
   * Qui a choisi la teinte, 80 caractères au plus, sans caractère de contrôle.
   */
  author: string;
  /**
   * Quand : date UTC écrite par le serveur à l'application de l'opération.
   */
  at: string;
}
/**
 * La couleur voulue d'un équipement, qui l'emporte sur celle de son type, par qui, quand.
 */
export interface DeviceColor {
  /**
   * Identité stable du nœud (`nodes[].hostname` du snapshot), à l'octet.
   */
  hostname: string;
  hue: Hue;
  /**
   * Qui a choisi la teinte, 80 caractères au plus, sans caractère de contrôle.
   */
  author: string;
  /**
   * Quand : date UTC écrite par le serveur à l'application de l'opération.
   */
  at: string;
}
/**
 * Un groupe (docs/10 §5) : des membres et un style ; le cadre se calcule depuis les membres, jamais stocké.
 */
export interface Group {
  /**
   * Identité stable attribuée par le serveur à la création : `g<revision>-<n>`.
   */
  id: string;
  /**
   * Le nom du groupe, 1 à 80 caractères, modifiable sans changer l'identité.
   */
  label: string;
  /**
   * Texte libre, 500 caractères au plus (retours à la ligne admis).
   */
  description: string;
  /**
   * Les membres, par `hostname`, triés, uniques, un au moins.
   *
   * @minItems 1
   * @maxItems 10000
   */
  members: [string, ...string[]];
  style: GroupStyle;
  /**
   * Qui a créé ou modifié le groupe en dernier.
   */
  author: string;
  /**
   * Quand : date UTC écrite par le serveur à l'application de l'opération.
   */
  at: string;
}
/**
 * Le style d'un groupe (docs/10 §5) : toutes clés écrites ; le serveur complète avec les défauts à la création.
 */
export interface GroupStyle {
  shape: GroupShape;
  /**
   * Rayon des coins du rectangle, en unités du dessin.
   */
  radius: number;
  hue: Hue;
  /**
   * Opacité du remplissage, en pourcent.
   */
  fill_opacity: number;
  /**
   * Épaisseur de la bordure, en unités du dessin.
   */
  stroke_width: number;
  stroke_style: StrokeStyle;
  /**
   * Marge entre les cartes des membres et le cadre.
   */
  padding: number;
  label_position: LabelPosition;
  label_placement: LabelPlacement;
  /**
   * Taille de l'étiquette, en pixels du dessin.
   */
  label_size: number;
  label_weight: LabelWeight;
  label_font: LabelFont;
  label_color: LabelColor;
}
/**
 * Une annotation (docs/10 §6) : un contenu, une boîte, un ancrage, un style ; signée, datée.
 */
export interface Annotation {
  /**
   * Identité stable attribuée par le serveur à la création : `a<revision>-<n>`.
   */
  id: string;
  anchor: Anchor;
  /**
   * Abscisse du coin haut gauche : dans le plan si libre, sinon relative à l'ancre.
   */
  x: number;
  /**
   * Ordonnée du coin haut gauche, même repère.
   */
  y: number;
  /**
   * Largeur, 20 à 4 000 unités du dessin.
   */
  w: number;
  /**
   * Hauteur, 20 à 4 000 unités du dessin.
   */
  h: number;
  z: ZOrder;
  /**
   * Verrouillée : ni glissé ni redimensionnement sur la toile.
   */
  locked: boolean;
  /**
   * Ligne de rappel vers l'ancre ; faux si libre (`leader_without_anchor`).
   */
  leader: boolean;
  content: NoteContent | ShapeContent | TableContent | ImageContent;
  style: AnnotationStyle;
  /**
   * Qui a créé ou modifié l'annotation en dernier.
   */
  author: string;
  /**
   * Quand : date UTC écrite par le serveur à l'application de l'opération.
   */
  at: string;
}
/**
 * À quoi l'annotation est attachée : rien (libre, dans le plan), un équipement (par `hostname`), un groupe (par
 * `id`). `ref` est null si et seulement si l'annotation est libre (`anchor_ref_mismatch`).
 */
export interface Anchor {
  kind: AnchorKind;
  /**
   * Le `hostname` de l'équipement ou l'`id` du groupe ; null si libre.
   */
  ref: string | null;
}
/**
 * Une note : du texte brut, multi-ligne, jamais du HTML ni du Markdown.
 */
export interface NoteContent {
  kind: "note";
  /**
   * 1 à 2 000 caractères ; retours à la ligne admis, aucun autre caractère de contrôle.
   */
  text: string;
}
/**
 * Une forme : rectangle ou ellipse, avec une étiquette (une ligne ou une flèche est un connecteur).
 */
export interface ShapeContent {
  kind: "shape";
  shape: ShapeKind;
  /**
   * Étiquette au centre (vide admis), 80 caractères au plus.
   */
  label: string;
}
/**
 * Un tableau de texte : lignes × colonnes, toutes les lignes de même longueur (`table_ragged`) ; des largeurs de
 * colonne et des hauteurs de ligne relatives (poids, la boîte reste la mesure), des cellules fusionnées.
 */
export interface TableContent {
  kind: "table";
  /**
   * La première ligne est un en-tête.
   */
  header: boolean;
  /**
   * 1 à 30 lignes de 1 à 8 cellules, 120 caractères au plus.
   *
   * @minItems 1
   * @maxItems 30
   */
  rows: [string[], ...string[][]];
  /**
   * Un poids par colonne (1..4000) : la largeur de la boîte se partage au prorata ; null = colonnes égales. Autant de poids que de colonnes (`table_dims_mismatch`).
   */
  widths: number[] | null;
  /**
   * Un poids par ligne, de même ; null = lignes égales. Autant de poids que de lignes.
   */
  heights: number[] | null;
  /**
   * Les fusions, triées par (`row`, `col`), dans le tableau, sans chevauchement, couvrant deux cellules au moins (`table_merge_outside`, `table_merge_overlap`, `table_merge_trivial`).
   *
   * @maxItems 240
   */
  merges: Merge[];
}
/**
 * Des cellules fusionnées : la cellule haut gauche (`row`, `col`) couvre `rows` × `cols` cellules ; le texte est
 * celui de la cellule haut gauche, les cellules couvertes gardent le leur sans le montrer.
 */
export interface Merge {
  /**
   * Ligne de la cellule haut gauche, depuis 0.
   */
  row: number;
  /**
   * Colonne de la cellule haut gauche, depuis 0.
   */
  col: number;
  /**
   * Lignes couvertes, 1 au moins.
   */
  rows: number;
  /**
   * Colonnes couvertes, 1 au moins.
   */
  cols: number;
}
/**
 * Une image du magasin de fichiers de l'infrastructure, par son empreinte ; PNG, JPEG ou WebP, jamais SVG.
 */
export interface ImageContent {
  kind: "image";
  /**
   * SHA-256 hexadécimal du fichier, tel que `POST /api/intent/assets` l'a rendu.
   */
  asset: string;
  /**
   * Texte de remplacement, 120 caractères au plus (vide admis).
   */
  alt: string;
}
/**
 * Le style d'une annotation (docs/10 §6) : toutes clés écrites ; le serveur complète avec les défauts de la sorte
 * à la création.
 */
export interface AnnotationStyle {
  hue: Hue;
  /**
   * Opacité du remplissage, en pourcent.
   */
  fill_opacity: number;
  /**
   * Épaisseur de la bordure (ou du trait d'une ligne).
   */
  stroke_width: number;
  stroke_style: StrokeStyle;
  /**
   * Rayon des coins d'un rectangle, d'une note, d'une image.
   */
  radius: number;
  /**
   * Opacité de l'annotation entière, en pourcent.
   */
  opacity: number;
  /**
   * Taille du texte, en pixels du dessin.
   */
  text_size: number;
  text_weight: LabelWeight;
  text_font: LabelFont;
  text_color: LabelColor;
  text_align: TextAlign;
  text_valign: TextValign;
}
/**
 * Un connecteur (docs/10 §6) : deux bouts, des pointes, un tracé, une étiquette, un style ; signé, daté.
 */
export interface Connector {
  /**
   * Identité stable attribuée par le serveur à la création : `c<revision>-<n>`.
   */
  id: string;
  /**
   * Le bout de départ : libre, ou attaché à un équipement, un groupe, une annotation.
   */
  start: FreeEnd | AttachedEnd;
  /**
   * Le bout d'arrivée, de même ; jamais le même élément que le départ (`connector_same_ends`).
   */
  end: FreeEnd | AttachedEnd;
  heads: Heads;
  route: Route;
  /**
   * Courbe : écart du milieu de l'arc à la corde, perpendiculaire, signé ; coudé : décalage du segment médian ; droit : ignoré.
   */
  bend: number;
  /**
   * Étiquette au milieu du tracé (vide admis), 80 caractères au plus.
   */
  label: string;
  z: ZOrder;
  /**
   * Verrouillé : ni bout ni courbure ne se glissent sur la toile.
   */
  locked: boolean;
  style: ConnectorStyle;
  /**
   * Qui a créé ou modifié le connecteur en dernier.
   */
  author: string;
  /**
   * Quand : date UTC écrite par le serveur à l'application de l'opération.
   */
  at: string;
}
/**
 * Un bout libre : un point du plan.
 */
export interface FreeEnd {
  kind: "free";
  /**
   * Abscisse du point, en unités du dessin.
   */
  x: number;
  /**
   * Ordonnée du point.
   */
  y: number;
}
/**
 * Un bout attaché : le tracé part de l'ancre de l'élément (un côté), ou de son contour vers l'autre bout.
 */
export interface AttachedEnd {
  kind: "device" | "group" | "annotation";
  /**
   * Le `hostname` de l'équipement, l'`id` du groupe (`g<revision>-<n>`) ou de l'annotation (`a<revision>-<n>`).
   */
  ref: string;
  side: Side;
}
/**
 * La pointe à chaque bout : aucune (une ligne), une flèche à l'arrivée, au départ, ou aux deux.
 */
export interface Heads {
  start: Head;
  end: Head;
}
/**
 * Le style d'un connecteur : toutes clés écrites ; le serveur complète avec les défauts à la création.
 */
export interface ConnectorStyle {
  hue: Hue;
  /**
   * Épaisseur du trait.
   */
  stroke_width: number;
  stroke_style: LineStyle;
  /**
   * Opacité du connecteur entier, en pourcent.
   */
  opacity: number;
  /**
   * Taille de l'étiquette, en pixels du dessin.
   */
  text_size: number;
  text_weight: LabelWeight;
  text_font: LabelFont;
  text_color: LabelColor;
}
