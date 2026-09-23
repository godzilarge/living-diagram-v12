"""Run de collecte et statut par device et par topic (documents collector_runs et collector_run_tasks)."""

from pydantic import Field

from ld_contracts.common import ContractModel, Hostname, NonEmptyStr, UtcDatetime
from ld_contracts.enums import DeviceTaskStatus, RunStatus, TaskStatus


class RunInfo(ContractModel):
    """La run de collecte amont dont le bundle est extrait (document `collector_runs`)."""

    collector_run_id: NonEmptyStr = Field(
        description="Identifiant de la run amont. Avec `infrastructure`, clé d'idempotence de l'ingestion."
    )
    collection_name: str | None = Field(
        default=None,
        description="Nom libre de la campagne de collecte, tel que saisi à son lancement ; null si absent.",
    )
    start_datetime: UtcDatetime = Field(description="Début de la run, ISO 8601 avec fuseau (UTC recommandé).")
    end_datetime: UtcDatetime | None = Field(
        default=None,
        description="Fin de la run ; null si elle n'est pas terminée. B0 n'exporte que des runs terminées.",
    )
    status: RunStatus = Field(description="État global de la run.")


class SubjectStatus(ContractModel):
    """Résultat de la collecte d'un topic sur un device."""

    status: TaskStatus = Field(description="Succès ou échec de la collecte de ce topic sur ce device.")
    started_at: UtcDatetime | None = Field(
        default=None, description="Début de la collecte de ce topic sur ce device ; null si non horodaté."
    )
    ended_at: UtcDatetime | None = Field(
        default=None,
        description="Fin de la collecte ; null si non horodaté. Tient lieu de `collected_at` aux documents du topic.",
    )
    error: str | None = Field(
        default=None,
        description="Message d'erreur brut du collecteur ; null si succès. Texte libre, nettoyé par l'anonymiseur.",
    )


class DeviceTask(ContractModel):
    """Statut de collecte d'un device pour la run (document `collector_run_tasks_<id>`).

    Un topic **absent** de `status_per_subject` signifie « non supporté par la plateforme ou non
    sélectionné pour cette run » : B1 n'attend alors aucune donnée de ce device pour ce topic et
    n'émet aucun contrôle de réciprocité à son encontre (par exemple « lien vu d'un seul côté »).
    """

    hostname: Hostname = Field(description="Hostname du device, identique octet pour octet à `devices[].hostname`.")
    status: DeviceTaskStatus = Field(description="Résultat global de la collecte sur ce device.")
    status_per_subject: dict[str, SubjectStatus] = Field(
        description=(
            "Résultat par topic. Clé = nom du topic : `interfaces`, `aggregates`, `lldp`, `cdp`, `system`, `ha`, "
            "ou leurs alias amont (`lldp_neighbors`, `cdp_neighbors`, `system_info`, `port_channels`). "
            "Vide pour un device injoignable."
        )
    )
    error: str | None = Field(default=None, description="Erreur globale (connexion, authentification) ; null sinon.")
