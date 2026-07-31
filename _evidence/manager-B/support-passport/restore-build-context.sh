#!/usr/bin/env bash
# The passport change was copied into /opt/talaria to run the tests against a real interpreter.
# Leaving it there means the next `docker compose build` — by anyone, for any reason — ships an
# unreviewed, unapproved change under someone else's build id. Put the context back to exactly
# what b116 was built from; the change stays in /tmp/b117-stage and is applied deliberately by
# the ship script when D lifts the freeze.
set -uo pipefail
CHART="/opt/talaria/chart v 1.4/chart"
LIVE=talaria-trading-chart-1

echo "=== before ==="
grep -c '_support_account_facts' "$CHART/api_server.py" | sed 's/^/  build context occurrences: /'

docker cp "$LIVE:/app/api_server.py" "$CHART/api_server.py"
docker cp "$LIVE:/app/admin-dashboard.html" "$CHART/admin-dashboard.html"

echo "=== after ==="
n=$(grep -c '_support_account_facts' "$CHART/api_server.py" || true)
echo "  build context occurrences: $n (want 0)"
[ "$n" = "0" ] || { echo "  FAIL: context still carries the change"; exit 1; }

echo "  b116 payload still present in context:"
grep -qE '^def chart_window_claim\(' "$CHART/api_server.py" && echo "    ok: P0 claim fix" || echo "    FAIL: P0 fix missing"

echo "  staged change preserved:"
grep -c '_support_account_facts' /tmp/b117-stage/api_server.py | sed 's/^/    occurrences in stage: /'
echo CONTEXT_RESTORED
