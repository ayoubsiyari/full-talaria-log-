#!/usr/bin/env bash
# Backtest scaling health check (Tracks A/B/C) — run on the VPS from repo root.
# Usage:
#   cd /path/to/full-talaria-log--main
#   chmod +x scripts/vps-backtest-healthcheck.sh
#   ./scripts/vps-backtest-healthcheck.sh
#   ./scripts/vps-backtest-healthcheck.sh --smoke   # needs CHART_SESSION_COOKIE

set -euo pipefail

SMOKE=false
for arg in "$@"; do
  case "$arg" in
    --smoke) SMOKE=true ;;
    -h|--help)
      echo "Usage: $0 [--smoke]"
      echo "  --smoke  POST what-if + PATCH size check (set CHART_SESSION_COOKIE)"
      exit 0
      ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
ok() { echo -e "${GREEN}OK${NC}  $*"; }
warn() { echo -e "${YELLOW}WARN${NC} $*"; }
fail() { echo -e "${RED}FAIL${NC} $*"; }

section() { echo ""; echo "======== $* ========"; }

section "Host resources"
if command -v free >/dev/null 2>&1; then
  free -h | head -3
fi
if command -v df >/dev/null 2>&1; then
  df -h / /var/lib/docker 2>/dev/null || df -h /
fi
nproc 2>/dev/null && echo "CPU cores: $(nproc)"

section "Docker services"
if ! command -v docker >/dev/null 2>&1; then
  fail "docker not found"
  exit 1
fi
docker compose ps 2>/dev/null || docker-compose ps 2>/dev/null || fail "docker compose ps failed"

for svc in trading-chart trading-chart-worker redis db homepage; do
  if docker compose ps --status running 2>/dev/null | grep -q "$svc"; then
    ok "container running: $svc"
  else
    warn "container not running: $svc (check docker compose ps)"
  fi
done

section "API /api/status"
BASE_URL="${CHART_BASE_URL:-http://127.0.0.1:8000}"
if docker compose ps 2>/dev/null | grep -q homepage; then
  PUBLIC="${PUBLIC_URL:-http://127.0.0.1:3000}"
else
  PUBLIC="$BASE_URL"
fi

STATUS_JSON="$(curl -sf "${PUBLIC}/api/status" 2>/dev/null || curl -sf "${BASE_URL}/api/status" 2>/dev/null || true)"
if [ -n "$STATUS_JSON" ]; then
  echo "$STATUS_JSON" | head -c 500
  echo ""
  echo "$STATUS_JSON" | grep -q '"redis":"ok"' && ok "redis ok" || warn "redis not ok in status"
else
  fail "could not reach /api/status (try PUBLIC_URL=http://YOUR_IP:3000)"
fi

section "Track A/B/C env (trading-chart)"
ENV_DUMP="$(docker compose exec -T trading-chart env 2>/dev/null | grep -E '^BACKTEST_|^SESSION_|^MAX_JOURNAL|^WEB_CONCURRENCY|^REDIS_URL|^APP_ROLE=' || true)"
if [ -n "$ENV_DUMP" ]; then
  echo "$ENV_DUMP"
  ok "scaling env vars present"
else
  warn "could not read trading-chart env (is service named trading-chart?)"
fi

section "Redis ping"
docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG && ok "redis PONG" || warn "redis ping failed"

section "Postgres quick stats"
docker compose exec -T db psql -U "${POSTGRES_USER:-talaria}" -d "${POSTGRES_DB:-talaria}" -c "
SELECT
  (SELECT COUNT(*) FROM trading_sessions) AS sessions,
  (SELECT COUNT(*) FROM trading_session_journal_trades) AS journal_sql_rows,
  (SELECT COUNT(*) FROM trading_session_states) AS state_rows;
" 2>/dev/null || warn "psql failed (set POSTGRES_USER/POSTGRES_DB if needed)"

