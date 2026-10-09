"""La purge du journal d'intention (2026-10-10, choix d'Orhan : une commande d'administrateur, jamais un bouton).

En une phrase : **les lignes antérieures à une date, d'une ou plusieurs catégories, quittent `journal.jsonl` pour une
archive compressée, et une ligne de trace le dit.** Le journal est la trace d'audit de l'intention et l'auteur n'y est
que déclaré : la purge ne passe donc jamais par l'API, seulement par `ld journal prune`, sur la machine. Règles :
- une ligne (une requête) part si sa date est **strictement antérieure** à `before` et si **toutes** ses catégories sont
  parmi celles demandées (aucune catégorie demandée : toutes) ; une rafale mixte reste entière, jamais coupée ;
- rien n'est détruit : les lignes retirées sont écrites **telles quelles, octet pour octet**, dans
  `journal-archive/journal-pruned-<date>-<id>.jsonl.gz`, synchronisée sur disque avant que le journal ne soit réécrit ;
- une **ligne de trace** (`journal_prune` : combien, quelles révisions, avant quand, quelles catégories, quelle archive
  et son empreinte, par qui) est posée en tête du journal ; les traces de purge ne sont **jamais** purgées ;
- les noms des sujets (« le groupe Cœur ») se rejouent depuis le début du journal : la trace emporte des **deltas**
  (`seed`), chacun attaché à la révision de l'entrée gardée où il s'applique, calculés en rejouant côte à côte le
  journal d'origine et le journal purgé (`journal.Replayer`) : chaque entrée gardée se lit exactement comme avant ; un
  delta ne porte que les sujets que les entrées gardées citent ;
- les lignes illisibles restent telles quelles ; une dernière ligne sans fin de ligne (écriture interrompue : on tient
  le verrou, aucune n'est en cours) reste aussi, terminée par une fin de ligne pour que la suivante ne s'y colle pas ;
- la réécriture est atomique, sous le verrou du store d'intention, et garde le mode du journal (et son propriétaire sous
  root) : une requête acceptée pendant la purge attend, puis s'ajoute au journal réécrit.
"""

import gzip
import hashlib
import json
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from ld_backend.archive import _segment
from ld_backend.files import folder_lock, fsync_dir, locked, replace_bytes
from ld_backend.intent import INTENT_DIR, JOURNAL_FILE
from ld_backend.journal import (
    CATEGORIES,
    PRUNE_OP,
    Replayer,
    categories_of,
    created_ids,
    is_trace,
    moment_of,
    texts_of,
    valid_line,
)
from ld_backend.schemas import utc_z

ARCHIVE_DIR = "journal-archive"
AUTHOR_MAX = 80


class JournalPruneError(ValueError):
    """Une purge impossible telle que demandée (date, catégorie, auteur) : rien n'est écrit."""


class JournalNotFoundError(LookupError):
    """L'infrastructure n'a pas de journal."""


@dataclass(frozen=True)
class PruneResult:
    removed: int
    kept: int
    archive: Path | None  # None : rien à retirer, ou essai à blanc
    dry_run: bool


def _check(before: datetime, categories: tuple[str, ...], author: str, now: datetime) -> None:
    if before.tzinfo is None:
        raise JournalPruneError("la date doit porter un fuseau (ou être une date seule, lue en UTC)")
    if before > now:
        raise JournalPruneError("la date est dans le futur : rien ne peut lui être antérieur sans tout retirer")
    if any(c not in CATEGORIES for c in categories):
        raise JournalPruneError("catégorie inconnue ; attendues : " + ", ".join(CATEGORIES))
    # ni contrôle (C0, DEL, C1), ni séparateur de ligne ou de paragraphe (revue, B3)
    bad = any(unicodedata.category(ch) in ("Cc", "Zl", "Zp") for ch in author)
    if not author.strip() or len(author) > AUTHOR_MAX or bad:
        raise JournalPruneError(f"l'auteur est requis : un nom de 1 à {AUTHOR_MAX} caractères, sans contrôle")


