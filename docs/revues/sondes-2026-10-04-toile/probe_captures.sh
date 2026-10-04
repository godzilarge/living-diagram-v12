#!/usr/bin/env bash
# Sonde C : rendu réel dans Chromium headless des pages de la sonde A, ancien script contre toile construite :
# capture PNG et DOM après exécution comparés à l'octet, pour trois adresses (défaut, stubs=1, un câble ouvert).
# Lancer depuis la racine du dépôt, après la sonde A :
#     bash docs/revues/sondes-2026-10-04-toile/probe_captures.sh docs/revues/sondes-2026-10-04-toile/tmp
# Second argument facultatif : la liste des variantes (défaut : les sept de la sonde A) ; troisième : le budget de
# temps virtuel en ms (défaut 15000 ; la page à la jauge, `big`, en demande 60000).
set -u
DIR="${1:-$(dirname "$0")/tmp}"
VARIANTS="${2:-page hub aggstop unread diff unreachable shell}"
BUDGET="${3:-15000}"
CHROME=$(ls ~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell 2>/dev/null | head -1)
[ -x "$CHROME" ] || { echo "Chromium headless absent"; exit 2; }
FLAGS="--no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,900 --virtual-time-budget=$BUDGET"
LINK='%5B%22sw-core-01%22%2C%22Ethernet1%2F2%22%2C%22sw-core-02%22%2C%22Ethernet1%2F2%22%5D'
failed=0
for name in $VARIANTS; do
  for hash in "" "#stubs=1" "#view=graph&stubs=1&link=$LINK"; do
    tag="$name$(echo "$hash" | tr -c 'a-z0-9=' '_')"
    for side in old new; do
      "$CHROME" $FLAGS --screenshot="$DIR/$tag-$side.png" "file://$(realpath "$DIR/$name-$side.html")$hash" >/dev/null 2>&1
      "$CHROME" $FLAGS --dump-dom "file://$(realpath "$DIR/$name-$side.html")$hash" 2>/dev/null \
        | sed -e '/<script id="ld-viewer">/,/<\/script>/d' -e 's/sha256-[A-Za-z0-9+\/=]*//g' > "$DIR/$tag-$side.dom.html"
    done
    png=$(cmp -s "$DIR/$tag-old.png" "$DIR/$tag-new.png" && echo identique || echo DIFFÉRENT)
    dom=$(cmp -s "$DIR/$tag-old.dom.html" "$DIR/$tag-new.dom.html" && echo identique || echo DIFFÉRENT)
    [ "$png" = identique ] && [ "$dom" = identique ] || failed=$((failed + 1))
    printf '%-40s capture %-10s DOM %-10s (%s octets)\n' "$tag" "$png" "$dom" "$(stat -c %s "$DIR/$tag-new.png")"
  done
done
echo "paires différentes : $failed"
exit $failed
