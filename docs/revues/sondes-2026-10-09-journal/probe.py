import tempfile, json
from pathlib import Path
from datetime import datetime, UTC
from ld_backend.intent import IntentStore
from ld_backend.journal import JournalReader, JournalQuery
from ld_backend.schemas import IntentOps
from ld_backend.archive import _segment

root = Path(tempfile.mkdtemp())
s = IntentStore(root)
def w(infra, ops, m):
    s.apply(infra, IntentOps.model_validate({"author": "x", "ops": ops}), datetime(2026,10,6,10,m,tzinfo=UTC))
w("A", [{"op":"pin","hostname":"h","x":0,"y":0}], 0)
w("B", [{"op":"pin","hostname":"h","x":0,"y":0}], 1)
w("B", [{"op":"pin","hostname":"h","x":0,"y":0}], 2)
# corrupt B's document
(root/"_intent"/"B"/"intent.json").write_text("{oops")
r = JournalReader(root)
pa = r.page(JournalQuery(infrastructure="A"))
print("filter A: entries", len(pa.entries), "unreadable", pa.unreadable)
pall = r.page(JournalQuery())
print("all: entries", len(pall.entries), "unreadable", pall.unreadable, "infras", pall.infrastructures)
pb = r.page(JournalQuery(infrastructure="B"))
print("filter B: entries", len(pb.entries), "unreadable", pb.unreadable, "infras", pb.infrastructures)
# microsecond ordering / since boundary
root2 = Path(tempfile.mkdtemp()); s2 = IntentStore(root2)
s2.apply("C", IntentOps.model_validate({"author":"x","ops":[{"op":"pin","hostname":"h","x":0,"y":0}]}), datetime(2026,10,6,10,0,0,500000,tzinfo=UTC))
r2 = JournalReader(root2)
print("since 10:00:00 -> ", r2.page(JournalQuery(since=datetime(2026,10,6,10,0,0,tzinfo=UTC))).total, "(expected 1)")
print("until 10:00:00 -> ", r2.page(JournalQuery(until=datetime(2026,10,6,10,0,0,tzinfo=UTC))).total, "(expected 0)")
