"""B3 contre l'oracle du générateur : une sorte de mutation par run, chaque sorte se lit dans le diff comme
`docs/07` §6 l'annonce. Le manifeste dit qui a été touché ; le diff doit le dire aussi, et pas autre chose."""

from datetime import UTC, datetime
from functools import cache

import pytest
from ld_contracts.diff import Diff
from ld_contracts.diff.serialize import canonical_json
from ld_contracts.synth import MUTATION_KINDS, GenerationSpec, generate_series
from ld_contracts.validate import validate_diff_dict

from ld_backend.diff import diff
from tests.diff.conftest import (
    WEEK,
    codes,
    ends,
    hostnames,
    itf_change,
    link_change,
    link_with,
    node_change,
    paths,
    run,
    sections_empty,
)

START = datetime(2026, 1, 5, 2, tzinfo=UTC)
DEVICES = 12


@cache
def series_for(kind: str | None):
    scenario = (kind,) if kind else ()
    spec = GenerationSpec(seed="b3", devices=DEVICES, runs=2, scenario=scenario, mutations_per_run=0, start=START)
    return generate_series(spec)


@cache
def diff_for(kind: str | None) -> Diff:
    series = series_for(kind)
    return diff(run(series.bundles[0]), run(series.bundles[1]))


def mutation(kind: str) -> dict:
    (found,) = series_for(kind).manifest["runs"][1]["mutations"]
    assert found["kind"] == kind
    return found


def test_no_mutation_changes_nothing_but_the_volatile_fields():
    d = diff_for(None)
    assert sections_empty(d) and d.events == () and d.coverage.changed == ()
    assert d.checks.appeared == () and d.checks.resolved == ()
    assert d.checks.persisted == len(run(series_for(None).bundles[0]).checks) > 0
    assert d.summary.volatile_changes > 0 and d.elapsed_seconds == WEEK


@pytest.mark.parametrize("kind", MUTATION_KINDS)
def test_every_kind_gives_a_valid_deterministic_diff(kind):
    d = diff_for(kind)
    assert validate_diff_dict(d.model_dump(mode="json")).ok
    series = series_for(kind)
    again = diff(run(series.bundles[0]), run(series.bundles[1]))
    assert canonical_json(again) == canonical_json(d)
    assert d.elapsed_seconds == WEEK


def test_device_added():
    m, d = mutation("device_added"), diff_for("device_added")
    subject = m["subject"]
    cores = {core for core, _ in m["details"]["uplinks"]}
    assert subject in hostnames(d.nodes.added) and d.nodes.removed == ()
    assert subject in hostnames(d.interfaces.added) and hostnames(d.interfaces.added) <= {subject, *cores}
    assert all(i.name.startswith("port-channel") for i in d.interfaces.added if i.hostname in cores), "les Po des cœurs"
    assert d.interfaces.removed == ()
    assert len(d.links.added) >= 2 and all(subject in {e[0] for e in ends(link)} for link in d.links.added)
    for core, port in m["details"]["uplinks"]:
        assert any((core, port) in ends(link) for link in d.links.added), (core, port)
        fields = paths(itf_change(d, core, port))
        assert fields["oper_status"].after == "up" and fields["aggregate"].before is None, (
            "port de réserve mis en service"
        )
    assert d.summary.aggregates.added >= 1 and d.summary.mlag_domains.added >= 1


def test_device_removed():
    """Le switch retiré survit en stub : la description des ports de cœur, périmée, le cite encore (câbles
    documentés seuls, `documented_not_observed`). Le diff montre la description à nettoyer, il n'invente rien."""
    m, d = mutation("device_removed"), diff_for("device_removed")
    subject = m["subject"]
    kind = paths(node_change(d, subject))["kind"]
    assert kind.before == "device" and kind.after == "stub"
    assert d.nodes.added == () and all(node.kind == "stub" for node in d.nodes.removed), "ses stubs partent avec lui"
    assert subject in hostnames(d.interfaces.removed)
    assert all(i.name.startswith("port-channel") for i in d.interfaces.removed if i.hostname != subject), "Po des cœurs"
    core_ports = {tuple(p) for p in m["details"]["core_ports"]}
    uplinks = [c for c in d.links.changed if ends(c.ref) & core_ports]
    assert len(uplinks) == 2 and all(paths(c)["status"].after == "documented_only" for c in uplinks)
    for core, port in core_ports:
        fields = paths(itf_change(d, core, port))
        assert fields["oper_status"].before == "up" and fields["oper_status"].after == "down"
    assert "documented_not_observed" in codes(d.checks.appeared)


def test_device_unreachable():
    m, d = mutation("device_unreachable"), diff_for("device_unreachable")
    subject = m["subject"]
    fields = paths(node_change(d, subject))
    assert fields["collection"].before == "success" and fields["collection"].after == "unreachable"
    assert hostnames(d.interfaces.removed) == {subject}, "ses interfaces disparaissent : non collectées"
    assert all(node.kind == "stub" for node in d.nodes.removed)
    assert any(c.ref.hostname == subject for c in d.coverage.changed)
    assert "device_unreachable" in codes(d.checks.appeared)


