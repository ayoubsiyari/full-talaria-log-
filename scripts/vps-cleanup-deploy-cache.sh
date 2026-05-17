#!/usr/bin/env bash
# Safe VPS cleanup: Docker build/deploy cache only (keeps volumes: postgres, uploads).
# Run on the VPS from repo root after deploy cycles pile up.
#
#   cd /path/to/full-talaria-log--main
#   chmod +x scripts/vps-cleanup-deploy-cache.sh
#   ./scripts/vps-cleanup-deploy-cache.sh
#   ./scripts/vps-cleanup-deploy-cache.sh --prune-images   # also remove dangling/old images

set -euo pipefail

PRUNE_IMAGES=false
for arg in "$@"; do
  case "$arg" in
    --prune-images) PRUNE_IMAGES=true ;;
    -h|--help)
      echo "Usage: $0 [--prune-images]"
      echo "  Default: builder cache + stopped containers + unused networks (NOT volumes)"
      echo "  --prune-images: docker image prune -f (dangling only)"
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

section() { echo ""; echo "======== $* ========"; }

section "Before — disk & Docker"
df -h / /var/lib/docker 2>/dev/null || df -h /
docker system df 2>/dev/null || true

section "Prune build cache (safe)"
# BuildKit / legacy builder cache from repeated docker compose build
docker builder prune -af 2>/dev/null && ok "builder cache pruned" || warn "builder prune skipped"

section "Prune unused containers & networks (NOT volumes)"
docker container prune -f 2>/dev/null && ok "stopped containers removed" || true
docker network prune -f 2>/dev/null && ok "unused networks removed" || true

if [ "$PRUNE_IMAGES" = true ]; then
  section "Prune dangling images"
  docker image prune -f && ok "dangling images pruned"
  warn "To remove ALL unused images (not just dangling), run manually:"
  echo "  docker image prune -a   # only if you accept re-pull/rebuild on next deploy"
fi

section "After — disk & Docker"
df -h / /var/lib/docker 2>/dev/null || df -h /
docker system df 2>/dev/null || true

section "Redis capacity (idle headroom)"
if docker compose ps --status running 2>/dev/null | grep -q redis; then
  docker compose exec -T redis redis-cli ping | grep -q PONG && ok "redis PONG"
  echo "--- memory ---"
  docker compose exec -T redis redis-cli INFO memory 2>/dev/null | grep -E '^(used_memory_human|used_memory_peak_human|maxmemory_human|maxmemory_policy|mem_fragmentation_ratio):' || true
  echo "--- stats ---"
  docker compose exec -T redis redis-cli INFO stats 2>/dev/null | grep -E '^(instantaneous_ops_per_sec|total_commands_processed|keyspace):' || true
  echo "--- keyspace ---"
  docker compose exec -T redis redis-cli INFO keyspace 2>/dev/null || true
  echo "--- dbsize ---"
  docker compose exec -T redis redis-cli DBSIZE 2>/dev/null || true
  ok "Redis with low used_memory vs maxmemory (or no maxmemory) = lots of idle capacity"
else
  warn "redis container not running — skip"
fi

section "API workers & stack health"
docker compose ps 2>/dev/null || true
WORKERS="$(docker compose exec -T trading-chart env 2>/dev/null | grep -E '^WEB_CONCURRENCY=' || true)"
[ -n "$WORKERS" ] && echo "$WORKERS" || warn "WEB_CONCURRENCY not set (default gunicorn workers apply)"
curl -sf "${PUBLIC_URL:-http://127.0.0.1:3000}/api/status" 2>/dev/null | head -c 400 || \
  curl -sf "${CHART_BASE_URL:-http://127.0.0.1:8000}/api/status" 2>/dev/null | head -c 400 || \
  warn "could not curl /api/status"

section "Done"
echo "Did NOT run: docker volume prune, docker system prune --volumes"
echo "Next: ./scripts/vps-backtest-healthcheck.sh"
