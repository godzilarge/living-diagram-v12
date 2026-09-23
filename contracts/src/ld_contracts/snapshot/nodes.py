"""Nœuds du snapshot : device (en périmètre), external (autre infrastructure), stub (inconnu de `devices`)."""

from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import CapabilityToken, ContractModel, Hostname, IfName, Int
from ld_contracts.enums import ChassisRole, ChassisState, DeviceType
from ld_contracts.snapshot.enums import CollectionStatus, EvidenceSource, NodeKind
from ld_contracts.snapshot.order import identity, natural_key, require_canonical

# Ce que seul un document `system` fournit : un device d'une autre infrastructure n'en a pas dans le bundle.
SYSTEM_FIELDS = ("reported_hostname", "uptime_seconds", "stack")
DEVICE_ONLY_FIELDS = (
    "type",
    "vendor",
    "model",
    "site",
    "os_name",
    "os_version",
    "serial_number",
    "reported_hostname",
    "uptime_seconds",
    "stack",
)


class StackMember(ContractModel):
    """Un châssis membre d'un stack, recopié de `system[].chassis_members` ; toutes les clés écrites."""

    slot: Int = Field(description="Numéro de membre dans le stack.")
    serial: str | None = Field(description="Serial du membre ; null si non lu.")
    model: str | None = Field(description="Référence matérielle du membre ; null si non lue.")
    role: ChassisRole = Field(description="Rôle du membre dans le stack.")
    state: ChassisState = Field(description="État du membre.")
    priority: Int | None = Field(description="Priorité d'élection ; null si non lue.")


class Stack(ContractModel):
    """Le stack d'un nœud : source du badge ×N."""

    member_count: Int = Field(ge=1, description="Nombre de membres, égal à la taille de `members`.")
    members: tuple[StackMember, ...] = Field(min_length=1, description="Membres triés par `slot`.")

    @model_validator(mode="after")
    def _members_canonical_and_counted(self) -> Stack:
        require_canonical(self.members, key=lambda m: m.slot, section="members")
        if self.member_count != len(self.members):
            raise PydanticCustomError(
                "stack_count_mismatch",
                "member_count ne correspond pas au nombre de membres",
                {"declared": self.member_count, "actual": len(self.members)},
            )
        return self


class SeenBy(ContractModel):
    """Un témoignage sur un nœud non collecté : qui l'a vu, sur quel port, par quelle source."""

    hostname: Hostname = Field(description="Device qui a vu le nœud.")
    interface: IfName = Field(description="Port local du témoin.")
    source: EvidenceSource = Field(description="Source du témoignage.")


def seen_by_key(seen: SeenBy) -> tuple:
    return seen.hostname, natural_key(seen.interface), seen.source


class NodeEvidence(ContractModel):
    """Ce que les voisins disent d'un nœud `external` ou `stub` : la seule information disponible sur lui."""

    seen_by: tuple[SeenBy, ...] = Field(description="Témoignages, triés par (hostname, port, source).")
    capabilities: tuple[CapabilityToken, ...] = Field(
        description="Union des capacités annoncées (`bridge`, `router`, `station`…), triée, sans doublon."
    )

    @model_validator(mode="after")
    def _canonical(self) -> NodeEvidence:
        require_canonical(self.seen_by, key=seen_by_key, section="seen_by")
        require_canonical(self.capabilities, key=identity, section="capabilities")
        return self


class Node(ContractModel):
    """Un nœud du graphe. `device` : en périmètre, décrit par `devices` et `system` ; `external` : présent dans
    `devices` mais d'une autre infrastructure, matérialisé parce qu'un voisin le cite ; `stub` : cité par une
    évidence, inconnu de `devices`. Les stubs restent dans le snapshot, la vue décide de les montrer."""

    kind: NodeKind = Field(
        description=(
            "Sorte de nœud ; conditionne les champs admis. `device` : `collection` renseigné, `evidence` null, "
            "`type` renseigné. `external` : `evidence` renseigné, `collection` null, `type` renseigné, rien de "
            "`system` (`reported_hostname`, `uptime_seconds`, `stack` null, `virtual_contexts` vide). `stub` : "
            "`evidence` renseigné, tout le reste null ou vide, `hostname` en `casefold`."
        )
    )
    hostname: Hostname = Field(
        description=(
            "Clé, unique toutes sortes confondues (comparée sans la casse). Pour un stub : le nom annoncé, après "
            "`casefold`."
        )
    )
    type: DeviceType | None = Field(description="De `devices` ; null pour un stub, requis sinon.")
    vendor: str | None = Field(description="De `devices` ; null pour un stub ou si inconnu.")
    model: str | None = Field(description="De `devices` ; null pour un stub ou si inconnu.")
    site: str | None = Field(description="De `devices` ; null pour un stub ou si inconnu.")
    os_name: str | None = Field(description="De `devices`, chaîne d'affichage ; null pour un stub ou si inconnu.")
    os_version: str | None = Field(description="De `devices` ; null pour un stub ou si inconnue.")
    serial_number: str | None = Field(description="De `devices` ; null pour un stub ou si inconnu.")
    reported_hostname: str | None = Field(description="De `system[]` ; null si non collecté.")
    uptime_seconds: Int | None = Field(description="De `system[]` ; null si non collecté.")
    virtual_contexts: tuple[str, ...] = Field(description="De `system[]`, triés, sans doublon ; vide sinon.")
    stack: Stack | None = Field(description="Depuis `system[].chassis_members` ; null si standalone ou non collecté.")
    collection: CollectionStatus | None = Field(
        description="Statut de collecte, pour un `device` seulement (`not_collected` = en périmètre sans task)."
    )
    evidence: NodeEvidence | None = Field(description="Témoignages, pour `external` et `stub` seulement.")

    @model_validator(mode="after")
    def _fields_for_kind(self) -> Node:
        require_canonical(self.virtual_contexts, key=identity, section="virtual_contexts")
        offending = self._offending_fields()
        if offending:
            raise PydanticCustomError(
                "node_fields_for_kind",
                "champs incompatibles avec la sorte du nœud",
                {"kind": str(self.kind), "fields": offending},
            )
        return self

    def _offending_fields(self) -> list[str]:
        is_device = self.kind == NodeKind.DEVICE
        wrong = []
        if (self.collection is None) == is_device:
            wrong.append("collection")
        if (self.evidence is None) != is_device:
            wrong.append("evidence")
        if self.kind == NodeKind.STUB:
            wrong += [name for name in DEVICE_ONLY_FIELDS if getattr(self, name) is not None]
            if self.hostname != self.hostname.casefold():
                wrong.append("hostname")
        elif self.type is None:
            wrong.append("type")
        if self.kind == NodeKind.EXTERNAL:
            wrong += [name for name in SYSTEM_FIELDS if getattr(self, name) is not None]
        if self.kind != NodeKind.DEVICE and self.virtual_contexts:
            wrong.append("virtual_contexts")
        return wrong
