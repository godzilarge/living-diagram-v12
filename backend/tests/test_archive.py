import json

import pytest
from ld_contracts.bundle import RunBundle

from ld_backend.archive import ArchiveConflictError, BundleArchive
from tests.conftest import modified


def test_store_then_load_round_trip(archive: BundleArchive, bundle_dict):
    stored, created = archive.store(RunBundle.model_validate(bundle_dict), {"ok": True})
    assert created and stored.infrastructure == "infra-lab" and stored.run_id == "66db3f0e9a1c2b0012f4a7d1"
    assert archive.load_bundle("infra-lab", stored.run_id)["infrastructure"] == "infra-lab"
    assert archive.load_report("infra-lab", stored.run_id) == {"ok": True}
    assert (stored.path / "bundle.json").exists() and (stored.path / "meta.json").exists()


def test_store_is_idempotent_for_identical_content(archive: BundleArchive, bundle_dict):
    first, created1 = archive.store(RunBundle.model_validate(bundle_dict), {})
    second, created2 = archive.store(RunBundle.model_validate(json.loads(json.dumps(bundle_dict))), {})
    assert created1 and not created2 and first.sha256 == second.sha256


def test_store_refuses_a_different_bundle_for_the_same_run(archive: BundleArchive, bundle_dict):
    archive.store(RunBundle.model_validate(bundle_dict), {})
    with pytest.raises(ArchiveConflictError):
        archive.store(RunBundle.model_validate(modified(bundle_dict)), {})


def test_list_runs_per_infrastructure(archive: BundleArchive, bundle_dict, skeleton_dict):
    archive.store(RunBundle.model_validate(bundle_dict), {})
    archive.store(RunBundle.model_validate(skeleton_dict), {})
    assert [r.run_id for r in archive.list_runs("infra-lab")] == ["66db3f0e9a1c2b0012f4a7d1"]
    assert [r.infrastructure for r in archive.list_runs("infra_01")] == ["infra_01"]
    assert archive.list_runs("nope") == []
    assert archive.load_bundle("nope", "x") is None and archive.load_report("nope", "x") is None


def test_path_segments_cannot_escape_the_archive_root(archive: BundleArchive, skeleton_dict):
    evil = json.loads(json.dumps(skeleton_dict))
    evil["infrastructure"] = "../../etc"
    for doc in evil["devices"]:
        doc["infrastructure"] = "../../etc"
    evil["run"]["collector_run_id"] = "../passwd"
    stored, _ = archive.store(RunBundle.model_validate(evil), {})
    assert archive.root.resolve() in stored.path.resolve().parents
    assert archive.load_bundle("../../etc", "../passwd")["infrastructure"] == "../../etc"


# ---------------------------------------------------------------- review fixes


def test_concurrent_stores_with_different_content_yield_one_created_and_one_conflict(archive, bundle_dict):
    from concurrent.futures import ThreadPoolExecutor

    from ld_backend.archive import ArchiveConflictError

    a = RunBundle.model_validate(bundle_dict)
    b = RunBundle.model_validate(modified(bundle_dict))

    def attempt(bundle):
        try:
            return archive.store(bundle, {})[1]
        except ArchiveConflictError:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(attempt, [a, b] * 5))
    assert outcomes.count(True) == 1
    assert outcomes.count("conflict") + outcomes.count(False) == 9
    winner = archive.load_bundle("infra-lab", "66db3f0e9a1c2b0012f4a7d1")
    assert winner in (a.model_dump(mode="json"), b.model_dump(mode="json"))
    assert (archive.root / "infra-lab").is_dir() and not list((archive.root / "infra-lab").glob(".*tmp*"))


def test_fingerprint_ignores_the_envelope_so_a_re_export_is_idempotent(archive, bundle_dict):
    archive.store(RunBundle.model_validate(bundle_dict), {})
    later = dict(bundle_dict, produced_at="2026-09-11T09:00:00Z", exporter_version="0.2.0")
    _, created = archive.store(RunBundle.model_validate(later), {})
    assert created is False


def test_corrupt_meta_is_isolated_not_fatal(archive, bundle_dict, skeleton_dict):
    from ld_backend.archive import ArchiveCorruptError

    stored, _ = archive.store(RunBundle.model_validate(bundle_dict), {})
    (stored.path / "meta.json").write_text("{truncated", encoding="utf-8")
    with pytest.raises(ArchiveCorruptError):
        archive.store(RunBundle.model_validate(bundle_dict), {})
    assert archive.list_runs("infra-lab") == []
    archive.store(RunBundle.model_validate(skeleton_dict), {})
    assert [r.run_id for r in archive.list_runs("infra_01")] == ["66db3f0e9a1c2b0012f4a7d1"]