def test_topic_failed():
    m, d = mutation("topic_failed"), diff_for("topic_failed")
    subject, topic = m["subject"], m["details"]["topic"]
    coverage = next(c for c in d.coverage.changed if c.ref.hostname == subject)
    assert paths(coverage)[f"topics.{topic}"].after == "failed" and paths(coverage)["status"].after == "partial"
    assert "device_partial_collection" in codes(d.checks.appeared)


def test_cable_moved():
    m, d = mutation("cable_moved"), diff_for("cable_moved")
    det = m["details"]
    access = (m["subject"], det["access_port"])
    assert link_with(d.links.added, (det["core"], det["to"]), access) is not None
    assert link_with(d.links.removed, (det["core"], det["from"]), access) is not None
    assert paths(itf_change(d, det["core"], det["from"]))["oper_status"].after == "down"
    assert paths(itf_change(d, det["core"], det["to"]))["oper_status"].after == "up"


def test_cable_down():
    m, d = mutation("cable_down"), diff_for("cable_down")
    a, b = tuple(m["details"]["a"]), tuple(m["details"]["b"])
    change = link_change(d, a, b)
    assert change is not None and paths(change)["oper"].after == "down"
    for host, name in (a, b):
        assert paths(itf_change(d, host, name))["oper_status"].after == "down"
    assert "link_down" in codes(d.checks.appeared)
    assert not any(e.kind == "flapped" and (e.ref.hostname, e.ref.name) in (a, b) for e in d.events)


def test_description_changed():
    m, d = mutation("description_changed"), diff_for("description_changed")
    fields = paths(itf_change(d, m["subject"], m["details"]["port"]))
    assert fields["description"].before == m["details"]["before"]
    assert fields["description"].after == m["details"]["after"]
    assert any(path.startswith("description_parsed") for path in fields)
    assert "description_disagrees_with_observed" in codes(d.checks.appeared)


def test_ha_failover():
    d = diff_for("ha_failover")
    (change,) = d.ha_clusters.changed
    assert "members" in paths(change)
    assert d.links.added == () and d.links.removed == () and d.nodes.added == () and d.nodes.removed == ()


def test_ha_member_down():
    m, d = mutation("ha_member_down"), diff_for("ha_member_down")
    member = m["details"]["member"]
    assert "ha_member_down" in codes(d.checks.appeared)
    (change,) = d.ha_clusters.changed
    assert "members" in paths(change)
    assert hostnames(d.interfaces.removed) == {member}, "le membre mort n'est pas collecté pour la run"
    assert paths(node_change(d, member))["collection"].after == "unreachable"


def test_aggregate_member_suspended():
    m, d = mutation("aggregate_member_suspended"), diff_for("aggregate_member_suspended")
    device, det = m["subject"], m["details"]
    fields = paths(itf_change(d, device, det["member"]))
    assert fields["oper_status"].after == "down" and fields["oper_reason"].after == "suspended by LACP"
    assert fields["aggregate.member_status"].after == "suspended"
    aggregate = next(c for c in d.aggregates.changed if (c.ref.hostname, c.ref.name) == (device, det["aggregate"]))
    assert "members" in paths(aggregate)


def test_speed_degraded():
    m, d = mutation("speed_degraded"), diff_for("speed_degraded")
    a, b = tuple(m["details"]["a"]), tuple(m["details"]["b"])
    assert paths(itf_change(d, *a))["speed_mbps"].after == m["details"]["speed_mbps"]
    assert "link_speed_mismatch" in codes(d.checks.appeared)
    flapped = {(e.ref.hostname, e.ref.name) for e in d.events if e.kind == "flapped"}
    assert {a, b} <= flapped, "les deux bouts ont bougé dans la fenêtre sans changer d'état"


def test_stub_added():
    m, d = mutation("stub_added"), diff_for("stub_added")
    stub, (host, port) = m["subject"], m["details"]["port"]
    added = next(node for node in d.nodes.added if node.hostname == stub)
    assert added.kind == "stub"
    assert any(stub in {e[0] for e in ends(link)} for link in d.links.added)
    assert paths(itf_change(d, host, port))["oper_status"].after == "up"


def test_stub_removed():
    m, d = mutation("stub_removed"), diff_for("stub_removed")
    stub, (host, port) = m["subject"], m["details"]["port"]
    gone = any(stub in {e[0] for e in ends(link)} for link in d.links.removed)
    weakened = any(stub in {e[0] for e in ends(c.ref)} and "status" in paths(c) for c in d.links.changed)
    assert gone or weakened
    assert paths(itf_change(d, host, port))["oper_status"].after == "down"


def test_reboot():
    """`docs/07` §6 : un événement `rebooted` sur le nœud, rien d'autre que du volatil ; ses ports montés au démarrage
    ne sont pas des flaps (revue, M2)."""
    m, d = mutation("reboot"), diff_for("reboot")
    subject = m["subject"]
    assert [e.ref.hostname for e in d.events if e.kind == "rebooted"] == [subject]
    assert [e for e in d.events if e.kind == "flapped"] == [], "le redémarrage explique ses ports"
    assert node_change(d, subject) is None and d.nodes.added == () and d.nodes.removed == ()
    assert sections_empty(d) and d.summary.volatile_changes >= 1
