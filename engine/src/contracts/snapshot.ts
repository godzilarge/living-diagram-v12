// Généré par engine/types.mjs depuis contracts/src/ld_contracts/schema/snapshot-v1.schema.json : ne pas éditer.
// Référence : contracts/CONTRAT.md. Régénérer avec `npm run types` dans engine/.

export type RunStatus = "completed" | "partial" | "failed" | "running";
export type NodeKind = "device" | "external" | "stub";
export type DeviceType =
  "switch" | "router" | "firewall" | "load_balancer" | "wireless_controller" | "server" | "other";
export type ChassisRole = "active" | "standby" | "member" | "master";
export type ChassisState = "ready" | "removed" | "provisioned" | "version_mismatch";
export type CollectionStatus = "success" | "partial" | "failed" | "unreachable" | "not_collected";
export type EvidenceSource = "lldp" | "cdp" | "description";
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
export type JsonValue = unknown | undefined;
export type TopicStatus = "success" | "failed" | "absent";

/**
 * Le graphe d'une run : nœuds, interfaces, arêtes typées, structures, contrôles, couverture, rapport.
 *
 * Tout vient du bundle ou d'une règle déterministe de B1 : aucun horodatage propre, aucun identifiant
 * synthétique, aucune coordonnée. Même bundle ⇒ même snapshot, à l'octet (`canonical_json`).
 */
export interface Snapshot {
  /**
   * Version semver du contrat Snapshot, indépendante de celle du RunBundle.
   */
  snapshot_version: string;
  source: Source;
  /**
   * Nœuds, triés par (sorte, hostname) ; hostname unique sans la casse.
   */
  nodes: Node[];
  /**
   * Interfaces, triées par (hostname, nom naturel).
   */
  interfaces: SnapshotInterface[];
  /**
   * Arêtes, triées par paire d'endpoints.
   */
  links: Link[];
  /**
   * Agrégats, triés par (hostname, nom naturel).
   */
  aggregates: SnapshotAggregate[];
  /**
   * Domaines MLAG, triés par (mlag_id, membres).
   */
  mlag_domains: MlagDomain[];
  /**
   * Clusters HA, triés par membres.
   */
  ha_clusters: HaCluster[];
  /**
   * Contrôles, triés par (code, références, détails).
   */
  checks: Check[];
  /**
   * Un élément par nœud `device`, triés par hostname.
   */
  coverage: Coverage[];
  report: Report;
}
/**
 * D'où vient le snapshot : le bundle, identifié par son empreinte. Aucun horodatage propre à B1.
 */
export interface Source {
  /**
   * Infrastructure dessinée.
   */
  infrastructure: string;
  /**
   * Run amont.
   */
  collector_run_id: string;
  /**
   * Empreinte SHA-256 du bundle archivé (hexadécimal minuscule).
   */
  bundle_sha256: string;
  /**
   * Version du contrat RunBundle du bundle.
   */
  contract_version: string;
  /**
   * `produced_at` du bundle.
   */
  produced_at: string;
  /**
   * `exporter_version` du bundle.
   */
  exporter_version: string;
  run: RunSummary;
}
/**
 * La run amont, telle que le bundle la décrit.
 */
export interface RunSummary {
  /**
   * Début de la run.
   */
  start_datetime: string;
  /**
   * Fin de la run ; null si absente.
   */
  end_datetime: string | null;
  status: RunStatus;
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
    [k: string]: JsonValue | undefined;
  };
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
 * Ce qui a été collecté sur un device en périmètre : « pas vu parce que non collecté », pas « n'existe pas ».
 */
export interface Coverage {
  /**
   * Device en périmètre, clé de `nodes[]` (sorte `device`).
   */
  hostname: string;
  status: CollectionStatus;
  topics: TopicCoverage;
}
/**
 * Résultat de collecte par topic sur un device : `absent` = non demandé, rien à attendre.
 */
export interface TopicCoverage {
  interfaces: TopicStatus;
  aggregates: TopicStatus;
  lldp: TopicStatus;
  cdp: TopicStatus;
  system: TopicStatus;
  ha: TopicStatus;
}
/**
 * Le rapport de corrélation. Les clés nullables absentes du bundle n'y sont pas : elles décrivent la
 * livraison et vivent dans le rapport d'ingestion (décision 2026-09-19).
 */
export interface Report {
  counts: SectionCounts;
  /**
   * Recopié du bundle : ce que B0 a dû normaliser.
   */
  residual_normalizations: {
    [k: string]: number | undefined;
  };
  /**
   * Compteur par règle de B1 (`ifname_short_to_long`…) ; doit rester explicable.
   */
  applied_normalizations: {
    [k: string]: number | undefined;
  };
  /**
   * Noms de voisins finis en stub, triés, sans doublon.
   */
  unresolved_names: string[];
  /**
   * Descriptions non vides que R2 n'a pas su lire.
   */
  unparseable_descriptions: number;
}
/**
 * Taille de chaque section, vérifiée à la validation.
 */
export interface SectionCounts {
  /**
   * Nombre de nœuds.
   */
  nodes: number;
  /**
   * Nombre d'interfaces.
   */
  interfaces: number;
  /**
   * Nombre de liens.
   */
  links: number;
  /**
   * Nombre d'agrégats.
   */
  aggregates: number;
  /**
   * Nombre de domaines MLAG.
   */
  mlag_domains: number;
  /**
   * Nombre de clusters HA.
   */
  ha_clusters: number;
  /**
   * Nombre de contrôles.
   */
  checks: number;
}
