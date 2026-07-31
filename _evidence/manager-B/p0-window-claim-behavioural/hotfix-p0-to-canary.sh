#!/usr/bin/env bash
# Surgical P0 hotfix onto live canary b114 images (api_server + chart-window-limit.js).
# Does not retag images; records restore copies first (CKPT-01 minimal).
set -euo pipefail
HOST_ROOT="${1:?host path to manager-b-plan3}"
STAMP="20260730b114"
RP="/root/talaria-restore/p0-window-claim-hotfix-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RP"
echo "RESTORE=$RP"

if [[ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]]; then
  echo "MEASUREMENT_IN_PROGRESS=yes"
  cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS
  exit 9
fi

API_SRC="$HOST_ROOT/chart v 1.4/chart/api_server.py"
CWL_SRC="$HOST_ROOT/chart v 1.4/chart/modules/chart-window-limit.js"
test -f "$API_SRC"
test -f "$CWL_SRC"

# Locate api_server inside trading-chart
API_DST=$(docker exec talaria-trading-chart-1 sh -c 'find /app -name api_server.py | head -1')
echo "API_DST=$API_DST"
test -n "$API_DST"

docker cp "talaria-trading-chart-1:$API_DST" "$RP/api_server.py.bak"
docker cp "talaria-homepage-1:/usr/share/nginx/html/chart/modules/chart-window-limit.js" \
  "$RP/chart-window-limit.js.bak" || true

docker cp "$API_SRC" "talaria-trading-chart-1:$API_DST"
docker cp "$API_SRC" "talaria-trading-chart-worker-1:$API_DST" 2>/dev/null || true
docker cp "$CWL_SRC" "talaria-homepage-1:/usr/share/nginx/html/chart/modules/chart-window-limit.js"

# Restart API workers so def/threadpool + lock_timeout load
docker restart talaria-trading-chart-1 talaria-trading-chart-worker-1
# nginx serves static from disk; no restart required, but reload for cleanliness
docker exec talaria-homepage-1 nginx -s reload || true

echo "waiting for health..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -sf -o /dev/null "http://127.0.0.1:3000/api/auth/me"; then
    echo "up after ${i}s (me may 401 — connection ok)"
    break
  fi
  # 401 still means up
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/api/auth/me" || true)
  if [[ "$code" == "401" || "$code" == "200" ]]; then
    echo "up http=$code after ${i}s"
    break
  fi
  sleep 5
done

echo "=== wire markers ==="
curl -sS "http://127.0.0.1:3000/chart/modules/chart-window-limit.js" | wc -c
curl -sS "http://127.0.0.1:3000/chart/modules/chart-window-limit.js" | grep -c 'Prefer bounded controlFetch' || true
docker exec talaria-trading-chart-1 sh -c "grep -n 'def chart_window_claim\|_async def chart_window_claim\|_lock_timeout\|_run_in_threadpool(_patch_trading_session_state_db)' '$API_DST' | head -20"

echo "HOTFIX_OK stamp=$STAMP restore=$RP"
echo "$RP" > /root/talaria-restore/LAST-P0-WINDOW-CLAIM-HOTFIX.txt
