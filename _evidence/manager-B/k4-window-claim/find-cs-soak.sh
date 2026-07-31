#!/usr/bin/env bash
# C's soak is not running on this host — zero chrome, zero node. So either it runs elsewhere against
# this API, or it runs against a different environment. Find C's harness and read two facts out of
# it rather than guessing:
#
#   1. which account it logs in as
#   2. whether its four panels are four browser windows (four claims) or one multichart page
#      (one claim)
#
# This matters urgently in the opposite direction from my warning. If four panels sit in ONE page,
# there is one window claim, the cap of 2 is irrelevant, and stopping a running ten-hour soak on my
# advice would cost the night for nothing.
set -uo pipefail

echo "== C's directories and any soak harness =="
ls -d /root/*c* /root/*C* 2>/dev/null | sed 's/^/  /'
find /root -maxdepth 3 \( -iname '*soak*' -o -iname '*conf05*' -o -iname '*conf-05*' \) 2>/dev/null | head -20 | sed 's/^/  /'

echo
echo "== is anything running under pid 23164 or named soak =="
ps -o pid,etime,cmd -p 23164 2>/dev/null | sed 's/^/  /' || echo "  pid 23164 not on this host"
pgrep -af -i 'soak|conf05|conf-05' 2>/dev/null | sed 's/^/  /' || echo "  no soak process on this host"

echo
echo "== how many claims does one multichart page make? read it out of the served bundle =="
docker exec talaria-trading-chart-1 sh -c "grep -o 'windows/claim' /app/chart.js | wc -l" | sed 's/^/  windows-claim call sites in chart.js: /'
for f in /app/chart.js; do
  docker exec talaria-trading-chart-1 sh -c "grep -oE '.{140}windows/claim.{80}' $f" 2>/dev/null | head -4 | sed 's/^/  /'
done

echo
echo "== is the claim keyed per page or per panel? =="
docker exec talaria-trading-chart-1 sh -c "grep -oE '.{100}(client_id|clientId)[^,;]{0,60}' /app/chart.js" 2>/dev/null | head -8 | sed 's/^/  /'

echo
echo "== who is holding the one live window, and from where =="
docker exec talaria-db-1 psql -U talaria -d talaria -At -F' | ' -c \
  "SELECT u.id, u.email, w.client_id, w.last_seen_at FROM chart_window_presence w
   JOIN users u ON u.id=w.user_id ORDER BY w.last_seen_at DESC;" | sed 's/^/  /'
