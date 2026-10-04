"""Fixtures de B3 : le squelette du snapshot et sa variante « câble tombé », et le bundle de référence rejoué une
semaine plus tard (autre run, dates décalées, uptimes et âges avancés), corrélé par B1."""

import copy
import json
from datetime import datetime, timedelta

import pytest
from ld_contracts.diff import Diff
from ld_contracts.snapshot import Snapshot

from tests.correlate.conftest import FIXTURES, load_minimal, run, variant

WEEK = 7 * 86400
LATER_RUN_ID = "66e49a2d9a1c2b0012f4a8e2"

__all__ = ["FIXTURES", "WEEK", "load_minimal", "run", "variant"]


@pytest.fixture(scope="session")
def minimal() -> dict:
    return load_minimal()


@pytest.fixture(scope="session")
def snapshot(minimal: dict) -> Snapshot:
    return run(minimal)


def load_snapshot(name: str) -> Snapshot:
    return Snapshot.model_validate(json.loads((FIXTURES / name).read_text(encoding="utf-8")))


def _shift(text: str | None, weeks: int) -> str | None:
    if text is None:
        return None
    moment = datetime.fromisoformat(text) + timedelta(weeks=weeks)
    return moment.isoformat().replace("+00:00", "Z")


def later(doc: dict, weeks: int = 1) -> dict:
    """Le même bundle `weeks` semaines plus tard : rien n'a changé que le temps qui passe."""
    out = copy.deepcopy(doc)
    out["produced_at"] = _shift(out["produced_at"], weeks)
    out["run"]["collector_run_id"] = LATER_RUN_ID
    for key in ("start_datetime", "end_datetime"):
        out["run"][key] = _shift(out["run"][key], weeks)
    for system in out["system"]:
        if system["uptime_seconds"] is not None:
            system["uptime_seconds"] += WEEK * weeks
    for itf in out["interfaces"]:
        if isinstance(itf["last_change_age_seconds"], int):
            itf["last_change_age_seconds"] += WEEK * weeks
    return out


def cable_down_later(doc: dict) -> dict:
    """Une semaine plus tard, le câble confirmé entre les deux cœurs est tombé des deux bouts."""
    out = later(doc)
    for itf in out["interfaces"]:
        if itf["name"] == "Ethernet1/1" and itf["hostname"] in ("sw-core-01", "sw-core-02"):
            itf["oper_status"] = "down"
    return out


def hostnames(items) -> set[str]:
    return {item.hostname for item in items}


def paths(change) -> dict:
    return {field.path: field for field in change.fields}


def ref_hostnames(changes) -> set[str]:
    return {change.ref.hostname for change in changes}


def itf_change(diff: Diff, hostname: str, name: str):
    return next((c for c in diff.interfaces.changed if c.ref.hostname == hostname and c.ref.name == name), None)


def node_change(diff: Diff, hostname: str):
    return next((c for c in diff.nodes.changed if c.ref.hostname == hostname), None)


def ends(link) -> set[tuple[str, str]]:
    return {(link.a.hostname, link.a.interface), (link.b.hostname, link.b.interface)}


def link_with(links, a: tuple[str, str], b: tuple[str, str]):
    return next((link for link in links if ends(link) == {a, b}), None)


def link_change(diff: Diff, a: tuple[str, str], b: tuple[str, str]):
    wanted = {a, b}
    return next((c for c in diff.links.changed if ends(c.ref) == wanted), None)


def codes(checks) -> set[str]:
    return {str(check.code) for check in checks}


def sections_empty(diff: Diff) -> bool:
    return all(
        not getattr(getattr(diff, name), part)
        for name in ("nodes", "interfaces", "links", "aggregates", "mlag_domains", "ha_clusters")
        for part in ("added", "removed", "changed")
    )
