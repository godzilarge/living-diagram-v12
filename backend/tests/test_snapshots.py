"""Branchement de B1 : le snapshot se range à côté du bundle, se recalcule, et ne fait jamais échouer l'ingestion."""

import hashlib
import json

import pytest
from ld_contracts.snapshot import Snapshot

from ld_backend import snapshots
from ld_backend.archive import ArchiveCorruptError, BundleArchive
from ld_backend.ingest import ingest_bundle, result_payload

INFRA, RUN = "infra-lab", "66db3f0e9a1c2b0012f4a7d1"


def _boom(*_: object) -> None:
    raise RuntimeError("bug de B1")


def test_ingestion_writes_the_snapshot_next_to_the_bundle(archive: BundleArchive, bundle_dict):
    result = ingest_bundle(bundle_dict, archive)
    assert result.correlation.status == "created"
    assert (result.correlation.nodes, result.correlation.links) == (6, 6)
    raw = archive.load_snapshot_bytes(INFRA, RUN)
    snapshot = Snapshot.model_validate_json(raw)
    assert snapshot.source.bundle_sha256 == archive.find_run(INFRA, RUN).sha256
    assert result.correlation.checks == _by_severity(snapshot)
    assert result_payload(result)["correlation"]["status"] == "created"


def _by_severity(snapshot: Snapshot) -> dict[str, int]:
    counts = {"error": 0, "warning": 0, "info": 0}
    for check in snapshot.checks:
        counts[check.severity] += 1
    return counts


def test_the_same_delivery_does_not_recompute_an_existing_snapshot(archive: BundleArchive, bundle_dict, monkeypatch):
    ingest_bundle(bundle_dict, archive)
    monkeypatch.setattr(snapshots, "correlate", _boom)
    again = ingest_bundle(bundle_dict, archive)
    assert again.status == "already_present" and again.correlation.status == "already_present"
    assert again.correlation.nodes is None


def test_a_b1_failure_never_fails_the_ingestion(archive: BundleArchive, bundle_dict, monkeypatch, caplog):
    monkeypatch.setattr(snapshots, "correlate", _boom)
    result = ingest_bundle(bundle_dict, archive)
    assert result.status == "created" and result.http_status == 201
    assert result.correlation.status == "failed" and result.correlation.links is None
    assert archive.load_bundle(INFRA, RUN) is not None and archive.load_snapshot_bytes(INFRA, RUN) is None
    assert "bug de B1" in caplog.text  # la trace va au journal, jamais dans la réponse
    assert "bug de B1" not in json.dumps(result_payload(result))


def test_a_run_archived_without_snapshot_gets_one_on_the_next_delivery(archive, bundle_dict, monkeypatch):
    with monkeypatch.context() as patched:
        patched.setattr(snapshots, "correlate", _boom)
        ingest_bundle(bundle_dict, archive)
    again = ingest_bundle(bundle_dict, archive)
    assert again.status == "already_present" and again.correlation.status == "created"
    assert archive.load_snapshot_bytes(INFRA, RUN) is not None


def test_not_archived_means_no_correlation(archive: BundleArchive, bundle_dict):
    assert ingest_bundle(dict(bundle_dict, contract_version="2.0.0"), archive).correlation is None
    assert result_payload(ingest_bundle(["nope"], archive))["correlation"] is None


def test_the_archived_report_describes_the_ingestion_only(archive: BundleArchive, bundle_dict):
    ingest_bundle(bundle_dict, archive)
    assert archive.load_report(INFRA, RUN)["correlation"] is None


def test_recorrelate_replaces_the_snapshot_and_gives_the_same_bytes(archive: BundleArchive, bundle_dict):
    ingest_bundle(bundle_dict, archive)
    first = archive.load_snapshot_bytes(INFRA, RUN)
    archive.store_snapshot(INFRA, RUN, "{}\n")
    summary = snapshots.recorrelate(archive, INFRA, RUN)
    assert summary.status == "created" and summary.links == 6
    assert archive.load_snapshot_bytes(INFRA, RUN) == first


