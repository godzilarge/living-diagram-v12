"""Points de la contre-revue du 2026-09-20 (`docs/revues/2026-09-20-b1-etape-1-contre-revue.md`)."""

import copy
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from tests.correlate.conftest import checks, find_link, interface, lldp_doc, node, run, task_subject, variant
from tests.correlate.test_review import _ring

BACKEND = Path(__file__).resolve().parents[2]


def test_c1_a_local_port_under_two_equivalent_spellings_is_one_endpoint(minimal):
    """`Eth1/5` dans lldp, `Ethernet1/5` dans interfaces : le contrat d'entrée l'accepte (constat), B1 aussi."""

    def mutate(d):
        d["lldp"].append(lldp_doc("sw-core-01", "Eth1/5", "srv-a", "eth0", ("station",)))
        d["cdp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0", ("host",)))
        interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C3|srv-a|eth0|"

    link = find_link(run(variant(minimal, mutate)), ("sw-core-01", "Ethernet1/5"), ("srv-a", "eth0"))
    assert link.status == "confirmed" and [e.source for e in link.evidence] == ["cdp", "description", "lldp"]
    assert {e.witness.interface for e in link.evidence} == {"Ethernet1/5"}  # le nom connu, pas le plus petit


def test_c1_two_documents_differing_only_by_the_local_spelling_are_one_evidence(minimal):
    def mutate(d):
        d["lldp"].append(lldp_doc("sw-core-01", "Eth1/5", "srv-a", "eth0", ("station",)))
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0", ("station",)))

    link = find_link(run(variant(minimal, mutate)), ("sw-core-01", "Ethernet1/5"), ("srv-a", "eth0"))
    assert [e.source for e in link.evidence] == ["lldp"]


def test_c1_two_spellings_of_a_port_that_no_interface_carries(minimal):
    def mutate(d):
        d["lldp"].append(lldp_doc("sw-core-01", "Mgmt0", "srv-a", "eth0", ("station",)))
        d["cdp"].append(lldp_doc("sw-core-01", "mgmt0", "srv-a", "eth0", ("host",)))

    snap = run(variant(minimal, mutate))
    found = [link for link in snap.links if "srv-a" in (link.a.hostname, link.b.hostname)]
    assert len(found) == 1 and found[0].status == "observed_only"


def _two_aliases(minimal: dict) -> dict:
    def mutate(d):
        d["aggregates"] = [a for a in d["aggregates"] if a["hostname"] != "sw-core-01"]
        subjects = next(t for t in d["tasks"] if t["hostname"] == "sw-core-01")["status_per_subject"]
        subjects.pop("aggregates", None)
        task_subject(d, "sw-core-01", "port_channels", "success")
        task_subject(d, "sw-core-01", "etherchannels", "failed")

    return variant(minimal, mutate)


def test_h1_two_aliases_of_one_topic_are_read_in_a_written_order(minimal):
    """Nom canonique d'abord, puis les alias par ordre alphabétique : `etherchannels` (failed) avant `port_channels`."""
    snap = run(_two_aliases(minimal))
    assert next(c for c in snap.coverage if c.hostname == "sw-core-01").topics.aggregates == "failed"
    both = variant(_two_aliases(minimal), lambda d: task_subject(d, "sw-core-01", "aggregates", "success"))
    assert next(c for c in run(both).coverage if c.hostname == "sw-core-01").topics.aggregates == "success"


def _fortigate_aggregate(d: dict) -> None:
    """R1-bis : rang 1 ambigu (x1 et x2 observent le même port), rang 3 ambigu (deux membres citent sw-core-02)."""
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/3", "fw-edge-01", "agg-core", ("router",)))
    d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "fw-edge-01", "agg-core", ("router",)))
    d["lldp"].append(lldp_doc("fw-edge-01", "x1", "sw-core-01", "Ethernet1/3"))
    d["lldp"].append(lldp_doc("fw-edge-01", "x2", "sw-core-01", "Ethernet1/3"))
    task_subject(d, "fw-edge-01", "lldp", "success")
    interface(d, "sw-core-02", "Ethernet1/4")["description"] = None
    interface(d, "fw-edge-01", "x1")["description"] = "C2|sw-core-02|Ethernet1/4|"
    interface(d, "fw-edge-01", "x2")["description"] = "C2|sw-core-02|Ethernet1/4|"


