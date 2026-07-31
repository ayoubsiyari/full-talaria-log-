#!/usr/bin/env bash
# /api/auth/me authenticates with chart_session_id but /api/chart/windows/claim does not,
# and both proxy to the same container. Split nginx from the app.
set -uo pipefail
BASE=http://127.0.0.1:3000
. /root/.talaria-test-env

uid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c "SELECT id FROM users WHERE email='$TEST_EMAIL'")
sid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id FROM user_sessions WHERE user_id=$uid ORDER BY last_active_at DESC NULLS LAST LIMIT 1")

echo "=== A. through nginx ==="
curl -sS -b "chart_session_id=$sid" "$BASE/api/auth/me" -o /dev/null -w '  me    http=%{http_code}\n'
curl -sS -b "chart_session_id=$sid" -X POST "$BASE/api/chart/windows/claim" \
  -H 'content-type: application/json' -d '{"client_id":"diag12345678"}' \
  -o /tmp/d1.json -w '  claim http=%{http_code}\n'; echo "        $(head -c 160 /tmp/d1.json)"

echo
echo "=== B. straight at the container, nginx out of the picture ==="
docker exec talaria-trading-chart-1 sh -c "
  curl -sS -b 'chart_session_id=$sid' http://127.0.0.1:8000/api/auth/me -o /dev/null -w '  me    http=%{http_code}\n'
  curl -sS -b 'chart_session_id=$sid' -X POST http://127.0.0.1:8000/api/chart/windows/claim \
    -H 'content-type: application/json' -d '{\"client_id\":\"diag12345678\"}' \
    -o /tmp/d2.json -w '  claim http=%{http_code}\n'
  echo \"        \$(head -c 160 /tmp/d2.json)\"
" 2>&1

echo
echo "=== C. the nginx block for /api/chart/windows/ in full ==="
docker exec talaria-homepage-1 sh -c \
  "awk '/location \^~ \/api\/chart\/windows\//,/^    }/' /etc/nginx/conf.d/default.conf" 2>&1 | sed 's/^/  /'

echo
echo "=== D. what the app logged for the claim ==="
docker logs --since 60s talaria-trading-chart-1 2>&1 | grep -iE 'windows/claim|not authenticated' | tail -5 | sed 's/^/  /'
