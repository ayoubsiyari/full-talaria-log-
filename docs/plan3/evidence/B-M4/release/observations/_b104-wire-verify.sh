#!/bin/sh
# MEAS-01 beyond the stamp: is the code in the stamp actually on the wire,
# and is b103 still there for C to grade against?
echo "=== images retained ==="
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E 'canary-20260729b10[0-9]' | sort
echo "=== tarballs retained ==="
ls -la /root/talaria-restore/images/ 2>/dev/null | grep -E 'b10[0-9]'
echo "=== live pin ==="
cat /root/talaria-restore/LIVE_PIN 2>/dev/null || docker ps --format '{{.Image}}' | sort -u

echo "=== STASHED-PANEL-HANDLE on the wire (multichart-manager.js) ==="
for u in http://127.0.0.1:3000/chart/multichart-prod/multichart-manager.js; do
  code=$(curl -s -o /tmp/mm.js -w '%{http_code}' "$u")
  echo "$u http=$code bytes=$(wc -c < /tmp/mm.js)"
  echo "stash_flag_hits=$(grep -c '__TALARIA_DISABLE_MC_STASHED_PANEL_HANDLE_V1' /tmp/mm.js)"
  echo "panelWinStash_hits=$(grep -c 'panelWinStash' /tmp/mm.js)"
done

echo "=== PREFS cloud failure cap on the wire (preferences-sync.js) ==="
code=$(curl -s -o /tmp/ps.js -w '%{http_code}' http://127.0.0.1:3000/chart/modules/preferences-sync.js)
echo "http=$code bytes=$(wc -c < /tmp/ps.js) cap_hits=$(grep -c 'PREFS_CLOUD_FAILURE_CAP' /tmp/ps.js)"

echo "=== M17-DI2 on the wire (dist-v9 bundle) ==="
idx=$(curl -s http://127.0.0.1:3000/chart/dist-v9/index.html | grep -o 'assets/[A-Za-z0-9._-]*\.js' | head -3)
echo "bundles=$idx"
for b in $idx; do
  curl -s -o /tmp/b.js "http://127.0.0.1:3000/chart/dist-v9/$b"
  echo "$b bytes=$(wc -c < /tmp/b.js) di2_hits=$(grep -c 'DISABLE_M17_DI2\|M17_DI2' /tmp/b.js)"
done

echo "=== stamp again, cache-busted ==="
curl -s "http://127.0.0.1:3000/chart/?cb=$(date +%s)" | grep -o "__TALARIA_CHART_BUILD_ID='[^']*'" | head -1
