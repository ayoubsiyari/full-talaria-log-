#!/usr/bin/env bash
set -uo pipefail
BASE=http://127.0.0.1:3000
. /root/.talaria-test-env

echo "=== Set-Cookie headers from login (names + flags only, values redacted) ==="
curl -sS -D /tmp/hdr -o /dev/null -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  --data-binary "$(python3 - <<'PY'
import json,os
print(json.dumps({"email":os.environ["TEST_EMAIL"],"password":os.environ["TEST_PASSWORD"]}))
PY
)"
python3 - <<'PY'
import re
for line in open('/tmp/hdr', encoding='utf-8', errors='replace'):
    if line.lower().startswith('set-cookie:'):
        v = line.split(':',1)[1].strip()
        name = v.split('=',1)[0]
        attrs = [a.strip() for a in v.split(';')[1:]]
        print(f"  {name:24s} attrs={attrs}")
PY

echo
echo "=== nginx upstream for the auth + claim paths ==="
docker exec talaria-homepage-1 sh -c \
  "sed -n '205,265p' /etc/nginx/conf.d/default.conf" 2>&1 | grep -nE 'location|proxy_pass' | sed 's/^/  /'

echo
echo "=== SESSION_COOKIE_NAME actually in the chart container env ==="
docker exec talaria-trading-chart-1 sh -c 'echo "  SESSION_COOKIE_NAME=${SESSION_COOKIE_NAME:-<unset, defaults to session_id>}"'

echo
echo "=== newest user_sessions rows for the QA user (id prefix only) ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT left(id,8) || '… user=' || user_id || ' last_active=' || coalesce(last_active_at::text,'null')
     FROM user_sessions WHERE user_id=(SELECT id FROM users WHERE email='$TEST_EMAIL')
     ORDER BY last_active_at DESC NULLS LAST" 2>&1 | sed 's/^/  /'
