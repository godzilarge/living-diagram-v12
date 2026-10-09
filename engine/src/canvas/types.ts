// Le modèle de lecture : ce que le moteur indexe au-dessus du snapshot et du diff (contrats générés dans
// `../contracts/`). Rien ici n'est inventé : chaque entité garde son document brut (`raw`) et des index vers les
// autres. Les types du DOM ne sont pas importés : le modèle est pur, testé sous Node sans navigateur.
import type { Diff, FieldChange } from "../contracts/diff";
import type { Annotation, AnnotationStyle, Connector, ConnectorStyle, DeviceColor, Group, GroupStyle, Intent, Pin, TypeColor } from "../contracts/intent";
import type {
  Check, Coverage, Endpoint, HaCluster, HaClusterMember, HeartbeatInterface, Link, MlagDomain, Node as SnapshotNode,
  Report, Severity, Snapshot, SnapshotAggregate, SnapshotInterface, Source,
} from "../contracts/snapshot";

export type SelectionKind = "node" | "link" | "aggregate" | "beam" | "cluster" | "group" | "annotation" | "connector";
export interface Selection { kind: SelectionKind; id: string }
export type ChangeKind = "added" | "removed" | "changed";
export interface Change { kind: ChangeKind; fields: FieldChange[] }
export type DiffKind = "node" | "interface" | "link" | "aggregate" | "cluster" | "mlag_domain";

/** Un nœud du snapshot ; `ghost` : retiré depuis la run d'avant, lu dans le diff, dessiné en fantôme. */
export interface ModelNode extends SnapshotNode { ghost?: boolean }
export interface ModelInterface extends SnapshotInterface { ghost?: boolean }
export interface CheckEntry {
  index: number; code: string; severity: Severity; origin: Check["origin"]; refs: Check["refs"]; details: Check["details"];
}
export interface ModelLink {
  index: number; id: string; pair: string; raw: Link; a: Endpoint; b: Endpoint; status: Link["status"]; sources: string[]; combo: string;
  beam: Beam | null; heartbeat: boolean; ghost: boolean; checks: CheckEntry[]; portChecks: CheckEntry[]; worst: Severity | null;
  indexInPair: number; pairCount: number;
}
export interface Aggregate {
  index: number; key: string; raw: SnapshotAggregate; hostname: string; name: string; cables: ModelLink[]; mlag: MlagDomainEntry | null;
  beams: Beam[]; checks: CheckEntry[]; worst: Severity | null;
}
export interface MlagDomainEntry { index: number; raw: MlagDomain; id: string; members: Aggregate[]; peerLink: Aggregate | null }
export interface BeamEnd { hostname: string; aggregate: string; key: string }
export interface Beam {
  index: number; id: string; a: BeamEnd; b: BeamEnd; aggregates: (Aggregate | null)[]; known: Aggregate[]; links: ModelLink[];
  peerLink: boolean; degraded: boolean; mlags: MlagDomainEntry[]; checks: CheckEntry[]; worst: Severity | null;
}
export interface Heartbeat extends HeartbeatInterface { link: ModelLink | null }
export interface Cluster {
  index: number; raw: HaCluster; id: string; hosts: string[]; heartbeats: Heartbeat[]; checks: CheckEntry[]; worst: Severity | null;
}
export interface HaMembership { cluster: Cluster; member: HaClusterMember }
export interface ComboRow { combo: string; status: string; observed: boolean; count: number }
export type Entity = ModelNode | ModelLink | Aggregate | Beam | Cluster | Group | Annotation | Connector;

/** Le rapport d'ingestion embarqué dans la page (forme de `IngestReport` du backend, réduite à ce que la page lit). */
export interface IngestFinding { code: string; message: string; hostname: string | null; ref: string | null; details: Record<string, string | number> }
export interface IngestData { summary: Record<string, unknown> | null; findings: IngestFinding[] }
export interface CatalogueEntry { meaning: string; rule: string }
/** Le placement mémorisé (docs/09), forme de `Placement` du backend : la place de chaque équipement déjà dessiné,
 * par infrastructure. Donnée dérivée et jetable, hors contrat : type écrit à la main, comme le rapport d'ingestion. */
