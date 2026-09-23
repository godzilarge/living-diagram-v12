"""R2 : grammaire des descriptions `criticité|voisin|port|options` (V1, décision 2 du 2026-09-20).

Isolée ici pour changer avec l'échantillon réel (question 6 de docs/05) sans toucher au reste de B1.
"""

import re

from ld_contracts.snapshot.interfaces import ParsedDescription

# Un nom de voisin : hostname, FQDN, MAC ou IP ; jamais d'espace. Un libellé (`WAN PROVIDER`) est refusé,
# un libellé sans espace (`WAN-PROVIDER`) passe et finira en stub visible, filtrable.
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
SEPARATOR = "|"
MAX_FIELDS = 4


def parse_description(text: str | None) -> ParsedDescription | None:
    """Champs 1 et 2 obligatoires (1 peut être vide), 3 et 4 optionnels ; le champ 4 garde ses `|`."""
    if text is None or SEPARATOR not in text:
        return None
    parts = [part.strip() for part in text.split(SEPARATOR, MAX_FIELDS - 1)]
    neighbor = parts[1] if len(parts) > 1 else ""
    if not NAME_RE.fullmatch(neighbor):
        return None
    port = parts[2] if len(parts) > 2 else ""
    options = parts[3] if len(parts) > 3 else ""
    return ParsedDescription(
        criticality=parts[0] or None, neighbor=neighbor, port=port or None, options=options or None
    )
