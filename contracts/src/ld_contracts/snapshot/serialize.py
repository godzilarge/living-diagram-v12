"""Sérialisation canonique (R6) : clés triées, UTF-8 sans échappement, indentation fixe, fin de ligne unique.

Deux snapshots égaux donnent les mêmes octets : c'est ce que l'archive (B2) et le diff (B3) supposent.
"""

import hashlib
import json

from ld_contracts.snapshot.snapshot import Snapshot


def canonical_json(snapshot: Snapshot) -> str:
    return json.dumps(snapshot.model_dump(mode="json"), sort_keys=True, ensure_ascii=False, indent=2) + "\n"


def snapshot_sha256(snapshot: Snapshot) -> str:
    return hashlib.sha256(canonical_json(snapshot).encode("utf-8")).hexdigest()
