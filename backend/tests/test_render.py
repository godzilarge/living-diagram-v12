"""Pages de visualisation : un fichier HTML autonome, hors ligne, qui n'écrit jamais une donnée en HTML."""

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from ld_backend import cli
from ld_backend.render import build_page_data, page_from_bundle, render_page
from tests.correlate.conftest import interface, lldp_doc, variant

SVG_NAMESPACE = "http://www.w3.org/2000/svg"
JS_TESTS = Path(__file__).parent / "js"
RUN_ID = "66db3f0e9a1c2b0012f4a7d1"
CHROMIUM = next(Path.home().glob(".cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell"), None)


def _hub(doc: dict) -> None:
    """Un port qui voit deux voisins : deux câbles sur `sw-core-01 · Ethernet1/5`, dont un vers un voisin inconnu."""
    doc["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0", ("station",)))
    doc["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "sw-core-02", "Ethernet1/4"))


def _page(bundle: dict) -> str:
    outcome = page_from_bundle(bundle, origin="bundle.json")
    assert outcome.page is not None, outcome.errors
    return outcome.page


def _block(page: str, tag: str, marker: str) -> str:
    found = re.search(rf"<{tag}{marker}>(.*?)</{tag}>", page, re.DOTALL)
    assert found, (tag, marker)
    return found.group(1)


def _data(page: str) -> dict:
    return json.loads(_block(page, "script", ' type="application/json" id="ld-data"'))


def test_the_page_embeds_the_snapshot_the_delivery_report_and_the_catalogue(bundle_dict):
    data = _data(_page(bundle_dict))
    assert set(data) == {"catalogue", "ingest", "origin", "snapshot"}
    assert len(data["snapshot"]["links"]) == 6 and data["origin"] == "bundle.json"
    assert data["ingest"]["summary"]["interfaces"] == 18 and data["ingest"]["findings"] == []
    assert "un port se désigne lui-même" in data["catalogue"]["self_observation"]["meaning"]
    assert data["catalogue"]["documented_not_observed"]["rule"] == "R3"


def test_the_page_is_offline_no_url_no_external_resource(bundle_dict):
    page = _page(bundle_dict)
    assert set(re.findall(r"https?://[^\s\"'<>)]+", page)) <= {SVG_NAMESPACE}
    assert not re.search(r"<link\b|<img\b|<iframe\b|\bsrc\s*=|@import|url\(", page)


def test_hostile_strings_stay_data(bundle_dict):
    """Une description est du texte libre : elle ne doit ni fermer le bloc de données ni devenir du HTML."""
    hostile = "C1|sw-core-02|Ethernet1/1|</script><script>alert(1)</script><img src=x onerror=alert(2)>"
    page = _page(variant(bundle_dict, lambda d: interface(d, "sw-core-01", "Ethernet1/1").update(description=hostile)))
    assert page.count("<script") == 2 and page.count("</script>") == 2
    assert "alert(1)" in page and "<img" not in page
    described = next(
        i for i in _data(page)["snapshot"]["interfaces"] if (i["hostname"], i["name"]) == ("sw-core-01", "Ethernet1/1")
    )
    assert described["description"] == hostile


def test_the_viewer_never_writes_html_from_data():
    sources = "".join(p.read_text(encoding="utf-8") for p in (Path(cli.__file__).parent / "render/assets/js").glob("*"))
    forbidden = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "DOMParser"]
    forbidden += ["createContextualFragment", "srcdoc", "javascript:", "setTimeout(", "setInterval("]
    for word in forbidden:
        assert word not in sources, word
    assert not re.search(r"""setAttribute\(\s*["'](href|src|on\w+)""", sources)


def test_the_csp_allows_exactly_the_two_inline_blocks(bundle_dict):
    page = _page(bundle_dict)
    csp = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', page).group(1)

    def digest(text: str) -> str:
        return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode() + "'"

    assert f"script-src {digest(_block(page, 'script', ' id="ld-viewer"'))}" in csp
    assert f"style-src {digest(_block(page, 'style', ''))}" in csp
    assert "default-src 'none'" in csp and "unsafe" not in csp


def test_same_input_same_page_and_the_title_is_escaped(bundle_dict):
    assert _page(bundle_dict) == _page(bundle_dict)
    snapshot = _data(_page(bundle_dict))["snapshot"]
    snapshot["source"]["infrastructure"] = "<b>lab</b> {{DATA}}"
    page = render_page(build_page_data(snapshot, None, origin="test"))
    assert "<title>Living Diagram · &lt;b&gt;lab&lt;/b&gt; {{DATA}} · " in page and page.count('id="ld-data"') == 1


def test_an_invalid_bundle_gives_errors_and_no_page(bundle_dict):
    outcome = page_from_bundle(dict(bundle_dict, contract_version="9.0.0"), origin="x")
    assert outcome.page is None and any(e["path"] == "contract_version" for e in outcome.errors)


# ---------------------------------------------------------------- ld render


def test_render_from_a_file_needs_no_archive(capsys, tmp_path, bundle_dict):
    source, out = tmp_path / "b.json", tmp_path / "page.html"
    source.write_text(json.dumps(bundle_dict), encoding="utf-8")
    assert cli.main(["render", str(source), "--out", str(out)]) == 0
    assert "6 nœuds" in capsys.readouterr().out and _data(out.read_text(encoding="utf-8"))["origin"] == "b.json"
    assert list(tmp_path.iterdir()) == [source, out] or set(tmp_path.iterdir()) == {source, out}


