"""Constructeurs de documents diff valides ; chaque test ne modifie que ce qu'il teste.

Les entités (nœuds, interfaces, câbles, contrôles) sont celles des constructeurs du snapshot.
"""

import copy

import pytest

from tests.snapshot.conftest import endpoint, link_ref

RUN_BEFORE = "66db3f0e9a1c2b0012f4a7d1"
RUN_AFTER = "66e49a2d9a1c2b0012f4a8e2"
WEEK = 7 * 86400


def run_ref(**overrides) -> dict:
    base = {
        "collector_run_id": RUN_BEFORE,
        "bundle_sha256": "a" * 64,
        "snapshot_version": "1.0.0",
        "start_datetime": "2026-09-10T02:00:00Z",
        "end_datetime": "2026-09-10T02:14:32Z",
        "status": "completed",
    }
    return {**base, **overrides}


def run_after(**overrides) -> dict:
    base = {
        "collector_run_id": RUN_AFTER,
        "bundle_sha256": "b" * 64,
        "start_datetime": "2026-09-17T02:00:00Z",
        "end_datetime": "2026-09-17T02:13:05Z",
    }
    return run_ref(**{**base, **overrides})


def section(**overrides) -> dict:
    return {"added": [], "removed": [], "changed": [], **overrides}


def section_summary(added: int = 0, removed: int = 0, changed: int = 0) -> dict:
    return {"added": added, "removed": removed, "changed": changed}


def summary(**overrides) -> dict:
    base = {
        "nodes": section_summary(),
        "interfaces": section_summary(),
        "links": section_summary(),
        "aggregates": section_summary(),
        "mlag_domains": section_summary(),
        "ha_clusters": section_summary(),
        "checks": {"appeared": 0, "resolved": 0, "persisted": 0},
        "coverage": {"changed": 0},
        "events": {"rebooted": 0, "flapped": 0},
        "volatile_changes": 0,
    }
    return {**base, **overrides}


def field_change(path: str, before, after) -> dict:
    return {"path": path, "before": before, "after": after}


def node_ref(hostname: str) -> dict:
    return {"kind": "node", "hostname": hostname}


def interface_ref(hostname: str, name: str) -> dict:
    return {"kind": "interface", "hostname": hostname, "name": name}


def cable_ref(a: tuple[str, str] = ("sw-a", "Ethernet1/1"), b: tuple[str, str] = ("sw-b", "Ethernet1/1")) -> dict:
    return link_ref(endpoint(*a), endpoint(*b))


def mlag_domain_ref(mlag_id: int = 20, hosts: tuple[str, str] = ("sw-a", "sw-b"), aggregate: str = "port-channel20"):
    return {
        "kind": "mlag_domain",
        "mlag_id": mlag_id,
        "members": [{"hostname": host, "aggregate": aggregate} for host in hosts],
    }


def entity_change(ref: dict, *fields: dict) -> dict:
    return {"ref": ref, "fields": list(fields) or [field_change("oper_status", "up", "down")]}


def event(kind: str, ref: dict, **details) -> dict:
    return {"kind": kind, "ref": ref, "details": details}


def diff_doc(**overrides) -> dict:
    """Le diff vide : deux runs à une semaine d'écart, rien n'a changé que du volatil."""
    base = {
        "diff_version": "1.0.0",
        "infrastructure": "infra-lab",
        "before": run_ref(),
        "after": run_after(),
        "elapsed_seconds": WEEK,
        "summary": summary(volatile_changes=4),
        "nodes": section(),
        "interfaces": section(),
        "links": section(),
        "aggregates": section(),
        "mlag_domains": section(),
        "ha_clusters": section(),
        "checks": {"appeared": [], "resolved": [], "persisted": 0},
        "coverage": {"changed": []},
        "events": [],
    }
    return {**base, **overrides}


SECTIONS = ("nodes", "interfaces", "links", "aggregates", "mlag_domains", "ha_clusters")


def with_counts(doc: dict) -> dict:
    """Copie de `doc` dont le résumé est recalculé depuis les sections (sauf `volatile_changes`)."""
    out = copy.deepcopy(doc)
    for name in SECTIONS:
        out["summary"][name] = {part: len(out[name][part]) for part in ("added", "removed", "changed")}
    out["summary"]["checks"] = {
        "appeared": len(out["checks"]["appeared"]),
        "resolved": len(out["checks"]["resolved"]),
        "persisted": out["checks"]["persisted"],
    }
    out["summary"]["coverage"] = {"changed": len(out["coverage"]["changed"])}
    kinds = [e["kind"] for e in out["events"]]
    out["summary"]["events"] = {"rebooted": kinds.count("rebooted"), "flapped": kinds.count("flapped")}
    return out


@pytest.fixture
def empty() -> dict:
    return diff_doc()


def first_error(exc_info) -> dict:
    return exc_info.value.errors()[0]


def error_types(exc_info) -> set[str]:
    return {e["type"] for e in exc_info.value.errors()}
