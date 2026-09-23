"""Prototype (monkeypatch, hors dépôt) de la correction proposée pour C1 : vérifie qu'elle tient sur E1, E1b, E1c
et ne change pas un octet du snapshot de la fixture de référence.

1. `display_name` d'un bout qui témoigne : le nom présent dans `interfaces[]` s'il y en a un, sinon le plus petit.
2. Le témoin d'une évidence est le bout du lien (même nom que l'endpoint), pas l'écriture du document.
"""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import SHA, attempt, cdp_doc, interface, lldp_doc, load_minimal, run, show_links, variant
from ld_backend.correlate import merge
from ld_contracts.snapshot.links import LinkEvidence, RemoteRaw, ResolvedRemote
from ld_contracts.snapshot.refs import Endpoint
from ld_contracts.snapshot.serialize import canonical_json

m = load_minimal()
before = canonical_json(run(m, SHA))

original_display = merge._Merger.display_name
original_link = merge._Merger._link


def display_name(self, key, claims):
    witnesses = {c.interface for c in claims if c.witness_key == key}
    known = witnesses & self.ctx.names_by_host.get(key[0], frozenset())
    if known:
        return min(known)
    return original_display(self, key, claims)


def _link(self, a, b, claims):
    names = {c.witness_key: self.display_name(c.witness_key, claims) for c in claims}

    def evidence(claim):
        return LinkEvidence(
            source=claim.source,
            witness=Endpoint(hostname=claim.hostname, interface=names[claim.witness_key]),
            remote_raw=RemoteRaw(name=claim.raw_name, port=claim.raw_port),
            remote_resolved=ResolvedRemote(hostname=claim.resolved.hostname, interface=claim.port),
            resolution=claim.resolved.resolution,
        )

    saved = merge._evidence
    merge._evidence = evidence
    try:
        return original_link(self, a, b, claims)
    finally:
        merge._evidence = saved


merge._Merger.display_name = display_name
merge._Merger._link = _link

print("fixture de référence inchangée à l'octet :", canonical_json(run(m, SHA)) == before)


def e1(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Eth1/5", "srv-a", "eth0", ("station",)))
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C3|srv-a|eth0|"


def e1c(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Mgmt0", "srv-a", "eth0", ("station",)))
    d["cdp"].append(cdp_doc("sw-core-01", "mgmt0", "srv-a", "eth0"))


for title, mutate in (("E1 corrigé", e1), ("E1c corrigé", e1c)):
    snap = attempt(title, variant(m, mutate))
    if snap:
        show_links(snap, "srv-a")


# Limite du prototype : deux documents de la même source, même voisin, deux écritures du port local
def e1d(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Eth1/5", "srv-a", "eth0", ("station",)))
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0", ("station",)))


attempt("E1d deux documents lldp, mêmes voisin et port, port local sous deux écritures (prototype)", variant(m, e1d))