def test_an_archived_bundle_the_contract_no_longer_reads_is_a_failure_not_a_crash(archive, bundle_dict, caplog):
    ingest_bundle(bundle_dict, archive)
    run_dir = archive.find_run(INFRA, RUN).path
    raw = (
        (run_dir / "bundle.json")
        .read_text(encoding="utf-8")
        .replace('"contract_version":"1.0.0"', '"contract_version":"0.9.0"')
    )
    (run_dir / "bundle.json").write_text(raw, encoding="utf-8")
    meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
    meta["bytes_sha256"] = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    (run_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    assert snapshots.recorrelate(archive, INFRA, RUN).status == "failed"
    assert "ValidationError" in caplog.text and "0.9.0" not in caplog.text


def test_recorrelate_unknown_run_is_none(archive: BundleArchive):
    assert snapshots.recorrelate(archive, INFRA, "inconnue") is None


def test_store_snapshot_needs_an_archived_run_and_leaves_no_temp_file(archive: BundleArchive, bundle_dict):
    with pytest.raises(KeyError):
        archive.store_snapshot(INFRA, RUN, "{}\n")
    ingest_bundle(bundle_dict, archive)
    names = {p.name for p in archive.find_run(INFRA, RUN).path.iterdir()}
    assert names == {"bundle.json", "report.json", "meta.json", "snapshot.json"}


def test_snapshot_of_a_corrupt_run_is_signalled(archive: BundleArchive, bundle_dict):
    ingest_bundle(bundle_dict, archive)
    (archive.find_run(INFRA, RUN).path / "meta.json").write_text("{", encoding="utf-8")
    with pytest.raises(ArchiveCorruptError):
        archive.load_snapshot_bytes(INFRA, RUN)


# ---------------------------------------------------------------- revue du branchement (2026-09-20)


def _run_files(archive: BundleArchive) -> set[str]:
    return {p.name for p in archive.find_run(INFRA, RUN).path.iterdir()}


def test_h1_a_missing_snapshot_is_computed_from_the_archived_bundle_not_from_the_delivery(
    archive, bundle_dict, monkeypatch
):
    """Un ré-export de la même run a une autre enveloppe : le snapshot doit porter celle du bundle archivé."""
    with monkeypatch.context() as patched:
        patched.setattr(snapshots, "correlate", _boom)
        ingest_bundle(bundle_dict, archive)
    re_export = dict(bundle_dict, produced_at="2026-09-12T08:30:00Z", exporter_version="9.9.9")
    again = ingest_bundle(re_export, archive)
    assert again.status == "already_present" and again.correlation.status == "created"
    from_delivery = archive.load_snapshot_bytes(INFRA, RUN)
    source = Snapshot.model_validate_json(from_delivery).source
    assert (source.exporter_version, source.produced_at.isoformat()) == ("0.1.0", "2026-09-10T02:20:11+00:00")
    snapshots.recorrelate(archive, INFRA, RUN)
    assert archive.load_snapshot_bytes(INFRA, RUN) == from_delivery


def test_m4_a_refusal_of_the_output_contract_is_a_failure_and_its_log_quotes_no_input(
    archive, bundle_dict, monkeypatch, caplog
):
    def refused(*_: object) -> Snapshot:
        return Snapshot.model_validate({"nodes": "client-banque-x"})

    monkeypatch.setattr(snapshots, "correlate", refused)
    result = ingest_bundle(bundle_dict, archive)
    assert result.status == "created" and result.correlation.status == "failed"
    assert "ValidationError" in caplog.text and "client-banque-x" not in caplog.text
    assert _run_files(archive) == {"bundle.json", "report.json", "meta.json"}


def test_m4_a_disk_failure_is_a_failure_and_leaves_no_temp_file(archive, bundle_dict, monkeypatch):
    def no_space(self, target):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr("pathlib.Path.replace", no_space)
    result = ingest_bundle(bundle_dict, archive)
    assert result.status == "created" and result.correlation.status == "failed"
    assert _run_files(archive) == {"bundle.json", "report.json", "meta.json"}


def test_m3_the_first_log_line_of_a_failure_carries_no_value(archive, bundle_dict, monkeypatch, caplog):
    def keyed(*_: object) -> None:
        raise KeyError("sw-core-01")

    monkeypatch.setattr(snapshots, "correlate", keyed)
    ingest_bundle(bundle_dict, archive)
    first, detail = [r.getMessage() for r in caplog.records if r.name == "ld_backend.snapshots"]
    assert "KeyError" in first and "sw-core-01" not in first
    assert "à relire avant de sortir de la zone" in detail and "sw-core-01" in detail


@pytest.mark.parametrize("damaged", [b"", b'{"contract_version": "1.0.0", "nodes": ['])
def test_m5_an_empty_or_truncated_snapshot_counts_as_missing_and_the_next_delivery_repairs_it(
    archive, bundle_dict, damaged
):
    ingest_bundle(bundle_dict, archive)
    reference = archive.load_snapshot_bytes(INFRA, RUN)
    (archive.find_run(INFRA, RUN).path / "snapshot.json").write_bytes(damaged)
    assert not archive.has_snapshot(INFRA, RUN) and archive.load_snapshot_bytes(INFRA, RUN) is None
    assert ingest_bundle(bundle_dict, archive).correlation.status == "created"
    assert archive.load_snapshot_bytes(INFRA, RUN) == reference


def test_m6_an_unreadable_snapshot_never_fails_the_ingestion(archive, bundle_dict, monkeypatch):
    ingest_bundle(bundle_dict, archive)

    def denied(*_: object) -> bool:
        raise PermissionError(13, "Permission denied")

    monkeypatch.setattr(BundleArchive, "has_snapshot", denied)
    again = ingest_bundle(bundle_dict, archive)
    assert again.status == "already_present" and again.http_status == 200
    assert again.correlation.status == "failed"


def test_b8_only_old_orphan_temp_files_are_purged(archive, bundle_dict):
    import os
    import time

    ingest_bundle(bundle_dict, archive)
    run_dir = archive.find_run(INFRA, RUN).path
    old, fresh = run_dir / ".tmp-snapshot.json-old", run_dir / ".tmp-snapshot.json-fresh"
    old.write_text("x", encoding="utf-8")
    fresh.write_text("x", encoding="utf-8")
    os.utime(old, (time.time() - 7200, time.time() - 7200))
    snapshots.recorrelate(archive, INFRA, RUN)
    assert not old.exists() and fresh.exists()
