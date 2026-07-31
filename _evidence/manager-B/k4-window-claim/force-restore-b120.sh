#!/usr/bin/env bash
# The A/B restore failed silently: I sent `docker compose up` output to /dev/null and wrote the
# LIVE-PIN file whether or not it worked, so the canary sat on b118 with the P0 defect while the
# pin claimed b120. Restore with output visible and verify against the RUNNING container rather
# than against a file I wrote myself.
set -uo pipefail
cd /opt/talaria
TAG=canary-20260731b120

echo "=== before ==="
docker inspect -f '  trading-chart: {{.Config.Image}}' talaria-trading-chart-1
docker inspect -f '  homepage:      {{.Config.Image}}' talaria-homepage-1

echo
echo "=== images available ==="
docker images --format '  {{.Repository}}:{{.Tag}}' | grep -E "canary-20260731b1(18|19|20)" | sort

echo
echo "=== bringing up $TAG (output NOT suppressed) ==="
export HOMEPAGE_IMAGE="talaria-homepage:$TAG"
export TRADING_CHART_IMAGE="talaria-trading-chart:$TAG"
docker compose up -d --no-build trading-chart trading-chart-worker homepage
rc=$?
echo "  compose exit: $rc"

echo
echo "=== waiting for health ==="
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)
  hp=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html || echo 000)
  echo "  attempt $i: trading-chart=$st shell_http=$hp"
  [ "$st" = healthy ] && [ "$hp" = 200 ] && break
  sleep 5
done

echo
echo "=== verify against the RUNNING container, not against a pin file ==="
docker inspect -f '  trading-chart image: {{.Config.Image}}' talaria-trading-chart-1
docker inspect -f '  homepage image:      {{.Config.Image}}' talaria-homepage-1
curl -s http://127.0.0.1:3000/chart/dist-v9/index.html | grep -o "TALARIA_CHART_BUILD_ID='[^']*'" | head -1 | sed 's/^/  wire: /'
docker exec talaria-trading-chart-1 sh -c 'grep -c _require_active_chart_window_async /app/api_server.py' | sed 's/^/  async gate occurrences: /'
docker exec talaria-trading-chart-1 sh -c 'grep -c K4-P0-BARS-OFF-LOOP-V1 /app/api_server.py' | sed 's/^/  off-loop marker occurrences: /'
docker exec talaria-trading-chart-1 sh -c 'grep -c "^def get_file_bars(" /app/api_server.py' | sed 's/^/  get_file_bars sync def: /'

echo
echo "=== only now write the pin, and only if the container agrees ==="
img=$(docker inspect -f '{{.Config.Image}}' talaria-trading-chart-1)
if [ "$img" = "talaria-trading-chart:$TAG" ]; then
  echo 20260731b120 > /root/talaria-restore/LIVE-PIN.txt
  echo "  LIVE-PIN set to 20260731b120 (container confirms)"
else
  echo "  REFUSING to write pin: container is $img"
  exit 1
fi
