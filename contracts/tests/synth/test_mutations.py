"""Chaque mutation du catalogue garde le bundle valide à zéro constat et produit l'effet qu'elle annonce."""

import random

import pytest

from ld_contracts.synth import (
    MUTATION_KINDS,
    GenerationSpec,
    NotApplicableError,
    apply_mutation,
    build_world,
    check_world,
    emit_bundle,
)
from ld_contracts.synth.world import with_stubs
from tests.synth.conftest import START, assert_strictly_valid

SPEC = GenerationSpec(seed="mut", devices=14, runs=2, start=START)


@pytest.fixture
def world():
    return build_world(SPEC)


def _apply(world, kind, seed="m"):
    return apply_mutation(kind, world, random.Random(seed), run_index=1)


def _docs(bundle, topic, hostname):
    return [d for d in bundle[topic] if d["hostname"] == hostname]


@pytest.mark.parametrize("kind", MUTATION_KINDS)
@pytest.mark.parametrize("seed", ["m", "n", "o"])
def test_every_kind_keeps_world_and_bundle_coherent(world, kind, seed):
    """Trois graines par sorte : trois sujets différents. Le monde garde ses invariants, le bundle zéro constat."""
    mutated, record = _apply(world, kind, seed)
    assert record.kind == kind and record.subject
    assert mutated != world
    assert check_world(mutated) == []
    assert_strictly_valid(emit_bundle(mutated, SPEC, run_index=1))


def test_device_removed_leaves_a_stale_description(world):
    mutated, record = _apply(world, "device_removed")
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    assert record.subject not in {d["hostname"] for d in bundle["devices"]}
    stale = [i for i in bundle["interfaces"] if (i["description"] or "").split("|")[1:2] == [record.subject]]
    assert stale and all(i["oper_status"] == "down" for i in stale)
    assert not [d for d in bundle["lldp"] if d["neighbor"] == record.subject]


def test_device_added_is_dual_homed_and_observed(world):
    mutated, record = _apply(world, "device_added")
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    assert record.subject in {d["hostname"] for d in bundle["devices"]}
    uplinks = [d for d in bundle["lldp"] if d["neighbor"] == record.subject]
    assert sorted(d["hostname"][-7:] for d in uplinks) == ["core-01", "core-02"]


def test_device_unreachable_has_an_empty_task_and_no_document(world):
    mutated, record = _apply(world, "device_unreachable")
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    task = next(t for t in bundle["tasks"] if t["hostname"] == record.subject)
    assert task["status"] == "unreachable" and task["status_per_subject"] == {} and task["error"]
    for topic in ("interfaces", "lldp", "cdp", "aggregates", "system", "ha"):
        assert not _docs(bundle, topic, record.subject)


def test_topic_failed_is_partial_without_documents(world):
    mutated, record = _apply(world, "topic_failed")
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    topic = record.details["topic"]
    task = next(t for t in bundle["tasks"] if t["hostname"] == record.subject)
    assert task["status"] == "partial"
    assert task["status_per_subject"][topic]["status"] == "failed"
    assert task["status_per_subject"][topic]["error"]
    assert not _docs(bundle, topic, record.subject)
    assert _docs(bundle, "interfaces", record.subject), "interfaces n'échoue jamais seul : le reste serait orphelin"


def test_cable_moved_follows_in_lldp_but_not_in_descriptions(world):
    mutated, record = _apply(world, "cable_moved")
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    core, old, new = record.details["core"], record.details["from"], record.details["to"]
    seen = {d["local_interface"] for d in _docs(bundle, "lldp", core) if d["neighbor"] == record.subject}
    assert seen == {new}
    ports = {i["name"]: i for i in _docs(bundle, "interfaces", core)}
    assert ports[old]["oper_status"] == "down" and record.subject in ports[old]["description"]
    assert ports[new]["oper_status"] == "up" and ports[new]["description"] is None
    legs = [a for a in _docs(bundle, "aggregates", core) if new in {m["name"] for m in a["members"]}]
    assert len(legs) == 1


