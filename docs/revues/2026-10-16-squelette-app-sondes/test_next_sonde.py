"""Sonde : la route /next/ au-delà de ses tests (cd backend && uv run pytest ../docs/revues/2026-10-16-squelette-app-sondes/test_next_sonde.py -q -p no:cacheprovider)."""

from pathlib import Path

from fastapi.testclient import TestClient

from ld_backend.api import create_app
from ld_backend.config import Settings


def _client(tmp_path: Path) -> TestClient:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>x</title>", encoding="utf-8")
    (dist / "assets" / "a.js").write_text("1\n", encoding="utf-8")
    return TestClient(create_app(Settings(api_token="t", archive_dir=tmp_path / "archive", app_dist=dist)))


def test_problem_media_type_and_body(tmp_path: Path):
    res = _client(tmp_path).get("/next/missing.js")
    print("404", res.headers.get("content-type"), res.json(), res.headers.get("content-security-policy"))
    assert res.status_code == 404


def test_etag_forms_a_browser_may_send(tmp_path: Path):
    client = _client(tmp_path)
    etag = client.get("/next/assets/a.js").headers["etag"]
    for sent in (etag, f"W/{etag}", f'"other", {etag}', "*"):
        print(repr(sent), client.get("/next/assets/a.js", headers={"If-None-Match": sent}).status_code)


def test_head_and_no_slash(tmp_path: Path):
    client = _client(tmp_path)
    print("HEAD /next/", client.head("/next/").status_code)
    print("GET /next", client.get("/next", follow_redirects=False).status_code)
