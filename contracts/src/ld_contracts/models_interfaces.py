"""Topics interfaces et aggregates."""

import ipaddress
from typing import Annotated, Literal

from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import (
    Bool,
    ContractModel,
    Extras,
    Hostname,
    IfName,
    Int,
    IpAddressStr,
    MacAddress,
    NonEmptyStr,
)
from ld_contracts.enums import (
    AdminStatus,
    AggregationProtocol,
    Duplex,
    InterfaceType,
    IpRole,
    LacpMode,
    LinkStatus,
    MemberStatus,
    OperStatus,
    SwitchportMode,
)


class IpAddress(ContractModel):
    """Une adresse IP portée par une interface."""

    address: IpAddressStr = Field(description="Adresse sans masque, en texte : IPv4 pointée ou IPv6.")
    prefix: Int = Field(description="Longueur de préfixe : 0 à 32 en IPv4, 0 à 128 en IPv6.")
    family: Literal[4, 6] = Field(description="Famille, cohérente avec `address`.")
    role: IpRole = Field(description="`primary`, `secondary`, ou `virtual` pour une VIP VRRP / HSRP.")

    @model_validator(mode="after")
    def _family_and_prefix_match_address(self) -> IpAddress:
        version = ipaddress.ip_address(self.address).version
        if version != self.family:
            raise PydanticCustomError(
                "ip_family_mismatch",
                "family ne correspond pas à la version de l'adresse",
                {"family": self.family, "version": version},
            )
        if not 0 <= self.prefix <= (32 if version == 4 else 128):
            raise PydanticCustomError(
                "ip_prefix_out_of_range",
                "prefix hors plage pour la version de l'adresse",
                {"prefix": self.prefix, "version": version},
            )
        return self


class Counters(ContractModel):
    """Compteurs d'erreurs au moment de la collecte, cumulés depuis le dernier reset ; null par champ si non lu."""

    in_errors: Int | None = Field(default=None, description="Erreurs en entrée.")
    out_errors: Int | None = Field(default=None, description="Erreurs en sortie.")
    crc: Int | None = Field(
        default=None,
        description="Erreurs CRC en entrée ; leur hausse entre deux runs signale un câble ou un transceiver dégradé.",
    )
    in_discards: Int | None = Field(default=None, description="Rejets en entrée.")
    out_discards: Int | None = Field(default=None, description="Rejets en sortie.")


class VlanRange(ContractModel):
    """Un intervalle de VLAN autorisés sur un trunk, bornes incluses ; VLAN unique = `first == last`."""

    first: Int = Field(ge=1, le=4094, description="Premier VLAN de l'intervalle, inclus.")
    last: Int = Field(
        ge=1, le=4094, description="Dernier VLAN de l'intervalle, inclus ; égal à `first` pour un VLAN unique."
    )

    @model_validator(mode="after")
    def _first_not_after_last(self) -> VlanRange:
        if self.first > self.last:
            raise PydanticCustomError(
                "vlan_range_inverted", "first est supérieur à last", {"first": self.first, "last": self.last}
            )
        return self


def check_vlan_fields_for_mode(
    mode: SwitchportMode | None,
    access_vlan: int | None,
    native_vlan: int | None,
    allowed_vlans: tuple | None,
    context: dict,
) -> None:
    """`access_vlan` n'existe qu'en mode `access`, `native_vlan` / `allowed_vlans` qu'en mode `trunk`.

    Un sens seulement : un mode connu n'oblige pas à connaître ses VLAN (null reste permis). Un mode
    `null` (non lu) ne porte aucun VLAN : qui ne sait pas le mode ne sait pas à quoi le VLAN s'applique.
    Partagée par le RunBundle et le Snapshot : la sortie n'est jamais plus permissive que l'entrée.
    """
    ctx = {**context, "switchport_mode": None if mode is None else str(mode)}
    if access_vlan is not None and mode != SwitchportMode.ACCESS:
        raise PydanticCustomError(
            "access_vlan_outside_access_mode",
            "access_vlan renseigné alors que switchport_mode n'est pas access",
            {**ctx, "fields": ["access_vlan"]},
        )
    offending = [
        name for name, value in (("native_vlan", native_vlan), ("allowed_vlans", allowed_vlans)) if value is not None
    ]
    if offending and mode != SwitchportMode.TRUNK:
        raise PydanticCustomError(
            "trunk_vlans_outside_trunk_mode",
            "native_vlan ou allowed_vlans renseigné alors que switchport_mode n'est pas trunk",
            {**ctx, "fields": offending},
        )


