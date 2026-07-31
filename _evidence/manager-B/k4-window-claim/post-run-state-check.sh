#!/usr/bin/env bash
# After a measurement pass, verify against the things themselves that nothing was left mutated.
# run-freeze-arm.sh raises the QA account's max_sessions to avoid eviction confounds, and the
# freeze suite writes the gate kill-switch into .env. Both must be back.
#
# Names are read from docker, not guessed: the database is talaria-db-1, not talaria-trading-postgres-1.
# The first version of this script guessed and produced two silently empty cells, which is exactly
# the "empty output read as success" trap. Every check below prints something or says why not.
set -uo pipefail
DB=talaria-db-1
APP=talaria-trading-chart-1

echo "== container =="
docker inspect -f '  image:   {{.Config.Image}}' "$APP"
docker inspect -f '  health:  {{.State.Health.Status}}  status: {{.State.Status}}' "$APP"

echo
echo "== fix present in the code that is actually running =="
for m in _require_active_chart_window_async K4-P0-BARS-OFF-LOOP-V1; do
  n=$(docker exec "$APP" sh -c "grep -c '$m' /app/api_server.py 2>/dev/null || echo 0")
  echo "  $m: $n"
done
echo -n "  get_file_bars is sync def: "
docker exec "$APP" sh -c "grep -c '^def get_file_bars' /app/api_server.py 2>/dev/null || echo 0"

echo
echo "== kill-switch must be unset in the running process =="
echo -n "  in-process value: "
docker exec "$APP" sh -c 'printenv TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1 2>/dev/null || echo "<unset>"'
echo -n "  lines in host .env: "
grep -c 'TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1' /root/talaria-deploy/.env 2>/dev/null || echo 0

echo
echo "== session caps: the run script raises these, so they must be back =="
docker exec "$DB" psql -U talaria -d talaria -tAc \
  "select id || '  ' || email || '  max_sessions=' || coalesce(max_sessions::text,'null') from users order by id;" \
  2>&1 | sed 's/^/  /'

echo
echo "== window presence rows left behind by the runs =="
docker exec "$DB" psql -U talaria -d talaria -tAc \
  "select count(*) from chart_window_presence;" 2>&1 | sed 's/^/  rows: /'

echo
echo "== app answers =="
for u in /login/ /api/health; do
  echo "  $u -> HTTP $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000$u")"
done
echo "  (/api/health is gated and returns 401 unauthenticated; that is expected and is why it"
echo "   works as a do-no-database latency probe. /login/ 200 is the liveness signal.)"

echo
echo "== build stamp, read from the bundle the container actually serves =="
B=$(docker exec "$APP" sh -c 'ls /app/static/js/chart.js /app/static/chart.js /app/chart.js 2>/dev/null | head -1')
if [ -n "$B" ]; then
  echo "  bundle: $B"
  docker exec "$APP" sh -c "grep -o '20260731b[0-9]*' '$B' | head -1" | sed 's/^/  stamp: /'
else
  echo "  could not locate the bundle by any known path; listing candidates:"
  docker exec "$APP" sh -c 'find /app -maxdepth 3 -name "chart*.js" 2>/dev/null | head -10' | sed 's/^/    /'
fi
