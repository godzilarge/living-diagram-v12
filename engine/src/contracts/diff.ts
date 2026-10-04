// Généré par engine/types.mjs depuis contracts/src/ld_contracts/schema/diff-v1.schema.json : ne pas éditer.
// Référence : contracts/CONTRAT.md. Régénérer avec `npm run types` dans engine/.

export type RunStatus = "completed" | "partial" | "failed" | "running";
export type NodeKind = "device" | "external" | "stub";
export type DeviceType =
  "switch" | "router" | "firewall" | "load_balancer" | "wireless_controller" | "server" | "other";
export type ChassisRole = "active" | "standby" | "member" | "master";
export type ChassisState = "ready" | "removed" | "provisioned" | "version_mismatch";
export type CollectionStatus = "success" | "partial" | "failed" | "unreachable" | "not_collected";
export type EvidenceSource = "lldp" | "cdp" | "description";
export type JsonValue = unknown;
export type InterfaceType =
  "physical" | "aggregate" | "subinterface" | "svi" | "loopback" | "tunnel" | "management" | "other";
export type AdminStatus = "up" | "down";
export type OperStatus = "up" | "down" | "testing" | "unknown" | "dormant" | "not_present" | "lower_layer_down";
export type Duplex = "full" | "half" | "unknown";
export type SwitchportMode = "access" | "trunk" | "routed" | "none";
export type IpRole = "primary" | "secondary" | "virtual";
export type MemberStatus = "bundled" | "suspended" | "standby" | "individual" | "down" | "not_in_use";
export type InterfaceRole = "heartbeat" | "mlag_peer_link";
export type LinkKind = "cable" | "l2_segment" | "l3_adjacency" | "bgp_session";
export type EvidenceStatus = "confirmed" | "observed_only" | "documented_only";
export type Resolution = "hostname" | "hostname_casefold" | "reported_hostname" | "address" | "stub";
export type LinkOper = "up" | "down" | "unknown";
export type LinkStatus = "up" | "down";
export type AggregationProtocol = "lacp" | "static" | "pagp";
export type LacpMode = "active" | "passive";
export type HaRole = "primary" | "secondary" | "active" | "standby" | "member";
export type HaState = "up" | "down" | "unknown";
export type HaMode = "active_passive" | "active_active" | "standalone" | "other";
export type CheckCode =
  | "neighbor_name_case_differs"
  | "neighbor_resolved_by_reported_hostname"
  | "neighbor_resolved_by_address"
  | "neighbor_name_ambiguous"
  | "neighbor_unknown"
  | "remote_port_is_mac"
  | "remote_port_is_aggregate"
  | "description_unparseable"
  | "description_ha_unresolved"
  | "description_disagrees_with_observed"
  | "multiple_observed_neighbors"
  | "one_way_observation"
  | "self_observation"
  | "documented_not_observed"
  | "aggregate_member_not_bundled"
  | "aggregate_below_min_links"
  | "aggregate_protocol_mismatch"
  | "mlag_downstream_inconsistent"
  | "mlag_pair_direct_link"
  | "ha_member_down"
  | "ha_view_mismatch"
  | "heartbeat_link_not_observed"
  | "link_oper_mismatch"
  | "link_speed_mismatch"
  | "native_vlan_mismatch"
  | "link_down"
  | "documented_port_without_transceiver"
  | "device_unreachable"
  | "device_partial_collection"
  | "parent_interface_unknown"
  | "interface_member_unknown"
  | "aggregate_interface_unknown"
  | "aggregate_member_unknown"
  | "local_interface_unknown"
  | "ha_member_unknown"
  | "heartbeat_interface_unknown"
  | "vrf_default_case"
  | "reported_hostname_differs"
  | "device_without_task"
  | "documents_without_task";
export type Severity = "error" | "warning" | "info";
export type CheckOrigin = "bundle" | "correlation";
/**
 * Un fait lu dans les champs volatils : il ne se voit dans aucun `changed`.
 */
export type EventKind = "rebooted" | "flapped";

