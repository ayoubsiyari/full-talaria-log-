#!/usr/bin/env bash
set -uo pipefail
echo "=== canary ==="
curl -sS -o /dev/null -w '  homepage http=%{http_code} time=%{time_total}s\n' http://127.0.0.1:3000/
curl -sS http://127.0.0.1:3000/chart/dist-v9/index.html \
  | grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" | head -1 | sed 's/^/  /'
docker ps --filter name=talaria --format '  {{.Names}}  {{.Status}}'

echo
echo "=== freeze ==="
/opt/talaria/deploy-freeze-guard.sh status | head -4

echo
echo "=== build context is back to b116 ==="
n=$(grep -c '_support_account_facts' "/opt/talaria/chart v 1.4/chart/api_server.py" || true)
echo "  passport occurrences in context: $n (want 0)"
echo "  staged for b117: $(grep -c '_support_account_facts' /tmp/b117-stage/api_server.py || echo 0)"

echo
echo "=== QA account intact ==="
. /root/.talaria-test-env
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT '  id=' || id || ' role=' || role || ' active=' || is_active || ' waitlisted=' || coalesce(is_waitlisted::text,'n/a')
     FROM users WHERE email='$TEST_EMAIL'"
echo "  env file mode: $(stat -c %a /root/.talaria-test-env)"

echo
echo "=== no shadow left running ==="
docker ps -a --filter name=talaria-passport-shadow --format '  LEFTOVER {{.Names}}' || true
echo "  done"
