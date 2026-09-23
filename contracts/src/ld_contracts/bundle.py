"""RunBundle v1 : le document unique produit par B0 et consommé par B1.

Les validateurs de ce module garantissent la cohérence *structurelle* (unicité,
appartenance des documents à la table devices et à l'infrastructure du bundle). La
cohérence *référentielle* (membre d'agrégat inconnu, parent absent…) est signalée en
constats par :mod:`ld_contracts.checks`, jamais en erreur : c'est de la donnée.

Les messages d'erreur ne contiennent jamais de valeur : les valeurs vont dans le contexte
de l'erreur (``ctx``), que le rapport n'affiche que sur demande.
"""

from collections import Counter
from collections.abc import Iterable

from pydantic import Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, Int, NonEmptyStr, SemVer, UtcDatetime
from ld_contracts.models_devices import Device, SystemInfo
from ld_contracts.models_ha import HaStatus
from ld_contracts.models_interfaces import Aggregate, Interface
from ld_contracts.models_neighbors import CdpNeighbor, LldpNeighbor
from ld_contracts.models_run import DeviceTask, RunInfo

CONTRACT_VERSION = "1.0.0"
CONTRACT_MAJOR = int(CONTRACT_VERSION.split(".")[0])

TOPIC_FIELDS = ("tasks", "interfaces", "aggregates", "lldp", "cdp", "system", "ha")


def _duplicates(keys: Iterable[tuple]) -> list[tuple]:
    return sorted(k for k, n in Counter(keys).items() if n > 1)


def _fold(key: tuple) -> tuple:
    return (key[0].casefold(), *key[1:])


class RunBundle(ContractModel):
    """Le document unique échangé entre l'exportateur B0 et Living Diagram : une run, une infrastructure.

    Toute section de topic peut être vide : un bundle se construit progressivement (devices, run, tasks,
    interfaces d'abord ; un topic de plus à chaque étape).
    """

    contract_version: SemVer = Field(description="Version semver du contrat ; la version majeure doit être supportée.")
    produced_at: UtcDatetime = Field(
        description="Date de production du bundle par l'exportateur, ISO 8601 avec fuseau."
    )
    exporter_version: NonEmptyStr = Field(description="Version de l'exportateur B0 qui a produit le bundle.")
    infrastructure: NonEmptyStr = Field(
        description=(
            "Infrastructure dessinée, écrite une seule fois : les documents de topic ne la répètent pas. Le périmètre "
            "est celui de `devices` au moment de l'export ; seule `devices` déborde sur d'autres infrastructures."
        )
    )
    run: RunInfo = Field(description="La run amont dont les topics sont extraits.")
    devices: tuple[Device, ...] = Field(
        description="Table de référence **complète**, toutes infrastructures, telle que lue au moment de l'export."
    )
    tasks: tuple[DeviceTask, ...] = Field(
        description="Statut de collecte par device et par topic, pour l'infrastructure."
    )
    interfaces: tuple[Interface, ...] = Field(description="Topic `interfaces`, filtré sur l'infrastructure.")
    aggregates: tuple[Aggregate, ...] = Field(description="Topic agrégats, filtré sur l'infrastructure.")
    lldp: tuple[LldpNeighbor, ...] = Field(description="Topic `lldp_neighbors`, filtré sur l'infrastructure.")
    cdp: tuple[CdpNeighbor, ...] = Field(description="Topic `cdp_neighbors`, filtré sur l'infrastructure.")
    system: tuple[SystemInfo, ...] = Field(description="Topic `system`, filtré sur l'infrastructure.")
    ha: tuple[HaStatus, ...] = Field(description="Topic `ha`, filtré sur l'infrastructure.")
    residual_normalizations: dict[str, Int] = Field(
        default_factory=dict,
        description=(
            "Compteur par règle de normalisation que B0 a dû appliquer faute de normalisation amont "
            "(`duplex_vendor_form`, `mac_dotted_to_colon`…). Doit tendre vers zéro."
        ),
    )

    @field_validator("contract_version")
    @classmethod
    def _major_is_supported(cls, value: str) -> str:
        major = int(value.split(".")[0])
        if major != CONTRACT_MAJOR:
            raise PydanticCustomError(
                "contract_major_unsupported",
                "version majeure du contrat non supportée",
                {"received": major, "expected": CONTRACT_MAJOR},
            )
        return value

    @model_validator(mode="after")
    def _structural_consistency(self) -> RunBundle:
        self._check_unique(("devices", [(d.hostname,) for d in self.devices]))
        self._check_topic_scope()
        self._check_unique_topic_keys()
        self._check_single_membership()
        return self

    @staticmethod
    def _check_unique(entry: tuple[str, list[tuple]]) -> None:
        field, keys = entry
        dups = _duplicates(_fold(k) for k in keys)
        if dups:
            raise PydanticCustomError(
                "duplicate_identity", "identités en double dans la section", {"section": field, "duplicates": dups}
            )

    def _check_topic_scope(self) -> None:
        """Le périmètre est celui de `devices` : chaque document de topic vise un device de l'infrastructure."""
        infra_of = {d.hostname: d.infrastructure for d in self.devices}
        for field in TOPIC_FIELDS:
            for index, doc in enumerate(getattr(self, field)):
                where = {"section": field, "index": index, "hostname": doc.hostname}
                if doc.hostname not in infra_of:
                    raise PydanticCustomError("hostname_not_in_devices", "hostname absent de la table devices", where)
                if infra_of[doc.hostname] != self.infrastructure:
                    raise PydanticCustomError(
                        "hostname_outside_infrastructure",
                        "le device de ce document appartient à une autre infrastructure",
                        {**where, "infrastructure": infra_of[doc.hostname], "expected": self.infrastructure},
                    )

    def _check_unique_topic_keys(self) -> None:
        keyed = {
            "tasks": [(t.hostname,) for t in self.tasks],
            "interfaces": [(i.hostname, i.name) for i in self.interfaces],
            "aggregates": [(a.hostname, a.name) for a in self.aggregates],
            "lldp": [(n.hostname, n.local_interface, n.neighbor, n.neighbor_interface) for n in self.lldp],
            "cdp": [(n.hostname, n.local_interface, n.neighbor, n.neighbor_interface) for n in self.cdp],
            "system": [(s.hostname,) for s in self.system],
            "ha": [(h.hostname,) for h in self.ha],
        }
        for entry in keyed.items():
            self._check_unique(entry)

    def _check_single_membership(self) -> None:
        """Un port est membre d'un agrégat au plus, par device : sinon l'appartenance dépendrait de l'ordre lu."""
        sources = {
            "aggregates": [(a.hostname, a.name, m.name) for a in self.aggregates for m in a.members],
            "interfaces": [(i.hostname, i.name, member) for i in self.interfaces for member in i.members],
        }
        for section, rows in sources.items():
            parents: dict[tuple[str, str], set[str]] = {}
            for hostname, aggregate, member in rows:
                parents.setdefault((hostname, member), set()).add(aggregate)
            shared = sorted(key for key, names in parents.items() if len(names) > 1)
            if shared:
                hostname = shared[0][0]
                raise PydanticCustomError(
                    "member_in_several_aggregates",
                    "un port est membre de plusieurs agrégats du même device",
                    {"section": section, "hostname": hostname, "members": [m for h, m in shared if h == hostname]},
                )

    def devices_in_scope(self) -> tuple[Device, ...]:
        return tuple(d for d in self.devices if d.infrastructure == self.infrastructure)