/**
 * Ce qui a changé entre deux snapshots d'une même infrastructure, par entité, en mots du snapshot.
 *
 * Calculé à la demande par B3, jamais archivé, déterministe : mêmes snapshots ⇒ mêmes octets. Ne lit jamais la
 * couche d'intention. `before` → `after` est la direction demandée, quel que soit l'ordre des dates.
 */
export interface Diff {
  /**
   * Version semver du contrat Diff, indépendante des deux autres contrats.
   */
  diff_version: string;
  /**
   * Infrastructure des deux snapshots (B3 refuse deux infrastructures).
   */
  infrastructure: string;
  before: RunRef;
  after: RunRef;
  /**
   * `after.start_datetime − before.start_datetime` en secondes, signé ; négatif = runs comparées à rebours, et alors aucun événement n'est calculé.
   */
  elapsed_seconds: number;
  summary: Summary;
  nodes: NodeChanges;
  interfaces: InterfaceChanges;
  links: LinkChanges;
  aggregates: AggregateChanges;
  mlag_domains: MlagDomainChanges;
  ha_clusters: HaClusterChanges;
  checks: CheckChanges;
  coverage: CoverageChanges;
  /**
   * Faits lus dans les champs volatils, triés par (sorte, référence) ; vide si `elapsed_seconds` ≤ 0 (refusé sinon), chacun recopiant `elapsed_seconds` dans ses détails.
   */
  events: Event[];
}
/**
 * Une des deux runs comparées : la carte d'identité de son snapshot, recopiée de `source`.
 */
export interface RunRef {
  /**
   * Run amont.
   */
  collector_run_id: string;
  /**
   * Empreinte du bundle archivé dont le snapshot vient.
   */
  bundle_sha256: string;
  /**
   * `snapshot_version` du snapshot comparé, de la majeure que le contrat Snapshot accepte.
   */
  snapshot_version: string;
  /**
   * Début de la run ; `elapsed_seconds` se calcule sur ce champ.
   */
  start_datetime: string;
  /**
   * Fin de la run ; null si absente.
   */
  end_datetime: string | null;
  status: RunStatus;
}
/**
 * Ce que la timeline affiche sans ouvrir le diff ; chaque compte est vérifié contre sa liste.
 */
export interface Summary {
  nodes: SectionSummary;
  interfaces: SectionSummary;
  links: SectionSummary;
  aggregates: SectionSummary;
  mlag_domains: SectionSummary;
  ha_clusters: SectionSummary;
  checks: CheckSummary;
  coverage: CoverageSummary;
  events: EventSummary;
  /**
   * Nombre de différences sur les champs volatils (`uptime_seconds`, `last_change_age_seconds`), exclues de `changed` ; non vérifiable depuis le document.
   */
  volatile_changes: number;
}
/**
 * Comptes d'une section d'entités.
 */
export interface SectionSummary {
  /**
   * Taille de `added`.
   */
  added: number;
  /**
   * Taille de `removed`.
   */
  removed: number;
  /**
   * Taille de `changed`.
   */
  changed: number;
}
/**
 * Comptes des contrôles.
 */
export interface CheckSummary {
  /**
   * Taille de `checks.appeared`.
   */
  appeared: number;
  /**
   * Taille de `checks.resolved`.
   */
  resolved: number;
  /**
   * Égal à `checks.persisted`.
   */
  persisted: number;
}
/**
 * Comptes de la couverture.
 */
export interface CoverageSummary {
  /**
   * Taille de `coverage.changed`.
   */
  changed: number;
}
/**
 * Comptes des événements, par sorte.
 */
export interface EventSummary {
  /**
   * Nœuds redémarrés.
   */
  rebooted: number;
  /**
   * Interfaces qui ont changé d'état dans la fenêtre.
   */
  flapped: number;
}
/**
 * Nœuds ajoutés, retirés, changés. Identité : `hostname`, à l'octet (un stub devenu device est un nœud changé si
 * le nom s'écrit à l'identique, `docs/07` Q5).
 */