def test_cable_down_removes_observations_and_keeps_descriptions(world):
    mutated, record = _apply(world, "cable_down")
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    (host_a, port_a), (host_b, port_b) = record.details["a"], record.details["b"]
    for host, port in ((host_a, port_a), (host_b, port_b)):
        docs = {i["name"]: i for i in _docs(bundle, "interfaces", host)}
        assert docs[port]["oper_status"] == "down" and docs[port]["description"] is not None
        assert docs[port]["last_change_age_seconds"] != "never", "tombé pendant la run : daté, pas « never »"
        assert not [d for d in _docs(bundle, "lldp", host) if d["local_interface"] == port]


@pytest.mark.parametrize("seed", ["a", "b", "c", "d", "e", "f"])
def test_description_changed_targets_an_observed_cable(world, seed):
    """La sorte promet un désaccord avec l'observé : le port est vu en LLDP, jamais un port face à un firewall."""
    mutated, record = _apply(world, "description_changed", seed)
    ref = (record.subject, record.details["port"])
    port = mutated.port_index[ref]
    assert port.description == record.details["after"] != record.details["before"]
    other = mutated.cables_by_port[ref].other(ref)
    assert other[1] not in port.description
    assert "-fw-" not in other[0]
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    assert [d for d in _docs(bundle, "lldp", record.subject) if d["local_interface"] == record.details["port"]]


def test_ha_failover_swaps_roles_not_priorities(world):
    mutated, record = _apply(world, "ha_failover")
    before = next(c for c in world.clusters if c.name == record.subject)
    after = next(c for c in mutated.clusters if c.name == record.subject)
    assert after.priorities == before.priorities and after.members == before.members
    assert after.roles == ("secondary", "primary")
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    doc = next(d for d in bundle["ha"] if d["hostname"] == before.members[0])
    assert [m["role"] for m in doc["members"]] == ["secondary", "primary"]


@pytest.mark.parametrize("seed", ["a", "b", "c", "d"])
def test_ha_member_down_takes_its_cables_down_for_the_run(world, seed):
    """Un châssis mort : injoignable, vu down par le survivant, ses câbles tombés chez les cœurs et sur le heartbeat ;
    le monde durable ne change pas (la run suivante le retrouve up)."""
    mutated, record = _apply(world, "ha_member_down", seed)
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    dead = record.details["member"]
    assert next(t for t in bundle["tasks"] if t["hostname"] == dead)["status"] == "unreachable"
    survivor = next(d for d in bundle["ha"] if d["hostname"] != dead)
    assert {m["name"]: m["state"] for m in survivor["members"]}[dead] == "down"
    peers = [
        mutated.cables_by_port[(p.device, p.name)].other((p.device, p.name))
        for p in mutated.ports_by_device[dead]
        if (p.device, p.name) in mutated.cables_by_port
    ]
    assert len(peers) == 3, "x1, x2 et ha1"
    for host, port in peers:
        doc = {i["name"]: i for i in _docs(bundle, "interfaces", host)}[port]
        assert doc["oper_status"] == "down", (host, port)
    assert all(mutated.port_index[ref].state == "up" for ref in peers), "le monde durable garde les câbles montés"


def test_ha_member_down_can_kill_either_member(world):
    killed = {_apply(world, "ha_member_down", seed)[1].details["role"] for seed in "abcdefgh"}
    assert killed == {"primary", "secondary"}


def test_aggregate_member_suspended_is_still_observed(world):
    mutated, record = _apply(world, "aggregate_member_suspended")
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    host, port = record.subject, record.details["member"]
    itf = {i["name"]: i for i in _docs(bundle, "interfaces", host)}[port]
    assert itf["oper_status"] == "down" and "LACP" in itf["oper_reason"]
    agg = next(a for a in _docs(bundle, "aggregates", host) if a["name"] == record.details["aggregate"])
    assert {m["name"]: m["status"] for m in agg["members"]}[port] == "suspended"
    assert [d for d in _docs(bundle, "lldp", host) if d["local_interface"] == port]


