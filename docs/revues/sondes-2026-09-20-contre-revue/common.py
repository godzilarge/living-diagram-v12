"""Outils communs aux sondes de la contre-revue. Aucun fichier du projet n'est modifié."""

import copy
import random
import traceback

from ld_contracts.snapshot.serialize import canonical_json

from tests.correlate.conftest import (  # noqa: F401
    checks,
    find_link,
    interface,
    itf,
    lldp_doc,
    load_minimal,
    node,
    run,
    task_subject,
    variant,
)

SHA = "0" * 64
SECTIONS = ("devices", "tasks", "interfaces", "aggregates", "lldp", "cdp", "system", "ha")


def cdp_doc(hostname, local, neighbor, port, caps=("switch",)):
    return {**lldp_doc(hostname, local, neighbor, port, caps)}


def attempt(title, doc):
    """Exécute B1 ; rend le snapshot ou None, en disant quelle exception est partie."""
    print(f"\n=== {title}")
    try:
        snap = run(doc, SHA)
    except Exception as exc:  # noqa: BLE001
        last = traceback.extract_tb(exc.__traceback__)[-1]
        first_line = str(exc).splitlines()
        print(f"  EXCEPTION {type(exc).__name__}: {' / '.join(first_line[:3])}")
        print(f"  (levée dans {last.filename.split('/')[-1]}:{last.lineno})")
        return None
    print(f"  ok : {len(snap.links)} liens, {len(snap.checks)} contrôles")
    return snap


def show_links(snap, *needles):
    for link in snap.links:
        text = f"{link.a.hostname}/{link.a.interface} <-> {link.b.hostname}/{link.b.interface}"
        if not needles or any(n in text for n in needles):
            print(f"  LIEN {text}  [{link.status}]  evid={[(str(e.source), e.witness.hostname) for e in link.evidence]}")


def show_checks(snap, *codes):
    for c in snap.checks:
        if not codes or c.code in codes:
            refs = [
                (r.kind, getattr(r, "hostname", None), getattr(r, "name", None))
                if r.kind != "link"
                else ("link", f"{r.a.hostname}/{r.a.interface}", f"{r.b.hostname}/{r.b.interface}")
                for r in c.refs
            ]
            print(f"  CHECK {c.code} [{c.severity}] refs={refs} details={c.details}")


def order_independent(title, doc, seeds=6):
    print(f"\n=== déterminisme : {title}")
    reference = canonical_json(run(doc, SHA))
    bad = 0
    for seed in range(seeds):
        shuffled = copy.deepcopy(doc)
        rng = random.Random(seed)
        for section in SECTIONS:
            rng.shuffle(shuffled[section])
        if canonical_json(run(shuffled, SHA)) != reference:
            bad += 1
    print(f"  {'IDENTIQUE' if not bad else 'DIFFERENT'} sur {seeds} permutations ({bad} écarts)")
    return bad == 0
