"""B3 sur le squelette et sur des variantes du bundle de référence (docs/07 D0 à D4)."""

import pytest
from ld_contracts.diff.serialize import canonical_json
from ld_contracts.snapshot import Snapshot
from ld_contracts.validate import validate_diff_dict

from ld_backend.diff import DiffError, diff
from tests.correlate.conftest import CORE_1, CORE_2, interface
from tests.diff.conftest import (
    FIXTURES,
    WEEK,
    codes,
    itf_change,
    later,
    link_change,
    load_snapshot,
    node_change,
    paths,
    run,
    sections_empty,
    variant,
)

CABLE = ((CORE_1, "Ethernet1/1"), (CORE_2, "Ethernet1/1"))  # confirmé, up, vu des deux bouts dans la fixture


def test_the_skeleton_pair_gives_the_committed_diff_byte_for_byte():
    """`fixtures/diff-skeleton.json` est ce que B3 produit entre le squelette et sa variante « câble tombé »."""
    before, after = load_snapshot("snapshot-skeleton.json"), load_snapshot("snapshot-skeleton-cable-down.json")
    expected = (FIXTURES / "diff-skeleton.json").read_text(encoding="utf-8")
    assert canonical_json(diff(before, after)) == expected


def test_a_snapshot_against_itself_is_empty(snapshot):
    d = diff(snapshot, snapshot)
    assert sections_empty(d) and d.events == () and d.coverage.changed == ()
    assert d.elapsed_seconds == 0 and d.summary.volatile_changes == 0
    assert d.checks.appeared == () and d.checks.resolved == () and d.checks.persisted == len(snapshot.checks)
    assert d.before == d.after and d.infrastructure == snapshot.source.infrastructure


def test_time_passing_alone_counts_only_volatile_differences(minimal, snapshot):
    after = run(later(minimal))
    d = diff(snapshot, after)
    assert sections_empty(d) and d.events == () and d.coverage.changed == ()
    assert d.elapsed_seconds == WEEK
    uptimes = sum(1 for node in snapshot.nodes if node.uptime_seconds is not None)
    ages = sum(1 for itf in snapshot.interfaces if isinstance(itf.last_change_age_seconds, int))
    assert d.summary.volatile_changes == uptimes + ages > 0
    assert d.before.collector_run_id != d.after.collector_run_id and d.before.bundle_sha256 != d.after.bundle_sha256
    assert validate_diff_dict(d.model_dump(mode="json")).ok


def test_two_infrastructures_are_refused_without_naming_them(snapshot):
    other = snapshot.model_dump(mode="json")
    other["source"]["infrastructure"] = "another-site"
    with pytest.raises(DiffError) as exc:
        diff(snapshot, Snapshot.model_validate(other))
    assert "another-site" not in str(exc.value) and "infra-lab" not in str(exc.value)


def test_a_cable_down_at_both_ends(minimal, snapshot):
    def mutate(d: dict) -> None:
        for host, name in CABLE:
            interface(d, host, name)["oper_status"] = "down"

    d = diff(snapshot, run(variant(later(minimal), mutate)))
    change = link_change(d, *CABLE)
    assert change is not None
    assert paths(change)["oper"].before == "up" and paths(change)["oper"].after == "down"
    for host, name in CABLE:
        fields = paths(itf_change(d, host, name))
        assert fields["oper_status"].after == "down" and set(fields) == {"oper_status"}
    assert "link_down" in codes(d.checks.appeared) and d.summary.checks.appeared == 1
    assert d.links.added == () and d.links.removed == () and d.nodes.changed == ()
    assert d.events == (), "un état qui diffère entre les deux runs est un changement, pas un flap"


def test_a_description_rewritten_is_a_field_change_and_a_new_check(minimal, snapshot):
    host, name = CABLE[0]
    before_text = interface(minimal, host, name)["description"]

    def mutate(d: dict) -> None:
        interface(d, host, name)["description"] = f"C1|{CORE_2}|Ethernet1/9|"

    d = diff(snapshot, run(variant(later(minimal), mutate)))
    fields = paths(itf_change(d, host, name))
    assert fields["description"].before == before_text and fields["description"].after == f"C1|{CORE_2}|Ethernet1/9|"
    assert any(path.startswith("description_parsed") for path in fields)
    assert "description_disagrees_with_observed" in codes(d.checks.appeared)
    assert d.links.removed == (), "la description ne défait pas un câble observé"


def test_a_reboot_is_an_event_not_a_change(minimal, snapshot):
    def mutate(d: dict) -> None:
        next(s for s in d["system"] if s["hostname"] == CORE_1)["uptime_seconds"] = 100

    d = diff(snapshot, run(variant(later(minimal), mutate)))
    assert sections_empty(d)
    (event,) = d.events
    assert event.kind == "rebooted" and event.ref.hostname == CORE_1
    assert event.details.model_dump() == {"uptime_before": 9123456, "uptime_after": 100, "elapsed_seconds": WEEK}
    assert d.summary.events.rebooted == 1 and node_change(d, CORE_1) is None


def test_a_port_that_moved_and_came_back_is_a_flap(minimal, snapshot):
    host, name = CABLE[0]

    def mutate(d: dict) -> None:
        interface(d, host, name)["last_change_age_seconds"] = 10

    d = diff(snapshot, run(variant(later(minimal), mutate)))
    assert sections_empty(d)
    (event,) = d.events
    assert event.kind == "flapped" and (event.ref.hostname, event.ref.name) == (host, name)
    assert event.details.model_dump() == {"age_after": 10, "elapsed_seconds": WEEK}


