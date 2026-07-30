#!/bin/sh
echo "=== M17-DI2 guard on the wire (correct files: chart.js, replay-system.js, panel-cmd-bridge.js) ==="
for p in /chart/chart.js /chart/modules/replay-system.js /chart/multichart-prod/panel-cmd-bridge.js; do
  code=$(curl -s -o /tmp/f.js -w '%{http_code}' "http://127.0.0.1:3000$p")
  echo "$p http=$code bytes=$(wc -c < /tmp/f.js) guard_hits=$(grep -c '__TALARIA_DISABLE_COMPLETED_BAR_CLOSE_GUARD_V1' /tmp/f.js)"
done

echo "=== stamp, cache-busted, exact ==="
curl -s -H 'Cache-Control: no-cache' 'http://127.0.0.1:3000/chart/index.html' | grep -o "__TALARIA_CHART_BUILD_ID *= *'[^']*'" | head -2

echo "=== why did b103 vanish: retention log + what is left ==="
ls -la /root/talaria-restore/images/ 2>/dev/null
echo "--- restore points ---"
ls -1 /root/talaria-restore/ 2>/dev/null | head -30
echo "--- dangling/none images ---"
docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}' | grep -E 'talaria' | sort
