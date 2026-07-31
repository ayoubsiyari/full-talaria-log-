#!/usr/bin/env bash
set -uo pipefail
. /root/.talaria-test-env
uid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c "SELECT id FROM users WHERE email='$TEST_EMAIL'")
sid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id FROM user_sessions WHERE user_id=$uid ORDER BY last_active_at DESC NULLS LAST LIMIT 1")

echo "=== every place the running image raises 'Not authenticated' ==="
docker exec talaria-trading-chart-1 grep -n 'Not authenticated' /app/api_server.py | sed 's/^/  /'

echo
echo "=== the claim endpoint as deployed ==="
docker exec talaria-trading-chart-1 sh -c \
  "grep -n -B4 -A18 '^def chart_window_claim' /app/api_server.py" 2>&1 | sed 's/^/  /'

echo
echo "=== middleware that could reject a POST before the route ==="
docker exec talaria-trading-chart-1 sh -c \
  "grep -nE 'middleware|csrf|CSRF' /app/api_server.py | head -25" 2>&1 | sed 's/^/  /'

echo
echo "=== is the session row actually resolvable the way the app resolves it? ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT 'row found, user=' || user_id FROM user_sessions WHERE id='$sid'" 2>&1 | sed 's/^/  /'

echo
echo "=== GET vs POST on the same path (is it the method?) ==="
docker exec talaria-trading-chart-1 sh -c "
  curl -sS -b 'chart_session_id=$sid' http://127.0.0.1:8000/api/chart/windows/claim -o /dev/null -w '  GET  claim http=%{http_code}\n'
  curl -sS -b 'chart_session_id=$sid' -X POST http://127.0.0.1:8000/api/chart/windows/release \
    -H 'content-type: application/json' -d '{\"client_id\":\"diag12345678\"}' -o /dev/null -w '  POST release http=%{http_code}\n'
  curl -sS -b 'chart_session_id=$sid' -X POST http://127.0.0.1:8000/api/chart/windows/claim \
    -H 'content-type: application/json' -H 'Origin: http://127.0.0.1:3000' \
    -d '{\"client_id\":\"diag12345678\"}' -o /dev/null -w '  POST claim +Origin http=%{http_code}\n'
" 2>&1