export interface NodeChanges {
  /**
   * Nœuds présents dans `after` seulement, tels qu'ils y sont ; triés par (sorte, hostname).
   */
  added: Node[];
  /**
   * Nœuds présents dans `before` seulement, tels qu'ils y étaient ; triés par (sorte, hostname).
   */
  removed: Node[];
  /**
   * Nœuds présents des deux côtés dont un champ non volatil diffère ; référence `node`, triés par identité.
   */
  changed: EntityChange[];
}
/**
 * Un nœud du graphe. `device` : en périmètre, décrit par `devices` et `system` ; `external` : présent dans
 * `devices` mais d'une autre infrastructure, matérialisé parce qu'un voisin le cite ; `stub` : cité par une
 * évidence, inconnu de `devices`. Les stubs restent dans le snapshot, la vue décide de les montrer.
 */
export interface Node {
  kind: NodeKind;
  /**
   * Clé, unique toutes sortes confondues (comparée sans la casse). Pour un stub : le nom annoncé, après `casefold`.
   */
  hostname: string;
  /**
   * De `devices` ; null pour un stub, requis sinon.
   */
  type: DeviceType | null;
  /**
   * De `devices` ; null pour un stub ou si inconnu.
   */
  vendor: string | null;
  /**
   * De `devices` ; null pour un stub ou si inconnu.
   */
  model: string | null;
  /**
   * De `devices` ; null pour un stub ou si inconnu.
   */
  site: string | null;
  /**
   * De `devices`, chaîne d'affichage ; null pour un stub ou si inconnu.
   */
  os_name: string | null;
  /**
   * De `devices` ; null pour un stub ou si inconnue.
   */
  os_version: string | null;
  /**
   * De `devices` ; null pour un stub ou si inconnu.
   */
  serial_number: string | null;
  /**
   * De `system[]` ; null si non collecté.
   */
  reported_hostname: string | null;
  /**
   * De `system[]` ; null si non collecté.
   */
  uptime_seconds: number | null;
  /**
   * De `system[]`, triés, sans doublon ; vide sinon.
   */
  virtual_contexts: string[];
  /**
   * Depuis `system[].chassis_members` ; null si standalone ou non collecté.
   */
  stack: Stack | null;
  /**
   * Statut de collecte, pour un `device` seulement (`not_collected` = en périmètre sans task).
   */
  collection: CollectionStatus | null;
  /**
   * Témoignages, pour `external` et `stub` seulement.
   */
  evidence: NodeEvidence | null;
}
/**
 * Le stack d'un nœud : source du badge ×N.
 */
export interface Stack {
  /**
   * Nombre de membres, égal à la taille de `members`.
   */
  member_count: number;
  /**
   * Membres triés par `slot`.
   *
   * @minItems 1
   */
  members: [StackMember, ...StackMember[]];
}
/**
 * Un châssis membre d'un stack, recopié de `system[].chassis_members` ; toutes les clés écrites.
 */
export interface StackMember {
  /**
   * Numéro de membre dans le stack.
   */
  slot: number;
  /**
   * Serial du membre ; null si non lu.
   */
  serial: string | null;
  /**
   * Référence matérielle du membre ; null si non lue.
   */
  model: string | null;
  role: ChassisRole;
  state: ChassisState;
  /**
   * Priorité d'élection ; null si non lue.
   */
  priority: number | null;
}
/**
 * Ce que les voisins disent d'un nœud `external` ou `stub` : la seule information disponible sur lui.
 */
export interface NodeEvidence {
  /**
   * Témoignages, triés par (hostname, port, source).
   */
  seen_by: SeenBy[];
  /**
   * Union des capacités annoncées (`bridge`, `router`, `station`…), triée, sans doublon.
   */
  capabilities: string[];
}
/**
 * Un témoignage sur un nœud non collecté : qui l'a vu, sur quel port, par quelle source.
 */
export interface SeenBy {
  /**
   * Device qui a vu le nœud.
   */
  hostname: string;
  /**
   * Port local du témoin.
   */
  interface: string;
  source: EvidenceSource;
}
/**
 * Une entité présente dans les deux runs, avec ses champs changés (jamais vide : sinon elle n'est pas listée).
 */
