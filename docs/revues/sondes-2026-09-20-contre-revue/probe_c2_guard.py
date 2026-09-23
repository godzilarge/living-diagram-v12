"""Sonde : la garde C2 (compte des appels à expand_cisco) voit-elle une réciprocité redevenue quadratique ?

On remplace `_one_way_checks` par une version O(n²) qui balaie tous les claims en comparant les clés déjà
calculées (donc sans jamais rappeler `expand_cisco`), puis on rejoue exactement la mesure du test C2.
"""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import SHA, load_minimal, run
from ld_backend.correlate import ifnames, merge
from ld_contracts.snapshot.enums import OBSERVED_SOURCES

from tests.correlate.test_review import _ring

calls = 0
original = ifnames.expand_cisco


def counting(name):
    global calls
    calls += 1
    return original(name)


ifnames.expand_cisco = counting
comparisons = 0
linear = merge._one_way_checks


def quadratic(ctx, claims, by_pair):
    """L'ancien défaut, réécrit sur les clés précalculées : un balayage complet par claim."""
    global comparisons
    observed = [c for c in claims if c.source in OBSERVED_SOURCES and not c.is_self]
    for claim in observed:
        for other in observed:
            comparisons += 1
            if (other.source, other.witness_key, other.target_key) == (claim.source, claim.target_key, claim.witness_key):
                break
    return linear(ctx, claims, by_pair)


doc = _ring(load_minimal(), devices=40, ports=5)
run(doc, SHA)
print(f"code actuel            : expand_cisco appelé {calls} fois (borne du test : 1000)")
calls = 0
merge._one_way_checks = quadratic
run(doc, SHA)
print(f"réciprocité quadratique: expand_cisco appelé {calls} fois, {comparisons} comparaisons -> le test C2 passerait : {calls <= 1000}")
