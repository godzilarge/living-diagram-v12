import pytest
from pydantic import ValidationError

from ld_contracts.models_ha import HaStatus
from tests.conftest import first_error, ha_doc


def test_ha_document_accepts_target_document():
    ha = HaStatus.model_validate(ha_doc())
    assert ha.hostname == "fw-edge-01"
    assert [m.name for m in ha.members] == ["fw-edge-01", "fw-edge-02"]


@pytest.mark.parametrize("field,value", [("local_role", "primary"), ("local_state", "up")])
def test_ha_document_no_longer_carries_the_local_view(field, value):
    """Le rôle et l'état du device local se lisent dans `members` : la copie est refusée (2026-09-14)."""
    with pytest.raises(ValidationError) as exc:
        HaStatus.model_validate(ha_doc(**{field: value}))
    err = first_error(exc)
    assert err["type"] == "extra_forbidden" and err["loc"][-1] == field


@pytest.mark.parametrize("name", ["fw-edge-03", "FW-EDGE-01"])
def test_ha_local_device_must_be_listed_among_members(name):
    """Sans champ local, la vue locale n'existe que si le device est dans `members`, octet pour octet."""
    doc = ha_doc()
    members = [{**doc["members"][0], "name": name}, doc["members"][1]]
    with pytest.raises(ValidationError) as exc:
        HaStatus.model_validate({**doc, "members": members})
    err = first_error(exc)
    assert err["type"] == "ha_local_not_in_members"
    assert "fw-edge-01" not in err["msg"]
    assert err["ctx"] == {"hostname": "fw-edge-01"}


def test_ha_standalone_device_lists_itself():
    """Pas d'exception pour `standalone` : un device seul se liste lui-même, rôle `member`."""
    doc = ha_doc(mode="standalone", cluster_name=None, heartbeat_interfaces=[])
    me = {**doc["members"][0], "role": "member"}
    ha = HaStatus.model_validate({**doc, "members": [me]})
    assert ha.mode == "standalone" and len(ha.members) == 1


@pytest.mark.parametrize("mode", ["active_passive", "standalone"])
def test_ha_document_without_members_is_rejected(mode):
    """`members: []` (FortiGate sans pair) est refusé quel que soit le mode : le device se liste lui-même."""
    with pytest.raises(ValidationError) as exc:
        HaStatus.model_validate(ha_doc(mode=mode, members=[]))
    err = first_error(exc)
    assert err["type"] == "ha_local_not_in_members" and err["ctx"] == {"hostname": "fw-edge-01"}


def test_ha_member_listed_twice_is_rejected():
    """`members` est la seule source de la vue locale : deux entrées pour un même device seraient ambiguës."""
    doc = ha_doc()
    twice = [*doc["members"], {**doc["members"][0], "role": "secondary"}]
    with pytest.raises(ValidationError) as exc:
        HaStatus.model_validate({**doc, "members": twice})
    err = first_error(exc)
    assert err["type"] == "ha_member_duplicate"
    assert "fw-edge-01" not in err["msg"]
    assert err["ctx"] == {"hostname": "fw-edge-01", "members": ["fw-edge-01"]}


@pytest.mark.parametrize("role,with_peer", [("primary", False), ("member", True)])
def test_ha_standalone_lists_exactly_itself_as_member(role, with_peer):
    """La convention standalone est imposée, pas seulement documentée : un membre, lui-même, rôle `member`."""
    doc = ha_doc(mode="standalone", cluster_name=None, heartbeat_interfaces=[])
    members = [{**doc["members"][0], "role": role}] + (doc["members"][1:] if with_peer else [])
    with pytest.raises(ValidationError) as exc:
        HaStatus.model_validate({**doc, "members": members})
    err = first_error(exc)
    assert err["type"] == "ha_standalone_not_alone"
    assert err["ctx"] == {"hostname": "fw-edge-01", "members": len(members)}
