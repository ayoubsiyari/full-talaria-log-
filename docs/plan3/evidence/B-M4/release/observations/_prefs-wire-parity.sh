#!/bin/sh
# Which preferences-sync.js does the browser actually get, and does it carry the
# owner-scoped tier system (window.TalariaPreferences)?
echo "=== over HTTP, the way the browser loads it ==="
curl -sS -o /tmp/ps-wire.js -w 'http=%{http_code} bytes=%{size_download}\n' \
  -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/preferences-sync.js
echo "TalariaPreferences_on_wire=$(grep -c 'window.TalariaPreferences' /tmp/ps-wire.js)"
echo "PreferencesSyncManager_on_wire=$(grep -c 'class PreferencesSyncManager' /tmp/ps-wire.js)"
echo "lines_on_wire=$(wc -l </tmp/ps-wire.js | tr -d ' ')"

echo "=== the same file inside each image ==="
for c in talaria-homepage-1 talaria-trading-chart-1; do
  echo "-- $c --"
  docker exec "$c" sh -c '
    for p in /usr/share/nginx/html/chart/modules/preferences-sync.js /app/chart/modules/preferences-sync.js /build/chart/modules/preferences-sync.js; do
      [ -f "$p" ] && echo "$p lines=$(wc -l <"$p" | tr -d " ") tierblock=$(grep -c window.TalariaPreferences "$p")"
    done' 2>/dev/null || true
done

echo "=== embed shell: which realms load it ==="
curl -sS http://127.0.0.1:3000/chart/multichart-prod/chart-embed.html 2>/dev/null | grep -c preferences-sync || true
rm -f /tmp/ps-wire.js
