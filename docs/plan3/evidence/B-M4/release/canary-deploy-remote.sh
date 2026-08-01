#!/usr/bin/env bash
# Runs ON the Plan 3 canary host only (31.97.192.82).
# Restore point → scoped two-file ship → restart chart workers.
# Destroy nothing: no SQL, no prune, no row cleanup, no schema.
set -euo pipefail

UTC="$(date -u +%Y%m%dT%H%M%SZ)"
RP="${TALARIA_RESTORE_ROOT:-/root/talaria-restore}/canary-deploy-${UTC}"
SRC_API="${1:?usage: canary-deploy-remote.sh /path/api_server.py /path/order-manager.js}"
SRC_OM="${2:?usage: canary-deploy-remote.sh /path/api_server.py /path/order-manager.js}"

CHART_C="${TALARIA_CHART_CONTAINER:-talaria-trading-chart-1}"
WORKER_C="${TALARIA_CHART_WORKER_CONTAINER:-talaria-trading-chart-worker-1}"
HOME_C="${TALARIA_HOMEPAGE_CONTAINER:-talaria-homepage-1}"

API_IN_CHART=/app/api_server.py
OM_IN_CHART=/app/modules/order-manager.js
OM_IN_HOME=/usr/share/nginx/html/chart/modules/order-manager.js

echo "=== canary deploy remote · ${UTC} ==="
echo "restore=$RP host=$(hostname -f 2>/dev/null || hostname)"
test -f "$SRC_API"
test -f "$SRC_OM"
grep -q 'JOURNAL_SWEEP_PARSE_GUARD' "$SRC_API"
grep -q 'journalVouchedFor' "$SRC_OM"

echo "=== 1. restore point (archive only; destroy nothing) ==="
mkdir -p "$RP"
{
  echo "captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "hostname=$(hostname -f 2>/dev/null || hostname)"
  for c in "$CHART_C" "$WORKER_C" "$HOME_C"; do
    if docker inspect "$c" >/dev/null 2>&1; then
      echo "${c}_image=$(docker inspect -f '{{.Image}}' "$c")"
      echo "${c}_id=$(docker inspect -f '{{.Id}}' "$c")"
    else
      echo "${c}_image=MISSING"
    fi
  done
} >"$RP/IMAGE-PINS.txt"

docker cp "$CHART_C:$API_IN_CHART" "$RP/api_server.py.pre" 2>/dev/null || true
docker cp "$CHART_C:$OM_IN_CHART" "$RP/order-manager.js.chart.pre" 2>/dev/null || true
docker cp "$WORKER_C:$OM_IN_CHART" "$RP/order-manager.js.worker.pre" 2>/dev/null || true
docker cp "$HOME_C:$OM_IN_HOME" "$RP/order-manager.js.homepage.pre" 2>/dev/null || true
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' >"$RP/docker-ps.txt"
ls -la "$RP"
echo "RESTORE_POINT_OK"

echo "=== 2. two-file ship (api_server.py + order-manager.js) ==="
docker cp "$SRC_API" "$CHART_C:$API_IN_CHART"
docker cp "$SRC_API" "$WORKER_C:$API_IN_CHART"
docker cp "$SRC_OM" "$CHART_C:$OM_IN_CHART"
docker cp "$SRC_OM" "$WORKER_C:$OM_IN_CHART"
if docker inspect "$HOME_C" >/dev/null 2>&1; then
  docker cp "$SRC_OM" "$HOME_C:$OM_IN_HOME" || echo "WARN: homepage om path missing; continuing"
fi

echo "=== 3. restart chart workers (Python must reload) ==="
if [ -d /opt/talaria ] && [ -f /opt/talaria/docker-compose.yml ]; then
  (cd /opt/talaria && docker compose restart trading-chart trading-chart-worker)
else
  docker restart "$CHART_C" "$WORKER_C"
fi
sleep 4
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'trading-chart|NAME' || true

echo "=== 4. in-container marker smoke ==="
docker exec "$CHART_C" sh -c "grep -c JOURNAL_SWEEP_PARSE_GUARD $API_IN_CHART; grep -c journalVouchedFor $OM_IN_CHART"
if docker inspect "$HOME_C" >/dev/null 2>&1; then
  docker exec "$HOME_C" sh -c "grep -c journalVouchedFor $OM_IN_HOME" || true
fi

echo "REMOTE_SHIP_OK rp=$RP"
