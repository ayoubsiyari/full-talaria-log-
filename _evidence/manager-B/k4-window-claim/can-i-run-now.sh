#!/usr/bin/env bash
# Before taking an opportunistic measurement slot, establish whether the host is actually free.
#
# The load-bearing fact from earlier tonight: one replay tab at 10x takes ~85% CPU on this box, so two
# heavy runs cannot coexist. If C's soak is live, an A/B here does not merely risk my own numbers - it
# corrupts ten hours of C's. That is the whole reason the exclusive window exists.
#
# Deliberately reports raw observations and lets the reader judge, rather than printing a verdict.
set -uo pipefail

echo "=== clocks (the 04:00 window needs one clock, and this box is not on mine) ==="
echo -n "host UTC:   "; date -u '+%Y-%m-%d %H:%M:%S %Z'
echo -n "host local: "; date '+%Y-%m-%d %H:%M:%S %Z'

echo
echo "=== load ==="
uptime
echo "cpu count: $(nproc)"

echo
echo "=== container cpu (a live soak drives the chart container hard) ==="
docker stats --no-stream --format '{{.Name}}  cpu {{.CPUPerc}}  mem {{.MemUsage}}' | grep -i chart

echo
echo "=== active window claims in the last 2 minutes ==="
docker exec talaria-db-1 psql -U talaria -t -A -c \
  "select coalesce(u.email,'?')||'  claims='||count(*) from chart_window_presence p
     left join users u on u.id = p.user_id
    where p.last_seen > now() - interval '2 minutes'
    group by u.email;" 2>&1 | sed 's/^/  /'

echo
echo "=== app request volume, last 2 minutes ==="
n=$(docker logs --since 2m talaria-trading-chart-1 2>&1 | grep -cE 'GET |POST ' || true)
echo "  request lines: $n"
echo "  (an idle app is single digits; a live replay soak is hundreds+)"

echo
echo "=== bars/state polling specifically, last 2 min ==="
docker logs --since 2m talaria-trading-chart-1 2>&1 | grep -oE '/api/[a-z-]+/[0-9]+/(state|bars)|/api/file-bars' \
  | sort | uniq -c | sort -rn | head -5 | sed 's/^/  /'

echo
echo "=== browser/node processes on this host ==="
echo -n "  count: "; ps -eo comm= | grep -cE '^(chrome|chromium|node)$' || true

echo
echo "=== logged-in sessions ==="
who | sed 's/^/  /'