def test_dates_written_by_the_archive_are_utc_in_the_contract_form(archive, bundle_dict):
    doc = json.loads(json.dumps(bundle_dict))
    doc["produced_at"] = "2026-09-10T12:00:00+02:00"
    stored, _ = archive.store(RunBundle.model_validate(doc), {})
    assert stored.produced_at == "2026-09-10T10:00:00Z", "UTC, forme du contrat (`Z`), jamais `+00:00`"
    assert stored.stored_at.endswith("Z") and stored.run_start.endswith("Z")


def test_runs_are_ordered_by_collection_start_not_by_export_date(archive, bundle_dict):
    """La timeline et le diff N-1 suivent l'ordre des collectes ; un ré-export tardif ne déplace pas une run."""
    old_run = json.loads(json.dumps(bundle_dict))
    old_run["run"] |= {"collector_run_id": "run-ancienne", "start_datetime": "2026-09-01T02:00:00Z"}
    old_run["run"]["end_datetime"] = "2026-09-01T02:30:00Z"
    old_run["produced_at"] = "2026-09-18T09:00:00Z"  # exportée tard
    new_run = json.loads(json.dumps(bundle_dict))
    new_run["run"] |= {"collector_run_id": "run-recente", "start_datetime": "2026-09-10T04:00:00+02:00"}
    new_run["produced_at"] = "2026-09-10T03:00:00Z"
    for doc in (new_run, old_run):
        archive.store(RunBundle.model_validate(doc), {})
    runs = archive.list_runs("infra-lab")
    assert [r.run_id for r in runs] == ["run-ancienne", "run-recente"]
    assert (runs[1].run_start, runs[0].run_end, runs[0].run_status) == (
        "2026-09-10T02:00:00Z",
        "2026-09-01T02:30:00Z",
        "completed",
    )


def test_run_without_end_is_archived_with_a_null_end(archive, bundle_dict):
    doc = json.loads(json.dumps(bundle_dict))
    doc["run"]["end_datetime"] = None
    stored, _ = archive.store(RunBundle.model_validate(doc), {})
    assert stored.run_end is None and archive.list_runs("infra-lab")[0].run_end is None


def test_conflict_carries_both_fingerprints(archive, bundle_dict):
    first, _ = archive.store(RunBundle.model_validate(bundle_dict), {})
    changed = json.loads(json.dumps(bundle_dict))
    changed["interfaces"][0]["oper_status"] = "down"
    with pytest.raises(ArchiveConflictError) as exc:
        archive.store(RunBundle.model_validate(changed), {})
    assert exc.value.existing.sha256 == first.sha256 != exc.value.received_sha256
    assert exc.value.existing.stored_at.endswith("Z")


def test_safe_and_hashed_segments_cannot_collide():
    from ld_backend.archive import _segment

    assert _segment("infra-lab") == "infra-lab"
    hashed = _segment("../../etc")
    assert hashed.startswith("_") and "/" not in hashed
    assert _segment("a" * 200) != _segment("a" * 201)


# ---------------------------------------------------------------- second review


@pytest.mark.parametrize("bad_meta", ['{"produced_at": "yesterday"}', "[1,2]", '{"x": 1}'])
def test_meta_with_wrong_shape_or_dates_is_corrupt_not_fatal(archive, bundle_dict, bad_meta):
    from ld_backend.archive import ArchiveCorruptError

    stored, _ = archive.store(RunBundle.model_validate(bundle_dict), {})
    meta = json.loads((stored.path / "meta.json").read_text(encoding="utf-8"))
    payload = json.loads(bad_meta)
    merged = {**meta, **payload} if isinstance(payload, dict) and "x" not in payload else payload
    (stored.path / "meta.json").write_text(json.dumps(merged), encoding="utf-8")
    assert archive.list_runs("infra-lab") == []
    with pytest.raises(ArchiveCorruptError):
        archive.store(RunBundle.model_validate(bundle_dict), {})


def test_no_temp_dir_survives_a_failure_before_rename(archive, bundle_dict):
    with pytest.raises(TypeError):
        archive.store(RunBundle.model_validate(bundle_dict), {"not serializable": object()})
    assert not list(archive.root.rglob(".tmp-*"))
    assert archive.list_runs("infra-lab") == []


def test_corrupt_bundle_bytes_are_detected_by_checksum(archive, bundle_dict):
    from ld_backend.archive import ArchiveCorruptError

    stored, _ = archive.store(RunBundle.model_validate(bundle_dict), {})
    (stored.path / "bundle.json").write_text("{corrupt", encoding="utf-8")
    with pytest.raises(ArchiveCorruptError):
        archive.load_bundle_bytes("infra-lab", "66db3f0e9a1c2b0012f4a7d1")


def test_rename_errors_other_than_existing_target_are_not_masked(archive, bundle_dict, monkeypatch):
    import errno
    from pathlib import Path

    def boom(self, target):
        raise OSError(errno.EIO, "disk on fire")

    monkeypatch.setattr(Path, "rename", boom)
    with pytest.raises(OSError, match="disk on fire"):
        archive.store(RunBundle.model_validate(bundle_dict), {})
    assert not list(archive.root.rglob(".tmp-*"))
