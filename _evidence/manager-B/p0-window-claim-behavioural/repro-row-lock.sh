#!/usr/bin/env bash
# Hold users.id FOR UPDATE, then time authenticated claim + /api/auth/me.
set -euo pipefail
EMAIL="${TEST_EMAIL:?}"
PASSWORD="${TEST_PASSWORD:?}"
BASE="${TALARIA_TEST_BASE_URL:-http://127.0.0.1:3000}"

USER_ID=$(docker exec talaria-db-1 psql -U talaria -d talaria -tAc \
  "SELECT id FROM users WHERE email='${EMAIL}' LIMIT 1")
echo "user_id=${USER_ID}"
test -n "${USER_ID}" && test "${USER_ID}" != "0"

# Lock for 25s in background
docker exec -d talaria-db-1 psql -U talaria -d talaria -v ON_ERROR_STOP=1 -c \
  "BEGIN; SELECT id FROM users WHERE id=${USER_ID} FOR UPDATE; SELECT pg_sleep(25); COMMIT;"
sleep 1

rm -f /tmp/cj /tmp/login.json /tmp/claim.json
LOGIN_CODE=$(curl -sS -c /tmp/cj -X POST "${BASE}/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
  -o /tmp/login.json -w '%{http_code}')
echo "login_http=${LOGIN_CODE}"

echo "claim under lock:"
curl -sS -b /tmp/cj -X POST "${BASE}/api/chart/windows/claim" \
  -H 'content-type: application/json' \
  -d "{\"client_id\":\"lockprobe$(date +%s)\"}" \
  -o /tmp/claim.json -w 'http=%{http_code} time=%{time_total}\n' \
  --max-time 70 || echo "claim_curl_exit=$?"
head -c 240 /tmp/claim.json; echo

echo "me under lock:"
curl -sS -b /tmp/cj "${BASE}/api/auth/me" \
  -o /dev/null -w 'http=%{http_code} time=%{time_total}\n' \
  --max-time 70 || echo "me_curl_exit=$?"

echo "claim after lock should release (~25s):"
sleep 5
curl -sS -b /tmp/cj -X POST "${BASE}/api/chart/windows/claim" \
  -H 'content-type: application/json' \
  -d "{\"client_id\":\"lockprobe2$(date +%s)\"}" \
  -o /tmp/claim2.json -w 'http=%{http_code} time=%{time_total}\n' \
  --max-time 70 || echo "claim2_curl_exit=$?"
head -c 240 /tmp/claim2.json; echo
