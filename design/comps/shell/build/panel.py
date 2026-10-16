"""The device panel: one markup, three widths (compact, wide, focus) chosen by data-state.

Columns carry a level: e = essential (every width), w = wide and focus, f = focus only.
VLAN, MAC, IP and last-change values are NOT in demo-dc.json: they are derived placeholders following the pattern
of the data (trunk to an access switch, peer-link, routed uplink, management) and are flagged as such in DIRECTION.md.
"""

from __future__ import annotations

import build as b
from build import DATA, esc, ibtn, ic, tip

MAC_BASE = "00:3a:9c:5e:21:"


def short_port(name: str | None) -> str:
    if not name:
        return ""
    for long, short in (("TenGigabitEthernet", "Te"), ("GigabitEthernet", "Gi"), ("Ethernet", "Eth")):
        if name.startswith(long):
            return short + name[len(long):]
    return name


def port_index(name: str) -> int:
    return int(name.split("/")[-1]) if "/" in name else 0


def derived(i: dict) -> dict:
    """Plausible values for facts the demo data does not carry (mode comes from the data)."""
    n, name, mode = port_index(i["name"]), i["name"], i["mode"]
    nb = (i.get("neighbor") or {}).get("hostname", "")
    native = ""
    if mode == "trunk":
        if "core" in nb:
            vlan, native = "Trunk, tous", "natif 1"
        elif "fw" in nb:
            vlan, native = "Trunk 100-110", "natif 999"
        else:
            vlan, native = "Trunk 10, 20, 100-110", "natif 999"
    elif mode == "access":
        vlan = "Accès, VLAN 1"
    else:
        vlan = "Routé"
    ips = {"Ethernet1/43": "10.10.0.0/31", "Ethernet1/54": "10.10.0.2/31", "mgmt0": "10.0.0.11/24, VRF management"}
    mac = MAC_BASE + ("07" if name == "mgmt0" else f"{0x08 + n:02x}")
    if i["oper"] == "up":
        change = "jamais"
    elif i.get("neighbor"):
        change = "il y a 6 j"
    else:
        change = "jamais"
    return {"vlan": vlan, "native": native, "ip": ips.get(name, ""), "mac": mac, "change": change}


def state(i: dict) -> str:
    if i["oper"] == "up":
        return '<span class="st t-ok"><span class="mark ok"></span>Actif</span>'
    if i.get("neighbor") or i.get("description"):
        reason = esc(i.get("oper_reason") or "")
        return f'<span class="st t-err" title="{reason}"><span class="mark err"></span>Déconnecté</span>'
    return '<span class="st muted"><span class="mark off"></span>Libre</span>'


def speed(mbps: int | None) -> str:
    if not mbps:
        return '<span class="muted">—</span>'
    return f"{mbps // 1000} G" if mbps >= 1000 else f"{mbps} M"


def dash(v: str | None) -> str:
    return esc(v) if v else '<span class="muted">—</span>'


def observed() -> set[str]:
    """Ports of the selected device whose cable was seen by LLDP or CDP (the data's `sources`)."""
    host, out = DATA["selected"]["hostname"], set()
    for link in DATA["links"]:
        if {"lldp", "cdp"} & set(link["sources"]):
            for end in (link["a"], link["b"]):
                if end["hostname"] == host:
                    out.add(end["interface"])
    return out


OBSERVED = observed()


def neighbor(i: dict) -> str:
    nb = i.get("neighbor")
    if not nb or i["name"] not in OBSERVED:
        return ""
    return f'{esc(nb["hostname"])} <span class="muted">{esc(short_port(nb["interface"]))}</span>'


def aggregate(i: dict) -> str:
    ag = i.get("aggregate")
    if not ag:
        return '<span class="muted">—</span>'
    if ag["member_status"] == "bundled":
        return f'<span class="st"><span class="mark ok"></span>{esc(ag["name"])}</span>'
    return f'<span class="st t-err"><span class="mark err"></span>{esc(ag["name"])}</span>'


def l2(v: str) -> str:
    return f'<span class="l2">{v}</span>'


def native(d: dict) -> str:
    return f'<span class="l2 vn"><span class="cm">, </span>{esc(d["native"])}</span>' if d["native"] else ""


def duplex(i: dict) -> str:
    return {"full": "intégral", "half": "semi"}.get(i["duplex"] or "", "")


