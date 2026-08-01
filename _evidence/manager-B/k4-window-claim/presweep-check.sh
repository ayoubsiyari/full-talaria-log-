#!/bin/sh
# Before a ~30 minute CPU-saturating sweep, establish whether C's soak is live.
# C's browser is on C's own machine (RTX 4060, confirmed by C at 21:45), but C's soak drives THIS host's
# API, and C's headline metric is bars delivered per second. If I peg this host's CPU for half an hour,
# C's delivery rate falls and C attributes it to bar count. That would be me manufacturing a confound in
# someone else's ten-hour run, which is the exact thing I spent today chasing out of my own.
set -u
CHART=talaria-trading-chart-1

echo "=== host load ==="
cat /proc/loadavg
echo -n "chart container CPU: "; docker stats --no-stream --format '{{.CPUPerc}} mem {{.MemUsage}}' "$CHART"

echo
echo "=== is anything driving the API right now? ==="
echo "log lines last 1 min:  $(docker logs --since 1m "$CHART" 2>&1 | wc -l)"
echo "log lines last 5 min:  $(docker logs --since 5m "$CHART" 2>&1 | wc -l)"
echo "log lines last 15 min: $(docker logs --since 15m "$CHART" 2>&1 | wc -l)"

echo
echo "=== established non-local connections to :3000 ==="
ss -tn state established 2>/dev/null | awk 'NR==1 || $4 ~ /:3000$/' | grep -v '127.0.0.1' || echo "(none)"

echo
echo "=== recent bar/chart requests (what a soak would be doing) ==="
docker logs --since 10m "$CHART" 2>&1 | grep -cE 'bars|tile|chart-data' | sed 's/^/chart-data requests in 10 min: /'
docker logs --since 10m "$CHART" 2>&1 | tail -5

echo
echo "=== active window claims (who holds a session) ==="
docker exec talaria-db-1 psql -U talaria -d talaria -tAc \
  "select u.email, w.claimed_at, w.last_seen_at, now() - w.last_seen_at as stale
     from chart_window_claim w join users u on u.id = w.user_id
    order by w.last_seen_at desc limit 10;" 2>/dev/null || echo "(query failed)"
