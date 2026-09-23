"""Catalogue fermé des codes de contrôle du snapshot, avec sévérités, origine et règle (docs/05 §4).

Les constats du contrat d'entrée (`ld_contracts.checks`) sont recopiés dans le snapshot avec
`origin = bundle`, sauf `nullable_key_absent` qui décrit la livraison et vit dans le rapport d'ingestion.
"""

from dataclasses import dataclass
from enum import StrEnum

from ld_contracts.checks import ABSENT_CODE, FINDING_CODES
from ld_contracts.snapshot.enums import CheckOrigin, Severity


@dataclass(frozen=True, slots=True)
class CheckSpec:
    severities: frozenset[Severity]
    origin: CheckOrigin
    rule: str
    meaning: str


class CheckCode(StrEnum):
    NEIGHBOR_NAME_CASE_DIFFERS = "neighbor_name_case_differs"
    NEIGHBOR_RESOLVED_BY_REPORTED_HOSTNAME = "neighbor_resolved_by_reported_hostname"
    NEIGHBOR_RESOLVED_BY_ADDRESS = "neighbor_resolved_by_address"
    NEIGHBOR_NAME_AMBIGUOUS = "neighbor_name_ambiguous"
    NEIGHBOR_UNKNOWN = "neighbor_unknown"
    REMOTE_PORT_IS_MAC = "remote_port_is_mac"
    REMOTE_PORT_IS_AGGREGATE = "remote_port_is_aggregate"
    DESCRIPTION_UNPARSEABLE = "description_unparseable"
    DESCRIPTION_DISAGREES_WITH_OBSERVED = "description_disagrees_with_observed"
    MULTIPLE_OBSERVED_NEIGHBORS = "multiple_observed_neighbors"
    ONE_WAY_OBSERVATION = "one_way_observation"
    SELF_OBSERVATION = "self_observation"
    DOCUMENTED_NOT_OBSERVED = "documented_not_observed"
    AGGREGATE_MEMBER_NOT_BUNDLED = "aggregate_member_not_bundled"
    AGGREGATE_BELOW_MIN_LINKS = "aggregate_below_min_links"
    AGGREGATE_PROTOCOL_MISMATCH = "aggregate_protocol_mismatch"
    MLAG_DOWNSTREAM_INCONSISTENT = "mlag_downstream_inconsistent"
    MLAG_PAIR_DIRECT_LINK = "mlag_pair_direct_link"
    HA_MEMBER_DOWN = "ha_member_down"
    HA_VIEW_MISMATCH = "ha_view_mismatch"
    HEARTBEAT_LINK_NOT_OBSERVED = "heartbeat_link_not_observed"
    LINK_OPER_MISMATCH = "link_oper_mismatch"
    LINK_SPEED_MISMATCH = "link_speed_mismatch"
    NATIVE_VLAN_MISMATCH = "native_vlan_mismatch"
    LINK_DOWN = "link_down"
    DOCUMENTED_PORT_WITHOUT_TRANSCEIVER = "documented_port_without_transceiver"
    DEVICE_UNREACHABLE = "device_unreachable"
    DEVICE_PARTIAL_COLLECTION = "device_partial_collection"
    # Constats du contrat d'entrée, recopiés (origin = bundle).
    PARENT_INTERFACE_UNKNOWN = "parent_interface_unknown"
    INTERFACE_MEMBER_UNKNOWN = "interface_member_unknown"
    AGGREGATE_INTERFACE_UNKNOWN = "aggregate_interface_unknown"
    AGGREGATE_MEMBER_UNKNOWN = "aggregate_member_unknown"
    LOCAL_INTERFACE_UNKNOWN = "local_interface_unknown"
    HA_MEMBER_UNKNOWN = "ha_member_unknown"
    HEARTBEAT_INTERFACE_UNKNOWN = "heartbeat_interface_unknown"
    VRF_DEFAULT_CASE = "vrf_default_case"
    REPORTED_HOSTNAME_DIFFERS = "reported_hostname_differs"
    DEVICE_WITHOUT_TASK = "device_without_task"
    DOCUMENTS_WITHOUT_TASK = "documents_without_task"


def _b1(rule: str, meaning: str, *severities: Severity) -> CheckSpec:
    return CheckSpec(frozenset(severities), CheckOrigin.CORRELATION, rule, meaning)


def _bundle(code: str, severity: Severity) -> CheckSpec:
    return CheckSpec(frozenset({severity}), CheckOrigin.BUNDLE, "contrat", FINDING_CODES[code])


ERROR, WARNING, INFO = Severity.ERROR, Severity.WARNING, Severity.INFO