# (labels {mode: label}, modes where shown, wide width, focus width, renderer). Modes: c compact, w wide, f focus.
# In focus a few cells carry a second line (aggregate under the port, duplex under the speed, description under the
# neighbour) so that every fact fits in 1376 px without a horizontal scroll.
COLUMNS = [
    ({"c": "Port", "w": "Port", "f": "Port et agrégat"}, "cwf", 104, 128,
     lambda i, d: f'<b>{esc(i["name"])}</b>' + l2(aggregate(i))),
    ({"c": "État"}, "cwf", 104, 104, lambda i, d: state(i)),
    ({"c": "Débit", "f": "Débit et duplex"}, "cwf", 64, 104,
     lambda i, d: speed(i["speed_mbps"]) + l2(dash(duplex(i)))),
    ({"c": "Média"}, "f", None, 104, lambda i, d: dash(i["media"])),
    ({"c": "Mode et VLAN"}, "wf", 216, 168, lambda i, d: esc(d["vlan"]) + native(d)),
    ({"c": "Adresses IP"}, "f", None, 112, lambda i, d: dash(d["ip"])),
    ({"c": "MAC"}, "f", None, 128, lambda i, d: esc(d["mac"])),
    ({"c": "Dernier changement"}, "f", None, 152, lambda i, d: esc(d["change"])),
    ({"c": "Voisin"}, "cwf", 152, 144, lambda i, d: neighbor(i)),
    ({"c": "Description"}, "wf", None, None,
     lambda i, d: f'<span class="desc" title="{esc(i["description"] or "")}">{esc(i["description"] or "")}</span>'),
]


def vis(modes: str) -> str:
    return " ".join(f"v-{m}" for m in modes)


def rows(interfaces: list[dict]) -> str:
    out = []
    for i in interfaces:
        if not i.get("neighbor") and i["oper"] != "up":
            continue
        d = derived(i)
        cells = "".join(f'<td class="{vis(m)}">{render(i, d)}</td>' for _, m, _, _, render in COLUMNS)
        out.append(f"<tr>{cells}</tr>")
    return "".join(out)


def header() -> str:
    ths = []
    for k, (labels, modes, *_rest) in enumerate(COLUMNS):
        sorted_ = k == 0
        icon = ic("arrow-up", "ico sort on") if sorted_ else ic("chevrons-up-down", "ico sort")
        aria = ' aria-sort="ascending"' if sorted_ else ""
        text = "".join(f'<span class="lb-{m}">{esc(labels.get(m) or labels["c"])}</span>' for m in "cwf")
        ths.append(f'<th class="{vis(modes)}"{aria}><button class="th">{text}{icon}</button></th>')
    return f'<thead><tr>{"".join(ths)}</tr></thead>'


def head() -> str:
    n = DATA["selected"]["node"]
    return f"""<div class="p-head">
    <div class="tile">{ic("arrow-left-right")}</div>
    <div class="p-title"><h2>{esc(n["hostname"])}</h2><p>{esc(n["vendor"].capitalize())} {esc(n["model"])}</p></div>
    <div class="p-actions" data-bar="fiche">
      {ibtn("chevrons-left-right", "Élargir la fiche", "W", "", "rail wide-toggle")}
      {ibtn("maximize-2", "Mode focus", "Maj F", "", "rail focus-toggle")}
      {ibtn("crosshair", "Centrer la vue", "C", "end")}
      {ibtn("ellipsis", "Plus : historique, copier, épingler", None, "end")}
      {ibtn("x", "Fermer", "Échap", "end")}
    </div>
  </div>"""


def strip() -> str:
    """Focus only: identity and checks on one line, above the full interfaces table."""
    n = DATA["selected"]["node"]
    facts = [("Modèle", n["model"]), ("Système", n["os"]), ("Site", n["site"]), ("Collecte", "réussie le 19 janv. à 02:00"),
             ("Paire MLAG", "dc01-core-02"), ("Agrégats", "13")]
    items = "".join(f"<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>" for k, v in facts)
    return (f'<dl class="strip">{items}<div class="t-err"><dt>À vérifier</dt>'
            f'<dd class="st"><span class="mark err"></span>2 agrégats hors service, 3 avertissements</dd></div></dl>')