def _loads(row: bytes) -> Any:
    try:
        return json.loads(row.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        return None


def _removable(raw: Any, before: datetime, categories: tuple[str, ...]) -> bool:
    if not valid_line(raw) or is_trace(raw):
        return False  # illisible : gardée telle quelle ; la trace d'une purge ne se purge pas
    return moment_of(raw["at"]) < before and (  # type: ignore[operator]
        not categories or all(c in categories for c in categories_of(raw["ops"]))
    )


def _split(data: bytes) -> tuple[list[bytes], bytes]:
    """Les lignes complètes (vides comprises, octet pour octet), et la dernière sans fin de ligne, s'il y en a une."""
    body, newline, tail = data.rpartition(b"\n")
    return (body.split(b"\n") if newline else []), tail


def _cited(raws: list[dict[str, Any]]) -> set[str]:
    """Tout ce que des entrées peuvent nommer : les chaînes de leurs opérations et les identités qu'elles créent."""
    return {text for raw in raws for text in (*texts_of(raw["ops"]), *created_ids(raw))}


def _delta(full: dict[str, dict[str, Any]], partial: dict[str, dict[str, Any]], wanted: set[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in ("names", "forms", "ends"):
        a, b = full[key], partial[key]
        diff = {k: a.get(k) for k in set(a) | set(b) if k in wanted and a.get(k) != b.get(k)}
        if diff:
            out[key] = dict(sorted(diff.items()))
    return out


def _old_deltas(valid: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Les deltas des purges précédentes, comme le lecteur les applique (`journal._deltas`)."""
    seeds = [d for raw in reversed([r for r in valid if is_trace(r)]) for d in (raw.get("seed") or [])]
    return sorted((d for d in seeds if isinstance(d, dict) and type(d.get("at_revision")) is int), key=_at_revision)


def _at_revision(delta: dict[str, Any]) -> int:
    return delta["at_revision"]


def _deltas(infrastructure: str, parsed: list[Any], gone: list[bool]) -> list[dict[str, Any]]:
    """Rejoue côte à côte le journal d'origine (`full`) et le journal purgé (`partial`, les traces plus anciennes
    comprises) ; avant chaque entrée gardée, ce que `full` sait et que `partial` ne sait plus devient un delta."""
    old = _old_deltas([raw for raw in parsed if valid_line(raw)])
    full, partial = Replayer(infrastructure, old), Replayer(infrastructure, old)
    pairs = [(raw, out) for raw, out in zip(parsed, gone, strict=True) if valid_line(raw)]
    wanted = _cited([raw for raw, out in pairs if not out and not is_trace(raw)])
    deltas: list[dict[str, Any]] = []
    for raw, out in pairs:
        full.prepare(raw)
        if not out:
            partial.prepare(raw)
            delta = {} if is_trace(raw) else _delta(full.replay.state(), partial.replay.state(), wanted)
            if delta:
                partial.apply(delta)
                deltas.append({"at_revision": raw["revision"], **delta})
            partial.line(raw, 0, prepared=True)
        full.line(raw, 0, prepared=True)
    return deltas


def _archive(folder: Path, rows: list[bytes], now: datetime, like: Path) -> tuple[Path, str]:
    target = folder / ARCHIVE_DIR
    target.mkdir(parents=True, exist_ok=True)
    path = target / f"journal-pruned-{now.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:6]}.jsonl.gz"
    payload = gzip.compress(b"".join(row + b"\n" for row in rows), mtime=0)
    replace_bytes(path, payload, like=like)
    fsync_dir(folder)  # le dossier de l'archive lui-même, nouvellement créé
    return path, hashlib.sha256(payload).hexdigest()


def _trace(author: str, now: datetime, op: dict[str, Any], revision: int, seed: list[dict[str, Any]]) -> bytes:
    line = {"at": utc_z(now), "author": author, "revision": revision, "ops": [op], "seed": seed}
    return json.dumps(line, ensure_ascii=False, sort_keys=True).encode("utf-8")


def prune(
    root: Path,
    infrastructure: str,
    *,
    before: datetime,
    categories: tuple[str, ...] = (),
    author: str,
    now: datetime | None = None,
    dry_run: bool = False,
) -> PruneResult:
    """Retire du journal de l'infrastructure les lignes antérieures à `before` (des catégories demandées) ; voir le
    module. `JournalNotFoundError` si l'infrastructure n'a pas de journal."""
    now = now or datetime.now(UTC)
    _check(before, categories, author, now)
    folder = Path(root) / INTENT_DIR / _segment(infrastructure)
    path = folder / JOURNAL_FILE
    if not path.is_file():
        raise JournalNotFoundError(infrastructure)
    with locked(folder, folder_lock(folder)):
        rows, tail = _split(path.read_bytes())
        parsed = [_loads(row) for row in rows]
        gone = [_removable(raw, before, categories) for raw in parsed]
        removed = [row for row, out in zip(rows, gone, strict=True) if out]
        kept = [row for row, out in zip(rows, gone, strict=True) if not out]
        if dry_run or not removed:
            return PruneResult(removed=len(removed), kept=len(kept), archive=None, dry_run=dry_run)
        seed = _deltas(infrastructure, parsed, gone)
        archive, digest = _archive(
            folder, removed, now, path
        )  # d'abord l'archive : une réécriture échouée ne perd rien
        revisions = [raw["revision"] for raw, out in zip(parsed, gone, strict=True) if out]
        op = {
            "op": PRUNE_OP,
            "removed": len(removed),
            "first_revision": min(revisions),
            "last_revision": max(revisions),
            "before": utc_z(before),
            "categories": list(categories),
            "archive": f"{ARCHIVE_DIR}/{archive.name}",
            "sha256": digest,
        }
        revision = max((raw["revision"] for raw in parsed if valid_line(raw)), default=0)
        trace = _trace(author, now, op, revision, seed)
        unfinished = [tail] if tail else []  # terminée : la prochaine ligne acceptée ne s'y colle plus (revue, B2)
        replace_bytes(path, b"".join(row + b"\n" for row in [trace, *kept, *unfinished]), like=path)
    return PruneResult(removed=len(removed), kept=len(kept), archive=archive, dry_run=False)
