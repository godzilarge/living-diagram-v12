#!/usr/bin/env bash
# Sonde c : copie de src/ et tests/ dans un dossier neuf par mutant, mutation par remplacement exact, tests du branchement.
set -u
B=/home/otosun/development/applications/demo/living-diagram-v12-biturbo/backend
HERE="$(cd "$(dirname "$0")" && pwd)"
mutant() {  # nom fichier ancien nouveau
  local dir="$HERE/$1-$(date +%s%N)"; mkdir -p "$dir"
  cp -r "$B/src" "$dir/src"; cp -r "$B/tests" "$dir/tests"; mkdir -p "$dir/contracts"; ln -s "$B/../contracts/fixtures" "$dir/../fixtures-unused" 2>/dev/null
  python3 - "$dir/src/ld_backend/$2" "$3" "$4" <<'PY'
import sys
from pathlib import Path
p, old, new = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
s = p.read_text(); assert s.count(old) == 1, (p, old); p.write_text(s.replace(old, new))
PY
  # conftest lit les fixtures par chemin relatif au dépôt : on pointe sur le vrai dossier
  sed -i "s#Path(__file__).resolve().parents\[2\] / \"contracts\" / \"fixtures\"#Path(\"$B/../contracts/fixtures\")#" "$dir/tests/conftest.py"
  local out; out=$(cd "$B" && PYTHONPATH="$dir/src:$dir" uv run python -m pytest -q -p no:cacheprovider -p no:warnings --rootdir "$dir" "$dir/tests/test_snapshots.py" "$dir/tests/test_api_snapshot.py" "$dir/tests/test_cli.py" "$dir/tests/test_api.py" "$dir/tests/test_review_e2e.py" "$dir/tests/test_archive.py" 2>&1 | tail -1)
  echo "$1 : $out"
}
mutant M0-temoin snapshots.py 'return summarize(snapshot)' 'return summarize(snapshot)  # témoin'
mutant M1-parapluie-etroit snapshots.py 'except Exception:' 'except RuntimeError:'
mutant M2-ecriture-non-atomique archive.py '            tmp.replace(run_dir / SNAPSHOT_FILE)' '            (run_dir / SNAPSHOT_FILE).write_text(payload, encoding="utf-8")'
mutant M3-sha-faux snapshots.py 'return correlate_and_store(archive, bundle, stored.sha256)' 'return correlate_and_store(archive, bundle, stored.bytes_sha256)'
mutant M4-cli-continue cli.py 'failed = failed or summary is None or summary.status == "failed"' 'failed = failed or summary is None'
mutant M5-get-sans-find-run api.py '        _archived(lambda: store.find_run(infrastructure, run_id))
' ''
