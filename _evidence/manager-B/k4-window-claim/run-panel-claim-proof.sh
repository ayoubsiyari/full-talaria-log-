#!/usr/bin/env bash
# Wrapper: find the multichart URL from the product, then run the four-panels-one-claim proof and
# read the slot count out of the database WHILE the panels are live.
set -uo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -At -F' | ' -c "$1"; }

echo "== cap and slots before =="
echo "  qa-canary cap = $(Q "SELECT max_sessions FROM users WHERE id=128;")"
echo "  slots held    = $(Q "SELECT count(*) FROM chart_window_presence WHERE user_id=128;")"

echo
echo "== locate the multichart entry point in the served app =="
CAND=""
for u in /chart/multichart/ /chart/multichart /multichart/ /chart/dist-v9/multichart.html /chart/dist-v9/index.html; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000$u")
  echo "  $u -> $code"
  [ "$code" = "200" ] && [ -z "$CAND" ] && CAND="$u"
done
docker exec talaria-trading-chart-1 sh -c 'ls /app/chart 2>/dev/null | head -20; echo "---"; find /app -maxdepth 3 -iname "*multichart*" 2>/dev/null | head -10' | sed 's/^/  /'
echo "  chosen: ${CAND:-none}"

echo
echo "== run the proof, sampling slots from the database while panels are live =="
( MULTI_URL="${CAND:-/chart/multichart/}" HOLD_MS=40000 node /root/b-k4/prove-four-panels-one-claim.mjs 2>&1 | grep -E '^RESULT' ) &
probe=$!
sleep 18
for i in 1 2 3 4; do
  echo "  t+$((18+i*6))s  slots=$(Q "SELECT count(*) FROM chart_window_presence WHERE user_id=128;")  rows: $(Q "SELECT string_agg(client_id, ' ') FROM chart_window_presence WHERE user_id=128;")"
  sleep 6
done
wait $probe

echo
echo "== after =="
echo "  slots held = $(Q "SELECT count(*) FROM chart_window_presence WHERE user_id=128;")"
Q "DELETE FROM chart_window_presence WHERE user_id=128;" | sed 's/^/  cleaned: /'
