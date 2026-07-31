#!/usr/bin/env bash
# The decisive question for C's night, answered without touching the soak.
#
# The chart container is at 361% CPU with zero browsers on this host, so external clients are driving
# it — the soak's browser runs elsewhere but its load lands here. That means the presence table can
# answer whether eviction is happening, right now, live.
set -uo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -At -F' | ' -c "$1"; }

echo "== every account holding a window, its cap, and whether it is at the limit =="
Q "SELECT u.email,
          count(w.*) AS slots_held,
          u.max_sessions AS cap,
          CASE WHEN count(w.*) > u.max_sessions THEN 'OVER CAP — eviction expected'
               WHEN count(w.*) = u.max_sessions THEN 'at cap — next claim evicts'
               ELSE 'headroom' END AS status,
          max(w.last_seen_at) AS freshest
     FROM users u JOIN chart_window_presence w ON w.user_id = u.id
    GROUP BY u.email, u.max_sessions
    ORDER BY count(w.*) DESC;" | sed 's/^/  /'

echo
echo "== eviction signature: a claim that returned 409 =="
for win in 5m 30m 60m; do
  echo "  409s in the last $win: $(docker logs --since $win talaria-trading-chart-1 2>&1 | grep -c ' 409 ')"
done

echo
echo "== is the soak's traffic actually reaching this API? =="
echo "  requests logged in the last 60s: $(docker logs --since 60s talaria-trading-chart-1 2>&1 | wc -l)"
docker logs --since 60s talaria-trading-chart-1 2>&1 | grep -oE '(GET|POST) [^ ?]+' | sort | uniq -c | sort -rn | head -8 | sed 's/^/  /'

echo
echo "== conclusion =="
echo "  If no account is over its cap and there are no 409s, nothing is being evicted and the soak"
echo "  is not affected by the cap — regardless of how many panels it runs."