class Interface(ContractModel):
    """Une interface du topic `interfaces`, physique ou logique.

    Sources typiques : `show interfaces` (IOS / IOS-XE), `show interface` (NX-OS), `get system interface`
    et `get system interface physical` (FortiOS), `show interface <nom>` (Gaia). Un document par interface.
    Pour dessiner un L1, B1 n'a besoin que de : `name`, `type`, `description`, `admin_status`, `oper_status`,
    `oper_reason`, `speed_mbps`, `duplex`, `mac_address`, `parent_interface`, `virtual_context`.
    """

    hostname: Hostname = Field(description="Hostname du device, identique octet pour octet à `devices[].hostname`.")
    name: IfName = Field(
        description=(
            "Nom canonique de l'interface, identique dans tous les topics (`Ethernet1/1`, `port-channel10`, `x1`, "
            "`Vlan100`). Forme longue chez Cisco."
        )
    )
    description: str | None = Field(
        default=None,
        description=(
            "Description configurée, **brute**, jamais parsée par la collecte. Format attendu "
            "`criticité|device_voisin|port_voisin|options` ; null si vide. Le parseur vit dans B1."
        ),
    )
    type: InterfaceType = Field(description="Nature de l'interface. `subinterface` a un parent ; `svi` n'en a pas.")
    admin_status: AdminStatus = Field(description="État administratif configuré.")
    oper_status: OperStatus = Field(
        description=(
            "État opérationnel selon RFC 2863. `down` par défaut ; `not_present` seulement si un transceiver ou un "
            "module manque explicitement ; `unknown` si non lu ; `lower_layer_down` optionnel pour une sous-interface "
            "dont le parent est down (B1 sait le dériver)."
        )
    )
    oper_reason: str | None = Field(
        default=None,
        description=(
            "Raison textuelle **brute** donnée par le vendeur (`notconnect`, `err-disabled`, `SFP not inserted`, "
            "`suspended by LACP`, `No operational members`…) ; null si `up` ou si le vendeur n'en donne pas."
        ),
    )
    speed_mbps: Int | None = Field(
        default=None, description="Vitesse **opérationnelle** en Mbit/s, entier ; null si down ou inconnue."
    )
    configured_speed_mbps: Int | None = Field(
        default=None, description="Vitesse configurée en Mbit/s ; null = auto ou non lue."
    )
    auto_negotiate: Bool | None = Field(default=None, description="Autonégociation active ; null si inconnu.")
    duplex: Duplex | None = Field(default=None, description="Duplex opérationnel ; null si non applicable ou non lu.")
    mtu: Int | None = Field(default=None, description="MTU en octets ; null si non lu.")
    mac_address: MacAddress | None = Field(
        default=None, description="MAC de l'interface, normalisée `aa:bb:cc:dd:ee:ff` minuscules ; null si absente."
    )
    media: str | None = Field(
        default=None, description="Média ou transceiver (`10Gbase-SR`, `1000base-T`), chaîne brute ; null si inconnu."
    )
    last_change_age_seconds: Annotated[Int, Field(ge=0)] | Literal["never"] | None = Field(
        default=None,
        description=(
            "Âge du dernier changement d'état opérationnel au moment de la collecte, en secondes (IF-MIB "
            "`ifLastChange`) ; `\"never\"` si l'état n'a pas changé depuis le dernier démarrage (RFC 2863 : "
            "`ifLastChange = 0`, état pris avant la dernière réinitialisation de l'agent ; NX-OS « Last link "
            "flapped: never ») ; null si non lu. Trois faits distincts : B1 lit "
            '`"never"` comme un âge ≥ `system.uptime_seconds`. Jamais de sentinelle numérique. '
            "Sert à détecter un flap entre deux runs."
        ),
    )
    parent_interface: IfName | None = Field(
        default=None,
        description=(
            "Pour une sous-interface : nom canonique du parent ; null si sans objet ou non lu. Jamais utilisé pour "
            "l'appartenance "
            "à un agrégat (voir `aggregates`)."
        ),
    )
    vlan_id: Int | None = Field(
        default=None,
        ge=1,
        le=4094,
        description="VLAN d'une sous-interface ou d'une SVI ; null si sans objet ou non lu.",
    )
    members: tuple[IfName, ...] = Field(
        description=(
            "Pour un agrégat sans topic `aggregates` : noms canoniques des membres configurés, sans état. "
            "Liste vide sinon. `aggregates` fait foi quand il existe."
        )
    )
    ip_addresses: tuple[IpAddress, ...] = Field(description="Adresses portées ; liste vide si aucune.")
    vrf: NonEmptyStr | None = Field(
        default=None,
        description=(
            'Instance de routage de l\'interface, trois cas. `"default"` : la **table globale**, nom réservé du '
            "contrat, en minuscules exactes ; c'est le nom natif sur NX-OS, EOS et IOS-XR, et la librairie de "
            "collecte y traduit les autres plateformes (tableau sous « `null` et valeurs réservées »). Tout autre "
            "texte : le nom de la VRF tel que configuré, casse conservée (`PROD`, `management`, `Mgmt-vrf`, `10`). "
            "null : non lu, ou sans objet (un port commuté `access` / `trunk` n'est dans aucune table de routage) ; "
            "**null ne veut jamais dire table globale**. Chaîne vide refusée. Une valeur égale à `default` à la "
            "casse ou aux blancs près est acceptée (sur NX-OS, `Default` est une VRF utilisateur légitime), jamais "
            "normalisée, et signalée (`vrf_default_case`). B1 s'en sert comme clé `(hostname, vrf)` : la table "
            "globale est une instance comme les autres, sans cas particulier."
        ),
    )
    virtual_context: str | None = Field(
        default=None,
        description="Partition virtuelle du châssis qui possède l'interface (VDOM, Virtual System VSX, VDC, context) "
        "; null si le châssis n'est pas partitionné, ou si non lu : null ne distingue pas les deux (jeton réservé à "
        "décider avec la modélisation VSX).",
    )
    switchport_mode: SwitchportMode | None = Field(
        default=None,
        description=(
            "Mode L2 **configuré, résolu** : `access` ou `trunk` (port commuté), `routed` (`no switchport`, port "
            "L3), `none` (lu, mais aucun des trois ne s'applique : `dot1q-tunnel`, `fex-fabric`, `private-vlan`, "
            "interface non Ethernet ; le mode brut va dans `extras`) ; null si non lu. Port en négociation DTP : "
            "le résultat négocié quand le lien est up, le mode administratif quand il est down. Jamais « down » : "
            "un port down garde son mode et ses VLAN (IOS affiche « Operational Mode: down », c'est "
            "« Administrative Mode » qui compte)."
        ),
    )
    access_vlan: Int | None = Field(
        default=None,
        ge=1,
        le=4094,
        description=(
            "VLAN d'un port `access` ; null sinon. Un trunk ne le porte pas, même si l'équipement affiche une "
            "valeur configurée inactive (IOS / NX-OS « Access Mode VLAN ») : renseigné hors mode `access` "
            "(`null` compris), le document est refusé. B1 y lit le VLAN non tagué du port (en trunk : "
            "`native_vlan`), comparé à celui de l'autre bout du câble."
        ),
    )
    native_vlan: Int | None = Field(
        default=None,
        ge=1,
        le=4094,
        description=(
            "VLAN natif d'un trunk ; null sinon (renseigné hors mode `trunk`, `null` compris, le document est refusé)."
        ),
    )
    allowed_vlans: tuple[VlanRange, ...] | None = Field(
        default=None,
        description=(
            "VLAN autorisés sur un trunk : liste d'intervalles `{first, last}` d'entiers, VLAN unique = "
            '`first == last`, `all` = `[{"first": 1, "last": 4094}]`, `[]` = aucun (`switchport trunk allowed '
            "vlan none`) ; null "
            "sinon (renseigné hors mode `trunk`, `null` compris, le document est refusé). Ni ordre ni fusion des "
            "adjacents imposés au producteur (B1 canonise, R6) ; doublons et chevauchements refusés."
        ),
    )
    counters: Counters | None = Field(default=None, description="Compteurs d'erreurs ; null si non collectés.")
    extras: Extras = Field(description="Détail brut vendeur (`bia`, `bandwidth`, `encapsulation`…) ; jamais lu par B1.")

    @model_validator(mode="after")
    def _vlan_fields_match_switchport_mode(self) -> Interface:
        check_vlan_fields_for_mode(
            self.switchport_mode,
            self.access_vlan,
            self.native_vlan,
            self.allowed_vlans,
            {"hostname": self.hostname, "name": self.name},
        )
        return self

    @model_validator(mode="after")
    def _vlan_ranges_disjoint(self) -> Interface:
        """Deux intervalles ne se recouvrent jamais (doublon compris) ; l'ordre et l'adjacence restent libres.

        Aucun équipement n'imprime `10-20,15-25` : cette forme vient d'un parseur cassé, refusée à la porte
        comme un membre HA en double.
        """
        ranges = sorted(self.allowed_vlans or (), key=lambda r: (r.first, r.last))
        for previous, current in zip(ranges, ranges[1:], strict=False):
            if current.first <= previous.last:
                raise PydanticCustomError(
                    "vlan_ranges_overlap",
                    "deux intervalles d'allowed_vlans se recouvrent",
                    {"hostname": self.hostname, "name": self.name, "first": current.first, "last": previous.last},
                )
        return self


