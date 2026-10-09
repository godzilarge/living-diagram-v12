import os, pytest
from ld_backend import journal, journal_prune
M=os.environ.get("MUT")
if M=="assign":
    orig=journal._Replay.seed
    def seed(self, s):
        if isinstance(s, dict):
            for k,t in (("names",self.names),("forms",self.forms)):
                for a,b in (s.get(k) or {}).items(): t[a]=b
    journal._Replay.seed=seed
if M=="notrace":
    journal_prune._is_trace=lambda raw: False
