"""Ce qui a changé sur une entité présente dans les deux runs : ses champs, et les faits lus dans les volatils."""

from collections.abc import Hashable, Iterable
from typing import Annotated

from pydantic import Field, JsonValue, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, Int
from ld_contracts.diff.enums import EventKind
from ld_contracts.diff.refs import DiffRef, diff_ref_key
from ld_contracts.snapshot.order import require_canonical

# Les deux champs volatils déclarés (`docs/07` décision 5) : exclus de `changed`, comptés dans
# `summary.volatile_changes`. B3 lit cette déclaration ; le contrat refuse un `FieldChange` qui la contredit.
VOLATILE_PATHS: dict[str, frozenset[str]] = {
    "nodes": frozenset({"uptime_seconds"}),
    "interfaces": frozenset({"last_change_age_seconds"}),
}

# Un chemin pointé d'identifiants (`oper_status`, `aggregate.member_status`, `topics.lldp`) : jamais un indice de
# liste, une liste se compare en bloc.
FIELD_PATH_PATTERN = r"^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$"
FieldPath = Annotated[str, StringConstraints(pattern=FIELD_PATH_PATTERN)]


class FieldChange(ContractModel):
    """Un champ dont la valeur diffère entre les deux runs."""

    path: FieldPath = Field(
        description="Chemin pointé dans l'entité (`oper_status`, `aggregate.member_status`), identifiants séparés "
        "par des points ; une liste se compare en bloc, son chemin est celui de la liste, jamais un indice."
    )
    before: JsonValue = Field(description="Valeur dans la run `before`.")
    after: JsonValue = Field(description="Valeur dans la run `after`, différente de `before`.")

    @model_validator(mode="after")
    def _differs(self) -> FieldChange:
        if self.before == self.after:
            raise PydanticCustomError(
                "field_change_equal", "un changement de champ sans différence", {"path": self.path}
            )
        return self


class EntityChange(ContractModel):
    """Une entité présente dans les deux runs, avec ses champs changés (jamais vide : sinon elle n'est pas listée)."""

    ref: DiffRef = Field(description="L'entité, par sa référence typée ; sa sorte est celle de la section.")
    fields: tuple[FieldChange, ...] = Field(
        min_length=1, description="Champs non volatils dont la valeur diffère, triés par `path`, sans doublon."
    )

    @model_validator(mode="after")
    def _canonical(self) -> EntityChange:
        require_canonical(self.fields, key=lambda f: f.path, section="fields")
        return self


def change_key(change: EntityChange) -> tuple:
    return diff_ref_key(change.ref)


def require_ref_kind(changes: Iterable[EntityChange], kind: str, section: str) -> None:
    """Refuse un `changed` dont la référence n'est pas de la sorte de sa section."""
    for index, change in enumerate(changes):
        if change.ref.kind != kind:
            raise PydanticCustomError(
                "change_ref_kind_mismatch",
                "la référence d'un changement n'est pas de la sorte de sa section",
                {"section": section, "index": index, "ref_kind": change.ref.kind, "expected": kind},
            )


def require_no_volatile(changes: Iterable[EntityChange], volatile: frozenset[str], section: str) -> None:
    """Refuse un `FieldChange` sur un champ volatil déclaré : il appartient à `summary.volatile_changes`."""
    for index, change in enumerate(changes):
        for field in change.fields:
            if field.path in volatile:
                raise PydanticCustomError(
                    "field_change_volatile",
                    "un champ volatil déclaré apparaît dans un changement",
                    {"section": section, "index": index, "path": field.path},
                )


def require_disjoint(parts: dict[str, Iterable[Hashable]], section: str) -> None:
    """Refuse une même identité dans deux parts d'une section (`added` et `changed`, `appeared` et `resolved`…) ;
    `parts` donne les identités de chaque part, déjà calculées."""
    seen: dict[Hashable, str] = {}
    for part, keys in parts.items():
        for index, key in enumerate(keys):
            if key in seen:
                raise PydanticCustomError(
                    "identity_in_several_parts",
                    "une même identité apparaît dans deux parts de la section",
                    {"section": section, "parts": [seen[key], part], "index": index},
                )
            seen[key] = part