def sections() -> str:
    n = DATA["selected"]["node"]
    return f"""
    <section class="sec s-alerts">
      <h3>À vérifier <span class="muted">2 erreurs, 3 avertissements</span></h3>
      <ul class="alerts">
        <li><span class="mark err"></span><div><strong>Deux agrégats hors service</strong>
          <p>port-channel20 et port-channel21 n'ont plus aucun membre actif ; dc01-fw-01 et dc01-fw-02 ne répondent plus depuis le 19 janv.</p></div></li>
        <li><span class="mark warn"></span><div>Vitesse différente aux deux bouts d'un câble</div></li>
        <li><span class="mark warn"></span><div>Deux ports annoncés dans un agrégat sans y participer</div></li>
        <li><span class="mark"></span><div>Deux câbles décrits mais jamais observés
          <p class="to"><a class="lnk" href="#">Tout voir dans Contrôle</a></p></div></li>
      </ul>
    </section>
    <section class="sec s-ident">
      <h3>Identité</h3>
      <dl class="facts">
        <dt>Constructeur</dt><dd>Cisco</dd><dt>Modèle</dt><dd>{esc(n["model"])}</dd>
        <dt>Système</dt><dd>{esc(n["os"])}</dd><dt>Site</dt><dd>{esc(n["site"])}</dd>
        <dt>Collecte</dt><dd>Réussie le 19 janv. 2026 à 02:00</dd><dt>Câbles</dt><dd>{n["cables"]}</dd>
      </dl>
    </section>"""


def ports_section() -> str:
    ifs = DATA["selected"]["interfaces"]
    body = rows(ifs)
    cabled, total = body.count("<tr>"), len(ifs)
    return f"""
    <section class="sec s-ports">
      <h3>Interfaces <span class="muted">{total} ports</span></h3>
      <div class="ports-bar" data-bar="ports">
        <div class="seg" role="group" aria-label="Afficher">
          <button class="btn rail" aria-pressed="true">Câblées <span class="n">{cabled}</span></button>
          <button class="btn rail" aria-pressed="false">Toutes <span class="n">{total}</span></button>
        </div>
        <label class="filter">{ic("list-filter")}<input placeholder="Filtrer" aria-label="Filtrer les ports"></label>
        {ibtn("columns-3", "Choisir les colonnes", None, "end", "line cols-btn")}
      </div>
      <p class="more m-compact">Port, état, débit et voisin ici. Mode et VLAN, description, média, duplex, adresses,
        MAC, dernier changement et agrégat : {ic("chevrons-left-right", "ico in")} élargir ou {ic("maximize-2", "ico in")} focus.</p>
      <p class="more m-wide">Média, duplex, adresses, MAC, dernier changement et agrégat : {ic("maximize-2", "ico in")} focus.</p>
      <table class="mini ports">{header()}<tbody>{body}</tbody></table>
    </section>"""


def tail_sections() -> str:
    return """
    <section class="sec s-mlag">
      <h3>Paire MLAG</h3>
      <dl class="facts">
        <dt>Avec</dt><dd><a class="lnk" href="#">dc01-core-02</a></dd>
        <dt>Lien de pair</dt><dd>port-channel10, 2 × 100 G, actif</dd>
        <dt>Domaines</dt><dd>20 et 21, vers les pare-feu</dd>
      </dl>
    </section>
    <section class="sec s-aggr">
      <h3>Agrégats <span class="muted">13, dont 2 hors service</span></h3>
      <table class="mini">
        <tr><th>Agrégat</th><th>Vers</th><th class="r">Membres actifs</th></tr>
        <tr><td>port-channel20</td><td>dc01-fw-01</td><td class="r"><span class="st t-err"><span class="mark err"></span>0 sur 1</span></td></tr>
        <tr><td>port-channel21</td><td>dc01-fw-02</td><td class="r"><span class="st t-err"><span class="mark err"></span>0 sur 1</span></td></tr>
        <tr><td>port-channel10</td><td>dc01-core-02, lien de pair</td><td class="r"><span class="st"><span class="mark"></span>2 sur 2</span></td></tr>
        <tr><td>port-channel101 à 110</td><td>dc01-acc-01 à 10</td><td class="r"><span class="st"><span class="mark"></span>10 sur 10</span></td></tr>
      </table>
    </section>"""


def panel() -> str:
    return f"""<aside class="surf panel" data-float="fiche" aria-label="Fiche de dc01-core-01">
  {head()}
  {strip()}
  <div class="p-body">{sections()}{ports_section()}{tail_sections()}</div>
</aside>"""


def col_css() -> str:
    """Column widths for the wide and focus states, generated from COLUMNS."""
    out = []
    for k, (_, _, ww, fw, _) in enumerate(COLUMNS, start=1):
        if ww:
            out.append(f':root[data-state="panel-wide"] .ports th:nth-child({k}) {{ width: {ww}px; }}')
        if fw:
            out.append(f':root[data-state="panel-focus"] .ports th:nth-child({k}) {{ width: {fw}px; }}')
    return "\n".join(out)
