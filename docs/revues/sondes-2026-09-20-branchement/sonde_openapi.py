"""Sonde b : noms de schémas avant / après, collisions, validité du document."""
import json
from pathlib import Path
from tempfile import mkdtemp

from ld_contracts.bundle import RunBundle
from ld_contracts.snapshot import Snapshot
from pydantic.json_schema import models_json_schema

from ld_backend import api
from ld_backend.config import Settings

TPL = "#/components/schemas/{model}"
# AVANT (technique décrite dans la demande) : RunBundle seul + $defs
old = RunBundle.model_json_schema(ref_template=TPL)
old_defs = dict(old.pop("$defs"))
old_defs["RunBundle"] = old
new = api._contract_schemas()

print("schémas avant (bundle seul) :", len(old_defs), " après (deux contrats) :", len(new))
missing = sorted(set(old_defs) - set(new))
print("noms du bundle disparus / renommés :", missing)
changed = sorted(n for n in old_defs if n in new and old_defs[n] != new[n])
print("schémas du bundle dont le CONTENU a changé :", changed)
for n in changed[:5]:
    a, b = old_defs[n], new[n]
    print("  ", n, "clés avant", sorted(a), "clés après", sorted(b))
    for k in sorted(set(a) | set(b)):
        if a.get(k) != b.get(k):
            print("     diff sur", k, ":", json.dumps(a.get(k))[:120], "→", json.dumps(b.get(k))[:120])
print("noms qualifiés par module (signe d'une homonymie) :", sorted(n for n in new if "__" in n))

# Snapshot seul vs passe commune
snap = Snapshot.model_json_schema(ref_template=TPL)
snap_defs = dict(snap.pop("$defs")); snap_defs["Snapshot"] = snap
print("noms du snapshot renommés par la passe commune :", sorted(set(snap_defs) - set(new)))
shared = sorted(set(old_defs) & set(snap_defs))
print("types partagés :", shared)
print("types partagés au contenu différent selon le contrat :", [n for n in shared if old_defs[n] != snap_defs[n]])

# Document complet
app = api.create_app(Settings(api_token="t", archive_dir=Path(mkdtemp(dir=Path(__file__).resolve().parent)), max_bundle_bytes=1000))
doc = app.openapi()
schemas = doc["components"]["schemas"]
api_names = sorted(set(schemas) - set(new))
print("schémas propres à l'API :", api_names)
print("openapi :", doc["openapi"], " titres en double :", len(schemas) - len({s.get('title', n) for n, s in schemas.items()}))
try:
    from openapi_spec_validator import validate
    validate(doc); print("openapi-spec-validator : OK")
except ImportError:
    print("openapi-spec-validator absent : validité structurelle non vérifiée par un outil tiers")
Path(__file__).with_name("openapi.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False))
