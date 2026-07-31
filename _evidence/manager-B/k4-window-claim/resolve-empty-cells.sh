#!/usr/bin/env bash
# post-run-state-check.sh left two cells empty. Empty is not "fine" — resolve both.
set -uo pipefail

echo "== 1. which static URL carries the build stamp =="
for u in /static/chart.js /chart.js /static/js/chart.js; do
  code=$(curl -s -o /tmp/w.js -w '%{http_code}' "http://127.0.0.1:3000$u")
  size=$(wc -c < /tmp/w.js)
  stamp=$(grep -o '20260731b[0-9]*' /tmp/w.js 2>/dev/null | head -1)
  echo "  $u -> HTTP $code, ${size} bytes, stamp='${stamp:-none}'"
done

echo
echo "== 2. what /api/health actually returns, and an unauthenticated control =="
for u in /api/health /login/; do
  echo "  $u -> HTTP $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000$u")"
done

echo
echo "== 3. max_sessions for every account, so the cap cannot hide behind a LIKE filter =="
docker exec talaria-trading-postgres-1 psql -U talaria -d talaria -tAc \
  "select id, email, max_sessions from users order by id;" 2>&1 | sed 's/^/  /'

echo
echo "== 4. live window-presence rows (should be empty or few after the runs) =="
docker exec talaria-trading-postgres-1 psql -U talaria -d talaria -tAc \
  "select count(*) from chart_window_presence;" 2>&1 | sed 's/^/  rows: /'
