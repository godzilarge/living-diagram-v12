"""La projection du monde en bundle : valide à zéro constat, et fidèle à ce que chaque source verrait."""

import pytest

from ld_contracts.synth import GenerationSpec, build_world, emit_bundle
from tests.synth.conftest import START, assert_strictly_valid


def _docs(bundle, topic, hostname):
    return [d for d in bundle[topic] if d["hostname"] == hostname]


@pytest.mark.parametrize("devices", [6, 40])
def test_bundle_is_strictly_valid(devices):
    spec = GenerationSpec(seed="v", devices=devices, start=START)
    assert_strictly_valid(emit_bundle(build_world(spec), spec, run_index=0))


def test_envelope(small_bundle, small_spec):
    assert small_bundle["contract_version"] == "1.0.0"
    assert small_bundle["infrastructure"] == small_spec.infrastructure
    assert small_bundle["residual_normalizations"] == {}
    assert small_bundle["run"]["status"] == "completed"
    assert small_bundle["run"]["start_datetime"] == "2026-01-05T02:00:00Z"
    assert len(small_bundle["run"]["collector_run_id"]) == 24


def test_firewalls_have_no_lldp_nor_cdp_subject(small_bundle):
    fw_tasks = [t for t in small_bundle["tasks"] if "-fw-" in t["hostname"]]
    assert fw_tasks
    for task in fw_tasks:
        assert set(task["status_per_subject"]) == {"interfaces", "aggregates", "ha", "system"}
        assert task["status"] == "success"
    assert not [d for d in small_bundle["lldp"] if "-fw-" in d["hostname"]]


def test_cisco_cable_is_seen_from_both_ends(small_world, small_bundle):
    core = f"{small_world.sites[0]}-core-01"
    access = sorted(d.hostname for d in small_world.devices if d.role == "access")[0]
    from_core = [d for d in _docs(small_bundle, "lldp", core) if d["neighbor"] == access]
    from_access = [d for d in _docs(small_bundle, "lldp", access) if d["neighbor"] == core]
    assert len(from_core) == 1 and len(from_access) == 1
    assert from_core[0]["neighbor_interface"].startswith("Te"), "IOS-XE annonce la forme courte en LLDP"
    assert from_access[0]["neighbor_interface"].startswith("Ethernet"), "NX-OS annonce la forme longue"
    cdp_from_core = [d for d in _docs(small_bundle, "cdp", core) if d["neighbor"] == access]
    assert cdp_from_core[0]["neighbor_interface"].startswith("TenGigabitEthernet"), "CDP : forme longue"


def test_firewall_cable_is_documented_only(small_world, small_bundle):
    site = small_world.sites[0]
    core_ports = [
        i
        for i in _docs(small_bundle, "interfaces", f"{site}-core-01")
        if i["type"] == "physical" and f"{site}-fw-" in (i["description"] or "")
    ]
    assert len(core_ports) == 2
    for port in core_ports:
        assert not [
            d
            for d in small_bundle["lldp"]
            if d["local_interface"] == port["name"] and d["hostname"] == port["hostname"]
        ]


def test_firewall_descriptions_use_the_positional_ha_form(small_world, small_bundle):
    site = small_world.sites[0]
    x1 = {i["name"]: i for i in _docs(small_bundle, "interfaces", f"{site}-fw-01")}["x1"]
    fields = x1["description"].split("|")
    assert len(fields) == 5
    assert fields[1] == fields[3] == f"{site}-core-01"
    x1_second = {i["name"]: i for i in _docs(small_bundle, "interfaces", f"{site}-fw-02")}["x1"]
    assert x1_second["description"] == x1["description"], "configuration partagée : même texte sur les deux membres"


def test_ha_documents_list_both_members_in_priority_order(small_world, small_bundle):
    site = small_world.sites[0]
    docs = {d["hostname"]: d for d in small_bundle["ha"]}
    assert set(docs) == {f"{site}-fw-01", f"{site}-fw-02"}
    members = docs[f"{site}-fw-01"]["members"]
    assert [m["role"] for m in members] == ["primary", "secondary"]
    assert members[0]["priority"] > members[1]["priority"]
    assert docs[f"{site}-fw-01"]["heartbeat_interfaces"] == ["ha1"]


def test_stubs_are_announced_but_not_in_devices(small_world, small_bundle):
    hostnames = {d["hostname"] for d in small_bundle["devices"]}
    for stub in small_world.stubs:
        assert stub.name not in hostnames
        seen = [d for d in small_bundle["lldp"] if d["neighbor"] == stub.name]
        assert len(seen) == 1
        assert seen[0]["neighbor_capabilities"] == list(stub.capabilities)


