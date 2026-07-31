#!/bin/bash
# The disk says no inline maps. The disk is not what the browser gets. Re-check over HTTP, following
# redirects, and confirm the served bytes match the file on disk so "clean on disk" can stand for
# "clean on the wire" for the rest of the tree.
set -u
BASE=http://127.0.0.1:3000
CHART=talaria-trading-chart-1

# Discover the real served prefix rather than guessing it again.
echo "=== what does the chart page actually load? (script srcs from the shell HTML) ==="
curl -sL "$BASE/chart/dist-v9/index.html" -o /tmp/shell.html -w 'index.html HTTP %{http_code}, %{size_download} bytes, final %{url_effective}\n'
grep -oE '(src|href)="[^"]+\.(js|css)[^"]*"' /tmp/shell.html 2>/dev/null | sed 's/^/  /' | head -25
echo "  (script tags found: $(grep -coE '(src|href)="[^"]+\.(js|css)' /tmp/shell.html 2>/dev/null))"

echo
echo "=== fetch the heaviest assets over the wire and inspect what arrives ==="
for u in \
  /chart/chart.js \
  /chart/modules/order-manager.js \
  /chart/modules/replay-system.js \
  /chart/modules/chart-data-pipeline.js \
  /chart/dist-v9/assets/talaria-v9-live.js \
  /chart/modules/chart-indicators-full.js
do
  code=$(curl -sL -o /tmp/w.js -w '%{http_code}' "$BASE$u")
  if [ "$code" != "200" ]; then echo "  HTTP $code   $u"; continue; fi
  sz=$(stat -c %s /tmp/w.js)
  if grep -qs "sourceMappingURL=data:" /tmp/w.js; then
    m=$(grep -os "sourceMappingURL=data:[^\"' ]*" /tmp/w.js | wc -c)
    echo "  200  $sz bytes  *** INLINE MAP: $m bytes ***  $u"
  elif grep -qs "sourceMappingURL=" /tmp/w.js; then
    echo "  200  $sz bytes  external map ref: $(grep -os 'sourceMappingURL=[^"'"'"' ]*' /tmp/w.js | head -1)  $u"
  else
    echo "  200  $sz bytes  no source map  $u"
  fi
  # does the wire match the disk? if yes, the disk sweep generalises.
  disk=$(echo "$u" | sed 's|^/chart|/app|')
  dsum=$(docker exec "$CHART" sha256sum "$disk" 2>/dev/null | awk '{print $1}')
  wsum=$(sha256sum /tmp/w.js | awk '{print $1}')
  if [ -n "$dsum" ]; then
    [ "$dsum" = "$wsum" ] && echo "       wire == disk (so the 111-file disk sweep covers the wire)" \
                          || echo "       WIRE DIFFERS FROM DISK - something transforms it in transit"
  fi
done

echo
echo "=== does a .map ever resolve, even though none exist on disk? ==="
for u in /chart/chart.js.map /chart/modules/order-manager.js.map /chart/dist-v9/assets/talaria-v9-live.js.map; do
  echo "  $(curl -sL -o /dev/null -w '%{http_code}' "$BASE$u")  $u"
done
rm -f /tmp/w.js /tmp/shell.html
