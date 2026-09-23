"""Interfaces du snapshot : le sous-ensemble utile aux vues L1 / L2 / L3, plus ce que B1 y ajoute."""

from typing import Annotated, Literal

from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, Hostname, IfName, Int, MacAddress, NonEmptyStr
from ld_contracts.enums import AdminStatus, Duplex, InterfaceType, MemberStatus, OperStatus, SwitchportMode
from ld_contracts.models_interfaces import IpAddress, VlanRange, check_vlan_fields_for_mode
from ld_contracts.snapshot.enums import InterfaceRole
from ld_contracts.snapshot.order import identity, require_canonical


class ParsedDescription(ContractModel):
    """La description `criticité|voisin|port|options` lue par B1 (R2) ; absente si non parsable."""

    criticality: str | None = Field(description="Champ 1, tel quel (vocabulaire non figé) ; null si vide.")
    neighbor: NonEmptyStr = Field(description="Champ 2 : nom du voisin documenté, brut.")
    port: str | None = Field(description="Champ 3 : port du voisin, brut ; null si absent.")
    options: str | None = Field(description="Champ 4 : options, brutes ; null si absentes.")


class AggregateMembership(ContractModel):
    """Appartenance d'une interface à un agrégat."""

    name: IfName = Field(description="Nom canonique de l'agrégat sur le même device.")
    member_status: MemberStatus | None = Field(
        description="État effectif selon `aggregates[]` ; null si l'appartenance vient de `interfaces[].members`."
    )


def ip_key(ip: IpAddress) -> tuple:
    return ip.family, ip.address, ip.prefix, ip.role


class SnapshotInterface(ContractModel):
    """Une interface, clé `(hostname, name)`. Les champs recopiés gardent le sens du RunBundle ; `null` y veut
    dire « pas de valeur ». Aucun `extras`, aucun compteur : le snapshot dessine, il n'audite pas."""

    hostname: Hostname = Field(description="Hostname du nœud, clé de `nodes[]`.")
    name: IfName = Field(description="Nom canonique.")
    description: str | None = Field(description="Description brute, conservée telle quelle ; null si vide.")
    description_parsed: ParsedDescription | None = Field(description="Description lue par R2 ; null si non parsable.")
    type: InterfaceType = Field(description="Nature de l'interface.")
    admin_status: AdminStatus = Field(description="État administratif.")
    oper_status: OperStatus = Field(description="État opérationnel (RFC 2863).")
    oper_reason: str | None = Field(description="Raison vendeur brute ; null si `up` ou non donnée.")
    speed_mbps: Int | None = Field(description="Vitesse opérationnelle en Mbit/s ; null si down ou inconnue.")
    duplex: Duplex | None = Field(description="Duplex opérationnel ; null si sans objet ou non lu.")
    mac_address: MacAddress | None = Field(description="MAC normalisée ; null si absente.")
    media: str | None = Field(description="Média ou transceiver, brut ; null si inconnu.")
    parent_interface: IfName | None = Field(description="Parent d'une sous-interface ; null sinon.")
    virtual_context: str | None = Field(description="Partition virtuelle propriétaire ; null si aucune ou non lue.")
    last_change_age_seconds: Annotated[Int, Field(ge=0)] | Literal["never"] | None = Field(
        description='Âge du dernier changement d\'état ; `"never"` = aucun depuis le démarrage ; null si non lu.'
    )
    vlan_id: Int | None = Field(ge=1, le=4094, description="VLAN d'une sous-interface ou d'une SVI ; null sinon.")
    switchport_mode: SwitchportMode | None = Field(description="Mode L2 configuré résolu ; null si non lu.")
    access_vlan: Int | None = Field(ge=1, le=4094, description="VLAN d'un port `access` ; null sinon.")
    native_vlan: Int | None = Field(ge=1, le=4094, description="VLAN natif d'un trunk ; null sinon.")
    allowed_vlans: tuple[VlanRange, ...] | None = Field(
        description=(
            "VLAN autorisés sur un trunk, forme canonique (R6) : intervalles triés par `first`, disjoints, adjacents "
            "fusionnés ; `[]` = aucun ; null si sans objet ou non lu."
        )
    )
    ip_addresses: tuple[IpAddress, ...] = Field(description="Adresses portées, triées par (famille, adresse, préfixe).")
    vrf: NonEmptyStr | None = Field(
        description='`"default"` = table globale ; autre = VRF nommée ; null = non lu ou sans objet.'
    )
    aggregate: AggregateMembership | None = Field(description="Agrégat dont l'interface est membre ; null sinon.")
    roles: tuple[InterfaceRole, ...] = Field(description="Rôles déduits par B1, triés, sans doublon ; vide sinon.")

    @model_validator(mode="after")
    def _coherent_and_canonical(self) -> SnapshotInterface:
        check_vlan_fields_for_mode(
            self.switchport_mode,
            self.access_vlan,
            self.native_vlan,
            self.allowed_vlans,
            {"hostname": self.hostname, "name": self.name},
        )
        require_canonical(self.ip_addresses, key=ip_key, section="ip_addresses")
        require_canonical(self.roles, key=identity, section="roles")
        ranges = self.allowed_vlans or ()
        for index in range(1, len(ranges)):
            if ranges[index].first <= ranges[index - 1].last + 1:
                raise PydanticCustomError(
                    "vlan_ranges_not_canonical",
                    "allowed_vlans n'est pas trié, ou deux intervalles se touchent ou se recouvrent",
                    {"index": index},
                )
        return self
