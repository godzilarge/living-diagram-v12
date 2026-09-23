"""Topic ha : clusters, membres, interfaces de heartbeat."""

from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, Extras, Hostname, IfName, Int
from ld_contracts.enums import HaMode, HaRole, HaState


class HaMember(ContractModel):
    """Un membre du cluster tel que vu depuis le device local."""

    name: Hostname = Field(description="Hostname du membre, clé de `devices` (les membres sont des devices).")
    serial: str | None = Field(
        default=None, description="Serial du membre ; null si non lu. Recoupe `devices[].serial_number`."
    )
    role: HaRole = Field(description="Rôle du membre dans le cluster ; celui du device local se lit ici.")
    state: HaState = Field(
        description=(
            "État du membre, celui du device local compris. `down`, ou absent alors qu'il était listé au run "
            "précédent : membre mort."
        )
    )
    priority: Int | None = Field(default=None, description="Priorité HA ; null si non lue.")


class HaStatus(ContractModel):
    """État de haute disponibilité vu depuis un membre (topic `ha`).

    Sources typiques : `get system ha status` + `show system ha` (FortiOS) ; `cphaprob state` + `cphaprob -a if`
    (Gaia ClusterXL). Un document par device membre d'un cluster.

    Le rôle et l'état du device local se lisent dans `members`, où il figure obligatoirement : pas de champ à
    part (2026-09-14). Un device sans HA peut ne pas émettre de document ; s'il en émet un, il est `standalone`
    et se liste seul.
    """

    hostname: Hostname = Field(
        description="Hostname du device local, identique octet pour octet à `devices[].hostname`."
    )
    mode: HaMode = Field(description="Mode du cluster.")
    cluster_name: str | None = Field(
        default=None, description="Nom ou identifiant de groupe du cluster ; null si absent."
    )
    members: tuple[HaMember, ...] = Field(
        description=(
            "Tous les membres du cluster, device local compris : `hostname` figure dans `members[].name`, octet "
            "pour octet et une seule fois, sinon le document est refusé. `standalone` : exactement un membre, le "
            "device lui-même, `role = member` (`state = up` s'il répond)."
        )
    )
    heartbeat_interfaces: tuple[IfName, ...] = Field(
        description=(
            "Interfaces locales dédiées au heartbeat ou à la synchronisation, noms canoniques ; liste vide si non lu. "
            "Rend le peering HA dessinable comme un lien documenté."
        )
    )
    extras: Extras = Field(description="Détail brut vendeur (état de synchronisation…) ; jamais lu par B1.")

    @model_validator(mode="after")
    def _local_device_is_a_member(self) -> HaStatus:
        """La vue locale n'existe que dans `members` : le device qui rapporte y figure, une seule fois."""
        names = [member.name for member in self.members]
        if self.hostname not in names:
            raise PydanticCustomError(
                "ha_local_not_in_members",
                "le device local n'est pas listé dans members",
                {"hostname": self.hostname},
            )
        duplicates = sorted({name for name in names if names.count(name) > 1})
        if duplicates:
            raise PydanticCustomError(
                "ha_member_duplicate",
                "un membre est listé plusieurs fois",
                {"hostname": self.hostname, "members": duplicates},
            )
        return self

    @model_validator(mode="after")
    def _standalone_lists_only_itself(self) -> HaStatus:
        """`standalone` : exactement un membre, le device lui-même, rôle `member`."""
        alone = len(self.members) == 1 and self.members[0].role == HaRole.MEMBER
        if self.mode == HaMode.STANDALONE and not alone:
            raise PydanticCustomError(
                "ha_standalone_not_alone",
                "un document standalone liste exactement son propre device, rôle member",
                {"hostname": self.hostname, "members": len(self.members)},
            )
        return self
