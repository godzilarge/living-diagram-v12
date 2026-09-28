from pathlib import Path

from ld_contracts.validate import validate_file, validate_snapshot_file

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def test_skeleton_is_the_smallest_valid_bundle_without_findings():
    report = validate_file(FIXTURES / "bundle-skeleton.json")
    assert report.ok, report.errors
    assert report.findings == ()
    assert len(report.bundle.interfaces) == 1


def test_minimal_snapshot_is_the_valid_reference_of_the_minimal_bundle():
    """Le golden de B1 : écrit par `ld correlate bundle-minimal.json --out`, il doit rester valide au contrat de
    sortie et décrire le bundle de référence (l'égalité à l'octet se teste côté backend)."""
    source = validate_file(FIXTURES / "bundle-minimal.json")
    assert source.ok, source.errors
    bundle = source.bundle
    report = validate_snapshot_file(FIXTURES / "snapshot-minimal.json")
    assert report.ok, report.errors
    snapshot = report.snapshot
    assert (snapshot.source.infrastructure, snapshot.source.collector_run_id) == (
        bundle.infrastructure,
        bundle.run.collector_run_id,
    )
    assert {n.hostname for n in snapshot.nodes if n.kind == "device"} == {d.hostname for d in bundle.devices_in_scope()}
    assert (FIXTURES / "snapshot-minimal.json").read_bytes().endswith(b"}\n")
