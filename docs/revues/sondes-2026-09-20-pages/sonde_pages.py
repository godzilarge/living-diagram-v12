"""Sonde de revue : fabrique des pages depuis des bundles construits en mémoire."""
import copy, json, sys, time
from pathlib import Path
from tests.correlate.conftest import load_minimal, variant, interface, lldp_doc
from tests.correlate.test_review import _ring
from ld_backend.render.build import page_from_bundle

OUT = Path(sys.argv[1])
minimal = load_minimal()
PAYLOAD = '</script><script>document.title="PWNED"</script><img src=x onerror="document.title=\'PWNED\'"> <!--<script>'

def write(name, doc):
    t = time.perf_counter()
    out = page_from_bundle(doc, origin="sonde " + PAYLOAD)
    dt = time.perf_counter() - t
    if out.page is None:
        print(name, "REFUS", out.problem, json.dumps(out.errors, ensure_ascii=False)[:600]); return
    (OUT / f"{name}.html").write_text(out.page, encoding="utf-8")
    print(name, out.counts, f"{len(out.page.encode())/1024:.0f} Ko", f"{dt:.2f}s")

def hostile(d):
    d["infrastructure"] = d["infrastructure"]  # essayé à part
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = PAYLOAD
    d["interfaces"].append({**interface(d, "sw-core-01", "Ethernet1/5"), "name": "Ethernet1/6"})
    interface(d, "sw-core-01", "Ethernet1/6")["description"] = "P1|" + '"><svg/onload=document.title="PWNED">' + "|eth0|x"
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", '<img src=x onerror=document.title="PWNED">', '<script>document.title="PWNED"</script>'))
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/6", 'javascript:alert(1)', '"onmouseover="x'))
print([i["name"] for i in minimal["interfaces"] if i["hostname"]=="sw-core-01"])
write("hostile", variant(minimal, hostile))

def hostile_title(d):
    old = d["infrastructure"]; new = 'x</title><script>document.title="PWNED"</script>'
    d["infrastructure"] = new
    for dev in d["devices"]: dev["infrastructure"] = new
write("hostile_title", variant(minimal, hostile_title))

def hub(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0", ("station",)))
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "sw-core-02", "Ethernet1/4"))
    d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "sw-core-01", "Ethernet1/5"))
write("hub", variant(minimal, hub))

write("ring400", _ring(minimal, 400, 3))
write("ring40", _ring(minimal, 40, 5))

# 40 câbles parallèles entre deux équipements, hostname de 40 caractères
def parallel(n, long=False):
    doc = _ring(minimal, 2, 0)
    a, b = ("sw-" + "a"*37, "sw-" + "b"*37) if long else ("sw-000", "sw-001")
    if long:
        for sec in ("devices", "tasks"):
            for x in doc[sec]: x["hostname"] = a if x["hostname"] == "sw-000" else b
    port = interface(minimal, "sw-core-01", "Ethernet1/1")
    for k in range(1, n + 1):
        for h, o in ((a, b), (b, a)):
            doc["interfaces"].append({**port, "hostname": h, "name": f"Ethernet1/{k}", "description": None})
            doc["lldp"].append(lldp_doc(h, f"Ethernet1/{k}", o, f"Ethernet1/{k}"))
    return doc
write("parallel40", parallel(40, long=True))
write("nolink", _ring(minimal, 3, 0))
def big(d):
    port = interface(d, "sw-core-01", "Ethernet1/1")
    for k in range(100, 500):
        d["interfaces"].append({**port, "name": f"Ethernet2/{k}", "description": "P3|srv-%d|eth0|" % k})
write("iface400", variant(minimal, big))
