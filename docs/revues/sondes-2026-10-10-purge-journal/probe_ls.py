import tempfile
from datetime import UTC, datetime
from pathlib import Path
from ld_backend.intent import IntentStore
from ld_backend.journal import JournalQuery, JournalReader
from ld_backend.schemas import IntentOps
for ch in (" ","\u0085"," "):
    root=Path(tempfile.mkdtemp()); s=IntentStore(root)
    s.apply("lab", IntentOps.model_validate({"author":"o","ops":[{"op":"group_create","label":"a"+ch+"b","members":["x"]}]}), datetime(2026,10,6,tzinfo=UTC))
    p=JournalReader(root).page(JournalQuery(infrastructure="lab")); print(repr(ch), "entrées", len(p.entries), "illisibles", p.unreadable)
