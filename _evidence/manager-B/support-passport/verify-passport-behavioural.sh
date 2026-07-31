#!/usr/bin/env bash
# PULL-5 behavioural proof: open a real support ticket and show the account block on the wire.
#
# The canary is frozen for the PO, so this runs a SHADOW container beside it: the live b116
# image with only the modified api_server.py bind-mounted, on the same network, serving nothing
# public. The canary containers are untouched and no image is swapped.
#
# TEST-02: a passing unit test says the function returns a number. It does not say the number
# survives ticket_extra, the JSON round-trip and the read path. This does.
set -uo pipefail
SHADOW=talaria-passport-shadow
LIVE=talaria-trading-chart-1
IMG=$(docker inspect -f '{{.Config.Image}}' "$LIVE")
NET=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$LIVE")
CHART="/opt/talaria/chart v 1.4/chart"
. /root/.talaria-test-env
fail=0

cleanup() { docker rm -f "$SHADOW" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "=== 0. shadow from the live image ($IMG) on net $NET ==="
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$LIVE" | grep -vE '^$' > /tmp/shadow.env
docker rm -f "$SHADOW" >/dev/null 2>&1 || true
docker run -d --name "$SHADOW" --network "$NET" --env-file /tmp/shadow.env \
  -v "$CHART/api_server.py:/app/api_server.py:ro" \
  -w /app "$IMG" \
  uvicorn api_server:app --host 0.0.0.0 --port 8000 >/dev/null

echo -n "  waiting for shadow"
for i in $(seq 1 40); do
  if docker exec "$SHADOW" curl -sS -o /dev/null http://127.0.0.1:8000/api/auth/me 2>/dev/null; then break; fi
  echo -n .; sleep 1
done
echo
docker exec "$SHADOW" curl -sS -o /dev/null -w '  shadow /api/auth/me http=%{http_code}\n' \
  http://127.0.0.1:8000/api/auth/me || { echo "  SHADOW DID NOT START"; docker logs --tail 25 "$SHADOW"; exit 2; }

echo
echo "=== 1. confirm the shadow is running the NEW code, not the old ==="
docker exec "$SHADOW" grep -q '_support_account_facts' /app/api_server.py \
  && echo "  ok: shadow carries the change" || { echo "  FAIL"; exit 2; }
docker exec "$LIVE" grep -q '_support_account_facts' /app/api_server.py \
  && { echo "  UNEXPECTED: the live canary already has it"; } \
  || echo "  ok: live canary does NOT have it (negative control — the freeze held)"

echo
echo "=== 2. log in against the shadow ==="
uid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c "SELECT id FROM users WHERE email='$TEST_EMAIL'")
sid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id FROM user_sessions WHERE user_id=$uid ORDER BY last_active_at DESC NULLS LAST LIMIT 1")
CN=$(docker exec "$LIVE" sh -c 'printf %s "${SESSION_COOKIE_NAME:-session_id}"')
echo "  user id=$uid, cookie=$CN"

echo
echo "=== 3. what does the axis say this account is? (independent of the ticket) ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT '  expected account_age_days = ' || EXTRACT(DAY FROM (NOW() - created_at))::int FROM users WHERE id=$uid"
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT '  expected closed_trades     = ' || count(*) FROM trading_session_journal_trades WHERE user_id=$uid"

echo
echo "=== 4. open a real ticket through the shadow ==="
docker exec "$SHADOW" sh -c "curl -sS -b '$CN=$sid' -X POST http://127.0.0.1:8000/api/support/threads \
  -H 'content-type: application/json' \
  -d '{\"subject\":\"B passport axis probe\",\"category\":\"other\",\"body\":\"probe\",\"context\":{\"app\":\"talaria-dashboard\",\"account_age_days\":\"9999\",\"closed_trades\":\"9999\"}}' \
  -o /tmp/thread.json -w '  create http=%{http_code}\n'"
# Resolve the row from the db rather than scraping the first "id" out of the response —
# the create payload nests message and thread objects and the first id is not the thread's.
tid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id FROM support_threads WHERE user_id=$uid ORDER BY id DESC LIMIT 1")
echo "  thread id=$tid"
[ -n "$tid" ] || { echo "  FAIL: no thread created"; docker exec "$SHADOW" head -c 300 /tmp/thread.json; exit 2; }

echo
echo "=== 5. what actually landed in ticket_extra ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT ticket_extra FROM support_threads WHERE id=$tid" | tee /tmp/extra.json | sed 's/^/  /'

python3 - <<PY
import json,sys
raw=open('/tmp/extra.json').read().strip()
d=json.loads(raw)
acct=d.get('account')
ctx=d.get('context') or {}
ok=True
print()
if not isinstance(acct,dict):
    print("  FAIL: no server-stamped account block"); ok=False
else:
    print("  account block:", acct)
    if 'account_age_days' not in acct or 'closed_trades' not in acct:
        print("  FAIL: axis fields missing"); ok=False
    # The client sent 9999 for both. The server block must not be that.
    if str(acct.get('account_age_days'))=='9999' or str(acct.get('closed_trades'))=='9999':
        print("  FAIL: client-supplied values leaked into the server block"); ok=False
    else:
        print("  ok: server values, not the client's 9999")
print("  client context kept separately:", {k:v for k,v in ctx.items() if k in ('account_age_days','closed_trades')})
sys.exit(0 if ok else 1)
PY
[ $? -eq 0 ] || fail=1

echo
echo "=== 6. the read path returns it ==="
docker exec "$SHADOW" sh -c "curl -sS -b '$CN=$sid' http://127.0.0.1:8000/api/support/threads/$tid -o /tmp/read.json -w '  read http=%{http_code}\n'"
docker exec "$SHADOW" sh -c "python3 -c \"
import json
d=json.load(open('/tmp/read.json'))
t=d.get('thread',d)
print('  thread.account =', t.get('account'))
print('  thread.context.account_age_days =', (t.get('context') or {}).get('account_age_days'))
\"" || echo "  (could not parse read)"

echo
if [ "$fail" = 0 ]; then echo PASSPORT_BEHAVIOURAL_OK; else echo PASSPORT_BEHAVIOURAL_FAIL; fi
exit "$fail"
