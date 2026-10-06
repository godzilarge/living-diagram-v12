"""Construction du monde initial : un motif complet par site, les sites chaînés par leurs cœurs.

Chaque site se construit dans son propre brouillon (coût borné par la taille d'un site), puis les brouillons sont
concaténés : la construction reste linéaire en nombre de sites. `--devices N` donne exactement N devices.
"""

import random

from ld_contracts.synth import naming
from ld_contracts.synth.build_site import build_site, chain_sites
from ld_contracts.synth.draft import Draft
from ld_contracts.synth.spec import GenerationSpec
from ld_contracts.synth.world import World

DEVICES_PER_SITE_TARGET = 25
FIXED_PER_SITE = 5  # deux cœurs, deux firewalls, un routeur


def distribute_access(devices: int) -> tuple[int, ...]:
    """Nombre d'accès par site pour un total exact de devices : sites de ~25, reste réparti un par un.

    Avec `devices ≥ 6` et des sites de 25, chaque site reçoit au moins un accès : l'invariant est vérifié, pas réparé.
    """
    sites = max(1, -(-devices // DEVICES_PER_SITE_TARGET))
    access_total = devices - FIXED_PER_SITE * sites
    if access_total < sites:
        raise ValueError(f"{devices} devices ne remplissent pas {sites} sites d'au moins un accès")
    base, extra = divmod(access_total, sites)
    return tuple(base + (1 if i < extra else 0) for i in range(sites))


def _merge(seed: str, infrastructure: str, drafts: list[Draft]) -> Draft:
    return Draft(
        seed=seed,
        infrastructure=infrastructure,
        devices=tuple(d for draft in drafts for d in draft.devices),
        ports=tuple(p for draft in drafts for p in draft.ports),
        cables=tuple(c for draft in drafts for c in draft.cables),
        aggregates=tuple(a for draft in drafts for a in draft.aggregates),
        clusters=tuple(c for draft in drafts for c in draft.clusters),
        stubs=tuple(s for draft in drafts for s in draft.stubs),
        next_index=drafts[-1].next_index,
        next_stub=drafts[-1].next_stub,
    )


def build_world(spec: GenerationSpec) -> World:
    rng = random.Random(f"{spec.seed}:build")
    access_counts = distribute_access(spec.devices)
    sites = tuple(naming.site_name(i + 1) for i in range(len(access_counts)))
    drafts: list[Draft] = []
    next_index, next_stub = 0, 0
    for site, access_count in zip(sites, access_counts, strict=True):
        fresh = Draft(spec.seed, spec.infrastructure, next_index=next_index, next_stub=next_stub)
        built = build_site(fresh, rng, site, access_count, spec.firewall_uplinks)
        next_index, next_stub = built.next_index, built.next_stub
        drafts.append(built)
    draft = chain_sites(_merge(spec.seed, spec.infrastructure, drafts), sites)
    return World(
        seed=spec.seed,
        infrastructure=spec.infrastructure,
        sites=sites,
        devices=tuple(sorted(draft.devices, key=lambda d: d.hostname)),
        ports=tuple(sorted(draft.ports, key=lambda p: (p.device, p.name))),
        cables=tuple(sorted(draft.cables, key=lambda c: (c.a, c.b))),
        aggregates=tuple(sorted(draft.aggregates, key=lambda a: (a.device, a.name))),
        clusters=tuple(sorted(draft.clusters, key=lambda c: c.name)),
        stubs=tuple(sorted(draft.stubs, key=lambda s: s.name)),
        next_index=draft.next_index,
        next_stub=draft.next_stub,
    )
