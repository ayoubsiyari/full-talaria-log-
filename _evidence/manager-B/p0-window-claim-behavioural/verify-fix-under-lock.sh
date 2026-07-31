#!/usr/bin/env bash
# After hotfix: claim under FOR UPDATE must fail within ~5s (lock_timeout 3s), not ~27s.
set -euo pipefail
EMAIL="${TEST_EMAIL:?}"
PASSWORD="${TEST_PASSWORD:?}"
BASE="${TALARIA_TEST_BASE_URL:-http://127.0.0.1:3000}"

rm -f /tmp/cj /tmp/claim.json
curl -sS -c /tmp/cj -X POST "${BASE}/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
  -o /tmp/login.json >/dev/null

cat >/tmp/lock.sql <<'SQL'
BEGIN;
SELECT id FROM users WHERE id=13 FOR UPDATE;
SELECT pg_sleep(20);
COMMIT;
SQL
docker cp /tmp/lock.sql talaria-db-1:/tmp/lock.sql
docker exec -d talaria-db-1 sh -c 'psql -U talaria -d talaria -f /tmp/lock.sql > /tmp/lockhold.log 2>&1'
sleep 2

echo "claim under lock (expect ~3s and 503):"
curl -sS -b /tmp/cj -X POST "${BASE}/api/chart/windows/claim" \
  -H 'content-type: application/json' \
  -d "{\"client_id\":\"postfix$(date +%s)xxxxxxxx\"}" \
  -o /tmp/claim.json -w 'http=%{http_code} time=%{time_total}\n' \
  --max-time 30 || echo "claim_exit=$?"
cat /tmp/claim.json; echo

echo "me during/after claim:"
curl -sS -b /tmp/cj "${BASE}/api/auth/me" -o /dev/null \
  -w 'http=%{http_code} time=%{time_total}\n' --max-time 10 || true
