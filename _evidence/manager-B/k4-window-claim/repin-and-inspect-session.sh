#!/usr/bin/env bash
# Two jobs.
#
# 1. Repin. My recreate() ran `docker compose up` without exporting TRADING_CHART_IMAGE, so compose
#    fell back to talaria-trading-chart:latest. That content is the b120 build (the ship script tags
#    latest -> canary-<bid>), so the code is right, but the container is not running the pinned tag
#    and pinning is the whole point of the restore mechanism.
#
# 2. Find out how to reset replay position. Bars climbed 579 -> 1955 across my runs because the
#    session's replay position persists, and blocked main-thread time tracked the bar count. If
#    that is what my b118-vs-b120 A/B actually measured, the A/B is confounded and the 5.9x is not
#    a build difference. This looks for a way to start every run from the same position.
set -uo pipefail
cd /opt/talaria
TAG=canary-20260731b120

echo "=== 1. repin to $TAG ==="
docker inspect -f '  before: {{.Config.Image}}' talaria-trading-chart-1
export HOMEPAGE_IMAGE="talaria-homepage:$TAG"
export TRADING_CHART_IMAGE="talaria-trading-chart:$TAG"
docker compose up -d --no-build trading-chart trading-chart-worker homepage
echo "  compose exit: $?"
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)
  hp=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html || echo 000)
  [ "$st" = healthy ] && [ "$hp" = 200 ] && break
  sleep 4
done
docker inspect -f '  after:  {{.Config.Image}}' talaria-trading-chart-1
docker inspect -f '  homepage: {{.Config.Image}}' talaria-homepage-1
echo "  health: $(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1)"
curl -s http://127.0.0.1:3000/chart/dist-v9/index.html | grep -o "TALARIA_CHART_BUILD_ID='[^']*'" | head -1 | sed 's/^/  wire: /'
docker exec talaria-trading-chart-1 sh -c 'grep -c K4-P0-BARS-OFF-LOOP-V1 /app/api_server.py' | sed 's/^/  off-loop marker: /'
echo -n "  kill-switch env: "
docker exec talaria-trading-chart-1 sh -c 'printenv TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1 2>/dev/null || echo "<unset, correct>"'

echo
echo "=== 2. what does session 936 persist, and where is the replay position? ==="
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT id, user_id, session_type, LENGTH(config_json) AS config_len,
          LENGTH(COALESCE(state_json,'')) AS state_len
     FROM trading_sessions WHERE id=936;" 2>&1 | sed 's/^/  /'

echo "  columns on trading_sessions that could hold replay position:"
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT column_name||' '||data_type FROM information_schema.columns
    WHERE table_name='trading_sessions'
      AND (column_name ILIKE '%state%' OR column_name ILIKE '%config%'
        OR column_name ILIKE '%replay%' OR column_name ILIKE '%position%'
        OR column_name ILIKE '%index%' OR column_name ILIKE '%bar%');" 2>&1 | sed 's/^/    /'

echo
echo "  keys inside the persisted state (top level):"
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT string_agg(k, ', ') FROM (
     SELECT jsonb_object_keys(state_json::jsonb) AS k FROM trading_sessions WHERE id=936
   ) t;" 2>&1 | head -5 | sed 's/^/    /'

echo
echo "  anything that looks like a playback index:"
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT k||' = '||LEFT(v::text, 80) FROM (
     SELECT key AS k, value AS v FROM trading_sessions, jsonb_each(state_json::jsonb)
      WHERE id=936
   ) t WHERE k ILIKE '%replay%' OR k ILIKE '%index%' OR k ILIKE '%position%'
        OR k ILIKE '%bar%' OR k ILIKE '%candle%' OR k ILIKE '%playback%';" 2>&1 | sed 's/^/    /'
