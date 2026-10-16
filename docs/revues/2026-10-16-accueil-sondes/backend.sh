#!/usr/bin/env bash
# Probe: GET /api/infrastructures on a real archive (generator, seeds demo / b / c, plus bundles re-dated by hand: an
# offset start, a start with a fraction of a second), then: the order of the list, an unreadable folder, a corrupt
# snapshot, and four requests of intent (colour, two colours removed, pin, pin released) read back by the home.
# Usage, from the repository root: bash docs/revues/2026-10-16-accueil-sondes/backend.sh <empty work dir>
set -euo pipefail
W=${1:?work dir}; ROOT=$(pwd); mkdir -p "$W/gen" "$W/archive"
(cd contracts && uv run ld-contracts generate --seed demo --devices 30 --runs 3 --out "$W/gen/a" --infrastructure alpha --start 2026-10-14T04:00:00Z >/dev/null
  uv run ld-contracts generate --seed b --devices 12 --runs 2 --out "$W/gen/b" --infrastructure bravo --start 2026-10-15T05:00:00+02:00 >/dev/null)
python3 -I - "$W/gen" <<'PY'
import json, sys
from pathlib import Path
gen = Path(sys.argv[1]); src = json.loads((gen / "b/run-01.json").read_text())
for name, start in [("echo", "2026-10-16T04:00:00Z"), ("foxtrot", "2026-10-16T04:00:00.500Z")]:
    d = json.loads(json.dumps(src).replace('"bravo"', json.dumps(name))); d["run"]["start_datetime"] = start; d["run"]["end_datetime"] = None
    (gen / f"{name}.json").write_text(json.dumps(d))
PY
cd backend
for f in "$W"/gen/a/run-0*.json "$W"/gen/b/run-0*.json "$W"/gen/echo.json "$W"/gen/foxtrot.json; do uv run ld ingest "$f" --archive "$W/archive" >/dev/null; done
LD_API_TOKEN=x LD_ARCHIVE_DIR="$W/archive" uv run uvicorn ld_backend.api:app_from_env --factory --port 8018 >"$W/server.log" 2>&1 &
SERVER=$!; trap 'pkill -f "app_from_env --factory --port 8018" || true' EXIT; sleep 4
get() { curl -s -H "Authorization: Bearer x" "localhost:8018$1"; }
echo "order (foxtrot starts 0.5 s after echo):"; get /api/infrastructures | python3 -I -c 'import json,sys;[print(" ",i["infrastructure"],i["last_run"]["run_start"]) for i in json.load(sys.stdin)["infrastructures"]]'
mkdir "$W/archive/zulu"; chmod 000 "$W/archive/zulu"
echo "an unreadable folder: HTTP $(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer x' localhost:8018/api/infrastructures)"; chmod 755 "$W/archive/zulu"; rmdir "$W/archive/zulu"
SNAP=$(ls -d "$W"/archive/echo/*/)snapshot.json; printf '{broken' >"$SNAP"
echo "a corrupt snapshot: checks = $(get /api/infrastructures | python3 -I -c 'import json,sys;print([i["checks"] for i in json.load(sys.stdin)["infrastructures"] if i["infrastructure"]=="echo"])')"
P="/api/intent/patches?infrastructure=alpha"; post() { curl -s -o /dev/null -X POST -H "Authorization: Bearer x" -H "Content-Type: application/json" "localhost:8018$P" -d "$1"; }
post '{"author":"camille.r","ops":[{"op":"color","hostname":"dc01-acc-01","hue":"blue"}]}'
post '{"author":"orhan","ops":[{"op":"uncolor","hostname":"dc01-acc-01"},{"op":"uncolor","hostname":"dc01-acc-02"}]}'
post '{"author":"orhan","ops":[{"op":"pin","hostname":"dc01-acc-03","x":10,"y":10}]}'
post '{"author":"orhan","ops":[{"op":"unpin","hostname":"dc01-acc-03"}]}'
echo "journal (PAUSE=1 keeps the server up for real.mjs, which reads the feed):"
get "/api/intent/journal?limit=10" | python3 -I -c 'import json,sys;[print(" ",e["author"],[o["op"] for o in e["ops"]]) for e in json.load(sys.stdin)["entries"]]'
if [ "${PAUSE:-0}" = 1 ]; then read -r -p "server on 8018; Enter stops it "; fi
