#!/usr/bin/env bash
# The Director has propagated a caveat to every paint conclusion on the premise that C's soak browser
# runs on this host, and therefore that C's reported gpuMB is SwiftShader memory.
#
# I have contrary evidence: at 17:55 I looked for C's soak here and found no Chrome and no node.
# If C's browser is NOT on this host, then C's gpuMB comes from C's own machine, which may well have a
# real GPU, and the caveat now attached to every paint conclusion would be wrong in the other
# direction. Over-caveating is not free: it discards true results.
#
# This settles which it is. Read-only.
set -uo pipefail
echo "=== now ==="; date -u +'%Y-%m-%dT%H:%M:%SZ'

echo
echo "=== any browser processes on this host at all? ==="
ps -eo pid,etimes,pcpu,rss,comm,args --sort=-pcpu 2>/dev/null \
  | grep -iE 'chrome|chromium|headless|firefox' | grep -v grep | head -20 \
  || echo "  none"
echo -n "  count: "
ps -eo comm 2>/dev/null | grep -icE 'chrome|chromium' || echo 0

echo
echo "=== any node processes (a harness driving a remote browser would still be node) ==="
ps -eo pid,etimes,pcpu,rss,args --sort=-pcpu 2>/dev/null | grep -E '[n]ode ' | head -10 || echo "  none"

echo
echo "=== who is actually connected to the chart container right now ==="
echo "  established connections to :3000 grouped by peer address:"
ss -tn state established '( sport = :3000 )' 2>/dev/null | tail -n +2 \
  | awk '{print $5}' | sed 's/:[0-9]*$//' | sort | uniq -c | sort -rn | head -10
echo "  (127.0.0.1 = something on this host; anything else = a remote client)"

echo
echo "=== container CPU, to compare against who is connected ==="
docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}' | head -4

echo
echo "=== websocket connections open to the chart app (a soak would hold these) ==="
docker logs --since 12h talaria-trading-chart-1 2>&1 | grep -c 'WebSocket /ws/chart' || echo 0
echo "  ws/chart accepts in last 12h (above)"
docker logs --since 12h talaria-trading-chart-1 2>&1 | grep 'WebSocket' | tail -5

echo
echo "=== host load and cpu count, for context ==="
cat /proc/loadavg
echo -n "  cores: "; nproc
