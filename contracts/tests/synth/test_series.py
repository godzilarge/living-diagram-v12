"""Une série de runs : la première jamais mutée, les suivantes selon le plan ; déterminisme à l'octet."""

import json
import os
import subprocess
import sys

import pytest

from ld_contracts.synth import (
    GenerationError,
    GenerationSpec,
    Series,
    build_world,
    check_series,
    check_world,
    generate_series,
    pick_applicable,
    write_series,
)
from ld_contracts.synth.world import with_stubs
from tests.synth.conftest import START, assert_strictly_valid


def test_series_shape_and_validity():
    spec = GenerationSpec(seed="s", devices=10, runs=3, mutations_per_run=2, start=START)
    series = generate_series(spec)
    assert len(series.bundles) == 3
    for bundle in series.bundles:
        assert_strictly_valid(bundle)
    runs = series.manifest["runs"]
    assert runs[0]["mutations"] == []
    assert all(len(r["mutations"]) == 2 for r in runs[1:])
    ids = [b["run"]["collector_run_id"] for b in series.bundles]
    assert len(set(ids)) == 3
    starts = [b["run"]["start_datetime"] for b in series.bundles]
    assert starts == sorted(starts)


def test_manifest_describes_the_series():
    spec = GenerationSpec(seed="s", devices=10, runs=2, scenario=("cable_down",), start=START)
    manifest = generate_series(spec).manifest
    assert manifest["spec"]["seed"] == "s" and manifest["spec"]["devices"] == 10
    assert manifest["generator"]["contract_version"] == "1.0.0"
    run = manifest["runs"][1]
    assert run["file"] == "run-02.json"
    assert run["collector_run_id"] and run["start_datetime"]
    assert run["mutations"][0]["kind"] == "cable_down"
    assert set(run["mutations"][0]) == {"kind", "subject", "details"}
    assert run["counts"]["devices"] == 10 and run["counts"]["sites"] == 1
    by_kind = run["counts"]["stubs_by_kind"]
    assert set(by_kind) <= {"server", "phone", "ap"} and sum(by_kind.values()) == run["counts"]["stubs"]


def test_scenario_is_applied_to_every_following_run():
    spec = GenerationSpec(seed="s", devices=10, runs=3, scenario=("ha_failover", "reboot"), start=START)
    series = generate_series(spec)
    kinds = [[m["kind"] for m in r["mutations"]] for r in series.manifest["runs"]]
    assert kinds == [[], ["ha_failover", "reboot"], ["ha_failover", "reboot"]]
    roles = [[m["role"] for m in b["ha"][0]["members"]] for b in series.bundles]
    assert roles[0] != roles[1] and roles[0] == roles[2], "deux bascules ramènent les rôles au départ"


def test_transient_faults_do_not_persist():
    spec = GenerationSpec(seed="s", devices=10, runs=3, scenario=("device_unreachable",), start=START)
    series = generate_series(spec)
    unreachable = [{t["hostname"] for t in b["tasks"] if t["status"] == "unreachable"} for b in series.bundles]
    assert unreachable[0] == set() and len(unreachable[1]) == 1 and len(unreachable[2]) == 1


def test_uptime_grows_a_week_per_run_and_restarts_from_a_reboot():
    """Sans redémarrage, +7 jours par run ; au reboot, régression ; ensuite l'uptime recompte depuis le reboot."""
    import random

    from ld_contracts.synth import apply_mutation, emit_bundle

    spec = GenerationSpec(seed="up", devices=8, runs=4, start=START)
    world = build_world(spec)
    rebooted_world, record = apply_mutation("reboot", world, random.Random("r"), run_index=1)
    week = 7 * 86400

    def uptimes(w, run):
        return {s["hostname"]: s["uptime_seconds"] for s in emit_bundle(w, spec, run)["system"]}

    before, at, after, later = (
        uptimes(world, 0),
        uptimes(rebooted_world, 1),
        uptimes(rebooted_world, 2),
        uptimes(rebooted_world, 3),
    )
    for host in before:
        if host != record.subject:
            assert (
                at[host] - before[host] == week and after[host] - at[host] == week and later[host] - after[host] == week
            )
    assert at[record.subject] < 86400 < before[record.subject]
    assert after[record.subject] == at[record.subject] + week
    assert later[record.subject] == at[record.subject] + 2 * week


def test_long_random_series_keeps_the_world_coherent():
    """Douze runs de quatre mutations : les invariants tiennent, les noms de stubs ne se répètent jamais."""
    spec = GenerationSpec(seed="long", devices=16, runs=12, mutations_per_run=4, start=START)
    series = generate_series(spec)
    kinds = {m["kind"] for r in series.manifest["runs"] for m in r["mutations"]}
    assert len(kinds) >= 10, kinds
    for bundle in series.bundles[::4]:
        assert_strictly_valid(bundle)
    names = [d["neighbor"] for d in series.bundles[-1]["lldp"] if d["neighbor"].startswith(("srv-", "ap-", "SEP"))]
    assert len(names) == len(set(names))