def test_speed_degraded_differs_between_the_two_ends(world):
    mutated, record = _apply(world, "speed_degraded")
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    (host_a, port_a), (host_b, port_b) = record.details["a"], record.details["b"]
    doc_a = {i["name"]: i for i in _docs(bundle, "interfaces", host_a)}[port_a]
    doc_b = {i["name"]: i for i in _docs(bundle, "interfaces", host_b)}[port_b]
    assert doc_a["speed_mbps"] != doc_b["speed_mbps"] and None not in (doc_a["speed_mbps"], doc_b["speed_mbps"])
    assert doc_a["last_change_age_seconds"] == doc_b["last_change_age_seconds"], "les deux bouts ont flappé ensemble"


def test_stub_added_then_the_same_stub_removed(world):
    added, record = _apply(world, "stub_added")
    bundle = emit_bundle(added, SPEC, run_index=1)
    assert [d for d in bundle["lldp"] if d["neighbor"] == record.subject]
    alone = with_stubs(added, remove=[s.name for s in added.stubs if s.name != record.subject])
    removed, gone = apply_mutation("stub_removed", alone, random.Random("x"), run_index=1)
    assert gone.subject == record.subject and gone.details["port"] == record.details["port"]
    bundle = emit_bundle(removed, SPEC, run_index=1)
    assert not [d for d in bundle["lldp"] if d["neighbor"] == gone.subject]
    host, port = gone.details["port"]
    itf = {i["name"]: i for i in _docs(bundle, "interfaces", host)}[port]
    assert itf["oper_status"] == "down" and itf["description"] is not None


def test_removed_stubs_never_give_their_name_or_mac_back(world):
    """Un stub retiré (seul ou avec son switch) ne rend ni son numéro, ni son nom, ni sa MAC."""
    current = world
    rng = random.Random("churn")
    for _ in range(4):
        current, _rec = apply_mutation("stub_removed", current, rng, run_index=1)
    current, _rec = apply_mutation("device_removed", current, rng, run_index=1)
    for _ in range(8):
        current, _rec = apply_mutation("stub_added", current, rng, run_index=1)
    names = [s.name for s in current.stubs]
    macs = [s.port_id for s in current.stubs if ":" in s.port_id]
    assert len(names) == len(set(names)) and len(macs) == len(set(macs))
    assert check_world(current) == []
    assert not (set(names) & {s.name for s in world.stubs} - {s.name for s in current.stubs if s in world.stubs})


def test_reboot_resets_uptime_and_ages(world):
    mutated, record = _apply(world, "reboot")
    bundle = emit_bundle(mutated, SPEC, run_index=1)
    system = {s["hostname"]: s for s in bundle["system"]}
    uptime = system[record.subject]["uptime_seconds"]
    assert uptime < 86400
    assert min(s["uptime_seconds"] for h, s in system.items() if h != record.subject) > 86400
    docs = _docs(bundle, "interfaces", record.subject)
    assert all(
        d["last_change_age_seconds"] == "never" for d in docs if d["oper_status"] == "down" and d["type"] == "physical"
    )
    assert all(d["last_change_age_seconds"] <= uptime for d in docs if d["last_change_age_seconds"] != "never")
    later = emit_bundle(mutated, SPEC, run_index=3)
    assert {s["hostname"]: s for s in later["system"]}[record.subject]["uptime_seconds"] == uptime + 2 * 7 * 86400


def test_not_applicable_is_explicit():
    tiny = build_world(GenerationSpec(seed="t", devices=6, start=START))
    stripped = tiny
    for _ in range(len(tiny.stubs)):
        stripped, _rec = apply_mutation("stub_removed", stripped, random.Random("r"), run_index=1)
    with pytest.raises(NotApplicableError):
        apply_mutation("stub_removed", stripped, random.Random("r"), run_index=1)