export interface EntityChange {
  /**
   * L'entité, par sa référence typée ; sa sorte est celle de la section.
   */
  ref: NodeRef | InterfaceRef | LinkRef | AggregateRef | ClusterRef | MlagDomainRef;
  /**
   * Champs non volatils dont la valeur diffère, triés par `path`, sans doublon.
   *
   * @minItems 1
   */
  fields: [FieldChange, ...FieldChange[]];
}
/**
 * Référence à un nœud.
 */
export interface NodeRef {
  /**
   * Discriminant.
   */
  kind: "node";
  /**
   * Clé de `nodes[]`.
   */
  hostname: string;
}
/**
 * Référence à une interface.
 */
export interface InterfaceRef {
  /**
   * Discriminant.
   */
  kind: "interface";
  /**
   * Hostname de l'interface.
   */
  hostname: string;
  /**
   * Nom canonique de l'interface ; clé `(hostname, name)` de `interfaces[]`.
   */
  name: string;
}
/**
 * Référence à un lien, par sa clé.
 */
export interface LinkRef {
  /**
   * Discriminant.
   */
  kind: "link";
  a: Endpoint;
  b: Endpoint;
}
/**
 * Un bout de lien : un port d'un nœud. Pour un stub, le nom annoncé et le port annoncé (MAC comprise).
 */
export interface Endpoint {
  /**
   * Hostname du nœud, clé de `nodes[]`.
   */
  hostname: string;
  /**
   * Nom canonique du port ; pour un stub ou un port non résolu, tel qu'annoncé.
   */
  interface: string;
}
/**
 * Référence à un agrégat.
 */
export interface AggregateRef {
  /**
   * Discriminant.
   */
  kind: "aggregate";
  /**
   * Hostname de l'agrégat.
   */
  hostname: string;
  /**
   * Nom canonique de l'agrégat ; clé `(hostname, name)` de `aggregates[]`.
   */
  name: string;
}
/**
 * Référence à un cluster HA, par ses membres.
 */
export interface ClusterRef {
  /**
   * Discriminant.
   */
  kind: "cluster";
  /**
   * Hostnames des membres, triés, sans doublon ; clé de `ha_clusters[]`.
   *
   * @minItems 1
   */
  members: [string, ...string[]];
}
/**
 * Référence à un domaine MLAG, par son identifiant et ses deux agrégats.
 */
export interface MlagDomainRef {
  /**
   * Discriminant.
   */
  kind: "mlag_domain";
  /**
   * `mlag_id` du domaine.
   */
  mlag_id: number;
  /**
   * Les deux agrégats, de deux devices distincts, triés par (hostname, nom naturel) ; clé de `mlag_domains[]` avec `mlag_id`.
   *
   * @minItems 2
   * @maxItems 2
   */
  members: [MlagMember, MlagMember];
}
/**
 * Un agrégat membre d'un domaine MLAG.
 */
export interface MlagMember {
  /**
   * Device de l'agrégat.
   */
  hostname: string;
  /**
   * Nom canonique de l'agrégat ; clé de `aggregates[]`.
   */
  aggregate: string;
}
/**
 * Un champ dont la valeur diffère entre les deux runs.
 */
export interface FieldChange {
  /**
   * Chemin pointé dans l'entité (`oper_status`, `aggregate.member_status`), identifiants séparés par des points ; une liste se compare en bloc, son chemin est celui de la liste, jamais un indice.
   */
  path: string;
  before: JsonValue;
  after: JsonValue;
}
/**
 * Interfaces ajoutées, retirées, changées. Identité : `(hostname, name)`.
 */
