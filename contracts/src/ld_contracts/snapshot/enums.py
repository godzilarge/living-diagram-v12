"""Énumérations fermées du contrat Snapshot v1 (celles du RunBundle sont réutilisées telles quelles)."""

from enum import StrEnum


class NodeKind(StrEnum):
    DEVICE = "device"
    EXTERNAL = "external"
    STUB = "stub"


class CollectionStatus(StrEnum):
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    UNREACHABLE = "unreachable"
    NOT_COLLECTED = "not_collected"


class TopicStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"
    ABSENT = "absent"


class LinkKind(StrEnum):
    CABLE = "cable"
    L2_SEGMENT = "l2_segment"
    L3_ADJACENCY = "l3_adjacency"
    BGP_SESSION = "bgp_session"


class EvidenceStatus(StrEnum):
    CONFIRMED = "confirmed"
    OBSERVED_ONLY = "observed_only"
    DOCUMENTED_ONLY = "documented_only"


class LinkOper(StrEnum):
    UP = "up"
    DOWN = "down"
    UNKNOWN = "unknown"


class EvidenceSource(StrEnum):
    LLDP = "lldp"
    CDP = "cdp"
    DESCRIPTION = "description"


OBSERVED_SOURCES = frozenset({EvidenceSource.LLDP, EvidenceSource.CDP})


class Resolution(StrEnum):
    HOSTNAME = "hostname"
    HOSTNAME_CASEFOLD = "hostname_casefold"
    REPORTED_HOSTNAME = "reported_hostname"
    ADDRESS = "address"
    STUB = "stub"


class Severity(StrEnum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class CheckOrigin(StrEnum):
    BUNDLE = "bundle"
    CORRELATION = "correlation"


class InterfaceRole(StrEnum):
    HEARTBEAT = "heartbeat"
    MLAG_PEER_LINK = "mlag_peer_link"
