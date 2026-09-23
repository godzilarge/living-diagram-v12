"""Agrégats, domaines MLAG et clusters HA."""

from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import Bool, ContractModel, Hostname, IfName, Int
from ld_contracts.enums import AggregationProtocol, HaMode, HaRole, HaState, LacpMode, LinkStatus, MemberStatus
from ld_contracts.models_interfaces import AggregateMember
from ld_contracts.snapshot.order import identity, natural_key, require_canonical
from ld_contracts.snapshot.refs import LinkKey, link_key


class SnapshotAggregate(ContractModel):
    """Un agrégat, clé `(hostname, name)`, recopié de `aggregates[]` avec ses câbles et son état dégradé."""

    hostname: Hostname = Field(description="Hostname du nœud.")
    name: IfName = Field(description="Nom canonique de l'agrégat.")
    oper_status: LinkStatus = Field(description="État opérationnel de l'agrégat.")
    protocol: AggregationProtocol = Field(description="Protocole d'agrégation.")
    lacp_mode: LacpMode | None = Field(description="Mode LACP ; null si non LACP ou non lu.")
    min_links: Int | None = Field(description="Minimum de membres actifs configuré ; null si non lu.")
    members: tuple[AggregateMember, ...] = Field(description="Membres et états, triés par nom naturel.")
    mlag_id: Int | None = Field(description="Identifiant vPC / MLAG ; null sinon.")
    mlag_peer_link: Bool = Field(description="true si l'agrégat est le peer-link du MLAG.")
    cables: tuple[LinkKey, ...] = Field(description="Clés des câbles de ses membres, triées ; forment un faisceau.")
    degraded: Bool = Field(description="true si au moins un membre n'est pas `bundled`.")

    @model_validator(mode="after")
    def _canonical_and_degraded(self) -> SnapshotAggregate:
        require_canonical(self.members, key=lambda m: natural_key(m.name), section="members")
        require_canonical(self.cables, key=link_key, section="cables")
        expected = any(m.status != MemberStatus.BUNDLED for m in self.members)
        if self.degraded != expected:
            raise PydanticCustomError(
                "aggregate_degraded_mismatch", "degraded ne reflète pas l'état des membres", {"expected": expected}
            )
        return self


class MlagMember(ContractModel):
    """Un agrégat membre d'un domaine MLAG."""

    hostname: Hostname = Field(description="Device de l'agrégat.")
    aggregate: IfName = Field(description="Nom canonique de l'agrégat ; clé de `aggregates[]`.")


def mlag_member_key(member: MlagMember) -> tuple:
    return member.hostname, natural_key(member.aggregate)


class MlagDomain(ContractModel):
    """Deux agrégats de deux devices distincts portant le même `mlag_id` (vPC, MC-LAG)."""

    mlag_id: Int = Field(description="Identifiant partagé.")
    members: tuple[MlagMember, ...] = Field(
        min_length=2, max_length=2, description="Les deux agrégats, triés par hostname."
    )
    peer_link: MlagMember | None = Field(
        description="L'agrégat `mlag_peer_link` d'un des deux devices ; null si absent."
    )
    downstream: Hostname | None = Field(
        description="Device au bout des câbles des deux agrégats s'il est unique ; null sinon (contrôle)."
    )

    @model_validator(mode="after")
    def _members_distinct_devices(self) -> MlagDomain:
        require_canonical(self.members, key=mlag_member_key, section="members")
        if self.members[0].hostname == self.members[1].hostname:
            raise PydanticCustomError(
                "mlag_domain_same_device", "les deux agrégats du domaine sont sur le même device", {}
            )
        return self


class HaClusterMember(ContractModel):
    """Un membre de cluster HA, vu par les documents `ha[]` qui le décrivent."""

    hostname: Hostname = Field(description="Hostname du membre, clé de `nodes[]`.")
    role: HaRole = Field(description="Rôle retenu.")
    state: HaState = Field(description="État retenu.")
    priority: Int | None = Field(description="Priorité HA ; null si non lue.")
    reported_by: tuple[Hostname, ...] = Field(
        min_length=1, description="Devices dont le document `ha` décrit ce membre, triés."
    )

    @model_validator(mode="after")
    def _reported_by_canonical(self) -> HaClusterMember:
        require_canonical(self.reported_by, key=identity, section="reported_by")
        return self


class HeartbeatInterface(ContractModel):
    """Une interface de heartbeat d'un membre, et le câble qui la porte s'il est connu."""

    hostname: Hostname = Field(description="Membre propriétaire.")
    interface: IfName = Field(description="Nom canonique de l'interface.")
    cable: LinkKey | None = Field(description="Clé du câble observé ou documenté ; null si aucun (jamais inventé).")


def heartbeat_key(item: HeartbeatInterface) -> tuple:
    return item.hostname, natural_key(item.interface)


class HaCluster(ContractModel):
    """Un cluster HA, clé = hostnames des membres triés."""

    members: tuple[HaClusterMember, ...] = Field(min_length=1, description="Membres, triés par hostname.")
    mode: HaMode = Field(description="Mode du cluster.")
    cluster_name: str | None = Field(description="Nom du cluster ; null si absent.")
    heartbeat_interfaces: tuple[HeartbeatInterface, ...] = Field(
        description="Interfaces de heartbeat des membres, triées par (hostname, nom naturel)."
    )

    @model_validator(mode="after")
    def _canonical_and_heartbeats_on_members(self) -> HaCluster:
        require_canonical(self.members, key=lambda m: m.hostname, section="members")
        require_canonical(self.heartbeat_interfaces, key=heartbeat_key, section="heartbeat_interfaces")
        members = {m.hostname for m in self.members}
        for index, member in enumerate(self.members):
            if not set(member.reported_by) <= members:
                raise PydanticCustomError(
                    "reported_by_not_a_member", "un membre est rapporté par un device hors du cluster", {"index": index}
                )
        for index, item in enumerate(self.heartbeat_interfaces):
            if item.hostname not in members:
                raise PydanticCustomError(
                    "heartbeat_not_a_member", "interface de heartbeat hors des membres du cluster", {"index": index}
                )
        return self