def test_pick_applicable_skips_an_inapplicable_kind():
    world = build_world(GenerationSpec(seed="t", devices=6, start=START))
    stubless = with_stubs(world, remove=[s.name for s in world.stubs])
    import random

    class ShuffleFirst(random.Random):
        """Met toujours `stub_removed` en tête : la sorte inapplicable doit être sautée, pas fatale."""

        def shuffle(self, x):
            x.sort(key=lambda k: (k != "stub_removed", k))

    _world, record = pick_applicable(stubless, ShuffleFirst("s"), 1, kinds=("stub_removed", "reboot"))
    assert record.kind == "reboot"
    with pytest.raises(GenerationError):
        pick_applicable(stubless, ShuffleFirst("s"), 1, kinds=("stub_removed",))


def test_check_series_catches_a_tampered_bundle():
    series = generate_series(GenerationSpec(seed="t", devices=6, start=START))
    check_series(series)
    missing_key = json.loads(json.dumps(series.bundles[0]))
    del missing_key["interfaces"][0]["mtu"]
    with pytest.raises(GenerationError, match="nullable_key_absent"):
        check_series(Series(series.spec, (missing_key,), series.manifest))
    broken = json.loads(json.dumps(series.bundles[0]))
    broken["interfaces"][0]["duplex"] = "both"
    with pytest.raises(GenerationError, match="refusé"):
        check_series(Series(series.spec, (broken,), series.manifest))


def test_built_world_satisfies_its_invariants():
    for devices in (6, 30, 60):
        assert check_world(build_world(GenerationSpec(seed="inv", devices=devices, start=START))) == []


def test_impossible_scenario_is_an_error():
    spec = GenerationSpec(seed="s", devices=6, runs=2, scenario=("stub_removed",) * 20, start=START)
    with pytest.raises(GenerationError):
        generate_series(spec)


def test_same_seed_same_bytes(tmp_path):
    spec = GenerationSpec(seed="bytes", devices=12, runs=2, start=START)
    first = write_series(generate_series(spec), tmp_path / "a")
    second = write_series(generate_series(spec), tmp_path / "b")
    assert [p.name for p in first] == ["manifest.json", "run-01.json", "run-02.json"]
    for a, b in zip(first, second, strict=True):
        assert a.read_bytes() == b.read_bytes()
    other = write_series(generate_series(GenerationSpec(seed="other", devices=12, runs=2, start=START)), tmp_path / "c")
    assert first[1].read_bytes() != other[1].read_bytes()


def test_written_files_end_with_newline_and_are_lf(tmp_path):
    paths = write_series(generate_series(GenerationSpec(seed="lf", devices=6, start=START)), tmp_path)
    for path in paths:
        raw = path.read_bytes()
        assert raw.endswith(b"\n") and b"\r" not in raw


@pytest.mark.parametrize("hashseed", ["0", "1", "4242"])
def test_determinism_across_processes(tmp_path, hashseed):
    """Le déterminisme se teste aussi entre processus : un ordre d'ensemble dépendrait de PYTHONHASHSEED."""
    script = (
        "import sys, json\n"
        "from datetime import UTC, datetime\n"
        "from ld_contracts.synth import GenerationSpec, generate_series, write_series\n"
        "spec = GenerationSpec(seed='proc', devices=14, runs=2, start=datetime(2026, 1, 5, 2, tzinfo=UTC))\n"
        "write_series(generate_series(spec), sys.argv[1])\n"
    )
    out = tmp_path / hashseed
    res = subprocess.run(
        [sys.executable, "-c", script, str(out)],
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONHASHSEED": hashseed},
    )
    assert res.returncode == 0, res.stderr
    reference = tmp_path / "reference"
    if not reference.exists():
        subprocess.run(
            [sys.executable, "-c", script, str(reference)],
            check=True,
            env={**os.environ, "PYTHONHASHSEED": "7"},
        )
    for name in ("manifest.json", "run-01.json", "run-02.json"):
        assert (out / name).read_bytes() == (reference / name).read_bytes(), name


def test_scale_target_is_reached():
    """La jauge du moteur : 500 nœuds / 1 500 liens. Un seul run, compté, pas chronométré."""
    spec = GenerationSpec(seed="scale", devices=500, runs=1, start=START)
    bundle = generate_series(spec).bundles[0]
    in_scope = [d for d in bundle["devices"] if d["infrastructure"] == spec.infrastructure]
    assert len(in_scope) == 500
    observed = {(d["hostname"], d["local_interface"]) for d in bundle["lldp"]}
    assert len(observed) >= 1500
    assert_strictly_valid(bundle)
    assert json.dumps(bundle).count('"name"') > 10_000