section "state_json size (top 5 largest)"
docker compose exec -T db psql -U "${POSTGRES_USER:-talaria}" -d "${POSTGRES_DB:-talaria}" -c "
SELECT session_id,
       pg_column_size(state_json) AS bytes,
       round(pg_column_size(state_json)/1024.0/1024.0, 2) AS mb
FROM trading_session_states
ORDER BY pg_column_size(state_json) DESC NULLS LAST
LIMIT 5;
" 2>/dev/null || true

section "Journal backfill dry-run"
if docker compose exec -T trading-chart test -f /app/scripts/backfill_session_journal_sql.py 2>/dev/null; then
  docker compose exec -T trading-chart python /app/scripts/backfill_session_journal_sql.py --dry-run 2>/dev/null || \
    warn "backfill script path may differ — run from chart v 1.4/chart on host"
else
  warn "backfill script not in container — run on host:"
  echo "  cd 'chart v 1.4/chart' && DATABASE_URL=... py scripts/backfill_session_journal_sql.py --dry-run"
fi

section "Disk (chart uploads)"
docker compose exec -T trading-chart sh -c 'du -sh /app/uploads 2>/dev/null; du -sh /app/data 2>/dev/null' 2>/dev/null || \
  warn "could not du uploads inside trading-chart"

if [ "$SMOKE" = true ]; then
  section "Smoke test (authenticated)"
  if [ -z "${CHART_SESSION_COOKIE:-}" ]; then
    warn "Set CHART_SESSION_COOKIE=chart_session_id=... from browser DevTools"
    warn "Optional: SESSION_ID=123 for what-if POST"
  else
    COOKIE_H="Cookie: ${CHART_SESSION_COOKIE}"
    SID="${SESSION_ID:-1}"
    echo "POST what-if session_id=$SID ..."
    HTTP_CODE=$(curl -s -o /tmp/whatif_out.json -w "%{http_code}" \
      -X POST "${PUBLIC}/api/analytics/backtest/whatif" \
      -H "Content-Type: application/json" \
      -H "$COOKIE_H" \
      -d "{\"session_id\":${SID},\"pair_filter\":\"ALL\",\"playbook_filter\":\"ALL\",\"strategy_filter\":\"ALL\",\"outcome_filter\":\"ALL\",\"heatmap_pair\":\"ALL\",\"tp_r\":1.5,\"sl_r\":1.0}")
    echo "HTTP $HTTP_CODE"
    head -c 200 /tmp/whatif_out.json; echo ""
    if [ "$HTTP_CODE" = "202" ]; then
      JOB_ID=$(python3 -c "import json; print(json.load(open('/tmp/whatif_out.json')).get('job_id',''))" 2>/dev/null || true)
      if [ -n "$JOB_ID" ]; then
        ok "async job_id=$JOB_ID — polling..."
        for i in 1 2 3 4 5 6 7 8 9 10; do
          sleep 0.5
          curl -sf "${PUBLIC}/api/analytics/backtest/whatif/jobs/${JOB_ID}" -H "$COOKIE_H" | head -c 120
          echo ""
          curl -sf "${PUBLIC}/api/analytics/backtest/whatif/jobs/${JOB_ID}" -H "$COOKIE_H" | grep -q '"status":"done"' && break
        done
      fi
    elif [ "$HTTP_CODE" = "200" ]; then
      ok "sync or cache hit (200)"
    fi
  fi
fi

section "Done"
echo "Tips:"
echo "  - Production: TRUSTED_ORIGINS, SESSION_COOKIE_SECURE=true, BACKTEST_WHATIF_DRAIN_ON_API=false on API"
echo "  - After deploy: py scripts/backfill_session_journal_sql.py --strip (once)"
echo "  - Load test: see docs/backtest-scaling-test-guide.md"
echo "  - Smoke: CHART_SESSION_COOKIE='chart_session_id=...' SESSION_ID=123 $0 --smoke"
