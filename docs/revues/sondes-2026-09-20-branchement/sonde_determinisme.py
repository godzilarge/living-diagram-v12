"""Sonde a0 : le snapshot rangé par l'ingestion dépend-il de la LIVRAISON ou du bundle ARCHIVÉ ?

Scénario annoncé par le README : B1 échoue à la 1re livraison ; après correction « la même livraison renvoyée »
donne son snapshot à la run. Un ré-export légitime a un autre `produced_at` / `exporter_version` (hors empreinte).
"""
import difflib
import json
from pathlib import Path
from tempfile import mkdtemp

from ld_backend import snapshots
from ld_backend.archive import BundleArchive
from ld_backend.ingest import ingest_bundle

HERE = Path(__file__).resolve().parent
doc = json.loads(Path("../contracts/fixtures/bundle-minimal.json").read_text(encoding="utf-8"))
INFRA, RUN = doc["infrastructure"], doc["run"]["collector_run_id"]
archive = BundleArchive(Path(mkdtemp(dir=HERE)))
real = snapshots.correlate


def boom(*_):
    raise RuntimeError("bug de B1")


snapshots.correlate = boom
first = ingest_bundle(doc, archive)
print("1re livraison :", first.status, "/", first.correlation.status, "| produced_at archivé :", doc["produced_at"], doc["exporter_version"])
snapshots.correlate = real  # B1 corrigé, serveur relancé
reexport = {**doc, "produced_at": "2026-09-12T08:30:00Z", "exporter_version": "9.9.9"}
second = ingest_bundle(reexport, archive)
print("ré-export     :", second.status, "/", second.correlation.status)
by_ingest = archive.load_snapshot_bytes(INFRA, RUN)
src = json.loads(by_ingest)["source"]
print("snapshot.source :", {k: src[k] for k in ("bundle_sha256", "produced_at", "exporter_version")})
archived = archive.load_bundle(INFRA, RUN)
print("bundle archivé  :", {"sha256": archive.find_run(INFRA, RUN).sha256, "produced_at": archived["produced_at"], "exporter_version": archived["exporter_version"]})
snapshots.recorrelate(archive, INFRA, RUN)
by_cli = archive.load_snapshot_bytes(INFRA, RUN)
print("\nmêmes octets entre l'ingestion et `ld correlate` sur la même run archivée ?", by_ingest == by_cli)
for line in difflib.unified_diff(by_ingest.decode().splitlines(), by_cli.decode().splitlines(), "ingestion", "ld correlate", lineterm="", n=0):
    print("  ", line)
