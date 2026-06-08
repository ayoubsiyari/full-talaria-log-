#!/usr/bin/env bash
# FIX-2 verification — run on VPS after deploy (see docs/talaria-performance-fixes.md)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== trading-chart env ==="
docker compose exec -T trading-chart env 2>/dev/null | grep -E '^(BACKTEST_BARS_CACHE|REDIS_URL|WEB_CONCURRENCY)=' || true

echo ""
echo "=== Redis ping from trading-chart ==="
docker compose exec -T trading-chart python -c "
import os
url = os.getenv('REDIS_URL', '')
print('REDIS_URL=', url or '(unset)')
try:
    import chart_redis
    c = chart_redis.get_client()
    print('ping=', c.ping() if c else 'no client')
except Exception as e:
    print('error:', e)
" 2>/dev/null || echo "(trading-chart not running)"

echo ""
echo "=== nginx /chart/ static (homepage) ==="
docker compose exec -T homepage nginx -T 2>/dev/null | grep -A2 'location \^~ /chart/' || true

echo ""
echo "=== Redis keyspace hits (sample) ==="
docker compose exec -T redis redis-cli INFO stats 2>/dev/null | grep keyspace_hits || true
