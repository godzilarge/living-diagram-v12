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


def test_ha_standalone_document_has_no_members():
    """`standalone` : `members` vide (2026-10-02, demande d'Orhan ; avant, le device se listait lui-même, une entrée
    sans information que l'exportateur devait inventer). Nom de groupe et hbdev restent admis : FortiOS les garde en
    configuration quel que soit le mode."""
    doc = ha_doc(mode="standalone", members=[], cluster_name="FGT-HA", heartbeat_interfaces=["ha1"])
    ha = HaStatus.model_validate(doc)
    assert ha.mode == "standalone" and ha.members == ()
    assert ha.cluster_name == "FGT-HA" and ha.heartbeat_interfaces == ("ha1",)


@pytest.mark.parametrize("mode", ["active_passive", "active_active", "other"])
def test_ha_document_without_members_is_rejected_outside_standalone(mode):
    """Hors `standalone`, `members: []` est refusé : la vue locale n'existe que là. Un FortiGate configuré en `a-p`
    dont le pair a disparu se liste seul (cluster d'un membre), il n'est pas standalone."""
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


@pytest.mark.parametrize(
    "keep,names",
    [
        ((0,), ["fw-edge-01"]),  # lui-même, l'ancienne convention
        ((0, 1), ["fw-edge-01", "fw-edge-02"]),  # un pair alors que le mode dit standalone
        ((1,), ["fw-edge-02"]),  # un pair seul : refusé comme standalone, pas comme « local absent »
    ],
)
def test_ha_standalone_with_members_is_rejected(keep, names):
    """Un fait, une écriture : `standalone` n'admet aucun membre, sans quoi `[self]` et `[]` donneraient deux
    snapshots (un cluster d'un membre, aucun cluster). La valeur ne figure que dans `ctx`, jamais dans le message."""
    doc = ha_doc(mode="standalone", cluster_name=None, heartbeat_interfaces=[])
    members = [{**doc["members"][i], "role": "member"} for i in keep]
    with pytest.raises(ValidationError) as exc:
        HaStatus.model_validate({**doc, "members": members})
    err = first_error(exc)
    assert err["type"] == "ha_standalone_with_members"
    assert "fw-edge" not in err["msg"]
    assert err["ctx"] == {"hostname": "fw-edge-01", "members": names}
