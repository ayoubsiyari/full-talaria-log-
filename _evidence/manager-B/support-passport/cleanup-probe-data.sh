#!/usr/bin/env bash
# Remove the fabricated position used to discriminate the passport axis, so the QA account
# is left as a plain new account rather than a 437-day veteran with 23 invented trades.
set -uo pipefail
. /root/.talaria-test-env
uid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c "SELECT id FROM users WHERE email='$TEST_EMAIL'")
echo "QA user id=$uid"

docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "DELETE FROM trading_session_journal_trades WHERE user_id=$uid AND client_trade_id LIKE 'bprobe-%'" 2>&1 | sed 's/^/  /'
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "DELETE FROM support_messages WHERE thread_id IN
     (SELECT id FROM support_threads WHERE user_id=$uid AND subject LIKE 'B passport%')" 2>&1 | sed 's/^/  /'
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "DELETE FROM support_threads WHERE user_id=$uid AND subject LIKE 'B passport%'" 2>&1 | sed 's/^/  /'
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "DELETE FROM trading_sessions WHERE user_id=$uid AND name='B passport probe'" 2>&1 | sed 's/^/  /'
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "UPDATE users SET created_at='2026-07-31 08:48:01.441307' WHERE id=$uid" 2>&1 | sed 's/^/  /'

echo
echo "=== left behind ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT '  trades=' || (SELECT count(*) FROM trading_session_journal_trades WHERE user_id=$uid)
        || ' threads=' || (SELECT count(*) FROM support_threads WHERE user_id=$uid)
        || ' created_at=' || (SELECT created_at FROM users WHERE id=$uid)"
docker rm -f talaria-passport-shadow >/dev/null 2>&1 || true
echo "  shadow container removed: $(docker ps -a --filter name=talaria-passport-shadow --format '{{.Names}}' | wc -l) remaining"
echo
echo "=== canary untouched? ==="
docker inspect -f '  live image = {{.Config.Image}}' talaria-trading-chart-1
curl -sS http://127.0.0.1:3000/chart/dist-v9/index.html | grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" | head -1 | sed 's/^/  /'
/opt/talaria/deploy-freeze-guard.sh status 2>&1 | head -2 | sed 's/^/  /'
