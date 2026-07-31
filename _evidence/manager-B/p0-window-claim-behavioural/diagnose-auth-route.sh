#!/usr/bin/env bash
# Why does /api/auth/me say 200 and /api/chart/windows/claim say 401 on the same cookie jar?
set -uo pipefail
BASE=http://127.0.0.1:3000
. /root/.talaria-test-env

echo "=== which upstream answers each path ==="
for p in /api/auth/me /api/auth/login /api/chart/windows/claim; do
  srv=$(curl -sS -o /dev/null -D - "$BASE$p" 2>/dev/null | grep -iE '^(server|x-upstream|x-served-by):' | tr -d '\r' | paste -sd' ')
  printf '  %-32s %s\n' "$p" "${srv:-<no marker>}"
done

echo
echo "=== nginx route map for /api ==="
docker exec talaria-homepage-1 sh -c "grep -nE 'location .*(api|chart)' /etc/nginx/conf.d/*.conf | head -30" 2>&1 | sed 's/^/  /'

echo
echo "=== cookies the login set (names only) ==="
rm -f /tmp/qacj
curl -sS -c /tmp/qacj -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  --data-binary "$(python3 - <<'PY'
import json,os
print(json.dumps({"email":os.environ["TEST_EMAIL"],"password":os.environ["TEST_PASSWORD"]}))
PY
)" -o /dev/null -w '  login http=%{http_code}\n'
awk '!/^#/ && NF {print "  cookie: " $6}' /tmp/qacj

echo
echo "=== does the chart service have a UserSession row for this user? ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT 'user_sessions rows for 128 = ' || count(*) FROM user_sessions WHERE user_id=128" 2>&1 | sed 's/^/  /'
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT 'total user_sessions = ' || count(*) FROM user_sessions" 2>&1 | sed 's/^/  /'

echo
echo "=== SESSION_COOKIE_NAME the chart api expects ==="
docker exec talaria-trading-chart-1 sh -c "grep -nE '^SESSION_COOKIE_NAME' /app/api_server.py" 2>&1 | sed 's/^/  /'

echo
echo "=== is there a chart-side login endpoint? ==="
docker exec talaria-trading-chart-1 sh -c "grep -nE '@app.post\(\"/api/auth/(login|signup)\"' /app/api_server.py" 2>&1 | sed 's/^/  /'
