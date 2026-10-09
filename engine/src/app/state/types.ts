// L'état de l'application, et les actions qui le changent. Un composant rend l'état et envoie des actions ; il ne
// fait jamais d'appel réseau (api/) et ne touche jamais la toile (seul `Canvas` la monte). Le réducteur (reducer.ts)
// est pur, testé sous Node ; l'adresse (address.ts) est une projection pure de cet état.
import type { Point } from "../../canvas/layout";
import type { Model, PageData, Selection } from "../../canvas/types";
import type { RunEntry } from "../../shell/apps";
import type { ContextTarget } from "./context";
import type { JournalFilters, JournalPage } from "./journal";
import type { Prefs } from "./prefs";
import type { Walk } from "./walk";

export interface Address { infrastructure: string; runId: string; from: string }
/** Les deux vues (Orhan, 2026-10-09) : `diagram`, le réseau tel que les équipements le disent, câbles neutres, fiches de
 *  faits, et tout ce qui s'édite ; `control`, comment Living Diagram l'a dessiné : statuts, sources, contrôles, en
 *  lecture seule. Le critère de rangement : qui le dit (le device ⇒ diagramme ; B1 ⇒ contrôle) ; le diff dans les deux.
 *  `journal` : qui a modifié quoi dans l'intention, quand, sur quelle infrastructure (le journal du serveur, filtré). */
export type ViewMode = "diagram" | "control" | "journal";
/** L'état de vue, celui que l'adresse porte dans son fragment : le mode, les bascules, les règles, l'élément sélectionné (par identité). */
export interface ViewState { mode: ViewMode; showStubs: boolean; showPorts: boolean; showSpeeds: boolean; showBeams: boolean; showPins: boolean; showNotes: boolean; showOper: boolean; showDiff: boolean; hide: string[]; only: string; hiddenStatuses: string[]; journal: JournalFilters }
export interface SelectionToken { kind: string; token: string }
/** Le menu contextuel ouvert : sa cible, où le poser (écran), le point du plan visé. */
export interface ContextMenuState { target: ContextTarget; at: Point; plan: Point }
/** Une édition en place demandée par le menu : la cellule d'un tableau, ou le texte d'une note (`cell` null) ; `at` la distingue d'une demande identique. */
export interface EditRequestState { id: string; cell: [number, number] | null; at: number }

/** La vue Journal : la page lue (entrées accumulées par « plus ancien »), ou ce qui l'empêche. `key` : les filtres
 *  de la lecture, une réponse pour d'autres filtres est ignorée ; `at` : l'instant de la première page, d'où se compte
 *  la période, le même pour les pages suivantes (sinon la fenêtre glisse entre deux pages). */
export type JournalState =
  | { kind: "idle" }
  | { kind: "loading"; key: string; at: number; page: JournalPage | null }
  | { kind: "ready"; key: string; at: number; page: JournalPage; more: boolean }
  | { kind: "failed"; key: string; message: string };

/** Ce que la vue Journal garde d'une visite à l'autre (hors adresse) : les entrées dépliées (clé d'élément), le
 *  défilement, et si l'on est parti du Journal pour montrer un objet (le Diagramme propose alors d'y revenir). */
export interface JournalUi { open: string[]; scroll: number; back: boolean }

export type RunState =
  | { kind: "idle" }
  | { kind: "loading"; infrastructure: string; runId: string }
  | { kind: "failed"; message: string }
  | { kind: "ready"; model: Model; data: PageData; warnings: string[]; remembered: boolean };

export interface AppState {
  token: string;
  author: string;
  address: Address;
  runs: RunEntry[] | null;
  runsMessage: string | null;
  listing: boolean;
  run: RunState;
  view: ViewState;
  /** Les préférences du navigateur (prefs.ts) : thème, grille, aimant, minimap. Jamais dans l'adresse. */
  prefs: Prefs;
  selection: Selection | null;
  /** La sélection multiple : des équipements (un seul = aussi `selection`). */
  hosts: string[];
  /** Une sélection demandée par l'adresse ou par un lien, à résoudre par la toile quand elle est montée. */
  wanted: SelectionToken | null;
  palette: { open: boolean; text: string };
  expanded: boolean;
  menuOpen: boolean;
  connectOpen: boolean;
  /** Le volet « palette des types » (docs/10). */
  colorsOpen: boolean;
  note: { text: string; busy: boolean; at: number } | null;
  /** Ce que les boutons annuler / rétablir disent (le geste en haut de chaque pile), `null` si la pile est vide. */
  history: { undo: string | null; redo: string | null };
  /** Monte à chaque mutation du modèle (épingle, placement acceptés) : les fiches se redessinent. */
  revision: number;
  /** Le parcours d'un compte de la barre (erreurs, avertissements, changements), ↑↓ d'un équipement à l'autre (walk.ts). */
  walk: Walk | null;
  /** Le menu contextuel (clic droit), ouvert ou non. */
  context: ContextMenuState | null;
  editRequest: EditRequestState | null;
  journal: JournalState;
  journalUi: JournalUi;
}

export type Action =
  | { type: "session"; token?: string; author?: string }
  | { type: "address"; address: Address }
  | { type: "listing" }
  | { type: "runs"; runs: RunEntry[] | null; message: string | null }
  | { type: "loading"; infrastructure: string; runId: string }
  | { type: "failed"; message: string }
  | { type: "ready"; model: Model; data: PageData; warnings: string[]; runs: RunEntry[] | null; remembered: boolean }
  | { type: "view"; patch: Partial<ViewState> }
  | { type: "prefs"; patch: Partial<Prefs> }
  | { type: "select"; selection: Selection | null; hosts: string[] }
  | { type: "want"; wanted: SelectionToken | null }
  | { type: "palette"; open?: boolean; text?: string }
  | { type: "expand"; expanded: boolean }
  | { type: "menu"; open: boolean }
  | { type: "connect"; open: boolean }
  | { type: "colors"; open: boolean }
  | { type: "note"; text: string | null; busy?: boolean; at?: number }
  | { type: "history"; undo: string | null; redo: string | null }
  | { type: "touched" }
  | { type: "walk"; walk: Walk | null }
  | { type: "context"; menu: ContextMenuState | null }
  | { type: "editRequest"; request: EditRequestState | null }
  | { type: "journal"; journal: JournalState }
  | { type: "journalUi"; patch: Partial<JournalUi> };
