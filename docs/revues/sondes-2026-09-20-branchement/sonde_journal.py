"""Sonde a2 : que contient la trace de log.exception quand le contrat de sortie refuse le snapshot ?

On simule un bug de B1 : le vrai `correlate` tourne, puis le snapshot est reconstruit avec un défaut
(un nom d'interface vidé, une référence de câble vers un nœud inconnu) ⇒ ValidationError du contrat Snapshot.
"""
import io
import json
import logging
from pathlib import Path
from tempfile import mkdtemp

from ld_contracts.snapshot import Snapshot

from ld_backend import snapshots
from ld_backend.archive import BundleArchive
from ld_backend.correlate import correlate as real
from ld_backend.ingest import ingest_bundle, result_payload

FIX = Path(__file__).resolve()
doc = json.loads(Path("../contracts/fixtures/bundle-minimal.json").read_text(encoding="utf-8"))
# valeurs « sensibles » reconnaissables, posées dans le bundle
doc["interfaces"][0]["description"] = "CRIT|SECRET-VOISIN-42|Eth9/9|client-banque-x"


def buggy(bundle, sha):
    data = real(bundle, sha).model_dump(mode="json")
    target = next(i for i in data["interfaces"] if i.get("description") and "SECRET" in i["description"])
    target["speed_mbps"] = "pas-un-entier" if "speed_mbps" in target else None
    target["admin_status"] = {"cassé": target["description"]}  # type faux : pydantic cite l'entrée
    return Snapshot.model_validate(data)


snapshots.correlate = buggy
stream = io.StringIO()
logging.basicConfig(stream=stream, level=logging.INFO)
result = ingest_bundle(doc, BundleArchive(Path(mkdtemp(dir=Path(__file__).resolve().parent))))
out = stream.getvalue()
print("statut :", result.status, "/ correlation :", result.correlation.status)
print("réponse contient la valeur :", "SECRET-VOISIN-42" in json.dumps(result_payload(result)))
print("journal contient la valeur :", "SECRET-VOISIN-42" in out, "| 'client-banque-x' :", "client-banque-x" in out)
print("--- fin de la trace au journal ---")
print("\n".join(out.strip().splitlines()[-8:]))
