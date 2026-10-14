"""Serveur d'audit : uvicorn, trois runs demo-dc, intentions semées. Usage : serve.py ARCHIVE_DIR URL_FILE"""
from __future__ import annotations

import struct
import sys
import threading
import zlib
from pathlib import Path

import httpx

from ld_backend.config import Settings
import ld_backend.render.app as _A
from pathlib import Path as _P
_A.APP_ASSETS = _P("/tmp/claude-1000/-home-otosun-development-applications-demo-living-diagram-v12-biturbo/b83f1eef-1619-448a-b662-7c62ccd93626/scratchpad/audit-usage/head/backend/src/ld_backend/render/assets/app")
from tests.test_view import _serve

SAMPLES = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo/samples/demo-dc")
TOKEN = "tok-audit"


def png(w=64, h=40):
    raw = b"".join(b"\x00" + bytes([40, 120, 200]) * w for _ in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


settings = Settings(api_token=TOKEN, archive_dir=Path(sys.argv[1]), max_bundle_bytes=50_000_000)
server, thread, base = _serve(settings)
auth = {"Authorization": f"Bearer {TOKEN}"}
for f in ("run-01.json", "run-02.json", "run-03.json"):
    r = httpx.post(f"{base}/api/ingest/bundles", content=(SAMPLES / f).read_bytes(),
                   headers={**auth, "Content-Type": "application/json"}, timeout=120)
    print(f, r.status_code, flush=True)
url = f"{base}/api/intent/patches?infrastructure=demo-dc"


def post(author, ops):
    r = httpx.post(url, json={"author": author, "ops": ops}, headers=auth, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


a = httpx.post(f"{base}/api/intent/assets?infrastructure=demo-dc", content=png(),
               headers={**auth, "Content-Type": "image/png"}).json()
print("asset", a, flush=True)
asset = a.get("asset") or a.get("id") or a.get("sha256")
post("orhan", [{"op": "pin", "hostname": "dc01-core-01", "x": 100, "y": 40}])
post("orhan", [{"op": "pin", "hostname": h, "x": 300 + i * 40, "y": 80}
               for i, h in enumerate(("dc01-acc-01", "dc01-acc-02", "dc01-acc-03"))])
post("claire", [{"op": "color", "hostname": "dc01-fw-01", "hue": "red"}])
post("claire", [{"op": "group_create", "label": "Cœur DC01", "members": ["dc01-core-01", "dc01-core-02"]}])
post("claire", [{"op": "group_create", "label": "Accès DC02", "members": ["dc02-acc-01", "dc02-acc-02", "dc02-acc-03"]}])
post("orhan", [{"op": "annotation_create", "content": {"kind": "note", "text": "Salle B, baie 4"}, "x": -300, "y": -200}])
post("orhan", [{"op": "annotation_create", "content": {"kind": "shape", "shape": "rectangle", "label": "Zone DMZ"},
                "x": -300, "y": -60, "w": 200, "h": 100}])
post("orhan", [{"op": "annotation_create",
                "content": {"kind": "table", "header": True, "rows": [["Port", "VLAN"], ["Eth1/1", "10"], ["Eth1/2", "20"]],
                            "widths": None, "heights": None, "merges": []},
                "x": -300, "y": 80, "w": 200, "h": 90}])
if asset:
    post("orhan", [{"op": "annotation_create", "content": {"kind": "image", "asset": asset, "alt": "plan de salle"},
                    "x": -300, "y": 220, "w": 128, "h": 80}])
post("claire", [{"op": "connector_create", "start": {"kind": "free", "x": -80, "y": -200},
                 "end": {"kind": "device", "ref": "dc01-core-01", "side": "auto"}, "label": "uplink"}])
post("orhan", [{"op": "color_type", "type": "router", "hue": "amber"}])
post("orhan", [{"op": "group_create", "label": "Temp", "members": ["dc02-rt-01"]}])
intent = httpx.get(f"{base}/api/intent?infrastructure=demo-dc", headers=auth).json()
temp = [g for g in intent["groups"] if g["label"] == "Temp"][0]
post("claire", [{"op": "group_delete", "id": temp["id"]}])
post("orhan", [{"op": "uncolor", "hostname": "dc01-fw-01"}])
post("orhan", [{"op": "color", "hostname": "dc01-fw-01", "hue": "violet"}])
Path(sys.argv[2]).write_text(base)
print("READY", base, flush=True)
threading.Event().wait()
