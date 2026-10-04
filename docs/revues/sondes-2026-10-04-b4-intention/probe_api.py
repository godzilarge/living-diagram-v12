"""Sonde B : ce qu'un client muni du jeton peut faire par `POST /api/intent/patches` au-delà de « poser des épingles ».

Commande : cd backend && uv run python ../docs/revues/sondes-2026-10-04-b4-intention/probe_api.py
"""

import io
import json
import sys
import tempfile
import time
from contextlib import redirect_stdout
from pathlib import Path

from fastapi.testclient import TestClient

from ld_backend import cli
from ld_backend.api import create_app
from ld_backend.config import Settings

ROOT = Path(__file__).resolve().parents[3]
BUNDLE = json.loads((ROOT / "contracts" / "fixtures" / "bundle-minimal.json").read_text(encoding="utf-8"))
TOKEN = "t"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
PARAMS = {"infrastructure": "infra-lab"}
PATCHES = "/api/intent/patches"


def main() -> None:
    archive = Path(tempfile.mkdtemp()) / "archive"
    settings = Settings(api_token=TOKEN, archive_dir=archive, max_bundle_bytes=200_000)
    client = TestClient(create_app(settings))
    assert client.post("/api/ingest/bundles", json=BUNDLE, headers=AUTH).status_code == 201

    # B1 : taille du corps. L'ingestion est bornée par LD_MAX_BUNDLE_BYTES (200 000 ici) ; la route des patchs ?
    huge = {"author": "a", "ops": [{"op": "pin", "hostname": "h" * 3_000_000, "x": 0, "y": 0}]}
    t0 = time.perf_counter()
    res = client.post(PATCHES, params=PARAMS, json=huge, headers=AUTH)
    doc = archive / "_intent" / "infra-lab" / "intent.json"
    print(f"B1 hostname de 3 Mo (corps > LD_MAX_BUNDLE_BYTES) : {res.status_code} en {time.perf_counter() - t0:.2f} s · intent.json {doc.stat().st_size / 1e6:.1f} Mo · GET /api/intent {len(client.get('/api/intent', params=PARAMS, headers=AUTH).content) / 1e6:.1f} Mo")
    client.post(PATCHES, params=PARAMS, json={"author": "a", "ops": [{"op": "unpin", "hostname": "h" * 3_000_000}]}, headers=AUTH)

    # B2 : forme du 422, sans écho de valeur ?
    for body, needle in (
        ({"author": "z" * 81, "ops": [{"op": "pin", "hostname": "h", "x": 0, "y": 0}]}, "zzzz"),
        ({"author": "a", "ops": [{"op": "pin", "hostname": "h", "x": 1.5, "y": 0}]}, "1.5"),
        ({"author": "a", "ops": [{"op": "move", "hostname": "h"}]}, "move"),
        ({"author": "a", "ops": [{"op": "pin", "hostname": "h", "x": 0, "y": 10**9}]}, "1000000000"),
    ):
        res = client.post(PATCHES, params=PARAMS, json=body, headers=AUTH)
        print(f"B2 {res.status_code} · valeur {needle!r} dans la réponse : {needle in res.text} · {res.json()['errors'][0]}")

    # B3 : caractères de contrôle dans l'auteur et le hostname, puis ce que `ld intent` imprime
    body = {"author": "\x1b[31mrouge\x1b[0m", "ops": [{"op": "pin", "hostname": "h\nligne2\t\x07", "x": 0, "y": 0}]}
    res = client.post(PATCHES, params=PARAMS, json=body, headers=AUTH)
    out = io.StringIO()
    with redirect_stdout(out):
        cli.main(["intent", "--infrastructure", "infra-lab", "--archive", str(archive)])
    print(f"B3 auteur et hostname avec ESC / LF / BEL : {res.status_code} · ld intent imprime brut : {'\\x1b' in repr(out.getvalue())} · sortie {out.getvalue().splitlines()[1:]!r}")
    client.post(PATCHES, params=PARAMS, json={"author": "a", "ops": [{"op": "unpin", "hostname": "h\nligne2\t\x07"}]}, headers=AUTH)

    # B4 : GET sur un libellé énorme n'écrit rien ; POST sur une infra sans run : 404
    res = client.get("/api/intent", params={"infrastructure": "x" * 30_000}, headers=AUTH)
    written = sorted(p.name for p in (archive / "_intent").iterdir())
    print(f"B4 GET libellé de 30 000 car. : {res.status_code} · dossiers _intent : {written}")
    res = client.post(PATCHES, params={"infrastructure": "inconnue"}, json={"author": "a", "ops": [{"op": "pin", "hostname": "h", "x": 0, "y": 0}]}, headers=AUTH)
    print(f"B4 POST infra sans run : {res.status_code} {res.json()['detail']!r}")

    # B5 : 500 opérations de 10 Ko chacune (5 Mo) : coût d'une requête, et de la suivante (le document est réécrit entier)
    ops = [{"op": "pin", "hostname": f"big-{i:03d}-" + "x" * 10_000, "x": i, "y": 0} for i in range(500)]
    t0 = time.perf_counter()
    res = client.post(PATCHES, params=PARAMS, json={"author": "a", "ops": ops}, headers=AUTH)
    first = time.perf_counter() - t0
    t0 = time.perf_counter()
    res2 = client.post(PATCHES, params=PARAMS, json={"author": "a", "ops": [{"op": "pin", "hostname": "petit", "x": 0, "y": 0}]}, headers=AUTH)
    second = time.perf_counter() - t0
    print(f"B5 500 × 10 Ko : {res.status_code} en {first:.2f} s ({doc.stat().st_size / 1e6:.1f} Mo) · puis une épingle d'un octet : {res2.status_code} en {second:.2f} s (réécriture entière)")

    # B6 : le dossier d'une infra remplacé par un fichier : 500 neutre ?
    other = archive / "_intent" / "autre"
    other.write_text("x")
    res = client.post(PATCHES, params={"infrastructure": "infra-lab"}, json={"author": "a", "ops": [{"op": "unpin", "hostname": "petit"}]}, headers=AUTH)
    print(f"B6 (témoin) unpin : {res.status_code}")

    # B7 : corps non JSON
    res = client.post(PATCHES, params=PARAMS, content="author=a", headers={**AUTH, "Content-Type": "text/plain"})
    print(f"B7 corps text/plain : {res.status_code} · {res.json().get('detail')!r}")

    # B8 : auteur à 80 caractères exactement avec blancs autour (strip) ; 81 après strip
    res = client.post(PATCHES, params=PARAMS, json={"author": "  " + "a" * 80 + "  ", "ops": [{"op": "unpin", "hostname": "x"}]}, headers=AUTH)
    print(f"B8 auteur 80 car. + blancs : {res.status_code}")


if __name__ == "__main__":
    sys.exit(main())
