#!/usr/bin/env bash
# Hold users.id=13 FOR UPDATE in a long-lived psql, then claim concurrently.
set -euo pipefail
EMAIL="${TEST_EMAIL:?}"
PASSWORD="${TEST_PASSWORD:?}"
BASE="${TALARIA_TEST_BASE_URL:-http://127.0.0.1:3000}"

echo "=== _DATABASE_USES_ROW_LOCK ==="
docker exec talaria-trading-chart-1 sh -c \
  'grep -n "_DATABASE_USES_ROW_LOCK" /app/api_server.py | head -20'

rm -f /tmp/cj /tmp/claim.json
curl -sS -c /tmp/cj -X POST "${BASE}/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
  -o /tmp/login.json >/dev/null
echo "login ok"

# Long-lived lock via fifo so the session stays open
LOCKLOG=/tmp/lockhold.log
rm -f /tmp/lock.sql /tmp/lockhold.log
cat >/tmp/lock.sql <<'SQL'
BEGIN;
SELECT id FROM users WHERE id=13 FOR UPDATE;
SELECT pg_sleep(30);
COMMIT;
SQL
docker cp /tmp/lock.sql talaria-db-1:/tmp/lock.sql
docker exec -d talaria-db-1 sh -c 'psql -U talaria -d talaria -f /tmp/lock.sql > /tmp/lockhold.log 2>&1'
sleep 2
echo "lock log so far:"
docker exec talaria-db-1 cat /tmp/lockhold.log || true

echo "pg_locks for user 13:"
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT locktype,mode,granted,pid FROM pg_locks WHERE relation = 'users'::regclass OR granted = false ORDER BY granted, pid LIMIT 20;"

echo "claim while locked:"
curl -sS -b /tmp/cj -X POST "${BASE}/api/chart/windows/claim" \
  -H 'content-type: application/json' \
  -d "{\"client_id\":\"lockv2$(date +%s)xxxxxxxx\"}" \
  -o /tmp/claim.json -w 'http=%{http_code} time=%{time_total}\n' \
  --max-time 70 || echo "claim_exit=$?"
cat /tmp/claim.json; echo

echo "me while locked:"
curl -sS -b /tmp/cj "${BASE}/api/auth/me" -o /dev/null \
  -w 'http=%{http_code} time=%{time_total}\n' --max-time 70 || true

echo "file bars while locked (ungated? gated?):"
curl -sS -b /tmp/cj "${BASE}/api/file/1/bars?limit=1" -o /dev/null \
  -w 'http=%{http_code} time=%{time_total}\n' --max-time 70 || true