def test_backwards_the_diff_mirrors_and_the_volatile_fields_say_nothing(minimal, snapshot):
    def mutate(d: dict) -> None:
        next(s for s in d["system"] if s["hostname"] == CORE_1)["uptime_seconds"] = 100
        d["interfaces"] = [i for i in d["interfaces"] if (i["hostname"], i["name"]) != (CORE_2, "Ethernet1/5")]

    after = run(variant(later(minimal), mutate))
    forward, backward = diff(snapshot, after), diff(after, snapshot)
    assert forward.elapsed_seconds == WEEK and backward.elapsed_seconds == -WEEK
    assert forward.events and backward.events == ()
    assert forward.interfaces.removed == backward.interfaces.added and forward.interfaces.added == ()
    assert forward.checks.appeared == backward.checks.resolved
    assert forward.summary.volatile_changes == backward.summary.volatile_changes


def test_a_topic_that_failed_changes_the_coverage(minimal, snapshot):
    def mutate(d: dict) -> None:
        task = next(t for t in d["tasks"] if t["hostname"] == CORE_1)
        task["status"] = "partial"
        task["status_per_subject"]["lldp"] = {"status": "failed", "started_at": None, "ended_at": None, "error": "x"}

    d = diff(snapshot, run(variant(later(minimal), mutate)))
    (coverage,) = d.coverage.changed
    assert coverage.ref.hostname == CORE_1
    assert paths(coverage)["topics.lldp"].after == "failed" and paths(coverage)["status"].after == "partial"
    assert paths(node_change(d, CORE_1))["collection"].after == "partial"
    assert "device_partial_collection" in codes(d.checks.appeared)
    assert d.summary.coverage.changed == 1


def test_a_check_whose_details_change_persists(minimal, snapshot):
    """D3 : `(code, refs)` identifie, les détails décrivent."""
    assert "device_partial_collection" in codes(snapshot.checks), "la fixture a une task partielle sur sw-core-02"

    def mutate(d: dict) -> None:
        task = next(t for t in d["tasks"] if t["hostname"] == CORE_2)
        failed = next(s for s in task["status_per_subject"].values() if s["status"] == "failed")
        failed["error"] = "another reason"

    d = diff(snapshot, run(variant(later(minimal), mutate)))
    assert d.checks.appeared == () and d.checks.resolved == () and d.checks.persisted == len(snapshot.checks)


def test_the_diff_is_deterministic_and_valid(minimal, snapshot):
    def mutate(d: dict) -> None:
        interface(d, CORE_1, "Ethernet1/1")["oper_status"] = "down"
        interface(d, CORE_2, "Ethernet1/1")["oper_status"] = "down"
        next(s for s in d["system"] if s["hostname"] == CORE_2)["uptime_seconds"] = 50

    after = run(variant(later(minimal), mutate))
    first, second = diff(snapshot, after), diff(snapshot, after)
    assert canonical_json(first) == canonical_json(second)
    assert validate_diff_dict(first.model_dump(mode="json")).ok
    assert first.summary.events.rebooted == 1 and first.summary.links.changed == 1


# ---------------------------------------------------------------- après la revue (2026-10-04)


def test_a_rebooted_node_explains_the_flaps_of_its_own_ports(minimal, snapshot):
    """M2 : après un redémarrage, tout port monté au démarrage a un âge plus court que la fenêtre ; ce n'est pas un
    flap, c'est le redémarrage. Un flap sur un autre nœud reste un flap."""

    def mutate(d: dict) -> None:
        next(s for s in d["system"] if s["hostname"] == CORE_1)["uptime_seconds"] = 300
        for itf in d["interfaces"]:
            if itf["hostname"] == CORE_1 and isinstance(itf["last_change_age_seconds"], int):
                itf["last_change_age_seconds"] = 290
        interface(d, CORE_2, "Ethernet1/1")["last_change_age_seconds"] = 10

    d = diff(snapshot, run(variant(later(minimal), mutate)))
    assert [e.ref.hostname for e in d.events if e.kind == "rebooted"] == [CORE_1]
    flapped = [(e.ref.hostname, e.ref.name) for e in d.events if e.kind == "flapped"]
    assert flapped == [(CORE_2, "Ethernet1/1")], "aucun flap sur le nœud redémarré, celui de l'autre cœur reste"
    assert d.summary.events.flapped == 1 and validate_diff_dict(d.model_dump(mode="json")).ok


def test_identity_is_byte_exact_a_hostname_recased_is_removed_then_added(minimal, snapshot):
    """Q5 (`docs/07` §7, à trancher) : le snapshot compare l'unicité sans la casse, B3 apparie à l'octet. Ce test fige
    le comportement courant pour qu'il soit visible, pas pour le défendre."""
    renamed = json_replace(later(minimal), CORE_2, CORE_2.upper())
    d = diff(snapshot, run(renamed))
    assert CORE_2 in {n.hostname for n in d.nodes.removed} and CORE_2.upper() in {n.hostname for n in d.nodes.added}
    assert node_change(d, CORE_2) is None and node_change(d, CORE_2.upper()) is None
    assert d.summary.interfaces.removed == d.summary.interfaces.added > 0, "toutes ses interfaces, deux fois"
    assert validate_diff_dict(d.model_dump(mode="json")).ok


def json_replace(doc: dict, old: str, new: str) -> dict:
    import json

    return json.loads(json.dumps(doc).replace(old, new))
