#!/usr/bin/env bash
# TEST-02 discriminator for the account axis.
#
# The first behavioural run produced account_age_days=0 and closed_trades=0, which is the true
# answer for a QA account created this morning — and also exactly what a stub that always
# returns zero would print. A green that a broken implementation would also produce is not
# evidence. So: move the account to a known, distinctive position on both axes and require the
# ticket to report those numbers and not the old ones.
set -uo pipefail
SHADOW=talaria-passport-shadow
LIVE=talaria-trading-chart-1
IMG=$(docker inspect -f '{{.Config.Image}}' "$LIVE")
NET=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$LIVE")
CHART="/opt/talaria/chart v 1.4/chart"
. /root/.talaria-test-env
fail=0

AGE_DAYS=437
N_TRADES=23

cleanup() {
  docker rm -f "$SHADOW" >/dev/null 2>&1 || true
  echo "  (test trades and the age shift are left in place on the QA account only)"
}
trap cleanup EXIT

uid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c "SELECT id FROM users WHERE email='$TEST_EMAIL'")
echo "=== 0. QA user id=$uid — move it to a distinctive position ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "UPDATE users SET created_at = NOW() - INTERVAL '$AGE_DAYS days 6 hours' WHERE id=$uid" | sed 's/^/  /'

sess=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id FROM trading_sessions WHERE user_id=$uid ORDER BY id LIMIT 1")
if [ -z "$sess" ]; then
  # psql prints the "INSERT 0 1" command tag alongside RETURNING output, which lands in the
  # variable and then gets spliced into the next statement. Keep only the id.
  sess=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
    "INSERT INTO trading_sessions (user_id,name,session_type,config_json,created_at,updated_at)
     VALUES ($uid,'B passport probe','backtest','{}',NOW(),NOW()) RETURNING id" | head -1)
fi
case "$sess" in ''|*[!0-9]*) echo "  ABORT: bad session id '$sess'"; exit 2 ;; esac
echo "  session id=$sess"

docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "DELETE FROM trading_session_journal_trades WHERE user_id=$uid" >/dev/null
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "INSERT INTO trading_session_journal_trades (session_id,user_id,client_trade_id,user_trade_id,payload_json,created_at,updated_at)
   SELECT $sess,$uid,'bprobe-'||g,g,'{}',NOW(),NOW() FROM generate_series(1,$N_TRADES) g" | sed 's/^/  inserted: /'

echo "  expected account_age_days=$AGE_DAYS  closed_trades=$N_TRADES"

echo
echo "=== 1. shadow with the change ==="
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$LIVE" | grep -vE '^$' > /tmp/shadow.env
docker rm -f "$SHADOW" >/dev/null 2>&1 || true
docker run -d --name "$SHADOW" --network "$NET" --env-file /tmp/shadow.env \
  -v "$CHART/api_server.py:/app/api_server.py:ro" -w /app "$IMG" \
  uvicorn api_server:app --host 0.0.0.0 --port 8000 >/dev/null
for i in $(seq 1 40); do
  docker exec "$SHADOW" curl -sS -o /dev/null http://127.0.0.1:8000/api/auth/me 2>/dev/null && break
  sleep 1
done

# The session cookie must be re-minted: the login below also refreshes last_active_at.
CN=$(docker exec "$LIVE" sh -c 'printf %s "${SESSION_COOKIE_NAME:-session_id}"')
sid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id FROM user_sessions WHERE user_id=$uid ORDER BY last_active_at DESC NULLS LAST LIMIT 1")

echo
echo "=== 2. open a ticket; client again claims 9999 on both axes ==="
docker exec "$SHADOW" sh -c "curl -sS -b '$CN=$sid' -X POST http://127.0.0.1:8000/api/support/threads \
  -H 'content-type: application/json' \
  -d '{\"subject\":\"B passport discriminator\",\"category\":\"other\",\"body\":\"probe2\",\"context\":{\"app\":\"talaria-dashboard\",\"account_age_days\":\"9999\",\"closed_trades\":\"9999\"}}' \
  -o /tmp/t2.json -w '  create http=%{http_code}\n'"

tid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id FROM support_threads WHERE user_id=$uid ORDER BY id DESC LIMIT 1")
echo "  thread id=$tid"

docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT ticket_extra FROM support_threads WHERE id=$tid" > /tmp/extra2.json
echo "  ticket_extra: $(cat /tmp/extra2.json)"

echo
python3 - "$AGE_DAYS" "$N_TRADES" <<'PY'
import json,sys
want_age=int(sys.argv[1]); want_tr=int(sys.argv[2])
d=json.loads(open('/tmp/extra2.json').read().strip())
a=d.get('account') or {}
ok=True
got_age=a.get('account_age_days'); got_tr=a.get('closed_trades')
print(f"  account_age_days: got {got_age!r}, want {want_age}")
if got_age != want_age: print("  FAIL: age did not track the account"); ok=False
print(f"  closed_trades   : got {got_tr!r}, want {want_tr}")
if got_tr != want_tr: print("  FAIL: trade count did not track the account"); ok=False
if got_age in (0,'0') and got_tr in (0,'0'):
    print("  FAIL: still the all-zero answer"); ok=False
if str(got_age)=='9999' or str(got_tr)=='9999':
    print("  FAIL: the client's forged values won"); ok=False
if ok: print("  ok: both axes tracked the real account, and the forged 9999 lost")
sys.exit(0 if ok else 1)
PY
[ $? -eq 0 ] || fail=1

echo
if [ "$fail" = 0 ]; then echo PASSPORT_DISCRIMINATED_OK; else echo PASSPORT_DISCRIMINATED_FAIL; fi
exit "$fail"
