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
from ld_backend.render import build_page_data, page_from_bundle, render_page, render_shell
from tests.correlate.conftest import interface, lldp_doc, variant
from tests.diff.conftest import LATER_RUN_ID, cable_down_later, later

SVG_NAMESPACE = "http://www.w3.org/2000/svg"
JS_TESTS = Path(__file__).parent / "js"
RUN_ID = "66db3f0e9a1c2b0012f4a7d1"
CHROMIUM = next(Path.home().glob(".cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell"), None)


def _hub(doc: dict) -> None:
    """Un port qui voit deux voisins : deux câbles sur `sw-core-01 · Ethernet1/5`, dont un vers un voisin inconnu."""
    doc["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0", ("station",)))
    doc["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "sw-core-02", "Ethernet1/4"))


def _aggstop(doc: dict) -> None:
    """R1-bis indéterminé : le FortiGate annonce `agg-core` en port-id, aucune description ne désigne le membre."""
    doc["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/3", "fw-edge-01", "agg-core", ("router",)))
    doc["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "fw-edge-01", "agg-core", ("router",)))
    for host, name in (
        ("sw-core-01", "Ethernet1/3"),
        ("sw-core-02", "Ethernet1/4"),
        ("fw-edge-01", "x1"),
        ("fw-edge-01", "x2"),
    ):
        interface(doc, host, name)["description"] = None


def _unread(doc: dict) -> None:
    """`mlag_peer_link = null` sur les deux Po10 : non lu, la page doit le dire et ne rien inventer (2026-10-02)."""
    for aggregate in doc["aggregates"]:
        if aggregate["name"] == "port-channel10":
            aggregate["mlag_peer_link"] = None


def _page(bundle: dict) -> str:
    outcome = page_from_bundle(bundle, origin="bundle.json")
    assert outcome.page is not None, outcome.errors
    return outcome.page


def _diff_pair(bundle: dict) -> tuple[dict, dict]:
    """Avant : la fixture. Après, une semaine plus tard : le câble des cœurs est tombé des deux bouts, et le serveur
    `srv-hyp-07` n'est plus ni observé ni documenté (son câble et lui disparaissent : des fantômes dans la page)."""
    after = cable_down_later(bundle)
    after["lldp"] = [doc for doc in after["lldp"] if doc["neighbor"] != "srv-hyp-07"]
    interface(after, "sw-core-02", "Ethernet1/3")["description"] = None
    return bundle, after


def _unreachable_pair(bundle: dict) -> tuple[dict, dict]:
    """Une semaine plus tard, `fw-edge-01` est injoignable : ses interfaces disparaissent du snapshot (fantômes sur un
    nœud vivant), ses câbles documentés depuis les cœurs restent (revue, H1)."""
    after = later(bundle)
    for task in after["tasks"]:
        if task["hostname"] == "fw-edge-01":
            task["status"], task["status_per_subject"], task["error"] = "unreachable", {}, "ssh: connect timeout"
    for topic in ("interfaces", "lldp", "cdp", "aggregates", "system", "ha"):
        after[topic] = [doc for doc in after[topic] if doc["hostname"] != "fw-edge-01"]
    return bundle, after


def _page_with_previous(pair: tuple[dict, dict]) -> str:
    before, after = pair
    outcome = page_from_bundle(after, origin="after.json", previous=before)
    assert outcome.page is not None, (outcome.problem, outcome.errors)
    return outcome.page


def _diff_page(bundle: dict) -> str:
    return _page_with_previous(_diff_pair(bundle))


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
    for page in (_page(bundle_dict), _diff_page(bundle_dict)):
        assert set(re.findall(r"https?://[^\s\"'<>)]+", page)) <= {SVG_NAMESPACE}
        assert not re.search(r"<link\b|<img\b|<iframe\b|\bsrc\s*=|@import|url\(", page)


# ---------------------------------------------------------------- le diff dans la page (2026-10-04)


def test_a_page_built_with_a_previous_run_embeds_the_diff_and_only_then(bundle_dict):
    data = _data(_diff_page(bundle_dict))
    assert set(data) == {"catalogue", "diff", "ingest", "origin", "snapshot"}
    summary = data["diff"]["summary"]
    assert summary["links"] == {"added": 0, "removed": 1, "changed": 1} and summary["nodes"]["removed"] == 1
    assert data["diff"]["nodes"]["removed"][0]["hostname"] == "srv-hyp-07"
    assert (
        data["diff"]["before"]["collector_run_id"] == RUN_ID
        and data["diff"]["after"]["collector_run_id"] == LATER_RUN_ID
    )
    assert "diff" not in _data(_page(bundle_dict)), "sans run d'avant, la clé n'existe pas"
    assert 'id="view-diff"' in _page(bundle_dict), "la section existe toujours, l'onglet seulement avec un diff"


def test_an_unreachable_device_keeps_its_removed_interfaces_out_of_the_run(bundle_dict):
    data = _data(_page_with_previous(_unreachable_pair(bundle_dict)))
    gone = {i["hostname"] for i in data["diff"]["interfaces"]["removed"]}
    assert gone == {"fw-edge-01"} and data["diff"]["summary"]["interfaces"]["removed"] >= 1
    assert not [i for i in data["snapshot"]["interfaces"] if i["hostname"] == "fw-edge-01"]


def test_render_from_the_run_itself_warns_and_still_writes(capsys, tmp_path, bundle_dict):
    """Revue B5 : `--from` égal à la run dessinée embarque un diff vide ; la CLI le dit, sans refuser."""
    b, out = tmp_path / "b.json", tmp_path / "page.html"
    b.write_text(json.dumps(bundle_dict), encoding="utf-8")
    assert cli.main(["render", str(b), "--out", str(out), "--from", str(b)]) == 0
    assert cli.SAME_RUN_WARNING in capsys.readouterr().out
    assert _data(out.read_text(encoding="utf-8"))["diff"]["elapsed_seconds"] == 0
    archive = tmp_path / "archive"
    assert cli.main(["ingest", str(b), "--archive", str(archive)]) == 0
    capsys.readouterr()
    args = ["render", "--infrastructure", "infra-lab", "--run-id", RUN_ID, "--archive", str(archive), "--out", str(out)]
    assert cli.main([*args, "--from", RUN_ID]) == 0 and cli.SAME_RUN_WARNING in capsys.readouterr().out
    assert cli.main(args) == 0 and cli.SAME_RUN_WARNING not in capsys.readouterr().out


def test_render_from_embeds_the_diff_from_a_file_or_from_the_archive(capsys, tmp_path, bundle_dict):
    before, after = _diff_pair(bundle_dict)
    a, b, out = tmp_path / "a.json", tmp_path / "b.json", tmp_path / "page.html"
    a.write_text(json.dumps(before), encoding="utf-8")
    b.write_text(json.dumps(after), encoding="utf-8")
    assert cli.main(["render", str(b), "--out", str(out), "--from", str(a)]) == 0
    assert _data(out.read_text(encoding="utf-8"))["diff"]["summary"]["links"]["changed"] == 1
    assert cli.main(["render", str(b), "--out", str(a), "--from", str(a)]) == 2
    assert "--from : rien n'est écrit" in capsys.readouterr().out
    assert cli.main(["render", str(b), "--out", str(out), "--from", str(tmp_path / "absent.json")]) == 1
    assert "--from" in capsys.readouterr().out
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(dict(before, contract_version="9.0.0")), encoding="utf-8")
    assert cli.main(["render", str(b), "--out", str(out), "--from", str(bad)]) == 1
    assert "--from hors contrat" in capsys.readouterr().out
    archive = tmp_path / "archive"
    for source in (a, b):
        assert cli.main(["ingest", str(source), "--archive", str(archive)]) == 0
    args = [
        "render",
        "--infrastructure",
        "infra-lab",
        "--run-id",
        LATER_RUN_ID,
        "--archive",
        str(archive),
        "--out",
        str(out),
    ]
    assert cli.main([*args, "--from", RUN_ID]) == 0
    data = _data(out.read_text(encoding="utf-8"))
    assert data["diff"]["before"]["collector_run_id"] == RUN_ID and data["origin"].startswith("archive")
    capsys.readouterr()
    assert cli.main([*args, "--from", "nope"]) == 1
    assert "`from`" in capsys.readouterr().out


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
    page, hub, shell = tmp_path / "page.html", tmp_path / "hub.html", tmp_path / "shell.html"
    aggstop, unread, diff = tmp_path / "aggstop.html", tmp_path / "unread.html", tmp_path / "diff.html"
    unreachable = tmp_path / "unreachable.html"
    page.write_text(_page(bundle_dict), encoding="utf-8")
    diff.write_text(_diff_page(bundle_dict), encoding="utf-8")
    unreachable.write_text(_page_with_previous(_unreachable_pair(bundle_dict)), encoding="utf-8")
    unread.write_text(_page(variant(bundle_dict, _unread)), encoding="utf-8")
    hub.write_text(_page(variant(bundle_dict, _hub)), encoding="utf-8")
    aggstop.write_text(_page(variant(bundle_dict, _aggstop)), encoding="utf-8")
    shell.write_text(render_shell(), encoding="utf-8")
    done = subprocess.run(
        ["node", "--test", str(JS_TESTS)],
        capture_output=True,
        text=True,
        timeout=120,
        env={
            **os.environ,
            "LD_PAGE": str(page),
            "LD_PAGE_HUB": str(hub),
            "LD_SHELL": str(shell),
            "LD_PAGE_AGGSTOP": str(aggstop),
            "LD_PAGE_UNREAD": str(unread),
            "LD_PAGE_DIFF": str(diff),
            "LD_PAGE_UNREACHABLE": str(unreachable),
        },
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
    # deux faisceaux, pas trois : le hub sur Ethernet1/5 observe sw-core-02 · Ethernet1/4, la description de x2 vers ce
    # port devient un désaccord et son câble n'est plus tracé
    assert dom.count('class="beam-band"') == 2 and dom.count('class="cluster-hull"') == 1, "bandes et cadres rendus"
    assert dom.count('class="node-role"') == 2, "un rôle HA sur chaque membre du cluster"
    assert 'class="tip"' in dom, "la bulle est dans le canevas"
    assert 'class="fatal"' not in dom.split("<noscript>")[0]
    assert "7 nœuds sur 7 et 7 câbles sur 7 affichés" in dom
    assert not [line for line in done.stderr.splitlines() if "CONSOLE" in line or "Refused" in line]


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_diff_page_paints_ghosts_and_halos_in_a_browser(tmp_path, bundle_dict):
    page = tmp_path / "diff.html"
    page.write_text(_diff_page(bundle_dict), encoding="utf-8")
    flags = ["--no-sandbox", "--disable-gpu", "--virtual-time-budget=3000", "--enable-logging=stderr", "--v=0"]
    done = subprocess.run(
        [str(CHROMIUM), *flags, "--dump-dom", f"file://{page}#stubs=1"],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    dom = done.stdout
    assert dom.count("diff-removed") >= 2 and dom.count("diff-changed") >= 1, done.stderr[-2000:]
    assert dom.count('class="diff-halo"') == 2, "un halo sous le câble changé et sous le câble retiré"
    assert 'id="tab-diff"' in dom and "comparée à la run" in dom
    assert "5 nœuds sur 5 et 5 câbles sur 5 affichés · retirés depuis la run d'avant : " in dom
    assert "1 équipement et 1 câble en fantômes" in dom
    assert 'class="fatal"' not in dom.split("<noscript>")[0]
    assert not [line for line in done.stderr.splitlines() if "CONSOLE" in line or "Refused" in line]


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_hover_and_keyboard_focus_in_a_real_browser(tmp_path, bundle_dict):
    """Ce que le faux DOM ne propage pas : le survol réel d'un tracé (le pointeur remonte du tracé au groupe), le focus
    clavier d'un équipement, et tout cela sous la CSP du navigateur, sans rien de refusé (revue du 2026-10-02, M5)."""
    from tests.browser import Chrome

    page = tmp_path / "page.html"
    page.write_text(_page(bundle_dict), encoding="utf-8")
    with Chrome(CHROMIUM) as chrome:
        tab = chrome.open(f"file://{page}")
        tip = "document.getElementById('ld-tip')"
        point = tab.js(
            "(() => { const st = LD.app.graph.state, m = LD.app.model;"
            " const link = m.links.find((l) => l.a.interface === 'Ethernet1/2' && l.b.interface === 'Ethernet1/2');"
            " const p = st.positions.get(link.a.hostname), q = st.positions.get(link.b.hostname);"
            " const mid = LD.geometry.curve(p, q, link).mid;"
            " const r = document.getElementById('canvas').getBoundingClientRect();"
            " return { x: r.left + mid.x * st.view.k + st.view.tx, y: r.top + mid.y * st.view.k + st.view.ty }; })()"
        )
        tab.mouse_move(point["x"], point["y"])
        assert tab.js(f"{tip}.getAttribute('visibility')") == "visible"
        assert "10Gbase-SR" in tab.js(f"{tip}.textContent") and "suspended by LACP" in tab.js(f"{tip}.textContent")
        tab.mouse_move(2, 2)  # le coin de la fenêtre : hors du canevas
        assert tab.js(f"{tip}.getAttribute('visibility')") == "hidden"
        tab.js("document.querySelector('[data-node=\"fw-edge-01\"]').focus()")
        assert tab.js(f"{tip}.getAttribute('visibility')") == "visible"
        assert "primary · up · priorité 200" in tab.js(f"{tip}.textContent")
        assert tab.js("document.activeElement.getAttribute('aria-describedby')") == "ld-tip"
        tab.js("document.activeElement.blur()")
        assert tab.js(f"{tip}.getAttribute('visibility')") == "hidden"
    noise = [entry for entry in chrome.console if "Refused" in json.dumps(entry) or entry.get("type") == "error"]
    assert not noise, noise