CATALOGUE: dict[CheckCode, CheckSpec] = {
    CheckCode.NEIGHBOR_NAME_CASE_DIFFERS: _b1("R0", "voisin résolu après repli de casse", INFO),
    CheckCode.NEIGHBOR_RESOLVED_BY_REPORTED_HOSTNAME: _b1(
        "R0", "voisin résolu par le nom que l'équipement dit de lui-même : inventaire et équipement divergent", WARNING
    ),
    CheckCode.NEIGHBOR_RESOLVED_BY_ADDRESS: _b1(
        "R0", "voisin résolu par une MAC ou une IP, faute de nom annoncé", WARNING
    ),
    CheckCode.NEIGHBOR_NAME_AMBIGUOUS: _b1(
        "R0", "plusieurs devices répondent au nom annoncé : aucun ne gagne, stub", WARNING
    ),
    CheckCode.NEIGHBOR_UNKNOWN: _b1("R0", "voisin inconnu de `devices` : nœud stub", INFO),
    CheckCode.REMOTE_PORT_IS_MAC: _b1("R1", "port distant annoncé en MAC, non remplacé par un nom d'interface", INFO),
    CheckCode.REMOTE_PORT_IS_AGGREGATE: _b1(
        "R1",
        "port distant annoncé par le nom d'un agrégat, membre non déterminé : le câble s'arrête à l'agrégat",
        WARNING,
    ),
    CheckCode.DESCRIPTION_UNPARSEABLE: _b1("R2", "description non vide qui ne suit pas la grammaire", INFO),
    CheckCode.DESCRIPTION_DISAGREES_WITH_OBSERVED: _b1(
        "R3", "la description d'un port cite un autre voisin que celui observé ; le câble suit l'observé", WARNING
    ),
    CheckCode.MULTIPLE_OBSERVED_NEIGHBORS: _b1(
        "R3", "deux voisins observés sur un même port ; les deux câbles sont dessinés", WARNING
    ),
    CheckCode.SELF_OBSERVATION: _b1(
        "R3", "un port se désigne lui-même comme voisin (boucle, réflecteur, description) : aucun câble", WARNING
    ),
    CheckCode.ONE_WAY_OBSERVATION: _b1(
        "R3", "observé d'un seul côté alors que l'autre a collecté le même protocole", WARNING
    ),
    CheckCode.DOCUMENTED_NOT_OBSERVED: _b1(
        "R3",
        "câble documenté sans observation : warning si les deux bouts ont collecté LLDP ou CDP, info sinon",
        WARNING,
        INFO,
    ),
    CheckCode.AGGREGATE_MEMBER_NOT_BUNDLED: _b1("R4", "un membre d'agrégat n'est pas `bundled`", WARNING),
    CheckCode.AGGREGATE_BELOW_MIN_LINKS: _b1("R4", "membres `bundled` sous `min_links`", ERROR),
    CheckCode.AGGREGATE_PROTOCOL_MISMATCH: _b1(
        "R4", "protocoles d'agrégation différents aux deux bouts d'un faisceau", ERROR
    ),
    CheckCode.MLAG_DOWNSTREAM_INCONSISTENT: _b1(
        "R4", "les deux agrégats d'un domaine MLAG ne mènent pas au même device", WARNING
    ),
    CheckCode.MLAG_PAIR_DIRECT_LINK: _b1(
        "R4", "deux agrégats de même `mlag_id` se rejoignent : peer-link mal étiqueté", WARNING
    ),
    CheckCode.HA_MEMBER_DOWN: _b1("R4", "un membre du cluster est `down`", ERROR),
    CheckCode.HA_VIEW_MISMATCH: _b1("R4", "deux membres décrivent le cluster différemment", WARNING),
    CheckCode.HEARTBEAT_LINK_NOT_OBSERVED: _b1("R4", "interface de heartbeat sans câble observé ni documenté", INFO),
    CheckCode.LINK_OPER_MISMATCH: _b1("R5", "un bout `up`, l'autre `down`", WARNING),
    CheckCode.LINK_SPEED_MISMATCH: _b1("R5", "vitesses opérationnelles différentes aux deux bouts", WARNING),
    CheckCode.NATIVE_VLAN_MISMATCH: _b1("R5", "VLAN non tagué différent aux deux bouts", WARNING),
    CheckCode.LINK_DOWN: _b1("R5", "les deux bouts sont `down` ; le câble reste dessiné", INFO),
    CheckCode.DOCUMENTED_PORT_WITHOUT_TRANSCEIVER: _b1(
        "R5", "port `not_present` dont la description cite un voisin", WARNING
    ),
    CheckCode.DEVICE_UNREACHABLE: _b1("R5", "device injoignable pendant la run", ERROR),
    CheckCode.DEVICE_PARTIAL_COLLECTION: _b1(
        "R5", "collecte partielle ; les topics en échec sont dans `details`", INFO
    ),
    CheckCode.PARENT_INTERFACE_UNKNOWN: _bundle("parent_interface_unknown", WARNING),
    CheckCode.INTERFACE_MEMBER_UNKNOWN: _bundle("interface_member_unknown", WARNING),
    CheckCode.AGGREGATE_INTERFACE_UNKNOWN: _bundle("aggregate_interface_unknown", WARNING),
    CheckCode.AGGREGATE_MEMBER_UNKNOWN: _bundle("aggregate_member_unknown", WARNING),
    CheckCode.LOCAL_INTERFACE_UNKNOWN: _bundle("local_interface_unknown", WARNING),
    CheckCode.HA_MEMBER_UNKNOWN: _bundle("ha_member_unknown", WARNING),
    CheckCode.HEARTBEAT_INTERFACE_UNKNOWN: _bundle("heartbeat_interface_unknown", WARNING),
    CheckCode.VRF_DEFAULT_CASE: _bundle("vrf_default_case", INFO),
    CheckCode.REPORTED_HOSTNAME_DIFFERS: _bundle("reported_hostname_differs", WARNING),
    CheckCode.DEVICE_WITHOUT_TASK: _bundle("device_without_task", WARNING),
    CheckCode.DOCUMENTS_WITHOUT_TASK: _bundle("documents_without_task", WARNING),
}