def test_render_refuses_an_invalid_bundle_and_writes_nothing(capsys, tmp_path, bundle_dict):
    source, out = tmp_path / "b.json", tmp_path / "page.html"
    source.write_text(json.dumps(dict(bundle_dict, contract_version="9.0.0")), encoding="utf-8")
    assert cli.main(["render", str(source), "--out", str(out)]) == 1
    assert "contract_version" in capsys.readouterr().out and not out.exists()
    assert cli.main(["render", str(tmp_path / "absent.json"), "--out", str(out)]) == 1


def test_render_from_the_archive_uses_the_archived_snapshot_and_report(capsys, tmp_path, bundle_dict):
    archive, source, out = tmp_path / "archive", tmp_path / "b.json", tmp_path / "page.html"
    source.write_text(json.dumps(bundle_dict), encoding="utf-8")
    assert cli.main(["ingest", str(source), "--archive", str(archive)]) == 0
    args = ["render", "--infrastructure", "infra-lab", "--run-id", RUN_ID, "--archive", str(archive), "--out", str(out)]
    assert cli.main(args) == 0
    data = _data(out.read_text(encoding="utf-8"))
    assert data["origin"] == f"archive · infra-lab · {RUN_ID}" and data["ingest"]["summary"]["lldp"] == 6
    (archive / "infra-lab" / RUN_ID / "snapshot.json").write_text("", encoding="utf-8")
    assert cli.main(args) == 1 and "ld correlate" in capsys.readouterr().out
    assert cli.main([*args[:4], "inconnue", *args[5:]]) == 1


def test_a_missing_report_is_not_a_delivery_without_findings(tmp_path, bundle_dict):
    """Revue du 2026-09-20 : sans `report.json`, la page disait « la livraison respecte le contrat sans réserve »."""
    archive, source, out = tmp_path / "archive", tmp_path / "b.json", tmp_path / "page.html"
    source.write_text(json.dumps(bundle_dict), encoding="utf-8")
    assert cli.main(["ingest", str(source), "--archive", str(archive)]) == 0
    args = ["render", "--infrastructure", "infra-lab", "--run-id", RUN_ID, "--archive", str(archive), "--out", str(out)]
    (archive / "infra-lab" / RUN_ID / "report.json").rename(tmp_path / "ecarte.json")
    assert cli.main(args) == 0 and _data(out.read_text(encoding="utf-8"))["ingest"] is None
    (archive / "infra-lab" / RUN_ID / "report.json").write_text("{abîmé", encoding="utf-8")
    assert cli.main(args) == 1


def test_render_says_why_instead_of_a_traceback(capsys, tmp_path, bundle_dict):
    utf16, out = tmp_path / "utf16.json", tmp_path / "page.html"
    utf16.write_text(json.dumps(bundle_dict), encoding="utf-16")  # ce qu'écrit une redirection `>` de PowerShell 5
    assert cli.main(["render", str(utf16), "--out", str(out)]) == 1 and "UTF-8" in capsys.readouterr().out
    assert cli.main(["ingest", str(utf16), "--archive", str(tmp_path / "a")]) == 1
    source = tmp_path / "b.json"
    source.write_text(json.dumps(bundle_dict), encoding="utf-8")
    capsys.readouterr()
    assert cli.main(["render", str(source), "--out", str(tmp_path / "absent" / "page.html")]) == 1
    assert "page non écrite" in capsys.readouterr().out


def test_render_needs_a_file_or_a_run(capsys, tmp_path):
    assert cli.main(["render", "--out", str(tmp_path / "p.html")]) == 2
    assert "--infrastructure" in capsys.readouterr().out


# ---------------------------------------------------------------- le visualiseur, sous Node


@pytest.mark.skipif(shutil.which("node") is None, reason="Node absent : les tests du visualiseur ne tournent pas")
def test_the_viewer_passes_its_node_tests(tmp_path, bundle_dict):
    page, hub = tmp_path / "page.html", tmp_path / "hub.html"
    page.write_text(_page(bundle_dict), encoding="utf-8")
    hub.write_text(_page(variant(bundle_dict, _hub)), encoding="utf-8")
    done = subprocess.run(
        ["node", "--test", str(JS_TESTS)],
        capture_output=True,
        text=True,
        timeout=120,
        env={**os.environ, "LD_PAGE": str(page), "LD_PAGE_HUB": str(hub)},
        check=False,
    )
    assert done.returncode == 0, done.stdout[-4000:] + done.stderr[-2000:]


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_page_really_renders_in_a_browser_under_its_csp(tmp_path, bundle_dict):
    """Ce que le faux DOM ne peut pas voir : une empreinte de CSP fausse donne une page blanche, sans erreur Python."""
    page = tmp_path / "page.html"
    page.write_text(_page(variant(bundle_dict, _hub)), encoding="utf-8")
    flags = ["--no-sandbox", "--disable-gpu", "--virtual-time-budget=3000", "--enable-logging=stderr", "--v=0"]
    done = subprocess.run(
        [str(CHROMIUM), *flags, "--dump-dom", f"file://{page}#stubs=1"],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    dom = done.stdout
    assert dom.count('class="node kind-') == 7 and dom.count('class="link status-') == 7, done.stderr[-2000:]
    assert 'class="fatal"' not in dom.split("<noscript>")[0]
    assert "7 nœuds sur 7 et 7 câbles sur 7 affichés" in dom
    assert not [line for line in done.stderr.splitlines() if "CONSOLE" in line or "Refused" in line]
