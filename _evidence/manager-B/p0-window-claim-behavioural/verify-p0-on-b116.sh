#!/usr/bin/env bash
# PULL-3: the window-claim P0, re-verified BEHAVIOURALLY on b116.
#
# Markers are not the test. The close condition is: with a users-row FOR UPDATE held by
# another transaction, an authenticated claim must fail fast instead of hanging, and the rest
# of the API must keep answering while it does.
#
# Reference numbers from the same probe:
#   b114 (pre-fix) : claim hung 27.6 s
#   b115 (fixed)   : 503 chart_window_claim_busy in 3.07 s
set -uo pipefail
BASE=http://127.0.0.1:3000
UID_LOCK=13
fail=0

echo "=== 0. what is actually on the wire ==="
curl -sS -H 'Cache-Control: no-cache' "$BASE/chart/dist-v9/index.html" \
  | grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" | head -1 | sed 's/^/  /'

echo
echo "=== 1. session (dedicated QA account; credentials sourced, never printed) ==="
# shellcheck disable=SC1091
. /root/.talaria-test-env
rm -f /tmp/cj
lc=$(curl -sS -c /tmp/cj -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  --data-binary "$(python3 - <<'PY'
import json,os
print(json.dumps({"email":os.environ["TEST_EMAIL"],"password":os.environ["TEST_PASSWORD"]}))
PY
)" -o /dev/null -w '%{http_code}')
echo "  login = $lc"

uid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id FROM users WHERE email='$TEST_EMAIL'")
# The login genuinely creates a chart-side session row, but its cookie is Secure and this canary
# is plain http on :3000, so curl never stores it — which is why an earlier run of this probe got
# a 7 ms 401 and called it "bounded". Rebuild the cookie the browser would have held. This is
# reconstructing a real session, not bypassing auth: the row only exists because the password
# login above succeeded.
sid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id FROM user_sessions WHERE user_id=$uid ORDER BY last_active_at DESC NULLS LAST LIMIT 1")
[ -n "$sid" ] || { echo "  NO chart session row — cannot run the authenticated arm"; exit 3; }
# The cookie is named by SESSION_COOKIE_NAME in the chart container, which the compose file
# overrides to chart_session_id. Read it from the container rather than assuming the default —
# assuming "session_id" is what produced the earlier 401.
CNAME=$(docker exec talaria-trading-chart-1 sh -c 'printf %s "${SESSION_COOKIE_NAME:-session_id}"')
JAR=(-b "$CNAME=$sid")
echo "  cookie name=$CNAME"
echo "  chart session resolved for user id=$uid"

code=$(curl -sS "${JAR[@]}" "$BASE/api/auth/me" -o /tmp/me.json -w '%{http_code}')
echo "  /api/auth/me = $code"
echo "  session user id=$uid (lock target=$UID_LOCK)"
[ "$uid" = "$UID_LOCK" ] || echo "  NOTE: lock target differs from session user; adjusting to $uid"
[ -n "$uid" ] && UID_LOCK="$uid"

echo
echo "=== 2. hold a FOR UPDATE on users.id=$UID_LOCK for 20s ==="
cat >/tmp/lock.sql <<SQL
BEGIN;
SELECT id FROM users WHERE id=$UID_LOCK FOR UPDATE;
SELECT pg_sleep(20);
COMMIT;
SQL
docker cp /tmp/lock.sql talaria-db-1:/tmp/lock.sql >/dev/null
docker exec -d talaria-db-1 sh -c 'psql -U talaria -d talaria -f /tmp/lock.sql > /tmp/lockhold.log 2>&1'
sleep 2
held=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
    WHERE l.mode='ExclusiveLock' AND a.query LIKE '%pg_sleep%'")
echo "  lock-holding backends: $held"
[ "$held" -ge 1 ] || { echo "  PREMISE FAILED: no lock is held, the rest proves nothing"; fail=1; }

echo
echo "=== 3. claim under the held lock (must fail fast, not hang) ==="
out=$(curl -sS "${JAR[@]}" -X POST "$BASE/api/chart/windows/claim" \
  -H 'content-type: application/json' \
  -d "{\"client_id\":\"b116probe$(date +%s)\"}" \
  -o /tmp/claim.json -w '%{http_code} %{time_total}' --max-time 40) || out="000 timeout"
http=${out%% *}; secs=${out##* }
echo "  claim: http=$http time=${secs}s"
echo "  body: $(head -c 200 /tmp/claim.json)"
# Fail closed on 401/400. A request rejected before it reaches the lock is fast for the wrong
# reason, and timing it proves nothing about the hang.
case "$http" in
  401|400|000)
    echo "  INSTRUMENT FAILED: claim never reached the lock (http=$http) — timing is meaningless"
    fail=1 ;;
  503) echo "  ok: 503, the intended fail-fast" ;;
  200) echo "  NOTE: 200 — lock released before the claim reached it; timing still bounded" ;;
  *)   echo "  NOTE: http=$http" ;;
esac
if [ "$fail" = 0 ]; then
  awk -v t="$secs" 'BEGIN{ if (t+0 > 8) { print "  FAIL: claim took " t "s — this is the hang"; exit 1 } else { print "  ok: bounded (<8s), and it did reach the lock" } }' || fail=1
fi

echo
echo "=== 4. the rest of the API kept answering during the stall ==="
for i in 1 2 3; do
  o=$(curl -sS "${JAR[@]}" "$BASE/api/auth/me" -o /dev/null -w '%{http_code} %{time_total}' --max-time 10) || o="000 timeout"
  echo "  /api/auth/me #$i: $o"
  c=${o%% *}; t=${o##* }
  [ "$c" = "200" ] || fail=1
  awk -v t="$t" 'BEGIN{ if (t+0 > 3) exit 1 }' || { echo "    FAIL: event loop was stalled"; fail=1; }
done

echo
echo "=== 5. a second claim while the first is contended (the two-tab case) ==="
( curl -sS "${JAR[@]}" -X POST "$BASE/api/chart/windows/claim" -H 'content-type: application/json' \
    -d "{\"client_id\":\"b116tabA$(date +%s)\"}" -o /tmp/tabA.json \
    -w 'tabA http=%{http_code} time=%{time_total}\n' --max-time 40 || echo "tabA exit=$?" ) &
( curl -sS "${JAR[@]}" -X POST "$BASE/api/chart/windows/claim" -H 'content-type: application/json' \
    -d "{\"client_id\":\"b116tabB$(date +%s)\"}" -o /tmp/tabB.json \
    -w 'tabB http=%{http_code} time=%{time_total}\n' --max-time 40 || echo "tabB exit=$?" ) &
wait

echo
echo "=== 6. server-side shape still correct in the running image ==="
docker exec talaria-trading-chart-1 grep -qE '^def chart_window_claim\(' /app/api_server.py \
  && echo "  ok: claim is a sync def (threadpool, not the event loop)" || { echo "  FAIL"; fail=1; }
docker exec talaria-trading-chart-1 grep -q '_set_local_lock_timeout' /app/api_server.py \
  && echo "  ok: lock_timeout bound present" || { echo "  FAIL"; fail=1; }

echo
if [ "$fail" = 0 ]; then echo P0_B116_BEHAVIOURAL_OK; else echo P0_B116_BEHAVIOURAL_FAIL; fi
exit "$fail"
