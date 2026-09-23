"""Topics lldp_neighbors et cdp_neighbors : la source « observé ».

Un document dit une seule chose : « sur ce port local, je vois ce voisin, sur ce port ». Ce qu'un voisin
annonce de lui-même (serial, chassis-id, adresse de management, plateforme, version, VLAN natif, duplex)
n'est pas demandé : pour un voisin collecté, B1 le lit dans les topics de ce voisin (2026-09-18).
"""

from pydantic import Field

from ld_contracts.common import CapabilityToken, ContractModel, Extras, Hostname, IfName, RemoteIdentifier


class LldpNeighbor(ContractModel):
    """Un voisin vu par LLDP sur un port local (`show lldp neighbors detail`).

    Un document par (port local, voisin vu). Les identifiants **distants** restent bruts : B1 les
    normalise. Les identifiants **locaux** sont canoniques.
    """

    hostname: Hostname = Field(
        description="Hostname du device local, identique octet pour octet à `devices[].hostname`."
    )
    local_interface: IfName = Field(description="Port local, nom canonique identique à `interfaces[].name`.")
    neighbor: RemoteIdentifier = Field(
        description=(
            "System-name annoncé par le voisin, **domaine DNS retiré**, sans autre normalisation. Peut être "
            "inconnu de `devices` (stub) ; peut être une MAC (normalisée) ou une IP si le voisin n'annonce pas "
            "de nom."
        )
    )
    neighbor_interface: RemoteIdentifier = Field(
        description=(
            "Port-id annoncé, **brut** : forme courte sur IOS (`Gi1/0/1`), longue sur NX-OS. Si le voisin annonce "
            "une MAC, elle est normalisée (`aa:bb:cc:dd:ee:ff`) : B1 la reconnaît à sa forme et la joint à "
            "`interfaces[].mac_address`. Seules trois notations sont reconnues comme MAC (`aa:bb:…`, `aa-bb-…`, "
            "`aabb.ccdd.eeff`) et refusées si non normalisées ; douze chiffres hexadécimaux sans séparateur "
            "restent un nom."
        )
    )
    neighbor_capabilities: tuple[CapabilityToken, ...] = Field(
        description="Capacités annoncées, jetons en minuscules `[a-z0-9_]` (`bridge`, `router`, `station`, "
        "`wlan_access_point`, `telephone`…). Seule information sur la nature d'un voisin non collecté."
    )
    extras: Extras = Field(description="Détail brut vendeur ; jamais lu par B1.")


class CdpNeighbor(ContractModel):
    """Un voisin vu par CDP (Cisco, `show cdp neighbors detail`). Un document par (port local, voisin)."""

    hostname: Hostname = Field(
        description="Hostname du device local, identique octet pour octet à `devices[].hostname`."
    )
    local_interface: IfName = Field(description="Port local, nom canonique identique à `interfaces[].name`.")
    neighbor: RemoteIdentifier = Field(
        description=(
            "Device-id annoncé, **domaine DNS retiré** et serial retiré (`HOSTNAME(SERIAL)` sur Nexus donne "
            "`HOSTNAME`)."
        )
    )
    neighbor_interface: RemoteIdentifier = Field(description="Port distant annoncé, brut (forme longue chez Cisco).")
    neighbor_capabilities: tuple[CapabilityToken, ...] = Field(
        description="Capacités annoncées, jetons en minuscules `[a-z0-9_]` (`switch`, `router`, `igmp`…)."
    )
    extras: Extras = Field(description="Détail brut vendeur ; jamais lu par B1.")
