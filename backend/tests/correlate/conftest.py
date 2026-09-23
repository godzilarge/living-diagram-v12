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