RECOPIED_FINDING_CODES = frozenset(set(FINDING_CODES) - {ABSENT_CODE})

SNAPSHOT_ERROR_TYPES = {
    "snapshot_major_unsupported": "la version majeure de `snapshot_version` n'est pas celle du validateur",
    "duplicate_identity": "deux éléments d'une liste ont la même clé",
    "not_canonical_order": "une liste n'est pas dans l'ordre canonique (R6)",
    "link_endpoints_equal": "les deux bouts d'un lien sont le même port",
    "link_endpoints_unordered": "les bouts d'un lien ne sont pas triés (`a` doit précéder `b`)",
    "node_fields_for_kind": ("un nœud porte des champs que sa sorte n'admet pas, ou n'en porte pas un qu'elle exige"),
    "stack_count_mismatch": "`member_count` d'un stack diffère du nombre de membres listés",
    "vlan_ranges_not_canonical": (
        "`allowed_vlans` n'est pas trié par `first`, ou deux intervalles se touchent ou se recouvrent"
    ),
    "evidence_witness_not_endpoint": "le témoin d'une évidence n'est aucun des deux bouts du lien",
    "link_status_mismatch": "`status` ne correspond pas aux sources des évidences",
    "aggregate_degraded_mismatch": "`degraded` ne reflète pas l'état des membres",
    "mlag_domain_same_device": "les deux agrégats d'un domaine MLAG sont sur le même device",
    "heartbeat_not_a_member": "une interface de heartbeat appartient à un device qui n'est pas membre du cluster",
    "check_severity_not_allowed": "la sévérité d'un contrôle n'est pas celle que le catalogue admet pour son code",
    "check_origin_mismatch": "l'origine d'un contrôle (`bundle` / `correlation`) ne correspond pas à son code",
    "reference_unknown": "une référence (endpoint, câble, membre, `refs`) ne désigne aucun élément du snapshot",
    "reference_inconsistent": (
        "une référence existe mais contredit la structure : câble d'agrégat qui ne touche aucun membre, câble de "
        "heartbeat qui ne touche pas l'interface, membre de domaine MLAG d'un autre `mlag_id`, `peer_link` non "
        "marqué `mlag_peer_link` ou d'un device tiers, `aggregate_a` / `aggregate_b` différent de "
        "`interfaces[].aggregate`"
    ),
    "evidence_resolved_not_endpoint": "le voisin résolu d'une évidence n'est pas le device du bout opposé au témoin",
    "reported_by_not_a_member": "un membre HA est rapporté par un device qui n'est pas membre du cluster",
    "coverage_status_mismatch": "`coverage[].status` diffère de `nodes[].collection` du même device",
    "coverage_topics_for_status": "un device `unreachable` ou `not_collected` a un topic qui n'est pas `absent`",
    "coverage_mismatch": "`coverage` ne liste pas exactement les nœuds `device`",
    "report_counts_mismatch": "un compte de `report.counts` diffère de la taille de la section",
    "extra_forbidden": "un champ inconnu est présent (le snapshot n'a pas d'`extras`)",
    "missing": "un champ est absent : toutes les clés du snapshot sont requises, `null` compris",
}

# Types levés par les types partagés avec le RunBundle (`IpAddress`, `VlanRange`, `UtcDatetime`, règle VLAN / mode) :
# décrits dans la partie A, rappelés dans la partie B.
SHARED_ERROR_TYPES = (
    "access_vlan_outside_access_mode",
    "trunk_vlans_outside_trunk_mode",
    "vlan_range_inverted",
    "ip_invalid",
    "ip_family_mismatch",
    "ip_prefix_out_of_range",
    "datetime_numeric",
)
