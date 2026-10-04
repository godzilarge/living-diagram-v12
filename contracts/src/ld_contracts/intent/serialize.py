"""Sérialisation canonique de l'intention : même forme que le snapshot et le diff (clés triées, UTF-8, indentation 2,
fin de ligne). C'est la forme du fichier `intent.json` du store et de la réponse de l'API."""

import json

from ld_contracts.intent.intent import Intent


def canonical_json(intent: Intent) -> str:
    return json.dumps(intent.model_dump(mode="json"), sort_keys=True, ensure_ascii=False, indent=2) + "\n"
