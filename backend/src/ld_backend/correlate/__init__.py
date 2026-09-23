"""B1 : la corrélation, fonction pure RunBundle → Snapshot (docs/05).

Étape 1 (2026-09-20) : R0 identité, R1 noms d'interfaces, R2 descriptions et claims, R3 fusion en câbles,
R6 assemblage canonique. R1-bis (2026-09-22) : port distant annoncé par le nom d'un agrégat ramené à son membre.
Les structures (R4) et les contrôles d'état (R5) viennent à l'étape 2.
"""

from ld_contracts.bundle import RunBundle
from ld_contracts.snapshot import Snapshot

from ld_backend.correlate.aggregates import resolve_aggregate_ports
from ld_backend.correlate.assemble import assemble
from ld_backend.correlate.claims import collect_claims
from ld_backend.correlate.context import build_context
from ld_backend.correlate.merge import build_links


def correlate(bundle: RunBundle, bundle_sha256: str) -> Snapshot:
    """Même bundle ⇒ même snapshot, à l'octet : aucune horloge, aucun identifiant synthétique, listes triées."""
    ctx = build_context(bundle)
    claims = resolve_aggregate_ports(ctx, collect_claims(ctx))
    merged = build_links(ctx, claims)
    return assemble(ctx, claims, merged, bundle_sha256)


__all__ = ["correlate"]
