import tempfile, json
from datetime import UTC, datetime
from pathlib import Path
from ld_backend.intent import IntentStore
from ld_backend.journal import JournalQuery, JournalReader
from ld_backend.journal_prune import prune
from ld_backend.schemas import IntentOps
LAB="lab"; NOW=datetime(2026,10,10,12,tzinfo=UTC)
def at(m): return datetime(2026,10,6,10,m,tzinfo=UTC)
def w(s, ops, m): s.apply(LAB, IntentOps.model_validate({"author":"o","ops":ops}), at(m))
def labels(root):
    out=[]
    for e in JournalReader(root).page(JournalQuery(infrastructure=LAB)).entries:
        out.append((e.revision, [o["op"] for o in e.ops], [s.label for s in e.subjects]))
    return out
def case(name, build, **kw):
    root=Path(tempfile.mkdtemp()); s=IntentStore(root); build(s)
    a=labels(root); prune(root, LAB, author="admin", now=NOW, **kw); b=labels(root)
    bm={(r,tuple(o)):l for r,o,l in a}
    diffs=[(r,o,bm.get((r,tuple(o))),l) for r,o,l in b if o!=["journal_prune"] and bm.get((r,tuple(o)))!=l]
    print(name, "DIFF" if diffs else "ok", diffs)

# 1. connecteur vers un groupe ; purge des connecteurs seuls
def b1(s):
    w(s,[{"op":"group_create","label":"Coeur","members":["a","b"]}],0)          # g1-1, gardé
    w(s,[{"op":"connector_create","start":{"kind":"group","ref":"g1-1","side":"auto"},"end":{"kind":"device","ref":"sw-1","side":"auto"}}],1)  # c2-1 retiré
    w(s,[{"op":"connector_update","id":"c2-1","bend":10}],5)                    # gardé (après la date)
case("connecteur->groupe, purge connectors", b1, before=at(3), categories=("connectors",))
# 2. rafale mixte gardée avant un renommage retiré
def b2(s):
    w(s,[{"op":"group_create","label":"X","members":["a"]},{"op":"pin","hostname":"a","x":0,"y":0}],0)  # g1-1 mixte, gardé
    w(s,[{"op":"group_update","id":"g1-1","label":"Y"}],1)  # retiré
    w(s,[{"op":"group_add","id":"g1-1","members":["b"]},{"op":"pin","hostname":"b","x":0,"y":0}],2)  # mixte, gardé : lisait Y
case("rafale mixte entrelacée, purge groups", b2, before=at(3), categories=("groups",))
# 3. sans catégorie : attendu exact
def b3(s):
    w(s,[{"op":"group_create","label":"X","members":["a"]}],0)
    w(s,[{"op":"group_update","id":"g1-1","label":"Y"}],1)
    w(s,[{"op":"group_add","id":"g1-1","members":["b"]}],5)
case("sans catégorie", b3, before=at(3))
