"""Références du diff : celles du Snapshot, plus le domaine MLAG, qu'aucun contrôle ne référence."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from ld_contracts.common import ContractModel, Int
from ld_contracts.snapshot.refs import AggregateRef, ClusterRef, InterfaceRef, LinkRef, NodeRef, ref_key
from ld_contracts.snapshot.structures import MlagMember, mlag_member_key, require_mlag_members


class MlagDomainRef(ContractModel):
    """Référence à un domaine MLAG, par son identifiant et ses deux agrégats."""

    kind: Literal["mlag_domain"] = Field(description="Discriminant.")
    mlag_id: Int = Field(description="`mlag_id` du domaine.")
    members: tuple[MlagMember, ...] = Field(
        min_length=2,
        max_length=2,
        description="Les deux agrégats, de deux devices distincts, triés par (hostname, nom naturel) ; clé de "
        "`mlag_domains[]` avec `mlag_id`.",
    )

    @model_validator(mode="after")
    def _members_canonical(self) -> MlagDomainRef:
        require_mlag_members(self.members)  # triés, deux devices distincts : la règle de `MlagDomain`
        return self


AnyRef = NodeRef | InterfaceRef | LinkRef | AggregateRef | ClusterRef | MlagDomainRef
DiffRef = Annotated[AnyRef, Field(discriminator="kind")]


def diff_ref_key(ref: AnyRef) -> tuple:
    """Clé de tri d'une référence : la sorte, puis l'identité ; celle du Snapshot, étendue au domaine MLAG."""
    if isinstance(ref, MlagDomainRef):
        return ("mlag_domain", ref.mlag_id, tuple(mlag_member_key(m) for m in ref.members))
    return ref_key(ref)
