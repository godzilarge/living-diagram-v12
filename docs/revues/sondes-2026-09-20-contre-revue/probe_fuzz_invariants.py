"""Fuzz, invariants de cohérence des contrôles (mêmes tirages que probe_fuzz.py)."""

import sys
from collections import Counter

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import random

from common import SHA, run
from probe_fuzz import draw  # noqa: E402  (rejoue aussi le fuzz de base à l'import)

both, contradict, double_mac = 0, 0, 0
for seed in range(1500):
    snap = run(draw(random.Random(seed)), SHA)
    documenting = {(e.witness.hostname, e.witness.interface) for l in snap.links for e in l.evidence if e.source == "description"}
    for c in snap.checks:
        if c.code == "description_disagrees_with_observed":
            ref = c.refs[0]
            if ref.kind == "interface" and (ref.hostname, ref.name) in documenting:
                contradict += 1
        if c.code == "one_way_observation":
            link_ref = next(r for r in c.refs if r.kind == "link")
            link = next(l for l in snap.links if (l.a, l.b) == (link_ref.a, link_ref.b))
            witnesses = {(e.witness.hostname, e.witness.interface) for e in link.evidence if e.source == c.details["source"]}
            if len(witnesses) == 2:
                both += 1
    # même câble physique dessiné deux fois : A/p <-> (B, MAC) et A/p <-> B/x, B/x témoignant vers A/p
    by_port = Counter()
    for l in snap.links:
        for end, other in ((l.a, l.b), (l.b, l.a)):
            by_port[(end.hostname, end.interface, other.hostname)] += 1
    double_mac += sum(1 for n in by_port.values() if n > 1)
print(f"désaccord ET confirmation par la même description : {contradict}")
print(f"one_way_observation sur un lien témoigné des deux bouts par la même source : {both}")
print(f"ports portant 2+ câbles vers le MÊME device voisin (tous tirages) : {double_mac}")
