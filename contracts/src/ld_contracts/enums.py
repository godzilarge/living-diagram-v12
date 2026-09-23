"""Énumérations fermées du contrat RunBundle v1.

Vocabulaire aligné sur des références publiques quand elles existent :
- ``OperStatus`` : IF-MIB ``ifOperStatus`` (RFC 2863) ;
- ``MemberStatus`` : condensé des booléens LACP OpenConfig (collecting, distributing,
  synchronization, aggregatable) et des drapeaux Cisco.
"""

from enum import StrEnum


class InterfaceType(StrEnum):
    PHYSICAL = "physical"
    AGGREGATE = "aggregate"
    SUBINTERFACE = "subinterface"
    SVI = "svi"
    LOOPBACK = "loopback"
    TUNNEL = "tunnel"
    MANAGEMENT = "management"
    OTHER = "other"


class AdminStatus(StrEnum):
    UP = "up"
    DOWN = "down"


class OperStatus(StrEnum):
    UP = "up"
    DOWN = "down"
    TESTING = "testing"
    UNKNOWN = "unknown"
    DORMANT = "dormant"
    NOT_PRESENT = "not_present"
    LOWER_LAYER_DOWN = "lower_layer_down"


class LinkStatus(StrEnum):
    UP = "up"
    DOWN = "down"


class Duplex(StrEnum):
    FULL = "full"
    HALF = "half"
    UNKNOWN = "unknown"


class SwitchportMode(StrEnum):
    ACCESS = "access"
    TRUNK = "trunk"
    ROUTED = "routed"
    NONE = "none"


class IpRole(StrEnum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    VIRTUAL = "virtual"


class DeviceType(StrEnum):
    SWITCH = "switch"
    ROUTER = "router"
    FIREWALL = "firewall"
    LOAD_BALANCER = "load_balancer"
    WIRELESS_CONTROLLER = "wireless_controller"
    SERVER = "server"
    OTHER = "other"


class AggregationProtocol(StrEnum):
    LACP = "lacp"
    STATIC = "static"
    PAGP = "pagp"


class LacpMode(StrEnum):
    ACTIVE = "active"
    PASSIVE = "passive"


class MemberStatus(StrEnum):
    BUNDLED = "bundled"
    SUSPENDED = "suspended"
    STANDBY = "standby"
    INDIVIDUAL = "individual"
    DOWN = "down"
    NOT_IN_USE = "not_in_use"


class ChassisRole(StrEnum):
    ACTIVE = "active"
    STANDBY = "standby"
    MEMBER = "member"
    MASTER = "master"


class ChassisState(StrEnum):
    READY = "ready"
    REMOVED = "removed"
    PROVISIONED = "provisioned"
    VERSION_MISMATCH = "version_mismatch"


class HaMode(StrEnum):
    ACTIVE_PASSIVE = "active_passive"
    ACTIVE_ACTIVE = "active_active"
    STANDALONE = "standalone"
    OTHER = "other"


class HaRole(StrEnum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    ACTIVE = "active"
    STANDBY = "standby"
    MEMBER = "member"


class HaState(StrEnum):
    UP = "up"
    DOWN = "down"
    UNKNOWN = "unknown"


class RunStatus(StrEnum):
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"
    RUNNING = "running"


class TaskStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"


class DeviceTaskStatus(StrEnum):
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    UNREACHABLE = "unreachable"
