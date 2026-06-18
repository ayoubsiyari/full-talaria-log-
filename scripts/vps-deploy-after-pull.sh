#!/usr/bin/env bash
# Deploy after git pull on the VPS (e.g. /opt/talaria).
#
# Avoids /tmp filling up (use disk for Docker temp files) and avoids rebuilding
# everything when only chart static files or one service changed.
#
# Usage:
#   chmod +x scripts/vps-deploy-after-pull.sh
#   ./scripts/vps-deploy-after-pull.sh              # default: homepage (chart.js, nginx, Next)
#   ./scripts/vps-deploy-after-pull.sh homepage     # same
#   ./scripts/vps-deploy-after-pull.sh api          # trading-chart + worker (Python / api_server)
#   ./scripts/vps-deploy-after-pull.sh journal      # journal-backend only
#   ./scripts/vps-deploy-after-pull.sh full         # all app images (~10–20 min)
#   ./scripts/vps-deploy-after-pull.sh none         # git pull + restart, no build
#   ./scripts/vps-deploy-after-pull.sh pull          # use GHCR prebuilt images (scripts/deploy.sh)
#
# What to pick after git pull:
#   chart.js, replay-system.js, homepage/, nginx  → homepage
#   api_server.py, chart Python, .env compose      → api
#   journal-backend/                               → journal
#   unsure / many files                              → full
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-homepage}"
export TMPDIR="${TMPDIR:-$ROOT/.tmp}"
mkdir -p "$TMPDIR"
chmod 700 "$TMPDIR" 2>/dev/null || true

echo "=== git pull ==="
git pull --ff-only

if [ "$TARGET" = "pull" ]; then
  exec "$ROOT/scripts/deploy.sh"
fi

build_one() {
  echo ""
  echo "=== docker compose build: $* ==="
  COMPOSE_BAKE=false docker compose build "$@"
}

up_services() {
  echo ""
  echo "=== docker compose up -d $* ==="
  docker compose up -d "$@"
}

case "$TARGET" in
  homepage|web|static)
    build_one homepage
    up_services homepage
    ;;
  api|chart|trading-chart)
    build_one trading-chart
    up_services trading-chart trading-chart-worker
    ;;
  journal)
    build_one journal-backend
    up_services journal-backend
    ;;
  full|all)
    build_one homepage trading-chart journal-backend
    up_services
    ;;
  none|skip|no-build)
    up_services --no-build
    ;;
  -h|--help)
    sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "Unknown target: $TARGET (use homepage|api|journal|full|none|pull)" >&2
    exit 2
    ;;
esac

echo ""
echo "=== status ==="
docker compose ps

echo ""
echo "Tip: hard-refresh browser (Ctrl+Shift+R) after homepage/chart.js changes."
echo "Tip: after several deploys run: ./scripts/vps-cleanup-deploy-cache.sh"
echo "Tip: never store large backups in /tmp (use /opt/talaria/backups)."
