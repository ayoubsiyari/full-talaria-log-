#!/usr/bin/env bash
# C launched a four-panel soak minutes ago against an account capped at 2. Before changing anything
# I need to know WHICH account, because raising a cap on the wrong row is either useless or an
# entitlement change to a real user.
#
# Evidence of who is soaking, in order of directness:
#   1. live chart_window_presence rows and their last_seen (a soaking panel heartbeats every 25s)
#   2. how many rows each account holds against its own cap
#   3. whether evictions are already happening
set -uo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -At -F' | ' -c "$1"; }

echo "== live window presence, newest last (heartbeat is 25s, so anything fresh is active) =="
Q "SELECT u.id, u.email, w.client_id, w.last_seen_at,
          round(extract(epoch from (now() - w.last_seen_at))) || 's ago' AS age
   FROM chart_window_presence w JOIN users u ON u.id = w.user_id
   ORDER BY w.last_seen_at;" | sed 's/^/  /'

echo
echo "== rows held vs cap, for anyone currently holding a window =="
Q "SELECT u.id, u.email, count(w.*) AS held, u.max_sessions AS cap,
          CASE WHEN count(w.*) >= u.max_sessions THEN 'AT OR OVER CAP' ELSE 'ok' END
   FROM users u JOIN chart_window_presence w ON w.user_id = u.id
   GROUP BY u.id, u.email, u.max_sessions
   ORDER BY u.id;" | sed 's/^/  /'

echo
echo "== chrome/node activity on the host, which tells me if the soak runs here at all =="
echo "  chrome processes: $(pgrep -c -f 'chrome|chromium' 2>/dev/null || echo 0)"
pgrep -af 'node ' 2>/dev/null | sed 's/^/    /' || echo "    no node processes"
echo "  loadavg: $(cat /proc/loadavg)"

echo
echo "== recent 409s would be the eviction signature =="
docker logs --since 15m talaria-trading-chart-1 2>&1 | grep -cE ' 409 ' | sed 's/^/  409 responses in last 15m: /'
docker logs --since 15m talaria-trading-chart-1 2>&1 | grep -E 'windows/claim' | tail -8 | sed 's/^/  /'
