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
_FOLDER_LOCKS: dict[Path, threading.Lock] = {}
_REGISTRY = threading.Lock()


def folder_lock(folder: Path) -> threading.Lock:
    """Le verrou de fil d'un dossier, le même pour tout le processus : deux écrivains d'un même dossier (le store
    d'intention, la purge du journal) s'excluent aussi là où le verrou de fichier n'existe pas (revue, B9)."""
    key = Path(folder).resolve()
    with _REGISTRY:
        return _FOLDER_LOCKS.setdefault(key, threading.Lock())


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


def fsync_dir(folder: Path) -> None:
    """Le renommage écrit sur disque : sans lui, une coupure de courant peut défaire l'ordre de deux renommages."""
    fd = os.open(folder, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def replace_bytes(path: Path, payload: bytes, like: Path | None = None) -> None:
    """Comme `write_atomically`, en octets (une ligne gardée l'est octet pour octet, même mal encodée), puis le dossier
    synchronisé. `like` : le fichier dont le nouveau prend le mode, et le propriétaire quand on est root (une purge
    lancée sous `sudo` ne doit ni ouvrir un journal d'audit à tous, ni le rendre inaccessible au serveur)."""
    tmp = path.parent / f"{TMP_PREFIX}{path.name}-{uuid4().hex}"
    try:
        with tmp.open("wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        if like is not None:
            st = like.stat()
            os.chmod(tmp, st.st_mode & 0o7777)
            if hasattr(os, "geteuid") and os.geteuid() == 0:
                os.chown(tmp, st.st_uid, st.st_gid)
        tmp.replace(path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    fsync_dir(path.parent)