@pytest.mark.parametrize("mutate", [_two_aliases, lambda d: variant(d, _fortigate_aggregate)], ids=["aliases", "r1bis"])
def test_h1_same_bytes_whatever_the_hash_seed(minimal, tmp_path, mutate):
    """Le seul non-déterminisme qu'une permutation ne voit pas : l'ordre d'itération d'un ensemble, par processus."""
    bundle = tmp_path / "bundle.json"
    bundle.write_text(json.dumps(mutate(minimal)), encoding="utf-8")
    script = (
        "import json,sys;from ld_contracts.bundle import RunBundle;"
        "from ld_contracts.snapshot.serialize import canonical_json;from ld_backend.correlate import correlate;"
        "b=RunBundle.model_validate(json.load(open(sys.argv[1])));sys.stdout.write(canonical_json(correlate(b,'0'*64)))"
    )
    digests = set()
    for seed in ("0", "2", "5"):
        out = subprocess.run(
            [sys.executable, "-c", script, str(bundle)],
            capture_output=True,
            check=True,
            cwd=BACKEND,
            env={**os.environ, "PYTHONHASHSEED": seed},
        ).stdout
        digests.add(hashlib.sha256(out).hexdigest())
    assert len(digests) == 1


def _with_device(minimal: dict, hostname: str, infrastructure: str | None = None) -> dict:
    def mutate(d):
        device = {**d["devices"][0], "hostname": hostname, "serial_number": None}
        if infrastructure is not None:
            device["infrastructure"] = infrastructure
        else:
            d["tasks"].append({**copy.deepcopy(d["tasks"][0]), "hostname": hostname})
        d["devices"].append(device)

    return variant(minimal, mutate)


def test_h3_a_device_inventoried_under_its_ip_is_found_by_its_name_first(minimal):
    for hostname, announced in (("10.0.0.9", "10.0.0.9"), ("2001:db8::9", "2001:DB8:0::9")):
        doc = _with_device(minimal, hostname)
        doc["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", announced, "eth0"))
        snap = run(doc)
        assert node(snap, hostname).kind == "device" and len([n for n in snap.nodes if n.hostname == hostname]) == 1
        evidence = find_link(snap, ("sw-core-01", "Ethernet1/5"), (hostname, "eth0")).evidence[0]
        assert evidence.resolution == "hostname"


def test_h3_the_same_device_in_another_infrastructure_is_external_not_stub(minimal):
    doc = _with_device(minimal, "10.0.0.9", infrastructure="infra-wan")
    doc["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "10.0.0.9", "eth0"))
    assert node(run(doc), "10.0.0.9").kind == "external"


def test_m3_a_silent_port_seen_by_two_witnesses_is_flagged(minimal):
    """`fw-edge-01/ha1` ne parle pas LLDP ; deux switches disent le voir : deux câbles sur un port, donc un contrôle."""

    def mutate(d):
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "fw-edge-01", "ha1"))
        d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/5", "fw-edge-01", "ha1"))

    found = checks(run(variant(minimal, mutate)), "multiple_observed_neighbors")
    assert len(found) == 2
    for check in found:
        port = next(r for r in check.refs if r.kind == "interface")
        assert (port.hostname, port.name) == ("fw-edge-01", "ha1")
        assert [n["hostname"] for n in check.details["neighbors"]] == ["sw-core-01", "sw-core-02"]


def test_m4_correlation_time_grows_linearly(minimal):
    """Garde la propriété, pas la cause d'hier : quatre fois plus de claims, bien moins de seize fois plus de temps."""

    def timed(devices: int) -> float:
        doc = _ring(minimal, devices=devices, ports=5)
        started = time.perf_counter()
        run(doc, "0" * 64)
        return time.perf_counter() - started

    timed(20)  # chauffe : imports, caches de schéma
    small, large = timed(100), timed(400)
    assert large / small < 9


def test_m2_the_same_ip_twice_on_an_interface_is_kept_once(minimal):
    """Le contrat d'entrée accepte le doublon exact, le contrat de sortie le refuse : B1 le retire, sans rien perdre."""

    def mutate(d):
        port = next(i for i in d["interfaces"] if i["ip_addresses"])
        port["ip_addresses"].append(copy.deepcopy(port["ip_addresses"][0]))
        mutate.key = (port["hostname"], port["name"], len(port["ip_addresses"]) - 1)

    snap = run(variant(minimal, mutate))
    hostname, name, expected = mutate.key
    found = next(i for i in snap.interfaces if (i.hostname, i.name) == (hostname, name))
    assert len(found.ip_addresses) == expected
