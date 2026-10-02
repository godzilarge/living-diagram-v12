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
    et `members` est vide (2026-10-02 ; avant, il se listait seul : une entrée sans information, rôle forcé, état
    tautologique, que l'exportateur devait inventer). B1 n'en fait aucun cluster.
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
            "pour octet et une seule fois, sinon le document est refusé. `standalone` : liste vide, obligatoirement "
            "(un fait, une écriture) ; `cluster_name` et `heartbeat_interfaces` restent admis, ce sont des faits de "
            "configuration."
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
    def _standalone_has_no_members(self) -> HaStatus:
        """`standalone` : aucun membre. `[self]` et `[]` seraient deux écritures du même fait, donnant deux snapshots
        (un cluster d'un membre, aucun cluster) ; une seule passe (2026-10-02)."""
        if self.mode == HaMode.STANDALONE and self.members:
            raise PydanticCustomError(
                "ha_standalone_with_members",
                "un document standalone ne liste aucun membre",
                {"hostname": self.hostname, "members": [member.name for member in self.members]},
            )
        return self

    @model_validator(mode="after")
    def _local_device_is_a_member(self) -> HaStatus:
        """Hors `standalone`, la vue locale n'existe que dans `members` : le device qui rapporte y figure, une fois."""
        if self.mode == HaMode.STANDALONE:
            return self
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
