"""Endpoints, clé de lien et références typées vers les sections du snapshot."""

from typing import Annotated, Literal

from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, Hostname, IfName
from ld_contracts.snapshot.order import identity, natural_key, require_canonical


class Endpoint(ContractModel):
    """Un bout de lien : un port d'un nœud. Pour un stub, le nom annoncé et le port annoncé (MAC comprise)."""

    hostname: Hostname = Field(description="Hostname du nœud, clé de `nodes[]`.")
    interface: IfName = Field(description="Nom canonique du port ; pour un stub ou un port non résolu, tel qu'annoncé.")


def endpoint_key(endpoint: Endpoint) -> tuple:
    return endpoint.hostname, natural_key(endpoint.interface)


def require_endpoints_sorted(a: Endpoint, b: Endpoint) -> None:
    first, second = endpoint_key(a), endpoint_key(b)
    if first == second:
        raise PydanticCustomError("link_endpoints_equal", "les deux bouts du lien sont le même port", {})
    if first > second:
        raise PydanticCustomError("link_endpoints_unordered", "les bouts du lien ne sont pas triés", {})


class LinkKey(ContractModel):
    """La clé d'un lien : ses deux bouts, triés. Jamais d'identifiant synthétique."""

    a: Endpoint = Field(description="Premier bout, le plus petit dans l'ordre (hostname, nom naturel du port).")
    b: Endpoint = Field(description="Second bout, strictement après `a`.")

    @model_validator(mode="after")
    def _endpoints_sorted(self) -> LinkKey:
        require_endpoints_sorted(self.a, self.b)
        return self


def link_key(link: LinkKey | LinkRef) -> tuple:
    return endpoint_key(link.a), endpoint_key(link.b)


class NodeRef(ContractModel):
    """Référence à un nœud."""

    kind: Literal["node"] = Field(description="Discriminant.")
    hostname: Hostname = Field(description="Clé de `nodes[]`.")


class InterfaceRef(ContractModel):
    """Référence à une interface."""

    kind: Literal["interface"] = Field(description="Discriminant.")
    hostname: Hostname = Field(description="Hostname de l'interface.")
    name: IfName = Field(description="Nom canonique de l'interface ; clé `(hostname, name)` de `interfaces[]`.")


class LinkRef(ContractModel):
    """Référence à un lien, par sa clé."""

    kind: Literal["link"] = Field(description="Discriminant.")
    a: Endpoint = Field(description="Premier bout du lien référencé.")
    b: Endpoint = Field(description="Second bout, strictement après `a`.")

    @model_validator(mode="after")
    def _endpoints_sorted(self) -> LinkRef:
        require_endpoints_sorted(self.a, self.b)
        return self


class AggregateRef(ContractModel):
    """Référence à un agrégat."""

    kind: Literal["aggregate"] = Field(description="Discriminant.")
    hostname: Hostname = Field(description="Hostname de l'agrégat.")
    name: IfName = Field(description="Nom canonique de l'agrégat ; clé `(hostname, name)` de `aggregates[]`.")


class ClusterRef(ContractModel):
    """Référence à un cluster HA, par ses membres."""

    kind: Literal["cluster"] = Field(description="Discriminant.")
    members: tuple[Hostname, ...] = Field(
        min_length=1, description="Hostnames des membres, triés, sans doublon ; clé de `ha_clusters[]`."
    )

    @model_validator(mode="after")
    def _members_canonical(self) -> ClusterRef:
        require_canonical(self.members, key=identity, section="members")
        return self


Ref = Annotated[NodeRef | InterfaceRef | LinkRef | AggregateRef | ClusterRef, Field(discriminator="kind")]


def ref_key(ref: NodeRef | InterfaceRef | LinkRef | AggregateRef | ClusterRef) -> tuple:
    """Clé de tri d'une référence : la sorte, puis l'identité (noms d'interfaces en ordre naturel)."""
    match ref:
        case NodeRef():
            return ("node", ref.hostname)
        case InterfaceRef():
            return ("interface", ref.hostname, natural_key(ref.name))
        case LinkRef():
            return ("link", *link_key(ref))
        case AggregateRef():
            return ("aggregate", ref.hostname, natural_key(ref.name))
        case ClusterRef():
            return ("cluster", ref.members)
