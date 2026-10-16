"""The home page: the same top bar, then a modular space of widgets."""

from __future__ import annotations

import build as b
from build import esc, ibtn, ic

# Synthetic content. demo-dc figures come from the demo-dc data (28 of 30 collected devices answered on 19 Jan).
INFRAS = [
    ("demo-dc", "Centre de données, 2 sites", 32, "19 janv., 02:00", ("", "Réussie"), 6, 21, True),
    ("site-lyon", "Campus, 3 bâtiments", 48, "19 janv., 01:30", ("", "Réussie"), 0, 4, False),
    ("wan-core", "Cœur WAN et partenaires", 14, "19 janv., 03:00", ("", "Réussie"), 0, 1, False),
    ("site-nantes", "Campus, 2 bâtiments", 27, "18 janv., 23:10", ("warn", "Partielle, 3 sans réponse"), 3, 9, False),
    ("campus-rennes", "Campus, 4 bâtiments", 64, "18 janv., 04:00", ("err", "Échouée le 19 janv."), 2, 7, False),
    ("lab-sec", "Laboratoire sécurité", 9, "12 janv., 14:20", ("warn", "Pas de collecte depuis 7 jours"), 0, 0, False),
]

CHANGES = [
    ("orhan", "a déplacé 3 équipements", "demo-dc", "il y a 2 h"),
    ("camille.r", "a annoté dc02-fw-01", "demo-dc", "il y a 3 h"),
    ("orhan", "a regroupé 6 équipements dans « Cœur Lyon »", "site-lyon", "hier, 17:42"),
    ("t.martin", "a ajouté un lien à la main entre wan-pe-02 et wan-rt-01", "wan-core", "hier, 16:05"),
    ("camille.r", "a changé la couleur de 4 câbles", "site-nantes", "hier, 11:20"),
    ("orhan", "a masqué 34 terminaux", "demo-dc", "17 janv."),
    ("t.martin", "a ajouté un tableau d'adressage", "lab-sec", "16 janv."),
    ("camille.r", "a confirmé 2 câbles", "demo-dc", "15 janv."),
    ("orhan", "a épinglé 12 équipements", "site-lyon", "14 janv."),
    ("t.martin", "a renommé le groupe « Accès RDC »", "site-nantes", "13 janv."),
]

RUNS = [
    ("19 janv., 04:00", "campus-rennes", ("err", "Échouée"), "l'export s'est arrêté", "données du 18 janv. conservées"),
    ("19 janv., 03:00", "wan-core", ("", "Réussie"), "14 sur 14 ont répondu", "aucun changement"),
    ("19 janv., 02:00", "demo-dc", ("warn", "Partielle"), "28 sur 30 ont répondu", "14 changements depuis le 12 janv."),
    ("19 janv., 01:30", "site-lyon", ("", "Réussie"), "48 sur 48 ont répondu", "3 changements depuis le 18 janv."),
    ("18 janv., 23:10", "site-nantes", ("warn", "Partielle"), "24 sur 27 ont répondu", "1 changement depuis le 11 janv."),
    ("12 janv., 02:00", "demo-dc", ("warn", "Partielle"), "28 sur 30 ont répondu", "9 changements depuis le 5 janv."),
]


def mark(kind: str) -> str:
    return f'<span class="mark {kind}"></span>'


def status(st: tuple[str, str]) -> str:
    kind, word = st
    cls = {"err": "t-err", "warn": "t-warn"}.get(kind, "")
    return f'<span class="st {cls}">{mark(kind)}{esc(word)}</span>'


def count(n: int, kind: str) -> str:
    if n == 0:
        return '<span class="zero">0</span>'
    return f'<span class="st t-{kind}">{mark(kind)}{n}</span>'


def initials(who: str) -> str:
    return who[0].upper()