export interface InterfaceChanges {
  /**
   * Interfaces présents dans `after` seulement, tels qu'ils y sont ; triés par (hostname, nom naturel).
   */
  added: SnapshotInterface[];
  /**
   * Interfaces présents dans `before` seulement, tels qu'ils y étaient ; triés par (hostname, nom naturel).
   */
  removed: SnapshotInterface[];
  /**
   * Interfaces présents des deux côtés dont un champ non volatil diffère ; référence `interface`, triés par identité.
   */
  changed: EntityChange[];
}
/**
 * Une interface, clé `(hostname, name)`. Les champs recopiés gardent le sens du RunBundle ; `null` y veut
 * dire « pas de valeur ». Aucun `extras`, aucun compteur : le snapshot dessine, il n'audite pas.
 */
export interface SnapshotInterface {
  /**
   * Hostname du nœud, clé de `nodes[]`.
   */
  hostname: string;
  /**
   * Nom canonique.
   */
  name: string;
  /**
   * Description brute, conservée telle quelle ; null si vide.
   */
  description: string | null;
  /**
   * Description lue par R2 ; null si non parsable.
   */
  description_parsed: ParsedDescription | null;
  type: InterfaceType;
  admin_status: AdminStatus;
  oper_status: OperStatus;
  /**
   * Raison vendeur brute ; null si `up` ou non donnée.
   */
  oper_reason: string | null;
  /**
   * Vitesse opérationnelle en Mbit/s ; null si down ou inconnue.
   */
  speed_mbps: number | null;
  /**
   * Duplex opérationnel ; null si sans objet ou non lu.
   */
  duplex: Duplex | null;
  /**
   * MAC normalisée ; null si absente.
   */
  mac_address: string | null;
  /**
   * Média ou transceiver, brut ; null si inconnu.
   */
  media: string | null;
  /**
   * Parent d'une sous-interface ; null sinon.
   */
  parent_interface: string | null;
  /**
   * Partition virtuelle propriétaire ; null si aucune ou non lue.
   */
  virtual_context: string | null;
  /**
   * Âge du dernier changement d'état ; `"never"` = aucun depuis le démarrage ; null si non lu.
   */
  last_change_age_seconds: number | "never" | null;
  /**
   * VLAN d'une sous-interface ou d'une SVI ; null sinon.
   */
  vlan_id: number | null;
  /**
   * Mode L2 configuré résolu ; null si non lu.
   */
  switchport_mode: SwitchportMode | null;
  /**
   * VLAN d'un port `access` ; null sinon.
   */
  access_vlan: number | null;
  /**
   * VLAN natif d'un trunk ; null sinon.
   */
  native_vlan: number | null;
  /**
   * VLAN autorisés sur un trunk, forme canonique (R6) : intervalles triés par `first`, disjoints, adjacents fusionnés ; `[]` = aucun ; null si sans objet ou non lu.
   */
  allowed_vlans: VlanRange[] | null;
  /**
   * Adresses portées, triées par (famille, adresse, préfixe).
   */
  ip_addresses: IpAddress[];
  /**
   * `"default"` = table globale ; autre = VRF nommée ; null = non lu ou sans objet.
   */
  vrf: string | null;
  /**
   * Agrégat dont l'interface est membre ; null sinon.
   */
  aggregate: AggregateMembership | null;
  /**
   * Rôles déduits par B1, triés, sans doublon ; vide sinon.
   */
  roles: InterfaceRole[];
}
/**
 * La description `criticité|voisin|port|options` lue par B1 (R2) ; absente si non parsable.
 */
export interface ParsedDescription {
  /**
   * Champ 1, tel quel (vocabulaire non figé) ; null si vide.
   */
  criticality: string | null;
  /**
   * Champ 2 : nom du voisin documenté, brut.
   */
  neighbor: string;
  /**
   * Champ 3 : port du voisin, brut ; null si absent.
   */
  port: string | null;
  /**
   * Champ 4 : options, brutes ; null si absentes.
   */
  options: string | null;
}
/**
 * Un intervalle de VLAN autorisés sur un trunk, bornes incluses ; VLAN unique = `first == last`.
 */
export interface VlanRange {
  /**
   * Premier VLAN de l'intervalle, inclus.
   */
  first: number;
  /**
   * Dernier VLAN de l'intervalle, inclus ; égal à `first` pour un VLAN unique.
   */
  last: number;
}
/**
 * Une adresse IP portée par une interface.
 */
