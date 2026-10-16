"""`GET /next/`: the v2 application (`app/dist`), served without token under the CSP of `/`, read at request time."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ld_backend.api import create_app
from ld_backend.config import DEFAULT_APP_DIST, Settings
from ld_backend.render.app import APP_CSP
from ld_backend.render.next import NEXT_CSP, next_file_names

INDEX = (
    '<!doctype html><html><head><script type="module" crossorigin src="/next/assets/main.js"></script>'
    '<link rel="stylesheet" href="/next/assets/main.css"></head><body><div id="root"></div></body></html>'
)


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    root = tmp_path / "dist"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text(INDEX, encoding="utf-8")
    (root / "primitives.html").write_text(INDEX.replace("main", "primitives"), encoding="utf-8")
    (root / "assets" / "main.js").write_text("console.log(1);\n", encoding="utf-8")
    (root / "assets" / "main.css").write_text("body{margin:0}\n", encoding="utf-8")
    (root / "assets" / "archivo.woff2").write_bytes(b"wOF2fake")
    (root / "notes.txt").write_text("not served\n", encoding="utf-8")
    return root


def _client(tmp_path: Path, dist: Path) -> TestClient:
    return TestClient(create_app(Settings(api_token="t", archive_dir=tmp_path / "archive", app_dist=dist)))


def test_the_shell_is_served_without_token_under_the_csp_of_the_application(tmp_path: Path, dist: Path):
    res = _client(tmp_path, dist).get("/next/")
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/html")
    assert res.headers["content-security-policy"] == NEXT_CSP == APP_CSP
    assert "'unsafe" not in NEXT_CSP and "default-src 'none'" in NEXT_CSP
    assert res.text == INDEX and res.headers["cache-control"] == "no-cache"


def test_the_build_files_are_served_with_their_type_and_an_etag(tmp_path: Path, dist: Path):
    client = _client(tmp_path, dist)
    for path, media in (
        ("/next/primitives.html", "text/html"),
        ("/next/assets/main.js", "text/javascript"),
        ("/next/assets/main.css", "text/css"),
        ("/next/assets/archivo.woff2", "font/woff2"),
    ):
        res = client.get(path)
        assert res.status_code == 200 and res.headers["content-type"].startswith(media), path
        assert res.headers["content-security-policy"] == NEXT_CSP
    script = client.get("/next/assets/main.js")
    again = client.get("/next/assets/main.js", headers={"If-None-Match": script.headers["etag"]})
    assert again.status_code == 304 and again.content == b""


def test_a_conditional_request_reads_if_none_match_as_the_rfc_does_and_head_answers(tmp_path: Path, dist: Path):
    client = _client(tmp_path, dist)
    etag = client.get("/next/assets/main.js").headers["etag"]
    for header in (etag, "W/" + etag, '"other", ' + etag, "*"):
        assert client.get("/next/assets/main.js", headers={"If-None-Match": header}).status_code == 304, header
    assert client.get("/next/assets/main.js", headers={"If-None-Match": '"other"'}).status_code == 200
    head = client.head("/next/")
    assert head.status_code == 200 and head.content == b"" and head.headers["content-security-policy"] == NEXT_CSP
    assert client.head("/next/missing.js").status_code == 404


def test_files_are_read_at_request_time(tmp_path: Path, dist: Path):
    client = _client(tmp_path, dist)
    assert client.get("/next/assets/main.js").text == "console.log(1);\n"
    (dist / "assets" / "main.js").write_text("console.log(2);\n", encoding="utf-8")
    (dist / "assets" / "late.js").write_text("late\n", encoding="utf-8")
    assert client.get("/next/assets/main.js").text == "console.log(2);\n"
    assert client.get("/next/assets/late.js").status_code == 200


def test_without_a_build_next_is_a_404_problem_and_the_v1_still_answers(tmp_path: Path):
    client = _client(tmp_path, tmp_path / "missing")
    for path in ("/next/", "/next/index.html", "/next/assets/main.js"):
        res = client.get(path)
        assert res.status_code == 404, path
        assert res.json() == {"code": "file_unknown", "detail": "unknown file"}
    assert client.get("/").status_code == 200


def test_an_unknown_escaped_or_unserved_path_is_a_404(tmp_path: Path, dist: Path):
    outside = tmp_path / "secret.js"
    outside.write_text("secret\n", encoding="utf-8")
    (dist / "assets" / "link.js").symlink_to(outside)
    (dist / "linked").symlink_to(tmp_path, target_is_directory=True)
    client = _client(tmp_path, dist)
    for path in (
        "/next/missing.js",
        "/next/../secret.js",
        "/next/%2e%2e/secret.js",
        "/next/assets/%2e%2e/%2e%2e/secret.js",
        "/next/assets/link.js",
        "/next/linked/secret.js",
        "/next/notes.txt",
        "/next/assets",
        "/next/assets/",
    ):
        res = client.get(path)
        assert res.status_code == 404, (path, res.status_code)
        assert b"secret" not in res.content and str(tmp_path).encode() not in res.content
    listed = next_file_names(dist)
    assert "assets/link.js" not in listed and not any(n.startswith("linked/") for n in listed)


def test_the_build_folder_comes_from_ld_app_dist(tmp_path: Path):
    base = {"LD_API_TOKEN": "t"}
    assert Settings.from_env(base).app_dist == DEFAULT_APP_DIST
    assert DEFAULT_APP_DIST.parts[-2:] == ("app", "dist")
    assert Settings.from_env({**base, "LD_APP_DIST": str(tmp_path)}).app_dist == tmp_path
    assert Settings.from_env({**base, "LD_APP_DIST": "  "}).app_dist == DEFAULT_APP_DIST


NOT_BUILT = not (DEFAULT_APP_DIST / "index.html").is_file()


@pytest.mark.skipif(NOT_BUILT, reason="app/ is not built (cd app && npm run build)")
def test_the_real_build_is_served_with_every_file_it_references(tmp_path: Path):
    """The build of `app/` itself: every script, style and font the shell and the primitives page name is served."""
    import re

    client = TestClient(create_app(Settings(api_token="t", archive_dir=tmp_path / "archive")))
    for page in ("/next/", "/next/primitives.html"):
        html = client.get(page)
        assert html.status_code == 200, page
        assert not re.search(r"<script(?![^>]*\bsrc=)", html.text), "no inline script"
        assert "style=" not in html.text and not re.search(r"https?://", html.text)
        for ref in re.findall(r'(?:src|href)="(/next/[^"]+)"', html.text):
            assert client.get(ref).status_code == 200, ref
    css = [n for n in next_file_names(DEFAULT_APP_DIST) if n.endswith(".css")]
    fonts = {f for n in css for f in re.findall(r"url\(/next/([^)]+\.woff2)\)", (DEFAULT_APP_DIST / n).read_text())}
    assert fonts, "Archivo is self-hosted"
    for font in fonts:
        assert client.get("/next/" + font).headers["content-type"] == "font/woff2"