def top_row() -> str:
    ctx = f'<div class="surf bar ctx" data-float="marque" data-bar="marque">{b.logo("home.html")}</div>'
    tools = f"""<div class="surf bar tools" data-float="outils" data-bar="outils">
  {b.search_trigger()}
  {ibtn("layout-dashboard", "Disposer les widgets", None, "", "tip-demo")}
  {ibtn("settings", "Réglages", None, "end", "rail settings-toggle")}
  <span class="sep"></span>
  {b.user_btn()}
</div>"""
    return ctx + tools


def w_infra() -> str:
    rows = []
    for name, desc, n, last, st, err, warn, recent in INFRAS:
        href = "index.html" if name == "demo-dc" else "#"
        cls = ' class="recent"' if recent else ""
        rows.append(
            f'<tr{cls}><td class="name"><a href="{href}"><b>{esc(name)}</b><span>{esc(desc)}</span></a></td>'
            f'<td class="r">{n}</td><td>{esc(last)}</td><td>{status(st)}</td>'
            f'<td class="r"><span class="cnt"><span>{count(err, "err")}</span><span>{count(warn, "warn")}</span></span></td>'
            f'<td class="r">{ic("chevron-right", "ico go")}</td></tr>')
    return f"""<section class="surf w" data-float="infrastructures" aria-labelledby="h-infra">
  <header class="w-head" data-bar="w-infra"><h2 id="h-infra">Infrastructures</h2><span class="muted">6</span>
    {ibtn("maximize-2", "Ouvrir la liste complète", None, "end", "act")}</header>
  <div class="w-body"><table class="infra">
    <thead><tr><th>Nom</th><th class="r">Équipements</th><th>Dernière collecte</th><th>État de la collecte</th>
    <th class="r">À vérifier</th><th></th></tr></thead>
    <tbody>{"".join(rows)}</tbody></table></div>
</section>"""


def w_changes() -> str:
    items = "".join(
        f'<li><span class="avatar">{initials(who)}</span><div><div class="what"><b>{esc(who)}</b> {esc(what)}</div>'
        f'<div class="where2">{esc(where)}</div></div><span class="when">{esc(when)}</span></li>'
        for who, what, where, when in CHANGES)
    return f"""<section class="surf w" data-float="modifications" aria-labelledby="h-chg">
  <header class="w-head" data-bar="w-chg"><h2 id="h-chg">Dernières modifications</h2>
    {ibtn("history", "Ouvrir le journal", None, "end", "act")}</header>
  <div class="w-body"><ul class="feed">{items}</ul></div>
</section>"""


def w_runs() -> str:
    rows = "".join(
        f'<tr><td class="d">{esc(d)}</td><td class="n">{esc(infra)}</td><td>{status(st)}</td><td>{esc(note)}</td><td>{esc(chg)}</td></tr>'
        for d, infra, st, note, chg in RUNS)
    return f"""<section class="surf w" data-float="collectes" aria-labelledby="h-runs">
  <header class="w-head"><h2 id="h-runs">Dernières collectes</h2></header>
  <div class="w-body"><table class="runs-list"><thead><tr><th>Date</th><th>Infrastructure</th><th>Résultat</th><th>Équipements</th><th>Par rapport à la précédente</th></tr></thead><tbody>{rows}</tbody></table></div>
</section>"""


def w_slot() -> str:
    tid, t = b.tip("Ajouter un widget", None, "")
    return f"""<section class="slot" data-float="emplacement" aria-label="Emplacement libre">
  <button class="btn icon line has-tip" aria-label="Ajouter un widget" aria-describedby="{tid}">{ic("plus")}{t}</button>
  <div><h2>Emplacement libre</h2><p>L'accueil s'agrandit avec le produit : contrôles d'une infrastructure, exports récents, couverture de la collecte.</p></div>
</section>"""


def build() -> str:
    body = (top_row()
            + f'<main class="space"><div class="col">{w_infra()}{w_runs()}</div>'
            + f'<div class="col">{w_changes()}{w_slot()}</div></main>'
            + b.settings() + b.bench("on-home", [("none", "Repos"), ("search", "Recherche"), ("settings", "Réglages")]))
    css = (b.HERE / "home.css").read_text(encoding="utf-8")
    return b.page("Living Diagram, accueil", css, "home", body)