def test_peer_link_and_vpc_aggregates(small_world, small_bundle):
    site = small_world.sites[0]
    aggs = {a["name"]: a for a in _docs(small_bundle, "aggregates", f"{site}-core-01")}
    assert aggs["port-channel10"]["mlag_peer_link"] is True and aggs["port-channel10"]["mlag_id"] is None
    legs = [a for a in aggs.values() if a["mlag_id"] is not None]
    assert legs and all(a["mlag_peer_link"] is False for a in legs)
    assert len({a["mlag_id"] for a in legs}) == len(legs)


def test_stack_members_show_in_system(two_sites_world):
    spec = GenerationSpec(seed="two", devices=30, start=START)
    bundle = emit_bundle(two_sites_world, spec, run_index=0)
    stacked = [d for d in two_sites_world.devices if d.stack_size > 1]
    assert stacked, "la graine « two » produit au moins un stack"
    system = {s["hostname"]: s for s in bundle["system"]}
    for device in stacked:
        members = system[device.hostname]["chassis_members"]
        assert len(members) == device.stack_size
        assert [m["slot"] for m in members] == list(range(1, device.stack_size + 1))


def test_every_in_scope_device_has_a_task_and_interfaces(small_world, small_bundle):
    in_scope = {d.hostname for d in small_world.devices if d.infrastructure == small_world.infrastructure}
    assert {t["hostname"] for t in small_bundle["tasks"]} == in_scope
    assert {i["hostname"] for i in small_bundle["interfaces"]} == in_scope


def test_unused_ports_are_down_since_boot_and_without_description(small_bundle):
    unused = [i for i in small_bundle["interfaces"] if i["oper_status"] == "down" and i["description"] is None]
    assert unused
    assert all(i["speed_mbps"] is None and i["duplex"] is None for i in unused)
    assert all(i["last_change_age_seconds"] == "never" for i in unused if i["type"] == "physical"), (
        "RFC 2863 : jamais monté"
    )
    sfp_cages = [i for i in unused if i["name"].startswith(("Ethernet1/", "TenGigabitEthernet"))]
    assert sfp_cages and all(i["media"] is None for i in sfp_cages), "sans optique, pas de média"
    copper = [i for i in unused if i["name"].startswith("GigabitEthernet") and i["name"] != "GigabitEthernet0/0"]
    assert copper and all(i["media"] == "1000base-T" for i in copper)


def test_up_ports_carry_a_dated_change(small_bundle):
    up = [i for i in small_bundle["interfaces"] if i["oper_status"] == "up" and i["type"] == "physical"]
    assert up and all(isinstance(i["last_change_age_seconds"], int) for i in up)


def test_every_collected_device_is_reachable_by_management(small_world, small_bundle):
    for device in small_world.in_scope():
        mgmt = [i for i in _docs(small_bundle, "interfaces", device.hostname) if i["type"] == "management"]
        assert len(mgmt) == 1 and mgmt[0]["ip_addresses"], device.hostname
    ips = [i["ip_addresses"][0]["address"] for i in small_bundle["interfaces"] if i["type"] == "management"]
    assert len(ips) == len(set(ips))


def test_trunk_vlans_follow_the_role(small_world, small_bundle):
    site = small_world.sites[0]
    core = {i["name"]: i for i in _docs(small_bundle, "interfaces", f"{site}-core-01")}
    assert core["Ethernet1/49"]["allowed_vlans"] == [{"first": 1, "last": 4094}], "le peer-link porte tout"
    assert {r["first"] for r in core["Ethernet1/41"]["allowed_vlans"]} >= {400}, (
        "le trunk du firewall porte son VLAN de transit"
    )
    assert core["Ethernet1/1"]["allowed_vlans"] == [
        {"first": 10, "last": 20},
        {"first": 100, "last": 100},
        {"first": 200, "last": 210},
    ]


def test_emission_is_a_pure_function(small_world, small_spec):
    first = emit_bundle(small_world, small_spec, run_index=0)
    second = emit_bundle(small_world, small_spec, run_index=0)
    assert first == second
    later = emit_bundle(small_world, small_spec, run_index=3)
    assert later["run"]["start_datetime"] > first["run"]["start_datetime"]
    assert later["run"]["collector_run_id"] != first["run"]["collector_run_id"]
