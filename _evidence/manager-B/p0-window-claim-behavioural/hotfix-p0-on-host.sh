#!/usr/bin/env bash
# Run ON the canary host after files are staged in /tmp/p0-hotfix/
set -euo pipefail
STAGED=/tmp/p0-hotfix
test -f "$STAGED/api_server.py"
test -f "$STAGED/chart-window-limit.js"

if [[ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]]; then
  echo "MEASUREMENT_IN_PROGRESS=yes"
  cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS
  exit 9
fi

RP="/root/talaria-restore/p0-window-claim-hotfix-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RP" /root/talaria-restore
echo "RESTORE=$RP"
touch /root/talaria-restore/DEPLOY-IN-PROGRESS

API_DST=$(docker exec talaria-trading-chart-1 sh -c 'find /app -name api_server.py | head -1')
echo "API_DST=$API_DST"
test -n "$API_DST"

docker cp "talaria-trading-chart-1:$API_DST" "$RP/api_server.py.bak"
docker cp "talaria-homepage-1:/usr/share/nginx/html/chart/modules/chart-window-limit.js" \
  "$RP/chart-window-limit.js.bak"

docker cp "$STAGED/api_server.py" "talaria-trading-chart-1:$API_DST"
if docker ps --format '{{.Names}}' | grep -qx talaria-trading-chart-worker-1; then
  docker cp "$STAGED/api_server.py" "talaria-trading-chart-worker-1:$API_DST"
fi
docker cp "$STAGED/chart-window-limit.js" \
  "talaria-homepage-1:/usr/share/nginx/html/chart/modules/chart-window-limit.js"

docker restart talaria-trading-chart-1
if docker ps -a --format '{{.Names}}' | grep -qx talaria-trading-chart-worker-1; then
  docker restart talaria-trading-chart-worker-1
fi
docker exec talaria-homepage-1 nginx -s reload || true

for i in $(seq 1 24); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/api/auth/me" || echo 000)
  if [[ "$code" == "401" || "$code" == "200" ]]; then
    echo "up http=$code after ${i} attempts"
    break
  fi
  sleep 5
done

echo "=== cwl bytes ==="
curl -sS "http://127.0.0.1:3000/chart/modules/chart-window-limit.js" | wc -c
echo "=== prefer controlFetch ==="
curl -sS "http://127.0.0.1:3000/chart/modules/chart-window-limit.js" | grep -c 'Prefer bounded controlFetch' || true
echo "=== api markers ==="
docker exec talaria-trading-chart-1 grep -nE 'def chart_window_claim|async def chart_window_claim|_set_local_lock_timeout|run_in_threadpool\(_patch_trading_session_state_db\)' "$API_DST" | head -20

rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS
echo "$RP" > /root/talaria-restore/LAST-P0-WINDOW-CLAIM-HOTFIX.txt
echo "HOTFIX_OK restore=$RP"