export interface Place { hostname: string; x: number; y: number }
export interface Placement { infrastructure: string; revision: number; updated_at: string | null; places: Place[] }
/** Ce que la page embarque (`build_page_data`) ; la coquille servie le remplit par l'API. `intent` : la couche
 * d'intention de l'infrastructure, `placement` : son placement mémorisé (page archivée, ou lus par l'API) ; absents
 * en mode fichier. */
export interface PageData {
  snapshot: Snapshot; ingest: IngestData | null; origin: string; catalogue: Record<string, CatalogueEntry>; diff?: Diff; intent?: Intent; placement?: Placement;
}
export type { Annotation, AnnotationStyle, Connector, ConnectorStyle, DeviceColor, Group, GroupStyle, Intent, Pin, TypeColor };

export interface Model {
  source: Source; report: Report; coverage: Coverage[]; ingest: IngestData | null; origin: string; catalogue: Record<string, CatalogueEntry>;
  snapshotVersion: string; diff: Diff | null;
  nodes: ModelNode[]; ghostNodes: ModelNode[]; nodeByHost: Map<string, ModelNode>;
  interfaces: SnapshotInterface[]; ifaceByKey: Map<string, SnapshotInterface>; ifacesByNode: Map<string, SnapshotInterface[]>;
  ghostIfaceByKey: Map<string, ModelInterface>; ghostIfacesByNode: Map<string, ModelInterface[]>;
  links: ModelLink[]; ghostLinks: ModelLink[]; linkById: Map<string, ModelLink>; linksByNode: Map<string, ModelLink[]>; linksByIface: Map<string, ModelLink[]>;
  checks: CheckEntry[]; checksByNode: Map<string, CheckEntry[]>; checksByAggregate: Map<string, CheckEntry[]>; checksByCluster: Map<string, CheckEntry[]>;
  aggregates: Aggregate[]; aggregateByKey: Map<string, Aggregate>; aggregatesByNode: Map<string, Aggregate[]>; mlagDomains: MlagDomainEntry[];
  beams: Beam[]; beamById: Map<string, Beam>; beamsByNode: Map<string, Beam[]>;
  clusters: Cluster[]; clusterById: Map<string, Cluster>; clustersByHost: Map<string, Cluster[]>; haMembershipsByHost: Map<string, HaMembership[]>;
  combos: ComboRow[]; severityCounts: Map<string, number>; statusCounts: Map<string, number>; kindCounts: Map<string, number>;
  diffOf: Record<DiffKind, Map<string, Change>>; changeOf: (kind: DiffKind, id: string) => Change | null; diffCount: number;
  /** La couche d'intention (B4) : le document tel que lu, ses épingles par hostname, et celles dont l'équipement n'est
   * pas un nœud de cette run (orphelines : listées, jamais effacées en silence). */
  intent: Intent | null; pinByHost: Map<string, Pin>; orphanPins: Pin[];
  /** Les couleurs d'intention (docs/10) : par type, par équipement ; orphelines si l'équipement n'est pas dans la run. */
  colorByType: Map<string, TypeColor>; colorByHost: Map<string, DeviceColor>; orphanColors: DeviceColor[];
  /** Les groupes (docs/10 §5) : par id, par membre ; orphelins quand aucun membre n'est dans la run. */
  groupById: Map<string, Group>; groupsByHost: Map<string, Group[]>; orphanGroups: Group[];
  /** Les annotations (docs/10 §6) : par id, par équipement et par groupe d'ancrage ; orphelines quand l'ancre est absente. */
  annotationById: Map<string, Annotation>; annotationsByHost: Map<string, Annotation[]>; annotationsByGroup: Map<string, Annotation[]>; orphanAnnotations: Annotation[];
  /** Les connecteurs (docs/10 §6, 1.4.0) : par id, par bout attaché (`sorte\0ref`, connectors.key) ; orphelins quand un bout est absent. */
  connectorById: Map<string, Connector>; connectorsByRef: Map<string, Connector[]>; orphanConnectors: Connector[];
  /** Le placement mémorisé (docs/09) : le document tel que lu, et la place de chaque équipement par hostname. */
  placement: Placement | null; placeByHost: Map<string, Place>;
  /** La largeur commune des cartes de la run (card.ts, `uniformWidth`) : toutes les cartes ont la même. */
  cardWidth: number;
}