export interface IpAddress {
  /**
   * Adresse sans masque, en texte : IPv4 pointée ou IPv6.
   */
  address: string;
  /**
   * Longueur de préfixe : 0 à 32 en IPv4, 0 à 128 en IPv6.
   */
  prefix: number;
  /**
   * Famille, cohérente avec `address`.
   */
  family: 4 | 6;
  role: IpRole;
}
/**
 * Appartenance d'une interface à un agrégat.
 */
export interface AggregateMembership {
  /**
   * Nom canonique de l'agrégat sur le même device.
   */
  name: string;
  /**
   * État effectif selon `aggregates[]` ; null si l'appartenance vient de `interfaces[].members`.
   */
  member_status: MemberStatus | null;
}
/**
 * Liens ajoutés, retirés, changés. Identité : la paire triée des bouts (`kind` n'en fait pas partie en V1).
 */
export interface LinkChanges {
  /**
   * Liens présents dans `after` seulement, tels qu'ils y sont ; triés par paire de bouts.
   */
  added: Link[];
  /**
   * Liens présents dans `before` seulement, tels qu'ils y étaient ; triés par paire de bouts.
   */
  removed: Link[];
  /**
   * Liens présents des deux côtés dont un champ non volatil diffère ; référence `link`, triés par identité.
   */
  changed: EntityChange[];
}
/**
 * Une arête. V1 : `cable` seulement ; les autres sortes sont réservées aux vues L2 / L3.
 */
export interface Link {
  a: Endpoint;
  b: Endpoint;
  kind: LinkKind;
  status: EvidenceStatus;
  /**
   * Témoignages, triés par (source, témoin, voisin résolu).
   *
   * @minItems 1
   */
  evidence: [LinkEvidence, ...LinkEvidence[]];
  oper: LinkOper;
  /**
   * Vitesse commune aux deux bouts ; null si différente ou inconnue.
   */
  speed_mbps: number | null;
  /**
   * Agrégat du bout `a` ; null sinon.
   */
  aggregate_a: string | null;
  /**
   * Agrégat du bout `b` ; null sinon.
   */
  aggregate_b: string | null;
}
/**
 * Un témoignage à l'origine du lien : une opinion datée d'une source, jamais un lien à elle seule.
 */
export interface LinkEvidence {
  source: EvidenceSource;
  witness: Endpoint;
  remote_raw: RemoteRaw;
  remote_resolved: ResolvedRemote;
  resolution: Resolution;
}
/**
 * Le voisin tel qu'annoncé par la source, avant résolution et normalisation.
 */
export interface RemoteRaw {
  /**
   * Nom (ou MAC, ou IP) du voisin, brut.
   */
  name: string;
  /**
   * Port du voisin, brut ; null si la source n'en donne pas.
   */
  port: string | null;
}
/**
 * Le voisin après résolution (R0) et normalisation (R1) : toujours le device du bout opposé au témoin.
 */
export interface ResolvedRemote {
  /**
   * Device résolu ; celui du bout opposé au témoin.
   */
  hostname: string;
  /**
   * Port résolu ; null quand la description ne nomme pas de port (`C1|voisin|`) : l'accord avec l'observé se juge alors sur le device seul (R3), comme pour un port distant resté en MAC.
   */
  interface: string | null;
}
/**
 * Agrégats ajoutés, retirés, changés. Identité : `(hostname, name)`.
 */
export interface AggregateChanges {
  /**
   * Agrégats présents dans `after` seulement, tels qu'ils y sont ; triés par (hostname, nom naturel).
   */
  added: SnapshotAggregate[];
  /**
   * Agrégats présents dans `before` seulement, tels qu'ils y étaient ; triés par (hostname, nom naturel).
   */
  removed: SnapshotAggregate[];
  /**
   * Agrégats présents des deux côtés dont un champ non volatil diffère ; référence `aggregate`, triés par identité.
   */
  changed: EntityChange[];
}
/**
 * Un agrégat, clé `(hostname, name)`, recopié de `aggregates[]` avec ses câbles et son état dégradé.
 */
