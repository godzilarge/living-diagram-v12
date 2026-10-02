"""`mlag_peer_link` nullable, `null` = non lu seulement ; un peer-link ne porte pas de `mlag_id` (2026-10-02).

Trois lectures : `true` = lu, c'est le peer-link ; `false` = lu, ce n'est pas le peer-link, device sans MLAG compris ;
`null` = non lu (la source MLAG n'a pas répondu alors que le document existe, lu dans une autre commande que le reste).
Jamais « sans objet » : un booléen a toujours une réponse. `mlag_id` renseigné avec `mlag_peer_link = true` est refusé :
aucun équipement ne numérote son peer-link, et B1 l'aurait lu comme peer-link en ignorant l'identifiant en silence.
"""

import copy

import pytest
from pydantic import ValidationError

from ld_contracts.defaults import ABSENT_CODE
from ld_contracts.docgen import ERROR_TYPES, generate_markdown
from ld_contracts.models_interfaces import Aggregate
from ld_contracts.snapshot.codes import SHARED_ERROR_TYPES
from ld_contracts.snapshot.structures import SnapshotAggregate
from ld_contracts.validate import validate_dict
from tests.conftest import first_error
from tests.snapshot.conftest import aggregate_doc as snapshot_aggregate_doc

CODE = "mlag_peer_link_with_id"


def aggregate_doc(**overrides) -> dict:
    base = {
        "hostname": "sw",
        "name": "port-channel10",
        "oper_status": "up",
        "protocol": "lacp",
        "lacp_mode": "active",
        "min_links": None,
        "members": [{"name": "Ethernet1/1", "status": "bundled"}],
        "mlag_id": None,
        "mlag_peer_link": False,
        "extras": {},
    }
    return {**base, **overrides}


def test_null_is_accepted_and_read_as_none():
    assert Aggregate.model_validate(aggregate_doc(mlag_peer_link=None)).mlag_peer_link is None


def test_absent_key_is_read_as_null_and_counted(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    del doc["aggregates"][0]["mlag_peer_link"]
    report = validate_dict(doc)
    assert report.ok and report.bundle is not None
    assert report.bundle.aggregates[0].mlag_peer_link is None
    assert [f.details["field"] for f in report.findings if f.code == ABSENT_CODE] == ["aggregates[].mlag_peer_link"]


@pytest.mark.parametrize("value", ["false", "true", 0, 1, "null", ""])
def test_only_a_strict_boolean_or_null_is_accepted(value):
    with pytest.raises(ValidationError):
        Aggregate.model_validate(aggregate_doc(mlag_peer_link=value))


def test_a_peer_link_carrying_an_mlag_id_is_refused():
    with pytest.raises(ValidationError) as exc:
        Aggregate.model_validate(aggregate_doc(mlag_id=10, mlag_peer_link=True))
    err = first_error(exc)
    assert err["type"] == CODE
    assert err["ctx"] == {"hostname": "sw", "name": "port-channel10", "mlag_id": 10}


def test_the_peer_link_itself_and_an_unread_flag_next_to_an_id_are_accepted():
    """Le peer-link n'a pas de `mlag_id` (fixture, scénario 3 de docs/05) ; `null` ne contredit rien."""
    assert Aggregate.model_validate(aggregate_doc(mlag_id=None, mlag_peer_link=True)).mlag_peer_link is True
    read = Aggregate.model_validate(aggregate_doc(mlag_id=20, mlag_peer_link=None))
    assert (read.mlag_id, read.mlag_peer_link) == (20, None)
    assert Aggregate.model_validate(aggregate_doc(mlag_id=20, mlag_peer_link=False)).mlag_id == 20


def test_the_fixture_writes_false_on_the_aggregate_outside_any_mlag(minimal_dict):
    """`agg-core` du FortiGate : pas de MLAG, donc `false`, un fait ; jamais `null` pour « sans objet »."""
    fortigate = next(a for a in minimal_dict["aggregates"] if a["hostname"] == "fw-edge-01")
    assert (fortigate["mlag_id"], fortigate["mlag_peer_link"]) == (None, False)
    assert all("mlag_peer_link" in a and a["mlag_peer_link"] is not None for a in minimal_dict["aggregates"])


def test_snapshot_aggregate_accepts_null_and_refuses_an_id_on_a_peer_link():
    assert SnapshotAggregate.model_validate(snapshot_aggregate_doc(mlag_peer_link=None)).mlag_peer_link is None
    with pytest.raises(ValidationError) as exc:
        SnapshotAggregate.model_validate(snapshot_aggregate_doc(mlag_id=10, mlag_peer_link=True))
    err = first_error(exc)
    assert err["type"] == CODE
    assert err["ctx"] == {"hostname": "sw-a", "name": "port-channel10", "mlag_id": 10}


def test_reference_documents_the_three_readings_and_the_refusal():
    text = generate_markdown()
    assert CODE in ERROR_TYPES and CODE in SHARED_ERROR_TYPES, "règle partagée : partie A, rappelée en partie B"
    assert "| `mlag_peer_link` | booléen \\| null | non (null si absente) |" in text
    assert "| `aggregates[].mlag_peer_link` | `false` |" in text
    part_a, part_b = text.split("Partie B", 1)
    assert f"| `{CODE}` |" in part_a and f"`{CODE}`" in part_b, "le refus figure dans les deux parties de CONTRAT.md"
