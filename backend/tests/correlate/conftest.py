"""Fixtures de B1 : le bundle de référence et des variantes construites en mémoire (décision 4, 2026-09-20)."""

import copy
import json
from collections.abc import Callable
from pathlib import Path

import pytest
from ld_contracts.bundle import RunBundle
from ld_contracts.snapshot import Snapshot

from ld_backend.archive import fingerprint
from ld_backend.correlate import correlate

FIXTURES = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"


def load_minimal() -> dict:
    return json.loads((FIXTURES / "bundle-minimal.json").read_text(encoding="utf-8"))


def run(doc: dict, sha256: str | None = None) -> Snapshot:
    """L'empreinte est une entrée de B1 (celle du bundle archivé) : elle peut être imposée par le test."""
    bundle = RunBundle.model_validate(doc)
    return correlate(bundle, sha256 or fingerprint(bundle)[1])


def variant(doc: dict, mutate: Callable[[dict], None]) -> dict:
    out = copy.deepcopy(doc)
    mutate(out)
    return out


def interface(doc: dict, hostname: str, name: str) -> dict:
    return next(i for i in doc["interfaces"] if i["hostname"] == hostname and i["name"] == name)


def task_subject(doc: dict, hostname: str, topic: str, status: str) -> None:
    task = next(t for t in doc["tasks"] if t["hostname"] == hostname)
    task["status_per_subject"][topic] = {"status": status, "started_at": None, "ended_at": None, "error": None}


def lldp_doc(hostname: str, local: str, neighbor: str, port: str, caps: tuple[str, ...] = ("bridge",)) -> dict:
    return {
        "hostname": hostname,
        "local_interface": local,
        "neighbor": neighbor,
        "neighbor_interface": port,
        "neighbor_capabilities": list(caps),
        "extras": {},
    }


def find_link(snapshot: Snapshot, a: tuple[str, str], b: tuple[str, str]):
    for link in snapshot.links:
        ends = {(link.a.hostname, link.a.interface), (link.b.hostname, link.b.interface)}
        if ends == {a, b}:
            return link
    return None


def checks(snapshot: Snapshot, code: str) -> list:
    return [c for c in snapshot.checks if c.code == code]


def node(snapshot: Snapshot, hostname: str):
    return next((n for n in snapshot.nodes if n.hostname == hostname), None)


def itf(snapshot: Snapshot, hostname: str, name: str):
    return next(i for i in snapshot.interfaces if i.hostname == hostname and i.name == name)


@pytest.fixture(scope="session")
def minimal() -> dict:
    return load_minimal()


@pytest.fixture(scope="session")
def snapshot(minimal: dict) -> Snapshot:
    return run(minimal)


FW_1, FW_2, CORE_1, CORE_2 = "fw-edge-01", "fw-edge-02", "sw-core-01", "sw-core-02"


def device_task(hostname: str, *topics: str) -> dict:
    subject = {"status": "success", "started_at": None, "ended_at": None, "error": None}
    return {
        "hostname": hostname,
        "status": "success",
        "status_per_subject": {topic: copy.deepcopy(subject) for topic in topics},
        "error": None,
    }


def ha_pair_variant(d: dict, priorities: tuple[int | None, int | None] = (200, 100)) -> None:
    """Scénario 11 (2026-10-02) : les deux membres du cluster répondent, configuration partagée, descriptions en
    forme HA. `x1` des deux firewalls documente `sw-core-01 Ethernet1/3` pour le membre prioritaire et `Ethernet1/5`
    pour l'autre ; `x2`, `sw-core-02 Ethernet1/4` et `Ethernet1/6`. Chaque cœur documente son port vers son membre."""
    d["tasks"] = [t for t in d["tasks"] if t["hostname"] != FW_2] + [device_task(FW_2, "interfaces", "ha")]
    for name in ("x1", "x2", "ha1"):
        d["interfaces"].append({**copy.deepcopy(interface(d, FW_1, name)), "hostname": FW_2, "mac_address": None})
    cabling = (("x1", CORE_1, ("Ethernet1/3", "Ethernet1/5")), ("x2", CORE_2, ("Ethernet1/4", "Ethernet1/6")))
    for name, core, ports in cabling:
        text = f"C2|{core}|{ports[0]}|{core}|{ports[1]}"
        interface(d, FW_1, name)["description"] = interface(d, FW_2, name)["description"] = text
    interface(d, CORE_1, "Ethernet1/5")["description"] = f"C2|{FW_2}|x1|"
    d["interfaces"].append(
        {
            **copy.deepcopy(interface(d, CORE_2, "Ethernet1/4")),
            "name": "Ethernet1/6",
            "description": f"C2|{FW_2}|x2|",
            "mac_address": None,
            "ip_addresses": [],
        }
    )
    first, second = d["ha"][0]["members"]
    first["priority"], second["priority"] = priorities
    second["state"] = "up"
    d["ha"].append({**copy.deepcopy(d["ha"][0]), "hostname": FW_2})
