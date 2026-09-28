"""B1 : la corrélation, fonction pure RunBundle → Snapshot (docs/05).

Étape 1 (2026-09-20) : R0 identité, R1 noms d'interfaces, R2 descriptions et claims, R3 fusion en câbles,
R6 assemblage canonique. R1-bis (2026-09-22) : port distant annoncé par le nom d'un agrégat ramené à son membre.
R4 (2026-09-26) : agrégats et faisceaux, domaines MLAG, clusters HA. R5 (2026-09-26) : contrôles d'état des câbles
et des tasks de collecte.
"""

from ld_contracts.bundle import RunBundle
from ld_contracts.snapshot import Snapshot

from ld_backend.correlate.aggregates import resolve_aggregate_ports
from ld_backend.correlate.assemble import assemble, node_hostnames
from ld_backend.correlate.claims import collect_claims
from ld_backend.correlate.context import build_context
from ld_backend.correlate.merge import build_links
from ld_backend.correlate.state import build_state_checks
from ld_backend.correlate.structures import build_structures


def correlate(bundle: RunBundle, bundle_sha256: str) -> Snapshot:
    """Même bundle ⇒ même snapshot, à l'octet : aucune horloge, aucun identifiant synthétique, listes triées."""
    ctx = build_context(bundle)
    claims = resolve_aggregate_ports(ctx, collect_claims(ctx))
    merged = build_links(ctx, claims)
    structures = build_structures(ctx, merged.links, node_hostnames(ctx, claims.claims))
    state = build_state_checks(ctx, merged.links)
    return assemble(ctx, claims, merged, structures, state, bundle_sha256)


__all__ = ["correlate"]
