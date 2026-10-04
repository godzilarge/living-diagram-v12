"""Sonde A : le store d'intention (B4) sous concurrence entre processus, journal, bornes du contrat, croissance.

Commande : cd backend && uv run python ../docs/revues/sondes-2026-10-04-b4-intention/probe_store.py
"""

import json
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

from ld_contracts.intent import Intent, Pin
from pydantic import ValidationError

from ld_backend.archive import _segment
from ld_backend.intent import IntentStore
from ld_backend.schemas import IntentOps, PinOp

NOW = datetime(2026, 10, 4, 18, 30, tzinfo=UTC)
WORKER = """
import sys
from datetime import UTC, datetime
from pathlib import Path
from ld_backend.intent import IntentStore
from ld_backend.schemas import IntentOps, PinOp
root, prefix, count = Path(sys.argv[1]), sys.argv[2], int(sys.argv[3])
store = IntentStore(root)
for i in range(count):
    store.apply("infra", IntentOps(author=prefix, ops=[PinOp(op="pin", hostname=f"{prefix}-{i:03d}", x=i, y=0)]), now=datetime.now(UTC))
"""


def a1_processes() -> None:
    root = Path(tempfile.mkdtemp()) / "archive"
    procs = [subprocess.Popen([sys.executable, "-c", WORKER, str(root), name, "25"]) for name in ("p1", "p2", "p3", "p4")]
    codes = [p.wait() for p in procs]
    final = IntentStore(root).load("infra")
    journal = [json.loads(line)["revision"] for line in (root / "_intent" / "infra" / "journal.jsonl").read_text().splitlines()]
    print(f"A1 4 processus × 25 épingles : codes {codes} · revision {final.revision} · pins {len(final.pins)} · journal {len(journal)} lignes, révisions uniques {len(set(journal))}, triées {journal == sorted(journal)}")


def a2_journal_after_document() -> None:
    root = Path(tempfile.mkdtemp()) / "archive"
    store = IntentStore(root)
    folder = root / "_intent" / "infra"
    folder.mkdir(parents=True)
    (folder / "journal.jsonl").mkdir()  # le journal ne peut pas s'ouvrir en écriture
    try:
        store.apply("infra", IntentOps(author="a", ops=[PinOp(op="pin", hostname="h", x=1, y=1)]), now=NOW)
        print("A2 apply : aucune erreur (inattendu)")
    except OSError as exc:
        doc = json.loads((folder / "intent.json").read_text())
        print(f"A2 journal inaccessible : apply lève {type(exc).__name__}, mais intent.json est déjà écrit : revision {doc['revision']}, pins {len(doc['pins'])} (acceptée sans journal)")


def a3_segment() -> None:
    for label in ("_intent", "../x", "a/b", "intent", "." , "x" * 300):
        print(f"A3 _segment({label[:12]!r}{'…' if len(label) > 12 else ''}) = {_segment(label)!r}")


def a4_bounds() -> None:
    big = Pin.model_validate({"hostname": "h" * 1_000_000, "x": 0, "y": 0, "author": "a", "at": "2026-10-04T18:30:00Z"})
    print(f"A4 hostname de 1 000 000 caractères : accepté par le contrat ({len(big.hostname)})")
    for author in ("​", "\x1b[31mrouge\x1b[0m", "a\nb"):
        ok = IntentOps.model_validate({"author": author, "ops": [{"op": "pin", "hostname": "h", "x": 0, "y": 0}]})
        print(f"A4 auteur {author!r} : accepté par l'API ({ok.author!r})")
    try:
        Intent.model_validate({"intent_version": "1.0.0", "infrastructure": "i", "revision": 1, "updated_at": "2026-10-04T18:00:00Z",
            "pins": [{"hostname": "h", "x": 0, "y": 0, "author": "a", "at": "2026-10-04T18:30:00Z"}]})
        print("A4 updated_at antérieur à pin.at : accepté par le contrat")
    except ValidationError as exc:
        print(f"A4 updated_at antérieur à pin.at : refusé ({exc.errors()[0]['type']})")


def a5_growth() -> None:
    root = Path(tempfile.mkdtemp()) / "archive"
    store = IntentStore(root)
    timings = []
    for batch in range(40):
        ops = [PinOp(op="pin", hostname=f"host-{batch:02d}-{i:03d}-" + "x" * 50, x=i, y=batch) for i in range(500)]
        t0 = time.perf_counter()
        store.apply("infra", IntentOps(author="a", ops=ops), now=NOW)
        timings.append(time.perf_counter() - t0)
    size = (root / "_intent" / "infra" / "intent.json").stat().st_size
    t0 = time.perf_counter()
    doc = store.load("infra")
    load = time.perf_counter() - t0
    print(f"A5 40 requêtes × 500 épingles (hostnames de 64 car.) : {len(doc.pins)} épingles, intent.json {size / 1e6:.1f} Mo · apply 1re {timings[0] * 1000:.0f} ms, 40e {timings[-1] * 1000:.0f} ms · load {load * 1000:.0f} ms")


if __name__ == "__main__":
    a1_processes()
    a2_journal_after_document()
    a3_segment()
    a4_bounds()
    a5_growth()
