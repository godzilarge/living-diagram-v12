"""Le magasin des images d'annotation (docs/10 §6) : envoi reconnu aux octets, lecture avec le type vérifié,
suppression refusée tant qu'une annotation cite le fichier ; bornes ; jamais un SVG."""

import struct
import zlib

import pytest
from fastapi.testclient import TestClient

from ld_backend.assets import AssetTypeError, sniff

URL = "/api/ingest/bundles"
ASSETS = "/api/intent/assets"
PATCHES = "/api/intent/patches"
PARAMS = {"infrastructure": "infra-lab"}


def png(width: int = 3, height: int = 2) -> bytes:
    """Un PNG valide et minuscule, écrit à la main (en-tête, IHDR, IDAT, IEND)."""

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + b"\x80\x80\x80" * width for _ in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def jpeg_header(width: int = 640, height: int = 480) -> bytes:
    """Les premiers segments d'un JPEG : SOI, APP0, puis SOF0 avec ses dimensions (assez pour l'en-tête)."""
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sof0 = b"\xff\xc0" + struct.pack(">HBHHB", 11, 8, height, width, 1) + b"\x01\x11\x00"
    return b"\xff\xd8" + app0 + sof0 + b"\xff\xd9"


def webp_vp8x(width: int = 200, height: int = 100) -> bytes:
    size = (width - 1).to_bytes(3, "little") + (height - 1).to_bytes(3, "little")
    body = b"WEBPVP8X" + struct.pack("<I", 10) + b"\x00\x00\x00\x00" + size
    return b"RIFF" + struct.pack("<I", len(body)) + body


def test_sniff_recognises_the_three_types_by_their_bytes_and_refuses_the_rest():
    assert sniff(png(3, 2)) == ("image/png", 3, 2)
    assert sniff(jpeg_header(640, 480)) == ("image/jpeg", 640, 480)
    assert sniff(webp_vp8x(200, 100)) == ("image/webp", 200, 100)
    for bad in (b"<svg xmlns='http://www.w3.org/2000/svg'/>", b"GIF89a", b"", b"\x89PNG\r\n\x1a\nxxxx"):
        with pytest.raises(AssetTypeError):
            sniff(bad)


def test_upload_read_cite_and_delete(client: TestClient, auth, bundle_dict):
    """Envoi 201 puis 200 (même empreinte), lecture avec le type vérifié et `nosniff`, citation par une annotation,
    suppression refusée tant qu'elle est citée, puis acceptée."""
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    data = png(4, 3)
    headers = {**auth, "Content-Type": "image/png"}
    res = client.post(ASSETS, params=PARAMS, content=data, headers=headers)
    assert res.status_code == 201, res.text
    receipt = res.json()
    assert receipt["media_type"] == "image/png" and (receipt["width"], receipt["height"]) == (4, 3)
    assert receipt["bytes"] == len(data) and len(receipt["asset"]) == 64
    assert client.post(ASSETS, params=PARAMS, content=data, headers=headers).status_code == 200, "déjà là"
    # le type déclaré ne fait pas foi : un PNG annoncé JPEG est rangé comme PNG
    lied = client.post(ASSETS, params=PARAMS, content=data, headers={**auth, "Content-Type": "image/jpeg"})
    assert lied.status_code == 200 and lied.json()["media_type"] == "image/png"
    got = client.get(ASSETS, params={**PARAMS, "asset": receipt["asset"]}, headers=auth)
    assert got.status_code == 200 and got.content == data and got.headers["content-type"] == "image/png"
    assert got.headers["x-content-type-options"] == "nosniff" and "immutable" in got.headers["cache-control"]
    assert client.get(ASSETS, params={**PARAMS, "asset": "0" * 64}, headers=auth).status_code == 404
    assert client.get(ASSETS, params={**PARAMS, "asset": "../x"}, headers=auth).status_code == 404
    # citée par une annotation : la suppression est refusée ; une empreinte inconnue est refusée à la création
    create = {"op": "annotation_create", "content": {"kind": "image", "asset": receipt["asset"], "alt": "la baie"}}
    res = client.post(PATCHES, params=PARAMS, json={"author": "orhan", "ops": [create]}, headers=auth)
    assert res.status_code == 200 and res.json()["annotations"][0]["content"]["asset"] == receipt["asset"]
    made = res.json()["annotations"][0]
    assert (made["w"], made["h"]) == (320, 240), "la taille par défaut d'une image"
    unknown = {"op": "annotation_create", "content": {"kind": "image", "asset": "1" * 64, "alt": ""}}
    res = client.post(PATCHES, params=PARAMS, json={"author": "orhan", "ops": [unknown]}, headers=auth)
    assert res.status_code == 422 and "image inconnue" in res.text
    assert client.delete(ASSETS, params={**PARAMS, "asset": receipt["asset"]}, headers=auth).status_code == 409
    delete = {"op": "annotation_delete", "id": "a1-1"}
    assert (
        client.post(PATCHES, params=PARAMS, json={"author": "orhan", "ops": [delete]}, headers=auth).status_code == 200
    )
    assert client.delete(ASSETS, params={**PARAMS, "asset": receipt["asset"]}, headers=auth).status_code == 204
    assert client.delete(ASSETS, params={**PARAMS, "asset": receipt["asset"]}, headers=auth).status_code == 404


def test_refusals_svg_wrong_type_too_large_no_run_no_token(client: TestClient, auth, bundle_dict, settings):
    as_png = {**auth, "Content-Type": "image/png"}
    assert client.post(ASSETS, params=PARAMS, content=png(), headers=as_png).status_code == 404, "sans run archivée"
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    res = client.post(ASSETS, params=PARAMS, content=svg, headers=as_png)
    assert res.status_code == 422 and "octets de tête" in res.text
    as_svg = {**auth, "Content-Type": "image/svg+xml"}
    assert client.post(ASSETS, params=PARAMS, content=svg, headers=as_svg).status_code == 415
    assert client.post(ASSETS, params=PARAMS, content=png(), headers={"Content-Type": "image/png"}).status_code == 401
    big = png() + b"\x00" * (settings.max_asset_bytes + 1)
    assert client.post(ASSETS, params=PARAMS, content=big, headers=as_png).status_code == 413


def test_the_cli_lists_images_and_says_which_no_annotation_cites(
    client: TestClient, auth, bundle_dict, settings, capsys
):
    from ld_backend import cli

    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    as_png = {**auth, "Content-Type": "image/png"}
    receipt = client.post(ASSETS, params=PARAMS, content=png(5, 5), headers=as_png).json()
    assert cli.main(["intent", "--infrastructure", "infra-lab", "--archive", str(settings.archive_dir)]) == 0
    out = capsys.readouterr().out
    assert f"image {receipt['asset'][:12]}…\timage/png\t5x5" in out and "citée par aucune annotation" in out


def test_openapi_describes_the_asset_routes(client: TestClient):
    doc = client.get("/openapi.json").json()
    assert set(doc["paths"][ASSETS]) == {"post", "get", "delete"}
    assert "AssetReceipt" in doc["components"]["schemas"]
