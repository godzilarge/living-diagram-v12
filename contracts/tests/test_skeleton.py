from pathlib import Path

from ld_contracts.validate import validate_file

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def test_skeleton_is_the_smallest_valid_bundle_without_findings():
    report = validate_file(FIXTURES / "bundle-skeleton.json")
    assert report.ok, report.errors
    assert report.findings == ()
    assert len(report.bundle.interfaces) == 1
