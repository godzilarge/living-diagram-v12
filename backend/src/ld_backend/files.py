"""Écriture de documents sur disque, partagée par les stores (intention, placement) : atomique, sous verrou."""

import os
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

try:
    import fcntl
except ImportError:  # pragma: no cover - hors Linux / macOS : verrou de processus seulement
    fcntl = None  # type: ignore[assignment]

LOCK_FILE = "lock"
TMP_PREFIX = ".tmp-"


@contextmanager
def locked(folder: Path, local: threading.Lock) -> Iterator[None]:
    """Un verrou de fichier par dossier (entre processus) doublé d'un verrou de fil (dans le processus)."""
    folder.mkdir(parents=True, exist_ok=True)
    with local, (folder / LOCK_FILE).open("a+b") as handle:
        if fcntl is not None:
            fcntl.flock(handle, fcntl.LOCK_EX)  # libéré à la fermeture du fichier
        yield


def write_atomically(path: Path, payload: str) -> None:
    """Temporaire, `fsync`, renommage : le fichier est entier ou absent, jamais tronqué."""
    tmp = path.parent / f"{TMP_PREFIX}{path.name}-{uuid4().hex}"
    try:
        with tmp.open("w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        tmp.replace(path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