class AggregateMember(ContractModel):
    """Un membre d'agrégat et son état effectif."""

    name: IfName = Field(description="Nom canonique du membre, identique à `interfaces[].name`.")
    status: MemberStatus = Field(
        description=(
            "État effectif. `bundled` = trafic agrégé (P Cisco, collecting + distributing LACP) ; `suspended` (s) ; "
            "`standby` (H) ; `individual` (I) ; `down` (D, module retiré) ; `not_in_use` (M / w : min-links non "
            "atteint)."
        )
    )


class Aggregate(ContractModel):
    """Un agrégat (Port-channel, bond, aggregate) et l'état de chacun de ses membres.

    Sources typiques : `show port-channel summary` + `show vpc` (NX-OS), `show etherchannel summary` (IOS),
    `diagnose netlink aggregate name <nom>` (FortiOS), `show bonding group <id>` (Gaia). Un document par agrégat.
    """

    hostname: Hostname = Field(description="Hostname du device, identique octet pour octet à `devices[].hostname`.")
    name: IfName = Field(description="Nom canonique de l'agrégat, identique à `interfaces[].name`.")
    oper_status: LinkStatus = Field(description="État opérationnel de l'agrégat.")
    protocol: AggregationProtocol = Field(
        description="Protocole d'agrégation. Statique d'un côté et LACP de l'autre : contrôle."
    )
    lacp_mode: LacpMode | None = Field(default=None, description="Mode LACP ; null si non LACP ou non lu.")
    min_links: Int | None = Field(
        default=None, description="Nombre minimal de membres actifs configuré ; null si non configuré ou non lu."
    )
    members: tuple[AggregateMember, ...] = Field(description="Membres configurés avec leur état effectif.")
    mlag_id: Int | None = Field(
        default=None,
        description="Identifiant vPC / MLAG / MC-LAG ; null si l'agrégat n'en fait pas partie, ou si non lu.",
    )
    mlag_peer_link: Bool = Field(description="true si l'agrégat est le peer-link du MLAG.")
    extras: Extras = Field(description="Détail brut vendeur (drapeaux, cohérence vPC…) ; jamais lu par B1.")
