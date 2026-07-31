#!/usr/bin/env bash
# My contention probe got 16x HTTP 200 and no starvation — which probably means it never
# exercised the path that hangs. The reported repro is "reload the tab and open a second one",
# i.e. EXCEEDING the window limit and taking the kick/evict branch. If this account has no limit,
# that branch never ran and my green was measuring nothing.
set -uo pipefail
BASE=http://127.0.0.1:3000
. /root/.talaria-test-env
JAR=/tmp/k4-cookies.txt

echo "=== what does a claim actually report for this account? ==="
curl -sS -b "$JAR" -X POST "$BASE/api/chart/windows/claim" -H 'Content-Type: application/json' \
  -d '{"client_id":"k4-limitcheck-aaaaaaaa"}' | head -c 400
echo
echo

echo "=== the account's configured limit ==="
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT id, email, max_sessions FROM users WHERE email='$TEST_EMAIL';" 2>&1 | sed 's/^/  /'

echo "=== columns that could carry a window/session cap ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT column_name FROM information_schema.columns
    WHERE table_name='users' AND (column_name ILIKE '%session%' OR column_name ILIKE '%window%'
       OR column_name ILIKE '%limit%' OR column_name ILIKE '%plan%' OR column_name ILIKE '%tier%');" \
  2>&1 | sed 's/^/  /'

echo
echo "=== how many windows does the account currently hold? ==="
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT COUNT(*) AS held FROM chart_window_presence p
     JOIN users u ON u.id=p.user_id WHERE u.email='$TEST_EMAIL';" 2>&1 | sed 's/^/  /'

echo
echo "=== cleanup ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "DELETE FROM chart_window_presence WHERE client_id LIKE 'k4-%';" | sed 's/^/  /'
