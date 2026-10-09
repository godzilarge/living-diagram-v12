import tempfile, threading, time, os, stat
from datetime import UTC, datetime
from pathlib import Path
from ld_backend.intent import IntentStore
from ld_backend.journal import JournalQuery, JournalReader
from ld_backend.journal_prune import prune
from ld_backend import journal_prune as jp
from ld_backend.files import locked
from ld_backend.schemas import IntentOps
LAB="lab"; NOW=datetime(2026,10,10,12,tzinfo=UTC)
def at(m): return datetime(2026,10,6,10,m,tzinfo=UTC)
def w(s, ops, m, author="o"): s.apply(LAB, IntentOps.model_validate({"author":author,"ops":ops}), at(m))
def page(root): return JournalReader(root).page(JournalQuery(infrastructure=LAB))
# A. U+2028 dans une note : le lecteur coupe la ligne
root=Path(tempfile.mkdtemp()); s=IntentStore(root)
try:
    w(s,[{"op":"annotation_create","anchor":{"kind":"free"},"x":0,"y":0,"w":100,"h":50,"content":{"kind":"note","text":"a b"}}],0)
    p=page(root); print("A note U+2028 : entrées", len(p.entries), "illisibles", p.unreadable)
except Exception as e: print("A refus contrat", type(e).__name__, str(e)[:200])
# B. auteur de purge avec U+2028 : la trace devient illisible et sa graine perdue
root=Path(tempfile.mkdtemp()); s=IntentStore(root)
w(s,[{"op":"group_create","label":"Coeur","members":["a"]}],0)
w(s,[{"op":"group_delete","id":"g1-1"}],5)
prune(root, LAB, before=at(3), author="ad min", now=NOW)
p=page(root); print("B auteur U+2028 :", [(e.ops[0]["op"],[x.label for x in e.subjects]) for e in p.entries], "illisibles", p.unreadable)
# C. verrou : apply d'un autre fil pendant que la purge tient le verrou
root=Path(tempfile.mkdtemp()); s=IntentStore(root)
for m in range(3): w(s,[{"op":"pin","hostname":f"h{m}","x":m,"y":0}],m)
orig=jp._write_bytes; started=threading.Event()
def slow(path,payload):
    if path.name=="journal.jsonl": started.set(); time.sleep(0.5)
    orig(path,payload)
jp._write_bytes=slow
t=threading.Thread(target=lambda: prune(root, LAB, before=at(2), author="admin", now=NOW)); t.start()
started.wait(); t0=time.time(); w(s,[{"op":"pin","hostname":"late","x":9,"y":9}],30); waited=time.time()-t0; t.join()
jp._write_bytes=orig
print("C attente apply", round(waited,2), "s ; ops", [e.ops[0]["op"]+":"+str(e.ops[0].get("hostname")) for e in page(root).entries])
# D. deux traces dans la même seconde : même clé ; pagination limit=1
root=Path(tempfile.mkdtemp()); s=IntentStore(root)
w(s,[{"op":"pin","hostname":"a","x":0,"y":0}],0); w(s,[{"op":"color","hostname":"a","hue":"red"}],1); w(s,[{"op":"pin","hostname":"b","x":0,"y":0}],50)
prune(root, LAB, before=at(3), categories=("positions",), author="admin", now=NOW)
prune(root, LAB, before=at(3), categories=("colors",), author="admin", now=NOW.replace(microsecond=400000))
r=JournalReader(root); seen=[]; cur=None
while True:
    p=r.page(JournalQuery(infrastructure=LAB, limit=1, before=cur)); seen+= [(e.at,e.revision,e.ops[0].get("categories")) for e in p.entries]; cur=p.next
    if not cur: break
print("D pages limit=1 :", seen, "total", p.total)
# E. droits : le journal réécrit perd son mode
root=Path(tempfile.mkdtemp()); s=IntentStore(root)
w(s,[{"op":"pin","hostname":"a","x":0,"y":0}],0); w(s,[{"op":"pin","hostname":"b","x":0,"y":0}],5)
j=root/"_intent"/LAB/"journal.jsonl"; os.chmod(j,0o600)
prune(root, LAB, before=at(3), author="admin", now=NOW)
print("E mode après purge", oct(stat.S_IMODE(j.stat().st_mode)), "(avant 0o600)")
