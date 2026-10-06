// Les applications démarrées dans la page : le visualiseur (`app`) et la coquille servie (`shellApp`). C'est l'objet
// `LD` global lui-même (index.ts l'enrichit des modules) : les tests sous Node et le pilote Chromium y lisent l'état.
import type { Graph } from "../canvas/graph";
import type { Intent, Model, Place, Placement } from "../canvas/types";

// La couche d'intention s'écrit par opérations (docs/08 I0) ; `Writer` est ce que la page sait faire d'elles : la
// coquille servie les envoie à l'API, la page autonome n'a pas d'écrivain (lecture seule, déplacements locaux).
export type Op = { op: "pin"; hostname: string; x: number; y: number } | { op: "unpin"; hostname: string };
export type SaveResult = { ok: true; intent: Intent } | { ok: false; message: string };
export interface Writer { author: string; setAuthor: (name: string) => void; save: (ops: Op[]) => Promise<SaveResult> }
// Le placement mémorisé (docs/09) s'écrit par ce que la page vient de placer ; `Placer` est ce que la page sait en
// faire : la coquille servie l'envoie à `POST /api/placement`, la page autonome n'en a pas (mémoire de la page seule).
// `base_revision` : la révision du document lu avant de dessiner ; `stale` : le document a changé depuis, le voici.
export interface PlacementWrite { base_revision: number; replace: boolean; places: Place[] }
export type PlaceResult = { ok: true; placement: Placement } | { ok: false; stale: true; placement: Placement } | { ok: false; stale?: false; message: string };
export interface Placer { save: (write: PlacementWrite) => Promise<PlaceResult> }
export interface BootOptions { writer?: Writer | null; placer?: Placer | null }

// `dispose` : le visualiseur lâche la page (adresse, toile) quand une autre run s'ouvre au même endroit (bande des runs).
export interface App { model: Model; graph: Graph; activate: (id: string) => void; applyHash: (first: boolean) => void; writer: Writer | null; placer: Placer | null; dispose: () => void }
export interface ShellState { token: string; author: string; infrastructure: string; runId: string; from: string; runs: RunEntry[] | null; message: string | null; busy: boolean; pending: Promise<void> | null }
export interface RunEntry { run_id: string; run_start: string; run_end: string | null; run_status: string; produced_at: string; stored_at: string; sha256: string }
export interface ShellApp { state: ShellState; render: () => void; submit: () => void; open: () => Promise<void>; list: () => Promise<void> }

export const apps: { app?: App; shellApp?: ShellApp } = {};