class RebootedDetails(ContractModel):
    """Ce qu'un `rebooted` a lu : l'uptime d'avant (null si non lu), celui d'après, et la fenêtre."""

    uptime_before: Int | None = Field(description="`uptime_seconds` du nœud dans `before` ; null si non lu.")
    uptime_after: Int = Field(ge=0, description="`uptime_seconds` du nœud dans `after`, plus court que la fenêtre.")
    elapsed_seconds: Int = Field(gt=0, description="`elapsed_seconds` du diff, recopié : la fenêtre.")

    @model_validator(mode="after")
    def _shorter_than_window(self) -> RebootedDetails:
        if self.uptime_after >= self.elapsed_seconds:
            raise PydanticCustomError(
                "event_not_in_window",
                "l'uptime d'après n'est pas plus court que la fenêtre : ce n'est pas un redémarrage",
                {"event": "rebooted", "value": self.uptime_after, "elapsed_seconds": self.elapsed_seconds},
            )
        return self


class FlappedDetails(ContractModel):
    """Ce qu'un `flapped` a lu : l'âge du dernier changement dans `after`, et la fenêtre."""

    age_after: Int = Field(
        ge=0, description="`last_change_age_seconds` du port dans `after`, plus court que la fenêtre."
    )
    elapsed_seconds: Int = Field(gt=0, description="`elapsed_seconds` du diff, recopié : la fenêtre.")

    @model_validator(mode="after")
    def _shorter_than_window(self) -> FlappedDetails:
        if self.age_after >= self.elapsed_seconds:
            raise PydanticCustomError(
                "event_not_in_window",
                "l'âge du dernier changement n'est pas plus court que la fenêtre : ce n'est pas un flap",
                {"event": "flapped", "value": self.age_after, "elapsed_seconds": self.elapsed_seconds},
            )
        return self


EVENT_REF_KIND = {EventKind.REBOOTED: "node", EventKind.FLAPPED: "interface"}
EVENT_DETAILS = {EventKind.REBOOTED: RebootedDetails, EventKind.FLAPPED: FlappedDetails}


class Event(ContractModel):
    """Un fait lu dans les champs volatils, qu'aucun `changed` ne porte."""

    kind: EventKind = Field(
        description="`rebooted` : l'uptime du nœud dans `after` est plus court que le temps écoulé entre les runs ; "
        "`flapped` : le port a changé d'état dans la fenêtre alors que son `oper_status` est le même aux deux runs, "
        "sur un nœud qui n'a pas redémarré (le redémarrage explique ses ports)."
    )
    ref: DiffRef = Field(description="Le nœud (`rebooted`) ou l'interface (`flapped`).")
    details: RebootedDetails | FlappedDetails = Field(
        description="Ce que l'événement a lu, typé par sa sorte : `RebootedDetails` ou `FlappedDetails`."
    )

    @model_validator(mode="after")
    def _ref_and_details_match_kind(self) -> Event:
        expected = EVENT_REF_KIND[self.kind]
        if self.ref.kind != expected:
            raise PydanticCustomError(
                "event_ref_kind_mismatch",
                "la référence d'un événement n'est pas de la sorte attendue",
                {"event": str(self.kind), "ref_kind": self.ref.kind, "expected": expected},
            )
        if not isinstance(self.details, EVENT_DETAILS[self.kind]):
            raise PydanticCustomError(
                "event_details_mismatch",
                "les détails d'un événement ne sont pas ceux de sa sorte",
                {"event": str(self.kind), "expected": EVENT_DETAILS[self.kind].__name__},
            )
        return self


def event_key(event: Event) -> tuple:
    return (str(event.kind), diff_ref_key(event.ref))
