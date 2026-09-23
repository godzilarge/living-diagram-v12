"""Table de référence devices et topic system."""

from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, Extras, Hostname, Int, NonEmptyStr
from ld_contracts.enums import ChassisRole, ChassisState, DeviceType


class Device(ContractModel):
    """Un équipement de la table de référence `devices`.

    Un document par châssis physique : un stack est un seul document. La table **complète**
    (toutes infrastructures) est fournie dans le bundle : B1 y résout les voisins d'une autre
    infrastructure (« externes connus ») et ne classe en stub que les noms qu'elle ignore.
    """

    hostname: Hostname = Field(
        description=(
            "Clé d'identité du device dans toutes les collections. C'est le nom configuré sur l'équipement, "
            "sans domaine DNS, et il est copié tel quel dans chaque document de topic."
        )
    )
    infrastructure: NonEmptyStr = Field(description="Infrastructure d'appartenance ; un device n'en a qu'une.")
    site: str | None = Field(default=None, description="Site géographique, partition de placement ; null si inconnu.")
    type: DeviceType = Field(
        description="Nature du boîtier. Ce n'est pas le rôle topologique (spine, cœur, accès), qui est inféré par B5."
    )
    vendor: str | None = Field(
        default=None, description="Constructeur en minuscules (`cisco`, `fortinet`, `checkpoint`) ; null si inconnu."
    )
    model: str | None = Field(
        default=None, description="Référence matérielle (`N9K-C93180YC-FX`, `FGT-600F`) ; null si inconnue."
    )
    os_name: str | None = Field(
        default=None,
        description=(
            "Nom de l'OS tel que fourni par l'inventaire, non normalisé, pour affichage seulement. "
            "Aucune règle de B1 ne s'appuie sur une famille d'OS : un nom d'interface distant est résolu par "
            "recherche dans les `interfaces[]` du device résolu, sinon sur évidence CDP / LLDP / `vendor` "
            "(R1 de docs/05)."
        ),
    )
    os_version: str | None = Field(default=None, description="Version d'OS selon l'inventaire ; null si inconnue.")
    serial_number: str | None = Field(
        default=None,
        description="Serial du châssis (membre maître pour un stack) ; null si inconnu. Identité de secours, jamais "
        "clé de jointure.",
    )
    extras: Extras = Field(description="Attributs libres de l'inventaire ; jamais lus par B1.")


class ChassisMember(ContractModel):
    """Un châssis membre d'un stack (topic system, `show switch` / `show version`)."""

    slot: Int = Field(description="Numéro de membre dans le stack (switch number).")
    serial: str | None = Field(default=None, description="Serial du membre ; null si non lu.")
    model: str | None = Field(default=None, description="Référence matérielle du membre ; null si non lue.")
    role: ChassisRole = Field(description="Rôle du membre dans le stack.")
    state: ChassisState = Field(description="État du membre. `removed` ou `provisioned` = membre attendu mais absent.")
    priority: Int | None = Field(default=None, description="Priorité d'élection ; null si non lue.")


class SystemInfo(ContractModel):
    """Ce que l'équipement dit de lui-même (topic `system`).

    Sources typiques : `show version`, `show switch`, `show inventory` (Cisco) ; `get system status`
    (FortiOS) ; `show version all`, `show asset all`, `vsx stat -v` (Gaia). Un document par device.
    """

    hostname: Hostname = Field(description="Hostname du device, identique octet pour octet à `devices[].hostname`.")
    reported_hostname: str | None = Field(
        default=None,
        description=(
            "Nom que l'équipement affiche de lui-même (prompt, `show hostname`), tel quel ; null si non lu. "
            "Un écart avec `hostname` (hors casse) est un constat, jamais une correction."
        ),
    )
    vendor: str | None = Field(default=None, description="Constructeur selon l'équipement ; null si non lu.")
    model: str | None = Field(default=None, description="Référence matérielle selon l'équipement ; null si non lue.")
    os_version: str | None = Field(default=None, description="Version d'OS selon l'équipement ; null si non lue.")
    serial_number: str | None = Field(
        default=None, description="Serial du châssis selon l'équipement ; null si non lu."
    )
    uptime_seconds: Int | None = Field(
        default=None,
        description="Temps écoulé depuis le dernier redémarrage, en secondes ; null si non lu. Un reboot entre deux "
        "runs est un événement.",
    )
    chassis_members: tuple[ChassisMember, ...] = Field(
        description="Membres d'un stack, un par châssis ; liste vide pour un standalone. Source du badge ×N."
    )
    virtual_contexts: tuple[str, ...] = Field(
        description="Contextes virtuels hébergés (Virtual Systems VSX, VDOM…) ; liste vide sinon."
    )
    extras: Extras = Field(description="Détail brut vendeur ; jamais lu par B1.")

    @model_validator(mode="after")
    def _one_member_per_slot(self) -> SystemInfo:
        """Deux châssis au même numéro de membre se contredisent : le badge ×N ne saurait pas compter."""
        slots = [member.slot for member in self.chassis_members]
        duplicates = sorted({slot for slot in slots if slots.count(slot) > 1})
        if duplicates:
            raise PydanticCustomError(
                "chassis_member_slot_duplicate",
                "deux membres du stack portent le même numéro",
                {"hostname": self.hostname, "slots": duplicates},
            )
        return self
