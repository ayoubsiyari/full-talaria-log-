#!/usr/bin/env bash
# Two questions that must be answered before b117 is built:
#   1. Does /opt/talaria contain real drift, or only line-ending churn? A build takes whatever
#      is sitting in the context. If b117's api_server.py has someone's uncommitted edit in it,
#      the train manifest is a lie and nobody finds out until it breaks.
#   2. Why has homepage been UNREADABLE for six minutes? If it is already down, that outage must
#      not get attributed to my ship, and I must not ship on top of an unexplained failure.
set -uo pipefail
cd /opt/talaria

echo "=== Q1: is the context drift real or whitespace? ==="
echo "  files modified (any diff)      : $(git diff --name-only | wc -l)"
echo "  files modified (ignoring space): $(git diff --ignore-all-space --name-only | wc -l)"
echo
echo "  files with REAL content changes:"
git diff --ignore-all-space --name-only | sed 's/^/    /'
echo
echo "  --- does api_server.py carry the b117 passport payload? ---"
for m in _support_account_facts _isCandleOnlyPlaybackEnabled flushRangeWindow; do
  n=$(grep -c -- "$m" "chart v 1.4/chart/api_server.py" "chart v 1.4/chart/modules/chart-indicators-full.js" \
        "chart v 1.4/chart/modules/replay-system.js" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
  printf '    %-34s %s occurrence(s) in context\n' "$m" "$n"
done
echo "    (all three should be 0 — the context is supposed to be pure b116)"

echo
echo "=== Q2: homepage ==="
echo "  --- container state ---"
docker ps -a --filter name=talaria-homepage-1 --format '{{.Names}} {{.Status}} {{.Image}}'
echo "  --- health from inside the network ---"
for u in http://127.0.0.1:3000/ http://127.0.0.1:3000/chart/dist-v9/index.html; do
  printf '    %-46s ' "$u"
  curl -sS -o /dev/null -m 8 -w 'http=%{http_code} t=%{time_total}s\n' "$u" 2>&1 || echo "FAILED"
done
echo "  --- direct to the homepage container port ---"
hp=$(docker port talaria-homepage-1 2>/dev/null | head -1)
echo "    published: ${hp:-none}"
docker exec talaria-homepage-1 sh -c 'wget -qO- -T5 http://127.0.0.1:3000/ >/dev/null 2>&1 && echo "    in-container: responds" || echo "    in-container: NOT responding"' 2>&1 || echo "    in-container: exec failed"
echo "  --- last homepage logs ---"
docker logs --tail 25 talaria-homepage-1 2>&1 | sed 's/^/    /'
echo
echo "  --- what the drift monitor actually probes ---"
grep -n 'homepage\|UNREADABLE' /root/talaria-restore/*.sh 2>/dev/null | head -5 | sed 's/^/    /'
