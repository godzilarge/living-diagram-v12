"""`diff(before, after) -> Diff` : la fonction pure de B3 (`docs/07`).

Deux snapshots d'une même infrastructure (la majeure est celle que le contrat Snapshot accepte, une seule) ; la
direction est celle demandée. Rien n'est lu hors des deux snapshots : ni archive, ni intention, ni rendu.
"""

from ld_contracts.common import ContractModel
from ld_contracts.diff import DIFF_VERSION, Diff, elapsed_seconds_between
from ld_contracts.diff.changes import Event
from ld_contracts.diff.enums import EventKind
from ld_contracts.diff.sections import CheckChanges, CoverageChanges
from ld_contracts.diff.summary import (
    CheckSummary,
    CoverageSummary,
    EventSummary,
    RunRef,
    SectionSummary,
    Summary,
)
from ld_contracts.snapshot import Snapshot

from ld_backend.diff.events import events
from ld_backend.diff.sections import (
    aggregate_changes,
    check_changes,
    coverage_changes,
    ha_cluster_changes,
    interface_changes,
    link_changes,
    mlag_domain_changes,
    node_changes,
)


class DiffError(ValueError):
    """Les deux snapshots ne se comparent pas. Le message ne cite aucune valeur."""


def run_ref(snapshot: Snapshot) -> RunRef:
    source = snapshot.source
    return RunRef(
        collector_run_id=source.collector_run_id,
        bundle_sha256=source.bundle_sha256,
        snapshot_version=snapshot.snapshot_version,
        start_datetime=source.run.start_datetime,
        end_datetime=source.run.end_datetime,
        status=source.run.status,
    )


def _section_summary(section: ContractModel) -> SectionSummary:
    return SectionSummary(added=len(section.added), removed=len(section.removed), changed=len(section.changed))


def _summary(
    sections: dict[str, ContractModel],
    checks: CheckChanges,
    coverage: CoverageChanges,
    found: tuple[Event, ...],
    volatile: int,
) -> Summary:
    kinds = [event.kind for event in found]
    return Summary(
        **{name: _section_summary(section) for name, section in sections.items()},
        checks=CheckSummary(appeared=len(checks.appeared), resolved=len(checks.resolved), persisted=checks.persisted),
        coverage=CoverageSummary(changed=len(coverage.changed)),
        events=EventSummary(rebooted=kinds.count(EventKind.REBOOTED), flapped=kinds.count(EventKind.FLAPPED)),
        volatile_changes=volatile,
    )


def diff(before: Snapshot, after: Snapshot) -> Diff:
    """Ce qui a changé de `before` à `after`. Déterministe : mêmes snapshots ⇒ mêmes octets."""
    if before.source.infrastructure != after.source.infrastructure:
        raise DiffError("les deux snapshots ne sont pas de la même infrastructure")
    elapsed = elapsed_seconds_between(before.source.run.start_datetime, after.source.run.start_datetime)
    builders = {
        "nodes": node_changes,
        "interfaces": interface_changes,
        "links": link_changes,
        "aggregates": aggregate_changes,
        "mlag_domains": mlag_domain_changes,
        "ha_clusters": ha_cluster_changes,
    }
    sections: dict[str, ContractModel] = {}
    volatile = 0
    for name, build in builders.items():
        sections[name], ignored = build(before, after)
        volatile += ignored
    checks = check_changes(before, after)
    coverage = coverage_changes(before, after)
    found = events(before, after, elapsed)
    return Diff(
        diff_version=DIFF_VERSION,
        infrastructure=after.source.infrastructure,
        before=run_ref(before),
        after=run_ref(after),
        elapsed_seconds=elapsed,
        summary=_summary(sections, checks, coverage, found, volatile),
        **sections,
        checks=checks,
        coverage=coverage,
        events=found,
    )