export interface SnapshotAggregate {
  /**
   * Hostname du nœud.
   */
  hostname: string;
  /**
   * Nom canonique de l'agrégat.
   */
  name: string;
  oper_status: LinkStatus;
  protocol: AggregationProtocol;
  /**
   * Mode LACP ; null si non LACP ou non lu.
   */
  lacp_mode: LacpMode | null;
  /**
   * Minimum de membres actifs configuré ; null si non lu.
   */
  min_links: number | null;
  /**
   * Membres et états, triés par nom naturel.
   */
  members: AggregateMember[];
  /**
   * Identifiant vPC / MLAG ; null sinon.
   */
  mlag_id: number | null;
  /**
   * true : peer-link du MLAG ; false : ne l'est pas ; null : non lu dans le bundle (pas un drapeau).
   */
  mlag_peer_link: boolean | null;
  /**
   * Clés des câbles de ses membres, triées ; forment un faisceau.
   */
  cables: LinkKey[];
  /**
   * true si au moins un membre n'est pas `bundled`.
   */
  degraded: boolean;
}
/**
 * Un membre d'agrégat et son état effectif.
 */
export interface AggregateMember {
  /**
   * Nom canonique du membre, identique à `interfaces[].name`.
   */
  name: string;
  status: MemberStatus;
}
/**
 * La clé d'un lien : ses deux bouts, triés. Jamais d'identifiant synthétique.
 */
export interface LinkKey {
  a: Endpoint;
  b: Endpoint;
}
/**
 * Domaines MLAG ajoutés, retirés, changés. Identité : `(mlag_id, membres)`.
 */
export interface MlagDomainChanges {
  /**
   * Domaines présents dans `after` seulement, tels qu'ils y sont ; triés par (`mlag_id`, membres).
   */
  added: MlagDomain[];
  /**
   * Domaines présents dans `before` seulement, tels qu'ils y étaient ; triés par (`mlag_id`, membres).
   */
  removed: MlagDomain[];
  /**
   * Domaines présents des deux côtés dont un champ non volatil diffère ; référence `mlag_domain`, triés par identité.
   */
  changed: EntityChange[];
}
/**
 * Deux agrégats de deux devices distincts portant le même `mlag_id` (vPC, MC-LAG).
 */
export interface MlagDomain {
  /**
   * Identifiant partagé.
   */
  mlag_id: number;
  /**
   * Les deux agrégats, triés par hostname.
   *
   * @minItems 2
   * @maxItems 2
   */
  members: [MlagMember, MlagMember];
  /**
   * L'agrégat `mlag_peer_link` d'un des deux devices ; null si absent.
   */
  peer_link: MlagMember | null;
  /**
   * Device au bout des câbles des deux agrégats s'il est unique ; null sinon (contrôle).
   */
  downstream: string | null;
}
/**
 * Clusters HA ajoutés, retirés, changés. Identité : l'ensemble des membres (un membre perdu = cluster retiré
 * et cluster ajouté, docs/07 Q1).
 */
export interface HaClusterChanges {
  /**
   * Clusters présents dans `after` seulement, tels qu'ils y sont ; triés par membres.
   */
  added: HaCluster[];
  /**
   * Clusters présents dans `before` seulement, tels qu'ils y étaient ; triés par membres.
   */
  removed: HaCluster[];
  /**
   * Clusters présents des deux côtés dont un champ non volatil diffère ; référence `cluster`, triés par identité.
   */
  changed: EntityChange[];
}
/**
 * Un cluster HA, clé = hostnames des membres triés.
 */
export interface HaCluster {
  /**
   * Membres, triés par hostname.
   *
   * @minItems 1
   */
  members: [HaClusterMember, ...HaClusterMember[]];
  mode: HaMode;
  /**
   * Nom du cluster ; null si absent.
   */
  cluster_name: string | null;
  /**
   * Interfaces de heartbeat des membres, triées par (hostname, nom naturel).
   */
  heartbeat_interfaces: HeartbeatInterface[];
}
/**
 * Un membre de cluster HA, vu par les documents `ha[]` qui le décrivent.
 */
