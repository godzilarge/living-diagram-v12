"""Le store de la couche d'intention (B4, `docs/08`) : un document `Intent` par infrastructure, écrit par opérations.

Sur disque en V1, à côté de l'archive (`<archive>/_intent/<infra>/`), derrière une interface que Mongo pourra
remplacer comme `BundleArchive`. Règles :
- lire ne crée rien : une infrastructure jamais écrite se lit comme le document vide (`revision` 0) ;
- écrire = lire, appliquer les opérations dans l'ordre, écrire le document entier **atomiquement** (temporaire,
  `fsync`, renommage), sous un **verrou de fichier** par infrastructure : deux requêtes simultanées s'appliquent l'une
  après l'autre, aucune n'est perdue ; dernier écrivain gagne **par épingle**, jamais par document ;
- chaque requête acceptée incrémente `revision` et laisse une ligne dans `journal.jsonl` (qui, quand, quoi) ;
- un document illisible ou incohérent (JSON cassé, hors contrat, d'une autre infrastructure) est isolé
  (`IntentCorruptError`), jamais écrasé ;
- le dossier `_intent` ne peut pas entrer en collision avec une infrastructure : un nom sûr ne commence jamais par
  `_`, un nom haché porte un suffixe (`archive._segment`).
"""

import json
import logging
import os
import threading
from datetime import datetime
from pathlib import Path

from ld_contracts.intent import INTENT_VERSION, MAX_PINS, Intent, Pin, empty_intent
from ld_contracts.intent.serialize import canonical_json
from pydantic import ValidationError

from ld_backend.archive import _segment
from ld_backend.files import locked, write_atomically
from ld_backend.schemas import IntentOps, utc_z

log = logging.getLogger(__name__)

INTENT_DIR = "_intent"
INTENT_FILE = "intent.json"
JOURNAL_FILE = "journal.jsonl"


class IntentCorruptError(Exception):
    """Le document d'intention d'une infrastructure est illisible ou incohérent ; il est isolé, jamais écrasé."""


class IntentLimitError(ValueError):
    """La requête ferait dépasser au document une borne du contrat (10 000 épingles) : refusée, rien n'est écrit."""


class IntentStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self._local = threading.Lock()  # entre fils d'un même processus, en plus du verrou de fichier entre processus

    def _folder(self, infrastructure: str) -> Path:
        return self.root / INTENT_DIR / _segment(infrastructure)

    def load(self, infrastructure: str) -> Intent:
        """Le document de l'infrastructure, ou le document vide si rien n'a jamais été écrit."""
        path = self._folder(infrastructure) / INTENT_FILE
        if not path.exists():
            return empty_intent(infrastructure)
        try:
            intent = Intent.model_validate(json.loads(path.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, ValidationError) as exc:
            log.warning(
                "document d'intention hors contrat ou illisible, isolé : %r (%s)", str(path), type(exc).__name__
            )
            raise IntentCorruptError(str(path)) from exc
        if intent.infrastructure != infrastructure:
            log.warning("document d'intention d'une autre infrastructure à cet emplacement, isolé : %r", str(path))
            raise IntentCorruptError(str(path))
        return intent

    def apply(self, infrastructure: str, request: IntentOps, now: datetime) -> Intent:
        """Applique les opérations dans l'ordre et écrit le document résultant ; retourne ce document.

        Le journal est ouvert **avant** d'écrire le document : un journal inaccessible refuse la requête sans rien
        changer (revue B4, M1). Reste une fenêtre entre le renommage du document et l'écriture de la ligne (disque
        plein, coupure) : le document serait appliqué sans sa ligne ; la révision manquante dans le journal le dirait.
        """
        folder = self._folder(infrastructure)
        with locked(folder, self._local):
            current = self.load(infrastructure)
            updated = _applied(current, request, now)
            line = {
                "at": utc_z(now),
                "author": request.author,
                "revision": updated.revision,
                "ops": [op.model_dump(mode="json") for op in request.ops],
            }
            with (folder / JOURNAL_FILE).open("a", encoding="utf-8") as journal:
                write_atomically(folder / INTENT_FILE, canonical_json(updated))
                journal.write(json.dumps(line, ensure_ascii=False, sort_keys=True) + "\n")
                journal.flush()
                os.fsync(journal.fileno())
        return updated


def _applied(current: Intent, request: IntentOps, now: datetime) -> Intent:
    pins = {pin.hostname: pin for pin in current.pins}
    for op in request.ops:
        if op.op == "pin":
            pins[op.hostname] = Pin(hostname=op.hostname, x=op.x, y=op.y, author=request.author, at=now)
        else:
            pins.pop(op.hostname, None)
    if len(pins) > MAX_PINS:
        raise IntentLimitError(f"plus de {MAX_PINS} épingles pour une infrastructure")
    return Intent(
        intent_version=INTENT_VERSION,
        infrastructure=current.infrastructure,
        revision=current.revision + 1,
        updated_at=now,
        pins=tuple(pins[name] for name in sorted(pins)),
    )
