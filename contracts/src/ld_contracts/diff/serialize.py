"""Sérialisation canonique du diff : même forme que le snapshot (clés triées, UTF-8, indentation 2, fin de ligne).

Deux diffs égaux donnent les mêmes octets : `diff(A, B)` est déterministe, et cela se vérifie à l'octet.
"""

import json

from ld_contracts.diff.diff import Diff


def canonical_json(diff: Diff) -> str:
    return json.dumps(diff.model_dump(mode="json"), sort_keys=True, ensure_ascii=False, indent=2) + "\n"