export interface HaClusterMember {
  /**
   * Hostname du membre, clé de `nodes[]`.
   */
  hostname: string;
  role: HaRole;
  state: HaState;
  /**
   * Priorité HA ; null si non lue.
   */
  priority: number | null;
  /**
   * Devices dont le document `ha` décrit ce membre, triés.
   *
   * @minItems 1
   */
  reported_by: [string, ...string[]];
}
/**
 * Une interface de heartbeat d'un membre, et le câble qui la porte s'il est connu.
 */
export interface HeartbeatInterface {
  /**
   * Membre propriétaire.
   */
  hostname: string;
  /**
   * Nom canonique de l'interface.
   */
  interface: string;
  /**
   * Clé du câble observé ou documenté ; null si aucun (jamais inventé).
   */
  cable: LinkKey | null;
}
/**
 * Contrôles apparus, résolus, persistants. Identité : `(code, refs)` ; les `details` décrivent, ils
 * n'identifient pas (un contrôle dont seuls les détails changent persiste).
 */
export interface CheckChanges {
  /**
   * Contrôles de `after` sans équivalent dans `before`, triés par (code, références, détails).
   */
  appeared: Check[];
  /**
   * Contrôles de `before` sans équivalent dans `after`, triés par (code, références, détails).
   */
  resolved: Check[];
  /**
   * Nombre de contrôles présents des deux côtés.
   */
  persisted: number;
}
/**
 * Un contrôle : ce que B1 a constaté, ou un constat du contrat d'entrée recopié (`origin = bundle`).
 */
export interface Check {
  code: CheckCode;
  severity: Severity;
  origin: CheckOrigin;
  /**
   * Éléments concernés, triés par (sorte, identité).
   *
   * @minItems 1
   */
  refs: [
    NodeRef | InterfaceRef | LinkRef | AggregateRef | ClusterRef,
    ...(NodeRef | InterfaceRef | LinkRef | AggregateRef | ClusterRef)[]
  ];
  /**
   * Détail structuré propre au code (cibles, statuts, topics) ; valeurs JSON seulement.
   */
  details: {
    [k: string]: JsonValue;
  };
}
/**
 * Couverture changée sur un device présent des deux côtés : statut de collecte ou statut d'un topic. Les
 * devices ajoutés ou retirés se lisent dans `nodes`.
 */
export interface CoverageChanges {
  /**
   * Référence `node` ; champs `status`, `topics.<topic>` ; triés par hostname.
   */
  changed: EntityChange[];
}
/**
 * Un fait lu dans les champs volatils, qu'aucun `changed` ne porte.
 */
export interface Event {
  kind: EventKind;
  /**
   * Le nœud (`rebooted`) ou l'interface (`flapped`).
   */
  ref: NodeRef | InterfaceRef | LinkRef | AggregateRef | ClusterRef | MlagDomainRef;
  /**
   * Ce que l'événement a lu, typé par sa sorte : `RebootedDetails` ou `FlappedDetails`.
   */
  details: RebootedDetails | FlappedDetails;
}
/**
 * Ce qu'un `rebooted` a lu : l'uptime d'avant (null si non lu), celui d'après, et la fenêtre.
 */
export interface RebootedDetails {
  /**
   * `uptime_seconds` du nœud dans `before` ; null si non lu.
   */
  uptime_before: number | null;
  /**
   * `uptime_seconds` du nœud dans `after`, plus court que la fenêtre.
   */
  uptime_after: number;
  /**
   * `elapsed_seconds` du diff, recopié : la fenêtre.
   */
  elapsed_seconds: number;
}
/**
 * Ce qu'un `flapped` a lu : l'âge du dernier changement dans `after`, et la fenêtre.
 */
export interface FlappedDetails {
  /**
   * `last_change_age_seconds` du port dans `after`, plus court que la fenêtre.
   */
  age_after: number;
  /**
   * `elapsed_seconds` du diff, recopié : la fenêtre.
   */
  elapsed_seconds: number;
}
