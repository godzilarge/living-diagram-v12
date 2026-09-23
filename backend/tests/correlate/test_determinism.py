"""Scénario 10 : même bundle ⇒ même snapshot, à l'octet, quel que soit l'ordre des documents."""

import copy
import random

from ld_contracts.snapshot import Snapshot
from ld_contracts.snapshot.serialize import canonical_json
from ld_contracts.validate import validate_snapshot_dict

from tests.correlate.conftest import interface, lldp_doc, run, variant

SHA = "0" * 64  # l'empreinte est une entrée : la même pour toutes les permutations


def test_snapshot_is_valid_against_the_output_contract(snapshot):
    report = validate_snapshot_dict(snapshot.model_dump(mode="json"))
    assert report.ok, report.errors


def _awkward(d: dict) -> None:
    """Ce que la fixture n'a pas : un hub vu des deux bouts, un port sous deux formes, une auto-observation."""
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "sw-core-02", "Ethernet1/4"))
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-c", "Gi0/1", ("station",)))
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-c", "GigabitEthernet0/1", ("station",)))
    d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "sw-core-01", "Ethernet1/5"))
    d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/5", "sw-core-02", "Ethernet1/5"))
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C1|srv-other|eth0|"


def _fortigate_aggregate(d: dict) -> None:
    """R1-bis : un membre résolu par description, l'autre indéterminé (bout resté agrégat, description ambiguë)."""
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/3", "fw-edge-01", "agg-core", ("router",)))
    d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "fw-edge-01", "agg-core", ("router",)))
    interface(d, "sw-core-02", "Ethernet1/4")["description"] = None
    interface(d, "fw-edge-01", "x2")["description"] = "C2|sw-core-02|Ethernet1/4|"
    interface(d, "fw-edge-01", "x1")["description"] = "C2|sw-core-02|Ethernet1/4|"


def test_permuting_every_section_gives_the_same_bytes(minimal):
    for base in (minimal, variant(minimal, _awkward), variant(minimal, _fortigate_aggregate)):
        _assert_order_independent(base)


def _assert_order_independent(base: dict) -> None:
    reference = canonical_json(run(base, SHA))
    for seed in range(3):
        shuffled = copy.deepcopy(base)
        rng = random.Random(seed)
        for section in ("devices", "tasks", "interfaces", "aggregates", "lldp", "cdp", "system", "ha"):
            rng.shuffle(shuffled[section])
        assert canonical_json(run(shuffled, SHA)) == reference


def test_running_twice_gives_the_same_bytes(minimal):
    assert canonical_json(run(minimal)) == canonical_json(run(minimal))
    assert Snapshot.model_validate_json(canonical_json(run(minimal))) == run(minimal)
