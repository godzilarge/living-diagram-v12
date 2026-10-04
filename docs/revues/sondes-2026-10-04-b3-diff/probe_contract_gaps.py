"""Sonde C : ce que le contrat Diff laisse passer alors que B3 ne l'émettrait jamais (ou ne devrait pas).

Lancer depuis `contracts/` : `uv run python ../docs/revues/sondes-2026-10-04-b3-diff/probe_contract_gaps.py`.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "contracts"))

from pydantic import ValidationError  # noqa: E402

from ld_contracts.diff import Diff  # noqa: E402
from tests.diff.conftest import (  # noqa: E402
    WEEK,
    diff_doc,
    entity_change,
    event,
    field_change,
    interface_ref,
    node_ref,
    run_after,
    run_ref,
    section,
    with_counts,
)
from tests.snapshot.conftest import check_doc, stub_doc  # noqa: E402


def verdict(label: str, doc: dict) -> None:
    try:
        Diff.model_validate(doc)
        print(f"ACCEPTÉ  {label}")
    except ValidationError as exc:
        print(f"refusé   {label} → {sorted({e['type'] for e in exc.errors()})}")


base = diff_doc()
stub = stub_doc()
reversed_runs = {**base, "before": base["after"], "after": base["before"], "elapsed_seconds": -WEEK}

verdict(
    "C1 événements alors que elapsed_seconds < 0 (le contrat dit « vide si ≤ 0 »)",
    with_counts({**reversed_runs, "events": [event("rebooted", node_ref("sw-a"), uptime_before=9000, uptime_after=100, elapsed_seconds=-WEEK)]}),
)
verdict(
    "C1 bis événements alors que elapsed_seconds = 0",
    with_counts({**base, "after": run_ref(), "elapsed_seconds": 0, "events": [event("flapped", interface_ref("sw-a", "Ethernet1/1"), age_after=1, elapsed_seconds=0)]}),
)
verdict(
    "C2 le même nœud dans added et dans changed",
    with_counts({**base, "nodes": section(added=[stub], changed=[entity_change(node_ref(stub["hostname"]))])}),
)
verdict("C2 bis le même nœud dans added et dans removed", with_counts({**base, "nodes": section(added=[stub], removed=[stub])}))
verdict(
    "C3 rebooted avec uptime_after ≥ elapsed_seconds (contredit la définition de l'événement)",
    with_counts({**base, "events": [event("rebooted", node_ref("sw-a"), uptime_before=1, uptime_after=10**9, elapsed_seconds=WEEK)]}),
)
verdict("C3 bis rebooted sans aucun détail", with_counts({**base, "events": [event("rebooted", node_ref("sw-a"))]}))
verdict(
    "C3 ter flapped avec un détail hors contrat et elapsed_seconds différent de celui du diff",
    with_counts({**base, "events": [event("flapped", interface_ref("sw-a", "Ethernet1/1"), foo="bar", elapsed_seconds=1)]}),
)
same_device = {
    "kind": "mlag_domain",
    "mlag_id": 20,
    "members": [{"hostname": "sw-a", "aggregate": "port-channel10"}, {"hostname": "sw-a", "aggregate": "port-channel20"}],
}
verdict(
    "C4 MlagDomainRef dont les deux agrégats sont sur le même device (MlagDomain le refuse)",
    with_counts({**base, "mlag_domains": section(changed=[entity_change(same_device, field_change("downstream", None, "x"))])}),
)
verdict("C5 after.snapshot_version de majeure 2 (le contrat Snapshot la refuse)", {**base, "after": run_after(snapshot_version="2.0.0")})
chk = check_doc()
verdict(
    "C6 le même contrôle dans appeared et dans resolved",
    with_counts({**base, "checks": {"appeared": [chk], "resolved": [chk], "persisted": 0}}),
)
verdict("C7 before == after (diff d'un snapshot avec lui-même, attendu accepté)", {**base, "after": run_ref(), "elapsed_seconds": 0})
verdict(
    "C8 un FieldChange sur un champ volatil déclaré (uptime_seconds)",
    with_counts({**base, "nodes": section(changed=[entity_change(node_ref("sw-a"), field_change("uptime_seconds", 1, 2))])}),
)
verdict(
    "C9 un FieldChange dont le chemin est une liste à l'intérieur (evidence.0.source : une liste se compare en bloc)",
    with_counts({**base, "links": section(changed=[entity_change({"kind": "link", "a": {"hostname": "sw-a", "interface": "Ethernet1/1"}, "b": {"hostname": "sw-b", "interface": "Ethernet1/1"}}, field_change("evidence.0.source", "lldp", "cdp"))])}),
)
