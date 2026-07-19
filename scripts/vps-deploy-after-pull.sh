#!/usr/bin/env bash
# Compatibility entrypoint for VPS deploy operations (e.g. /opt/talaria).
#
# Chart/homepage deployments must use an accepted immutable checkpoint manifest.
# This script no longer permits chart/homepage builds on the production VPS.
#
# Usage:
#   chmod +x scripts/vps-deploy-after-pull.sh
#   ./scripts/vps-deploy-after-pull.sh checkpoint --manifest=/secure/CKPT-N.json
#   ./scripts/vps-deploy-after-pull.sh pull --manifest=/secure/CKPT-N.json
#   ./scripts/vps-deploy-after-pull.sh journal      # journal-backend only
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "ERROR: target required; use checkpoint with an immutable manifest." >&2
  exit 2
fi
shift
export TMPDIR="${TMPDIR:-$ROOT/.tmp}"
mkdir -p "$TMPDIR"
chmod 700 "$TMPDIR" 2>/dev/null || true

if [ "$TARGET" = "pull" ] || [ "$TARGET" = "checkpoint" ]; then
  exec "$ROOT/scripts/deploy.sh" "$@"
fi

case "$TARGET" in
  journal)
    if [ "$#" -ne 0 ]; then
      echo "ERROR: journal target accepts no extra arguments." >&2
      exit 2
    fi
    git pull --ff-only
    COMPOSE_BAKE=false docker compose build journal-backend
    docker compose up -d journal-backend
    ;;
  homepage|web|static|api|chart|trading-chart|full|all|none|skip|no-build)
    echo "ERROR: '$TARGET' can mutate chart/homepage without immutable provenance." >&2
    echo "Use: $0 checkpoint --manifest=/secure/CKPT-N.provenance.json" >&2
    exit 2
    ;;
  -h|--help)
    echo "Usage: $0 checkpoint --manifest=/secure/CKPT-N.provenance.json"
    echo "       $0 journal"
    exit 0
    ;;
  *)
    echo "Unknown target: $TARGET (use checkpoint|pull|journal)" >&2
    exit 2
    ;;
esac

docker compose ps
